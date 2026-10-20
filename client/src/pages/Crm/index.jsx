import { useEffect, useState } from 'react';
import { Card, Table, Button, Input, Select, Tag, Drawer, Descriptions, Timeline, Form, App, Space, DatePicker, Modal } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { api } from '../../api';
import StatusTag from '../../components/StatusTag';
import dayjs from 'dayjs';

export default function Crm() {
  const { message } = App.useApp();
  const [list, setList] = useState({ total: 0, list: [] });
  const [query, setQuery] = useState({ page: 1, page_size: 15 });
  const [detail, setDetail] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const [form] = Form.useForm();
  const [fForm] = Form.useForm();
  const [users, setUsers] = useState([]);

  const load = () => api.get('/customers', { params: query }).then(setList);
  useEffect(() => { load(); api.get('/admin/users').then(setUsers); }, [query]);

  const openDetail = async (id) => setDetail(await api.get(`/customers/${id}`));

  const create = async (v) => {
    await api.post('/customers', { ...v, delivery: undefined });
    message.success('客户已创建');
    setCreateOpen(false); form.resetFields(); load();
  };

  const addFollow = async (v) => {
    await api.post(`/customers/${detail.id}/follow-ups`, { ...v, next_time: v.next_time?.format('YYYY-MM-DD HH:mm') });
    message.success('跟进记录已保存');
    setFollowOpen(false); fForm.resetFields(); openDetail(detail.id);
  };

  return (
    <Card variant="outlined"
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建客户</Button>}
      title={
        <Space wrap>
          <Input.Search allowClear placeholder="搜索客户名/电话/微信" style={{ width: 220 }}
            onSearch={(v) => setQuery((q) => ({ ...q, keyword: v, page: 1 }))} />
          <Select allowClear placeholder="类型" style={{ width: 100 }} onChange={(v) => setQuery((q) => ({ ...q, type: v }))}
            options={[{ value: 'c端', label: 'C端' }, { value: 'b端', label: 'B端' }]} />
          <Select allowClear placeholder="等级" style={{ width: 100 }} onChange={(v) => setQuery((q) => ({ ...q, level: v }))}
            options={[{ value: 'VIP', label: 'VIP' }, { value: '普通', label: '普通' }]} />
        </Space>
      }>
      <Table rowKey="id" dataSource={list.list} pagination={{ total: list.total, pageSize: query.page_size, current: query.page,
        onChange: (p) => setQuery((q) => ({ ...q, page: p })) }}
        onRow={(r) => ({ onClick: () => openDetail(r.id), style: { cursor: 'pointer' } })}
        columns={[
          { title: '客户名称', dataIndex: 'name' },
          { title: '类型', dataIndex: 'type', width: 70, render: (t) => <Tag color={t === 'b端' ? 'purple' : 'blue'}>{t}</Tag> },
          { title: '平台/渠道', dataIndex: 'platform' },
          { title: '电话', dataIndex: 'phone' },
          { title: '地区', dataIndex: 'region' },
          { title: '等级', dataIndex: 'level', render: (l) => l === 'VIP' ? <Tag color="gold">VIP</Tag> : <Tag>普通</Tag> },
          { title: '负责人', dataIndex: 'owner_name' },
          { title: '订单数', dataIndex: 'order_count', width: 80 },
          { title: '备注', dataIndex: 'remark', ellipsis: true },
        ]} />

      <Drawer title={detail?.name} width={560} open={!!detail} onClose={() => setDetail(null)}>
        {detail && (<>
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="类型">{detail.type}</Descriptions.Item>
            <Descriptions.Item label="平台">{detail.platform || '-'}</Descriptions.Item>
            <Descriptions.Item label="电话">{detail.phone || '-'}</Descriptions.Item>
            <Descriptions.Item label="微信">{detail.wechat || '-'}</Descriptions.Item>
            <Descriptions.Item label="地区">{detail.region || '-'}</Descriptions.Item>
            <Descriptions.Item label="等级">{detail.level}</Descriptions.Item>
            <Descriptions.Item label="负责人">{detail.owner_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="建档时间">{detail.created_at?.slice(0, 10)}</Descriptions.Item>
          </Descriptions>

          <div style={{ fontWeight: 600, margin: '16px 0 8px' }}>联系人</div>
          {detail.contacts.map((c) => (
            <Tag key={c.id} style={{ marginBottom: 4 }}>{c.name} {c.position || ''} {c.phone || ''}{c.is_primary ? ' ★' : ''}</Tag>
          ))}
          {detail.contacts.length === 0 && <Text type="secondary">暂无联系人</Text>}

          <div style={{ fontWeight: 600, margin: '16px 0 8px' }}>最近订单</div>
          {detail.orders.map((o) => (
            <div key={o.id} style={{ fontSize: 12, marginBottom: 4 }}>
              <Space><a>{o.order_no}</a><StatusTag status={o.status} /><span>¥{o.total_amount?.toLocaleString()}</span></Space>
            </div>
          ))}
          {detail.orders.length === 0 && <Text type="secondary">暂无订单</Text>}

          <div style={{ fontWeight: 600, margin: '16px 0 8px' }}>
            跟进记录 <Button size="small" type="link" onClick={() => setFollowOpen(true)}>+ 新增跟进</Button>
          </div>
          <Timeline items={detail.follow_ups.map((f) => ({
            children: (<div style={{ fontSize: 12 }}>
              <div>{f.content}</div>
              <Space size={6}><Tag>{f.type}</Tag><Text type="secondary">{f.user_name} · {f.created_at?.slice(0, 16)}</Text></Space>
              {f.next_plan && <div style={{ color: '#0d3027' }}>下次计划：{f.next_plan} {f.next_time || ''}</div>}
            </div>),
          }))} />
        </>)}
      </Drawer>

      <Modal title="新建客户" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={create}>
          <Form.Item name="name" label="客户名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Space size={12}>
            <Form.Item name="type" label="类型" initialValue="c端"><Select style={{ width: 100 }} options={[{ value: 'c端', label: 'C端' }, { value: 'b端', label: 'B端' }]} /></Form.Item>
            <Form.Item name="platform" label="平台/渠道"><Select style={{ width: 130 }} allowClear options={['淘宝', '天猫', '京东', '抖音', '拼多多', '线下', '官网', '百度推广'].map((v) => ({ value: v, label: v }))} /></Form.Item>
            <Form.Item name="level" label="等级" initialValue="普通"><Select style={{ width: 90 }} options={['普通', 'VIP'].map((v) => ({ value: v, label: v }))} /></Form.Item>
          </Space>
          <Space size={12}>
            <Form.Item name="phone" label="电话"><Input /></Form.Item>
            <Form.Item name="wechat" label="微信"><Input /></Form.Item>
            <Form.Item name="region" label="地区"><Input /></Form.Item>
          </Space>
          <Form.Item name="owner_id" label="负责人">
            <Select allowClear showSearch optionFilterProp="label"
              options={users.filter((u) => ['c_agent', 'b_agent'].includes(u.role)).map((u) => ({ value: u.id, label: u.real_name }))} />
          </Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="新增跟进记录" open={followOpen} onCancel={() => setFollowOpen(false)} onOk={() => fForm.submit()}>
        <Form form={fForm} layout="vertical" onFinish={addFollow}>
          <Form.Item name="type" label="方式" initialValue="微信"><Select options={['电话', '微信', '拜访'].map((v) => ({ value: v, label: v }))} /></Form.Item>
          <Form.Item name="content" label="跟进内容" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="next_plan" label="下次计划"><Input /></Form.Item>
          <Form.Item name="next_time" label="计划时间"><DatePicker showTime /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
