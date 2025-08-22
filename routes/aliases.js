const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();

const { query, transaction } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../utils/auth');
const logger = require('../utils/logger');

// 输入验证规则
const aliasValidation = [
  body('local_part')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('本地部分长度必须在1-100个字符之间')
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage('本地部分只能包含字母、数字、点、下划线和连字符'),
  body('domain_id')
    .isInt({ min: 1 })
    .withMessage('域名ID必须是正整数'),
  body('display_name')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('显示名称不能超过255个字符')
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

// 获取当前用户的所有别名
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { include_stats = 'false' } = req.query;

    let query_sql = `
      SELECT a.id, a.local_part, a.display_name, a.is_active, a.created_at,
             d.domain_name, d.is_active as domain_active,
             CONCAT(a.local_part, '@', d.domain_name) as full_email
      FROM aliases a
      JOIN domains d ON a.domain_id = d.id
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC
    `;

    const aliases = await query(query_sql, [userId]);

    // 如果需要包含统计信息
    if (include_stats === 'true' && aliases.length > 0) {
      const aliasIds = aliases.map(alias => alias.id);
      const placeholders = aliasIds.map(() => '?').join(',');
      
      const emailStats = await query(`
        SELECT 
          alias_id,
          COUNT(*) as total_emails,
          COUNT(CASE WHEN is_read = FALSE THEN 1 END) as unread_emails,
          COUNT(CASE WHEN ft.name = 'inbox' THEN 1 END) as inbox_emails,
          MAX(received_at) as last_email_at
        FROM emails e
        JOIN folder_types ft ON e.folder_type_id = ft.id
        WHERE alias_id IN (${placeholders})
        GROUP BY alias_id
      `, aliasIds);

      // 将统计信息合并到别名数据中
      const statsMap = {};
      emailStats.forEach(stat => {
        statsMap[stat.alias_id] = stat;
      });

      aliases.forEach(alias => {
        const stats = statsMap[alias.id] || {
          total_emails: 0,
          unread_emails: 0,
          inbox_emails: 0,
          last_email_at: null
        };
        alias.email_stats = stats;
      });
    }

    res.json({
      aliases
    });
  } catch (error) {
    logger.error('获取用户别名失败:', error);
    res.status(500).json({
      error: '获取别名列表失败'
    });
  }
});

// 获取所有别名列表（管理员）
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', domain_id = '', user_id = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    let queryParams = [];

    // 搜索条件
    if (search) {
      whereClause += ' AND (a.local_part LIKE ? OR d.domain_name LIKE ? OR u.username LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // 域名筛选
    if (domain_id) {
      whereClause += ' AND a.domain_id = ?';
      queryParams.push(domain_id);
    }

    // 用户筛选
    if (user_id) {
      whereClause += ' AND a.user_id = ?';
      queryParams.push(user_id);
    }

    // 获取别名列表
    const aliases = await query(
      `SELECT a.id, a.local_part, a.display_name, a.is_active, a.created_at,
              d.domain_name, d.is_active as domain_active,
              u.username, u.email as user_email,
              CONCAT(a.local_part, '@', d.domain_name) as full_email,
              COUNT(e.id) as email_count
       FROM aliases a
       JOIN domains d ON a.domain_id = d.id
       JOIN users u ON a.user_id = u.id
       LEFT JOIN emails e ON a.id = e.alias_id
       WHERE ${whereClause}
       GROUP BY a.id
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );

    // 获取总数
    const totalResult = await query(
      `SELECT COUNT(DISTINCT a.id) as total
       FROM aliases a
       JOIN domains d ON a.domain_id = d.id
       JOIN users u ON a.user_id = u.id
       WHERE ${whereClause}`,
      queryParams
    );

    res.json({
      aliases,
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total: totalResult[0].total,
        total_pages: Math.ceil(totalResult[0].total / limit)
      }
    });
  } catch (error) {
    logger.error('获取别名列表失败:', error);
    res.status(500).json({
      error: '获取别名列表失败'
    });
  }
});

// 获取单个别名详情
router.get('/:id', authenticateToken, idValidation, handleValidationErrors, async (req, res) => {
  try {
    const aliasId = req.params.id;
    const userId = req.user.id;

    // 构建查询条件（管理员可查看所有别名，普通用户只能查看自己的）
    let whereClause = 'a.id = ?';
    let queryParams = [aliasId];

    // 检查用户权限
    const userCheck = await query('SELECT is_admin FROM users WHERE id = ?', [userId]);
    const isAdmin = userCheck[0]?.is_admin;

    if (!isAdmin) {
      whereClause += ' AND a.user_id = ?';
      queryParams.push(userId);
    }

    const aliases = await query(
      `SELECT a.id, a.local_part, a.display_name, a.is_active, a.created_at, a.updated_at,
              d.domain_name, d.is_active as domain_active,
              u.username, u.email as user_email,
              CONCAT(a.local_part, '@', d.domain_name) as full_email
       FROM aliases a
       JOIN domains d ON a.domain_id = d.id
       JOIN users u ON a.user_id = u.id
       WHERE ${whereClause}`,
      queryParams
    );

    if (aliases.length === 0) {
      return res.status(404).json({
        error: '别名不存在或无权限访问'
      });
    }

    // 获取邮件统计
    const emailStats = await query(
      `SELECT 
         COUNT(*) as total_emails,
         COUNT(CASE WHEN is_read = FALSE THEN 1 END) as unread_emails,
         COUNT(CASE WHEN ft.name = 'inbox' THEN 1 END) as inbox_emails,
         COUNT(CASE WHEN ft.name = 'sent' THEN 1 END) as sent_emails,
         MAX(received_at) as last_email_at
       FROM emails e
       JOIN folder_types ft ON e.folder_type_id = ft.id
       WHERE e.alias_id = ?`,
      [aliasId]
    );

    res.json({
      alias: {
        ...aliases[0],
        email_stats: emailStats[0]
      }
    });
  } catch (error) {
    logger.error('获取别名详情失败:', error);
    res.status(500).json({
      error: '获取别名详情失败'
    });
  }
});

// 创建新别名
router.post('/', authenticateToken, aliasValidation, handleValidationErrors, async (req, res) => {
  try {
    const { local_part, domain_id, display_name } = req.body;
    const userId = req.user.id;

    await transaction(async (connection) => {
      // 验证域名是否存在且激活
      const domains = await connection.execute(
        'SELECT id, domain_name, is_active FROM domains WHERE id = ?',
        [domain_id]
      );

      if (domains[0].length === 0) {
        throw new Error('指定的域名不存在');
      }

      const domain = domains[0][0];
      if (!domain.is_active) {
        throw new Error('指定的域名未激活');
      }

      // 检查别名是否已存在
      const existingAlias = await connection.execute(
        'SELECT id FROM aliases WHERE local_part = ? AND domain_id = ?',
        [local_part.toLowerCase(), domain_id]
      );

      if (existingAlias[0].length > 0) {
        throw new Error(`别名 ${local_part}@${domain.domain_name} 已存在`);
      }

      // 创建别名
      const result = await connection.execute(
        'INSERT INTO aliases (user_id, domain_id, local_part, display_name) VALUES (?, ?, ?, ?)',
        [userId, domain_id, local_part.toLowerCase(), display_name || null]
      );

      const aliasId = result[0].insertId;
      const fullEmail = `${local_part}@${domain.domain_name}`;

      logger.info(`用户 ${req.user.email} 创建了新别名: ${fullEmail}`);

      return {
        id: aliasId,
        local_part: local_part.toLowerCase(),
        domain_name: domain.domain_name,
        full_email: fullEmail,
        display_name: display_name || null,
        is_active: true,
        created_at: new Date().toISOString()
      };
    });

    const newAlias = await transaction(async (connection) => {
      const result = await connection.execute(
        'INSERT INTO aliases (user_id, domain_id, local_part, display_name) VALUES (?, ?, ?, ?)',
        [userId, domain_id, local_part.toLowerCase(), display_name || null]
      );
      return result[0].insertId;
    });

    // 获取完整的别名信息
    const createdAlias = await query(
      `SELECT a.id, a.local_part, a.display_name, a.is_active, a.created_at,
              d.domain_name, CONCAT(a.local_part, '@', d.domain_name) as full_email
       FROM aliases a
       JOIN domains d ON a.domain_id = d.id
       WHERE a.id = ?`,
      [newAlias]
    );

    res.status(201).json({
      message: '别名创建成功',
      alias: createdAlias[0]
    });
  } catch (error) {
    logger.error('创建别名失败:', error);
    res.status(400).json({
      error: error.message || '创建别名失败，请稍后重试'
    });
  }
});

// 更新别名
router.patch('/:id', 
  authenticateToken, 
  idValidation,
  [
    body('display_name')
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage('显示名称不能超过255个字符')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const aliasId = req.params.id;
      const { display_name } = req.body;
      const userId = req.user.id;

      // 检查别名是否存在且属于当前用户（或管理员）
      const userCheck = await query('SELECT is_admin FROM users WHERE id = ?', [userId]);
      const isAdmin = userCheck[0]?.is_admin;

      let whereClause = 'id = ?';
      let queryParams = [aliasId];

      if (!isAdmin) {
        whereClause += ' AND user_id = ?';
        queryParams.push(userId);
      }

      const aliases = await query(`SELECT id, local_part FROM aliases WHERE ${whereClause}`, queryParams);

      if (aliases.length === 0) {
        return res.status(404).json({
          error: '别名不存在或无权限修改'
        });
      }

      // 更新别名
      await query(
        'UPDATE aliases SET display_name = ? WHERE id = ?',
        [display_name || null, aliasId]
      );

      logger.info(`用户 ${req.user.email} 更新了别名 ID: ${aliasId}`);

      res.json({
        message: '别名更新成功'
      });
    } catch (error) {
      logger.error('更新别名失败:', error);
      res.status(500).json({
        error: '更新别名失败'
      });
    }
  }
);

// 切换别名状态
router.patch('/:id/status', 
  authenticateToken, 
  idValidation,
  [
    body('is_active').isBoolean().withMessage('is_active必须是布尔值')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const aliasId = req.params.id;
      const { is_active } = req.body;
      const userId = req.user.id;

      // 检查别名是否存在且属于当前用户（或管理员）
      const userCheck = await query('SELECT is_admin FROM users WHERE id = ?', [userId]);
      const isAdmin = userCheck[0]?.is_admin;

      let whereClause = 'a.id = ?';
      let queryParams = [aliasId];

      if (!isAdmin) {
        whereClause += ' AND a.user_id = ?';
        queryParams.push(userId);
      }

      const aliases = await query(
        `SELECT a.id, a.local_part, d.domain_name
         FROM aliases a
         JOIN domains d ON a.domain_id = d.id
         WHERE ${whereClause}`,
        queryParams
      );

      if (aliases.length === 0) {
        return res.status(404).json({
          error: '别名不存在或无权限修改'
        });
      }

      const alias = aliases[0];

      // 更新别名状态
      await query(
        'UPDATE aliases SET is_active = ? WHERE id = ?',
        [is_active, aliasId]
      );

      logger.info(`用户 ${req.user.email} ${is_active ? '启用' : '禁用'}了别名: ${alias.local_part}@${alias.domain_name}`);

      res.json({
        message: `别名已${is_active ? '启用' : '禁用'}`
      });
    } catch (error) {
      logger.error('更新别名状态失败:', error);
      res.status(500).json({
        error: '更新别名状态失败'
      });
    }
  }
);

// 删除别名
router.delete('/:id', authenticateToken, idValidation, handleValidationErrors, async (req, res) => {
  try {
    const aliasId = req.params.id;
    const userId = req.user.id;

    // 检查别名是否存在且属于当前用户（或管理员）
    const userCheck = await query('SELECT is_admin FROM users WHERE id = ?', [userId]);
    const isAdmin = userCheck[0]?.is_admin;

    let whereClause = 'a.id = ?';
    let queryParams = [aliasId];

    if (!isAdmin) {
      whereClause += ' AND a.user_id = ?';
      queryParams.push(userId);
    }

    const aliases = await query(
      `SELECT a.id, a.local_part, d.domain_name
       FROM aliases a
       JOIN domains d ON a.domain_id = d.id
       WHERE ${whereClause}`,
      queryParams
    );

    if (aliases.length === 0) {
      return res.status(404).json({
        error: '别名不存在或无权限删除'
      });
    }

    const alias = aliases[0];

    // 检查是否有邮件关联
    const emailCount = await query(
      'SELECT COUNT(*) as count FROM emails WHERE alias_id = ?',
      [aliasId]
    );

    if (emailCount[0].count > 0) {
      // 有邮件关联时，只做软删除（禁用）
      await query(
        'UPDATE aliases SET is_active = FALSE WHERE id = ?',
        [aliasId]
      );
      
      logger.info(`用户 ${req.user.email} 软删除了别名: ${alias.local_part}@${alias.domain_name} (${emailCount[0].count}封邮件)`);
      
      res.json({
        message: '别名已禁用（因为存在关联邮件）',
        emails_count: emailCount[0].count
      });
    } else {
      // 没有邮件关联时，可以硬删除
      await query('DELETE FROM aliases WHERE id = ?', [aliasId]);
      
      logger.info(`用户 ${req.user.email} 删除了别名: ${alias.local_part}@${alias.domain_name}`);
      
      res.json({
        message: '别名已删除'
      });
    }
  } catch (error) {
    logger.error('删除别名失败:', error);
    res.status(500).json({
      error: '删除别名失败'
    });
  }
});

module.exports = router;