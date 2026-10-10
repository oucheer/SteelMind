import { useEffect, useState } from 'react';
import { Card, Table, Tag, Space, Input, Select, Button, App, Form, Modal } from 'antd';
import { PlusOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import StatusTag from '../../components/StatusTag';

export default function Orders() {
  const nav = useNavigate();
  const { message } = App.useApp();
  const [list, setList] = useState({ total: 0, list: [] });
  const [query, setQuery] = useState({ page: 1, page_size: 15 });
  const [createOpen, setCreateOpen] = useState(false);

  const load = () => api.get('/orders', { params: query }).then(setList);
  useEffect(() => { load(); }, [query]);

  // 模拟平台拉单
  const mockPull = async () => {
    try {
      const r = await api.post('/mock/platform/pull-orders', {});
      message.success(`已从 ${r.platform} 拉取模拟订单 ${r.order_no}：${r.product} ×${r.qty}，¥${r.amount}`);
      load();
    } catch (e) { message.error(e.message); }
  };

  return (
    <Card variant="outlined"
      title={<Space wrap>
        <Input.Search allowClear placeholder="订单号/客户名" style={{ width: 200 }} onSearch={(v) => setQuery((q) => ({ ...q, keyword: v, page: 1 }))} />
        <Select allowClear placeholder="状态" style={{ width: 120 }} onChange={(v) => setQuery((q) => ({ ...q, status: v }))}
          options={['待确认', '已确认', '生产中', '部分发货', '已发货', '已完成', '已取消'].map((v) => ({ value: v, label: v }))} />
        <Select allowClear placeholder="来源平台" style={{ width: 110 }} onChange={(v) => setQuery((q) => ({ ...q, source: v }))}
          options={['淘宝', '天猫', '京东', '抖音', '拼多多', '线下', '官网'].map((v) => ({ value: v, label: v }))} />
      </Space>}
      extra={<Space>
        <Button icon={<CloudDownloadOutlined />} onClick={mockPull}>模拟平台拉单</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>手工建单</Button>
      </Space>}>
      <Table rowKey="id" dataSource={list.list}
        pagination={{ total: list.total, pageSize: query.page_size, current: query.page, onChange: (p) => setQuery((q) => ({ ...q, page: p })) }}
        onRow={(r) => ({ onClick: () => nav(`/orders/${r.id}`), style: { cursor: 'pointer' } })}
        columns={[
          { title: '订单号', dataIndex: 'order_no' },
          { title: '客户', dataIndex: 'customer_name' },
          { title: '来源', dataIndex: 'source', render: (s) => <Tag color="blue">{s}</Tag> },
          { title: '业务员', dataIndex: 'sales_name' },
          { title: '金额', dataIndex: 'total_amount', render: (v) => `¥${(v || 0).toLocaleString()}`, sorter: (a, b) => a.total_amount - b.total_amount },
          { title: '要求交期', dataIndex: 'expected_delivery' },
          { title: '报货明细', dataIndex: 'item_count', render: (v) => v > 0 ? `${v} 行` : <Tag color="orange">未生成</Tag> },
          { title: '状态', dataIndex: 'status', render: (s) => <StatusTag status={s} /> },
          { title: '下单时间', dataIndex: 'created_at', render: (v) => v?.slice(0, 10) },
        ]} />
      <CreateOrder open={createOpen} onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); load(); }} />
    </Card>
  );
}

function CreateOrder({ open, onClose, onDone }) {
  const { message } = App.useApp();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([]);
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      api.get('/customers', { params: { page_size: 100 } }).then((r) => setCustomers(r.list));
      api.get('/admin/products').then((ps) => setProducts(ps.flatMap((p) => p.skus.map((s) => ({ ...s, product_name: p.name, model: p.model })))));
    }
  }, [open]);

  return (
    <Modal title="手工创建订单" open={open} width={680} onCancel={onClose} onOk={() => form.submit()} okText="创建订单">
      <Form form={form} layout="vertical" onFinish={async (v) => {
        if (!items.length) { message.warning('请至少添加一个产品行'); return; }
        await api.post('/orders', { ...v, items });
        message.success('订单已创建');
        setItems([]); form.resetFields(); onDone();
      }}>
        <Space size={12} style={{ display: 'flex' }}>
          <Form.Item name="customer_id" label="客户" rules={[{ required: true }]} style={{ flex: 1 }}>
            <Select showSearch optionFilterProp="label" style={{ width: 240 }} options={customers.map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="source" label="来源" initialValue="线下"><Select style={{ width: 110 }} options={['线下', '官网', '百度推广'].map((v) => ({ value: v, label: v }))} /></Form.Item>
          <Form.Item name="expected_delivery" label="要求交期"><Input placeholder="2026-10-25" /></Form.Item>
        </Space>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>产品行</div>
        {items.map((it, i) => (
          <Space key={i} style={{ display: 'flex', marginBottom: 6 }}>
            <Tag color="blue">{it.product_name} {it.model}</Tag><span>{it.color} {it.spec}</span>
            <Input type="number" min={1} value={it.qty} style={{ width: 80 }}
              onChange={(e) => setItems((arr) => arr.map((x, j) => j === i ? { ...x, qty: +e.target.value } : x))} />
            <Button size="small" danger onClick={() => setItems((arr) => arr.filter((_, j) => j !== i))}>移除</Button>
          </Space>
        ))}
        <Select showSearch optionFilterProp="label" placeholder="+ 添加产品行（选择 SKU）" style={{ width: '100%' }}
          value={null}
          onSelect={(sid) => setItems((arr) => [...arr, { ...products.find((p) => p.id === sid), qty: 1 }])}
          options={products.map((p) => ({ value: p.id, label: `${p.product_name} ${p.model} | ${p.color} | ${p.spec} | ¥${p.price}` }))} />
      </Form>
    </Modal>
  );
}
