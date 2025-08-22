import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Typography,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  message,
  Popconfirm,
  Tooltip,
  Badge
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PoweroffOutlined,
  MailOutlined,
  EyeOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import dayjs from 'dayjs';

import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

const { Title, Text } = Typography;
const { Option } = Select;

const PageContainer = styled.div`
  padding: 24px;
  background: #f5f5f5;
  min-height: 100vh;
`;

const StyledCard = styled(Card)`
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  border-radius: 8px;
`;

const AliasManagePage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingAlias, setEditingAlias] = useState(null);
  const [form] = Form.useForm();

  // 获取用户别名列表
  const {
    data: aliases = [],
    isLoading: aliasesLoading,
    refetch: refetchAliases
  } = useQuery(
    'userAliases',
    async () => {
      const response = await api.get('/aliases/my?include_stats=true');
      return response.data.aliases;
    }
  );

  // 获取活跃域名列表
  const {
    data: domains = [],
    isLoading: domainsLoading
  } = useQuery(
    'activeDomains',
    async () => {
      const response = await api.get('/domains/active');
      return response.data.domains;
    }
  );

  // 创建别名
  const createMutation = useMutation(
    async (values) => {
      const response = await api.post('/aliases', values);
      return response.data;
    },
    {
      onSuccess: () => {
        message.success('别名创建成功');
        setCreateModalVisible(false);
        form.resetFields();
        refetchAliases();
        queryClient.invalidateQueries('userAliases');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '创建失败');
      }
    }
  );

  // 更新别名
  const updateMutation = useMutation(
    async ({ id, ...values }) => {
      const response = await api.patch(`/aliases/${id}`, values);
      return response.data;
    },
    {
      onSuccess: () => {
        message.success('别名更新成功');
        setEditModalVisible(false);
        setEditingAlias(null);
        form.resetFields();
        refetchAliases();
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '更新失败');
      }
    }
  );

  // 切换别名状态
  const toggleStatusMutation = useMutation(
    async ({ id, is_active }) => {
      const response = await api.patch(`/aliases/${id}/status`, { is_active });
      return response.data;
    },
    {
      onSuccess: () => {
        message.success('状态更新成功');
        refetchAliases();
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '状态更新失败');
      }
    }
  );

  // 删除别名
  const deleteMutation = useMutation(
    async (id) => {
      const response = await api.delete(`/aliases/${id}`);
      return response.data;
    },
    {
      onSuccess: () => {
        message.success('别名删除成功');
        refetchAliases();
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '删除失败');
      }
    }
  );

  // 处理创建别名
  const handleCreate = (values) => {
    createMutation.mutate(values);
  };

  // 处理编辑别名
  const handleEdit = (alias) => {
    setEditingAlias(alias);
    form.setFieldsValue({
      display_name: alias.display_name
    });
    setEditModalVisible(true);
  };

  // 处理更新别名
  const handleUpdate = (values) => {
    updateMutation.mutate({
      id: editingAlias.id,
      ...values
    });
  };

  // 查看别名邮件
  const viewAliasEmails = (alias) => {
    navigate(`/emails?alias=${alias.id}`);
  };

  // 表格列定义
  const columns = [
    {
      title: '邮箱地址',
      dataIndex: 'full_email',
      key: 'full_email',
      render: (text, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{text}</Text>
          {record.display_name && (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {record.display_name}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '域名',
      dataIndex: 'domain_name',
      key: 'domain_name',
      render: (domain, record) => (
        <Space>
          <Tag color={record.domain_active ? 'green' : 'red'}>
            {domain}
          </Tag>
          {!record.domain_active && (
            <Tooltip title="域名已禁用">
              <Text type="danger" style={{ fontSize: '12px' }}>域名禁用</Text>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active) => (
        <Badge 
          status={active ? 'success' : 'error'} 
          text={active ? '活跃' : '禁用'} 
        />
      ),
    },
    {
      title: '邮件统计',
      key: 'email_stats',
      render: (_, record) => {
        const stats = record.email_stats;
        if (!stats || stats.total_emails === 0) {
          return <Text type="secondary">暂无邮件</Text>;
        }
        return (
          <Space direction="vertical" size={0}>
            <Text>总数: {stats.total_emails}</Text>
            {stats.unread_emails > 0 && (
              <Text type="warning">未读: {stats.unread_emails}</Text>
            )}
          </Space>
        );
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="查看邮件">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => viewAliasEmails(record)}
            />
          </Tooltip>
          
          <Tooltip title="编辑">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          
          <Tooltip title={record.is_active ? '禁用' : '启用'}>
            <Button
              type="text"
              icon={<PoweroffOutlined />}
              onClick={() => toggleStatusMutation.mutate({
                id: record.id,
                is_active: !record.is_active
              })}
              loading={toggleStatusMutation.isLoading}
            />
          </Tooltip>
          
          <Popconfirm
            title="确定要删除这个别名吗？"
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button
                type="text"
                icon={<DeleteOutlined />}
                danger
                loading={deleteMutation.isLoading}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (aliasesLoading || domainsLoading) {
    return <LoadingSpinner height="100vh" />;
  }

  return (
    <PageContainer>
      <StyledCard>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={4} style={{ margin: 0 }}>
            邮箱别名管理
          </Title>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalVisible(true)}
              disabled={domains.length === 0}
            >
              创建别名
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={refetchAliases}
            >
              刷新
            </Button>
            <Button
              icon={<MailOutlined />}
              onClick={() => navigate('/emails')}
            >
              查看邮件
            </Button>
          </Space>
        </div>

        {domains.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <Title level={4}>暂无可用域名</Title>
            <Text type="secondary">请联系管理员添加邮件域名</Text>
          </div>
        ) : (
          <Table
            columns={columns}
            dataSource={aliases}
            rowKey="id"
            loading={aliasesLoading}
            pagination={{
              showSizeChanger: false,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 个别名`
            }}
            locale={{
              emptyText: '暂无别名，点击"创建别名"开始创建'
            }}
          />
        )}
      </StyledCard>

      {/* 创建别名弹窗 */}
      <Modal
        title="创建邮箱别名"
        visible={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          form.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
        >
          <Form.Item
            name="local_part"
            label="邮箱用户名"
            rules={[
              { required: true, message: '请输入邮箱用户名' },
              { pattern: /^[a-zA-Z0-9._-]+$/, message: '只能包含字母、数字、点、下划线和连字符' }
            ]}
          >
            <Input placeholder="例如: john.doe" />
          </Form.Item>

          <Form.Item
            name="domain_id"
            label="选择域名"
            rules={[{ required: true, message: '请选择域名' }]}
          >
            <Select placeholder="选择域名">
              {domains.map(domain => (
                <Option key={domain.id} value={domain.id}>
                  {domain.domain_name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="display_name"
            label="显示名称（可选）"
          >
            <Input placeholder="例如: 张三" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setCreateModalVisible(false);
                form.resetFields();
              }}>
                取消
              </Button>
              <Button 
                type="primary" 
                htmlType="submit"
                loading={createMutation.isLoading}
              >
                创建
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑别名弹窗 */}
      <Modal
        title="编辑别名"
        visible={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingAlias(null);
          form.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleUpdate}
        >
          <Form.Item label="邮箱地址">
            <Input value={editingAlias?.full_email} disabled />
          </Form.Item>

          <Form.Item
            name="display_name"
            label="显示名称"
          >
            <Input placeholder="例如: 张三" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setEditModalVisible(false);
                setEditingAlias(null);
                form.resetFields();
              }}>
                取消
              </Button>
              <Button 
                type="primary" 
                htmlType="submit"
                loading={updateMutation.isLoading}
              >
                更新
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default AliasManagePage;