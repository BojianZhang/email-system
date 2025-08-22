import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Space,
  Typography,
  Tag,
  Divider,
  Avatar,
  Dropdown,
  Menu,
  message,
  Spin,
  Modal
} from 'antd';
import {
  ArrowLeftOutlined,
  StarOutlined,
  StarFilled,
  ReplyOutlined,
  ForwardOutlined,
  DeleteOutlined,
  DownloadOutlined,
  PrinterOutlined,
  MoreOutlined,
  PaperClipOutlined,
  UserOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import styled from 'styled-components';
import dayjs from 'dayjs';
import DOMPurify from 'dompurify';

import api from '../services/api';
import LoadingSpinner from './LoadingSpinner';
import ComposeEmail from './ComposeEmail';

const { Title, Text, Paragraph } = Typography;

const DetailContainer = styled.div`
  height: calc(100vh - 120px);
  overflow-y: auto;
  padding: 24px;
`;

const EmailHeader = styled(Card)`
  margin-bottom: 16px;
  
  .ant-card-body {
    padding: 16px 24px;
  }
`;

const EmailContent = styled(Card)`
  .email-body {
    line-height: 1.6;
    font-size: 14px;
    
    img {
      max-width: 100%;
      height: auto;
    }
    
    a {
      color: #1890ff;
      text-decoration: none;
      
      &:hover {
        text-decoration: underline;
      }
    }
  }
  
  .text-content {
    white-space: pre-wrap;
    font-family: monospace;
  }
`;

const AttachmentList = styled.div`
  margin-top: 16px;
  padding: 16px;
  background: #fafafa;
  border-radius: 6px;
`;

const AttachmentItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
  
  &:last-child {
    border-bottom: none;
  }
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const SenderInfo = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 12px;
`;

const EmailDetail = ({ onRefresh }) => {
  const { emailId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [replyVisible, setReplyVisible] = useState(false);
  const [forwardVisible, setForwardVisible] = useState(false);

  // 获取邮件详情
  const {
    data: emailDetail,
    isLoading,
    refetch
  } = useQuery(
    ['email', emailId],
    async () => {
      const response = await api.get(`/emails/${emailId}`);
      return response.data.email;
    },
    {
      enabled: !!emailId
    }
  );

  // 邮件操作
  const emailMutation = useMutation(
    async ({ action, value, folder_name }) => {
      const endpoint = action === 'move' ? `/emails/${emailId}/move` : `/emails/${emailId}/${action}`;
      const data = action === 'move' ? { folder_name } : { [`is_${action}`]: value };
      await api.patch(endpoint, data);
    },
    {
      onSuccess: () => {
        refetch();
        onRefresh?.();
        queryClient.invalidateQueries(['emails']);
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '操作失败');
      }
    }
  );

  // 下载附件
  const downloadAttachment = async (attachmentId, filename) => {
    try {
      const response = await api.get(`/emails/attachment/${attachmentId}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      message.error('下载失败');
    }
  };

  // 打印邮件
  const handlePrint = () => {
    window.print();
  };

  // 删除邮件
  const handleDelete = () => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这封邮件吗？',
      onOk: () => {
        emailMutation.mutate({ action: 'move', folder_name: 'trash' });
        navigate('/emails');
      }
    });
  };

  // 邮件操作菜单
  const actionMenu = (
    <Menu>
      <Menu.Item 
        key="read"
        onClick={() => emailMutation.mutate({
          action: 'read',
          value: !emailDetail?.is_read
        })}
      >
        {emailDetail?.is_read ? '标记为未读' : '标记为已读'}
      </Menu.Item>
      <Menu.Item 
        key="important"
        onClick={() => emailMutation.mutate({
          action: 'important',
          value: !emailDetail?.is_important
        })}
      >
        {emailDetail?.is_important ? '取消重要' : '标记重要'}
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item 
        key="archive"
        onClick={() => emailMutation.mutate({
          action: 'move',
          folder_name: 'archive'
        })}
      >
        归档
      </Menu.Item>
      <Menu.Item 
        key="spam"
        onClick={() => emailMutation.mutate({
          action: 'move',
          folder_name: 'spam'
        })}
      >
        标记为垃圾邮件
      </Menu.Item>
      <Menu.Item key="delete" onClick={handleDelete}>
        删除
      </Menu.Item>
    </Menu>
  );

  if (isLoading) {
    return <LoadingSpinner height="50vh" />;
  }

  if (!emailDetail) {
    return (
      <DetailContainer>
        <Card>
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <Title level={4}>邮件不存在</Title>
            <Button onClick={() => navigate('/emails')}>
              返回邮件列表
            </Button>
          </div>
        </Card>
      </DetailContainer>
    );
  }

  const formatEmailAddresses = (addresses) => {
    if (!addresses) return '';
    return Array.isArray(addresses) ? addresses.join(', ') : addresses;
  };

  return (
    <DetailContainer>
      {/* 操作栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space split={<Divider type="vertical" />}>
          <Button 
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/emails')}
          >
            返回
          </Button>
          
          <Button 
            type={emailDetail.is_starred ? 'primary' : 'default'}
            icon={emailDetail.is_starred ? <StarFilled /> : <StarOutlined />}
            onClick={() => emailMutation.mutate({
              action: 'star',
              value: !emailDetail.is_starred
            })}
          >
            {emailDetail.is_starred ? '已星标' : '星标'}
          </Button>
          
          <Button 
            icon={<ReplyOutlined />}
            onClick={() => setReplyVisible(true)}
          >
            回复
          </Button>
          
          <Button 
            icon={<ForwardOutlined />}
            onClick={() => setForwardVisible(true)}
          >
            转发
          </Button>
          
          <Button 
            icon={<PrinterOutlined />}
            onClick={handlePrint}
          >
            打印
          </Button>
          
          <Dropdown overlay={actionMenu}>
            <Button icon={<MoreOutlined />}>
              更多
            </Button>
          </Dropdown>
        </Space>
      </Card>

      {/* 邮件头部信息 */}
      <EmailHeader>
        <HeaderRow>
          <Title level={4} style={{ margin: 0, flex: 1 }}>
            {emailDetail.subject}
          </Title>
          <Space>
            {!emailDetail.is_read && <Tag color="blue">未读</Tag>}
            {emailDetail.is_important && <Tag color="red">重要</Tag>}
            {emailDetail.is_starred && <Tag color="gold">星标</Tag>}
          </Space>
        </HeaderRow>
        
        <SenderInfo>
          <Avatar icon={<UserOutlined />} style={{ marginRight: 12 }} />
          <div>
            <div>
              <Text strong>
                {emailDetail.from_name || emailDetail.from_address}
              </Text>
              {emailDetail.from_name && (
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  &lt;{emailDetail.from_address}&gt;
                </Text>
              )}
            </div>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {dayjs(emailDetail.received_at).format('YYYY-MM-DD HH:mm:ss')}
            </Text>
          </div>
        </SenderInfo>
        
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <div>
            <Text strong>收件人：</Text>
            <Text>{formatEmailAddresses(emailDetail.to_addresses)}</Text>
          </div>
          
          {emailDetail.cc_addresses && (
            <div>
              <Text strong>抄送：</Text>
              <Text>{formatEmailAddresses(emailDetail.cc_addresses)}</Text>
            </div>
          )}
          
          <div>
            <Text strong>发送给：</Text>
            <Text>{emailDetail.alias_email}</Text>
          </div>
        </Space>
      </EmailHeader>

      {/* 邮件内容 */}
      <EmailContent>
        <div className="email-body">
          {emailDetail.body_html ? (
            <div
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(emailDetail.body_html, {
                  ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'img', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code'],
                  ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'target']
                })
              }}
            />
          ) : (
            <div className="text-content">
              {emailDetail.body_text}
            </div>
          )}
        </div>

        {/* 附件列表 */}
        {emailDetail.attachments && emailDetail.attachments.length > 0 && (
          <AttachmentList>
            <Space align="center" style={{ marginBottom: 12 }}>
              <PaperClipOutlined />
              <Text strong>附件 ({emailDetail.attachments.length})</Text>
            </Space>
            
            {emailDetail.attachments.map((attachment) => (
              <AttachmentItem key={attachment.id}>
                <Space>
                  <Text>{attachment.original_filename}</Text>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {(attachment.size_bytes / 1024).toFixed(1)} KB
                  </Text>
                </Space>
                
                <Button
                  size="small"
                  type="link"
                  icon={<DownloadOutlined />}
                  onClick={() => downloadAttachment(attachment.id, attachment.original_filename)}
                >
                  下载
                </Button>
              </AttachmentItem>
            ))}
          </AttachmentList>
        )}
      </EmailContent>

      {/* 回复邮件弹窗 */}
      {replyVisible && (
        <ComposeEmail
          visible={replyVisible}
          onCancel={() => setReplyVisible(false)}
          mode="reply"
          originalEmail={emailDetail}
          onSent={() => {
            setReplyVisible(false);
            refetch();
            onRefresh?.();
          }}
        />
      )}

      {/* 转发邮件弹窗 */}
      {forwardVisible && (
        <ComposeEmail
          visible={forwardVisible}
          onCancel={() => setForwardVisible(false)}
          mode="forward"
          originalEmail={emailDetail}
          onSent={() => {
            setForwardVisible(false);
            refetch();
            onRefresh?.();
          }}
        />
      )}
    </DetailContainer>
  );
};

export default EmailDetail;