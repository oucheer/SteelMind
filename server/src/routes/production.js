const router = require('express').Router();
const db = require('../db/database');
const { transitionGroup, traceGroup, addFeedback, FLOW } = require('../services/productionService');
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');

const ts = () => dayjs().format('YYYY-MM-DD HH:mm:ss');

// 个人报货明细（可按业务员/日期过滤）
router.get('/requisitions', (req, res) => {
  const { user_id, start, end, status } = req.query;
  let where = `WHERE 1=1`;
  const args = [];
  if (user_id) { where += ` AND o.user_id=?`; args.push(user_id); }
  if (start) { where += ` AND date(oi.created_at)>=?`; args.push(start); }
  if (end) { where += ` AND date(oi.created_at)<=?`; args.push(end); }
  if (status) { where += ` AND oi.status=?`; args.push(status); }
  const rows = db.prepare(`SELECT oi.*, o.order_no, o.created_at order_date, o.expected_delivery,
    c.name customer_name, u.real_name sales_name, p.name product_name, p.model,
    g.id group_id, g.status group_status
    FROM order_items oi
    JOIN orders o ON o.id=oi.order_id
    LEFT JOIN customers c ON c.id=o.customer_id
    LEFT JOIN users u ON u.id=o.user_id
    LEFT JOIN products p ON p.id=oi.product_id
    LEFT JOIN production_group_refs r ON r.order_item_id=oi.id
    LEFT JOIN production_groups g ON g.id=r.group_id
    ${where} ORDER BY oi.created_at DESC LIMIT 500`).all(...args);
  res.json(rows);
});

// 产品汇总（分组聚合）
router.get('/summary', (req, res) => {
  const { status, urgent } = req.query;
  let where = `WHERE 1=1`;
  const args = [];
  if (status) { where += ` AND g.status=?`; args.push(status); }
  const rows = db.prepare(`SELECT g.*, p.name product_name, p.category,
    (SELECT COUNT(DISTINCT r.order_item_id) FROM production_group_refs r WHERE r.group_id=g.id) source_item_count,
    (SELECT MIN(o.expected_delivery) FROM production_group_refs r JOIN order_items oi ON oi.id=r.order_item_id JOIN orders o ON o.id=oi.order_id WHERE r.group_id=g.id) earliest_delivery
    FROM production_groups g LEFT JOIN products p ON p.id=g.product_id ${where}
    ORDER BY CASE WHEN g.status IN ('待确认','待排产') THEN 0 ELSE 1 END, earliest_delivery, g.created_at DESC LIMIT 300`).all(...args);
  if (urgent === '1') {
    const in3 = dayjs().add(3, 'day').format('YYYY-MM-DD');
    res.json(rows.filter((r) => r.earliest_delivery && r.earliest_delivery <= in3 && !['已发货', '已完成'].includes(r.status)));
  } else res.json(rows);
});

// 汇总溯源
router.get('/summary/:id/trace', (req, res) => {
  res.json(traceGroup(req.params.id));
});

// 生产计划表
router.get('/schedule', (req, res) => {
  const rows = db.prepare(`SELECT g.*, p.name product_name,
    (SELECT COUNT(*) FROM production_feedbacks f WHERE f.group_id=g.id) feedback_count
    FROM production_groups g LEFT JOIN products p ON p.id=g.product_id
    ORDER BY CASE g.status WHEN '生产中' THEN 0 WHEN '待质检' THEN 1 WHEN '已排产' THEN 2 WHEN '待排产' THEN 3 WHEN '待确认' THEN 4 ELSE 5 END, g.plan_end`).all();
  res.json(rows);
});

// 状态流转
router.post('/summary/:id/status', (req, res) => {
  try {
    const g = transitionGroup(req.params.id, req.body.status, req.user, req.body);
    res.json(g);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 进度反馈
router.post('/feedback', (req, res) => {
  const r = addFeedback(req.body.group_id, req.user, req.body);
  res.json(r);
});

// 反馈历史
router.get('/feedbacks', (req, res) => {
  const { group_id } = req.query;
  let sql = `SELECT f.*, u.real_name user_name, g.model, g.color, g.spec FROM production_feedbacks f
    LEFT JOIN users u ON u.id=f.user_id LEFT JOIN production_groups g ON g.id=f.group_id`;
  const args = [];
  if (group_id) { sql += ` WHERE f.group_id=?`; args.push(group_id); }
  sql += ` ORDER BY f.created_at DESC LIMIT 100`;
  res.json(db.prepare(sql).all(...args));
});

// 可流转状态
router.get('/flow', (req, res) => res.json(FLOW));

module.exports = router;
