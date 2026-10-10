import { useEffect, useState } from 'react';
import { Card, Tabs, Table, Tag, Button, App, Modal, Select, Input, Space, Form } from 'antd';
import { api } from '../../api';
import StatusTag from '../../components/StatusTag';
import dayjs from 'dayjs';

export default function DataCenter() {
  const { message } = App.useApp();
  const [shipments, setShipments] = useState([]);
  const [afterSales, setAfterSales] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [arrange, setArrange] = useState(null);
  const [form] = Form.useForm();

  const load = () => {
    api.get('/shipments').then(setShipments);
    api.get('/shipments/after-sales').then(setAfterSales);
    api.get('/orders', { params: { status: '已确认', page_size: 100 } }).then((r) => setPendingOrders(r.list));
  };
  useEffect(() => { load(); }, []);

  const createShipment = async (order) => {
    await api.post('/shipments', { order_id: order.id });
    message.success(`订单 ${order.order_no} 已生成发货交接清单`);
    load();
  };

  const arrangeShip = async (v) => {
    await api.post(`/shipments/${arrange.id}/status`, { status: v.status, logistics_company: v.logistics_company, tracking_no: v.tracking_no });
    message.success('物流安排已保存');
    setArrange(null); form.resetFields(); load();
  };

  const shipCols = [
    { title: '发货单号', dataIndex: 'shipment_no' },
    { title: '订单号', dataIndex: 'order_no' },
    { title: '客户', dataIndex: 'customer_name' },
    { title: '收货人', dataIndex: 'receiver' },
    { title: '地址', dataIndex: 'address', ellipsis: true },
    { title: '物流公司', dataIndex: 'logistics_company', render: (v) => v || <Tag color="orange">待安排</Tag> },
    { title: '运单号', dataIndex: 'tracking_no', render: (v) => v || '-' },
    { title: '发货日期', dataIndex: 'ship_date', render: (v) => v || '-' },
    { title: '状态', dataIndex: 'status', render: (s) => <StatusTag status={s} /> },
    { title: '操作', render: (v, r) => (
      <Button size="small" disabled={r.status === '已签收'} onClick={() => setArrange(r)}>
        {r.status === '待安排' ? '安排物流' : '更新状态'}
      </Button>
    ) },
  ];

  return (
    <Card variant="outlined">
      <Tabs items={[
        {
          key: 'ship', label: '发货清单', children: (
            <Table size="small" rowKey="id" dataSource={shipments} pagination={{ pageSize: 15 }} columns={shipCols} scroll={{ x: 1100 }} />
          ),
        },
        {
          key: 'pending', label: '待生成发货单的订单', children: (
            <Table size="small" rowKey="id" dataSource={pendingOrders} pagination={{ pageSize: 10 }} columns={[
              { title: '订单号', dataIndex: 'order_no' },
              { title: '客户', dataIndex: 'customer_name' },
              { title: '金额', dataIndex: 'total_amount', render: (v) => `¥${(v || 0).toLocaleString()}` },
              { title: '状态', dataIndex: 'status', render: (s) => <StatusTag status={s} /> },
              { title: '操作', render: (v, r) => <Button size="small" type="primary" onClick={() => createShipment(r)}>生成发货清单</Button> },
            ]} />
          ),
        },
        {
          key: 'after', label: '售后记录', children: (
            <Table size="small" rowKey="id" dataSource={afterSales} pagination={{ pageSize: 10 }} columns={[
              { title: '订单号', dataIndex: 'order_no' },
              { title: '类型', dataIndex: 'type', render: (t) => <Tag color="blue">{t}</Tag> },
              { title: '内容', dataIndex: 'content', ellipsis: true },
              { title: '处理人', dataIndex: 'handler_name', render: (v) => v || '-' },
              { title: '状态', dataIndex: 'status', render: (s) => <StatusTag status={s} /> },
            ]} />
          ),
        },
      ]} />

      <Modal title={`物流安排 — ${arrange?.shipment_no || ''}`} open={!!arrange} onCancel={() => setArrange(null)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={arrangeShip} initialValues={{ status: '已发货' }}>
          <Form.Item label="订单信息">
            <Input.TextArea value={arrange ? `客户：${arrange.customer_name}｜收货人：${arrange.receiver}｜地址：${arrange.address}` : ''} rows={2} disabled />
          </Form.Item>
          <Form.Item name="logistics_company" label="物流/车辆" rules={[{ required: true }]}>
            <Select options={['德邦物流', '跨越速运', '顺丰速运', '自有车辆配送'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="tracking_no" label="运单号"><Input placeholder="发货后填写" /></Form.Item>
          <Form.Item name="status" label="状态"><Select options={['已发货', '已签收'].map((v) => ({ value: v, label: v }))} /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
