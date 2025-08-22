const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const logger = require('./logger');

// 生成JWT令牌
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// 验证JWT令牌
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('无效的访问令牌');
  }
};

// 哈希密码
const hashPassword = async (password) => {
  const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  return await bcrypt.hash(password, rounds);
};

// 验证密码
const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// 认证中间件
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: '访问令牌缺失' });
    }

    const decoded = verifyToken(token);
    
    // 检查用户是否存在且激活
    const users = await query(
      'SELECT id, username, email, is_active FROM users WHERE id = ? AND is_active = TRUE',
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: '用户不存在或已被禁用' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    logger.error('认证失败:', error);
    return res.status(401).json({ error: '无效的访问令牌' });
  }
};

// 管理员权限中间件
const requireAdmin = async (req, res, next) => {
  try {
    const user = await query(
      'SELECT is_admin FROM users WHERE id = ?',
      [req.user.id]
    );

    if (user.length === 0 || !user[0].is_admin) {
      return res.status(403).json({ error: '需要管理员权限' });
    }

    next();
  } catch (error) {
    logger.error('权限检查失败:', error);
    return res.status(500).json({ error: '权限检查失败' });
  }
};

// 保存用户会话
const saveUserSession = async (userId, token, ipAddress, userAgent) => {
  try {
    const tokenHash = await hashPassword(token);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7天后过期

    await query(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, tokenHash, expiresAt, ipAddress, userAgent]
    );
  } catch (error) {
    logger.error('保存用户会话失败:', error);
  }
};

// 清理过期会话
const cleanupExpiredSessions = async () => {
  try {
    await query('DELETE FROM user_sessions WHERE expires_at < NOW()');
    logger.info('清理过期会话完成');
  } catch (error) {
    logger.error('清理过期会话失败:', error);
  }
};

module.exports = {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  authenticateToken,
  requireAdmin,
  saveUserSession,
  cleanupExpiredSessions
};