import { Layout, Menu, Dropdown, Avatar, Space, Typography } from 'antd';
import {
  HomeOutlined, PictureOutlined, CustomerServiceOutlined, TeamOutlined,
  ProfileOutlined, ToolOutlined, BarChartOutlined, DashboardOutlined,
  SettingOutlined, RobotOutlined, HighlightOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useEffect, useMemo } from 'react';
import { preloadPages } from '../router';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

export default function MainLayout() {
  const nav = useNavigate();
  const loc = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');

  // 登录后后台预热全部页面模块，消除首次打开延时
  useEffect(() => {
    if (!token) return;
    const t = setTimeout(preloadPages, 1500);
    return () => clearTimeout(t);
  }, [token]);

  // 未登录跳转登录页
  if (!token) return <Navigate to="/login" replace />;

  const items = useMemo(() => [
    { key: '/', icon: <HomeOutlined />, label: '首页' },
    { key: '/marketing', icon: <PictureOutlined />, label: '营销内容生产' },
    { key: '/ai-chat', icon: <CustomerServiceOutlined />, label: 'AI客服与销售' },
    { key: '/b-design', icon: <HighlightOutlined />, label: 'B端设计AI' },
    { key: '/crm', icon: <TeamOutlined />, label: '客户管理 (CRM)' },
    { key: '/orders', icon: <ProfileOutlined />, label: '订单管理' },
    { key: '/production', icon: <ToolOutlined />, label: '生产协同' },
    { key: '/data', icon: <BarChartOutlined />, label: '数据汇总' },
    { key: '/cockpit', icon: <DashboardOutlined />, label: '经营驾驶舱' },
    { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
  ], []);

  const selected = '/' + (loc.pathname.split('/')[1] || '');

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={210} style={{ background: '#1f2533' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px' }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#1677ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>钢</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>钢制家具销售与生产<br />协同智能化平台</div>
          </div>
        </div>
        <Menu
          theme="dark" mode="inline" selectedKeys={[selected]} items={items}
          onClick={({ key }) => nav(key)}
          style={{ background: 'transparent', borderInlineEnd: 'none', marginTop: 4 }}
        />
        <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar size={32} style={{ background: '#1677ff' }}>{(user.real_name || '客')[0]}</Avatar>
          <div>
            <div style={{ color: '#fff', fontSize: 12 }}>{user.real_name}</div>
            <Text style={{ color: '#8c93a3', fontSize: 11 }}>{user.username}</Text>
          </div>
        </div>
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', borderBottom: '1px solid #eef0f3', height: 52 }}>
          <Space>
            <Text type="secondary" style={{ fontSize: 12 }}>运营 · 销售 · 生产 · 售后 智能协同</Text>
            <Avatar style={{ background: '#1677ff' }} size={30}>{(user.real_name || '客')[0]}</Avatar>
          </Space>
        </Header>
        <Content style={{ margin: 16, background: '#f5f6f8' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
