/* LLM 封装：OpenAI 兼容协议，Node 22 原生 fetch，支持流式；未配置 key 时自动降级为模拟回复 */
const BASE_URL = (process.env.LLM_BASE_URL || '').replace(/\/$/, '');
const API_KEY = process.env.LLM_API_KEY || '';
const MODEL = process.env.LLM_MODEL || 'glm-4-flash';

const llmEnabled = () => !!(BASE_URL && API_KEY);

function extractJson(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = m ? m[1] : text;
  const start = raw.search(/[[{]/);
  if (start === -1) throw new Error('AI 未返回 JSON');
  return JSON.parse(raw.slice(start));
}

async function chat(messages, { json = false, temperature = 0.7 } = {}) {
  if (!llmEnabled()) return mockReply(messages, { json });
  const body = { model: MODEL, messages, temperature, stream: false, max_tokens: 4096 };
  if (json) body.response_format = { type: 'json_object' };
  let r = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
  });
  // 部分推理模型不支持 response_format，降级重试
  if (!r.ok && json) {
    delete body.response_format;
    r = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
    });
  }
  if (!r.ok) throw new Error(`LLM 请求失败: ${r.status} ${await r.text().catch(() => '')}`);
  const data = await r.json();
  const msg = data.choices?.[0]?.message || {};
  const content = msg.content || msg.reasoning_content || '';
  return json ? extractJson(content) : content;
}

async function chatStream(messages, onDelta, { temperature = 0.7 } = {}) {
  if (!llmEnabled()) {
    const text = mockReply(messages, {});
    for (const ch of text) { onDelta(ch); await new Promise((s) => setTimeout(s, 15)); }
    return text;
  }
  const r = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages, temperature, stream: true, max_tokens: 4096 }),
  });
  if (!r.ok) throw new Error(`LLM 流式请求失败: ${r.status}`);
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let full = '', buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        // 只输出正式内容；推理模型的 reasoning_content 不展示给用户
        const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
        if (delta) { full += delta; onDelta(delta); }
      } catch { /* 忽略不完整行 */ }
    }
  }
  return full;
}

/* 未配置 LLM 时的模拟回复（保证全流程可演示） */
function mockReply(messages, { json }) {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const q = last ? last.content : '';
  if (json) return { mock: true, note: '当前未配置 LLM API Key，此为模拟结构化输出', input_preview: q.slice(0, 100) };
  return `（AI 演示模式：未配置 LLM API Key，此为模拟回复）\n\n您好！我是 AI 销售助手。关于您提到的「${q.slice(0, 40)}${q.length > 40 ? '…' : ''}」：\n\n根据企业知识库：\n· 钢制文件柜 WJG-2000A 零售价 680 元/件，10 件以上 95 折\n· 常规产品 15 天内发货，定制产品 25-30 天\n\n如需精确报价，请补充数量、颜色和尺寸要求；涉及具体折扣和交期承诺，我会标记为"待确认"并由专属顾问与您核实。`;
}

module.exports = { chat, chatStream, extractJson, llmEnabled };
