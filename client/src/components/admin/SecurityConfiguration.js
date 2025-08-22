import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Switch,
  Input,
  InputNumber,
  Select,
  Button,
  Space,
  Typography,
  Divider,
  message,
  Alert,
  Tag
} from 'antd';
import {
  SettingOutlined,
  SecurityScanOutlined,
  GlobalOutlined,
  ClockCircleOutlined,
  UserOutlined,
  WarningOutlined,
  SaveOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import styled from 'styled-components';

import api from '../../services/api';
import LoadingSpinner from '../LoadingSpinner';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const ConfigSection = styled(Card)`
  margin-bottom: 16px;
  
  .config-item {
    margin-bottom: 16px;
    padding: 12px;
    border: 1px solid #f0f0f0;
    border-radius: 6px;
    
    .config-label {
      font-weight: 500;
      margin-bottom: 8px;
    }
    
    .config-description {
      color: #666;
      font-size: 12px;
      margin-bottom: 8px;
    }
  }
`;

const SecurityConfiguration = () => {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const [hasChanges, setHasChanges] = useState(false);

  // 获取当前安全配置
  const {
    data: config,
    isLoading: configLoading
  } = useQuery(
    'securityConfig',
    async () => {
      const response = await api.get('/security/config');
      return response.data;
    }
  );

  // 更新安全配置
  const updateConfigMutation = useMutation(
    async (configData) => {
      await api.put('/security/config', configData);
    },
    {
      onSuccess: () => {
        message.success('安全配置已更新');
        setHasChanges(false);
        queryClient.invalidateQueries('securityConfig');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '更新配置失败');
      }
    }
  );

  // 重置配置为默认值
  const resetConfigMutation = useMutation(
    async () => {
      await api.post('/security/config/reset');
    },
    {
      onSuccess: () => {
        message.success('配置已重置为默认值');
        setHasChanges(false);
        queryClient.invalidateQueries('securityConfig');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '重置配置失败');
      }
    }
  );

  useEffect(() => {
    if (config) {
      form.setFieldsValue(config.settings);
    }
  }, [config, form]);

  const handleFormChange = () => {
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      updateConfigMutation.mutate(values);
    } catch (error) {
      message.error('请检查表单输入');
    }
  };

  const handleReset = () => {
    resetConfigMutation.mutate();
  };

  if (configLoading) {
    return <LoadingSpinner height="50vh" />;
  }

  return (
    <div>
      <Title level={3}>
        <SettingOutlined /> 安全配置
      </Title>

      <Alert
        message="安全配置说明"
        description="这些设置控制系统的安全监控行为。修改配置后会立即生效，请谨慎操作。"
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Form
        form={form}
        layout="vertical"
        onChange={handleFormChange}
      >
        {/* 登录监控配置 */}
        <ConfigSection title={<><SecurityScanOutlined /> 登录监控配置</>}>
          <div className="config-item">
            <div className="config-label">启用登录监控</div>
            <div className="config-description">
              开启后系统将记录所有用户登录行为并进行异常检测
            </div>
            <Form.Item name="login_monitoring_enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>

          <div className="config-item">
            <div className="config-label">登录日志保留天数</div>
            <div className="config-description">
              登录日志在数据库中的保留时间，过期日志将被自动清理
            </div>
            <Form.Item name="login_logs_retention_days" rules={[{ required: true, min: 1 }]}>
              <InputNumber min={1} max={365} addonAfter="天" style={{ width: 200 }} />
            </Form.Item>
          </div>

          <div className="config-item">
            <div className="config-label">IP地理位置缓存时间</div>
            <div className="config-description">
              IP地理位置信息的缓存时间，可减少API调用次数
            </div>
            <Form.Item name="geo_cache_hours" rules={[{ required: true, min: 1 }]}>
              <InputNumber min={1} max={168} addonAfter="小时" style={{ width: 200 }} />
            </Form.Item>
          </div>
        </ConfigSection>

        {/* 异常检测配置 */}
        <ConfigSection title={<><WarningOutlined /> 异常检测配置</>}>
          <div className="config-item">
            <div className="config-label">启用地理位置异常检测</div>
            <div className="config-description">
              检测用户从不同地理位置的登录行为
            </div>
            <Form.Item name="geo_anomaly_detection_enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>

          <div className="config-item">
            <div className="config-label">地理异常距离阈值</div>
            <div className="config-description">
              两次登录地点距离超过此值时触发地理异常警报
            </div>
            <Form.Item name="geo_anomaly_distance_km" rules={[{ required: true, min: 50 }]}>
              <InputNumber min={50} max={20000} addonAfter="公里" style={{ width: 200 }} />
            </Form.Item>
          </div>

          <div className="config-item">
            <div className="config-label">时间异常检测窗口</div>
            <div className="config-description">
              在此时间窗口内的多地登录将被标记为异常
            </div>
            <Form.Item name="time_anomaly_window_hours" rules={[{ required: true, min: 1 }]}>
              <InputNumber min={1} max={48} addonAfter="小时" style={{ width: 200 }} />
            </Form.Item>
          </div>

          <div className="config-item">
            <div className="config-label">登录频率阈值</div>
            <div className="config-description">
              单个用户在指定时间内的最大登录次数
            </div>
            <Space>
              <Form.Item name="login_frequency_limit" rules={[{ required: true, min: 1 }]}>
                <InputNumber min={1} max={100} style={{ width: 100 }} />
              </Form.Item>
              <span>次 / </span>
              <Form.Item name="login_frequency_window_minutes" rules={[{ required: true, min: 1 }]}>
                <InputNumber min={1} max={1440} style={{ width: 100 }} />
              </Form.Item>
              <span>分钟</span>
            </Space>
          </div>

          <div className="config-item">
            <div className="config-label">并发会话数量限制</div>
            <div className="config-description">
              单个用户允许的最大并发活跃会话数
            </div>
            <Form.Item name="max_concurrent_sessions" rules={[{ required: true, min: 1 }]}>
              <InputNumber min={1} max={20} style={{ width: 200 }} />
            </Form.Item>
          </div>
        </ConfigSection>

        {/* 风险评分配置 */}
        <ConfigSection title={<><GlobalOutlined /> 风险评分配置</>}>
          <div className="config-item">
            <div className="config-label">基础风险分数</div>
            <div className="config-description">
              每个新登录的基础风险分数
            </div>
            <Form.Item name="base_risk_score" rules={[{ required: true, min: 0 }]}>
              <InputNumber min={0} max={100} style={{ width: 200 }} />
            </Form.Item>
          </div>

          <div className="config-item">
            <div className="config-label">地理异常风险分数</div>
            <div className="config-description">
              检测到地理异常时增加的风险分数
            </div>
            <Form.Item name="geo_anomaly_risk_score" rules={[{ required: true, min: 0 }]}>
              <InputNumber min={0} max={50} style={{ width: 200 }} />
            </Form.Item>
          </div>

          <div className="config-item">
            <div className="config-label">新设备风险分数</div>
            <div className="config-description">
              使用新设备登录时增加的风险分数
            </div>
            <Form.Item name="new_device_risk_score" rules={[{ required: true, min: 0 }]}>
              <InputNumber min={0} max={30} style={{ width: 200 }} />
            </Form.Item>
          </div>

          <div className="config-item">
            <div className="config-label">可疑IP风险分数</div>
            <div className="config-description">
              使用可疑IP地址登录时增加的风险分数
            </div>
            <Form.Item name="suspicious_ip_risk_score" rules={[{ required: true, min: 0 }]}>
              <InputNumber min={0} max={40} style={{ width: 200 }} />
            </Form.Item>
          </div>

          <div className="config-item">
            <div className="config-label">高风险阈值</div>
            <div className="config-description">
              风险分数超过此值时将触发安全警报
            </div>
            <Form.Item name="high_risk_threshold" rules={[{ required: true, min: 50 }]}>
              <InputNumber min={50} max={100} style={{ width: 200 }} />
            </Form.Item>
          </div>
        </ConfigSection>

        {/* 通知配置 */}
        <ConfigSection title={<><UserOutlined /> 通知配置</>}>
          <div className="config-item">
            <div className="config-label">启用邮件通知</div>
            <div className="config-description">
              检测到安全异常时向管理员发送邮件通知
            </div>
            <Form.Item name="email_notifications_enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>

          <div className="config-item">
            <div className="config-label">管理员邮箱列表</div>
            <div className="config-description">
              接收安全通知的管理员邮箱地址，一行一个
            </div>
            <Form.Item name="admin_emails" rules={[{ required: true }]}>
              <TextArea 
                rows={4} 
                placeholder="admin@example.com&#10;security@example.com"
              />
            </Form.Item>
          </div>

          <div className="config-item">
            <div className="config-label">通知严重程度级别</div>
            <div className="config-description">
              只有达到或超过此级别的警报才会发送通知
            </div>
            <Form.Item name="notification_severity_level" rules={[{ required: true }]}>
              <Select style={{ width: 200 }}>
                <Option value="low">低 - 所有警报</Option>
                <Option value="medium">中 - 中等及以上</Option>
                <Option value="high">高 - 高危及紧急</Option>
                <Option value="critical">紧急 - 仅紧急警报</Option>
              </Select>
            </Form.Item>
          </div>

          <div className="config-item">
            <div className="config-label">通知频率限制</div>
            <div className="config-description">
              防止短时间内发送过多通知邮件
            </div>
            <Space>
              <span>最多</span>
              <Form.Item name="notification_rate_limit" rules={[{ required: true, min: 1 }]}>
                <InputNumber min={1} max={50} style={{ width: 100 }} />
              </Form.Item>
              <span>封邮件 / </span>
              <Form.Item name="notification_rate_window_minutes" rules={[{ required: true, min: 1 }]}>
                <InputNumber min={1} max={1440} style={{ width: 100 }} />
              </Form.Item>
              <span>分钟</span>
            </Space>
          </div>
        </ConfigSection>

        {/* 会话管理配置 */}
        <ConfigSection title={<><ClockCircleOutlined /> 会话管理配置</>}>
          <div className="config-item">
            <div className="config-label">会话超时时间</div>
            <div className="config-description">
              用户会话的有效期，超时后需要重新登录
            </div>
            <Form.Item name="session_timeout_hours" rules={[{ required: true, min: 1 }]}>
              <InputNumber min={1} max={168} addonAfter="小时" style={{ width: 200 }} />
            </Form.Item>
          </div>

          <div className="config-item">
            <div className="config-label">记住登录时长</div>
            <div className="config-description">
              用户选择"记住登录"时的会话有效期
            </div>
            <Form.Item name="remember_me_days" rules={[{ required: true, min: 1 }]}>
              <InputNumber min={1} max={365} addonAfter="天" style={{ width: 200 }} />
            </Form.Item>
          </div>

          <div className="config-item">
            <div className="config-label">强制单点登录</div>
            <div className="config-description">
              开启后，用户在新设备登录时将自动结束其他设备的会话
            </div>
            <Form.Item name="force_single_session" valuePropName="checked">
              <Switch />
            </Form.Item>
          </div>

          <div className="config-item">
            <div className="config-label">可信设备有效期</div>
            <div className="config-description">
              设备被标记为可信后的有效期
            </div>
            <Form.Item name="trusted_device_days" rules={[{ required: true, min: 1 }]}>
              <InputNumber min={1} max={365} addonAfter="天" style={{ width: 200 }} />
            </Form.Item>
          </div>
        </ConfigSection>
      </Form>

      {/* 操作按钮 */}
      <Card>
        <Space>
          <Button 
            type="primary" 
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={updateConfigMutation.isLoading}
            disabled={!hasChanges}
          >
            保存配置
          </Button>
          <Button 
            icon={<ReloadOutlined />}
            onClick={handleReset}
            loading={resetConfigMutation.isLoading}
            danger
          >
            重置为默认值
          </Button>
          {hasChanges && (
            <Tag color="orange">
              配置已修改，请记得保存
            </Tag>
          )}
        </Space>
      </Card>
    </div>
  );
};

export default SecurityConfiguration;