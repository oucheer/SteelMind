/* 全局搜索：客户 / 订单 / 产品 聚合（⌘K 命令面板） */
const router = require('express').Router();
const db = require('../db/database');

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ customers: [], orders: [], products: [] });
  const like = `%${q}%`;
  res.json({
    customers: db.prepare(`SELECT id, name, type, level FROM customers WHERE name LIKE ? OR phone LIKE ? LIMIT 5`).all(like, like),
    orders: db.prepare(`SELECT o.id, o.order_no, o.total_amount, o.status, c.name customer_name FROM orders o
      LEFT JOIN customers c ON c.id=o.customer_id
      WHERE o.order_no LIKE ? OR c.name LIKE ? LIMIT 5`).all(like, like),
    products: db.prepare(`SELECT id, name, model, category FROM products WHERE name LIKE ? OR model LIKE ? OR category LIKE ? LIMIT 5`).all(like, like, like),
  });
});

module.exports = router;
