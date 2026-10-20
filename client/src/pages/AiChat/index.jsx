import { useEffect, useRef, useState } from 'react';
import { Card, Tabs, List, Tag, Avatar, Input, Button, App, Descriptions, Table, Space, Typography, Popconfirm, Modal, Select, InputNumber, Badge } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined, FileTextOutlined, ThunderboltOutlined, ShoppingCartOutlined, MailOutlined, ShopOutlined } from '@ant-design/icons';
import { api, sseStream } from '../../api';
import StatusTag from '../../components/StatusTag';

const { Text } = Typography;
const { TextArea } = Input;

const PLATFORM_COLORS = { 淘宝: 'orange', 天猫: 'red', 京东: 'red', 抖音: 'magenta', 拼多多: 'volcano', 内部助手: 'blue' };
const PLATFORM_CHANNELS = ['淘宝', '天猫', '京东', '抖音', '拼多多'];

export default function AiChat() {
  const { message } = App.useApp();
  const [convs, setConvs] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [profile, setProfile] = useState(null);
  const [quoteDraft, setQuoteDraft] = useState(null);
  const [contract, setContract] = useState(null);
  const [products, setProducts] = useState([]);
  const [orderModal, setOrderModal] = useState(null); // {sku_id, qty, note}
  const [recvModal, setRecvModal] = useState(null);   // {channel, buyer_name, phone, content}
  const [recvLoading, setRecvLoading] = useState(false);
  const boxRef = useRef(null);
  const demandRef = useRef('');

  const loadConvs = () => api.get('/chat/conversations').then((r) => { setConvs(r); if (r.length && !activeConv) selectConv(r[0]); });
  useEffect(() => { loadConvs(); api.get('/admin/products').then(setProducts); }, []);

  const selectConv = async (c) => {
    setActiveConv(c);
    setProfile(null); setQuoteDraft(null); setContract(null);
    const m = await api.get(`/chat/conversations/${c.id}/messages`);
    setMsgs(m);
    demandRef.current = m.filter((x) => x.role === 'user').map((x) => x.content).join('\n');
  };

  useEffect(() => { boxRef.current?.scrollTo({ top: 999999 }); }, [msgs]);

  const openConv = async (cid) => {
    await loadConvs();
    const list = await api.get('/chat/conversations');
    const c = list.find((x) => x.id === cid);
    if (c) await selectConv(c);
  };

  // ============ 闭环入口1：模拟平台买家来消息（淘宝/天猫） ============
  const simulateReceive = async (v) => {
    setRecvLoading(true);
    try {
      const r = await api.post('/mock/platform/receive-message', v);
      message.success(`${r.channel} 买家消息已接收（${r.customer_name}）`);
      setRecvModal(null);
      await openConv(r.conversation_id);
    } catch (e) { message.error(e.message); }
    finally { setRecvLoading(false); }
  };

  // ============ 闭环入口2：客服回复（送达平台） ============
  const send = async () => {
    const text = input.trim();
    if (!text || streaming || !activeConv) return;
    setInput('');
    setMsgs((m) => [...m, { role: 'assistant', content: text, meta_json: JSON.stringify({ platform_sent: true, sender: '客服' }) }]);
    try {
      await api.post(`/chat/conversations/${activeConv.id}/reply`, { content: text });
      message.success(`回复已送达 ${activeConv.channel || '平台'}`);
    } catch (e) { message.error(e.message); }
    loadConvs();
  };

  // AI 生成回复（流式），完成后已由后端持久化
  const aiReply = async () => {
    if (!activeConv || streaming) return;
    setStreaming(true);
    setMsgs((m) => [...m, { role: 'assistant', content: '' }]);
    await sseStream({
      url: '/api/ai/chat/stream',
      body: { message: '请以客服身份回复客户最新消息', conversation_id: activeConv.id, mode: 'customer_service' },
      onDelta: (delta) => setMsgs((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + delta };
        return copy;
      }),
      onError: (e) => message.error(e),
    });
    setStreaming(false);
    loadConvs();
  };

  const extractProfile = async () => {
    try {
      const r = await api.post('/ai/extract-profile', { conversation_id: activeConv.id });
      setProfile(r);
      message.success('客户资料提取完成');
    } catch (e) { message.error(e.message); }
  };

  const genQuote = async () => {
    try {
      const r = await api.post('/ai/quote-draft', { conversation_id: activeConv.id, demand: demandRef.current });
      setQuoteDraft(r);
      message.success('报价草稿生成完成');
    } catch (e) { message.error(e.message); }
  };

  const saveQuote = async () => {
    const total = (quoteDraft.items || []).reduce((s, it) => s + (it.unit_price || 0) * (it.qty || 0), 0);
    const r = await api.post('/ai/quote-save', {
      conversation_id: activeConv.id, customer_id: activeConv.customer_id,
      items: quoteDraft.items, pending_fields: quoteDraft.pending_fields, remark: quoteDraft.remark, total_amount: total,
    });
    message.success('报价单已保存并提交审批');
    setQuoteDraft(null);
    return r;
  };

  // ============ 闭环核心：从会话一键生成订单 ============
  const createOrder = async () => {
    try {
      const r = await api.post(`/chat/conversations/${activeConv.id}/create-order`, orderModal);
      message.success(`订单 ${r.order_no} 已创建（¥${r.total.toLocaleString()}），系统消息已发送给客户`);
      setOrderModal(null);
      const m = await api.get(`/chat/conversations/${activeConv.id}/messages`);
      setMsgs(m);
    } catch (e) { message.error(e.message); }
  };

  const genContract = async () => {
    try {
      const list = await api.get('/ai/quotes', { params: { status: '已发送,已确认' } });
      if (!list.length) { message.warning('暂无已确认/已发送的报价单，请先生成并审批报价'); return; }
      const r = await api.post('/ai/contract-draft', { quote_id: list[0].id });
      setContract(r);
      message.success(`合同草稿已生成（基于报价单 ${list[0].quote_no}）`);
    } catch (e) { message.error(e.message); }
  };

  const pending = quoteDraft?.pending_fields || [];

  // 消息气泡：区分 平台买家 / 客服或AI / 系统消息
  const bubbles = msgs.map((m, i) => {
    let meta = {};
    try { meta = m.meta_json ? JSON.parse(m.meta_json) : {}; } catch { /* */ }
    const isBuyer = m.role === 'user' && (meta.from_platform || !meta.sender);
    const isSystem = m.role === 'system';
    if (isSystem) {
      return (
        <div key={i} style={{ textAlign: 'center', margin: '6px 0' }}>
          <div style={{ display: 'inline-block', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, padding: '6px 14px', fontSize: 12, whiteSpace: 'pre-wrap', color: '#389e0d' }}>{m.content}</div>
        </div>
      );
    }
    const mine = m.role === 'assistant';
    return (
      <div key={i} style={{ display: 'flex', gap: 8, flexDirection: mine ? 'row-reverse' : 'row' }}>
        <Avatar size={30} style={{ background: mine ? '#0d3027' : isBuyer ? '#fa8c16' : '#8c8c8c', flexShrink: 0 }}
          icon={mine ? <RobotOutlined /> : <UserOutlined />} />
        <div style={{ maxWidth: '72%' }}>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 2, textAlign: mine ? 'right' : 'left' }}>
            {mine ? (meta.sender || '客服') : (meta.buyer || '买家')}{meta.from_platform ? ` · 来自${meta.platform}` : ''}
            {mine && meta.platform_sent && <Text type="secondary" style={{ marginLeft: 6 }}>✓ 已送达{meta.platform || ''}</Text>}
          </div>
          <div style={{
            maxWidth: '100%', padding: '8px 12px', borderRadius: 8, whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6,
            background: mine ? '#0d3027' : '#fff', color: mine ? '#fff' : '#1f2329',
            border: mine ? 'none' : '1px solid #dce3df',
          }}>
            {m.content}
          </div>
        </div>
      </div>
    );
  });

  const chatPane = (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 190px)' }}>
      <div ref={boxRef} style={{ flex: 1, overflowY: 'auto', padding: 12, background: '#f7f9f8', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bubbles}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <TextArea value={input} onChange={(e) => setInput(e.target.value)} placeholder="以客服身份输入回复，发送后送达买家平台…" autoSize={{ minRows: 1, maxRows: 3 }}
          onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); send(); } }} />
        <Button icon={<RobotOutlined />} loading={streaming} onClick={aiReply} title="AI 生成回复">AI</Button>
        <Button type="primary" icon={<SendOutlined />} onClick={send} />
      </div>
    </div>
  );

  const skuOptions = products.flatMap((p) => (p.skus || []).map((s) => ({
    value: s.id, label: `${p.name} ${p.model} · ${s.color || ''} ${s.spec || ''} · ¥${s.price}`,
  })));

  const rightTabs = [{
    key: 'tools', label: 'AI 工具', children: (
      <div>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {/* 闭环操作区 */}
          <Card size="small" title={<Space><ShoppingCartOutlined /> 生成订单（闭环）</Space>}>
            <Select showSearch optionFilterProp="label" placeholder="选择买家需要的产品 SKU" style={{ width: '100%' }}
              value={orderModal?.sku_id} onChange={(v) => setOrderModal((o) => ({ ...(o || {}), sku_id: v }))}
              options={skuOptions} />
            <Space style={{ marginTop: 8, width: '100%' }} wrap>
              <InputNumber min={1} placeholder="数量" value={orderModal?.qty} onChange={(v) => setOrderModal((o) => ({ ...(o || { sku_id: null }), qty: v }))} style={{ width: 90 }} />
              <Button type="primary" disabled={!orderModal?.sku_id || !orderModal?.qty}
                onClick={() => {
                  if (!activeConv) { message.warning('请先选择会话'); return; }
                  createOrder();
                }}>创建订单并通知买家</Button>
            </Space>
            <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>订单自动关联客户与渠道来源，进入「待确认」流程；系统消息同步到会话。</div>
          </Card>
          <Card size="small" title={<Space><ThunderboltOutlined /> 客户资料提取</Space>}
            extra={<Button size="small" onClick={extractProfile} disabled={!activeConv}>提取</Button>}>
            {profile ? (
              <Descriptions column={1} size="small">
                <Descriptions.Item label="称呼">{profile.name || '-'}</Descriptions.Item>
                <Descriptions.Item label="电话">{profile.phone || '-'}</Descriptions.Item>
                <Descriptions.Item label="公司">{profile.company || '-'}</Descriptions.Item>
                <Descriptions.Item label="意向产品">{(profile.intent_products || []).join('、') || '-'}</Descriptions.Item>
                <Descriptions.Item label="数量">{profile.quantity ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="预算">{profile.budget || '-'}</Descriptions.Item>
                <Descriptions.Item label="紧急度">{profile.urgency || '-'}</Descriptions.Item>
                {profile.notes && <Descriptions.Item label="备注">{profile.notes}</Descriptions.Item>}
              </Descriptions>
            ) : <Text type="secondary">点击「提取」从会话中识别客户联系方式与需求</Text>}
          </Card>
          <Card size="small" title={<Space><FileTextOutlined /> 报价单生成</Space>}
            extra={<Button size="small" type="primary" onClick={genQuote} disabled={!activeConv}>生成草稿</Button>}>
            {quoteDraft ? (
              <>
                <Table size="small" pagination={false} rowKey={(r, i) => i} dataSource={quoteDraft.items || []} columns={[
                  { title: '产品', dataIndex: 'sku_id', render: (v, r) => r.product || r.note || v?.slice(0, 8) },
                  { title: '数量', dataIndex: 'qty' },
                  { title: '单价', dataIndex: 'unit_price', render: (v) => v != null ? `¥${v}` : <Tag color="orange">待确认</Tag> },
                  { title: '小计', render: (v, r) => (r.unit_price && r.qty) ? `¥${r.unit_price * r.qty}` : '-' },
                ]} />
                {pending.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Text type="danger" strong>⚠ 待确认字段（AI 不确定，需人工核实）：</Text>
                    {pending.map((p, i) => <div key={i} style={{ fontSize: 12 }}><Tag color="red">{p.field}</Tag>{p.reason}</div>)}
                  </div>
                )}
                <Button block type="primary" style={{ marginTop: 12 }} onClick={saveQuote}>保存报价单并提交审批</Button>
              </>
            ) : <Text type="secondary">基于会话需求自动匹配产品 SKU 生成报价草稿；价格无依据的字段将标记待确认</Text>}
          </Card>
          <Card size="small" title="合同生成">
            <Button block onClick={genContract}>基于已确认报价生成合同草稿</Button>
            {contract && <div style={{ marginTop: 8 }}><Text>合同号：{contract.contract_no}</Text><br /><Text type="secondary">已创建草稿，可在报价确认后走电子签流程</Text></div>}
          </Card>
        </Space>
      </div>
    ),
  }];

  return (
    <Card variant="outlined">
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid #dce3df', paddingRight: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 600 }}>客户咨询会话</span>
            <Button size="small" type="primary" icon={<MailOutlined />} onClick={() => setRecvModal({ channel: '淘宝', buyer_name: '', phone: '', content: '' })}>模拟收信</Button>
          </div>
          <List size="small" dataSource={convs} renderItem={(c) => (
            <List.Item onClick={() => selectConv(c)} style={{ cursor: 'pointer', padding: '8px 6px', background: activeConv?.id === c.id ? '#eaf2ef' : 'transparent', borderRadius: 6 }}>
              <List.Item.Meta
                avatar={<Badge dot={c.status === '待回复'} color="#fa541c"><Avatar style={{ background: '#0d3027' }}>{(c.customer_name || c.channel || '客')[0]}</Avatar></Badge>}
                title={<Space size={4}><span style={{ fontSize: 13 }}>{c.customer_name || '未识别客户'}</span><Tag color={PLATFORM_COLORS[c.channel] || 'blue'} style={{ fontSize: 11 }}>{c.channel}</Tag></Space>}
                description={<Text type="secondary" style={{ fontSize: 11 }}>{c.type} · {c.status} · {c.last_msg_at?.slice(5, 16)}</Text>}
              />
            </List.Item>
          )} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 8 }}>
            <Space>
              <span style={{ fontWeight: 600 }}>{activeConv?.customer_name || '未选择会话'}</span>
              {activeConv && <Tag color={PLATFORM_COLORS[activeConv.channel]}>{activeConv.channel}</Tag>}
              {activeConv && <StatusTag status={activeConv.status} />}
              {activeConv?.customer_phone && <Text type="secondary" style={{ fontSize: 12 }}>{activeConv.customer_phone}</Text>}
            </Space>
          </div>
          {chatPane}
        </div>
        <div style={{ width: 340, flexShrink: 0 }}>
          <Tabs items={rightTabs} />
        </div>
      </div>

      {/* 模拟平台收信 */}
      <Modal title={<Space><ShopOutlined /> 模拟平台买家消息（淘宝/天猫）</Space>} open={!!recvModal} onCancel={() => setRecvModal(null)} onOk={() => recvModal && simulateReceive(recvModal)} okText="接收消息" confirmLoading={recvLoading}>
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <Text type="secondary" style={{ fontSize: 12 }}>演示说明：真实淘宝/天猫买家消息需千牛开放平台企业授权，当前为模拟通道；接口已按平台适配器设计，资质就绪后可无缝切换真实 API。</Text>
          <Select value={recvModal?.channel} onChange={(v) => setRecvModal((m) => ({ ...m, channel: v }))} style={{ width: '100%' }}
            options={[{ value: '淘宝', label: '淘宝' }, { value: '天猫', label: '天猫' }]} />
          <Input placeholder="买家称呼（如：青禾共享办公）" value={recvModal?.buyer_name} onChange={(e) => setRecvModal((m) => ({ ...m, buyer_name: e.target.value }))} />
          <Input placeholder="买家手机号（可选，用于匹配老客户）" value={recvModal?.phone} onChange={(e) => setRecvModal((m) => ({ ...m, phone: e.target.value }))} />
          <TextArea rows={3} placeholder="买家消息内容，如：你好，想订 120 组钢制更衣柜，1200×500×1800，能报价吗？" value={recvModal?.content} onChange={(e) => setRecvModal((m) => ({ ...m, content: e.target.value }))} />
        </Space>
      </Modal>
    </Card>
  );
}
