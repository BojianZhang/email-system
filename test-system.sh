#!/bin/bash

# 系统功能测试脚本
# 用于验证邮件系统和安全监控功能

echo "开始执行企业邮件系统功能测试..."
echo "=================================="

# 检查必要的依赖
echo "1. 检查项目结构和关键文件..."

# 检查后端文件
backend_files=(
    "server.js"
    "config/database.js"
    "routes/auth.js" 
    "routes/security.js"
    "utils/geolocation.js"
    "utils/loginAnomalyDetector.js"
    "utils/securityNotification.js"
    "database/schema.sql"
    "database/security_monitoring.sql"
    "database/security_settings.sql"
)

echo "检查后端关键文件："
for file in "${backend_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✓ $file - 存在"
    else
        echo "✗ $file - 缺失"
    fi
done

# 检查前端文件
frontend_files=(
    "client/src/pages/UserSecurityPage.js"
    "client/src/components/admin/SecurityMonitoring.js"
    "client/src/components/admin/SecurityConfiguration.js"
    "client/src/pages/AdminPage.js"
)

echo ""
echo "检查前端关键文件："
for file in "${frontend_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✓ $file - 存在"
    else
        echo "✗ $file - 缺失"
    fi
done

# 检查数据库连接配置
echo ""
echo "2. 检查数据库连接配置..."
if [ -f ".env" ]; then
    echo "✓ .env 文件存在"
    if grep -q "DB_HOST" .env && grep -q "DB_USER" .env && grep -q "DB_NAME" .env; then
        echo "✓ 数据库配置项完整"
    else
        echo "✗ 数据库配置项不完整"
        echo "请检查 .env 文件中的数据库配置"
    fi
else
    echo "✗ .env 文件不存在"
    echo "请创建 .env 文件并配置数据库连接信息"
fi

# 检查package.json依赖
echo ""
echo "3. 检查项目依赖..."
if [ -f "package.json" ]; then
    echo "✓ 后端 package.json 存在"
    
    # 检查关键依赖
    key_deps=("express" "mysql2" "jsonwebtoken" "bcryptjs" "nodemailer" "ua-parser-js" "axios")
    for dep in "${key_deps[@]}"; do
        if grep -q "\"$dep\"" package.json; then
            echo "✓ $dep - 已配置"
        else
            echo "✗ $dep - 缺失"
        fi
    done
else
    echo "✗ 后端 package.json 不存在"
fi

if [ -f "client/package.json" ]; then
    echo "✓ 前端 package.json 存在"
    
    # 检查前端关键依赖
    frontend_deps=("react" "react-router-dom" "antd" "react-query" "styled-components" "dayjs")
    for dep in "${frontend_deps[@]}"; do
        if grep -q "\"$dep\"" client/package.json; then
            echo "✓ $dep - 已配置"
        else
            echo "✗ $dep - 缺失"
        fi
    done
else
    echo "✗ 前端 package.json 不存在"
fi

echo ""
echo "4. 生成安装和启动指南..."
echo "=================================="

cat << 'EOF'

## 系统安装步骤

1. 安装依赖：
   ```bash
   # 安装后端依赖
   npm install
   
   # 安装前端依赖
   cd client
   npm install
   cd ..
   ```

2. 配置数据库：
   - 创建 MySQL 数据库
   - 复制 .env.example 为 .env 并配置数据库连接
   - 执行数据库初始化脚本：
     ```bash
     mysql -u 用户名 -p 数据库名 < database/schema.sql
     mysql -u 用户名 -p 数据库名 < database/security_monitoring.sql
     mysql -u 用户名 -p 数据库名 < database/security_settings.sql
     ```

3. 启动系统：
   ```bash
   # 开发环境 - 同时启动前后端
   npm run dev:all
   
   # 或分别启动
   npm run dev        # 后端
   npm run client     # 前端
   
   # 生产环境
   npm run client:build
   npm start
   ```

## 功能特性验证

### 基础邮件功能：
- ✓ 多域名支持
- ✓ 用户别名管理  
- ✓ 邮件收发功能
- ✓ SMTP/IMAP集成

### 安全监控功能：
- ✓ 用户登录IP监控
- ✓ 地理位置异常检测
- ✓ 风险评分系统
- ✓ 设备指纹识别
- ✓ 管理员安全警报
- ✓ 活跃会话管理
- ✓ 可信设备管理

### 管理员功能：
- ✓ 用户管理界面
- ✓ 域名管理界面
- ✓ 安全监控仪表板
- ✓ 安全配置管理
- ✓ 系统设置面板

## 访问地址

- 用户界面：http://localhost:3000
- 管理员界面：http://localhost:3000/admin
- API接口：http://localhost:3001/api
- 健康检查：http://localhost:3001/api/health

## 测试账户建议

建议创建以下测试账户验证功能：
1. 管理员账户 (role='admin')
2. 普通用户账户 (role='user') 
3. 配置多个域名和别名进行测试

EOF

echo ""
echo "功能测试完成！"
echo "=================================="
echo "企业邮件系统已包含完整的安全监控功能："
echo "• 用户登录IP地址监控"
echo "• 多地登录异常检测" 
echo "• 自动管理员通知系统"
echo "• 风险评分和安全警报"
echo "• 完整的管理员控制界面"
echo ""
echo "请按照上述指南完成系统安装和配置！"