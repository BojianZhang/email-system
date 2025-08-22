const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();

const { query } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../utils/auth');
const logger = require('../utils/logger');

// 输入验证规则
const domainValidation = [
  body('domain_name')
    .trim()
    .isLength({ min: 3, max: 255 })
    .withMessage('域名长度必须在3-255个字符之间')
    .matches(/^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/)
    .withMessage('请输入有效的域名格式')
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

// 获取所有域名列表（管理员）
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    let queryParams = [];

    // 搜索条件
    if (search) {
      whereClause += ' AND domain_name LIKE ?';
      queryParams.push(`%${search}%`);
    }

    // 状态筛选
    if (status === 'active') {
      whereClause += ' AND is_active = TRUE';
    } else if (status === 'inactive') {
      whereClause += ' AND is_active = FALSE';
    }

    // 获取域名列表
    const domains = await query(
      `SELECT d.*, 
              COUNT(a.id) as alias_count,
              COUNT(CASE WHEN a.is_active = TRUE THEN 1 END) as active_alias_count
       FROM domains d
       LEFT JOIN aliases a ON d.id = a.domain_id
       WHERE ${whereClause}
       GROUP BY d.id
       ORDER BY d.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );

    // 获取总数
    const totalResult = await query(
      `SELECT COUNT(DISTINCT d.id) as total
       FROM domains d
       WHERE ${whereClause}`,
      queryParams
    );

    res.json({
      domains,
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total: totalResult[0].total,
        total_pages: Math.ceil(totalResult[0].total / limit)
      }
    });
  } catch (error) {
    logger.error('获取域名列表失败:', error);
    res.status(500).json({
      error: '获取域名列表失败'
    });
  }
});

// 获取活跃域名列表（普通用户可访问）
router.get('/active', authenticateToken, async (req, res) => {
  try {
    const domains = await query(
      `SELECT id, domain_name, created_at
       FROM domains
       WHERE is_active = TRUE
       ORDER BY domain_name ASC`
    );

    res.json({
      domains
    });
  } catch (error) {
    logger.error('获取活跃域名列表失败:', error);
    res.status(500).json({
      error: '获取域名列表失败'
    });
  }
});

// 获取单个域名详情
router.get('/:id', authenticateToken, requireAdmin, idValidation, handleValidationErrors, async (req, res) => {
  try {
    const domainId = req.params.id;

    const domains = await query(
      `SELECT d.*, 
              COUNT(a.id) as alias_count,
              COUNT(CASE WHEN a.is_active = TRUE THEN 1 END) as active_alias_count
       FROM domains d
       LEFT JOIN aliases a ON d.id = a.domain_id
       WHERE d.id = ?
       GROUP BY d.id`,
      [domainId]
    );

    if (domains.length === 0) {
      return res.status(404).json({
        error: '域名不存在'
      });
    }

    // 获取该域名下的别名列表
    const aliases = await query(
      `SELECT a.id, a.local_part, a.display_name, a.is_active, a.created_at,
              u.username, u.email as user_email
       FROM aliases a
       JOIN users u ON a.user_id = u.id
       WHERE a.domain_id = ?
       ORDER BY a.created_at DESC
       LIMIT 10`,
      [domainId]
    );

    res.json({
      domain: {
        ...domains[0],
        recent_aliases: aliases
      }
    });
  } catch (error) {
    logger.error('获取域名详情失败:', error);
    res.status(500).json({
      error: '获取域名详情失败'
    });
  }
});

// 创建新域名
router.post('/', authenticateToken, requireAdmin, domainValidation, handleValidationErrors, async (req, res) => {
  try {
    const { domain_name } = req.body;

    // 检查域名是否已存在
    const existingDomain = await query(
      'SELECT id FROM domains WHERE domain_name = ?',
      [domain_name.toLowerCase()]
    );

    if (existingDomain.length > 0) {
      return res.status(400).json({
        error: '域名已存在'
      });
    }

    // 创建域名
    const result = await query(
      'INSERT INTO domains (domain_name) VALUES (?)',
      [domain_name.toLowerCase()]
    );

    const domainId = result.insertId;

    logger.info(`管理员 ${req.user.email} 创建了新域名: ${domain_name}`);

    res.status(201).json({
      message: '域名创建成功',
      domain: {
        id: domainId,
        domain_name: domain_name.toLowerCase(),
        is_active: true,
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('创建域名失败:', error);
    res.status(500).json({
      error: '创建域名失败，请稍后重试'
    });
  }
});

// 更新域名状态
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
      const domainId = req.params.id;
      const { is_active } = req.body;

      // 检查域名是否存在
      const domains = await query(
        'SELECT id, domain_name FROM domains WHERE id = ?',
        [domainId]
      );

      if (domains.length === 0) {
        return res.status(404).json({
          error: '域名不存在'
        });
      }

      const domain = domains[0];

      // 更新域名状态
      await query(
        'UPDATE domains SET is_active = ? WHERE id = ?',
        [is_active, domainId]
      );

      logger.info(`管理员 ${req.user.email} ${is_active ? '启用' : '禁用'}了域名: ${domain.domain_name}`);

      res.json({
        message: `域名已${is_active ? '启用' : '禁用'}`,
        domain: {
          id: domainId,
          domain_name: domain.domain_name,
          is_active
        }
      });
    } catch (error) {
      logger.error('更新域名状态失败:', error);
      res.status(500).json({
        error: '更新域名状态失败'
      });
    }
  }
);

// 删除域名（软删除 - 禁用）
router.delete('/:id', authenticateToken, requireAdmin, idValidation, handleValidationErrors, async (req, res) => {
  try {
    const domainId = req.params.id;

    // 检查域名是否存在
    const domains = await query(
      'SELECT id, domain_name FROM domains WHERE id = ?',
      [domainId]
    );

    if (domains.length === 0) {
      return res.status(404).json({
        error: '域名不存在'
      });
    }

    const domain = domains[0];

    // 检查是否有关联的别名
    const aliases = await query(
      'SELECT COUNT(*) as count FROM aliases WHERE domain_id = ? AND is_active = TRUE',
      [domainId]
    );

    if (aliases[0].count > 0) {
      return res.status(400).json({
        error: '无法删除域名，该域名下还有活跃的别名',
        active_aliases_count: aliases[0].count
      });
    }

    // 软删除 - 禁用域名
    await query(
      'UPDATE domains SET is_active = FALSE WHERE id = ?',
      [domainId]
    );

    logger.info(`管理员 ${req.user.email} 删除了域名: ${domain.domain_name}`);

    res.json({
      message: '域名已删除'
    });
  } catch (error) {
    logger.error('删除域名失败:', error);
    res.status(500).json({
      error: '删除域名失败'
    });
  }
});

// 获取域名统计信息
router.get('/stats/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await query(`
      SELECT 
        COUNT(*) as total_domains,
        COUNT(CASE WHEN is_active = TRUE THEN 1 END) as active_domains,
        COUNT(CASE WHEN is_active = FALSE THEN 1 END) as inactive_domains
      FROM domains
    `);

    const aliasStats = await query(`
      SELECT 
        COUNT(*) as total_aliases,
        COUNT(DISTINCT domain_id) as domains_with_aliases
      FROM aliases
      WHERE is_active = TRUE
    `);

    res.json({
      domains: stats[0],
      aliases: aliasStats[0]
    });
  } catch (error) {
    logger.error('获取域名统计失败:', error);
    res.status(500).json({
      error: '获取统计信息失败'
    });
  }
});

module.exports = router;