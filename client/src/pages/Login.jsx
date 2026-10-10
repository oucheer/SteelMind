import { useState } from 'react';
import { Card, Form, Input, Button, Typography, App } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Login() {
  const nav = useNavigate();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const onFinish = async (v) => {
    setLoading(true);
    try {
      const r = await api.post('/auth/login', v);
      localStorage.setItem('token', r.token);
      localStorage.setItem('user', JSON.stringify(r.user));
      message.success(`欢迎，${r.user.real_name}`);
      nav('/');
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#1f2533 0%,#2b3a55 100%)' }}>
      <Card style={{ width: 400, borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.25)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: '#1677ff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 26, fontWeight: 700 }}>钢</div>
          <Typography.Title level={4} style={{ marginTop: 12, marginBottom: 2 }}>钢制家具销售与生产协同平台</Typography.Title>
          <Typography.Text type="secondary">AI 驱动的销售运营与生产协同系统</Typography.Text>
        </div>
        <Form onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]} initialValue="admin">
            <Input prefix={<UserOutlined />} placeholder="用户名（admin / agent_c1 / agent_b1 / manager1 / factory1）" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]} initialValue="123456">
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>登 录</Button>
        </Form>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center', marginTop: 14 }}>
          演示账号密码统一为 123456：admin 管理员 / agent_c1 C端客服 / agent_b1 B端业务员 / manager1 销售管理 / factory1 生产
        </Typography.Text>
      </Card>
    </div>
  );
}
