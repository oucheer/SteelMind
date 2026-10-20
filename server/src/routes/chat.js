const router = require('express').Router();
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db/database');
const { audit } = require('../services/auditService');

const PLATFORM_CHANNELS = ['淘宝', '天猫', '京东', '抖音', '拼多多'];

router.get('/conversations', (req, res) => {
  const { channel } = req.query;
  let sql = `SELECT c.*, cu.name customer_name, cu.type customer_type, cu.phone customer_phone FROM ai_conversations c
    LEFT JOIN customers cu ON cu.id=c.customer_id WHERE 1=1`;
  const args = [];
  if (channel && channel !== '全部') { sql += ` AND c.channel=?`; args.push(channel); }
  sql += ` ORDER BY c.last_msg_at DESC LIMIT 100`;
  res.json(db.prepare(sql).all(...args));
});

router.get('/conversations/:id/messages', (req, res) => {
  res.json(db.prepare(`SELECT * FROM ai_messages WHERE conversation_id=? ORDER BY created_at`).all(req.params.id));
});

router.post('/conversations', (req, res) => {
  const { customer_id, channel, type } = req.body;
  const id = uuid();
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare(`INSERT INTO ai_conversations (id,customer_id,channel,type,user_id,status,last_msg_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, customer_id || null, channel || '内部助手', type || '客服', req.user?.id || null, '进行中', ts, ts, ts);
  res.json({ id });
});

router.post('/conversations/:id/messages', (req, res) => {
  const { role, content, meta_json } = req.body;
  const id = uuid();
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare(`INSERT INTO ai_messages (id,conversation_id,role,content,meta_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
    .run(id, req.params.id, role, content, meta_json || null, ts, ts);
  db.prepare(`UPDATE ai_conversations SET last_msg_at=? WHERE id=?`).run(ts, req.params.id);
  res.json({ id });
});

// 客服回复（闭环：写入会话并模拟送达电商平台）
router.post('/conversations/:id/reply', (req, res) => {
  const { content } = req.body || {};
  if (!content?.trim()) return res.status(400).json({ error: '回复内容不能为空' });
  const conv = db.prepare(`SELECT * FROM ai_conversations WHERE id=?`).get(req.params.id);
  if (!conv) return res.status(404).json({ error: '会话不存在' });
  const id = uuid();
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const meta = JSON.stringify({ platform_sent: PLATFORM_CHANNELS.includes(conv.channel), platform: conv.channel, sender: req.user?.real_name || '客服' });
  db.prepare(`INSERT INTO ai_messages (id,conversation_id,role,content,meta_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
    .run(id, conv.id, 'assistant', content.trim(), meta, ts, ts);
  db.prepare(`UPDATE ai_conversations SET last_msg_at=?, updated_at=? WHERE id=?`).run(ts, ts, conv.id);
  audit(req, '客服回复', 'conversation', conv.id, null, { channel: conv.channel, chars: content.length });
  res.json({ id, platform_sent: true });
});

// 闭环核心：从会话一键生成订单（选 SKU + 数量），并向会话发送系统消息
router.post('/conversations/:id/create-order', (req, res) => {
  const { sku_id, qty = 1, custom_params = null, note = null } = req.body || {};
  const conv = db.prepare(`SELECT * FROM ai_conversations WHERE id=?`).get(req.params.id);
  if (!conv) return res.status(404).json({ error: '会话不存在' });
  const sku = db.prepare(`SELECT s.*, p.name product_name, p.model FROM product_skus s JOIN products p ON p.id=s.product_id WHERE s.id=?`).get(sku_id);
  if (!sku) return res.status(400).json({ error: 'SKU 不存在' });

  const now = dayjs();
  const ts = now.format('YYYY-MM-DD HH:mm:ss');
  // 会话未关联客户则自动创建 C 端客户
  let customerId = conv.customer_id;
  if (!customerId) {
    customerId = uuid();
    db.prepare(`INSERT INTO customers (id,name,type,platform,phone,level,owner_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(customerId, conv.title || `平台客户(${conv.channel || '淘宝'})`, 'c端', conv.channel || '淘宝', conv.contact || null, '普通', req.user?.id || null, ts, ts);
    db.prepare(`UPDATE ai_conversations SET customer_id=? WHERE id=?`).run(customerId, conv.id);
  }
  const orderId = uuid();
  const orderNo = `SO${now.format('YYYYMMDDHHmmss')}`;
  db.prepare(`INSERT INTO orders (id,order_no,customer_id,user_id,quote_id,source,channel_order_no,status,total_amount,signed_at,expected_delivery,remark,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(orderId, orderNo, customerId, req.user?.id || null, null, conv.channel || '淘宝', null, '待确认', sku.price * qty, null,
      now.add(15, 'day').format('YYYY-MM-DD'), note || `由${conv.channel || '平台'}会话转化`, ts, ts);
  db.prepare(`INSERT INTO order_items (id,order_id,product_id,sku_id,qty,unit_price,color,spec,custom_params,status,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uuid(), orderId, sku.product_id, sku.id, qty, sku.price, sku.color, sku.spec, custom_params || sku.custom_params, '待报货', note, ts, ts);
  // 系统消息写入会话，形成闭环
  const sysMsg = `📦 订单已创建：${orderNo}\n${sku.product_name} ${sku.model || ''} × ${qty}（${sku.color || ''} ${sku.spec || ''}），合计 ¥${(sku.price * qty).toLocaleString()}。\n订单已进入待确认流程，可在订单管理中生成报货清单推送生产。`;
  const msgId = uuid();
  db.prepare(`INSERT INTO ai_messages (id,conversation_id,role,content,meta_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
    .run(msgId, conv.id, 'system', sysMsg, JSON.stringify({ order_id: orderId, order_no: orderNo, platform_sent: true }), ts, ts);
  db.prepare(`UPDATE ai_conversations SET last_msg_at=?, updated_at=? WHERE id=?`).run(ts, ts, conv.id);
  audit(req, '会话生成订单', 'order', orderId, null, { order_no: orderNo, conversation_id: conv.id, sku: sku.model, qty });
  res.json({ order_id: orderId, order_no: orderNo, total: sku.price * qty, message_id: msgId });
});

module.exports = router;
