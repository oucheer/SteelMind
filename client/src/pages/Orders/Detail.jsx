import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Button, Tag, App, Space, Steps, Modal, Select, Input, Divider, Typography } from 'antd';
import { ArrowLeftOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { api } from '../../api';
import StatusTag from '../../components/StatusTag';

const { Text } = Typography;

export default function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { message } = App.useApp();
  const [order, setOrder] = useState(null);
  const [trace, setTrace] = useState(null);

  const load = () => api.get(`/orders/${id}`).then(setOrder);
  useEffect(() => { load(); }, [id]);

  const genRequisition = async () => {
    try {
      const r = await api.post(`/orders/${id}/generate-requisition`);
      message.success(`报货清单已生成：${r.item_count} 行明细，已自动归入产品汇总`);
      load();
    } catch (e) { message.error(e.message); }
  };

  const pushCrm = async () => {
    try {
      const r = await api.get('/mock/crm/push', { params: { order_id: id } });
      message.success(r.message);
    } catch (e) { message.error(e.message); }
  };

  const viewTrace = async (groupId) => {
    setTrace(await api.get(`/production/summary/${groupId}/trace`));
  };

  if (!order) return null;

  return (
    <Card variant="outlined" title={<Space><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => nav('/orders')} />订单详情 {order.order_no} <StatusTag status={order.status} /></Space>}
      extra={<Space>
        <Button type="primary" icon={<ThunderboltOutlined />} onClick={genRequisition}
          disabled={order.item_count === 0 || order.items?.[0]?.status !== '待报货'}>生成报货清单</Button>
        <Button onClick={pushCrm}>同步 CRM(模拟)</Button>
      </Space>}>
      <Descriptions column={3} size="small" bordered>
        <Descriptions.Item label="客户">{order.customer_name}</Descriptions.Item>
        <Descriptions.Item label="电话">{order.customer_phone || '-'}</Descriptions.Item>
        <Descriptions.Item label="来源">{order.source}</Descriptions.Item>
        <Descriptions.Item label="业务员">{order.sales_name}</Descriptions.Item>
        <Descriptions.Item label="金额">¥{(order.total_amount || 0).toLocaleString()}</Descriptions.Item>
        <Descriptions.Item label="要求交期">{order.expected_delivery || '-'}</Descriptions.Item>
        <Descriptions.Item label="渠道单号">{order.channel_order_no || '-'}</Descriptions.Item>
        <Descriptions.Item label="下单时间">{order.created_at?.slice(0, 16)}</Descriptions.Item>
        <Descriptions.Item label="关联报价">{order.quote ? `${order.quote.quote_no} (${order.quote.status})` : '-'}</Descriptions.Item>
      </Descriptions>

      <Divider orientation="left">产品行项目（报货明细）</Divider>
      <Table size="small" rowKey="id" dataSource={order.items} pagination={false} columns={[
        { title: '产品', render: (v, r) => `${r.product_name || ''} ${r.model || ''}` },
        { title: '颜色', dataIndex: 'color', width: 80 },
        { title: '规格', dataIndex: 'spec' },
        { title: '定制参数', dataIndex: 'custom_params', render: (v) => v ? <Tag color="purple">{v}</Tag> : '-' },
        { title: '数量', dataIndex: 'qty', width: 70 },
        { title: '明细状态', dataIndex: 'status', render: (s) => <StatusTag status={s} /> },
        { title: '所属生产组', dataIndex: 'group_id', render: (v, r) => v
          ? <Button size="small" type="link" onClick={() => viewTrace(v)}>查看（{r.group_status}）</Button>
          : <Tag>未归组</Tag> },
      ]} />

      {order.shipments.length > 0 && (<>
        <Divider orientation="left">发货记录</Divider>
        {order.shipments.map((s) => (
          <div key={s.id} style={{ fontSize: 12, marginBottom: 4 }}>
            <Space><a>{s.shipment_no}</a><StatusTag status={s.status} /><span>{s.logistics_company} {s.tracking_no || ''}</span><Text type="secondary">{s.ship_date || ''}</Text></Space>
          </div>
        ))}
      </>)}

      <Modal title="生产组溯源（来源订单/业务员）" open={!!trace} onCancel={() => setTrace(null)} footer={null} width={720}>
        {trace && <>
          <Table size="small" rowKey="item_id" dataSource={trace} pagination={false} columns={[
            { title: '订单号', dataIndex: 'order_no' },
            { title: '客户', dataIndex: 'customer_name' },
            { title: '业务员', dataIndex: 'sales_name' },
            { title: '数量', dataIndex: 'qty', width: 60 },
            { title: '颜色', dataIndex: 'color', width: 70 },
            { title: '要求交期', dataIndex: 'expected_delivery' },
            { title: '订单状态', dataIndex: 'order_status', render: (s) => <StatusTag status={s} /> },
          ]} />
          <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
            合计数量：{trace.reduce((s, r) => s + r.qty, 0)} 件 · 来自 {trace.length} 条报货明细
          </div>
        </>}
      </Modal>
    </Card>
  );
}
