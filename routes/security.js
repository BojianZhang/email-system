const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();

const { query } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../utils/auth');
const { securityNotificationService } = require('../utils/securityNotification');
const logger = require('../utils/logger');

// 输入验证规则
const idValidation = [
  param('id').isInt({ min: 1 }).withMessage('ID必须是正整数')
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

// 获取安全警报列表
router.get('/alerts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      severity = '', 
      alert_type = '', 
      resolved = '' 
    } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    let queryParams = [];

    // 严重程度筛选
    if (severity) {
      whereClause += ' AND sa.severity = ?';
      queryParams.push(severity);
    }

    // 警报类型筛选
    if (alert_type) {
      whereClause += ' AND sa.alert_type = ?';
      queryParams.push(alert_type);
    }

    // 解决状态筛选
    if (resolved === 'true') {
      whereClause += ' AND sa.is_resolved = TRUE';
    } else if (resolved === 'false') {
      whereClause += ' AND sa.is_resolved = FALSE';
    }

    // 获取警报列表
    const alerts = await query(
      `SELECT sa.*, u.username, u.email,
              resolver.username as resolved_by_username
       FROM security_alerts sa
       JOIN users u ON sa.user_id = u.id
       LEFT JOIN users resolver ON sa.resolved_by = resolver.id
       WHERE ${whereClause}
       ORDER BY sa.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );

    // 获取总数
    const totalResult = await query(
      `SELECT COUNT(*) as total FROM security_alerts sa WHERE ${whereClause}`,
      queryParams
    );

    res.json({
      alerts: alerts.map(alert => ({
        ...alert,
        alert_data: JSON.parse(alert.alert_data || '{}')
      })),
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total: totalResult[0].total,
        total_pages: Math.ceil(totalResult[0].total / limit)
      }
    });
  } catch (error) {
    logger.error('获取安全警报列表失败:', error);
    res.status(500).json({
      error: '获取安全警报列表失败'
    });
  }
});

// 获取警报统计
router.get('/alerts/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const stats = await securityNotificationService.getAlertStatistics(parseInt(days));

    // 获取总体统计
    const overallStats = await query(
      `SELECT 
         COUNT(*) as total_alerts,
         COUNT(CASE WHEN is_resolved = FALSE THEN 1 END) as unresolved_alerts,
         COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_alerts,
         COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_alerts,
         COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as alerts_24h
       FROM security_alerts
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [parseInt(days)]
    );

    res.json({
      overall: overallStats[0],
      by_type_and_severity: stats,
      period_days: parseInt(days)
    });
  } catch (error) {
    logger.error('获取警报统计失败:', error);
    res.status(500).json({
      error: '获取警报统计失败'
    });
  }
});

// 标记警报为已解决
router.patch('/alerts/:id/resolve', 
  authenticateToken, 
  requireAdmin, 
  idValidation,
  [
    body('resolution_notes').optional().trim().isLength({ max: 1000 }).withMessage('解决备注不能超过1000个字符')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const alertId = req.params.id;
      const { resolution_notes } = req.body;
      const resolvedBy = req.user.id;

      // 检查警报是否存在
      const alerts = await query(
        'SELECT id, is_resolved FROM security_alerts WHERE id = ?',
        [alertId]
      );

      if (alerts.length === 0) {
        return res.status(404).json({
          error: '警报不存在'
        });
      }

      if (alerts[0].is_resolved) {
        return res.status(400).json({
          error: '警报已经被解决'
        });
      }

      // 标记为已解决
      await securityNotificationService.resolveAlert(alertId, resolvedBy, resolution_notes);

      logger.info(`管理员 ${req.user.email} 解决了安全警报 ${alertId}`);

      res.json({
        message: '警报已标记为已解决'
      });
    } catch (error) {
      logger.error('标记警报为已解决失败:', error);
      res.status(500).json({
        error: '标记警报为已解决失败'
      });
    }
  }
);

// 获取用户登录监控数据
router.get('/login-monitoring', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      user_id = '', 
      suspicious_only = 'false',
      days = 7 
    } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'ull.login_time >= DATE_SUB(NOW(), INTERVAL ? DAY)';
    let queryParams = [parseInt(days)];

    // 用户筛选
    if (user_id) {
      whereClause += ' AND ull.user_id = ?';
      queryParams.push(user_id);
    }

    // 只显示可疑登录
    if (suspicious_only === 'true') {
      whereClause += ' AND ull.is_suspicious = TRUE';
    }

    // 获取登录日志
    const loginLogs = await query(
      `SELECT ull.*, u.username, u.email
       FROM user_login_logs ull
       JOIN users u ON ull.user_id = u.id
       WHERE ${whereClause}
       ORDER BY ull.login_time DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );

    // 获取总数
    const totalResult = await query(
      `SELECT COUNT(*) as total
       FROM user_login_logs ull
       WHERE ${whereClause}`,
      queryParams
    );

    res.json({
      login_logs: loginLogs.map(log => ({
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
    logger.error('获取登录监控数据失败:', error);
    res.status(500).json({
      error: '获取登录监控数据失败'
    });
  }
});

// 获取活跃会话列表
router.get('/active-sessions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const activeSessions = await query(
      `SELECT ull.*, u.username, u.email
       FROM user_login_logs ull
       JOIN users u ON ull.user_id = u.id
       WHERE ull.is_active = TRUE
       ORDER BY ull.login_time DESC`
    );

    res.json({
      active_sessions: activeSessions,
      total_sessions: activeSessions.length
    });
  } catch (error) {
    logger.error('获取活跃会话失败:', error);
    res.status(500).json({
      error: '获取活跃会话失败'
    });
  }
});

// 强制结束用户会话
router.post('/terminate-session', 
  authenticateToken, 
  requireAdmin,
  [
    body('user_id').isInt({ min: 1 }).withMessage('用户ID必须是正整数'),
    body('session_token_hash').optional().isString().withMessage('会话令牌哈希必须是字符串')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { user_id, session_token_hash } = req.body;

      let updateQuery = '';
      let updateParams = [];

      if (session_token_hash) {
        // 结束特定会话
        updateQuery = 'UPDATE user_login_logs SET is_active = FALSE, logout_time = NOW() WHERE session_token_hash = ?';
        updateParams = [session_token_hash];
      } else {
        // 结束用户的所有会话
        updateQuery = 'UPDATE user_login_logs SET is_active = FALSE, logout_time = NOW() WHERE user_id = ? AND is_active = TRUE';
        updateParams = [user_id];
      }

      const result = await query(updateQuery, updateParams);

      // 获取用户信息
      const users = await query('SELECT username, email FROM users WHERE id = ?', [user_id]);
      const user = users[0];

      logger.info(`管理员 ${req.user.email} 强制结束了用户 ${user?.email} 的会话 (${result.affectedRows} 个会话)`);

      res.json({
        message: `已结束 ${result.affectedRows} 个会话`,
        terminated_sessions: result.affectedRows
      });
    } catch (error) {
      logger.error('强制结束会话失败:', error);
      res.status(500).json({
        error: '强制结束会话失败'
      });
    }
  }
);

// 获取安全配置
router.get('/config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const settings = await query(
      'SELECT setting_key, setting_value, setting_type, description, category FROM security_settings ORDER BY category, setting_key'
    );

    // 转换为配置对象
    const configSettings = {};
    settings.forEach(setting => {
      let value = setting.setting_value;
      // 根据类型转换值
      if (setting.setting_type === 'boolean') {
        value = value === 'true';
      } else if (setting.setting_type === 'integer') {
        value = parseInt(value);
      } else if (setting.setting_type === 'json') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          // 保持原始字符串值
        }
      }

      configSettings[setting.setting_key] = value;
    });

    res.json({
      settings: configSettings
    });
  } catch (error) {
    logger.error('获取安全配置失败:', error);
    res.status(500).json({
      error: '获取安全配置失败'
    });
  }
});

// 更新安全配置（批量）
router.put('/config', 
  authenticateToken, 
  requireAdmin,
  [
    body('*').custom((value, { path }) => {
      // 基本验证，具体验证在业务逻辑中处理
      return true;
    })
  ],
  async (req, res) => {
    try {
      const configUpdates = req.body;
      const adminId = req.user.id;
      
      // 获取现有配置以进行验证
      const existingSettings = await query(
        'SELECT setting_key, setting_type, is_system FROM security_settings'
      );
      
      const settingsMap = {};
      existingSettings.forEach(setting => {
        settingsMap[setting.setting_key] = setting;
      });

      // 验证和更新配置
      const updatePromises = [];
      for (const [key, value] of Object.entries(configUpdates)) {
        if (!settingsMap[key]) {
          return res.status(400).json({
            error: `配置项 ${key} 不存在`
          });
        }

        const setting = settingsMap[key];
        if (setting.is_system) {
          return res.status(400).json({
            error: `配置项 ${key} 是系统级配置，不允许修改`
          });
        }

        // 验证值类型
        let stringValue = value;
        if (setting.setting_type === 'boolean') {
          if (typeof value !== 'boolean') {
            return res.status(400).json({
              error: `配置项 ${key} 必须是布尔值`
            });
          }
          stringValue = value.toString();
        } else if (setting.setting_type === 'integer') {
          if (!Number.isInteger(value)) {
            return res.status(400).json({
              error: `配置项 ${key} 必须是整数`
            });
          }
          stringValue = value.toString();
        } else if (setting.setting_type === 'json') {
          try {
            stringValue = JSON.stringify(value);
          } catch (e) {
            return res.status(400).json({
              error: `配置项 ${key} JSON格式错误`
            });
          }
        }

        updatePromises.push(
          query(
            'UPDATE security_settings SET setting_value = ?, updated_by = ?, updated_at = NOW() WHERE setting_key = ?',
            [stringValue, adminId, key]
          )
        );
      }

      await Promise.all(updatePromises);

      logger.info(`管理员 ${req.user.email} 批量更新了安全配置`);

      res.json({
        message: '配置更新成功',
        updated_count: updatePromises.length
      });
    } catch (error) {
      logger.error('更新安全配置失败:', error);
      res.status(500).json({
        error: '更新安全配置失败'
      });
    }
  }
);

// 重置安全配置为默认值
router.post('/config/reset', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const adminId = req.user.id;

    // 重置为默认值（非系统配置）
    const defaultConfigs = [
      ['login_monitoring_enabled', 'true'],
      ['login_logs_retention_days', '90'],
      ['geo_cache_hours', '24'],
      ['geo_anomaly_detection_enabled', 'true'],
      ['geo_anomaly_distance_km', '500'],
      ['time_anomaly_window_hours', '6'],
      ['login_frequency_limit', '10'],
      ['login_frequency_window_minutes', '30'],
      ['max_concurrent_sessions', '5'],
      ['base_risk_score', '10'],
      ['geo_anomaly_risk_score', '25'],
      ['new_device_risk_score', '15'],
      ['suspicious_ip_risk_score', '30'],
      ['high_risk_threshold', '70'],
      ['email_notifications_enabled', 'true'],
      ['admin_emails', 'admin@example.com'],
      ['notification_severity_level', 'medium'],
      ['notification_rate_limit', '5'],
      ['notification_rate_window_minutes', '60'],
      ['session_timeout_hours', '24'],
      ['remember_me_days', '30'],
      ['force_single_session', 'false'],
      ['trusted_device_days', '90']
    ];

    const resetPromises = defaultConfigs.map(([key, value]) =>
      query(
        'UPDATE security_settings SET setting_value = ?, updated_by = ?, updated_at = NOW() WHERE setting_key = ? AND is_system = FALSE',
        [value, adminId, key]
      )
    );

    await Promise.all(resetPromises);

    logger.info(`管理员 ${req.user.email} 重置了安全配置为默认值`);

    res.json({
      message: '配置已重置为默认值'
    });
  } catch (error) {
    logger.error('重置安全配置失败:', error);
    res.status(500).json({
      error: '重置安全配置失败'
    });
  }
});

// 获取安全配置详情（包含类别）
router.get('/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const settings = await query(
      'SELECT setting_key, setting_value, setting_type, description, category FROM security_settings ORDER BY category, setting_key'
    );

    // 按类别分组
    const groupedSettings = {};
    settings.forEach(setting => {
      if (!groupedSettings[setting.category]) {
        groupedSettings[setting.category] = [];
      }
      
      let value = setting.setting_value;
      // 根据类型转换值
      if (setting.setting_type === 'boolean') {
        value = value === 'true';
      } else if (setting.setting_type === 'integer') {
        value = parseInt(value);
      } else if (setting.setting_type === 'json') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          // 保持原始字符串值
        }
      }

      groupedSettings[setting.category].push({
        key: setting.setting_key,
        value: value,
        type: setting.setting_type,
        description: setting.description
      });
    });

    res.json({
      settings: groupedSettings
    });
  } catch (error) {
    logger.error('获取安全配置失败:', error);
    res.status(500).json({
      error: '获取安全配置失败'
    });
  }
});

// 更新安全配置
router.patch('/settings/:key', 
  authenticateToken, 
  requireAdmin,
  [
    param('key').isString().withMessage('配置键必须是字符串'),
    body('value').exists().withMessage('配置值不能为空')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const settingKey = req.params.key;
      const { value } = req.body;

      // 检查配置是否存在
      const settings = await query(
        'SELECT setting_type, is_system FROM security_settings WHERE setting_key = ?',
        [settingKey]
      );

      if (settings.length === 0) {
        return res.status(404).json({
          error: '配置项不存在'
        });
      }

      const setting = settings[0];

      // 系统级配置不允许修改
      if (setting.is_system) {
        return res.status(400).json({
          error: '系统级配置不允许修改'
        });
      }

      // 验证值类型
      let stringValue = value;
      if (setting.setting_type === 'boolean') {
        if (typeof value !== 'boolean') {
          return res.status(400).json({
            error: '布尔类型配置值必须是 true 或 false'
          });
        }
        stringValue = value.toString();
      } else if (setting.setting_type === 'integer') {
        if (!Number.isInteger(value)) {
          return res.status(400).json({
            error: '整数类型配置值必须是整数'
          });
        }
        stringValue = value.toString();
      } else if (setting.setting_type === 'json') {
        try {
          stringValue = JSON.stringify(value);
        } catch (e) {
          return res.status(400).json({
            error: 'JSON类型配置值格式错误'
          });
        }
      }

      // 更新配置
      await query(
        'UPDATE security_settings SET setting_value = ?, updated_by = ? WHERE setting_key = ?',
        [stringValue, req.user.id, settingKey]
      );

      logger.info(`管理员 ${req.user.email} 更新了安全配置: ${settingKey} = ${stringValue}`);

      res.json({
        message: '配置更新成功',
        key: settingKey,
        value: value
      });
    } catch (error) {
      logger.error('更新安全配置失败:', error);
      res.status(500).json({
        error: '更新安全配置失败'
      });
    }
  }
);

// 获取用户安全概览
router.get('/users/:id/security-overview', 
  authenticateToken, 
  requireAdmin, 
  idValidation, 
  handleValidationErrors, 
  async (req, res) => {
    try {
      const userId = req.params.id;

      // 获取用户基本信息
      const users = await query(
        'SELECT id, username, email, is_active, created_at, last_login FROM users WHERE id = ?',
        [userId]
      );

      if (users.length === 0) {
        return res.status(404).json({
          error: '用户不存在'
        });
      }

      const user = users[0];

      // 获取登录统计
      const loginStats = await query(
        `SELECT 
           COUNT(*) as total_logins,
           COUNT(DISTINCT ip_address) as unique_ips,
           COUNT(DISTINCT country) as unique_countries,
           COUNT(CASE WHEN is_suspicious = TRUE THEN 1 END) as suspicious_logins,
           AVG(risk_score) as avg_risk_score,
           MAX(login_time) as last_login_time
         FROM user_login_logs 
         WHERE user_id = ? AND login_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
        [userId]
      );

      // 获取活跃会话
      const activeSessions = await query(
        'SELECT COUNT(*) as active_sessions FROM user_login_logs WHERE user_id = ? AND is_active = TRUE',
        [userId]
      );

      // 获取受信任设备
      const trustedDevices = await query(
        'SELECT COUNT(*) as trusted_devices FROM user_trusted_devices WHERE user_id = ? AND is_trusted = TRUE',
        [userId]
      );

      // 获取最近的安全警报
      const recentAlerts = await query(
        `SELECT alert_type, severity, title, created_at, is_resolved
         FROM security_alerts 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT 10`,
        [userId]
      );

      res.json({
        user,
        login_stats: loginStats[0],
        active_sessions: activeSessions[0].active_sessions,
        trusted_devices: trustedDevices[0].trusted_devices,
        recent_alerts: recentAlerts
      });
    } catch (error) {
      logger.error('获取用户安全概览失败:', error);
      res.status(500).json({
        error: '获取用户安全概览失败'
      });
    }
  }
);

module.exports = router;