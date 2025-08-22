import React, { useState } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Space,
  Button,
  Select,
  DatePicker,
  Badge,
  Tooltip,
  Modal,
  message,
  Alert,
  Typography
} from 'antd';
import {
  SecurityScanOutlined,
  WarningOutlined,
  GlobalOutlined,
  ClockCircleOutlined,
  UserOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  DisconnectOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import styled from 'styled-components';
import dayjs from 'dayjs';

import api from '../../services/api';
import LoadingSpinner from '../LoadingSpinner';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

const StatsCard = styled(Card)`
  .ant-statistic-title {
    color: #666;
    font-size: 14px;
  }
  
  .ant-statistic-content {
    color: ${props => props.color || '#1890ff'};
  }
`;

const AlertCard = styled(Card)`
  margin-bottom: 16px;
  border-left: 4px solid ${props => getSeverityColor(props.severity)};
`;

const RiskScore = styled.span`
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
  background: ${props => getRiskScoreColor(props.score)};
  color: white;
`;

// 获取严重程度颜色
const getSeverityColor = (severity) => {
  const colors = {
    'low': '#52c41a',
    'medium': '#faad14',
    'high': '#ff7a45',
    'critical': '#ff4d4f'
  };
  return colors[severity] || '#d9d9d9';
};

// 获取风险分数颜色
const getRiskScoreColor = (score) => {
  if (score >= 80) return '#ff4d4f';
  if (score >= 60) return '#ff7a45';
  if (score >= 40) return '#faad14';
  if (score >= 20) return '#1890ff';
  return '#52c41a';
};

const SecurityMonitoring = () => {
  const queryClient = useQueryClient();
  const [alertFilters, setAlertFilters] = useState({
    severity: '',
    alert_type: '',
    resolved: 'false'
  });
  const [loginFilters, setLoginFilters] = useState({
    suspicious_only: 'false',
    days: 7
  });
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [resolveModalVisible, setResolveModalVisible] = useState(false);

  // 获取安全警报统计
  const {
    data: alertStats,
    isLoading: statsLoading
  } = useQuery(
    'securityAlertStats',
    async () => {
      const response = await api.get('/security/alerts/stats?days=30');
      return response.data;
    },
    {
      refetchInterval: 30000 // 30秒刷新一次
    }
  );

  // 获取安全警报列表
  const {
    data: alertsData,
    isLoading: alertsLoading,
    refetch: refetchAlerts
  } = useQuery(
    ['securityAlerts', alertFilters],
    async () => {
      const params = new URLSearchParams({
        page: '1',
        limit: '20',
        ...alertFilters
      });
      const response = await api.get(`/security/alerts?${params}`);
      return response.data;
    }
  );

  // 获取登录监控数据
  const {
    data: loginData,
    isLoading: loginLoading
  } = useQuery(
    ['loginMonitoring', loginFilters],
    async () => {
      const params = new URLSearchParams({
        page: '1',
        limit: '50',
        ...loginFilters
      });
      const response = await api.get(`/security/login-monitoring?${params}`);
      return response.data;
    }
  );

  // 获取活跃会话
  const {
    data: activeSessions,
    isLoading: sessionsLoading
  } = useQuery(
    'activeSessions',
    async () => {
      const response = await api.get('/security/active-sessions');
      return response.data;
    },
    {
      refetchInterval: 60000 // 1分钟刷新一次
    }
  );

  // 解决警报
  const resolveAlertMutation = useMutation(
    async ({ alertId, resolutionNotes }) => {
      await api.patch(`/security/alerts/${alertId}/resolve`, {
        resolution_notes: resolutionNotes
      });
    },
    {
      onSuccess: () => {
        message.success('警报已标记为已解决');
        setResolveModalVisible(false);
        setSelectedAlert(null);
        refetchAlerts();
        queryClient.invalidateQueries('securityAlertStats');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '解决警报失败');
      }
    }
  );

  // 强制结束会话
  const terminateSessionMutation = useMutation(
    async ({ userId, sessionTokenHash }) => {
      await api.post('/security/terminate-session', {
        user_id: userId,
        session_token_hash: sessionTokenHash
      });
    },
    {
      onSuccess: (data) => {
        message.success(`已结束 ${data.terminated_sessions} 个会话`);
        queryClient.invalidateQueries('activeSessions');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '结束会话失败');
      }
    }
  );

  // 警报表格列
  const alertColumns = [
    {
      title: '类型',
      dataIndex: 'alert_type',
      key: 'alert_type',
      render: (type) => {
        const typeNames = {
          'login_anomaly': '登录异常',
          'multiple_locations': '多地登录',
          'suspicious_ip': '可疑IP',
          'brute_force': '暴力破解',
          'new_device': '新设备',
          'time_anomaly': '异常时间',
          'concurrent_sessions': '并发会话',
          'geographic_anomaly': '地理异常',
          'ip_reputation': 'IP信誉',
          'login_frequency': '登录频率'
        };
        return typeNames[type] || type;
      }
    },
    {
      title: '严重程度',
      dataIndex: 'severity',
      key: 'severity',
      render: (severity) => (
        <Tag color={getSeverityColor(severity)}>
          {severity.toUpperCase()}
        </Tag>
      )
    },
    {
      title: '用户',
      key: 'user',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.username}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.email}
          </Text>
        </Space>
      )
    },
    {
      title: '描述',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => dayjs(date).format('MM-DD HH:mm')
    },
    {
      title: '状态',
      dataIndex: 'is_resolved',
      key: 'is_resolved',
      render: (resolved) => (
        <Badge 
          status={resolved ? 'success' : 'error'} 
          text={resolved ? '已解决' : '未解决'} 
        />
      )
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setSelectedAlert(record)}
            />
          </Tooltip>
          {!record.is_resolved && (
            <Tooltip title="标记为已解决">
              <Button
                type="text"
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={() => {
                  setSelectedAlert(record);
                  setResolveModalVisible(true);
                }}
              />
            </Tooltip>
          )}
        </Space>
      )
    }
  ];

  // 登录监控表格列
  const loginColumns = [
    {
      title: '用户',
      key: 'user',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.username}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.email}
          </Text>
        </Space>
      )
    },
    {
      title: 'IP地址',
      dataIndex: 'ip_address',
      key: 'ip_address'
    },
    {
      title: '位置',
      key: 'location',
      render: (_, record) => (
        <Space>
          <GlobalOutlined />
          <Text>{record.city}, {record.country}</Text>
        </Space>
      )
    },
    {
      title: '设备',
      key: 'device',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text>{record.device_type}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.browser} on {record.os}
          </Text>
        </Space>
      )
    },
    {
      title: '风险分数',
      dataIndex: 'risk_score',
      key: 'risk_score',
      render: (score) => <RiskScore score={score}>{score}</RiskScore>
    },
    {
      title: '状态',
      key: 'status',
      render: (_, record) => (
        <Space>
          {record.is_suspicious && (
            <Tag color="red" icon={<WarningOutlined />}>
              可疑
            </Tag>
          )}
          {record.is_active && (
            <Tag color="green">活跃</Tag>
          )}
        </Space>
      )
    },
    {
      title: '登录时间',
      dataIndex: 'login_time',
      key: 'login_time',
      render: (date) => dayjs(date).format('MM-DD HH:mm')
    }
  ];

  // 活跃会话表格列
  const sessionColumns = [
    {
      title: '用户',
      key: 'user',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.username}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.email}
          </Text>
        </Space>
      )
    },
    {
      title: 'IP地址',
      dataIndex: 'ip_address',
      key: 'ip_address'
    },
    {
      title: '位置',
      key: 'location',
      render: (_, record) => `${record.city}, ${record.country}`
    },
    {
      title: '设备',
      key: 'device',
      render: (_, record) => `${record.device_type} - ${record.browser}`
    },
    {
      title: '登录时间',
      dataIndex: 'login_time',
      key: 'login_time',
      render: (date) => dayjs(date).fromNow()
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Button
          type="text"
          size="small"
          danger
          icon={<DisconnectOutlined />}
          onClick={() => {
            Modal.confirm({
              title: '确认结束会话',
              content: `确定要强制结束用户 ${record.username} 的会话吗？`,
              onOk: () => terminateSessionMutation.mutate({
                userId: record.user_id,
                sessionTokenHash: record.session_token_hash
              })
            });
          }}
        >
          结束会话
        </Button>
      )
    }
  ];

  if (statsLoading) {
    return <LoadingSpinner height="50vh" />;
  }

  return (
    <div>
      <Title level={3}>
        <SecurityScanOutlined /> 安全监控
      </Title>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={6}>
          <StatsCard color="#ff4d4f">
            <Statistic
              title="未解决警报"
              value={alertStats?.overall?.unresolved_alerts || 0}
              prefix={<ExclamationCircleOutlined />}
            />
          </StatsCard>
        </Col>
        <Col xs={24} sm={6}>
          <StatsCard color="#ff7a45">
            <Statistic
              title="24小时内警报"
              value={alertStats?.overall?.alerts_24h || 0}
              prefix={<ClockCircleOutlined />}
            />
          </StatsCard>
        </Col>
        <Col xs={24} sm={6}>
          <StatsCard color="#faad14">
            <Statistic
              title="高危警报"
              value={alertStats?.overall?.high_alerts || 0}
              prefix={<WarningOutlined />}
            />
          </StatsCard>
        </Col>
        <Col xs={24} sm={6}>
          <StatsCard color="#1890ff">
            <Statistic
              title="活跃会话"
              value={activeSessions?.total_sessions || 0}
              prefix={<UserOutlined />}
            />
          </StatsCard>
        </Col>
      </Row>

      {/* 安全警报 */}
      <Card 
        title="安全警报" 
        style={{ marginBottom: 24 }}
        extra={
          <Space>
            <Select
              placeholder="严重程度"
              style={{ width: 120 }}
              value={alertFilters.severity}
              onChange={(value) => setAlertFilters({...alertFilters, severity: value})}
              allowClear
            >
              <Option value="low">低</Option>
              <Option value="medium">中</Option>
              <Option value="high">高</Option>
              <Option value="critical">紧急</Option>
            </Select>
            <Select
              placeholder="解决状态"
              style={{ width: 120 }}
              value={alertFilters.resolved}
              onChange={(value) => setAlertFilters({...alertFilters, resolved: value})}
            >
              <Option value="">全部</Option>
              <Option value="false">未解决</Option>
              <Option value="true">已解决</Option>
            </Select>
          </Space>
        }
      >
        <Table
          columns={alertColumns}
          dataSource={alertsData?.alerts || []}
          loading={alertsLoading}
          rowKey="id"
          pagination={{
            total: alertsData?.pagination?.total,
            pageSize: alertsData?.pagination?.per_page,
            current: alertsData?.pagination?.current_page,
            showSizeChanger: false,
            showQuickJumper: true
          }}
          size="small"
        />
      </Card>

      {/* 登录监控 */}
      <Card 
        title="登录监控" 
        style={{ marginBottom: 24 }}
        extra={
          <Space>
            <Select
              placeholder="筛选类型"
              style={{ width: 120 }}
              value={loginFilters.suspicious_only}
              onChange={(value) => setLoginFilters({...loginFilters, suspicious_only: value})}
            >
              <Option value="false">全部登录</Option>
              <Option value="true">仅可疑登录</Option>
            </Select>
            <Select
              placeholder="时间范围"
              style={{ width: 120 }}
              value={loginFilters.days}
              onChange={(value) => setLoginFilters({...loginFilters, days: value})}
            >
              <Option value={1}>1天</Option>
              <Option value={7}>7天</Option>
              <Option value={30}>30天</Option>
            </Select>
          </Space>
        }
      >
        <Table
          columns={loginColumns}
          dataSource={loginData?.login_logs || []}
          loading={loginLoading}
          rowKey="id"
          pagination={{
            total: loginData?.pagination?.total,
            pageSize: loginData?.pagination?.per_page,
            current: loginData?.pagination?.current_page,
            showSizeChanger: false
          }}
          size="small"
        />
      </Card>

      {/* 活跃会话 */}
      <Card title="活跃会话">
        <Table
          columns={sessionColumns}
          dataSource={activeSessions?.active_sessions || []}
          loading={sessionsLoading}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Card>

      {/* 警报详情模态框 */}
      <Modal
        title="警报详情"
        visible={!!selectedAlert}
        onCancel={() => setSelectedAlert(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedAlert(null)}>
            关闭
          </Button>,
          !selectedAlert?.is_resolved && (
            <Button
              key="resolve"
              type="primary"
              onClick={() => setResolveModalVisible(true)}
            >
              标记为已解决
            </Button>
          )
        ]}
        width={800}
      >
        {selectedAlert && (
          <div>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Alert
                message={selectedAlert.title}
                description={selectedAlert.description}
                type={selectedAlert.severity === 'critical' ? 'error' : 'warning'}
                showIcon
              />
              
              <Card size="small" title="详细信息">
                <pre style={{ background: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
                  {JSON.stringify(selectedAlert.alert_data, null, 2)}
                </pre>
              </Card>
              
              {selectedAlert.is_resolved && (
                <Card size="small" title="解决信息">
                  <Text>解决时间: {dayjs(selectedAlert.resolved_at).format('YYYY-MM-DD HH:mm:ss')}</Text>
                  <br />
                  <Text>处理人: {selectedAlert.resolved_by_username}</Text>
                  {selectedAlert.resolution_notes && (
                    <>
                      <br />
                      <Text>备注: {selectedAlert.resolution_notes}</Text>
                    </>
                  )}
                </Card>
              )}
            </Space>
          </div>
        )}
      </Modal>

      {/* 解决警报模态框 */}
      <Modal
        title="标记警报为已解决"
        visible={resolveModalVisible}
        onCancel={() => setResolveModalVisible(false)}
        onOk={() => {
          resolveAlertMutation.mutate({
            alertId: selectedAlert?.id,
            resolutionNotes: ''
          });
        }}
        confirmLoading={resolveAlertMutation.isLoading}
      >
        <p>确定要将此警报标记为已解决吗？</p>
      </Modal>
    </div>
  );
};

export default SecurityMonitoring;