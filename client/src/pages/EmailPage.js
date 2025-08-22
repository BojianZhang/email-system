import React, { useState, useEffect } from 'react';
import { Routes, Route, useParams, useNavigate } from 'react-router-dom';
import {
  Layout,
  Menu,
  Select,
  Typography,
  Badge,
  Button,
  Space,
  Card,
  message,
  Spin
} from 'antd';
import {
  InboxOutlined,
  SendOutlined,
  FileOutlined,
  DeleteOutlined,
  WarningOutlined,
  ArchiveBoxOutlined,
  EditOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import styled from 'styled-components';

import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import EmailList from '../components/EmailList';
import EmailDetail from '../components/EmailDetail';
import ComposeEmail from '../components/ComposeEmail';
import LoadingSpinner from '../components/LoadingSpinner';

const { Sider, Content, Header } = Layout;
const { Title } = Typography;
const { Option } = Select;

const StyledLayout = styled(Layout)`
  height: 100vh;
  background: white;
`;

const StyledSider = styled(Sider)`
  background: #f5f5f5 !important;
  border-right: 1px solid #e8e8e8;
`;

const StyledHeader = styled(Header)`
  background: white;
  padding: 0 24px;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const AliasSelector = styled.div`
  padding: 16px;
  border-bottom: 1px solid #e8e8e8;
  background: white;
`;

const MenuContainer = styled.div`
  height: calc(100vh - 120px);
  overflow-y: auto;
`;

const FolderMenuItem = styled(Menu.Item)`
  .folder-stats {
    float: right;
    font-size: 12px;
    color: #999;
  }
`;

// 文件夹菜单项
const folderItems = [
  { key: 'inbox', icon: <InboxOutlined />, label: '收件箱', name: 'inbox' },
  { key: 'sent', icon: <SendOutlined />, label: '已发送', name: 'sent' },
  { key: 'draft', icon: <FileOutlined />, label: '草稿箱', name: 'draft' },
  { key: 'archive', icon: <ArchiveBoxOutlined />, label: '归档', name: 'archive' },
  { key: 'spam', icon: <WarningOutlined />, label: '垃圾邮件', name: 'spam' },
  { key: 'trash', icon: <DeleteOutlined />, label: '回收站', name: 'trash' },
];

const EmailPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedAlias, setSelectedAlias] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState('inbox');
  const [composeVisible, setComposeVisible] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // 获取用户的所有别名
  const {
    data: aliases = [],
    isLoading: aliasesLoading,
    refetch: refetchAliases
  } = useQuery(
    ['aliases', refreshTrigger],
    async () => {
      const response = await api.get('/aliases/my?include_stats=true');
      return response.data.aliases;
    },
    {
      enabled: !!user,
      onSuccess: (data) => {
        if (data.length > 0 && !selectedAlias) {
          setSelectedAlias(data[0].id);
        }
      }
    }
  );

  // 获取邮件文件夹统计
  const {
    data: folderStats = [],
    refetch: refetchFolderStats
  } = useQuery(
    ['folderStats', selectedAlias],
    async () => {
      if (!selectedAlias) return [];
      const response = await api.get(`/emails/alias/${selectedAlias}?page=1&limit=1`);
      return response.data.folder_stats || [];
    },
    {
      enabled: !!selectedAlias
    }
  );

  // 刷新数据
  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
    refetchAliases();
    refetchFolderStats();
    message.success('已刷新');
  };

  // 别名选择器
  const renderAliasSelector = () => (
    <AliasSelector>
      <Select
        value={selectedAlias}
        onChange={setSelectedAlias}
        placeholder="选择邮箱别名"
        style={{ width: '100%' }}
        loading={aliasesLoading}
      >
        {aliases.map(alias => (
          <Option key={alias.id} value={alias.id}>
            <Space direction="vertical" size={0}>
              <span>{alias.full_email}</span>
              {alias.email_stats && (
                <span style={{ fontSize: '12px', color: '#999' }}>
                  {alias.email_stats.total_emails} 封邮件
                  {alias.email_stats.unread_emails > 0 && 
                    ` (${alias.email_stats.unread_emails} 未读)`
                  }
                </span>
              )}
            </Space>
          </Option>
        ))}
      </Select>
    </AliasSelector>
  );

  // 文件夹菜单
  const renderFolderMenu = () => (
    <MenuContainer>
      <Menu
        mode="inline"
        selectedKeys={[selectedFolder]}
        onSelect={({ key }) => setSelectedFolder(key)}
        style={{ border: 'none' }}
      >
        {folderItems.map(folder => {
          const stats = folderStats.find(s => s.name === folder.name);
          return (
            <FolderMenuItem key={folder.key} icon={folder.icon}>
              {folder.label}
              {stats && stats.total_count > 0 && (
                <Badge
                  count={stats.unread_count}
                  size="small"
                  style={{ marginLeft: 8 }}
                />
              )}
              {stats && (
                <span className="folder-stats">
                  {stats.total_count}
                </span>
              )}
            </FolderMenuItem>
          );
        })}
      </Menu>
    </MenuContainer>
  );

  if (!user || aliasesLoading) {
    return <LoadingSpinner height="100vh" />;
  }

  if (aliases.length === 0) {
    return (
      <StyledLayout>
        <Content style={{ padding: '50px', textAlign: 'center' }}>
          <Card>
            <Space direction="vertical" size="large">
              <Title level={3}>暂无邮箱别名</Title>
              <p>您还没有创建任何邮箱别名，请先创建别名来收发邮件。</p>
              <Button 
                type="primary" 
                onClick={() => navigate('/aliases')}
              >
                创建别名
              </Button>
            </Space>
          </Card>
        </Content>
      </StyledLayout>
    );
  }

  return (
    <StyledLayout>
      <StyledSider width={280} collapsedWidth={0} breakpoint="md">
        {renderAliasSelector()}
        {renderFolderMenu()}
      </StyledSider>

      <Layout>
        <StyledHeader>
          <Title level={4} style={{ margin: 0 }}>
            {folderItems.find(f => f.key === selectedFolder)?.label}
          </Title>
          <Space>
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => setComposeVisible(true)}
            >
              写邮件
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
            >
              刷新
            </Button>
          </Space>
        </StyledHeader>

        <Content>
          <Routes>
            <Route
              path="/"
              element={
                <EmailList
                  aliasId={selectedAlias}
                  folder={selectedFolder}
                  onRefresh={handleRefresh}
                />
              }
            />
            <Route
              path="/detail/:emailId"
              element={
                <EmailDetail
                  onRefresh={handleRefresh}
                />
              }
            />
          </Routes>
        </Content>
      </Layout>

      <ComposeEmail
        visible={composeVisible}
        onCancel={() => setComposeVisible(false)}
        aliases={aliases}
        defaultAliasId={selectedAlias}
        onSent={() => {
          setComposeVisible(false);
          handleRefresh();
        }}
      />
    </StyledLayout>
  );
};

export default EmailPage;