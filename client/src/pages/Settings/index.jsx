import { useEffect, useState } from 'react';
import { Card, Tabs, Table, Button, Form, Input, Select, App, Modal, Tag, Space, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { api } from '../../api';
import StatusTag from '../../components/StatusTag';

const { TextArea } = Input;
const { Text } = Typography;

const ROLE_LABELS = {
  operator: '运营', c_agent: 'C端客服', b_agent: 'B端业务员', sales_manager: '销售管理',
  production: '工厂生产', after_sales: '售后物流', executive: '企业管理层', admin: '系统管理员',
};

export default function Settings() {
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [knowledge, setKnowledge] = useState([]);
  const [logs, setLogs] = useState({ total: 0, list: [] });
  const [approvals, setApprovals] = useState([]);
  const [logQuery, setLogQuery] = useState({ page: 1, page_size: 20 });
  const [editUser, setEditUser] = useState(null);
  const [editKb, setEditKb] = useState(null);
  const [kbModal, setKbModal] = useState(false);
  const [prodModal, setProdModal] = useState(false);
  const [uForm] = Form.useForm();
  const [kForm] = Form.useForm();
  const [pForm] = Form.useForm();
  const { message } = App.useApp();

  const load = () => {
    api.get('/admin/users').then(setUsers);
    api.get('/admin/products').then(setProducts);
    api.get('/admin/knowledge').then(setKnowledge);
    api.get('/admin/approvals').then(setApprovals);
    api.get('/admin/logs', { params: logQuery }).then(setLogs);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { api.get('/admin/logs', { params: logQuery }).then(setLogs); }, [logQuery]);

  // ===== 用户 Tab =====
  const userTab = (
    <>
      <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => { uForm.resetFields(); setEditUser({}); }}>新建用户</Button>
      <Table size="small" rowKey="id" dataSource={users} pagination={false} columns={[
        { title: '用户名', dataIndex: 'username' },
        { title: '姓名', dataIndex: 'real_name' },
        { title: '角色', dataIndex: 'role', render: (r) => <Tag color="blue">{ROLE_LABELS[r] || r}</Tag> },
        { title: '电话', dataIndex: 'phone' },
        { title: '状态', dataIndex: 'status', render: (s) => <StatusTag status={s === 'active' ? '已完成' : '已取消'} /> },
        { title: '操作', render: (v, r) => <Button size="small" onClick={() => { uForm.setFieldsValue(r); setEditUser(r); }}>编辑</Button> },
      ]} />
      <Modal title={editUser?.id ? '编辑用户' : '新建用户'} open={!!editUser} onCancel={() => setEditUser(null)} onOk={() => uForm.submit()}>
        <Form form={uForm} layout="vertical" onFinish={async (v) => {
          if (editUser.id) await api.put(`/admin/users/${editUser.id}`, v);
          else await api.post('/admin/users', v);
          message.success('已保存');
          setEditUser(null); load();
        }}>
          {!editUser?.id && <Form.Item name="username" label="用户名" rules={[{ required: true }]}><Input /></Form.Item>}
          {!editUser?.id && <Form.Item name="password" label="初始密码" initialValue="123456"><Input /></Form.Item>}
          <Form.Item name="real_name" label="姓名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="phone" label="电话"><Input /></Form.Item>
          {editUser?.id && <Form.Item name="status" label="状态"><Select options={[{ value: 'active', label: '启用' }, { value: 'disabled', label: '停用' }]} /></Form.Item>}
        </Form>
      </Modal>
    </>
  );

  // ===== 产品 Tab =====
  const prodRows = products.flatMap((p) => p.skus.map((s) => ({ ...s, product_name: p.name, category: p.category })));
  const prodTab = (
    <>
      <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => { pForm.resetFields(); setProdModal(true); }}>新建产品（含SKU）</Button>
      <Table size="small" rowKey="id" dataSource={prodRows} pagination={{ pageSize: 15 }} columns={[
        { title: '品类', dataIndex: 'category', width: 90 },
        { title: '产品', dataIndex: 'product_name' },
        { title: '颜色', dataIndex: 'color', width: 75 },
        { title: '规格', dataIndex: 'spec', width: 130 },
        { title: '定制参数', dataIndex: 'custom_params', render: (v) => v ? <Tag color="purple">{v}</Tag> : '-' },
        { title: '价格', dataIndex: 'price', render: (v) => `¥${v}` },
        { title: '库存', dataIndex: 'stock' },
      ]} />
      <Modal title="新建产品" open={prodModal} onCancel={() => setProdModal(false)} onOk={() => pForm.submit()} width={620}>
        <Form form={pForm} layout="vertical" onFinish={async (v) => {
          const skus = (v.sku_text || '').split('\n').filter(Boolean).map((line) => {
            const [color, spec, price] = line.split(/[,，\s]+/);
            return { color, spec, price: +price };
          });
          await api.post('/admin/products', { ...v, skus });
          message.success('产品已创建');
          setProdModal(false); load();
        }}>
          <Space size={12}>
            <Form.Item name="category" label="品类" rules={[{ required: true }]}>
              <Select style={{ width: 140 }} options={['文件柜', '更衣柜', '密集架', '货架', '工位桌', '床品'].map((v) => ({ value: v, label: v }))} />
            </Form.Item>
            <Form.Item name="name" label="产品名称" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="model" label="型号" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="base_price" label="基础价格"><Input type="number" /></Form.Item>
          </Space>
          <Form.Item name="description" label="描述"><TextArea rows={2} /></Form.Item>
          <Form.Item name="sku_text" label="SKU（每行：颜色 规格 价格，如：灰白 900*450*2000 680）">
            <TextArea rows={3} placeholder={'灰白 900*450*2000 680\n蓝色 900*450*2000 680'} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );

  // ===== 知识库 Tab =====
  const kbTab = (
    <>
      <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }}
        onClick={() => { kForm.resetFields(); setEditKb({}); setKbModal(true); }}>新增知识条目</Button>
      <Table size="small" rowKey="id" dataSource={knowledge} pagination={false} columns={[
        { title: '标题', dataIndex: 'title' },
        { title: '分类', dataIndex: 'category', render: (c) => <Tag color="blue">{c}</Tag> },
        { title: '内容', dataIndex: 'content', ellipsis: true },
        { title: '启用', dataIndex: 'enabled', render: (v) => v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag> },
        { title: '操作', render: (v, r) => <Space>
          <Button size="small" onClick={() => { kForm.setFieldsValue(r); setEditKb(r); setKbModal(true); }}>编辑</Button>
          <Button size="small" danger onClick={async () => { await api.delete(`/admin/knowledge/${r.id}`); message.success('已删除'); load(); }}>删除</Button>
        </Space> },
      ]} />
      <Modal title={editKb?.id ? '编辑知识条目' : '新增知识条目'} open={kbModal} onCancel={() => setKbModal(false)} onOk={() => kForm.submit()}>
        <Form form={kForm} layout="vertical" onFinish={async (v) => {
          if (editKb?.id) await api.put(`/admin/knowledge/${editKb.id}`, v);
          else await api.post('/admin/knowledge', v);
          message.success('已保存');
          setKbModal(false); load();
        }}>
          <Form.Item name="title" label="标题" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="category" label="分类" rules={[{ required: true }]}>
            <Select options={['产品知识', '价格政策', '售后政策', '话术'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true }]}><TextArea rows={4} /></Form.Item>
        </Form>
      </Modal>
    </>
  );

  // ===== 审批 Tab =====
  const apprTab = (
    <Table size="small" rowKey="id" dataSource={approvals} pagination={false} columns={[
      { title: '类型', dataIndex: 'type', render: (t) => <Tag color="blue">{t}</Tag> },
      { title: '摘要', dataIndex: 'summary', ellipsis: true },
      { title: '申请人', dataIndex: 'applicant_name' },
      { title: '状态', dataIndex: 'status', render: (s) => <StatusTag status={s} /> },
      { title: '审批人', dataIndex: 'approver_name', render: (v) => v || '-' },
      { title: '时间', dataIndex: 'created_at', render: (v) => v?.slice(5, 16) },
      { title: '操作', render: (v, r) => r.status === '待审批' ? (
        <Space>
          <Button size="small" type="primary" onClick={async () => { await api.post(`/admin/approvals/${r.id}`, { status: '通过', comment: '同意' }); message.success('已通过'); load(); }}>通过</Button>
          <Button size="small" danger onClick={async () => { await api.post(`/admin/approvals/${r.id}`, { status: '驳回', comment: '驳回' }); message.success('已驳回'); load(); }}>驳回</Button>
        </Space>
      ) : r.comment },
    ]} />
  );

  // ===== 日志 Tab =====
  const logTab = (
    <>
      <Input.Search allowClear placeholder="搜索操作/操作人" style={{ width: 220, marginBottom: 12 }}
        onSearch={(v) => setLogQuery((q) => ({ ...q, keyword: v, page: 1 }))} />
      <Table size="small" rowKey="id" dataSource={logs.list}
        pagination={{ total: logs.total, pageSize: logQuery.page_size, current: logQuery.page, onChange: (p) => setLogQuery((q) => ({ ...q, page: p })) }}
        columns={[
          { title: '操作人', dataIndex: 'user_name', width: 90 },
          { title: '操作', dataIndex: 'action' },
          { title: '对象类型', dataIndex: 'target_type', render: (t) => <Tag>{t || '-'}</Tag> },
          { title: '变更内容', dataIndex: 'after_json', ellipsis: true, render: (v) => v ? <Text code style={{ fontSize: 11 }}>{v.slice(0, 60)}</Text> : '-' },
          { title: 'IP', dataIndex: 'ip', width: 110 },
          { title: '时间', dataIndex: 'created_at', width: 150 },
        ]} />
    </>
  );

  return (
    <Card variant="outlined">
      <Tabs items={[
        { key: 'users', label: '用户权限', children: userTab },
        { key: 'products', label: '产品资料', children: prodTab },
        { key: 'kb', label: '知识库', children: kbTab },
        { key: 'approvals', label: '审批中心', children: apprTab },
        { key: 'logs', label: '操作日志', children: logTab },
      ]} />
    </Card>
  );
}
