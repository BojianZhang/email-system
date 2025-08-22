const nodemailer = require('nodemailer');
const { query } = require('../config/database');
const logger = require('./logger');

// 安全警报通知服务
class SecurityNotificationService {
  constructor() {
    this.emailTransporter = null;
    this.initializeEmailTransporter();
    this.alertQueue = [];
    this.isProcessing = false;
  }

  // 初始化邮件发送器
  initializeEmailTransporter() {
    try {
      this.emailTransporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        } : null,
        tls: {
          rejectUnauthorized: false
        }
      });
    } catch (error) {
      logger.error('初始化邮件发送器失败:', error);
    }
  }

  // 创建安全警报
  async createSecurityAlert(alertData) {
    try {
      const {
        userId,
        alertType,
        severity,
        title,
        description,
        data
      } = alertData;

      // 插入警报记录
      const result = await query(
        `INSERT INTO security_alerts (
          user_id, alert_type, severity, title, description, alert_data
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId,
          alertType,
          severity,
          title,
          description,
          JSON.stringify(data)
        ]
      );

      const alertId = result.insertId;

      // 检查是否需要发送通知
      const shouldNotify = await this.shouldSendNotification(alertType, severity);
      
      if (shouldNotify) {
        // 添加到通知队列
        this.alertQueue.push({
          alertId,
          ...alertData
        });
        
        // 处理通知队列
        this.processNotificationQueue();
      }

      logger.info(`创建安全警报: ${alertType} - ${title} (用户ID: ${userId})`);
      return alertId;
    } catch (error) {
      logger.error('创建安全警报失败:', error);
      throw error;
    }
  }

  // 检查是否应该发送通知
  async shouldSendNotification(alertType, severity) {
    try {
      // 获取通知配置
      const settings = await query(
        'SELECT setting_value FROM security_settings WHERE setting_key = "alert_administrators"'
      );

      if (settings.length === 0 || settings[0].setting_value !== 'true') {
        return false;
      }

      // 根据严重程度决定是否通知
      const severityThresholds = {
        'low': false,
        'medium': true,
        'high': true,
        'critical': true
      };

      return severityThresholds[severity] || false;
    } catch (error) {
      logger.error('检查通知配置失败:', error);
      return false;
    }
  }

  // 处理通知队列
  async processNotificationQueue() {
    if (this.isProcessing || this.alertQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.alertQueue.length > 0) {
        const alert = this.alertQueue.shift();
        await this.sendNotifications(alert);
        
        // 避免发送过于频繁
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      logger.error('处理通知队列失败:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  // 发送通知
  async sendNotifications(alert) {
    try {
      // 获取管理员列表
      const administrators = await this.getAdministrators();
      
      if (administrators.length === 0) {
        logger.warn('没有找到管理员，无法发送安全警报通知');
        return;
      }

      // 获取用户信息
      const userInfo = await this.getUserInfo(alert.userId);
      
      // 发送邮件通知
      await this.sendEmailNotifications(administrators, alert, userInfo);
      
      // 记录通知日志
      logger.info(`安全警报通知已发送给 ${administrators.length} 个管理员`);
    } catch (error) {
      logger.error('发送通知失败:', error);
    }
  }

  // 获取管理员列表
  async getAdministrators() {
    try {
      const admins = await query(
        'SELECT id, username, email FROM users WHERE is_admin = TRUE AND is_active = TRUE'
      );
      return admins;
    } catch (error) {
      logger.error('获取管理员列表失败:', error);
      return [];
    }
  }

  // 获取用户信息
  async getUserInfo(userId) {
    try {
      const users = await query(
        'SELECT id, username, email, created_at FROM users WHERE id = ?',
        [userId]
      );
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      logger.error('获取用户信息失败:', error);
      return null;
    }
  }

  // 发送邮件通知
  async sendEmailNotifications(administrators, alert, userInfo) {
    if (!this.emailTransporter) {
      logger.warn('邮件发送器未初始化，跳过邮件通知');
      return;
    }

    try {
      // 获取邮件模板
      const template = await this.getEmailTemplate();
      
      // 准备邮件内容
      const emailContent = this.prepareEmailContent(template, alert, userInfo);
      
      // 发送给每个管理员
      for (const admin of administrators) {
        try {
          await this.emailTransporter.sendMail({
            from: process.env.SMTP_USER || 'security@yourdomain.com',
            to: admin.email,
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text
          });
          
          logger.info(`安全警报邮件已发送给管理员: ${admin.email}`);
        } catch (error) {
          logger.error(`发送邮件给管理员 ${admin.email} 失败:`, error);
        }
      }
    } catch (error) {
      logger.error('发送邮件通知失败:', error);
    }
  }

  // 获取邮件模板
  async getEmailTemplate() {
    try {
      const templates = await query(
        'SELECT setting_value FROM security_settings WHERE setting_key = "alert_email_template"'
      );
      
      if (templates.length > 0) {
        return JSON.parse(templates[0].setting_value);
      }
      
      // 默认模板
      return {
        subject: '安全警报：{alert_type}',
        body: '检测到用户 {username} 的异常登录行为'
      };
    } catch (error) {
      logger.error('获取邮件模板失败:', error);
      return {
        subject: '安全警报：{alert_type}',
        body: '检测到用户 {username} 的异常登录行为'
      };
    }
  }

  // 准备邮件内容
  prepareEmailContent(template, alert, userInfo) {
    const variables = {
      alert_type: this.getAlertTypeDisplayName(alert.alertType),
      username: userInfo?.username || 'Unknown',
      user_email: userInfo?.email || 'Unknown',
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
      timestamp: new Date().toLocaleString('zh-CN'),
      alert_data: JSON.stringify(alert.data, null, 2)
    };

    // 替换模板变量
    let subject = template.subject;
    let body = template.body;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`;
      subject = subject.replace(new RegExp(placeholder, 'g'), value);
      body = body.replace(new RegExp(placeholder, 'g'), value);
    }

    // 生成HTML和纯文本版本
    const html = this.generateEmailHTML(subject, alert, userInfo, variables);
    const text = this.generateEmailText(alert, userInfo, variables);

    return { subject, html, text };
  }

  // 生成HTML邮件内容
  generateEmailHTML(subject, alert, userInfo, variables) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${subject}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .alert-${alert.severity} { border-left: 4px solid ${this.getSeverityColor(alert.severity)}; padding-left: 15px; }
        .severity { color: ${this.getSeverityColor(alert.severity)}; font-weight: bold; text-transform: uppercase; }
        .details { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header alert-${alert.severity}">
            <h2>🚨 安全警报通知</h2>
            <p><strong>警报类型:</strong> ${this.getAlertTypeDisplayName(alert.alertType)}</p>
            <p><strong>严重程度:</strong> <span class="severity">${alert.severity}</span></p>
            <p><strong>时间:</strong> ${variables.timestamp}</p>
        </div>
        
        <div class="content">
            <h3>${alert.title}</h3>
            <p>${alert.description}</p>
            
            <div class="details">
                <h4>👤 用户信息</h4>
                <p><strong>用户名:</strong> ${userInfo?.username || 'Unknown'}</p>
                <p><strong>邮箱:</strong> ${userInfo?.email || 'Unknown'}</p>
                <p><strong>注册时间:</strong> ${userInfo?.created_at ? new Date(userInfo.created_at).toLocaleString('zh-CN') : 'Unknown'}</p>
            </div>
            
            ${alert.data ? `
            <div class="details">
                <h4>📊 详细信息</h4>
                <pre style="background: #f1f1f1; padding: 10px; border-radius: 3px; overflow-x: auto;">${JSON.stringify(alert.data, null, 2)}</pre>
            </div>
            ` : ''}
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/security" class="btn">
                    查看安全控制台
                </a>
            </div>
        </div>
        
        <div class="footer">
            <p>此邮件由企业邮件系统安全监控自动发送。</p>
            <p>如需帮助，请联系系统管理员。</p>
        </div>
    </div>
</body>
</html>
    `;
  }

  // 生成纯文本邮件内容
  generateEmailText(alert, userInfo, variables) {
    return `
🚨 安全警报通知

警报类型: ${this.getAlertTypeDisplayName(alert.alertType)}
严重程度: ${alert.severity.toUpperCase()}
时间: ${variables.timestamp}

${alert.title}
${alert.description}

👤 用户信息:
- 用户名: ${userInfo?.username || 'Unknown'}
- 邮箱: ${userInfo?.email || 'Unknown'}
- 注册时间: ${userInfo?.created_at ? new Date(userInfo.created_at).toLocaleString('zh-CN') : 'Unknown'}

${alert.data ? `📊 详细信息:\n${JSON.stringify(alert.data, null, 2)}` : ''}

请登录管理控制台查看详情: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/security

---
此邮件由企业邮件系统安全监控自动发送。
如需帮助，请联系系统管理员。
    `;
  }

  // 获取警报类型显示名称
  getAlertTypeDisplayName(alertType) {
    const displayNames = {
      'login_anomaly': '登录异常',
      'multiple_locations': '多地登录',
      'suspicious_ip': '可疑IP地址',
      'brute_force': '暴力破解尝试',
      'new_device': '新设备登录',
      'time_anomaly': '异常时间登录',
      'concurrent_sessions': '并发会话异常',
      'geographic_anomaly': '地理位置异常',
      'ip_reputation': 'IP信誉异常',
      'login_frequency': '登录频率异常'
    };
    
    return displayNames[alertType] || alertType;
  }

  // 获取严重程度颜色
  getSeverityColor(severity) {
    const colors = {
      'low': '#28a745',
      'medium': '#ffc107',
      'high': '#fd7e14',
      'critical': '#dc3545'
    };
    
    return colors[severity] || '#6c757d';
  }

  // 创建登录异常警报
  async createLoginAnomalyAlert(userId, anomalyData) {
    const { totalRiskScore, anomalies, suspiciousReasons, locationInfo, deviceInfo } = anomalyData;
    
    let severity = 'low';
    if (totalRiskScore >= 80) severity = 'critical';
    else if (totalRiskScore >= 60) severity = 'high';
    else if (totalRiskScore >= 40) severity = 'medium';

    const title = `检测到用户登录异常 (风险分数: ${totalRiskScore})`;
    const description = `用户登录行为存在以下异常:\n${suspiciousReasons.join('\n')}`;

    return await this.createSecurityAlert({
      userId,
      alertType: 'login_anomaly',
      severity,
      title,
      description,
      data: {
        riskScore: totalRiskScore,
        anomalies,
        location: locationInfo,
        device: deviceInfo,
        timestamp: new Date().toISOString()
      }
    });
  }

  // 标记警报为已解决
  async resolveAlert(alertId, resolvedBy, resolutionNotes) {
    try {
      await query(
        'UPDATE security_alerts SET is_resolved = TRUE, resolved_by = ?, resolved_at = NOW(), resolution_notes = ? WHERE id = ?',
        [resolvedBy, resolutionNotes, alertId]
      );
      
      logger.info(`安全警报 ${alertId} 已被用户 ${resolvedBy} 标记为已解决`);
    } catch (error) {
      logger.error('标记警报为已解决失败:', error);
      throw error;
    }
  }

  // 获取未解决的警报
  async getUnresolvedAlerts(limit = 50) {
    try {
      const alerts = await query(
        `SELECT sa.*, u.username, u.email 
         FROM security_alerts sa
         JOIN users u ON sa.user_id = u.id
         WHERE sa.is_resolved = FALSE
         ORDER BY sa.created_at DESC
         LIMIT ?`,
        [limit]
      );
      
      return alerts.map(alert => ({
        ...alert,
        alert_data: JSON.parse(alert.alert_data || '{}')
      }));
    } catch (error) {
      logger.error('获取未解决警报失败:', error);
      return [];
    }
  }

  // 获取警报统计
  async getAlertStatistics(days = 30) {
    try {
      const stats = await query(
        `SELECT 
           alert_type,
           severity,
           COUNT(*) as total_count,
           COUNT(CASE WHEN is_resolved = FALSE THEN 1 END) as unresolved_count,
           MAX(created_at) as latest_alert
         FROM security_alerts
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY alert_type, severity
         ORDER BY total_count DESC`,
        [days]
      );
      
      return stats;
    } catch (error) {
      logger.error('获取警报统计失败:', error);
      return [];
    }
  }
}

// 导出单例实例
const securityNotificationService = new SecurityNotificationService();

module.exports = {
  SecurityNotificationService,
  securityNotificationService
};