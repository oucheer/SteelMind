const router = require('express').Router();
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db/database');
const { audit } = require('../services/auditService');
const { assignToGroup } = require('../services/productionService');

const ts = () => dayjs().format('YYYY-MM-DD HH:mm:ss');

// ---- 用户管理 ----
router.get('/users', (req, res) => res.json(db.prepare(`SELECT id,username,real_name,role,phone,status,created_at FROM users ORDER BY created_at`).all()));

router.post('/users', (req, res) => {
  const b = req.body;
  const id = uuid();
  db.prepare(`INSERT INTO users (id,username,password,real_name,role,phone,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, b.username, b.password || '123456', b.real_name, b.role || 'c_agent', b.phone || null, 'active', ts(), ts());
  audit(req, '新建用户', 'user', id, null, { username: b.username });
  res.json({ id });
});

router.put('/users/:id', (req, res) => {
  const u = db.prepare(`SELECT * FROM users WHERE id=?`).get(req.params.id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const b = req.body;
  db.prepare(`UPDATE users SET real_name=?,role=?,phone=?,status=?,updated_at=? WHERE id=?`)
    .run(b.real_name ?? u.real_name, b.role ?? u.role, b.phone ?? u.phone, b.status ?? u.status, ts(), u.id);
  audit(req, '修改用户', 'user', u.id, { role: u.role }, { role: b.role });
  res.json({ ok: true });
});

// ---- 产品管理 ----
router.get('/products', (req, res) => {
  const rows = db.prepare(`SELECT * FROM products ORDER BY category, model`).all();
  rows.forEach((p) => {
    p.skus = db.prepare(`SELECT * FROM product_skus WHERE product_id=?`).all(p.id);
  });
  res.json(rows);
});

router.post('/products', (req, res) => {
  const b = req.body;
  const id = uuid();
  db.prepare(`INSERT INTO products (id,category,name,model,base_price,unit,description,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, b.category, b.name, b.model, b.base_price || 0, b.unit || '件', b.description || null, ts(), ts());
  (b.skus || []).forEach((s) => {
    db.prepare(`INSERT INTO product_skus (id,product_id,color,spec,material,custom_params,price,stock,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(uuid(), id, s.color, s.spec, s.material || '冷轧钢板', s.custom_params || null, s.price || 0, s.stock || 0, ts(), ts());
  });
  audit(req, '新建产品', 'product', id, null, { name: b.name, model: b.model });
  res.json({ id });
});

router.post('/products/:id/skus', (req, res) => {
  const b = req.body;
  const id = uuid();
  db.prepare(`INSERT INTO product_skus (id,product_id,color,spec,material,custom_params,price,stock,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.params.id, b.color, b.spec, b.material || '冷轧钢板', b.custom_params || null, b.price || 0, b.stock || 0, ts(), ts());
  res.json({ id });
});

router.put('/products/:id', (req, res) => {
  const p = db.prepare(`SELECT * FROM products WHERE id=?`).get(req.params.id);
  if (!p) return res.status(404).json({ error: '产品不存在' });
  const b = req.body;
  db.prepare(`UPDATE products SET category=?,name=?,model=?,base_price=?,description=?,updated_at=? WHERE id=?`)
    .run(b.category ?? p.category, b.name ?? p.name, b.model ?? p.model, b.base_price ?? p.base_price, b.description ?? p.description, ts(), p.id);
  audit(req, '修改产品', 'product', p.id, p, b);
  res.json({ ok: true });
});

// ---- 知识库 ----
router.get('/knowledge', (req, res) => res.json(db.prepare(`SELECT * FROM knowledge_base ORDER BY category`).all()));

router.post('/knowledge', (req, res) => {
  const b = req.body;
  const id = uuid();
  db.prepare(`INSERT INTO knowledge_base (id,title,category,content,enabled,updater_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, b.title, b.category || '产品知识', b.content, b.enabled ?? 1, req.user?.id || null, ts(), ts());
  audit(req, '新增知识库条目', 'knowledge', id, null, { title: b.title });
  res.json({ id });
});

router.put('/knowledge/:id', (req, res) => {
  const k = db.prepare(`SELECT * FROM knowledge_base WHERE id=?`).get(req.params.id);
  if (!k) return res.status(404).json({ error: '条目不存在' });
  const b = req.body;
  db.prepare(`UPDATE knowledge_base SET title=?,category=?,content=?,enabled=?,updated_at=? WHERE id=?`)
    .run(b.title ?? k.title, b.category ?? k.category, b.content ?? k.content, b.enabled ?? k.enabled, ts(), k.id);
  audit(req, '修改知识库条目', 'knowledge', k.id, k, b);
  res.json({ ok: true });
});

router.delete('/knowledge/:id', (req, res) => {
  db.prepare(`DELETE FROM knowledge_base WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// ---- 审批 ----
router.get('/approvals', (req, res) => {
  res.json(db.prepare(`SELECT a.*, u1.real_name applicant_name, u2.real_name approver_name FROM approvals a
    LEFT JOIN users u1 ON u1.id=a.applicant_id LEFT JOIN users u2 ON u2.id=a.approver_id
    ORDER BY CASE a.status WHEN '待审批' THEN 0 ELSE 1 END, a.created_at DESC LIMIT 100`).all());
});

router.post('/approvals/:id', (req, res) => {
  const a = db.prepare(`SELECT * FROM approvals WHERE id=?`).get(req.params.id);
  if (!a) return res.status(404).json({ error: '审批单不存在' });
  const { status, comment } = req.body; // 通过/驳回
  db.prepare(`UPDATE approvals SET status=?, approver_id=?, comment=?, updated_at=? WHERE id=?`)
    .run(status, req.user?.id || null, comment || null, ts(), a.id);
  // 审批通过 → 落实业务动作
  if (status === '通过' && a.type === '报价发送' && a.target_type === 'quote') {
    db.prepare(`UPDATE quotes SET status='已发送', updated_at=? WHERE id=?`).run(ts(), a.target_id);
  }
  audit(req, `审批${status}`, 'approval', a.id, { status: a.status }, { status, comment });
  res.json({ ok: true });
});

// ---- 日志 ----
router.get('/logs', (req, res) => {
  const { keyword, page = 1, page_size = 30 } = req.query;
  let where = `WHERE 1=1`;
  const args = [];
  if (keyword) { where += ` AND (action LIKE ? OR user_name LIKE ?)`; args.push(`%${keyword}%`, `%${keyword}%`); }
  const total = db.prepare(`SELECT COUNT(*) c FROM audit_logs ${where}`).get(...args).c;
  const rows = db.prepare(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...args, +page_size, (+page - 1) * +page_size);
  res.json({ total, list: rows });
});

module.exports = router;
