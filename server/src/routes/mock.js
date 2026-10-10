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

module.exports = router;
