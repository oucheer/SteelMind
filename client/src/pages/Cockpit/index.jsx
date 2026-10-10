import { useEffect, useState } from 'react';
import { Card, Tabs, Row, Col, Statistic, Table, Tag } from 'antd';
import { Pie, Column } from '@ant-design/charts';
import { api } from '../../api';
import StatusTag from '../../components/StatusTag';

const COLORS = ['#1677ff', '#52c41a', '#faad14', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16', '#2f54eb'];

function PieCard({ title, data, nameKey = 'name', valKey = 'value' }) {
  return (
    <Card title={title} size="small" variant="outlined" styles={{ body: { padding: '8px 12px' } }}>
      <Pie data={data} angleField={valKey} colorField={nameKey} height={240} innerRadius={0.5}
        color={COLORS} label={{ text: nameKey, style: { fontSize: 11 } }} legend={{ color: { position: 'bottom' } }} />
    </Card>
  );
}
function ColCard({ title, data, xKey, yKey, unit = '' }) {
  return (
    <Card title={title} size="small" variant="outlined" styles={{ body: { padding: '8px 12px' } }}>
      <Column data={data} xField={xKey} yField={yKey} height={240} colorField={xKey} color={COLORS} legend={false}
        yAxis={{ labelFormatter: (v) => `${v}${unit}` }} />
    </Card>
  );
}

export default function Cockpit() {
  const [d, setD] = useState({});

  const load = (dimension) => api.get('/analytics/overview', { params: { dimension } }).then((r) => setD((old) => ({ ...old, [dimension]: r })));
  useEffect(() => { ['operations', 'sales', 'production', 'after_sales'].forEach(load); }, []);

  const ops = d.operations || {};
  const sales = d.sales || {};
  const prod = d.production || {};
  const as_ = d.after_sales || {};

  return (
    <Card variant="outlined">
      <Tabs items={[
        {
          key: 'ops', label: '运营端', children: (
            <>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={8}><Card size="small"><Statistic title="素材总数" value={(ops.materials || []).reduce((s, m) => s + m.c, 0)} /></Card></Col>
                <Col span={8}><Card size="small"><Statistic title="待审核素材" value={ops.pending_review || 0} valueStyle={{ color: ops.pending_review ? '#faad14' : undefined }} /></Card></Col>
                <Col span={8}><Card size="small"><Statistic title="AI 咨询会话" value={(ops.conversations || []).reduce((s, m) => s + m.value, 0)} /></Card></Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}><PieCard title="素材平台分布" data={ops.by_platform || []} /></Col>
                <Col span={12}><PieCard title="咨询会话渠道分布" data={ops.conversations || []} /></Col>
              </Row>
            </>
          ),
        },
        {
          key: 'sales', label: '销售端', children: (
            <>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={8}><Card size="small"><Statistic title="待审批事项" value={sales.pending_approvals || 0} valueStyle={{ color: sales.pending_approvals ? '#faad14' : undefined }} /></Card></Col>
                <Col span={8}><Card size="small"><Statistic title="超3天待确认订单" value={sales.crm_pending || 0} valueStyle={{ color: sales.crm_pending ? '#fa541c' : undefined }} /></Card></Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}><PieCard title="订单状态分布" data={sales.order_by_status || []} /></Col>
                <Col span={12}><PieCard title="报价单状态分布" data={sales.quote_by_status || []} /></Col>
              </Row>
              <Card title="业务员业绩" size="small" variant="outlined" style={{ marginTop: 16 }} styles={{ body: { padding: 0 } }}>
                <Table size="small" rowKey="name" dataSource={sales.by_agent || []} pagination={false} columns={[
                  { title: '业务员', dataIndex: 'name' },
                  { title: '订单数', dataIndex: 'order_count' },
                  { title: '销售金额', dataIndex: 'amount', render: (v) => `¥${(v || 0).toLocaleString()}` },
                ]} />
              </Card>
            </>
          ),
        },
        {
          key: 'prod', label: '生产端', children: (
            <>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={8}><Card size="small"><Statistic title="生产完成率" value={prod.completion || 0} suffix="%" /></Card></Col>
                <Col span={8}><Card size="small"><Statistic title="交期紧急任务" value={prod.urgent || 0} valueStyle={{ color: prod.urgent ? '#fa541c' : undefined }} /></Card></Col>
                <Col span={8}><Card size="small"><Statistic title="生产组总数" value={(prod.by_status || []).reduce((s, m) => s + m.value, 0)} /></Card></Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}><PieCard title="生产状态分布" data={prod.by_status || []} /></Col>
                <Col span={12}><ColCard title="产品需求 TOP8" data={prod.top_products || []} xKey="name" yKey="value" unit=" 件" /></Col>
              </Row>
            </>
          ),
        },
        {
          key: 'as', label: '售后与交付', children: (
            <>
              <Row gutter={16}>
                <Col span={12}><PieCard title="发货状态分布" data={as_.by_status || []} /></Col>
                <Col span={12}><PieCard title="物流公司分布" data={as_.by_logistics || []} /></Col>
              </Row>
              <Row gutter={16} style={{ marginTop: 16 }}>
                <Col span={12}><PieCard title="售后类型分布" data={as_.after_sales || []} /></Col>
              </Row>
            </>
          ),
        },
      ]} />
    </Card>
  );
}
