import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  List,
  Checkbox,
  Button,
  Space,
  Typography,
  Tag,
  Dropdown,
  Menu,
  Pagination,
  Empty,
  Input,
  message,
  Spin
} from 'antd';
import {
  StarOutlined,
  StarFilled,
  PaperClipOutlined,
  MoreOutlined,
  SearchOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import styled from 'styled-components';
import dayjs from 'dayjs';

import api from '../services/api';
import LoadingSpinner from './LoadingSpinner';

const { Text, Title } = Typography;
const { Search } = Input;

const ListContainer = styled.div`
  height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
`;

const ListHeader = styled.div`
  padding: 16px;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
`;

const ListContent = styled.div`
  flex: 1;
  overflow-y: auto;
`;

const EmailItem = styled(List.Item)`
  cursor: pointer;
  padding: 12px 16px !important;
  border-bottom: 1px solid #f0f0f0;
  transition: all 0.3s;

  &:hover {
    background: #f5f5f5;
  }

  &.unread {
    background: #f9f9f9;
    font-weight: 600;
  }

  &.selected {
    background: #e6f7ff;
  }

  .ant-list-item-meta-title {
    margin-bottom: 4px;
    font-size: 14px;
  }

  .ant-list-item-meta-description {
    font-size: 12px;
    color: #666;
  }
`;

const EmailMeta = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
`;

const ActionBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`;

const BatchActions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const EmailList = ({ aliasId, folder, onRefresh }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  // 获取邮件列表
  const {
    data: emailData,
    isLoading,
    refetch
  } = useQuery(
    ['emails', aliasId, folder, page, search, unreadOnly],
    async () => {
      if (!aliasId) return null;
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        folder,
        search,
        unread_only: unreadOnly.toString()
      });
      const response = await api.get(`/emails/alias/${aliasId}?${params}`);
      return response.data;
    },
    {
      enabled: !!aliasId,
      keepPreviousData: true
    }
  );

  // 批量操作邮件
  const batchMutation = useMutation(
    async ({ action, folder_name }) => {
      await api.patch('/emails/batch', {
        email_ids: selectedEmails,
        action,
        folder_name
      });
    },
    {
      onSuccess: () => {
        setSelectedEmails([]);
        setSelectAll(false);
        refetch();
        onRefresh?.();
        message.success('操作完成');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '操作失败');
      }
    }
  );

  // 单个邮件操作
  const singleMutation = useMutation(
    async ({ emailId, action, value, folder_name }) => {
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

  const emails = emailData?.emails || [];
  const pagination = emailData?.pagination || {};
  const alias = emailData?.alias || {};

  // 处理全选
  const handleSelectAll = (checked) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedEmails(emails.map(email => email.id));
    } else {
      setSelectedEmails([]);
    }
  };

  // 处理单个选择
  const handleSelectEmail = (emailId, checked) => {
    if (checked) {
      setSelectedEmails([...selectedEmails, emailId]);
    } else {
      setSelectedEmails(selectedEmails.filter(id => id !== emailId));
      setSelectAll(false);
    }
  };

  // 处理邮件点击
  const handleEmailClick = (email) => {
    navigate(`/emails/detail/${email.id}`);
    
    // 如果是未读邮件，标记为已读
    if (!email.is_read) {
      singleMutation.mutate({
        emailId: email.id,
        action: 'read',
        value: true
      });
    }
  };

  // 切换星标
  const handleToggleStar = (e, email) => {
    e.stopPropagation();
    singleMutation.mutate({
      emailId: email.id,
      action: 'star',
      value: !email.is_starred
    });
  };

  // 批量操作菜单
  const batchActionMenu = (
    <Menu>
      <Menu.Item 
        key="read" 
        onClick={() => batchMutation.mutate({ action: 'mark_read' })}
      >
        标记为已读
      </Menu.Item>
      <Menu.Item 
        key="unread" 
        onClick={() => batchMutation.mutate({ action: 'mark_unread' })}
      >
        标记为未读
      </Menu.Item>
      <Menu.Item 
        key="star" 
        onClick={() => batchMutation.mutate({ action: 'star' })}
      >
        添加星标
      </Menu.Item>
      <Menu.Item 
        key="unstar" 
        onClick={() => batchMutation.mutate({ action: 'unstar' })}
      >
        移除星标
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item 
        key="archive" 
        onClick={() => batchMutation.mutate({ action: 'move', folder_name: 'archive' })}
      >
        归档
      </Menu.Item>
      <Menu.Item 
        key="delete" 
        onClick={() => batchMutation.mutate({ action: 'delete' })}
      >
        删除
      </Menu.Item>
    </Menu>
  );

  // 单个邮件操作菜单
  const emailActionMenu = (email) => (
    <Menu>
      <Menu.Item 
        key="read"
        onClick={() => singleMutation.mutate({
          emailId: email.id,
          action: 'read',
          value: !email.is_read
        })}
      >
        {email.is_read ? '标记为未读' : '标记为已读'}
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item 
        key="archive"
        onClick={() => singleMutation.mutate({
          emailId: email.id,
          action: 'move',
          folder_name: 'archive'
        })}
      >
        归档
      </Menu.Item>
      <Menu.Item 
        key="delete"
        onClick={() => singleMutation.mutate({
          emailId: email.id,
          action: 'move',
          folder_name: 'trash'
        })}
      >
        删除
      </Menu.Item>
    </Menu>
  );

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <ListContainer>
      <ListHeader>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Search
            placeholder="搜索邮件..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={() => refetch()}
            enterButton={<SearchOutlined />}
            allowClear
          />
          
          <ActionBar>
            <Space>
              <Checkbox
                checked={selectAll}
                indeterminate={selectedEmails.length > 0 && selectedEmails.length < emails.length}
                onChange={(e) => handleSelectAll(e.target.checked)}
              >
                全选
              </Checkbox>
              
              {selectedEmails.length > 0 && (
                <BatchActions>
                  <Text type="secondary">
                    已选择 {selectedEmails.length} 封邮件
                  </Text>
                  <Dropdown overlay={batchActionMenu}>
                    <Button size="small">
                      批量操作 <MoreOutlined />
                    </Button>
                  </Dropdown>
                </BatchActions>
              )}
            </Space>
            
            <Space>
              <Button
                size="small"
                type={unreadOnly ? 'primary' : 'default'}
                onClick={() => setUnreadOnly(!unreadOnly)}
              >
                {unreadOnly ? '显示全部' : '只看未读'}
              </Button>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => refetch()}
              />
            </Space>
          </ActionBar>
        </Space>
      </ListHeader>

      <ListContent>
        {emails.length === 0 ? (
          <Empty
            description={search ? '没有找到匹配的邮件' : '暂无邮件'}
            style={{ marginTop: 100 }}
          />
        ) : (
          <List
            dataSource={emails}
            renderItem={(email) => (
              <EmailItem
                className={`${!email.is_read ? 'unread' : ''} ${
                  selectedEmails.includes(email.id) ? 'selected' : ''
                }`}
                onClick={() => handleEmailClick(email)}
                actions={[
                  <Button
                    type="text"
                    icon={email.is_starred ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                    onClick={(e) => handleToggleStar(e, email)}
                  />,
                  <Dropdown 
                    overlay={emailActionMenu(email)} 
                    trigger={['click']}
                    onClick={e => e.stopPropagation()}
                  >
                    <Button type="text" icon={<MoreOutlined />} />
                  </Dropdown>
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <Checkbox
                      checked={selectedEmails.includes(email.id)}
                      onChange={(e) => handleSelectEmail(email.id, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  }
                  title={
                    <Space>
                      <Text strong={!email.is_read}>
                        {email.from_name || email.from_address}
                      </Text>
                      {email.attachment_count > 0 && (
                        <PaperClipOutlined style={{ color: '#999' }} />
                      )}
                    </Space>
                  }
                  description={
                    <div>
                      <Text>{email.subject}</Text>
                      <EmailMeta>
                        <Space size={4}>
                          {!email.is_read && <Tag color="blue" size="small">未读</Tag>}
                          {email.is_important && <Tag color="red" size="small">重要</Tag>}
                        </Space>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          {dayjs(email.received_at).format('MM-DD HH:mm')}
                        </Text>
                      </EmailMeta>
                    </div>
                  }
                />
              </EmailItem>
            )}
          />
        )}
      </ListContent>

      {pagination.total > 0 && (
        <div style={{ padding: '16px', textAlign: 'center', borderTop: '1px solid #f0f0f0' }}>
          <Pagination
            current={pagination.current_page}
            total={pagination.total}
            pageSize={pagination.per_page}
            onChange={(newPage) => setPage(newPage)}
            showSizeChanger={false}
            showQuickJumper
            showTotal={(total, range) => 
              `${range[0]}-${range[1]} 共 ${total} 封邮件`
            }
          />
        </div>
      )}
    </ListContainer>
  );
};

export default EmailList;