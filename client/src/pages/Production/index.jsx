import { useEffect, useState, useMemo } from 'react';
import { Card, Tabs, Table, Tag, Space, Select, Button, App, Modal, Input, Steps, Statistic, Row, Col, DatePicker, Tooltip, Typography, Form, Checkbox } from 'antd';
import { ReloadOutlined, EyeOutlined, NotificationOutlined, WarningOutlined, DownloadOutlined } from '@ant-design/icons';
import { api } from '../../api';
import StatusTag from '../../components/StatusTag';
import dayjs from 'dayjs';

const { Text } = Typography;

const FLOW = ['待确认', '待排产', '已排产', '生产中', '待质检', '待发货', '已发货', '已完成'];

// CSV 导出（带 BOM，Excel 直接打开不乱码）
function exportCSV(filename, columns, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [columns.map((c) => esc(c.title)).join(','), ...rows.map((r) => columns.map((c) => esc(typeof c.export === 'function' ? c.export(r) : r[c.dataIndex])).join(','))].join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Production() {
  const [users, setUsers] = useState([]);
  const [requisitions, setRequisitions] = useState([]);
  const [summary, setSummary] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [reqFilter, setReqFilter] = useState({});
  const [trace, setTrace] = useState(null);
  const [feedbackGroup, setFeedbackGroup] = useState(null);
  const { message, modal } = App.useApp();

  const load = () => {
    api.get('/production/requisitions', { params: reqFilter }).then(setRequisitions);
    api.get('/production/summary').then(setSummary);
    api.get('/production/schedule').then(setSchedule);
  };
  useEffect(() => { load(); api.get('/admin/users').then(setUsers); }, []);
  useEffect(() => { api.get('/production/requisitions', { params: reqFilter }).then(setRequisitions); }, [reqFilter]);

  const urgent = (delivery) => {
    if (!delivery || ['已发货', '已完成'].includes(delivery)) return 0;
    return dayjs(delivery).diff(dayjs(), 'day');
  };

  // ===== Tab1: 个人报货明细 =====
  const reqColumns = [
    { title: '报货日期', dataIndex: 'created_at', render: (v) => v?.slice(0, 10), width: 95 },
    { title: '业务员', dataIndex: 'sales_name', width: 80 },
    { title: '客户', dataIndex: 'customer_name' },
    { title: '订单号', dataIndex: 'order_no' },
    { title: '产品', render: (v, r) => `${r.product_name || ''} ${r.model || ''}` },
    { title: '数量', dataIndex: 'qty', width: 60 },
    { title: '颜色', dataIndex: 'color', width: 70 },
    { title: '规格', dataIndex: 'spec' },
    { title: '定制参数', dataIndex: 'custom_params', render: (v) => v ? <Tag color="purple">{v}</Tag> : '-' },
    { title: '要求交期', dataIndex: 'expected_delivery', render: (v, r) => {
      const d = urgent(v);
      return <span style={{ color: d <= 3 && !['已发货', '已完成'].includes(r.group_status || '') ? '#fa541c' : undefined }}>{v || '-'}</span>;
    } },
    { title: '明细状态', dataIndex: 'status', render: (s) => <StatusTag status={s} /> },
    { title: '生产组状态', dataIndex: 'group_status', render: (s, r) => s
      ? <Button size="small" type="link" onClick={() => api.get(`/production/summary/${r.group_id}/trace`).then(setTrace)}>溯源</Button> : '-' },
  ];

  // ===== Tab2: 产品汇总 =====
  const sumColumns = [
    { title: '产品', render: (v, r) => `${r.product_name || ''} ${r.model || ''}` },
    { title: '颜色', dataIndex: 'color', width: 75 },
    { title: '规格', dataIndex: 'spec', width: 120 },
    { title: '定制参数', dataIndex: 'custom_params', render: (v) => v ? <Tag color="purple">{v}</Tag> : '-' },
    { title: '汇总数量', dataIndex: 'total_qty', width: 90, render: (v) => <Text strong style={{ fontSize: 15 }}>{v}</Text> },
    { title: '来源明细', dataIndex: 'source_item_count', width: 85, render: (v, r) => `${v} 条` },
    { title: '最早交期', dataIndex: 'earliest_delivery', render: (v, r) => {
      if (!v) return '-';
      const d = urgent(v);
      const isUrgent = d <= 3 && !['已发货', '已完成'].includes(r.status);
      return <span style={{ color: isUrgent ? '#fa541c' : undefined, fontWeight: isUrgent ? 600 : 400 }}>
        {isUrgent && <WarningOutlined />} {v}{isUrgent ? ` (${d <= 0 ? '已逾期' : `剩${d}天`})` : ''}
      </span>;
    } },
    { title: '生产状态', dataIndex: 'status', render: (s) => <StatusTag status={s} /> },
    { title: '进度', dataIndex: 'progress_pct', width: 110, render: (v) => `${v || 0}%` },
    { title: '操作', width: 100, render: (v, r) => <Button size="small" icon={<EyeOutlined />} onClick={() => api.get(`/production/summary/${r.id}/trace`).then(setTrace)}>溯源</Button> },
  ];

  // ===== Tab3: 生产计划 =====
  const schedColumns = [
    { title: '任务', render: (v, r) => <Text strong>#{r.id.slice(0, 6)}</Text> },
    { title: '产品', render: (v, r) => `${r.product_name || ''} ${r.model || ''}` },
    { title: '颜色/规格', render: (v, r) => `${r.color} · ${r.spec}` },
    { title: '数量', dataIndex: 'total_qty', width: 65 },
    { title: '计划开始', dataIndex: 'plan_start', width: 95 },
    { title: '计划完成', dataIndex: 'plan_end', width: 95 },
    { title: '车间', dataIndex: 'workshop', width: 80, render: (v) => v || '-' },
    { title: '当前状态', dataIndex: 'status', width: 90, render: (s) => <StatusTag status={s} /> },
    { title: '进度', width: 130, render: (v, r) => (
      <Steps size="small" current={FLOW.indexOf(r.status)} percent={r.progress_pct || 0} style={{ maxWidth: 130 }}
        items={FLOW.map((f) => ({ title: '' }))} />
    ) },
    { title: '操作', width: 190, render: (v, r) => {
      const idx = FLOW.indexOf(r.status);
      const next = FLOW[idx + 1];
      return (
        <Space size={4}>
          {next && <Button size="small" type="primary" onClick={() => transition(r, next)}>→ {next}</Button>}
          <Button size="small" icon={<NotificationOutlined />} onClick={() => setFeedbackGroup(r)}>反馈</Button>
        </Space>
      );
    } },
  ];

  const transition = (r, next) => {
    if (next === '已排产' || next === '生产中') {
      modal.info({
        title: `流转到「${next}」`,
        content: (
          <div style={{ marginTop: 12 }}>
            <div>设置计划日期与车间：</div>
            <Space style={{ marginTop: 8 }}>
              <DatePicker placeholder="计划开始" onChange={(v) => (window.__ps = v?.format('YYYY-MM-DD'))} />
              <DatePicker placeholder="计划完成" onChange={(v) => (window.__pe = v?.format('YYYY-MM-DD'))} />
              <Select placeholder="车间" style={{ width: 110 }} onChange={(v) => (window.__ws = v)}
                options={['一车间', '二车间', '三车间'].map((v) => ({ value: v, label: v }))} />
            </Space>
          </div>
        ),
        onOk: async () => {
          try {
            await api.post(`/production/summary/${r.id}/status`, { status: next, plan_start: window.__ps, plan_end: window.__pe, workshop: window.__ws });
            message.success(`已流转到「${next}」，明细状态已同步反写`);
            load();
          } catch (e) { message.error(e.message); }
        },
      });
    } else {
      api.post(`/production/summary/${r.id}/status`, { status: next })
        .then(() => { message.success(`已流转到「${next}」`); load(); })
        .catch((e) => message.error(e.message));
    }
  };

  const [onlyUrgent, setOnlyUrgent] = useState(false);

  const stats = useMemo(() => {
    const s = { pending: 0, producing: 0, urgent: 0, total: summary.length };
    summary.forEach((g) => {
      if (['待确认', '待排产'].includes(g.status)) s.pending++;
      if (['已排产', '生产中', '待质检'].includes(g.status)) s.producing++;
      const d = urgent(g.earliest_delivery);
      if (d <= 3 && !['已发货', '已完成'].includes(g.status)) s.urgent++;
    });
    return s;
  }, [summary]);

  // 今日报货统计（参考站每日报货页设计）
  const todayStats = useMemo(() => {
    const today = dayjs().format('YYYY-MM-DD');
    const todayRows = requisitions.filter((r) => (r.created_at || '').slice(0, 10) === today);
    return {
      reported: todayRows.reduce((s, r) => s + (r.qty || 0), 0),
      count: todayRows.length,
      plannedQty: summary.filter((g) => !['已发货', '已完成'].includes(g.status)).reduce((s, g) => s + (g.total_qty || 0), 0),
    };
  }, [requisitions, summary]);

  const urgentSummary = useMemo(() => summary.filter((g) => urgent(g.earliest_delivery) <= 3 && !['已发货', '已完成'].includes(g.status)), [summary]);
  const urgentSchedule = useMemo(() => schedule.filter((g) => urgent(g.plan_end) <= 3 && !['已发货', '已完成'].includes(g.status)), [schedule]);

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}><Card size="small"><Statistic title="待排产任务" value={stats.pending} suffix=" 组" /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="生产中任务" value={stats.producing} suffix=" 组" /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="交期紧急" value={stats.urgent} suffix=" 组" valueStyle={{ color: stats.urgent ? '#fa541c' : undefined }} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="生产组总数" value={stats.total} suffix=" 组" /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="今日已报货" value={todayStats.reported} suffix=" 件" extra={`${todayStats.count} 笔`} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="在产/待产总量" value={todayStats.plannedQty} suffix=" 件" /></Card></Col>
      </Row>
      <Card variant="outlined">
        <Tabs items={[
          {
            key: 'req', label: '个人报货明细', children: (
              <>
                <Space style={{ marginBottom: 12 }} wrap>
                  <Select allowClear placeholder="按业务员筛选" style={{ width: 150 }} onChange={(v) => setReqFilter((f) => ({ ...f, user_id: v }))}
                    options={users.filter((u) => ['c_agent', 'b_agent'].includes(u.role)).map((u) => ({ value: u.id, label: u.real_name }))} />
                  <Select allowClear placeholder="明细状态" style={{ width: 120 }} onChange={(v) => setReqFilter((f) => ({ ...f, status: v }))}
                    options={['待报货', '已报货', '生产中', '已入库', '已发货'].map((v) => ({ value: v, label: v }))} />
                  <Button size="small" icon={<DownloadOutlined />}
                    onClick={() => exportCSV(`报货明细_${dayjs().format('YYYYMMDD')}.csv`, [
                      { title: '报货日期', export: (r) => (r.created_at || '').slice(0, 10) },
                      { title: '业务员', dataIndex: 'sales_name' }, { title: '客户', dataIndex: 'customer_name' },
                      { title: '订单号', dataIndex: 'order_no' },
                      { title: '产品', export: (r) => `${r.product_name || ''} ${r.model || ''}` },
                      { title: '数量', dataIndex: 'qty' }, { title: '颜色', dataIndex: 'color' },
                      { title: '规格', dataIndex: 'spec' }, { title: '定制参数', dataIndex: 'custom_params' },
                      { title: '要求交期', dataIndex: 'expected_delivery' }, { title: '明细状态', dataIndex: 'status' },
                    ], requisitions)}>导出 CSV</Button>
                </Space>
                <Table size="small" rowKey="id" dataSource={requisitions} pagination={{ pageSize: 15 }} columns={reqColumns} scroll={{ x: 1200 }} />
              </>
            ),
          },
          {
            key: 'summary', label: '产品汇总', children: (
              <>
                <Space style={{ marginBottom: 8 }} wrap>
                  <Checkbox checked={onlyUrgent} onChange={(e) => setOnlyUrgent(e.target.checked)}>仅看急单（3天内交期）</Checkbox>
                  <Button size="small" icon={<DownloadOutlined />}
                    onClick={() => exportCSV(`产品汇总_${dayjs().format('YYYYMMDD')}.csv`, [
                      { title: '产品', export: (r) => `${r.product_name || ''} ${r.model || ''}` },
                      { title: '颜色', dataIndex: 'color' }, { title: '规格', dataIndex: 'spec' },
                      { title: '定制参数', dataIndex: 'custom_params' }, { title: '汇总数量', dataIndex: 'total_qty' },
                      { title: '来源明细数', dataIndex: 'source_item_count' }, { title: '最早交期', dataIndex: 'earliest_delivery' },
                      { title: '生产状态', dataIndex: 'status' }, { title: '进度%', dataIndex: 'progress_pct' },
                    ], onlyUrgent ? urgentSummary : summary)}>导出 CSV</Button>
                </Space>
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary">按「产品型号 + 颜色 + 规格 + 定制参数」归一化分组合并数量；只有生产条件完全一致的明细才会合并，且每组可追溯来源订单和业务员。</Text>
                </div>
                <Table size="small" rowKey="id" dataSource={onlyUrgent ? urgentSummary : summary} pagination={{ pageSize: 15 }} columns={sumColumns} scroll={{ x: 1100 }}
                  rowClassName={(r) => (urgent(r.earliest_delivery) <= 3 && !['已发货', '已完成'].includes(r.status)) ? 'row-urgent' : ''} />
              </>
            ),
          },
          {
            key: 'schedule', label: '生产进度计划', children: (
              <>
                <Space style={{ marginBottom: 8 }} wrap>
                  <Checkbox checked={onlyUrgent} onChange={(e) => setOnlyUrgent(e.target.checked)}>仅看急单（3天内交期）</Checkbox>
                  <Button size="small" icon={<DownloadOutlined />}
                    onClick={() => exportCSV(`生产计划_${dayjs().format('YYYYMMDD')}.csv`, [
                      { title: '任务ID', export: (r) => '#' + r.id.slice(0, 6) },
                      { title: '产品', export: (r) => `${r.product_name || ''} ${r.model || ''}` },
                      { title: '颜色/规格', export: (r) => `${r.color} · ${r.spec}` },
                      { title: '数量', dataIndex: 'total_qty' }, { title: '计划开始', dataIndex: 'plan_start' },
                      { title: '计划完成', dataIndex: 'plan_end' }, { title: '车间', dataIndex: 'workshop' },
                      { title: '当前状态', dataIndex: 'status' }, { title: '进度%', dataIndex: 'progress_pct' },
                    ], onlyUrgent ? urgentSchedule : schedule)}>导出 CSV</Button>
                </Space>
                <Table size="small" rowKey="id" dataSource={onlyUrgent ? urgentSchedule : schedule} pagination={{ pageSize: 12 }} columns={schedColumns} scroll={{ x: 1200 }} />
              </>
            ),
          },
        ]} />
      </Card>

      {/* 溯源抽屉 */}
      <Modal title="汇总溯源 — 来源订单与业务员" open={!!trace} onCancel={() => setTrace(null)} footer={null} width={760}>
        {trace && <>
          <Table size="small" rowKey="item_id" dataSource={trace} pagination={false} columns={[
            { title: '订单号', dataIndex: 'order_no' },
            { title: '客户', dataIndex: 'customer_name' },
            { title: '业务员', dataIndex: 'sales_name' },
            { title: '数量', dataIndex: 'qty', width: 60 },
            { title: '定制参数', dataIndex: 'custom_params', render: (v) => v ? <Tag color="purple">{v}</Tag> : '-' },
            { title: '要求交期', dataIndex: 'expected_delivery' },
            { title: '订单状态', dataIndex: 'order_status', render: (s) => <StatusTag status={s} /> },
          ]} />
          <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
            合计 {trace.reduce((s, r) => s + r.qty, 0)} 件 · 来自 {trace.length} 条报货明细 · {new Set(trace.map((t) => t.sales_name)).size} 位业务员
          </div>
        </>}
      </Modal>

      <FeedbackModal group={feedbackGroup} onClose={() => setFeedbackGroup(null)} onDone={() => { setFeedbackGroup(null); load(); }} />
      <style>{`.row-urgent td { background: #fff7e6 !important; }`}</style>
    </div>
  );
}

function FeedbackModal({ group, onClose, onDone }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  if (!group) return null;
  return (
    <Modal title={`生产进度反馈 — ${group.product_name || ''} ${group.model || ''} (${group.color} · ${group.spec})`} open onCancel={onClose} onOk={() => form.submit()}>
      <Form form={form} layout="vertical" onFinish={async (v) => {
        try {
          const r = await api.post('/production/feedback', { group_id: group.id, ...v, progress_pct: +v.progress_pct });
          message.success(`反馈已记录，已通知 ${r.notified} 位相关业务员`);
          onDone();
        } catch (e) { message.error(e.message); }
      }}>
        <Form.Item name="stage" label="环节" initialValue="进度"><Select options={['开工', '进度', '质检', '完工'].map((v) => ({ value: v, label: v }))} /></Form.Item>
        <Form.Item name="progress_pct" label="进度百分比"><Input type="number" min={0} max={100} placeholder="0-100" /></Form.Item>
        <Form.Item name="content" label="反馈内容" rules={[{ required: true }]}><Input.TextArea rows={3} placeholder="如：已完成下料，钣金折弯进行中" /></Form.Item>
      </Form>
    </Modal>
  );
}
