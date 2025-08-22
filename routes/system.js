const express = require('express');
const router = express.Router();

const { triggerEmailSync } = require('../utils/scheduler');
const { authenticateToken, requireAdmin } = require('../utils/auth');
const logger = require('../utils/logger');

// 手动触发邮件同步（仅管理员）
router.post('/sync-emails', authenticateToken, requireAdmin, async (req, res) => {
  try {
    logger.info(`管理员 ${req.user.email} 手动触发邮件同步`);
    
    const result = await triggerEmailSync();
    
    if (result.success) {
      res.json({
        message: '邮件同步完成',
        synced_count: result.syncedCount
      });
    } else {
      res.status(500).json({
        error: '邮件同步失败',
        details: result.error
      });
    }
  } catch (error) {
    logger.error('手动邮件同步API失败:', error);
    res.status(500).json({
      error: '邮件同步失败'
    });
  }
});

// 获取系统状态
router.get('/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 这里可以添加系统状态检查逻辑
    // 比如数据库连接状态、SMTP/IMAP服务状态等
    
    res.json({
      status: 'running',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        smtp: 'available',
        imap: 'available',
        scheduler: 'running'
      }
    });
  } catch (error) {
    logger.error('获取系统状态失败:', error);
    res.status(500).json({
      error: '获取系统状态失败'
    });
  }
});

module.exports = router;