import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Form,
  Input,
  Button,
  Card,
  Typography,
  Space,
  Divider,
  Alert
} from 'antd';
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import styled from 'styled-components';

import { useAuth } from '../contexts/AuthContext';

const { Title, Text } = Typography;

const LoginContainer = styled.div`
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
`;

const LoginCard = styled(Card)`
  width: 100%;
  max-width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  
  .ant-card-body {
    padding: 40px;
  }
`;

const StyledTitle = styled(Title)`
  text-align: center;
  color: #1890ff;
  margin-bottom: 8px !important;
`;

const StyledSubtitle = styled(Text)`
  display: block;
  text-align: center;
  color: #666;
  margin-bottom: 32px;
`;

const StyledButton = styled(Button)`
  height: 40px;
  border-radius: 6px;
`;

const LoginPage = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (values) => {
    setLoading(true);
    setError('');

    const result = await login(values.email, values.password);
    
    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error);
    }
    
    setLoading(false);
  };

  return (
    <LoginContainer>
      <LoginCard>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <StyledTitle level={2}>企业邮件系统</StyledTitle>
            <StyledSubtitle>登录您的账户</StyledSubtitle>
          </div>

          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          <Form
            form={form}
            name="login"
            onFinish={handleSubmit}
            autoComplete="off"
            size="large"
          >
            <Form.Item
              name="email"
              rules={[
                { required: true, message: '请输入邮箱地址' },
                { type: 'email', message: '请输入有效的邮箱地址' },
              ]}
            >
              <Input
                prefix={<MailOutlined />}
                placeholder="邮箱地址"
                autoComplete="email"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="密码"
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 16 }}>
              <StyledButton
                type="primary"
                htmlType="submit"
                loading={loading}
                block
              >
                登录
              </StyledButton>
            </Form.Item>
          </Form>

          <Divider>或</Divider>

          <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
            <Text>还没有账户？</Text>
            <Link to="/register">
              <Button type="link" size="large">
                立即注册
              </Button>
            </Link>
          </Space>
        </Space>
      </LoginCard>
    </LoginContainer>
  );
};

export default LoginPage;