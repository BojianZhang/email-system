const cron = require('node-cron');
const { syncAllEmails, cleanupExpiredSessions } = require('./email');
const { cleanupExpiredSessions: cleanupAuth } = require('./auth');
const logger = require('./logger');

// 邮件同步任务 - 每5分钟执行一次
cron.schedule('*/5 * * * *', async () => {
  try {
    logger.info('开始执行邮件同步任务');
    const syncedCount = await syncAllEmails();
    logger.info(`邮件同步任务完成，同步了 ${syncedCount} 封新邮件`);
  } catch (error) {
    logger.error('邮件同步任务失败:', error);
  }
});

// 清理过期会话 - 每天凌晨2点执行
cron.schedule('0 2 * * *', async () => {
  try {
    logger.info('开始执行会话清理任务');
    await cleanupAuth();
    logger.info('会话清理任务完成');
  } catch (error) {
    logger.error('会话清理任务失败:', error);
  }
});

// 邮件统计任务 - 每天凌晨3点执行
cron.schedule('0 3 * * *', async () => {
  try {
    logger.info('开始执行邮件统计任务');
    // 这里可以添加邮件统计逻辑
    // 比如计算用户邮件使用量、生成报表等
    logger.info('邮件统计任务完成');
  } catch (error) {
    logger.error('邮件统计任务失败:', error);
  }
});

// 数据库优化任务 - 每周日凌晨4点执行
cron.schedule('0 4 * * 0', async () => {
  try {
    logger.info('开始执行数据库优化任务');
    // 这里可以添加数据库优化逻辑
    // 比如清理日志表、优化索引等
    logger.info('数据库优化任务完成');
  } catch (error) {
    logger.error('数据库优化任务失败:', error);
  }
});

logger.info('定时任务调度器已启动');

module.exports = {
  // 手动触发邮件同步
  triggerEmailSync: async () => {
    try {
      const syncedCount = await syncAllEmails();
      return { success: true, syncedCount };
    } catch (error) {
      logger.error('手动邮件同步失败:', error);
      return { success: false, error: error.message };
    }
  }
};