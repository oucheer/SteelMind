const router = require('express').Router();
const dayjs = require('dayjs');
const db = require('../db/database');

// 今日指标卡
router.get('/summary', (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  const salesToday = db.prepare(`SELECT IFNULL(SUM(total_amount),0) v FROM orders WHERE date(created_at)=? AND status!='已取消'`).get(today).v;
  const salesYesterday = db.prepare(`SELECT IFNULL(SUM(total_amount),0) v FROM orders WHERE date(created_at)=? AND status!='已取消'`).get(dayjs().subtract(1, 'day').format('YYYY-MM-DD')).v;
  const ordersToday = db.prepare(`SELECT COUNT(*) c FROM orders WHERE date(created_at)=?`).get(today).c;
  const ordersYesterday = db.prepare(`SELECT COUNT(*) c FROM orders WHERE date(created_at)=?`).get(dayjs().subtract(1, 'day').format('YYYY-MM-DD')).c;
  const pendingOrders = db.prepare(`SELECT COUNT(*) c FROM orders WHERE status IN ('待确认','已确认')`).get().c;
  const prodDone = db.prepare(`SELECT COUNT(*) c FROM production_groups WHERE status='已完成'`).get().c;
  const prodTotal = db.prepare(`SELECT COUNT(*) c FROM production_groups`).get().c;
  const pct = (a, b) => (b > 0 ? +(((a - b) / b) * 100).toFixed(1) : 0);
  res.json({
    sales_today: salesToday, sales_change: pct(salesToday, salesYesterday),
    orders_today: ordersToday, orders_change: pct(ordersToday, ordersYesterday),
    pending_orders: pendingOrders, pending_change: 0,
    production_rate: prodTotal ? Math.round((prodDone / prodTotal) * 100) : 0,
    production_rate_change: 0,
  });
});

// 近7天销售趋势
router.get('/trend', (req, res) => {
  const rows = db.prepare(`SELECT date(created_at) d, IFNULL(SUM(total_amount),0) amount, COUNT(*) cnt
    FROM orders WHERE status!='已取消' AND created_at >= ? GROUP BY date(created_at) ORDER BY d`)
    .all(dayjs().subtract(6, 'day').format('YYYY-MM-DD') + ' 00:00:00');
  const map = new Map((rows || []).map((r) => [r.d, r]));
  const list = [];
  for (let i = 6; i >= 0; i--) {
    const d = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
    const r = map.get(d) || { amount: 0, cnt: 0 };
    list.push({ date: d.slice(5), 销售额: r.amount, 订单数: r.cnt });
  }
  res.json(list);
});

// 订单来源分布
router.get('/order-source', (req, res) => {
  const rows = db.prepare(`SELECT source name, COUNT(*) value FROM orders WHERE status!='已取消' GROUP BY source ORDER BY value DESC`).all();
  res.json(rows);
});

// 生产进度分布
router.get('/production-progress', (req, res) => {
  const rows = db.prepare(`SELECT status name, COUNT(*) cnt FROM production_groups GROUP BY status`).all();
  res.json(rows);
});

module.exports = router;
