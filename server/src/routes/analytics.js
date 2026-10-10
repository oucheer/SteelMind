const router = require('express').Router();
const db = require('../db/database');
const dayjs = require('dayjs');

// 经营驾驶舱：四端数据
router.get('/overview', (req, res) => {
  const dimension = req.query.dimension || 'sales';
  const in3 = dayjs().add(3, 'day').format('YYYY-MM-DD');

  if (dimension === 'operations') {
    const materials = db.prepare(`SELECT type, COUNT(*) c FROM materials GROUP BY type`).all();
    const pendingReview = db.prepare(`SELECT COUNT(*) c FROM materials WHERE status='待审核'`).get().c;
    const byPlatform = db.prepare(`SELECT platform name, COUNT(*) value FROM materials GROUP BY platform`).all();
    const conversations = db.prepare(`SELECT channel name, COUNT(*) value FROM ai_conversations GROUP BY channel`).all();
    res.json({ materials, pending_review: pendingReview, by_platform: byPlatform, conversations });
  } else if (dimension === 'production') {
    const byStatus = db.prepare(`SELECT status name, COUNT(*) value FROM production_groups GROUP BY status`).all();
    const urgent = db.prepare(`SELECT COUNT(*) c FROM production_groups g WHERE g.status NOT IN ('已发货','已完成') AND
      (SELECT MIN(o.expected_delivery) FROM production_group_refs r JOIN order_items oi ON oi.id=r.order_item_id JOIN orders o ON o.id=oi.order_id WHERE r.group_id=g.id) <= ?`).get(in3).c;
    const completion = db.prepare(`SELECT ROUND(100.0*SUM(CASE WHEN status='已完成' THEN 1 ELSE 0 END)/COUNT(*),1) v FROM production_groups`).get().v;
    const topProducts = db.prepare(`SELECT p.name || ' ' || g.model name, g.total_qty value FROM production_groups g
      JOIN products p ON p.id=g.product_id ORDER BY g.total_qty DESC LIMIT 8`).all();
    res.json({ by_status: byStatus, urgent, completion, top_products: topProducts });
  } else if (dimension === 'after_sales') {
    const byStatus = db.prepare(`SELECT status name, COUNT(*) value FROM shipments GROUP BY status`).all();
    const byLogistics = db.prepare(`SELECT logistics_company name, COUNT(*) value FROM shipments GROUP BY logistics_company`).all();
    const afterSales = db.prepare(`SELECT type name, COUNT(*) value FROM after_sales GROUP BY type`).all();
    res.json({ by_status: byStatus, by_logistics: byLogistics, after_sales: afterSales });
  } else {
    // sales
    const quoteByStatus = db.prepare(`SELECT status name, COUNT(*) value FROM quotes GROUP BY status`).all();
    const orderByStatus = db.prepare(`SELECT status name, COUNT(*) value FROM orders GROUP BY status`).all();
    const byAgent = db.prepare(`SELECT u.real_name name, COUNT(o.id) order_count, IFNULL(SUM(o.total_amount),0) amount
      FROM users u LEFT JOIN orders o ON o.user_id=u.id WHERE u.role IN ('c_agent','b_agent') GROUP BY u.id ORDER BY amount DESC`).all();
    const pendingApprovals = db.prepare(`SELECT COUNT(*) c FROM approvals WHERE status='待审批'`).get().c;
    const crmErrors = db.prepare(`SELECT COUNT(*) c FROM orders WHERE status='待确认' AND created_at < datetime('now','-3 days')`).get().c;
    res.json({ quote_by_status: quoteByStatus, order_by_status: orderByStatus, by_agent: byAgent, pending_approvals: pendingApprovals, crm_pending: crmErrors });
  }
});

module.exports = router;
