const router = require('express').Router();
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db/database');
const { audit } = require('../services/auditService');

// 客户列表
router.get('/', (req, res) => {
  const { keyword, type, level, owner_id, page = 1, page_size = 20 } = req.query;
  let where = `WHERE 1=1`;
  const args = [];
  if (keyword) { where += ` AND (c.name LIKE ? OR c.phone LIKE ? OR c.wechat LIKE ?)`; args.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  if (type) { where += ` AND c.type=?`; args.push(type); }
  if (level) { where += ` AND c.level=?`; args.push(level); }
  if (owner_id) { where += ` AND c.owner_id=?`; args.push(owner_id); }
  const total = db.prepare(`SELECT COUNT(*) c FROM customers c ${where}`).get(...args).c;
  const rows = db.prepare(`SELECT c.*, u.real_name owner_name,
    (SELECT COUNT(*) FROM orders o WHERE o.customer_id=c.id) order_count
    FROM customers c LEFT JOIN users u ON u.id=c.owner_id ${where}
    ORDER BY c.created_at DESC LIMIT ? OFFSET ?`).all(...args, +page_size, (+page - 1) * +page_size);
  res.json({ total, list: rows });
});

// 客户详情（含联系人 + 跟进记录）
router.get('/:id', (req, res) => {
  const c = db.prepare(`SELECT c.*, u.real_name owner_name FROM customers c LEFT JOIN users u ON u.id=c.owner_id WHERE c.id=?`).get(req.params.id);
  if (!c) return res.status(404).json({ error: '客户不存在' });
  c.contacts = db.prepare(`SELECT * FROM contacts WHERE customer_id=? ORDER BY is_primary DESC`).all(c.id);
  c.follow_ups = db.prepare(`SELECT f.*, u.real_name user_name FROM follow_ups f LEFT JOIN users u ON u.id=f.user_id WHERE f.customer_id=? ORDER BY f.created_at DESC`).all(c.id);
  c.orders = db.prepare(`SELECT id, order_no, status, total_amount, created_at FROM orders WHERE customer_id=? ORDER BY created_at DESC LIMIT 20`).all(c.id);
  res.json(c);
});

router.post('/', (req, res) => {
  const b = req.body;
  const id = uuid();
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare(`INSERT INTO customers (id,name,type,platform,phone,wechat,region,level,source_campaign,owner_id,status,remark,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, b.name, b.type || 'c端', b.platform || null, b.phone || null, b.wechat || null, b.region || null, b.level || '普通', b.source_campaign || null, b.owner_id || null, 'active', b.remark || null, ts, ts);
  audit(req, '新建客户', 'customer', id, null, { name: b.name });
  res.json({ id });
});

router.put('/:id', (req, res) => {
  const c = db.prepare(`SELECT * FROM customers WHERE id=?`).get(req.params.id);
  if (!c) return res.status(404).json({ error: '客户不存在' });
  const b = req.body;
  db.prepare(`UPDATE customers SET name=?,type=?,platform=?,phone=?,wechat=?,region=?,level=?,owner_id=?,status=?,remark=?,updated_at=? WHERE id=?`)
    .run(b.name ?? c.name, b.type ?? c.type, b.platform ?? c.platform, b.phone ?? c.phone, b.wechat ?? c.wechat,
      b.region ?? c.region, b.level ?? c.level, b.owner_id ?? c.owner_id, b.status ?? c.status, b.remark ?? c.remark,
      dayjs().format('YYYY-MM-DD HH:mm:ss'), c.id);
  audit(req, '修改客户', 'customer', c.id, c, b);
  res.json({ ok: true });
});

// 联系人
router.post('/:id/contacts', (req, res) => {
  const b = req.body;
  const id = uuid();
  db.prepare(`INSERT INTO contacts (id,customer_id,name,position,phone,email,is_primary,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, req.params.id, b.name, b.position || null, b.phone || null, b.email || null, b.is_primary ? 1 : 0, dayjs().format('YYYY-MM-DD HH:mm:ss'), dayjs().format('YYYY-MM-DD HH:mm:ss'));
  res.json({ id });
});

// 跟进记录
router.post('/:id/follow-ups', (req, res) => {
  const b = req.body;
  const id = uuid();
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare(`INSERT INTO follow_ups (id,customer_id,user_id,content,type,next_plan,next_time,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, req.params.id, req.user?.id || null, b.content, b.type || '微信', b.next_plan || null, b.next_time || null, ts, ts);
  audit(req, '新增跟进记录', 'customer', req.params.id, null, { content: b.content });
  res.json({ id });
});

module.exports = router;
