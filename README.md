# 企业级邮件收发系统

一个功能完整的企业级邮件收发系统，支持多域名和多别名管理，类似于 Poste.io 的功能。

## 功能特性

### 🔐 用户管理
- 用户注册和登录
- JWT 身份认证
- 用户权限管理（管理员/普通用户）
- 密码修改和重置

### 📧 邮件管理
- 多域名支持
- 每个账户支持多个邮箱别名
- 邮件收发功能
- 富文本邮件编辑器
- 附件上传和下载
- 邮件文件夹管理（收件箱、已发送、草稿箱等）
- 邮件搜索和过滤
- 邮件批量操作

### 👥 别名管理
- 创建和删除邮箱别名
- 别名状态管理
- 别名邮件统计
- 别名间切换查看邮件

### 🌐 域名管理
- 多域名支持
- 域名状态管理
- 域名统计信息

### ⚙️ 系统管理
- 管理员控制台
- 系统状态监控
- 邮件自动同步
- 定时任务调度
- 日志管理

## 技术栈

### 后端
- **Node.js** + **Express.js** - 服务器框架
- **MySQL** - 数据库
- **JWT** - 身份认证
- **Nodemailer** - 邮件发送
- **IMAP** - 邮件接收
- **Multer** - 文件上传
- **Winston** - 日志管理
- **Node-cron** - 定时任务

### 前端
- **React 18** - 用户界面框架
- **Ant Design** - UI 组件库
- **React Router** - 路由管理
- **React Query** - 数据获取和缓存
- **Styled Components** - 样式管理
- **React Quill** - 富文本编辑器
- **Axios** - HTTP 客户端

## 项目结构

```
email-system/
├── server.js                 # 主服务器文件
├── package.json              # 后端依赖配置
├── .env.example              # 环境变量模板
├── config/
│   └── database.js           # 数据库配置
├── database/
│   └── schema.sql            # 数据库架构
├── routes/                   # API路由
│   ├── auth.js              # 认证路由
│   ├── users.js             # 用户管理路由
│   ├── domains.js           # 域名管理路由
│   ├── aliases.js           # 别名管理路由
│   ├── emails.js            # 邮件路由
│   └── system.js            # 系统管理路由
├── utils/                   # 工具函数
│   ├── auth.js              # 认证工具
│   ├── email.js             # 邮件工具
│   ├── logger.js            # 日志工具
│   └── scheduler.js         # 定时任务
├── logs/                    # 日志文件目录
├── uploads/                 # 文件上传目录
└── client/                  # React前端项目
    ├── package.json         # 前端依赖配置
    ├── public/
    │   └── index.html       # HTML模板
    ├── src/
    │   ├── components/      # React组件
    │   ├── pages/           # 页面组件
    │   ├── contexts/        # React Context
    │   ├── services/        # API服务
    │   ├── App.js           # 主应用组件
    │   └── index.js         # 应用入口
    └── build/               # 生产构建目录
```

## 快速开始

### 环境要求
- Node.js 16+
- MySQL 8.0+
- SMTP/IMAP邮件服务器

### 1. 克隆项目
```bash
git clone <repository-url>
cd email-system
```

### 2. 安装依赖
```bash
# 安装后端和前端依赖
npm run install:all

# 或分别安装
npm install
cd client && npm install
```

### 3. 配置环境变量
```bash
# 复制环境变量模板
cp .env.example .env

# 编辑环境变量
vim .env
```

关键配置项：
```bash
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_NAME=email_system
DB_USER=your_username
DB_PASSWORD=your_password

# JWT配置
JWT_SECRET=your_super_secret_jwt_key

# 邮件服务器配置
SMTP_HOST=your.smtp.server
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password

IMAP_HOST=your.imap.server
IMAP_PORT=993
IMAP_USER=your_imap_user
IMAP_PASS=your_imap_password
```

### 4. 初始化数据库
```bash
# 创建数据库
mysql -u root -p -e "CREATE DATABASE email_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 导入数据库架构
mysql -u your_username -p email_system < database/schema.sql
```

### 5. 启动应用

#### 开发模式
```bash
# 同时启动后端和前端
npm run dev:all

# 或分别启动
npm run dev        # 后端服务 (端口 3001)
npm run client     # 前端服务 (端口 3000)
```

#### 生产模式
```bash
# 构建前端
npm run client:build

# 启动生产服务器
npm start
```

### 6. 访问应用
- 前端地址：http://localhost:3000
- 后端API：http://localhost:3001/api
- 健康检查：http://localhost:3001/api/health

## 使用说明

### 管理员操作

1. **创建管理员账户**
   - 注册第一个账户后，手动在数据库中将该用户的 `is_admin` 字段设置为 `TRUE`
   - 或通过环境变量 `ADMIN_EMAIL` 配置管理员邮箱

2. **域名管理**
   - 登录管理员控制台
   - 添加邮件域名（如：company.com）
   - 配置DNS记录指向邮件服务器

3. **用户管理**
   - 查看所有用户
   - 启用/禁用用户账户
   - 重置用户密码
   - 授予管理员权限

### 用户操作

1. **创建别名**
   - 登录系统
   - 进入"别名管理"
   - 选择域名创建邮箱别名（如：john@company.com）

2. **收发邮件**
   - 选择别名查看邮件
   - 在不同别名间切换
   - 发送邮件支持富文本和附件
   - 使用文件夹管理邮件

3. **邮件操作**
   - 标记已读/未读
   - 添加星标
   - 移动到文件夹
   - 批量操作邮件

## API文档

### 认证相关
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册
- `GET /api/auth/me` - 获取当前用户信息
- `POST /api/auth/logout` - 用户登出

### 别名管理
- `GET /api/aliases/my` - 获取当前用户别名
- `POST /api/aliases` - 创建别名
- `PATCH /api/aliases/:id` - 更新别名
- `DELETE /api/aliases/:id` - 删除别名

### 邮件管理
- `GET /api/emails/alias/:aliasId` - 获取别名邮件列表
- `GET /api/emails/:id` - 获取邮件详情
- `POST /api/emails/send` - 发送邮件
- `PATCH /api/emails/batch` - 批量操作邮件

### 管理员功能
- `GET /api/users` - 获取用户列表
- `GET /api/domains` - 获取域名列表
- `POST /api/domains` - 创建域名
- `POST /api/system/sync-emails` - 手动同步邮件

## 安全特性

- JWT身份认证
- 密码哈希存储（bcrypt）
- SQL注入防护
- XSS防护
- CSRF防护
- 文件上传安全检查
- 请求频率限制
- 输入数据验证

## 部署建议

### 使用Docker部署
```dockerfile
# Dockerfile示例
FROM node:16-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --production

COPY . .
WORKDIR /app/client
RUN npm install && npm run build

WORKDIR /app
EXPOSE 3001
CMD ["npm", "start"]
```

### 使用PM2部署
```bash
# 安装PM2
npm install -g pm2

# 启动应用
pm2 start server.js --name "email-system"
pm2 startup
pm2 save
```

### Nginx配置
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 维护和监控

### 日志管理
- 应用日志：`logs/combined.log`
- 错误日志：`logs/error.log`
- 日志轮转：自动管理日志文件大小

### 定时任务
- 邮件同步：每5分钟执行
- 会话清理：每天凌晨2点
- 数据库优化：每周日凌晨4点

### 监控指标
- 邮件收发量
- 用户活跃度
- 系统响应时间
- 错误率统计

## 故障排除

### 常见问题

1. **数据库连接失败**
   - 检查数据库服务是否运行
   - 验证连接参数
   - 确认用户权限

2. **邮件发送失败**
   - 检查SMTP配置
   - 验证邮件服务器连通性
   - 确认账户认证信息

3. **邮件接收异常**
   - 检查IMAP配置
   - 验证邮箱密码
   - 确认防火墙设置

### 调试模式
```bash
# 启用详细日志
NODE_ENV=development LOG_LEVEL=debug npm run dev
```

## 贡献指南

1. Fork项目
2. 创建功能分支
3. 提交更改
4. 创建Pull Request

## 许可证

MIT License

## 支持

如有问题请提交Issue或联系系统管理员。