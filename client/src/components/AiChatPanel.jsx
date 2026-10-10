import { useState, useRef, useEffect } from 'react';
import { Input, Button, Typography, Avatar, Tooltip } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { sseStream } from '../api';

const { Text } = Typography;

/* AI 聊天面板（SSE 流式）：mode='sales_assistant' 为首页内部助手 */
export default function AiChatPanel({ mode = 'sales_assistant', conversationId, height = 420, title = 'AI 销售助手', welcome }) {
  const [messages, setMessages] = useState(welcome ? [{ role: 'assistant', content: welcome }] : []);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => { boxRef.current?.scrollTo({ top: 999999 }); }, [messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || streaming) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: msg }, { role: 'assistant', content: '' }]);
    setStreaming(true);
    await sseStream({
      url: '/api/ai/chat/stream',
      body: { message: msg, mode, conversation_id: conversationId },
      onDelta: (delta) => setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'assistant', content: copy[copy.length - 1].content + delta };
        return copy;
      }),
      onError: (e) => setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'assistant', content: copy[copy.length - 1].content + `\n[出错] ${e}` };
        return copy;
      }),
    });
    setStreaming(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height }}>
      {title && <div style={{ fontWeight: 600, marginBottom: 8 }}><RobotOutlined style={{ color: '#1677ff' }} /> {title}</div>}
      <div ref={boxRef} style={{ flex: 1, overflowY: 'auto', background: '#f7f8fa', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
            <Avatar size={28} style={{ background: m.role === 'user' ? '#1677ff' : '#8c8c8c', flexShrink: 0 }}
              icon={m.role === 'user' ? <UserOutlined /> : <RobotOutlined />} />
            <div style={{
              maxWidth: '82%', padding: '8px 12px', borderRadius: 10, whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6,
              background: m.role === 'user' ? '#1677ff' : '#fff', color: m.role === 'user' ? '#fff' : '#1f2329',
              boxShadow: '0 1px 2px rgba(0,0,0,0.06)', border: m.role === 'user' ? 'none' : '1px solid #eef0f3',
            }}>
              {m.content || <span style={{ color: '#999' }}>正在思考…</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Input.TextArea
          value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="请输入您的问题…"
          autoSize={{ minRows: 1, maxRows: 3 }}
          onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <Button type="primary" icon={<SendOutlined />} loading={streaming} onClick={send} />
      </div>
      {mode === 'sales_assistant' && (
        <Text type="secondary" style={{ fontSize: 11, marginTop: 6 }}>
          您好！我是您的 AI 销售助手，可帮您回答：客户咨询、生产/订单状态、报价建议、营销话术等。
        </Text>
      )}
    </div>
  );
}
