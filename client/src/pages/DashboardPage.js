import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layout,
  Card,
  Row,
  Col,
  Statistic,
  List,
  Typography,
  Space,
  Button,
  Avatar,
  Tag,
  Badge,
  Divider,
  Empty
} from 'antd';
import {
  MailOutlined,
  InboxOutlined,
  SendOutlined,
  UserOutlined,
  PlusOutlined,
  SettingOutlined,
  LogoutOutlined,
  BellOutlined
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import styled from 'styled-components';
import dayjs from 'dayjs';

import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

const DashboardContainer = styled(Layout)`
  min-height: 100vh;
  background: #f5f5f5;
`;

const StyledHeader = styled(Header)`
  background: white;
  padding: 0 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const StyledContent = styled(Content)`
  padding: 24px;
`;

const WelcomeCard = styled(Card)`
  margin-bottom: 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  
  .ant-card-body {
    padding: 32px;
  }
  
  .ant-typography {
    color: white !important;
  }
`;

const StatsCard = styled(Card)`
  .ant-statistic-title {
    color: #666;
    font-size: 14px;
  }
  
  .ant-statistic-content {
    color: #1890ff;
  }
`;

const ActionCard = styled(Card)`
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
  
  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  }
  
  .ant-card-body {
    padding: 32px 24px;
  }
  
  .action-icon {
    font-size: 32px;
    margin-bottom: 16px;
    color: #1890ff;
  }
`;

const RecentEmailItem = styled(List.Item)`
  cursor: pointer;
  transition: background-color 0.3s;
  
  &:hover {
    background-color: #f5f5f5;
  }
  
  &.unread {
    background-color: #f9f9f9;
    font-weight: 600;
  }
`;

const DashboardPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // 获取用户别名统计
  const {
    data: aliases = [],
    isLoading: aliasesLoading
  } = useQuery(
    'dashboardAliases',
    async () => {
      const response = await api.get('/aliases/my?include_stats=true');
      return response.data.aliases;
    }
  );

  // 获取最近邮件
  const {
    data: recentEmails = [],
    isLoading: emailsLoading
  } = useQuery(
    'recentEmails',
    async () => {
      if (aliases.length === 0) return [];
      
      // 获取第一个别名的最近邮件
      const firstAlias = aliases.find(a => a.is_active) || aliases[0];
      if (!firstAlias) return [];
      
      const response = await api.get(`/emails/alias/${firstAlias.id}?page=1&limit=5`);
      return response.data.emails || [];
    },
    {
      enabled: aliases.length > 0
    }
  );

  // 计算统计数据
  const totalEmails = aliases.reduce((sum, alias) => 
    sum + (alias.email_stats?.total_emails || 0), 0
  );
  const unreadEmails = aliases.reduce((sum, alias) => 
    sum + (alias.email_stats?.unread_emails || 0), 0
  );
  const totalAliases = aliases.length;
  const activeAliases = aliases.filter(alias => alias.is_active).length;

  // 快捷操作
  const quickActions = [
    {
      title: '写邮件',
      icon: <MailOutlined className="action-icon" />,
      description: '发送新邮件',
      onClick: () => navigate('/emails')
    },
    {
      title: '管理别名',
      icon: <UserOutlined className="action-icon" />,
      description: '创建和管理邮箱别名',
      onClick: () => navigate('/aliases')
    },
    {
      title: '查看邮件',
      icon: <InboxOutlined className="action-icon" />,
      description: '查看收件箱邮件',
      onClick: () => navigate('/emails')
    }
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (aliasesLoading) {
    return <LoadingSpinner height="100vh" />;
  }

  return (
    <DashboardContainer>
      <StyledHeader>
        <Space>
          <Avatar icon={<UserOutlined />} />
          <div>
            <Text strong>{user?.username}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {user?.email}
            </Text>
          </div>
        </Space>
        
        <Space>
          <Badge count={unreadEmails} size="small">
            <Button 
              type="text" 
              icon={<BellOutlined />}
              onClick={() => navigate('/emails')}
            />
          </Badge>
          <Button 
            type="text" 
            icon={<SettingOutlined />}
            onClick={() => navigate('/settings')}
          />
          <Button 
            type="text" 
            icon={<LogoutOutlined />}
            onClick={handleLogout}
          />
        </Space>
      </StyledHeader>

      <StyledContent>
        {/* 欢迎卡片 */}
        <WelcomeCard>
          <Row align="middle">
            <Col flex="auto">
              <Title level={3} style={{ margin: 0, color: 'white' }}>
                欢迎回来，{user?.username}！
              </Title>
              <Text style={{ fontSize: '16px', opacity: 0.9 }}>
                您有 {unreadEmails} 封未读邮件等待处理
              </Text>
            </Col>
            <Col>
              <Button 
                type="primary" 
                size="large"
                icon={<MailOutlined />}
                onClick={() => navigate('/emails')}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none' }}
              >
                查看邮件
              </Button>
            </Col>
          </Row>
        </WelcomeCard>

        <Row gutter={24}>
          {/* 统计卡片 */}
          <Col xs={24} md={18}>
            <Row gutter={16}>
              <Col xs={12} sm={6}>
                <StatsCard>
                  <Statistic
                    title="总邮件"
                    value={totalEmails}
                    prefix={<MailOutlined />}
                  />
                </StatsCard>
              </Col>
              <Col xs={12} sm={6}>
                <StatsCard>
                  <Statistic
                    title="未读邮件"
                    value={unreadEmails}
                    prefix={<InboxOutlined />}
                    valueStyle={{ color: unreadEmails > 0 ? '#ff4d4f' : '#1890ff' }}
                  />
                </StatsCard>
              </Col>
              <Col xs={12} sm={6}>
                <StatsCard>
                  <Statistic
                    title="邮箱别名"
                    value={totalAliases}
                    prefix={<UserOutlined />}
                  />
                </StatsCard>
              </Col>
              <Col xs={12} sm={6}>
                <StatsCard>
                  <Statistic
                    title="活跃别名"
                    value={activeAliases}
                    prefix={<SendOutlined />}
                    valueStyle={{ color: activeAliases > 0 ? '#52c41a' : '#1890ff' }}
                  />
                </StatsCard>
              </Col>
            </Row>

            {/* 快捷操作 */}
            <Card title="快捷操作" style={{ marginTop: 24 }}>
              <Row gutter={16}>
                {quickActions.map((action, index) => (
                  <Col xs={24} sm={8} key={index}>
                    <ActionCard onClick={action.onClick}>
                      {action.icon}
                      <Title level={5}>{action.title}</Title>
                      <Text type="secondary">{action.description}</Text>
                    </ActionCard>
                  </Col>
                ))}
              </Row>
            </Card>

            {/* 最近邮件 */}
            <Card 
              title="最近邮件" 
              style={{ marginTop: 24 }}
              extra={
                <Button 
                  type="link" 
                  onClick={() => navigate('/emails')}
                >
                  查看全部
                </Button>
              }
            >
              {emailsLoading ? (
                <LoadingSpinner height="200px" />
              ) : recentEmails.length > 0 ? (
                <List
                  dataSource={recentEmails}
                  renderItem={(email) => (
                    <RecentEmailItem 
                      className={!email.is_read ? 'unread' : ''}
                      onClick={() => navigate(`/emails/detail/${email.id}`)}
                    >
                      <List.Item.Meta
                        title={
                          <Space>
                            <Text strong={!email.is_read}>
                              {email.from_name || email.from_address}
                            </Text>
                            {!email.is_read && <Tag color="blue" size="small">未读</Tag>}
                          </Space>
                        }
                        description={
                          <Space direction="vertical" size={0}>
                            <Text>{email.subject}</Text>
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                              {dayjs(email.received_at).format('MM-DD HH:mm')}
                            </Text>
                          </Space>
                        }
                      />
                    </RecentEmailItem>
                  )}
                />
              ) : (
                <Empty description="暂无邮件" />
              )}
            </Card>
          </Col>

          {/* 侧边栏 */}
          <Col xs={24} md={6}>
            <Card title="别名状态">
              {aliases.length > 0 ? (
                <List
                  size="small"
                  dataSource={aliases}
                  renderItem={(alias) => (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Space>
                            <Text style={{ fontSize: '12px' }}>
                              {alias.full_email}
                            </Text>
                            <Badge 
                              status={alias.is_active ? 'success' : 'error'} 
                            />
                          </Space>
                        }
                        description={
                          alias.email_stats ? (
                            <Text type="secondary" style={{ fontSize: '11px' }}>
                              {alias.email_stats.total_emails} 封邮件
                              {alias.email_stats.unread_emails > 0 && 
                                ` (${alias.email_stats.unread_emails} 未读)`
                              }
                            </Text>
                          ) : (
                            <Text type="secondary" style={{ fontSize: '11px' }}>
                              暂无邮件
                            </Text>
                          )
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty 
                  description="暂无别名" 
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                  <Button 
                    type="primary" 
                    icon={<PlusOutlined />}
                    onClick={() => navigate('/aliases')}
                  >
                    创建别名
                  </Button>
                </Empty>
              )}
            </Card>

            {/* 系统通知 */}
            <Card title="系统通知" style={{ marginTop: 16 }}>
              <Space direction="vertical">
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  欢迎使用企业邮件系统！
                </Text>
                <Divider style={{ margin: '8px 0' }} />
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  如有问题请联系系统管理员
                </Text>
              </Space>
            </Card>
          </Col>
        </Row>
      </StyledContent>
    </DashboardContainer>
  );
};

export default DashboardPage;