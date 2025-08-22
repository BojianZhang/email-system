const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const Imap = require('imap');
const { query } = require('../config/database');
const logger = require('./logger');

// 创建SMTP传输器
const createTransporter = () => {
  return nodemailer.createTransporter({
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
};

// 发送邮件
const sendEmail = async (mailOptions) => {
  try {
    const transporter = createTransporter();
    
    // 准备邮件选项
    const emailOptions = {
      from: `"${mailOptions.from.name || ''}" <${mailOptions.from.address}>`,
      to: Array.isArray(mailOptions.to) ? mailOptions.to.join(', ') : mailOptions.to,
      cc: mailOptions.cc && mailOptions.cc.length > 0 ? mailOptions.cc.join(', ') : undefined,
      bcc: mailOptions.bcc && mailOptions.bcc.length > 0 ? mailOptions.bcc.join(', ') : undefined,
      subject: mailOptions.subject,
      text: mailOptions.text,
      html: mailOptions.html,
      messageId: mailOptions.messageId,
      attachments: mailOptions.attachments ? mailOptions.attachments.map(file => ({
        filename: file.originalname,
        path: file.path,
        contentType: file.mimetype
      })) : undefined
    };

    const result = await transporter.sendMail(emailOptions);
    logger.info(`邮件发送成功: ${result.messageId}`);
    return result;
  } catch (error) {
    logger.error('发送邮件失败:', error);
    throw new Error(`发送邮件失败: ${error.message}`);
  }
};

// 解析邮件内容
const parseEmail = async (rawEmail) => {
  try {
    const parsed = await simpleParser(rawEmail);
    
    return {
      messageId: parsed.messageId,
      from: {
        address: parsed.from?.value?.[0]?.address || '',
        name: parsed.from?.value?.[0]?.name || ''
      },
      to: parsed.to?.value?.map(addr => addr.address) || [],
      cc: parsed.cc?.value?.map(addr => addr.address) || [],
      bcc: parsed.bcc?.value?.map(addr => addr.address) || [],
      subject: parsed.subject || '',
      text: parsed.text || '',
      html: parsed.html || '',
      date: parsed.date,
      attachments: parsed.attachments || []
    };
  } catch (error) {
    logger.error('解析邮件失败:', error);
    throw new Error(`解析邮件失败: ${error.message}`);
  }
};

// 创建IMAP连接
const createImapConnection = (aliasEmail) => {
  return new Imap({
    user: aliasEmail,
    password: process.env.IMAP_PASS || '',
    host: process.env.IMAP_HOST || 'localhost',
    port: parseInt(process.env.IMAP_PORT) || 993,
    tls: process.env.IMAP_SECURE !== 'false',
    tlsOptions: {
      rejectUnauthorized: false
    }
  });
};

// 获取新邮件
const fetchNewEmails = async (aliasId, aliasEmail) => {
  return new Promise((resolve, reject) => {
    const imap = createImapConnection(aliasEmail);
    const newEmails = [];

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          reject(err);
          return;
        }

        // 搜索未读邮件
        imap.search(['UNSEEN'], (err, results) => {
          if (err) {
            reject(err);
            return;
          }

          if (!results || results.length === 0) {
            imap.end();
            resolve([]);
            return;
          }

          const fetch = imap.fetch(results, { bodies: '' });

          fetch.on('message', (msg, seqno) => {
            let emailData = '';

            msg.on('body', (stream) => {
              stream.on('data', (chunk) => {
                emailData += chunk.toString('utf8');
              });
            });

            msg.once('end', async () => {
              try {
                const parsed = await parseEmail(emailData);
                newEmails.push({
                  alias_id: aliasId,
                  ...parsed
                });
              } catch (error) {
                logger.error('解析邮件失败:', error);
              }
            });
          });

          fetch.once('error', (err) => {
            logger.error('获取邮件失败:', err);
            reject(err);
          });

          fetch.once('end', () => {
            imap.end();
            resolve(newEmails);
          });
        });
      });
    });

    imap.once('error', (err) => {
      logger.error('IMAP连接失败:', err);
      reject(err);
    });

    imap.connect();
  });
};

// 保存邮件到数据库
const saveEmailToDatabase = async (emailData) => {
  try {
    // 获取收件箱文件夹ID
    const inboxFolder = await query(
      'SELECT id FROM folder_types WHERE name = "inbox"'
    );

    // 检查邮件是否已存在
    if (emailData.messageId) {
      const existingEmail = await query(
        'SELECT id FROM emails WHERE message_id = ?',
        [emailData.messageId]
      );

      if (existingEmail.length > 0) {
        logger.info(`邮件已存在，跳过保存: ${emailData.messageId}`);
        return null;
      }
    }

    // 计算邮件大小
    const emailSize = Buffer.byteLength((emailData.text || '') + (emailData.html || ''), 'utf8');

    // 插入邮件记录
    const result = await query(
      `INSERT INTO emails (
        message_id, alias_id, from_address, from_name,
        to_addresses, cc_addresses, subject,
        body_text, body_html, folder_type_id,
        size_bytes, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        emailData.messageId || `<${Date.now()}.${Math.random().toString(36).substr(2, 9)}@unknown>`,
        emailData.alias_id,
        emailData.from.address,
        emailData.from.name || null,
        JSON.stringify(emailData.to),
        emailData.cc.length > 0 ? JSON.stringify(emailData.cc) : null,
        emailData.subject,
        emailData.text || null,
        emailData.html || null,
        inboxFolder[0].id,
        emailSize,
        emailData.date || new Date()
      ]
    );

    const emailId = result.insertId;

    // 保存附件信息（如果有）
    if (emailData.attachments && emailData.attachments.length > 0) {
      for (const attachment of emailData.attachments) {
        // 这里需要实际保存附件文件并记录路径
        // 简化实现，实际项目中需要完整的文件处理逻辑
        await query(
          `INSERT INTO email_attachments (
            email_id, filename, original_filename, content_type, size_bytes, file_path
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            emailId,
            attachment.filename || 'attachment',
            attachment.filename || 'attachment',
            attachment.contentType || 'application/octet-stream',
            attachment.size || 0,
            `/tmp/attachments/${emailId}_${attachment.filename || 'attachment'}`
          ]
        );
      }
    }

    logger.info(`新邮件已保存: ${emailData.subject} (ID: ${emailId})`);
    return emailId;
  } catch (error) {
    logger.error('保存邮件到数据库失败:', error);
    throw error;
  }
};

// 同步指定别名的邮件
const syncEmailsForAlias = async (aliasId) => {
  try {
    // 获取别名信息
    const aliases = await query(
      `SELECT a.id, a.local_part, d.domain_name,
              CONCAT(a.local_part, '@', d.domain_name) as full_email
       FROM aliases a
       JOIN domains d ON a.domain_id = d.id
       WHERE a.id = ? AND a.is_active = TRUE`,
      [aliasId]
    );

    if (aliases.length === 0) {
      throw new Error(`别名不存在或未激活: ${aliasId}`);
    }

    const alias = aliases[0];
    logger.info(`开始同步别名邮件: ${alias.full_email}`);

    // 获取新邮件
    const newEmails = await fetchNewEmails(aliasId, alias.full_email);
    
    let savedCount = 0;
    for (const emailData of newEmails) {
      try {
        const emailId = await saveEmailToDatabase(emailData);
        if (emailId) savedCount++;
      } catch (error) {
        logger.error(`保存邮件失败:`, error);
      }
    }

    logger.info(`别名 ${alias.full_email} 同步完成，新邮件数量: ${savedCount}`);
    return savedCount;
  } catch (error) {
    logger.error(`同步别名邮件失败:`, error);
    throw error;
  }
};

// 同步所有活跃别名的邮件
const syncAllEmails = async () => {
  try {
    logger.info('开始同步所有邮件');

    // 获取所有活跃的别名
    const aliases = await query(
      `SELECT a.id FROM aliases a
       JOIN domains d ON a.domain_id = d.id
       WHERE a.is_active = TRUE AND d.is_active = TRUE`
    );

    let totalSynced = 0;
    for (const alias of aliases) {
      try {
        const count = await syncEmailsForAlias(alias.id);
        totalSynced += count;
      } catch (error) {
        logger.error(`同步别名 ${alias.id} 失败:`, error);
      }
    }

    logger.info(`邮件同步完成，总计新邮件: ${totalSynced}`);
    return totalSynced;
  } catch (error) {
    logger.error('同步所有邮件失败:', error);
    throw error;
  }
};

// 验证邮箱地址格式
const validateEmailAddress = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// 清理HTML内容（防止XSS）
const sanitizeHtml = (html) => {
  // 简单的HTML清理，实际项目中建议使用专门的库如DOMPurify
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '');
};

module.exports = {
  sendEmail,
  parseEmail,
  fetchNewEmails,
  saveEmailToDatabase,
  syncEmailsForAlias,
  syncAllEmails,
  validateEmailAddress,
  sanitizeHtml
};