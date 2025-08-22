const express = require('express');
const { body, param, query: expressQuery, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();

const { query, transaction } = require('../config/database');
const { authenticateToken } = require('../utils/auth');
const { sendEmail, parseEmail } = require('../utils/email');
const logger = require('../utils/logger');

// 文件上传配置
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'attachments');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB
    files: parseInt(process.env.MAX_FILES) || 10
  },
  fileFilter: (req, file, cb) => {
    // 排除危险文件类型
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (dangerousExtensions.includes(ext)) {
      return cb(new Error('不允许上传的文件类型'));
    }
    
    cb(null, true);
  }
});

// 输入验证规则
const emailValidation = [
  body('alias_id')
    .isInt({ min: 1 })
    .withMessage('别名ID必须是正整数'),
  body('to_addresses')
    .isArray({ min: 1 })
    .withMessage('收件人列表不能为空'),
  body('to_addresses.*')
    .isEmail()
    .withMessage('请输入有效的邮箱地址'),
  body('subject')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('邮件主题长度必须在1-500个字符之间'),
  body('body_text')
    .optional()
    .trim()
    .isLength({ max: 1000000 })
    .withMessage('纯文本内容不能超过1MB'),
  body('body_html')
    .optional()
    .trim()
    .isLength({ max: 1000000 })
    .withMessage('HTML内容不能超过1MB'),
  body('cc_addresses')
    .optional()
    .isArray()
    .withMessage('抄送列表必须是数组'),
  body('cc_addresses.*')
    .optional()
    .isEmail()
    .withMessage('抄送邮箱格式不正确'),
  body('bcc_addresses')
    .optional()
    .isArray()
    .withMessage('密送列表必须是数组'),
  body('bcc_addresses.*')
    .optional()
    .isEmail()
    .withMessage('密送邮箱格式不正确')
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

// 获取指定别名的邮件列表
router.get('/alias/:aliasId', authenticateToken, async (req, res) => {
  try {
    const aliasId = req.params.aliasId;
    const userId = req.user.id;
    const { 
      page = 1, 
      limit = 20, 
      folder = 'inbox', 
      search = '', 
      unread_only = 'false' 
    } = req.query;
    
    const offset = (page - 1) * limit;

    // 验证别名是否属于当前用户
    const aliases = await query(
      `SELECT a.id, a.local_part, d.domain_name, 
              CONCAT(a.local_part, '@', d.domain_name) as full_email
       FROM aliases a
       JOIN domains d ON a.domain_id = d.id
       WHERE a.id = ? AND a.user_id = ? AND a.is_active = TRUE`,
      [aliasId, userId]
    );

    if (aliases.length === 0) {
      return res.status(404).json({
        error: '别名不存在或无权限访问'
      });
    }

    // 构建查询条件
    let whereClause = 'e.alias_id = ? AND ft.name = ?';
    let queryParams = [aliasId, folder];

    // 搜索条件
    if (search) {
      whereClause += ' AND (e.subject LIKE ? OR e.from_address LIKE ? OR e.body_text LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // 只显示未读邮件
    if (unread_only === 'true') {
      whereClause += ' AND e.is_read = FALSE';
    }

    // 获取邮件列表
    const emails = await query(
      `SELECT e.id, e.message_id, e.from_address, e.from_name,
              e.to_addresses, e.cc_addresses, e.subject,
              e.is_read, e.is_starred, e.is_important,
              e.size_bytes, e.received_at, e.created_at,
              ft.name as folder_name, ft.display_name as folder_display_name,
              COUNT(ea.id) as attachment_count
       FROM emails e
       JOIN folder_types ft ON e.folder_type_id = ft.id
       LEFT JOIN email_attachments ea ON e.id = ea.email_id
       WHERE ${whereClause}
       GROUP BY e.id
       ORDER BY e.received_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );

    // 获取总数
    const totalResult = await query(
      `SELECT COUNT(*) as total
       FROM emails e
       JOIN folder_types ft ON e.folder_type_id = ft.id
       WHERE ${whereClause}`,
      queryParams
    );

    // 获取文件夹统计
    const folderStats = await query(
      `SELECT ft.name, ft.display_name,
              COUNT(e.id) as total_count,
              COUNT(CASE WHEN e.is_read = FALSE THEN 1 END) as unread_count
       FROM folder_types ft
       LEFT JOIN emails e ON ft.id = e.folder_type_id AND e.alias_id = ?
       GROUP BY ft.id
       ORDER BY ft.id`,
      [aliasId]
    );

    res.json({
      emails,
      alias: aliases[0],
      folder_stats: folderStats,
      current_folder: folder,
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total: totalResult[0].total,
        total_pages: Math.ceil(totalResult[0].total / limit)
      }
    });
  } catch (error) {
    logger.error('获取邮件列表失败:', error);
    res.status(500).json({
      error: '获取邮件列表失败'
    });
  }
});

// 获取单个邮件详情
router.get('/:id', authenticateToken, idValidation, handleValidationErrors, async (req, res) => {
  try {
    const emailId = req.params.id;
    const userId = req.user.id;

    // 获取邮件详情（验证权限）
    const emails = await query(
      `SELECT e.*, ft.name as folder_name, ft.display_name as folder_display_name,
              a.local_part, d.domain_name,
              CONCAT(a.local_part, '@', d.domain_name) as alias_email
       FROM emails e
       JOIN folder_types ft ON e.folder_type_id = ft.id
       JOIN aliases a ON e.alias_id = a.id
       JOIN domains d ON a.domain_id = d.id
       WHERE e.id = ? AND a.user_id = ?`,
      [emailId, userId]
    );

    if (emails.length === 0) {
      return res.status(404).json({
        error: '邮件不存在或无权限访问'
      });
    }

    const email = emails[0];

    // 获取附件列表
    const attachments = await query(
      'SELECT id, original_filename, content_type, size_bytes FROM email_attachments WHERE email_id = ?',
      [emailId]
    );

    // 获取邮件标签
    const labels = await query(
      `SELECT el.id, el.name, el.color
       FROM email_labels el
       JOIN email_label_relations elr ON el.id = elr.label_id
       WHERE elr.email_id = ?`,
      [emailId]
    );

    // 标记为已读
    if (!email.is_read) {
      await query(
        'UPDATE emails SET is_read = TRUE WHERE id = ?',
        [emailId]
      );
      email.is_read = true;
    }

    res.json({
      email: {
        ...email,
        attachments,
        labels
      }
    });
  } catch (error) {
    logger.error('获取邮件详情失败:', error);
    res.status(500).json({
      error: '获取邮件详情失败'
    });
  }
});

// 发送邮件
router.post('/send', 
  authenticateToken, 
  upload.array('attachments', 10),
  emailValidation, 
  handleValidationErrors, 
  async (req, res) => {
    try {
      const {
        alias_id,
        to_addresses,
        cc_addresses = [],
        bcc_addresses = [],
        subject,
        body_text,
        body_html
      } = req.body;
      const userId = req.user.id;

      // 验证别名是否属于当前用户
      const aliases = await query(
        `SELECT a.id, a.local_part, d.domain_name,
                CONCAT(a.local_part, '@', d.domain_name) as full_email
         FROM aliases a
         JOIN domains d ON a.domain_id = d.id
         WHERE a.id = ? AND a.user_id = ? AND a.is_active = TRUE`,
        [alias_id, userId]
      );

      if (aliases.length === 0) {
        return res.status(404).json({
          error: '发件别名不存在或无权限使用'
        });
      }

      const fromAlias = aliases[0];

      await transaction(async (connection) => {
        // 生成消息ID
        const messageId = `<${Date.now()}.${Math.random().toString(36).substr(2, 9)}@${fromAlias.domain_name}>`;

        // 发送邮件
        const emailResult = await sendEmail({
          from: {
            address: fromAlias.full_email,
            name: fromAlias.display_name || fromAlias.local_part
          },
          to: to_addresses,
          cc: cc_addresses,
          bcc: bcc_addresses,
          subject,
          text: body_text,
          html: body_html,
          messageId,
          attachments: req.files
        });

        // 获取已发送文件夹ID
        const sentFolder = await connection.execute(
          'SELECT id FROM folder_types WHERE name = "sent"'
        );

        // 保存到数据库
        const emailInsertResult = await connection.execute(
          `INSERT INTO emails (
            message_id, alias_id, from_address, from_name,
            to_addresses, cc_addresses, bcc_addresses,
            subject, body_text, body_html, folder_type_id,
            is_read, size_bytes, received_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, NOW())`,
          [
            messageId,
            alias_id,
            fromAlias.full_email,
            fromAlias.display_name || null,
            JSON.stringify(to_addresses),
            cc_addresses.length > 0 ? JSON.stringify(cc_addresses) : null,
            bcc_addresses.length > 0 ? JSON.stringify(bcc_addresses) : null,
            subject,
            body_text || null,
            body_html || null,
            sentFolder[0][0].id,
            Buffer.byteLength(body_text || body_html || '', 'utf8')
          ]
        );

        const savedEmailId = emailInsertResult[0].insertId;

        // 保存附件信息
        if (req.files && req.files.length > 0) {
          for (const file of req.files) {
            await connection.execute(
              `INSERT INTO email_attachments (
                email_id, filename, original_filename, content_type, size_bytes, file_path
              ) VALUES (?, ?, ?, ?, ?, ?)`,
              [
                savedEmailId,
                file.filename,
                file.originalname,
                file.mimetype,
                file.size,
                file.path
              ]
            );
          }
        }

        return {
          email_id: savedEmailId,
          message_id: messageId
        };
      });

      logger.info(`用户 ${req.user.email} 从别名 ${fromAlias.full_email} 发送邮件: ${subject}`);

      res.status(201).json({
        message: '邮件发送成功',
        message_id: messageId
      });
    } catch (error) {
      // 清理上传的文件（如果发送失败）
      if (req.files) {
        for (const file of req.files) {
          try {
            await fs.unlink(file.path);
          } catch (cleanupError) {
            logger.error('清理上传文件失败:', cleanupError);
          }
        }
      }

      logger.error('发送邮件失败:', error);
      res.status(500).json({
        error: error.message || '发送邮件失败，请稍后重试'
      });
    }
  }
);

// 标记邮件已读/未读
router.patch('/:id/read', 
  authenticateToken, 
  idValidation,
  [
    body('is_read').isBoolean().withMessage('is_read必须是布尔值')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const emailId = req.params.id;
      const { is_read } = req.body;
      const userId = req.user.id;

      // 验证邮件权限
      const emails = await query(
        `SELECT e.id FROM emails e
         JOIN aliases a ON e.alias_id = a.id
         WHERE e.id = ? AND a.user_id = ?`,
        [emailId, userId]
      );

      if (emails.length === 0) {
        return res.status(404).json({
          error: '邮件不存在或无权限访问'
        });
      }

      // 更新已读状态
      await query(
        'UPDATE emails SET is_read = ? WHERE id = ?',
        [is_read, emailId]
      );

      res.json({
        message: `邮件已标记为${is_read ? '已读' : '未读'}`
      });
    } catch (error) {
      logger.error('更新邮件已读状态失败:', error);
      res.status(500).json({
        error: '更新失败'
      });
    }
  }
);

// 标记邮件星标
router.patch('/:id/star', 
  authenticateToken, 
  idValidation,
  [
    body('is_starred').isBoolean().withMessage('is_starred必须是布尔值')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const emailId = req.params.id;
      const { is_starred } = req.body;
      const userId = req.user.id;

      // 验证邮件权限
      const emails = await query(
        `SELECT e.id FROM emails e
         JOIN aliases a ON e.alias_id = a.id
         WHERE e.id = ? AND a.user_id = ?`,
        [emailId, userId]
      );

      if (emails.length === 0) {
        return res.status(404).json({
          error: '邮件不存在或无权限访问'
        });
      }

      // 更新星标状态
      await query(
        'UPDATE emails SET is_starred = ? WHERE id = ?',
        [is_starred, emailId]
      );

      res.json({
        message: `邮件星标已${is_starred ? '添加' : '移除'}`
      });
    } catch (error) {
      logger.error('更新邮件星标状态失败:', error);
      res.status(500).json({
        error: '更新失败'
      });
    }
  }
);

// 移动邮件到指定文件夹
router.patch('/:id/move', 
  authenticateToken, 
  idValidation,
  [
    body('folder_name')
      .isIn(['inbox', 'sent', 'draft', 'trash', 'spam', 'archive'])
      .withMessage('无效的文件夹名称')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const emailId = req.params.id;
      const { folder_name } = req.body;
      const userId = req.user.id;

      // 验证邮件权限
      const emails = await query(
        `SELECT e.id FROM emails e
         JOIN aliases a ON e.alias_id = a.id
         WHERE e.id = ? AND a.user_id = ?`,
        [emailId, userId]
      );

      if (emails.length === 0) {
        return res.status(404).json({
          error: '邮件不存在或无权限访问'
        });
      }

      // 获取目标文件夹ID
      const folders = await query(
        'SELECT id, display_name FROM folder_types WHERE name = ?',
        [folder_name]
      );

      // 更新邮件文件夹
      await query(
        'UPDATE emails SET folder_type_id = ? WHERE id = ?',
        [folders[0].id, emailId]
      );

      res.json({
        message: `邮件已移动到${folders[0].display_name}`
      });
    } catch (error) {
      logger.error('移动邮件失败:', error);
      res.status(500).json({
        error: '移动邮件失败'
      });
    }
  }
);

// 批量操作邮件
router.patch('/batch', 
  authenticateToken,
  [
    body('email_ids').isArray({ min: 1 }).withMessage('邮件ID列表不能为空'),
    body('email_ids.*').isInt({ min: 1 }).withMessage('邮件ID必须是正整数'),
    body('action')
      .isIn(['mark_read', 'mark_unread', 'star', 'unstar', 'move', 'delete'])
      .withMessage('无效的操作类型'),
    body('folder_name')
      .optional()
      .isIn(['inbox', 'sent', 'draft', 'trash', 'spam', 'archive'])
      .withMessage('无效的文件夹名称')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email_ids, action, folder_name } = req.body;
      const userId = req.user.id;

      // 验证所有邮件都属于当前用户
      const placeholders = email_ids.map(() => '?').join(',');
      const emails = await query(
        `SELECT e.id FROM emails e
         JOIN aliases a ON e.alias_id = a.id
         WHERE e.id IN (${placeholders}) AND a.user_id = ?`,
        [...email_ids, userId]
      );

      if (emails.length !== email_ids.length) {
        return res.status(400).json({
          error: '部分邮件不存在或无权限访问'
        });
      }

      let updateQuery = '';
      let updateParams = [];

      // 根据操作类型构建更新语句
      switch (action) {
        case 'mark_read':
          updateQuery = `UPDATE emails SET is_read = TRUE WHERE id IN (${placeholders})`;
          updateParams = email_ids;
          break;
        case 'mark_unread':
          updateQuery = `UPDATE emails SET is_read = FALSE WHERE id IN (${placeholders})`;
          updateParams = email_ids;
          break;
        case 'star':
          updateQuery = `UPDATE emails SET is_starred = TRUE WHERE id IN (${placeholders})`;
          updateParams = email_ids;
          break;
        case 'unstar':
          updateQuery = `UPDATE emails SET is_starred = FALSE WHERE id IN (${placeholders})`;
          updateParams = email_ids;
          break;
        case 'move':
          if (!folder_name) {
            return res.status(400).json({ error: '移动操作需要指定目标文件夹' });
          }
          const folders = await query('SELECT id FROM folder_types WHERE name = ?', [folder_name]);
          updateQuery = `UPDATE emails SET folder_type_id = ? WHERE id IN (${placeholders})`;
          updateParams = [folders[0].id, ...email_ids];
          break;
        case 'delete':
          const trashFolder = await query('SELECT id FROM folder_types WHERE name = "trash"');
          updateQuery = `UPDATE emails SET folder_type_id = ? WHERE id IN (${placeholders})`;
          updateParams = [trashFolder[0].id, ...email_ids];
          break;
      }

      // 执行批量更新
      await query(updateQuery, updateParams);

      logger.info(`用户 ${req.user.email} 批量操作邮件: ${action}, 邮件数量: ${email_ids.length}`);

      res.json({
        message: `批量操作完成，处理了 ${email_ids.length} 封邮件`,
        processed_count: email_ids.length
      });
    } catch (error) {
      logger.error('批量操作邮件失败:', error);
      res.status(500).json({
        error: '批量操作失败'
      });
    }
  }
);

// 下载附件
router.get('/attachment/:id', authenticateToken, async (req, res) => {
  try {
    const attachmentId = req.params.id;
    const userId = req.user.id;

    // 验证附件权限
    const attachments = await query(
      `SELECT ea.*, e.id as email_id
       FROM email_attachments ea
       JOIN emails e ON ea.email_id = e.id
       JOIN aliases a ON e.alias_id = a.id
       WHERE ea.id = ? AND a.user_id = ?`,
      [attachmentId, userId]
    );

    if (attachments.length === 0) {
      return res.status(404).json({
        error: '附件不存在或无权限访问'
      });
    }

    const attachment = attachments[0];

    // 检查文件是否存在
    try {
      await fs.access(attachment.file_path);
    } catch (error) {
      return res.status(404).json({
        error: '附件文件不存在'
      });
    }

    // 设置响应头
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.original_filename}"`);
    res.setHeader('Content-Type', attachment.content_type);
    res.setHeader('Content-Length', attachment.size_bytes);

    // 发送文件
    res.sendFile(path.resolve(attachment.file_path));
  } catch (error) {
    logger.error('下载附件失败:', error);
    res.status(500).json({
      error: '下载附件失败'
    });
  }
});

module.exports = router;