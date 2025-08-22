const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();

const { query } = require('../config/database');
const { authenticateToken, requireAdmin, hashPassword } = require('../utils/auth');
const logger = require('../utils/logger');

// 输入验证规则
const userUpdateValidation = [
  body('username')
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('用户名长度必须在3-50个字符之间')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('用户名只能包含字母、数字和下划线'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('请输入有效的邮箱地址')
];

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

// 获取所有用户列表（仅管理员）
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    let queryParams = [];

    // 搜索条件
    if (search) {
      whereClause += ' AND (u.username LIKE ? OR u.email LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    // 状态筛选
    if (status === 'active') {
      whereClause += ' AND u.is_active = TRUE';
    } else if (status === 'inactive') {
      whereClause += ' AND u.is_active = FALSE';
    }

    // 获取用户列表
    const users = await query(
      `SELECT u.id, u.username, u.email, u.is_active, u.is_admin,
              u.created_at, u.last_login,
              COUNT(a.id) as alias_count,
              COUNT(CASE WHEN a.is_active = TRUE THEN 1 END) as active_alias_count
       FROM users u
       LEFT JOIN aliases a ON u.id = a.user_id
       WHERE ${whereClause}
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );

    // 获取总数
    const totalResult = await query(
      `SELECT COUNT(*) as total FROM users u WHERE ${whereClause}`,
      queryParams
    );

    res.json({
      users,
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total: totalResult[0].total,
        total_pages: Math.ceil(totalResult[0].total / limit)
      }
    });
  } catch (error) {
    logger.error('获取用户列表失败:', error);
    res.status(500).json({
      error: '获取用户列表失败'
    });
  }
});

// 获取单个用户详情
router.get('/:id', authenticateToken, idValidation, handleValidationErrors, async (req, res) => {
  try {
    const userId = req.params.id;
    const currentUserId = req.user.id;

    // 检查权限：管理员可以查看所有用户，普通用户只能查看自己
    const currentUser = await query('SELECT is_admin FROM users WHERE id = ?', [currentUserId]);
    const isAdmin = currentUser[0]?.is_admin;

    if (!isAdmin && parseInt(userId) !== currentUserId) {
      return res.status(403).json({
        error: '无权限查看该用户信息'
      });
    }

    // 获取用户详情
    const users = await query(
      `SELECT u.id, u.username, u.email, u.is_active, u.is_admin,
              u.created_at, u.last_login,
              COUNT(a.id) as alias_count,
              COUNT(CASE WHEN a.is_active = TRUE THEN 1 END) as active_alias_count
       FROM users u
       LEFT JOIN aliases a ON u.id = a.user_id
       WHERE u.id = ?
       GROUP BY u.id`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        error: '用户不存在'
      });
    }

    // 获取用户的别名列表
    const aliases = await query(
      `SELECT a.id, a.local_part, a.display_name, a.is_active, a.created_at,
              d.domain_name, CONCAT(a.local_part, '@', d.domain_name) as full_email,
              COUNT(e.id) as email_count,
              COUNT(CASE WHEN e.is_read = FALSE THEN 1 END) as unread_count
       FROM aliases a
       JOIN domains d ON a.domain_id = d.id
       LEFT JOIN emails e ON a.id = e.alias_id
       WHERE a.user_id = ?
       GROUP BY a.id
       ORDER BY a.created_at DESC`,
      [userId]
    );

    res.json({
      user: {
        ...users[0],
        aliases
      }
    });
  } catch (error) {
    logger.error('获取用户详情失败:', error);
    res.status(500).json({
      error: '获取用户详情失败'
    });
  }
});

// 更新用户信息
router.patch('/:id', 
  authenticateToken, 
  idValidation, 
  userUpdateValidation, 
  handleValidationErrors, 
  async (req, res) => {
    try {
      const userId = req.params.id;
      const currentUserId = req.user.id;
      const { username, email } = req.body;

      // 检查权限：管理员可以修改所有用户，普通用户只能修改自己
      const currentUser = await query('SELECT is_admin FROM users WHERE id = ?', [currentUserId]);
      const isAdmin = currentUser[0]?.is_admin;

      if (!isAdmin && parseInt(userId) !== currentUserId) {
        return res.status(403).json({
          error: '无权限修改该用户信息'
        });
      }

      // 检查用户是否存在
      const users = await query('SELECT id, username, email FROM users WHERE id = ?', [userId]);
      if (users.length === 0) {
        return res.status(404).json({
          error: '用户不存在'
        });
      }

      const user = users[0];
      const updates = {};

      // 检查用户名是否需要更新
      if (username && username !== user.username) {
        const existingUsername = await query('SELECT id FROM users WHERE username = ? AND id != ?', [username, userId]);
        if (existingUsername.length > 0) {
          return res.status(400).json({
            error: '用户名已存在'
          });
        }
        updates.username = username;
      }

      // 检查邮箱是否需要更新
      if (email && email !== user.email) {
        const existingEmail = await query('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
        if (existingEmail.length > 0) {
          return res.status(400).json({
            error: '邮箱已存在'
          });
        }
        updates.email = email;
      }

      // 如果没有更新，直接返回
      if (Object.keys(updates).length === 0) {
        return res.json({
          message: '没有需要更新的信息'
        });
      }

      // 构建更新语句
      const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updates);

      await query(
        `UPDATE users SET ${setClause} WHERE id = ?`,
        [...values, userId]
      );

      logger.info(`用户信息已更新: ${user.email} -> 更新字段: ${Object.keys(updates).join(', ')}`);

      res.json({
        message: '用户信息更新成功',
        updated_fields: Object.keys(updates)
      });
    } catch (error) {
      logger.error('更新用户信息失败:', error);
      res.status(500).json({
        error: '更新用户信息失败'
      });
    }
  }
);

// 更新用户状态（仅管理员）
router.patch('/:id/status', 
  authenticateToken, 
  requireAdmin, 
  idValidation,
  [
    body('is_active').isBoolean().withMessage('is_active必须是布尔值')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = req.params.id;
      const { is_active } = req.body;
      const currentUserId = req.user.id;

      // 防止管理员禁用自己的账户
      if (parseInt(userId) === currentUserId && !is_active) {
        return res.status(400).json({
          error: '不能禁用自己的账户'
        });
      }

      // 检查用户是否存在
      const users = await query('SELECT id, username, email FROM users WHERE id = ?', [userId]);
      if (users.length === 0) {
        return res.status(404).json({
          error: '用户不存在'
        });
      }

      const user = users[0];

      // 更新用户状态
      await query('UPDATE users SET is_active = ? WHERE id = ?', [is_active, userId]);

      logger.info(`管理员 ${req.user.email} ${is_active ? '启用' : '禁用'}了用户: ${user.email}`);

      res.json({
        message: `用户已${is_active ? '启用' : '禁用'}`,
        user: {
          id: userId,
          username: user.username,
          email: user.email,
          is_active
        }
      });
    } catch (error) {
      logger.error('更新用户状态失败:', error);
      res.status(500).json({
        error: '更新用户状态失败'
      });
    }
  }
);

// 更新管理员权限（仅管理员）
router.patch('/:id/admin', 
  authenticateToken, 
  requireAdmin, 
  idValidation,
  [
    body('is_admin').isBoolean().withMessage('is_admin必须是布尔值')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = req.params.id;
      const { is_admin } = req.body;
      const currentUserId = req.user.id;

      // 防止管理员取消自己的管理员权限
      if (parseInt(userId) === currentUserId && !is_admin) {
        return res.status(400).json({
          error: '不能取消自己的管理员权限'
        });
      }

      // 检查用户是否存在
      const users = await query('SELECT id, username, email FROM users WHERE id = ?', [userId]);
      if (users.length === 0) {
        return res.status(404).json({
          error: '用户不存在'
        });
      }

      const user = users[0];

      // 更新管理员权限
      await query('UPDATE users SET is_admin = ? WHERE id = ?', [is_admin, userId]);

      logger.info(`管理员 ${req.user.email} ${is_admin ? '授予' : '取消'}了用户 ${user.email} 的管理员权限`);

      res.json({
        message: `用户管理员权限已${is_admin ? '授予' : '取消'}`,
        user: {
          id: userId,
          username: user.username,
          email: user.email,
          is_admin
        }
      });
    } catch (error) {
      logger.error('更新管理员权限失败:', error);
      res.status(500).json({
        error: '更新管理员权限失败'
      });
    }
  }
);

// 重置用户密码（仅管理员）
router.post('/:id/reset-password', 
  authenticateToken, 
  requireAdmin, 
  idValidation,
  [
    body('new_password')
      .isLength({ min: 6, max: 128 })
      .withMessage('新密码长度必须在6-128个字符之间')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('新密码必须包含大写字母、小写字母和数字')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = req.params.id;
      const { new_password } = req.body;

      // 检查用户是否存在
      const users = await query('SELECT id, username, email FROM users WHERE id = ?', [userId]);
      if (users.length === 0) {
        return res.status(404).json({
          error: '用户不存在'
        });
      }

      const user = users[0];

      // 哈希新密码
      const hashedPassword = await hashPassword(new_password);

      // 更新密码
      await query('UPDATE users SET password_hash = ? WHERE id = ?', [hashedPassword, userId]);

      logger.info(`管理员 ${req.user.email} 重置了用户 ${user.email} 的密码`);

      res.json({
        message: '密码重置成功'
      });
    } catch (error) {
      logger.error('重置密码失败:', error);
      res.status(500).json({
        error: '重置密码失败'
      });
    }
  }
);

// 删除用户（软删除，仅管理员）
router.delete('/:id', authenticateToken, requireAdmin, idValidation, handleValidationErrors, async (req, res) => {
  try {
    const userId = req.params.id;
    const currentUserId = req.user.id;

    // 防止管理员删除自己的账户
    if (parseInt(userId) === currentUserId) {
      return res.status(400).json({
        error: '不能删除自己的账户'
      });
    }

    // 检查用户是否存在
    const users = await query('SELECT id, username, email FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({
        error: '用户不存在'
      });
    }

    const user = users[0];

    // 检查用户是否有关联数据
    const aliasCount = await query('SELECT COUNT(*) as count FROM aliases WHERE user_id = ?', [userId]);
    const emailCount = await query(
      'SELECT COUNT(*) as count FROM emails e JOIN aliases a ON e.alias_id = a.id WHERE a.user_id = ?', 
      [userId]
    );

    if (aliasCount[0].count > 0 || emailCount[0].count > 0) {
      // 有关联数据时，只做软删除（禁用账户）
      await query('UPDATE users SET is_active = FALSE WHERE id = ?', [userId]);
      
      logger.info(`管理员 ${req.user.email} 软删除了用户: ${user.email} (${aliasCount[0].count}个别名, ${emailCount[0].count}封邮件)`);
      
      res.json({
        message: '用户已被禁用（因为存在关联数据）',
        aliases_count: aliasCount[0].count,
        emails_count: emailCount[0].count
      });
    } else {
      // 没有关联数据时，可以硬删除
      await query('DELETE FROM users WHERE id = ?', [userId]);
      
      logger.info(`管理员 ${req.user.email} 删除了用户: ${user.email}`);
      
      res.json({
        message: '用户已删除'
      });
    }
  } catch (error) {
    logger.error('删除用户失败:', error);
    res.status(500).json({
      error: '删除用户失败'
    });
  }
});

// 获取用户统计信息（仅管理员）
router.get('/stats/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN is_active = TRUE THEN 1 END) as active_users,
        COUNT(CASE WHEN is_active = FALSE THEN 1 END) as inactive_users,
        COUNT(CASE WHEN is_admin = TRUE THEN 1 END) as admin_users
      FROM users
    `);

    const recentStats = await query(`
      SELECT 
        COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as new_users_7d,
        COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as new_users_30d,
        COUNT(CASE WHEN last_login >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as active_users_7d,
        COUNT(CASE WHEN last_login >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as active_users_30d
      FROM users
      WHERE is_active = TRUE
    `);

    const aliasStats = await query(`
      SELECT 
        COUNT(*) as total_aliases,
        COUNT(DISTINCT user_id) as users_with_aliases,
        AVG(alias_count) as avg_aliases_per_user
      FROM (
        SELECT user_id, COUNT(*) as alias_count
        FROM aliases
        WHERE is_active = TRUE
        GROUP BY user_id
      ) as user_alias_counts
    `);

    res.json({
      users: stats[0],
      recent_activity: recentStats[0],
      aliases: aliasStats[0]
    });
  } catch (error) {
    logger.error('获取用户统计失败:', error);
    res.status(500).json({
      error: '获取统计信息失败'
    });
  }
});

module.exports = router;