const router = require('express').Router();
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db/database');
const { audit } = require('../services/auditService');

const ts = () => dayjs().format('YYYY-MM-DD HH:mm:ss');

router.get('/', (req, res) => {
  const { status, keyword } = req.query;
  let where = `WHERE 1=1`;
  const args = [];
  if (status) { where += ` AND s.status=?`; args.push(status); }
  if (keyword) { where += ` AND (s.shipment_no LIKE ? OR o.order_no LIKE ? OR s.receiver LIKE ?)`; args.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  res.json(db.prepare(`SELECT s.*, o.order_no, o.source, c.name customer_name FROM shipments s
    LEFT JOIN orders o ON o.id=s.order_id LEFT JOIN customers c ON c.id=o.customer_id ${where}
    ORDER BY s.created_at DESC LIMIT 300`).all(...args));
});

// 从待发货订单创建发货单
router.post('/', (req, res) => {
  const { order_id, logistics_company, receiver, phone, address, remark } = req.body;
  const o = db.prepare(`SELECT o.*, c.name cname, c.phone cphone FROM orders o LEFT JOIN customers c ON c.id=o.customer_id WHERE o.id=?`).get(order_id);
  if (!o) return res.status(404).json({ error: '订单不存在' });
  const id = uuid();
  const items = db.prepare(`SELECT oi.qty, oi.color, oi.spec, p.name product_name, p.model FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?`).all(order_id);
  db.prepare(`INSERT INTO shipments (id,shipment_no,order_id,logistics_company,tracking_no,status,ship_date,receiver,phone,address,items_json,remark,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, `SH${dayjs().format('YYYYMMDDHHmmss')}`, order_id, logistics_company || null, null, '待安排', null,
      receiver || o.cname || null, phone || o.cphone || null, address || null, JSON.stringify(items), remark || null, ts(), ts());
  audit(req, '创建发货单', 'shipment', id, null, { order_no: o.order_no });
  res.json({ id });
});

router.post('/:id/status', (req, res) => {
  const s = db.prepare(`SELECT * FROM shipments WHERE id=?`).get(req.params.id);
  if (!s) return res.status(404).json({ error: '发货单不存在' });
  const { status, logistics_company, tracking_no, ship_date } = req.body;
  audit(req, '发货状态更新', 'shipment', s.id, { status: s.status }, { status });
  db.prepare(`UPDATE shipments SET status=?, logistics_company=?, tracking_no=?, ship_date=?, updated_at=? WHERE id=?`)
    .run(status ?? s.status, logistics_company ?? s.logistics_company, tracking_no ?? s.tracking_no,
      ship_date ?? s.ship_date ?? (status === '已发货' ? dayjs().format('YYYY-MM-DD') : null), ts(), s.id);
  // 已发货 → 更新订单状态
  if (status === '已发货' && s.order_id) {
    const o = db.prepare(`SELECT status FROM orders WHERE id=?`).get(s.order_id);
    if (o && !['已发货', '已完成'].includes(o.status)) {
      db.prepare(`UPDATE orders SET status='已发货', updated_at=? WHERE id=?`).run(ts(), s.order_id);
    }
  }
  res.json({ ok: true });
});

router.get('/after-sales', (req, res) => {
  res.json(db.prepare(`SELECT a.*, o.order_no, u.real_name handler_name FROM after_sales a
    LEFT JOIN orders o ON o.id=a.order_id LEFT JOIN users u ON u.id=a.handler_id ORDER BY a.created_at DESC LIMIT 100`).all());
});

router.post('/after-sales', (req, res) => {
  const b = req.body;
  const id = uuid();
  db.prepare(`INSERT INTO after_sales (id,order_id,type,status,handler_id,content,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, b.order_id, b.type || '维修', '待处理', b.handler_id || null, b.content || null, ts(), ts());
  res.json({ id });
});

module.exports = router;
