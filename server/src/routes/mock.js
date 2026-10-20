/* 模拟外部系统触发器：电商拉单、电子签回调、微信通知等 */
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db/database');
const { audit } = require('../services/auditService');
const { assignToGroup } = require('../services/productionService');

const ts = () => dayjs().format('YYYY-MM-DD HH:mm:ss');

// 模拟电商平台拉单：生成一笔新订单（随机客户/产品）
router.post('/platform/pull-orders', (req, res) => {
  const platforms = ['淘宝', '天猫', '京东', '抖音', '拼多多'];
  const platform = req.body.platform || platforms[Math.floor(Math.random() * platforms.length)];
  const cust = db.prepare(`SELECT * FROM customers WHERE platform=? ORDER BY RANDOM() LIMIT 1`).get(platform)
    || db.prepare(`SELECT * FROM customers LIMIT 1`).get();
  const owner = db.prepare(`SELECT * FROM users WHERE role IN ('c_agent','b_agent') ORDER BY RANDOM() LIMIT 1`).get();
  const sku = db.prepare(`SELECT s.*, p.model, p.name product_name FROM product_skus s JOIN products p ON p.id=s.product_id ORDER BY RANDOM() LIMIT 1`).get();
  const qty = req.body.qty || [2, 3, 5, 8, 10][Math.floor(Math.random() * 5)];
  const id = uuid();
  const orderNo = `SO${dayjs().format('YYYYMMDD')}${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const amount = sku.price * qty;
  db.prepare(`INSERT INTO orders (id,order_no,customer_id,user_id,quote_id,source,channel_order_no,status,total_amount,signed_at,expected_delivery,remark,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, orderNo, cust.id, owner.id, null, platform, `TB${Math.floor(Math.random() * 900000000 + 100000000)}`,
      '待确认', amount, null, dayjs().add(15, 'day').format('YYYY-MM-DD'), `${platform} 模拟拉单`, ts(), ts());
  db.prepare(`INSERT INTO order_items (id,order_id,product_id,sku_id,qty,unit_price,color,spec,custom_params,status,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uuid(), id, sku.product_id, sku.id, qty, sku.price, sku.color, sku.spec, sku.custom_params, '待报货', null, ts(), ts());
  audit({ user: req.user, ip: req.ip }, `模拟${platform}拉单`, 'order', id, null, { order_no: orderNo, amount });
  res.json({ order_id: id, order_no: orderNo, customer: cust.name, platform, amount, product: `${sku.product_name} ${sku.model}`, qty });
});

// 模拟电子签回调：合同签署完成
router.post('/esign/callback', (req, res) => {
  const { contract_id } = req.body;
  const c = db.prepare(`SELECT * FROM contracts WHERE id=?`).get(contract_id);
  if (!c) return res.status(404).json({ error: '合同不存在' });
  db.prepare(`UPDATE contracts SET status='已签署', sign_status_mock='已签署(e签宝mock回调)', updated_at=? WHERE id=?`).run(ts(), c.id);
  audit({ user: req.user, ip: req.ip }, '电子签回调-合同已签署', 'contract', c.id, { status: c.status }, { status: '已签署' });
  res.json({ ok: true });
});

// 模拟 CRM 推送结果
router.get('/crm/push', (req, res) => {
  const { order_id } = req.query;
  const o = db.prepare(`SELECT * FROM orders WHERE id=?`).get(order_id);
  if (!o) return res.status(404).json({ error: '订单不存在' });
  const crmId = `CRM${dayjs().format('YYYYMMDD')}${Math.floor(Math.random() * 9000 + 1000)}`;
  audit({ user: req.user, ip: req.ip }, 'CRM 同步(模拟)', 'order', o.id, null, { crm_id: crmId });
  res.json({ ok: true, crm_order_id: crmId, message: `订单 ${o.order_no} 已同步至 CRM（模拟），CRM 单号 ${crmId}` });
});

// 模拟微信/企微通知
router.post('/wechat/send', (req, res) => {
  const { to_user_ids, content } = req.body;
  audit({ user: req.user, ip: req.ip }, '微信通知(模拟)', 'notification', null, null, { to_user_ids, content });
  res.json({ ok: true, message: `已向 ${to_user_ids?.length || 0} 位用户发送模拟通知`, channel: '企业微信(mock)' });
});

// 模拟电商平台买家消息到达（淘宝/天猫）：匹配/创建客户与会话，插入买家消息
router.post('/platform/receive-message', (req, res) => {
  const { channel = '淘宝', buyer_name, phone, content } = req.body || {};
  if (!buyer_name || !content?.trim()) return res.status(400).json({ error: '买家称呼与消息内容不能为空' });
  if (!['淘宝', '天猫'].includes(channel)) return res.status(400).json({ error: '渠道仅支持 淘宝/天猫' });
  // 按手机号优先匹配客户，其次按名字
  let customer = phone
    ? db.prepare(`SELECT * FROM customers WHERE phone=? LIMIT 1`).get(phone)
    : db.prepare(`SELECT * FROM customers WHERE name=? LIMIT 1`).get(buyer_name);
  if (!customer) {
    const cid = uuid();
    db.prepare(`INSERT INTO customers (id,name,type,platform,phone,level,owner_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(cid, buyer_name, 'c端', channel, phone || null, '普通', req.user?.id || null, ts(), ts());
    customer = db.prepare(`SELECT * FROM customers WHERE id=?`).get(cid);
  }
  // 同客户同渠道复用最近会话（24h内），否则新建
  let conv = db.prepare(`SELECT * FROM ai_conversations WHERE customer_id=? AND channel=? ORDER BY last_msg_at DESC LIMIT 1`).get(customer.id, channel);
  const isNew = !conv || dayjs().diff(dayjs(conv.last_msg_at), 'hour', true) > 24;
  if (isNew) {
    const id = uuid();
    db.prepare(`INSERT INTO ai_conversations (id,customer_id,channel,type,user_id,status,last_msg_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, customer.id, channel, '客服', req.user?.id || null, '待回复', ts(), ts(), ts());
    conv = db.prepare(`SELECT * FROM ai_conversations WHERE id=?`).get(id);
  }
  const mid = uuid();
  db.prepare(`INSERT INTO ai_messages (id,conversation_id,role,content,meta_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
    .run(mid, conv.id, 'user', content.trim(), JSON.stringify({ platform: channel, buyer: buyer_name, from_platform: true }), ts(), ts());
  db.prepare(`UPDATE ai_conversations SET status='待回复', last_msg_at=?, updated_at=? WHERE id=?`).run(ts(), ts(), conv.id);
  audit(req, '平台消息接收(模拟)', 'conversation', conv.id, null, { channel, buyer: buyer_name });
  res.json({ conversation_id: conv.id, customer_id: customer.id, customer_name: customer.name, channel, message_id: mid, is_new_conversation: isNew });
});

module.exports = router;
