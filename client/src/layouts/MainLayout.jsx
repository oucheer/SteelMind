import { Layout, Menu, Dropdown, Avatar, Space, Typography, Input, Select, Popover, Empty, Badge } from 'antd';
import {
  HomeOutlined, PictureOutlined, CustomerServiceOutlined, TeamOutlined,
  ProfileOutlined, ToolOutlined, BarChartOutlined, DashboardOutlined,
  SettingOutlined, RobotOutlined, HighlightOutlined, SearchOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { preloadPages } from '../router';
import { api } from '../api';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

// 角色 → 工作区名（参考站的角色工作区设计）
const WORKSPACE = {
  admin: '运营工作区', operator: '运营工作区', executive: '经营工作区',
  c_agent: '客服工作区', b_agent: '销售工作区', sales_manager: '销售工作区',
  production: '生产工作区', after_sales: '售后工作区',
};

export default function MainLayout() {
  const nav = useNavigate();
  const loc = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');
  const searchRef = useRef(null);
  const [kw, setKw] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);

  // 登录后后台预热全部页面模块，消除首次打开延时
  useEffect(() => {
    if (!token) return;
    const t = setTimeout(preloadPages, 1500);
    return () => clearTimeout(t);
  }, [token]);

  // ⌘K / Ctrl+K 聚焦全局搜索
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 全局搜索：客户 / 订单 / 产品
  useEffect(() => {
    if (!kw.trim()) { setResults(null); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try { setResults(await api.get('/search', { params: { q: kw.trim() } })); }
      catch { setResults(null); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [kw]);

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
  const workspace = WORKSPACE[user.role] || '运营工作区';

  const searchContent = (
    <div style={{ width: 380, maxHeight: 420, overflow: 'auto' }}>
      {!results ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="输入关键词搜索客户、订单、产品" style={{ margin: '20px 0' }} />
      ) : (
        <>
          {[['客户', results.customers, (x) => ({ key: 'c_' + x.id, label: `${x.name}（${x.type || '客户'}）` }), '/crm'],
            ['订单', results.orders, (x) => ({ key: 'o_' + x.id, label: `${x.order_no} · ${x.customer_name || ''} · ¥${x.total_amount}` }), '/orders'],
            ['产品', results.products, (x) => ({ key: 'p_' + x.id, label: `${x.name} ${x.model || ''}` }), '/settings']].map(([title, list, toOpt, path]) => (
            list?.length > 0 && (
              <div key={title} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#999', padding: '4px 12px' }}>{title}</div>
                {list.slice(0, 5).map((x) => {
                  const opt = toOpt(x);
                  return (
                    <div key={opt.key} onClick={() => { nav(path); setKw(''); }}
                      style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}
                      onMouseEnter={(e) => e.target.style.background = '#f5f6f8'}
                      onMouseLeave={(e) => e.target.style.background = 'transparent'}>
                      {opt.label}
                    </div>
                  );
                })}
              </div>
            )
          ))}
          {!(results.customers?.length || results.orders?.length || results.products?.length) &&
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无匹配结果" style={{ margin: '20px 0' }} />}
        </>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* 固定侧边栏：不随内容滚动，菜单过长时自身滚动 */}
      <Sider width={210} style={{ background: '#1f2533', height: '100vh', position: 'fixed', inset: '0 auto 0 0', zIndex: 100, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px', flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#1677ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>钢</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>钢制家具销售与生产<br />协同智能化平台</div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Menu
            theme="dark" mode="inline" selectedKeys={[selected]} items={items}
            onClick={({ key }) => nav(key)}
            style={{ background: 'transparent', borderInlineEnd: 'none', marginTop: 4 }}
          />
        </div>
        <div style={{ flexShrink: 0, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar size={32} style={{ background: '#1677ff' }}>{(user.real_name || '客')[0]}</Avatar>
          <div>
            <div style={{ color: '#fff', fontSize: 12 }}>{user.real_name}</div>
            <Text style={{ color: '#8c93a3', fontSize: 11 }}>{user.username}</Text>
          </div>
        </div>
      </Sider>

      {/* 右侧独立滚动区域 */}
      <div style={{ flex: 1, marginLeft: 210, height: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Header style={{
          background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 16,
          borderBottom: '1px solid #eef0f3', height: 52, flexShrink: 0,
          position: 'sticky', top: 0, zIndex: 99,
        }}>
          <Badge status="processing" text={<Text strong style={{ fontSize: 13 }}>{workspace}</Text>} />
          <div style={{ flex: 1 }} />
          <Popover content={searchContent} trigger="click" open={!!kw} placement="bottomRight" styles={{ body: { padding: '8px 0' } }}>
            <Input
              ref={searchRef} allowClear prefix={<SearchOutlined style={{ color: '#999' }} />}
              placeholder="搜索客户、订单号、产品型号（Ctrl+K）" value={kw}
              onChange={(e) => setKw(e.target.value)} loading={searching}
              style={{ width: 300, borderRadius: 18, background: '#f5f6f8' }}
            />
          </Popover>
          <Text type="secondary" style={{ fontSize: 12 }}>运营 · 销售 · 生产 · 售后 智能协同</Text>
          <Avatar style={{ background: '#1677ff' }} size={30}>{(user.real_name || '客')[0]}</Avatar>
        </Header>
        <Content style={{ margin: 16, background: '#f5f6f8', flexShrink: 0 }}>
          <Outlet />
        </Content>
      </div>
    </div>
  );
}
