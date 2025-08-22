-- 企业邮件系统数据库架构设计
-- 支持多域名、多别名的邮件收发系统

-- 域名表
CREATE TABLE domains (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    domain_name VARCHAR(255) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_domain_name (domain_name),
    INDEX idx_is_active (is_active)
);

-- 用户表
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    INDEX idx_email (email),
    INDEX idx_username (username),
    INDEX idx_is_active (is_active)
);

-- 别名表
CREATE TABLE aliases (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    domain_id BIGINT NOT NULL,
    local_part VARCHAR(100) NOT NULL, -- 邮箱本地部分，如user@domain.com中的user
    display_name VARCHAR(255) NULL,   -- 显示名称
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
    UNIQUE KEY unique_alias (local_part, domain_id),
    INDEX idx_user_id (user_id),
    INDEX idx_domain_id (domain_id),
    INDEX idx_is_active (is_active)
);

-- 邮件文件夹类型枚举
CREATE TABLE folder_types (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL
);

INSERT INTO folder_types (name, display_name) VALUES 
('inbox', '收件箱'),
('sent', '已发送'),
('draft', '草稿箱'),
('trash', '回收站'),
('spam', '垃圾邮件'),
('archive', '归档');

-- 邮件表
CREATE TABLE emails (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    message_id VARCHAR(255) NOT NULL UNIQUE,  -- RFC 2822 Message-ID
    alias_id BIGINT NOT NULL,                 -- 收件人别名ID
    from_address VARCHAR(255) NOT NULL,       -- 发件人完整邮箱地址
    from_name VARCHAR(255) NULL,              -- 发件人显示名称
    to_addresses JSON NOT NULL,               -- 收件人列表（JSON格式）
    cc_addresses JSON NULL,                   -- 抄送列表
    bcc_addresses JSON NULL,                  -- 密送列表
    subject VARCHAR(500) NOT NULL,            -- 邮件主题
    body_text LONGTEXT NULL,                  -- 纯文本内容
    body_html LONGTEXT NULL,                  -- HTML内容
    folder_type_id INT NOT NULL DEFAULT 1,   -- 文件夹类型
    is_read BOOLEAN DEFAULT FALSE,            -- 是否已读
    is_starred BOOLEAN DEFAULT FALSE,         -- 是否星标
    is_important BOOLEAN DEFAULT FALSE,       -- 是否重要
    size_bytes INT DEFAULT 0,                 -- 邮件大小
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (alias_id) REFERENCES aliases(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_type_id) REFERENCES folder_types(id),
    INDEX idx_alias_id (alias_id),
    INDEX idx_message_id (message_id),
    INDEX idx_from_address (from_address),
    INDEX idx_subject (subject),
    INDEX idx_folder_type_id (folder_type_id),
    INDEX idx_is_read (is_read),
    INDEX idx_received_at (received_at),
    FULLTEXT INDEX ft_subject_body (subject, body_text, body_html)
);

-- 邮件附件表
CREATE TABLE email_attachments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    email_id BIGINT NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size_bytes INT NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE,
    INDEX idx_email_id (email_id),
    INDEX idx_filename (filename)
);

-- 邮件标签表
CREATE TABLE email_labels (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL UNIQUE,
    color VARCHAR(7) NOT NULL DEFAULT '#007bff', -- 十六进制颜色值
    user_id BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
);

-- 邮件标签关联表
CREATE TABLE email_label_relations (
    email_id BIGINT NOT NULL,
    label_id INT NOT NULL,
    PRIMARY KEY (email_id, label_id),
    FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE,
    FOREIGN KEY (label_id) REFERENCES email_labels(id) ON DELETE CASCADE
);

-- 用户会话表（用于JWT令牌管理）
CREATE TABLE user_sessions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_token_hash (token_hash),
    INDEX idx_expires_at (expires_at)
);

-- 系统配置表
CREATE TABLE system_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    description TEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_setting_key (setting_key)
);

-- 插入默认系统配置
INSERT INTO system_settings (setting_key, setting_value, description) VALUES 
('max_attachment_size', '10485760', '最大附件大小（字节）'),
('max_mailbox_size', '1073741824', '最大邮箱大小（字节）'),
('smtp_host', 'localhost', 'SMTP服务器地址'),
('smtp_port', '587', 'SMTP服务器端口'),
('imap_host', 'localhost', 'IMAP服务器地址'),
('imap_port', '993', 'IMAP服务器端口');

-- 创建视图：完整的别名信息（包含域名）
CREATE VIEW v_aliases_with_domain AS
SELECT 
    a.id,
    a.user_id,
    a.local_part,
    d.domain_name,
    CONCAT(a.local_part, '@', d.domain_name) as full_email,
    a.display_name,
    a.is_active,
    a.created_at,
    a.updated_at
FROM aliases a
JOIN domains d ON a.domain_id = d.id;

-- 创建视图：用户的所有别名统计
CREATE VIEW v_user_alias_stats AS
SELECT 
    u.id as user_id,
    u.username,
    u.email,
    COUNT(a.id) as alias_count,
    COUNT(CASE WHEN a.is_active = TRUE THEN 1 END) as active_alias_count
FROM users u
LEFT JOIN aliases a ON u.id = a.user_id
GROUP BY u.id, u.username, u.email;

-- 创建视图：别名邮件统计
CREATE VIEW v_alias_email_stats AS
SELECT 
    a.id as alias_id,
    CONCAT(a.local_part, '@', d.domain_name) as full_email,
    COUNT(e.id) as total_emails,
    COUNT(CASE WHEN e.is_read = FALSE THEN 1 END) as unread_emails,
    COUNT(CASE WHEN ft.name = 'inbox' THEN 1 END) as inbox_emails,
    MAX(e.received_at) as last_email_at
FROM aliases a
JOIN domains d ON a.domain_id = d.id
LEFT JOIN emails e ON a.id = e.alias_id
LEFT JOIN folder_types ft ON e.folder_type_id = ft.id
GROUP BY a.id, a.local_part, d.domain_name;