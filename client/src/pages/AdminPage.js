import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout, Menu, Typography } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  GlobalOutlined,
  MailOutlined,
  SettingOutlined,
  SecurityScanOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';

import UserManagement from '../components/admin/UserManagement';
import DomainManagement from '../components/admin/DomainManagement';
import SystemSettings from '../components/admin/SystemSettings';
import AdminDashboard from '../components/admin/AdminDashboard';
import SecurityMonitoring from '../components/admin/SecurityMonitoring';
import SecurityConfiguration from '../components/admin/SecurityConfiguration';

const { Sider, Content, Header } = Layout;
const { Title } = Typography;

const AdminContainer = styled(Layout)`
  min-height: 100vh;
`;

const StyledSider = styled(Sider)`
  background: #001529;
`;

const StyledHeader = styled(Header)`
  background: white;
  padding: 0 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
`;

const StyledContent = styled(Content)`
  padding: 24px;
  background: #f5f5f5;
`;

const AdminPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: '/admin',
      icon: <DashboardOutlined />,
      label: '管理首页'
    },
    {
      key: '/admin/users',
      icon: <UserOutlined />,
      label: '用户管理'
    },
    {
      key: '/admin/domains',
      icon: <GlobalOutlined />,
      label: '域名管理'
    },
    {
      key: '/admin/emails',
      icon: <MailOutlined />,
      label: '邮件管理'
    },
    {
      key: '/admin/security',
      icon: <SecurityScanOutlined />,
      label: '安全监控'
    },
    {
      key: '/admin/security-config',
      icon: <SettingOutlined />,
      label: '安全配置'
    },
    {
      key: '/admin/settings',
      icon: <SettingOutlined />,
      label: '系统设置'
    }
  ];

  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  return (
    <AdminContainer>
      <StyledSider width={200}>
        <div style={{ padding: '16px', color: 'white', textAlign: 'center' }}>
          <Title level={4} style={{ color: 'white', margin: 0 }}>
            系统管理
          </Title>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ height: '100%', borderRight: 0 }}
          theme="dark"
        />
      </StyledSider>
      
      <Layout>
        <StyledHeader>
          <Title level={4} style={{ margin: 0 }}>
            管理员控制台
          </Title>
        </StyledHeader>
        
        <StyledContent>
          <Routes>
            <Route path="/" element={<AdminDashboard />} />
            <Route path="/users" element={<UserManagement />} />
            <Route path="/domains" element={<DomainManagement />} />
            <Route path="/security" element={<SecurityMonitoring />} />
            <Route path="/security-config" element={<SecurityConfiguration />} />
            <Route path="/settings" element={<SystemSettings />} />
          </Routes>
        </StyledContent>
      </Layout>
    </AdminContainer>
  );
};

export default AdminPage;