const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const { testConnection } = require('./config/database');
const logger = require('./utils/logger');

// 导入路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const domainRoutes = require('./routes/domains');
const aliasRoutes = require('./routes/aliases');
const emailRoutes = require('./routes/emails');
const systemRoutes = require('./routes/system');
const securityRoutes = require('./routes/security');

// 启动定时任务调度器
require('./utils/scheduler');

const app = express();
const PORT = process.env.PORT || 3001;

// 安全中间件
app.use(helmet());

// CORS配置
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000'],
  credentials: true
}));

// 压缩响应
app.use(compression());

// 请求日志
app.use(morgan('combined', { 
  stream: { write: message => logger.info(message.trim()) }
}));

// 请求体解析
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 速率限制
const limiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000, // 15分钟
  max: process.env.RATE_LIMIT_MAX || 100, // 限制每个IP在窗口时间内最多100个请求
  message: {
    error: '请求过于频繁，请稍后再试'
  }
});
app.use('/api', limiter);

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/aliases', aliasRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/security', securityRoutes);

// 健康检查端点
app.get('/api/health', async (req, res) => {
  try {
    const dbConnected = await testConnection();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbConnected ? 'connected' : 'disconnected',
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// 生产环境下提供前端静态文件
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

// 404错误处理
app.use('*', (req, res) => {
  res.status(404).json({
    error: '接口不存在',
    path: req.originalUrl
  });
});

// 全局错误处理中间件
app.use((error, req, res, next) => {
  logger.error('服务器错误:', error);
  
  // 数据库错误
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(400).json({
      error: '数据重复，请检查输入'
    });
  }
  
  // JWT错误
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: '无效的访问令牌'
    });
  }
  
  // 验证错误
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: '输入数据验证失败',
      details: error.details
    });
  }
  
  // 默认服务器错误
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' 
      ? '服务器内部错误' 
      : error.message
  });
});

// 启动服务器
const startServer = async () => {
  try {
    // 测试数据库连接
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('无法连接到数据库，服务器启动失败');
      process.exit(1);
    }
    
    app.listen(PORT, () => {
      logger.info(`服务器运行在端口 ${PORT}`);
      logger.info(`环境: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error('服务器启动失败:', error);
    process.exit(1);
  }
};

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('收到 SIGTERM 信号，正在关闭服务器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('收到 SIGINT 信号，正在关闭服务器...');
  process.exit(0);
});

startServer();

module.exports = app;