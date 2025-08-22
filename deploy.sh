#!/bin/bash

# 企业邮件系统部署脚本

echo "开始部署企业邮件系统..."

# 检查Node.js版本
NODE_VERSION=$(node --version 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "错误: 未安装Node.js，请先安装Node.js 16+版本"
    exit 1
fi

echo "Node.js版本: $NODE_VERSION"

# 检查MySQL连接
echo "检查MySQL连接..."
mysql --version >/dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "警告: 未检测到MySQL客户端，请确保MySQL服务器可用"
fi

# 安装依赖
echo "安装项目依赖..."
npm install
if [ $? -ne 0 ]; then
    echo "错误: 后端依赖安装失败"
    exit 1
fi

cd client
npm install
if [ $? -ne 0 ]; then
    echo "错误: 前端依赖安装失败"
    exit 1
fi

cd ..

# 检查环境配置文件
if [ ! -f .env ]; then
    echo "创建环境配置文件..."
    cp .env.example .env
    echo "请编辑 .env 文件配置您的环境变量"
    echo "主要配置项包括："
    echo "- 数据库连接信息"
    echo "- JWT密钥"
    echo "- SMTP/IMAP服务器配置"
fi

# 创建必要的目录
echo "创建必要的目录..."
mkdir -p logs
mkdir -p uploads/attachments

# 设置目录权限
chmod 755 logs
chmod 755 uploads

echo "部署脚本执行完成！"
echo ""
echo "接下来的步骤："
echo "1. 编辑 .env 文件配置环境变量"
echo "2. 创建MySQL数据库: CREATE DATABASE email_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo "3. 导入数据库架构: mysql -u username -p email_system < database/schema.sql"
echo "4. 启动应用:"
echo "   - 开发模式: npm run dev:all"
echo "   - 生产模式: npm run client:build && npm start"
echo ""
echo "应用将在以下地址提供服务:"
echo "- 前端: http://localhost:3000 (开发模式)"
echo "- 后端API: http://localhost:3001/api"
echo "- 健康检查: http://localhost:3001/api/health"