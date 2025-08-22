import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from 'antd';

import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import EmailPage from './pages/EmailPage';
import AliasManagePage from './pages/AliasManagePage';
import AdminPage from './pages/AdminPage';
import LoadingSpinner from './components/LoadingSpinner';

const { Content } = Layout;

// 受保护的路由组件
const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (adminOnly && !user.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

// 公共路由组件（已登录用户重定向到仪表板）
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

function App() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Content>
        <Routes>
          {/* 公共路由 */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <RegisterPage />
              </PublicRoute>
            }
          />
          
          {/* 受保护的路由 */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/emails/*"
            element={
              <ProtectedRoute>
                <EmailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/aliases"
            element={
              <ProtectedRoute>
                <AliasManagePage />
              </ProtectedRoute>
            }
          />
          
          {/* 管理员路由 */}
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute adminOnly>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          
          {/* 默认重定向 */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Content>
    </Layout>
  );
}

export default App;