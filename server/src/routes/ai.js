/* AI 路由：SSE 流式对话 + 结构化提取 + 报价草稿 */
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db/database');
const { chat, chatStream, extractJson, llmEnabled } = require('../services/llm');
const { customerServiceSystem } = require('../services/prompts/customerService');
const { salesAssistantSystem } = require('../services/prompts/salesAssistant');
const { extractProfilePrompt } = require('../services/prompts/requirementAnalysis');
const { quoteDraftPrompt } = require('../services/prompts/quoteDraft');
const { marketingCopyPrompt } = require('../services/prompts/marketingCopy');
const { audit } = require('../services/auditService');

const ts = () => dayjs().format('YYYY-MM-DD HH:mm:ss');

// 知识库简单关键词命中
function kbSearch(query) {
  const kbs = db.prepare(`SELECT title, content FROM knowledge_base WHERE enabled=1`).all();
  const words = (query || '').split(/[\s，。？！,.?!、]/).filter((w) => w.length >= 2);
  const hits = [];
  for (const kb of kbs) {
    if (words.some((w) => kb.content.includes(w) || kb.title.includes(w))) hits.push(`【${kb.title}】${kb.content}`);
  }
  return hits.slice(0, 4).join('\n');
}

// SSE 流式对话（AI 客服 / 销售助手）
router.post('/chat/stream', async (req, res) => {
  const { conversation_id, message, mode } = req.body || {};
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    // 用户消息落库
    if (conversation_id && message) {
      db.prepare(`INSERT INTO ai_messages (id,conversation_id,role,content,meta_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
        .run(uuid(), conversation_id, 'user', message, null, ts(), ts());
      db.prepare(`UPDATE ai_conversations SET last_msg_at=? WHERE id=?`).run(ts(), conversation_id);
    }
    const conv = conversation_id ? db.prepare(`SELECT * FROM ai_conversations WHERE id=?`).get(conversation_id) : null;
    const history = conversation_id
      ? db.prepare(`SELECT role, content FROM ai_messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 10`).all(conversation_id).reverse()
      : [];

    const system = mode === 'sales_assistant'
      ? salesAssistantSystem()
      : customerServiceSystem(kbSearch(message));

    let full = '';
    await chatStream(
      [{ role: 'system', content: system }, ...history, { role: 'user', content: message }],
      (delta) => { full += delta; send({ delta }); }
    );
    // AI 回复落库
    if (conversation_id) {
      db.prepare(`INSERT INTO ai_messages (id,conversation_id,role,content,meta_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
        .run(uuid(), conversation_id, 'assistant', full, JSON.stringify({ kb: !!kbSearch(message) }), ts(), ts());
    }
    send({ done: true, ai_enabled: llmEnabled() });
  } catch (e) {
    send({ error: e.message });
  }
  res.end();
});

// 客户资料提取
router.post('/extract-profile', async (req, res) => {
  const { conversation_id } = req.body || {};
  const msgs = db.prepare(`SELECT role, content FROM ai_messages WHERE conversation_id=? ORDER BY created_at`).all(conversation_id);
  const convText = msgs.map((m) => `${m.role === 'user' ? '客户' : '客服'}：${m.content}`).join('\n');
  try {
    const result = await chat(
      [{ role: 'user', content: extractProfilePrompt(convText) }],
      { json: true, temperature: 0.2 }
    );
    db.prepare(`INSERT INTO ai_messages (id,conversation_id,role,content,meta_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
      .run(uuid(), conversation_id, 'system', '[客户资料提取]', JSON.stringify(result), ts(), ts());
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 报价草稿生成
router.post('/quote-draft', async (req, res) => {
  const { conversation_id, demand } = req.body || {};
  const skus = db.prepare(`SELECT s.id sku_id, p.name product, p.model model, s.color, s.spec, s.price unit_price, s.custom_params FROM product_skus s JOIN products p ON p.id=s.product_id LIMIT 50`).all();
  try {
    const result = await chat([{ role: 'user', content: quoteDraftPrompt(demand || '', skus) }], { json: true, temperature: 0.2 });
    // 校验价格来源
    const skuMap = new Map(skus.map((s) => [s.sku_id, s]));
    (result.items || []).forEach((it) => {
      const sku = skuMap.get(it.sku_id);
      if (!sku || (it.unit_price && Math.abs(it.unit_price - sku.unit_price) > 0.01)) {
        it.pending = true;
        result.pending_fields = result.pending_fields || [];
        result.pending_fields.push({ field: `单价(${it.note || it.sku_id})`, reason: 'AI 输出价格与 SKU 库不一致，需人工确认' });
      }
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 报价单保存（草稿 → 待审批）
router.post('/quote-save', (req, res) => {
  const { conversation_id, customer_id, items, pending_fields, remark, total_amount } = req.body || {};
  const id = uuid();
  db.prepare(`INSERT INTO quotes (id,quote_no,customer_id,user_id,conversation_id,source,status,total_amount,valid_until,items_json,ai_generated,pending_fields,remark,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, `QT${dayjs().format('YYYYMMDDHHmmss')}`, customer_id || null, req.user?.id || null, conversation_id || null,
      'conversation', '待审批', total_amount || 0, dayjs().add(15, 'day').format('YYYY-MM-DD'),
      JSON.stringify(items || []), 1, JSON.stringify(pending_fields || []), remark || null, ts(), ts());
  db.prepare(`INSERT INTO approvals (id,type,target_type,target_id,summary,applicant_id,status,approver_id,comment,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uuid(), '报价发送', 'quote', id, `AI 生成报价单（¥${total_amount || 0}）申请发送`, req.user?.id || null, '待审批', null, null, ts(), ts());
  audit(req, 'AI 生成报价草稿', 'quote', id, null, { total_amount });
  res.json({ id });
});

// 报价单列表（供合同生成等选择）
router.get('/quotes', (req, res) => {
  const { status } = req.query;
  let sql = `SELECT q.id, q.quote_no, q.status, q.total_amount, q.created_at, c.name customer_name FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id`;
  const args = [];
  if (status) { sql += ` WHERE q.status IN (${status.split(',').map(() => '?').join(',')})`; args.push(...status.split(',')); }
  sql += ` ORDER BY q.created_at DESC LIMIT 50`;
  res.json(db.prepare(sql).all(...args));
});

// 合同草稿生成（基于已确认报价）
router.post('/contract-draft', (req, res) => {
  const { quote_id } = req.body || {};
  const q = db.prepare(`SELECT q.*, c.name customer_name, c.phone FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id WHERE q.id=?`).get(quote_id);
  if (!q) return res.status(404).json({ error: '报价单不存在' });
  const id = uuid();
  db.prepare(`INSERT INTO contracts (id,contract_no,quote_id,customer_id,amount,status,sign_status_mock,file_url_mock,content_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, `HT${dayjs().format('YYYYMMDDHHmmss')}`, q.id, q.customer_id, q.total_amount, '草稿', null,
      `/files/mock/contract_${id.slice(0, 8)}.pdf`, q.items_json, ts(), ts());
  audit(req, '生成合同草稿', 'contract', id, null, { quote_no: q.quote_no });
  res.json({ id, contract_no: `HT${dayjs().format('YYYYMMDDHHmmss')}` });
});

// B端需求分析
router.post('/requirement-analysis', async (req, res) => {
  const { requirement_id, demand } = req.body || {};
  const prompt = `你是钢制家具行业 B 端销售专家。分析以下客户定制需求，输出 JSON：
{"space_analysis":"空间与场景分析","recommended_configs":[{"product":"推荐产品","qty":数量,"spec":"建议规格","reason":"理由"}],"risks":["风险点"],"confirm_questions":["需要向客户确认的问题清单"]}

【客户需求】
${demand || '（见对话记录）'}`;
  try {
    const result = await chat([{ role: 'user', content: prompt }], { json: true, temperature: 0.3 });
    if (requirement_id) {
      db.prepare(`UPDATE b_design_requirements SET analysis_result=?, status='已分析', updated_at=? WHERE id=?`).run(JSON.stringify(result), ts(), requirement_id);
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 营销文案生成
router.post('/marketing-copy', async (req, res) => {
  const { platform, product, selling_points, style } = req.body || {};
  try {
    const result = await chat([{ role: 'user', content: marketingCopyPrompt({ platform, product, selling_points, style }) }], { json: true, temperature: 0.8 });
    // 自动入库：AI 文案直接进素材库（状态 AI生成，走审核流）
    const mid = uuid();
    const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
    db.prepare(`INSERT INTO materials (id,title,type,url_or_content,tags,campaign,platform,product_id,status,uploader_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(mid, result.titles?.[0] || `AI 文案：${product || '通用'}`, 'copy',
        `${(result.titles || []).join(' / ')}\n\n${result.body || ''}\n\n脚本：${result.video_script || ''}`,
        JSON.stringify(result.hashtags || []), null, platform || '通用', null, 'AI生成', req.user?.id || null, ts, ts);
    audit(req, 'AI 生成文案', 'material', mid, null, { product, platform });
    res.json({ ...result, material_id: mid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
