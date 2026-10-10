import { useEffect, useRef, useState } from 'react';
import { Card, Tabs, List, Tag, Avatar, Input, Button, App, Descriptions, Table, Space, Typography, Popconfirm } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined, FileTextOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { api, sseStream } from '../../api';
import StatusTag from '../../components/StatusTag';

const { Text } = Typography;
const { TextArea } = Input;

const PLATFORM_COLORS = { 淘宝: 'orange', 天猫: 'red', 京东: 'red', 抖音: 'magenta', 拼多多: 'volcano', 内部助手: 'blue' };

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
  const boxRef = useRef(null);
  const demandRef = useRef('');

  const loadConvs = () => api.get('/chat/conversations').then((r) => { setConvs(r); if (r.length && !activeConv) selectConv(r[0]); });
  useEffect(() => { loadConvs(); }, []);

  const selectConv = async (c) => {
    setActiveConv(c);
    setProfile(null); setQuoteDraft(null); setContract(null);
    const m = await api.get(`/chat/conversations/${c.id}/messages`);
    setMsgs(m);
    demandRef.current = m.filter((x) => x.role === 'user').map((x) => x.content).join('\n');
  };

  useEffect(() => { boxRef.current?.scrollTo({ top: 999999 }); }, [msgs]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming || !activeConv) return;
    setInput('');
    setMsgs((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setStreaming(true);
    demandRef.current += '\n' + text;
    await sseStream({
      url: '/api/ai/chat/stream',
      body: { message: text, conversation_id: activeConv.id, mode: 'customer_service' },
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

  const chatPane = (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)' }}>
      <div ref={boxRef} style={{ flex: 1, overflowY: 'auto', padding: 12, background: '#f7f8fa', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
            <Avatar size={30} style={{ background: m.role === 'user' ? '#1677ff' : m.role === 'system' ? '#faad14' : '#8c8c8c', flexShrink: 0 }}
              icon={m.role === 'user' ? <UserOutlined /> : <RobotOutlined />} />
            <div style={{
              maxWidth: '70%', padding: '8px 12px', borderRadius: 10, whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6,
              background: m.role === 'user' ? '#1677ff' : '#fff', color: m.role === 'user' ? '#fff' : '#1f2329',
              border: m.role === 'user' ? 'none' : '1px solid #eef0f3',
            }}>
              {m.content}
              {m.role === 'system' && <Tag color="orange" style={{ marginLeft: 6 }}>系统提取</Tag>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <TextArea value={input} onChange={(e) => setInput(e.target.value)} placeholder="以客服身份输入回复…" autoSize={{ minRows: 1, maxRows: 3 }}
          onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); send(); } }} />
        <Button type="primary" icon={<SendOutlined />} loading={streaming} onClick={send} />
      </div>
    </div>
  );

  const rightTabs = [{
    key: 'tools', label: 'AI 工具', children: (
      <div>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
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
        <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid #eef0f3', paddingRight: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>客户咨询会话</div>
          <List size="small" dataSource={convs} renderItem={(c) => (
            <List.Item onClick={() => selectConv(c)} style={{ cursor: 'pointer', padding: '8px 6px', background: activeConv?.id === c.id ? '#e6f4ff' : 'transparent', borderRadius: 6 }}>
              <List.Item.Meta
                avatar={<Avatar style={{ background: '#1677ff' }}>{(c.customer_name || c.channel || '客')[0]}</Avatar>}
                title={<Space size={4}><span style={{ fontSize: 13 }}>{c.customer_name || '未识别客户'}</span><Tag color={PLATFORM_COLORS[c.channel] || 'blue'} style={{ fontSize: 11 }}>{c.channel}</Tag></Space>}
                description={<Text type="secondary" style={{ fontSize: 11 }}>{c.type} · {c.last_msg_at?.slice(5, 16)}</Text>}
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
            </Space>
          </div>
          {chatPane}
        </div>
        <div style={{ width: 340, flexShrink: 0 }}>
          <Tabs items={rightTabs} />
        </div>
      </div>
    </Card>
  );
}
