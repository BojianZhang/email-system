import React, { useState } from 'react';
import {
  Card,
  Row,
  Col,
  Table,
  Tag,
  Space,
  Button,
  Typography,
  Alert,
  Modal,
  message,
  Descriptions,
  Badge
} from 'antd';
import {
  SecurityScanOutlined,
  GlobalOutlined,
  DeleteOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  MobileOutlined,
  DesktopOutlined,
  TabletOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import styled from 'styled-components';
import dayjs from 'dayjs';

import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

const { Title, Text } = Typography;

const RiskScore = styled.span`
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
  background: ${props => getRiskScoreColor(props.score)};
  color: white;
`;

const SecurityCard = styled(Card)`
  margin-bottom: 16px;
  
  .security-warning {
    border-left: 4px solid #ff4d4f;
    background: #fff2f0;
    padding: 12px;
    margin-bottom: 16px;
  }
  
  .security-ok {
    border-left: 4px solid #52c41a;
    background: #f6ffed;
    padding: 12px;
    margin-bottom: 16px;
  }
`;

// 获取风险分数颜色
const getRiskScoreColor = (score) => {
  if (score >= 80) return '#ff4d4f';
  if (score >= 60) return '#ff7a45';
  if (score >= 40) return '#faad14';
  if (score >= 20) return '#1890ff';
  return '#52c41a';
};

// 获取设备图标
const getDeviceIcon = (deviceType) => {
  switch (deviceType) {
    case 'mobile':
      return <MobileOutlined />;
    case 'tablet':
      return <TabletOutlined />;
    default:
      return <DesktopOutlined />;
  }
};

const UserSecurityPage = () => {
  const queryClient = useQueryClient();
  const [selectedSession, setSelectedSession] = useState(null);

  // 获取登录历史
  const {
    data: loginHistory,
    isLoading: historyLoading
  } = useQuery(
    'userLoginHistory',
    async () => {
      const response = await api.get('/auth/login-history?limit=50');
      return response.data;
    }
  );

  // 获取活跃会话
  const {
    data: activeSessions,
    isLoading: sessionsLoading
  } = useQuery(
    'userActiveSessions',
    async () => {
      const response = await api.get('/auth/active-sessions');
      return response.data;
    },
    {
      refetchInterval: 60000 // 1分钟刷新一次
    }
  );

  // 获取受信任设备
  const {
    data: trustedDevices,
    isLoading: devicesLoading
  } = useQuery(
    'userTrustedDevices',
    async () => {
      const response = await api.get('/auth/trusted-devices');
      return response.data;
    }
  );

  // 撤销设备信任
  const revokeTrustMutation = useMutation(
    async (deviceFingerprint) => {
      await api.delete(`/auth/trusted-devices/${deviceFingerprint}`);
    },
    {
      onSuccess: () => {
        message.success('设备信任已撤销');
        queryClient.invalidateQueries('userTrustedDevices');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '撤销失败');
      }
    }
  );

  // 登录历史表格列
  const historyColumns = [
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
        <Space>
          {getDeviceIcon(record.device_type)}
          <span>
            <div>{record.browser}</div>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {record.os}
            </Text>
          </span>
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
          {record.is_active ? (
            <Tag color="green">活跃</Tag>
          ) : (
            <Tag>已结束</Tag>
          )}
        </Space>
      )
    },
    {
      title: '登录时间',
      dataIndex: 'login_time',
      key: 'login_time',
      render: (date) => dayjs(date).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Button
          type="text"
          size="small"
          onClick={() => setSelectedSession(record)}
        >
          详情
        </Button>
      )
    }
  ];

  // 受信任设备表格列
  const deviceColumns = [
    {
      title: '设备',
      key: 'device',
      render: (_, record) => (
        <Space>
          {getDeviceIcon(record.device_type)}
          <span>
            <div>{record.device_name}</div>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {record.browser} on {record.os}
            </Text>
          </span>
        </Space>
      )
    },
    {
      title: '位置',
      dataIndex: 'location',
      key: 'location'
    },
    {
      title: '最后使用',
      dataIndex: 'last_used',
      key: 'last_used',
      render: (date) => dayjs(date).fromNow()
    },
    {
      title: '状态',
      dataIndex: 'is_trusted',
      key: 'is_trusted',
      render: (trusted) => (
        <Badge 
          status={trusted ? 'success' : 'error'} 
          text={trusted ? '受信任' : '已撤销'} 
        />
      )
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        record.is_trusted && (
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              Modal.confirm({
                title: '撤销设备信任',
                content: '确定要撤销对此设备的信任吗？下次从此设备登录时可能会触发安全警报。',
                onOk: () => revokeTrustMutation.mutate(record.device_fingerprint)
              });
            }}
          >
            撤销信任
          </Button>
        )
      )
    }
  ];

  // 检查是否有安全风险
  const hasSecurityRisks = () => {
    const recentSuspicious = loginHistory?.login_history?.some(
      log => log.is_suspicious && dayjs().diff(dayjs(log.login_time), 'days') <= 7
    );
    const multipleActiveSessions = activeSessions?.session_count > 3;
    return recentSuspicious || multipleActiveSessions;
  };

  if (historyLoading || sessionsLoading || devicesLoading) {
    return <LoadingSpinner height="50vh" />;
  }

  return (
    <div style={{ padding: '24px' }}>
      <Title level={3}>
        <SecurityScanOutlined /> 账户安全
      </Title>

      {/* 安全状态概览 */}
      <SecurityCard>
        {hasSecurityRisks() ? (
          <div className="security-warning">
            <Space>
              <WarningOutlined style={{ color: '#ff4d4f' }} />
              <Text strong>检测到安全风险</Text>
            </Space>
            <p>您的账户最近有一些异常活动，请检查登录历史和活跃会话。</p>
          </div>
        ) : (
          <div className="security-ok">
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <Text strong>账户安全状态良好</Text>
            </Space>
            <p>未检测到异常登录活动。</p>
          </div>
        )}

        <Row gutter={16}>
          <Col span={8}>
            <Card size="small">
              <Space direction="vertical">
                <Text type="secondary">活跃会话</Text>
                <Title level={2} style={{ margin: 0, color: '#1890ff' }}>
                  {activeSessions?.session_count || 0}
                </Title>
              </Space>
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Space direction="vertical">
                <Text type="secondary">受信任设备</Text>
                <Title level={2} style={{ margin: 0, color: '#52c41a' }}>
                  {trustedDevices?.trusted_devices?.filter(d => d.is_trusted).length || 0}
                </Title>
              </Space>
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Space direction="vertical">
                <Text type="secondary">最近7天登录</Text>
                <Title level={2} style={{ margin: 0, color: '#722ed1' }}>
                  {loginHistory?.login_history?.filter(
                    log => dayjs().diff(dayjs(log.login_time), 'days') <= 7
                  ).length || 0}
                </Title>
              </Space>
            </Card>
          </Col>
        </Row>
      </SecurityCard>

      {/* 当前活跃会话 */}
      <Card title="当前活跃会话" style={{ marginBottom: 16 }}>
        {activeSessions?.active_sessions?.length > 0 ? (
          <Row gutter={16}>
            {activeSessions.active_sessions.map((session, index) => (
              <Col span={12} key={index}>
                <Card size="small" type="inner">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Space>
                      {getDeviceIcon(session.device_type)}
                      <Text strong>{session.browser}</Text>
                      <RiskScore score={session.risk_score}>{session.risk_score}</RiskScore>
                    </Space>
                    <Text type="secondary">
                      <GlobalOutlined /> {session.city}, {session.country}
                    </Text>
                    <Text type="secondary">
                      <ClockCircleOutlined /> {dayjs(session.login_time).fromNow()}
                    </Text>
                    <Text type="secondary">IP: {session.ip_address}</Text>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        ) : (
          <Alert message="当前没有活跃会话" type="info" />
        )}
      </Card>

      {/* 登录历史 */}
      <Card title="登录历史" style={{ marginBottom: 16 }}>
        <Table
          columns={historyColumns}
          dataSource={loginHistory?.login_history || []}
          rowKey={(record, index) => index}
          pagination={{
            total: loginHistory?.pagination?.total,
            pageSize: loginHistory?.pagination?.per_page,
            current: loginHistory?.pagination?.current_page,
            showSizeChanger: false
          }}
          size="small"
        />
      </Card>

      {/* 受信任设备 */}
      <Card title="受信任设备">
        <Table
          columns={deviceColumns}
          dataSource={trustedDevices?.trusted_devices || []}
          rowKey={(record, index) => index}
          pagination={false}
          size="small"
        />
      </Card>

      {/* 会话详情模态框 */}
      <Modal
        title="登录会话详情"
        visible={!!selectedSession}
        onCancel={() => setSelectedSession(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedSession(null)}>
            关闭
          </Button>
        ]}
        width={600}
      >
        {selectedSession && (
          <Descriptions bordered column={1}>
            <Descriptions.Item label="登录时间">
              {dayjs(selectedSession.login_time).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="IP地址">
              {selectedSession.ip_address}
            </Descriptions.Item>
            <Descriptions.Item label="地理位置">
              {selectedSession.city}, {selectedSession.region}, {selectedSession.country}
            </Descriptions.Item>
            <Descriptions.Item label="设备类型">
              <Space>
                {getDeviceIcon(selectedSession.device_type)}
                {selectedSession.device_type}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="浏览器">
              {selectedSession.browser}
            </Descriptions.Item>
            <Descriptions.Item label="操作系统">
              {selectedSession.os}
            </Descriptions.Item>
            <Descriptions.Item label="风险分数">
              <RiskScore score={selectedSession.risk_score}>
                {selectedSession.risk_score}
              </RiskScore>
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Space>
                {selectedSession.is_suspicious && (
                  <Tag color="red" icon={<WarningOutlined />}>
                    可疑登录
                  </Tag>
                )}
                {selectedSession.is_active ? (
                  <Tag color="green">当前活跃</Tag>
                ) : (
                  <Tag>已结束</Tag>
                )}
              </Space>
            </Descriptions.Item>
            {selectedSession.suspicious_reasons && selectedSession.suspicious_reasons.length > 0 && (
              <Descriptions.Item label="可疑原因">
                <ul>
                  {selectedSession.suspicious_reasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default UserSecurityPage;