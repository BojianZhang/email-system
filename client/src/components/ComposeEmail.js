import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Upload,
  Space,
  Typography,
  Tag,
  message,
  Divider
} from 'antd';
import {
  PaperClipOutlined,
  DeleteOutlined,
  SendOutlined,
  SaveOutlined
} from '@ant-design/icons';
import { useMutation } from 'react-query';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import styled from 'styled-components';

import api from '../services/api';

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

const StyledModal = styled(Modal)`
  .ant-modal-body {
    padding: 0;
  }
`;

const ComposeHeader = styled.div`
  padding: 16px 24px;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
`;

const ComposeContent = styled.div`
  padding: 24px;
  max-height: 60vh;
  overflow-y: auto;
`;

const AttachmentArea = styled.div`
  margin-top: 16px;
  padding: 12px;
  background: #fafafa;
  border-radius: 6px;
  border: 1px dashed #d9d9d9;
`;

const AttachmentItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid #f0f0f0;
  
  &:last-child {
    border-bottom: none;
  }
`;

const ComposeEmail = ({ 
  visible, 
  onCancel, 
  onSent,
  aliases = [],
  defaultAliasId,
  mode = 'new', // 'new', 'reply', 'forward'
  originalEmail 
}) => {
  const [form] = Form.useForm();
  const [attachments, setAttachments] = useState([]);
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [useRichEditor, setUseRichEditor] = useState(true);

  // 发送邮件
  const sendMutation = useMutation(
    async (values) => {
      const formData = new FormData();
      
      // 基本信息
      formData.append('alias_id', values.alias_id);
      formData.append('subject', values.subject);
      formData.append('body_html', useRichEditor ? bodyHtml : '');
      formData.append('body_text', useRichEditor ? '' : bodyText);
      
      // 收件人信息
      const toAddresses = values.to_addresses.split(/[,;\s]+/).filter(addr => addr.trim());
      toAddresses.forEach(addr => {
        formData.append('to_addresses[]', addr.trim());
      });
      
      if (values.cc_addresses) {
        const ccAddresses = values.cc_addresses.split(/[,;\s]+/).filter(addr => addr.trim());
        ccAddresses.forEach(addr => {
          formData.append('cc_addresses[]', addr.trim());
        });
      }
      
      if (values.bcc_addresses) {
        const bccAddresses = values.bcc_addresses.split(/[,;\s]+/).filter(addr => addr.trim());
        bccAddresses.forEach(addr => {
          formData.append('bcc_addresses[]', addr.trim());
        });
      }
      
      // 附件
      attachments.forEach(file => {
        formData.append('attachments', file.originFileObj || file);
      });
      
      const response = await api.post('/emails/send', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    },
    {
      onSuccess: () => {
        message.success('邮件发送成功');
        form.resetFields();
        setAttachments([]);
        setBodyHtml('');
        setBodyText('');
        onSent?.();
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '发送失败');
      }
    }
  );

  // 初始化表单（回复/转发时）
  useEffect(() => {
    if (visible && originalEmail && mode !== 'new') {
      const formValues = {};
      
      if (mode === 'reply') {
        // 回复
        formValues.to_addresses = originalEmail.from_address;
        formValues.subject = originalEmail.subject.startsWith('Re:') 
          ? originalEmail.subject 
          : `Re: ${originalEmail.subject}`;
        
        // 构建回复内容
        const replyContent = `
          <br><br>
          <div style="border-left: 4px solid #ccc; padding-left: 16px; margin-top: 20px;">
            <p><strong>原邮件</strong></p>
            <p><strong>发件人:</strong> ${originalEmail.from_name || originalEmail.from_address}</p>
            <p><strong>发送时间:</strong> ${new Date(originalEmail.received_at).toLocaleString()}</p>
            <p><strong>主题:</strong> ${originalEmail.subject}</p>
            <hr>
            ${originalEmail.body_html || `<pre>${originalEmail.body_text}</pre>`}
          </div>
        `;
        setBodyHtml(replyContent);
        
      } else if (mode === 'forward') {
        // 转发
        formValues.subject = originalEmail.subject.startsWith('Fwd:') 
          ? originalEmail.subject 
          : `Fwd: ${originalEmail.subject}`;
        
        // 构建转发内容
        const forwardContent = `
          <br><br>
          <div style="border: 1px solid #ddd; padding: 16px; margin-top: 20px;">
            <p><strong>---------- 转发邮件 ----------</strong></p>
            <p><strong>发件人:</strong> ${originalEmail.from_name || originalEmail.from_address}</p>
            <p><strong>发送时间:</strong> ${new Date(originalEmail.received_at).toLocaleString()}</p>
            <p><strong>收件人:</strong> ${Array.isArray(originalEmail.to_addresses) ? originalEmail.to_addresses.join(', ') : originalEmail.to_addresses}</p>
            <p><strong>主题:</strong> ${originalEmail.subject}</p>
            <br>
            ${originalEmail.body_html || `<pre>${originalEmail.body_text}</pre>`}
          </div>
        `;
        setBodyHtml(forwardContent);
      }
      
      form.setFieldsValue(formValues);
    } else if (visible && mode === 'new') {
      // 新邮件
      form.setFieldsValue({
        alias_id: defaultAliasId
      });
      setBodyHtml('');
      setBodyText('');
    }
  }, [visible, originalEmail, mode, form, defaultAliasId]);

  // 附件处理
  const handleAttachmentChange = ({ fileList }) => {
    setAttachments(fileList);
  };

  const removeAttachment = (file) => {
    setAttachments(attachments.filter(item => item.uid !== file.uid));
  };

  // 富文本编辑器配置
  const quillModules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'color': [] }, { 'background': [] }],
      ['link', 'image'],
      ['clean']
    ],
  };

  const getModalTitle = () => {
    switch (mode) {
      case 'reply':
        return '回复邮件';
      case 'forward':
        return '转发邮件';
      default:
        return '写邮件';
    }
  };

  return (
    <StyledModal
      title={getModalTitle()}
      visible={visible}
      onCancel={onCancel}
      width={800}
      footer={null}
      destroyOnClose
    >
      <ComposeHeader>
        <Space>
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={sendMutation.isLoading}
            onClick={() => form.submit()}
          >
            发送
          </Button>
          <Button
            icon={<SaveOutlined />}
            onClick={() => message.info('保存草稿功能待实现')}
          >
            保存草稿
          </Button>
          <Button
            type={useRichEditor ? 'primary' : 'default'}
            size="small"
            onClick={() => setUseRichEditor(!useRichEditor)}
          >
            {useRichEditor ? '富文本' : '纯文本'}
          </Button>
        </Space>
      </ComposeHeader>

      <ComposeContent>
        <Form
          form={form}
          layout="vertical"
          onFinish={sendMutation.mutate}
        >
          <Form.Item
            name="alias_id"
            label="发件人"
            rules={[{ required: true, message: '请选择发件人别名' }]}
          >
            <Select placeholder="选择发件人别名">
              {aliases.map(alias => (
                <Option key={alias.id} value={alias.id}>
                  <Space direction="vertical" size={0}>
                    <span>{alias.full_email}</span>
                    {alias.display_name && (
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        {alias.display_name}
                      </Text>
                    )}
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="to_addresses"
            label="收件人"
            rules={[{ required: true, message: '请输入收件人邮箱' }]}
          >
            <Input placeholder="多个邮箱用逗号或分号分隔" />
          </Form.Item>

          <Form.Item
            name="cc_addresses"
            label="抄送"
          >
            <Input placeholder="多个邮箱用逗号或分号分隔" />
          </Form.Item>

          <Form.Item
            name="bcc_addresses"
            label="密送"
          >
            <Input placeholder="多个邮箱用逗号或分号分隔" />
          </Form.Item>

          <Form.Item
            name="subject"
            label="主题"
            rules={[{ required: true, message: '请输入邮件主题' }]}
          >
            <Input placeholder="邮件主题" />
          </Form.Item>

          <Form.Item label="正文">
            {useRichEditor ? (
              <ReactQuill
                value={bodyHtml}
                onChange={setBodyHtml}
                modules={quillModules}
                style={{ minHeight: '200px' }}
                placeholder="请输入邮件内容..."
              />
            ) : (
              <TextArea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={10}
                placeholder="请输入邮件内容..."
              />
            )}
          </Form.Item>

          {/* 附件区域 */}
          <AttachmentArea>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space align="center">
                <PaperClipOutlined />
                <Text>附件</Text>
                <Upload
                  multiple
                  fileList={[]}
                  onChange={handleAttachmentChange}
                  beforeUpload={() => false}
                  showUploadList={false}
                >
                  <Button size="small">添加附件</Button>
                </Upload>
              </Space>

              {attachments.length > 0 && (
                <div>
                  {attachments.map((file) => (
                    <AttachmentItem key={file.uid}>
                      <Space>
                        <Text>{file.name}</Text>
                        <Tag size="small">
                          {(file.size / 1024).toFixed(1)} KB
                        </Tag>
                      </Space>
                      <Button
                        type="text"
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => removeAttachment(file)}
                        danger
                      />
                    </AttachmentItem>
                  ))}
                </div>
              )}
            </Space>
          </AttachmentArea>
        </Form>
      </ComposeContent>
    </StyledModal>
  );
};

export default ComposeEmail;