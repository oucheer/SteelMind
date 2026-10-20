import { useEffect, useState } from 'react';
import { Card, Row, Col, Form, Input, Select, DatePicker, Button, Table, App, Tabs, Tag, Descriptions, Empty, Space, Typography } from 'antd';
import { ThunderboltOutlined, LayoutOutlined } from '@ant-design/icons';
import { api } from '../../api';
import StatusTag from '../../components/StatusTag';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Text } = Typography;

export default function BDesign() {
  const { message } = App.useApp();
  const [reqs, setReqs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [active, setActive] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [layout, setLayout] = useState(null);
  const [loadingA, setLoadingA] = useState(false);
  const [form] = Form.useForm();

  const load = () => api.get('/b-design/requirements').then(setReqs);
  useEffect(() => { load(); api.get('/customers', { params: { type: 'b端', page_size: 100 } }).then((r) => setCustomers(r.list)); }, []);

  const submit = async (v) => {
    const furniture = v.furniture_text.split('\n').filter(Boolean).map((line) => {
      const [name, qty, size] = line.split(/[,，\s]+/);
      return { name, qty: +qty || 1, size: size || '待定' };
    });
    const r = await api.post('/b-design/requirements', { ...v, furniture_list: furniture, delivery_date: v.delivery_date?.format('YYYY-MM-DD') });
    message.success('需求已结构化保存');
    form.resetFields();
    load();
    setActive({ id: r.id });
  };

  const analyze = async () => {
    const r = active;
    setLoadingA(true);
    try {
      const full = reqs.find((x) => x.id === r.id);
      const demand = `空间类型：${full.space_type}，尺寸：${full.space_size}；家具需求：${full.furniture_list}；预算：${full.budget}；交期：${full.delivery_date}`;
      const result = await api.post('/ai/requirement-analysis', { requirement_id: r.id, demand });
      setAnalysis(result);
      message.success('AI 需求分析完成');
      load();
    } catch (e) { message.error(e.message); }
    finally { setLoadingA(false); }
  };

  const genLayout = async () => {
    try {
      const r = await api.post('/b-design/layout-mock', { requirement_id: active.id });
      setLayout(r);
      message.success('布局方案已生成（模拟酷家乐对接）');
    } catch (e) { message.error(e.message); }
  };

  const FurnitureList = ({ data }) => {
    let items = [];
    try { items = JSON.parse(data || '[]'); } catch { /* */ }
    return <>{items.map((f, i) => <Tag key={i} color="blue">{f.name} ×{f.qty} {f.size !== '待定' ? f.size : ''}</Tag>)}</>;
  };

  return (
    <Card variant="outlined">
      <Tabs items={[
        {
          key: 'list', label: '需求列表', children: (
            <Table rowKey="id" dataSource={reqs} pagination={{ pageSize: 8 }}
              rowSelection={{ type: 'radio', selectedRowKeys: active ? [active.id] : [], onSelect: (r) => { setActive(r); setAnalysis(null); setLayout(null); } }}
              columns={[
                { title: '客户', dataIndex: 'customer_name' },
                { title: '空间', render: (v, r) => `${r.space_type || '-'} ${r.space_size || ''}` },
                { title: '家具需求', dataIndex: 'furniture_list', render: (v) => <FurnitureList data={v} /> },
                { title: '预算', dataIndex: 'budget' },
                { title: '交期', dataIndex: 'delivery_date' },
                { title: '状态', dataIndex: 'status', render: (s) => <StatusTag status={s} /> },
                { title: '负责人', dataIndex: 'user_name' },
              ]} />
          ),
        },
        {
          key: 'new', label: '新建需求', children: (
            <Row gutter={24}>
              <Col xs={24} lg={10}>
                <Form form={form} layout="vertical" onFinish={submit}>
                  <Form.Item name="customer_id" label="客户（B端）" rules={[{ required: true }]}>
                    <Select showSearch optionFilterProp="label" placeholder="选择客户"
                      options={customers.map((c) => ({ value: c.id, label: c.name }))} />
                  </Form.Item>
                  <Space style={{ width: '100%' }} size={12}>
                    <Form.Item name="space_type" label="空间类型" rules={[{ required: true }]} style={{ width: 160 }}>
                      <Select options={['办公室', '档案室', '学校宿舍', '工厂仓库', '酒店', '图书馆'].map((v) => ({ value: v, label: v }))} />
                    </Form.Item>
                    <Form.Item name="space_size" label="空间尺寸" style={{ width: 180 }}>
                      <Input placeholder="如 12m x 8m" />
                    </Form.Item>
                  </Space>
                  <Form.Item name="furniture_text" label="家具需求（每行：名称 数量 尺寸）" rules={[{ required: true }]}>
                    <TextArea rows={4} placeholder={'文件柜 10 900*450*2000\n工位桌 8 1400*700*750'} />
                  </Form.Item>
                  <Space size={12}>
                    <Form.Item name="budget" label="预算"><Input placeholder="如 8万以内" /></Form.Item>
                    <Form.Item name="delivery_date" label="要求交期"><DatePicker /></Form.Item>
                  </Space>
                  <Button type="primary" htmlType="submit">保存结构化需求</Button>
                </Form>
              </Col>
              <Col xs={24} lg={14}>
                <Empty description="保存需求后，在列表中选中即可进行 AI 分析" />
              </Col>
            </Row>
          ),
        },
      ]} />

      {active && (
        <Card size="small" style={{ marginTop: 16 }} title="AI 分析与设计辅助"
          extra={<Space>
            <Button type="primary" icon={<ThunderboltOutlined />} loading={loadingA} onClick={analyze}>AI 需求分析</Button>
            <Button icon={<LayoutOutlined />} onClick={genLayout}>生成平面布局(模拟)</Button>
          </Space>}>
          {analysis ? (
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="空间分析" span={2}>{analysis.space_analysis}</Descriptions.Item>
              <Descriptions.Item label="推荐配置" span={2}>
                {(analysis.recommended_configs || []).map((c, i) => (
                  <div key={i} style={{ fontSize: 12 }}><Tag color="blue">{c.product} ×{c.qty}</Tag>{c.spec} — {c.reason}</div>
                ))}
              </Descriptions.Item>
              <Descriptions.Item label="风险点" span={1}>
                {(analysis.risks || []).map((r, i) => <div key={i} style={{ color: '#fa541c', fontSize: 12 }}>· {r}</div>)}
              </Descriptions.Item>
              <Descriptions.Item label="待确认问题" span={1}>
                {(analysis.confirm_questions || []).map((q, i) => <div key={i} style={{ color: '#0d3027', fontSize: 12 }}>？{q}</div>)}
              </Descriptions.Item>
            </Descriptions>
          ) : <Text type="secondary">点击「AI 需求分析」生成空间分析、推荐配置、风险与待确认问题清单</Text>}

          {layout && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>平面布局示意 <Tag color="purple">{layout.tool}</Tag></div>
              <div style={{ border: '1px dashed #d9d9d9', borderRadius: 8, padding: 12, background: '#fafafa', position: 'relative', height: 420 }}>
                {layout.items.map((it, i) => (
                  <div key={i} style={{
                    position: 'absolute', left: it.x, top: it.y, width: it.w, height: it.h,
                    background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 6, padding: 8, fontSize: 12,
                  }}>
                    <div style={{ fontWeight: 600 }}>{it.name}</div>
                    <div style={{ color: '#666' }}>{it.size}</div>
                    <div style={{ color: '#999', marginTop: 4 }}>{it.note}</div>
                  </div>
                ))}
              </div>
              {(layout.disclaimers || []).map((d, i) => <div key={i} style={{ color: '#fa541c', fontSize: 12, marginTop: 4 }}>⚠ {d}</div>)}
            </div>
          )}
        </Card>
      )}
    </Card>
  );
}
