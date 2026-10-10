const router = require('express').Router();
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db/database');
const { audit } = require('../services/auditService');
const { generateRequisition, traceGroup } = require('../services/productionService');

const ts = () => dayjs().format('YYYY-MM-DD HH:mm:ss');

// 订单列表
router.get('/', (req, res) => {
  const { keyword, status, source, page = 1, page_size = 20 } = req.query;
  let where = `WHERE 1=1`;
  const args = [];
  if (keyword) { where += ` AND (o.order_no LIKE ? OR c.name LIKE ?)`; args.push(`%${keyword}%`, `%${keyword}%`); }
  if (status) { where += ` AND o.status=?`; args.push(status); }
  if (source) { where += ` AND o.source=?`; args.push(source); }
  const total = db.prepare(`SELECT COUNT(*) c FROM orders o LEFT JOIN customers c ON c.id=o.customer_id ${where}`).get(...args).c;
  const rows = db.prepare(`SELECT o.*, c.name customer_name, u.real_name sales_name,
    (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id) item_count
    FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN users u ON u.id=o.user_id ${where}
    ORDER BY o.created_at DESC LIMIT ? OFFSET ?`).all(...args, +page_size, (+page - 1) * +page_size);
  res.json({ total, list: rows });
});

// 订单详情（行项目 + 生产溯源）
router.get('/:id', (req, res) => {
  const o = db.prepare(`SELECT o.*, c.name customer_name, c.phone customer_phone, c.region, u.real_name sales_name
    FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN users u ON u.id=o.user_id WHERE o.id=?`).get(req.params.id);
  if (!o) return res.status(404).json({ error: '订单不存在' });
  o.items = db.prepare(`SELECT oi.*, p.name product_name, p.model,
    (SELECT g.id FROM production_group_refs r JOIN production_groups g ON g.id=r.group_id WHERE r.order_item_id=oi.id) group_id,
    (SELECT g.status FROM production_group_refs r JOIN production_groups g ON g.id=r.group_id WHERE r.order_item_id=oi.id) group_status
    FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?`).all(o.id);
  o.shipments = db.prepare(`SELECT * FROM shipments WHERE order_id=?`).all(o.id);
  o.quote = o.quote_id ? db.prepare(`SELECT id, quote_no, status, total_amount FROM quotes WHERE id=?`).get(o.quote_id) : null;
  res.json(o);
});

// 手工创建订单（B端/线下）
router.post('/', (req, res) => {
  const b = req.body;
  const id = uuid();
  db.prepare(`INSERT INTO orders (id,order_no,customer_id,user_id,quote_id,source,channel_order_no,status,total_amount,signed_at,expected_delivery,remark,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, b.order_no || `SO${dayjs().format('YYYYMMDDHHmmss')}`, b.customer_id, b.user_id || req.user?.id, b.quote_id || null,
      b.source || '线下', b.channel_order_no || null, b.status || '待确认', b.total_amount || 0, null,
      b.expected_delivery || null, b.remark || null, ts(), ts());
  // 行项目
  (b.items || []).forEach((it) => {
    const sku = db.prepare(`SELECT s.*, p.model FROM product_skus s JOIN products p ON p.id=s.product_id WHERE s.id=?`).get(it.sku_id);
    if (!sku) return;
    db.prepare(`INSERT INTO order_items (id,order_id,product_id,sku_id,qty,unit_price,color,spec,custom_params,status,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(uuid(), id, sku.product_id, sku.id, it.qty || 1, sku.price, sku.color, sku.spec, sku.custom_params, '待报货', it.note || null, ts(), ts());
  });
  if (b.total_amount) db.prepare(`UPDATE orders SET total_amount=? WHERE id=?`).run(b.total_amount, id);
  audit(req, '手工创建订单', 'order', id, null, { order_no: b.order_no });
  res.json({ id });
});

// 生成报货清单
router.post('/:id/generate-requisition', (req, res) => {
  try {
    const r = generateRequisition(req.params.id, req.user);
    res.json(r);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 订单状态更新
router.post('/:id/status', (req, res) => {
  const o = db.prepare(`SELECT * FROM orders WHERE id=?`).get(req.params.id);
  if (!o) return res.status(404).json({ error: '订单不存在' });
  const { status } = req.body;
  audit(req, '订单状态更新', 'order', o.id, { status: o.status }, { status });
  db.prepare(`UPDATE orders SET status=?, updated_at=? WHERE id=?`).run(status, ts(), o.id);
  res.json({ ok: true });
});

// 生产组溯源（供订单详情/汇总双向查询）
router.get('/trace/group/:groupId', (req, res) => {
  res.json(traceGroup(req.params.groupId));
});

module.exports = router;
