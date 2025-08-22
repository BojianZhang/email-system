const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const { query } = require('../config/database');
const { 
  generateToken, 
  hashPassword, 
  comparePassword, 
  authenticateToken, 
  saveUserSession 
} = require('../utils/auth');
const { loginAnomalyDetector } = require('../utils/loginAnomalyDetector');
const { securityNotificationService } = require('../utils/securityNotification');
const logger = require('../utils/logger');

// 输入验证规则
const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('用户名长度必须在3-50个字符之间')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('用户名只能包含字母、数字和下划线'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('请输入有效的邮箱地址'),
  body('password')
    .isLength({ min: 6, max: 128 })
    .withMessage('密码长度必须在6-128个字符之间')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('密码必须包含大写字母、小写字母和数字')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('请输入有效的邮箱地址'),
  body('password')
    .notEmpty()
    .withMessage('密码不能为空')
];

// 处理验证错误
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: '输入数据验证失败',
      details: errors.array()
    });
  }
  next();
};

// 用户注册
router.post('/register', registerValidation, handleValidationErrors, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // 检查用户名是否已存在
    const existingUser = await query(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUser.length > 0) {
      return res.status(400).json({
        error: '用户名或邮箱已存在'
      });
    }

    // 哈希密码
    const hashedPassword = await hashPassword(password);

    // 创建用户
    const result = await query(
      `INSERT INTO users (username, email, password_hash) 
       VALUES (?, ?, ?)`,
      [username, email, hashedPassword]
    );

    const userId = result.insertId;

    // 生成JWT令牌
    const token = generateToken(userId);

    // 保存会话信息
    await saveUserSession(userId, token, req.ip, req.get('User-Agent'));

    // 更新最后登录时间
    await query(
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      [userId]
    );

    logger.info(`新用户注册成功: ${email}`);

    res.status(201).json({
      message: '注册成功',
      token,
      user: {
        id: userId,
        username,
        email,
        is_admin: false
      }
    });
  } catch (error) {
    logger.error('用户注册失败:', error);
    res.status(500).json({
      error: '注册失败，请稍后重试'
    });
  }
});

// 用户登录
router.post('/login', loginValidation, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || '';

    // 查找用户
    const users = await query(
      'SELECT id, username, email, password_hash, is_active, is_admin FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      // 记录失败的登录尝试
      logger.warn(`登录失败 - 用户不存在: ${email} from ${ipAddress}`);
      return res.status(401).json({
        error: '邮箱或密码错误'
      });
    }

    const user = users[0];

    // 检查用户是否被禁用
    if (!user.is_active) {
      logger.warn(`登录失败 - 账户已禁用: ${email} from ${ipAddress}`);
      return res.status(401).json({
        error: '账户已被禁用，请联系管理员'
      });
    }

    // 验证密码
    const isPasswordValid = await comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      logger.warn(`登录失败 - 密码错误: ${email} from ${ipAddress}`);
      return res.status(401).json({
        error: '邮箱或密码错误'
      });
    }

    // 生成JWT令牌
    const token = generateToken(user.id);

    // 创建会话数据
    const sessionTokenHash = await hashPassword(token);
    const loginData = {
      ip_address: ipAddress,
      user_agent: userAgent,
      session_token_hash: sessionTokenHash
    };

    // 检测登录异常
    let anomalyResult = null;
    let shouldBlock = false;

    try {
      anomalyResult = await loginAnomalyDetector.detectAnomalies(user.id, loginData);
      
      // 检查是否应该阻止登录
      const autoBlockSettings = await query(
        'SELECT setting_value FROM security_settings WHERE setting_key = "auto_block_high_risk"'
      );
      const autoBlock = autoBlockSettings.length > 0 && autoBlockSettings[0].setting_value === 'true';
      
      if (autoBlock && anomalyResult.totalRiskScore >= 80) {
        shouldBlock = true;
        logger.warn(`高风险登录被自动阻止: ${email} (风险分数: ${anomalyResult.totalRiskScore})`);
      }

      // 如果检测到异常，创建安全警报
      if (anomalyResult.isSuspicious) {
        await securityNotificationService.createLoginAnomalyAlert(user.id, anomalyResult);
      }

      // 添加受信任设备（如果风险较低）
      if (anomalyResult.totalRiskScore < 30) {
        await loginAnomalyDetector.addTrustedDevice(
          user.id, 
          anomalyResult.deviceInfo, 
          ipAddress, 
          anomalyResult.locationInfo
        );
      }

    } catch (detectionError) {
      logger.error('登录异常检测失败:', detectionError);
      // 异常检测失败不应该阻止正常登录
    }

    // 如果应该阻止登录
    if (shouldBlock) {
      return res.status(403).json({
        error: '登录被阻止：检测到高风险登录行为',
        details: '您的登录行为被系统识别为高风险，请联系管理员'
      });
    }

    // 保存会话信息
    await saveUserSession(user.id, token, ipAddress, userAgent);

    // 更新最后登录时间
    await query(
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      [user.id]
    );

    logger.info(`用户登录成功: ${email} from ${ipAddress} ${anomalyResult ? `(风险分数: ${anomalyResult.totalRiskScore})` : ''}`);

    // 准备响应数据
    const responseData = {
      message: '登录成功',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.is_admin
      }
    };

    // 如果有安全警告，添加到响应中
    if (anomalyResult && anomalyResult.isSuspicious) {
      responseData.security_warning = {
        message: '检测到异常登录行为，已通知管理员',
        risk_score: anomalyResult.totalRiskScore,
        location: `${anomalyResult.locationInfo.city}, ${anomalyResult.locationInfo.country}`
      };
    }

    res.json(responseData);
  } catch (error) {
    logger.error('用户登录失败:', error);
    res.status(500).json({
      error: '登录失败，请稍后重试'
    });
  }
});

// 获取当前用户信息
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const users = await query(
      `SELECT u.id, u.username, u.email, u.is_admin, u.created_at, u.last_login,
              COUNT(a.id) as alias_count
       FROM users u
       LEFT JOIN aliases a ON u.id = a.user_id AND a.is_active = TRUE
       WHERE u.id = ?
       GROUP BY u.id`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        error: '用户不存在'
      });
    }

    res.json({
      user: users[0]
    });
  } catch (error) {
    logger.error('获取用户信息失败:', error);
    res.status(500).json({
      error: '获取用户信息失败'
    });
  }
});

// 修改密码
router.post('/change-password', 
  authenticateToken,
  [
    body('currentPassword').notEmpty().withMessage('当前密码不能为空'),
    body('newPassword')
      .isLength({ min: 6, max: 128 })
      .withMessage('新密码长度必须在6-128个字符之间')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('新密码必须包含大写字母、小写字母和数字')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      // 获取当前密码哈希
      const users = await query(
        'SELECT password_hash FROM users WHERE id = ?',
        [userId]
      );

      if (users.length === 0) {
        return res.status(404).json({
          error: '用户不存在'
        });
      }

      // 验证当前密码
      const isCurrentPasswordValid = await comparePassword(currentPassword, users[0].password_hash);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          error: '当前密码错误'
        });
      }

      // 哈希新密码
      const hashedNewPassword = await hashPassword(newPassword);

      // 更新密码
      await query(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        [hashedNewPassword, userId]
      );

      logger.info(`用户 ${req.user.email} 修改密码成功`);

      res.json({
        message: '密码修改成功'
      });
    } catch (error) {
      logger.error('修改密码失败:', error);
      res.status(500).json({
        error: '修改密码失败，请稍后重试'
      });
    }
  }
);

// 登出（清理会话）
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // 这里可以添加清理当前会话的逻辑
    // 由于JWT是无状态的，主要依赖客户端删除token
    
    logger.info(`用户 ${req.user.email} 登出`);
    
    res.json({
      message: '登出成功'
    });
  } catch (error) {
    logger.error('登出失败:', error);
    res.status(500).json({
      error: '登出失败'
    });
  }
});

// 验证令牌有效性
router.get('/verify', authenticateToken, (req, res) => {
  res.json({
    valid: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email
    }
  });
});

// 获取用户登录历史
router.get('/login-history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const loginHistory = await query(
      `SELECT 
        ip_address, country, region, city, 
        device_type, browser, os,
        login_time, logout_time, is_active,
        risk_score, is_suspicious, suspicious_reasons
       FROM user_login_logs 
       WHERE user_id = ? 
       ORDER BY login_time DESC 
       LIMIT ? OFFSET ?`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    // 获取总数
    const totalResult = await query(
      'SELECT COUNT(*) as total FROM user_login_logs WHERE user_id = ?',
      [userId]
    );

    res.json({
      login_history: loginHistory.map(log => ({
        ...log,
        suspicious_reasons: log.suspicious_reasons ? JSON.parse(log.suspicious_reasons) : null
      })),
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total: totalResult[0].total,
        total_pages: Math.ceil(totalResult[0].total / limit)
      }
    });
  } catch (error) {
    logger.error('获取登录历史失败:', error);
    res.status(500).json({
      error: '获取登录历史失败'
    });
  }
});

// 获取用户当前活跃会话
router.get('/active-sessions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const activeSessions = await query(
      `SELECT 
        ip_address, country, city, 
        device_type, browser, os,
        login_time, risk_score
       FROM user_login_logs 
       WHERE user_id = ? AND is_active = TRUE
       ORDER BY login_time DESC`,
      [userId]
    );

    res.json({
      active_sessions: activeSessions,
      session_count: activeSessions.length
    });
  } catch (error) {
    logger.error('获取活跃会话失败:', error);
    res.status(500).json({
      error: '获取活跃会话失败'
    });
  }
});

// 获取用户受信任设备
router.get('/trusted-devices', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const trustedDevices = await query(
      `SELECT 
        device_name, device_type, browser, os,
        ip_address, location, is_trusted, last_used, created_at
       FROM user_trusted_devices 
       WHERE user_id = ? 
       ORDER BY last_used DESC`,
      [userId]
    );

    res.json({
      trusted_devices: trustedDevices
    });
  } catch (error) {
    logger.error('获取受信任设备失败:', error);
    res.status(500).json({
      error: '获取受信任设备失败'
    });
  }
});

// 撤销设备信任
router.delete('/trusted-devices/:deviceFingerprint', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const deviceFingerprint = req.params.deviceFingerprint;

    await query(
      'DELETE FROM user_trusted_devices WHERE user_id = ? AND device_fingerprint = ?',
      [userId, deviceFingerprint]
    );

    logger.info(`用户 ${req.user.email} 撤销了设备信任: ${deviceFingerprint}`);

    res.json({
      message: '设备信任已撤销'
    });
  } catch (error) {
    logger.error('撤销设备信任失败:', error);
    res.status(500).json({
      error: '撤销设备信任失败'
    });
  }
});

module.exports = router;