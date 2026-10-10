/* 生产协同核心服务：报货清单生成、产品汇总分组算法、状态流转与反写 */
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db/database');
const { audit } = require('./auditService');

const ts = () => dayjs().format('YYYY-MM-DD HH:mm:ss');

// 参数归一化：JSON 键排序后拼串（保证同参数不同顺序归为一组）
function normParams(cp) {
  if (!cp) return '-';
  try {
    const obj = typeof cp === 'string' ? JSON.parse(cp) : cp;
    const keys = Object.keys(obj).sort();
    return keys.length ? keys.map((k) => `${k}=${obj[k]}`).join('|') : '-';
  } catch {
    return String(cp);
  }
}

// 分组 key：只有 产品+型号+颜色+规格+定制参数 完全一致才能合并
function makeGroupKey(productId, model, color, spec, customParams) {
  const raw = [productId, model || '', color || '', spec || '', normParams(customParams)].join('|');
  return crypto.createHash('sha1').update(raw).digest('hex');
}

// 生成报货清单：把订单行拆为 order_items（幂等：按明细状态判断，仅处理"待报货"行），并归组
function generateRequisition(orderId, user) {
  const order = db.prepare(`SELECT * FROM orders WHERE id=?`).get(orderId);
  if (!order) throw new Error('订单不存在');
  const pending = db.prepare(`SELECT COUNT(*) c FROM order_items WHERE order_id=? AND status='待报货'`).get(orderId).c;
  if (pending === 0) throw new Error('该订单没有待报货明细（可能已生成过报货清单）');

  const items = db.prepare(`SELECT * FROM order_items WHERE order_id=? AND status='待报货'`).all(orderId);
  for (const it of items) {
    db.prepare(`UPDATE order_items SET status='已报货', updated_at=? WHERE id=?`).run(ts(), it.id);
    assignToGroup(it, user);
  }
  if (order.status === '待确认') {
    db.prepare(`UPDATE orders SET status='已确认', updated_at=? WHERE id=?`).run(ts(), orderId);
  }
  audit({ user }, '生成报货清单', 'order', orderId, { status: order.status }, { status: '已确认' });
  return { item_count: items.length };
}

// 将报货明细归入产品汇总分组（group_key 一致才合并）
function assignToGroup(item, user) {
  const prod = db.prepare(`SELECT * FROM products WHERE id=?`).get(item.product_id);
  const model = prod ? prod.model : '';
  const gk = makeGroupKey(item.product_id, model, item.color, item.spec, item.custom_params);
  let g = db.prepare(`SELECT * FROM production_groups WHERE group_key=?`).get(gk);
  if (!g) {
    const gid = uuid();
    db.prepare(`INSERT INTO production_groups (id,group_key,product_id,model,color,spec,custom_params,total_qty,status,owner_id,progress_pct,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(gid, gk, item.product_id, model, item.color, item.spec, item.custom_params, 0, '待确认', null, 0, ts(), ts());
    g = db.prepare(`SELECT * FROM production_groups WHERE id=?`).get(gid);
  }
  db.prepare(`INSERT INTO production_group_refs (id,group_id,order_item_id,qty,created_at,updated_at) VALUES (?,?,?,?,?,?)`)
    .run(uuid(), g.id, item.id, item.qty, ts(), ts());
  db.prepare(`UPDATE production_groups SET total_qty = total_qty + ?, updated_at=? WHERE id=?`).run(item.qty, ts(), g.id);
  return g;
}

// 状态流转机
const FLOW = ['待确认', '待排产', '已排产', '生产中', '待质检', '待发货', '已发货', '已完成'];
const PROGRESS = { 待确认: 0, 待排产: 0, 已排产: 10, 生产中: 50, 待质检: 85, 待发货: 95, 已发货: 100, 已完成: 100 };
// 明细反写状态：组状态 → 明细状态
const ITEM_STATUS_MAP = { 待确认: '已报货', 待排产: '已报货', 已排产: '已报货', 生产中: '生产中', 待质检: '生产中', 待发货: '已入库', 已发货: '已发货', 已完成: '已发货' };

function transitionGroup(groupId, nextStatus, user, extra = {}) {
  const g = db.prepare(`SELECT * FROM production_groups WHERE id=?`).get(groupId);
  if (!g) throw new Error('生产组不存在');
  const fromIdx = FLOW.indexOf(g.status);
  const toIdx = FLOW.indexOf(nextStatus);
  if (toIdx === -1) throw new Error('无效状态');
  if (toIdx !== fromIdx + 1 && toIdx !== fromIdx - 1 && toIdx !== fromIdx) {
    throw new Error(`状态只能逐步流转：${g.status} → ${FLOW[fromIdx + 1] || '已是终态'}`);
  }
  const before = { status: g.status, plan_start: g.plan_start, plan_end: g.plan_end };
  db.prepare(`UPDATE production_groups SET status=?, progress_pct=?, plan_start=?, plan_end=?, workshop=?, owner_id=?, updated_at=? WHERE id=?`)
    .run(nextStatus, PROGRESS[nextStatus] ?? g.progress_pct,
      extra.plan_start ?? g.plan_start ?? (toIdx >= 2 ? dayjs().format('YYYY-MM-DD') : null),
      extra.plan_end ?? g.plan_end, extra.workshop ?? g.workshop, extra.owner_id ?? g.owner_id, ts(), groupId);
  // 反写明细状态
  db.prepare(`UPDATE order_items SET status=?, updated_at=? WHERE id IN (SELECT order_item_id FROM production_group_refs WHERE group_id=?)`)
    .run(ITEM_STATUS_MAP[nextStatus] || g.status, ts(), groupId);
  // 同步订单状态（简化：组发货 → 来源订单中若全部发货则标记）
  audit({ user }, '生产状态流转', 'production_group', groupId, before, { status: nextStatus });
  return db.prepare(`SELECT * FROM production_groups WHERE id=?`).get(groupId);
}

// 溯源：汇总组 → 来源订单/业务员
function traceGroup(groupId) {
  return db.prepare(`SELECT r.qty, oi.id item_id, oi.spec, oi.color, oi.custom_params,
    o.id order_id, o.order_no, o.status order_status, o.source,
    c.name customer_name, u.real_name sales_name, o.expected_delivery, o.created_at order_date
    FROM production_group_refs r
    JOIN order_items oi ON oi.id = r.order_item_id
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN users u ON u.id = o.user_id
    WHERE r.group_id = ?`).all(groupId);
}

// 进度反馈：通知相关业务员（由 refs 溯源去重）
function addFeedback(groupId, user, { stage, content, progress_pct }) {
  const salesIds = db.prepare(`SELECT DISTINCT o.user_id FROM production_group_refs r
    JOIN order_items oi ON oi.id=r.order_item_id JOIN orders o ON o.id=oi.order_id WHERE r.group_id=? AND o.user_id IS NOT NULL`)
    .all(groupId).map((r) => r.user_id);
  db.prepare(`INSERT INTO production_feedbacks (id,group_id,user_id,stage,content,progress_pct,notify_user_ids,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(uuid(), groupId, user?.id || null, stage || '进度', content, progress_pct ?? null, JSON.stringify([...new Set(salesIds)]), ts(), ts());
  if (progress_pct != null) {
    db.prepare(`UPDATE production_groups SET progress_pct=?, updated_at=? WHERE id=?`).run(progress_pct, ts(), groupId);
  }
  audit({ user }, '生产进度反馈', 'production_group', groupId, null, { stage, content });
  return { notified: [...new Set(salesIds)].length };
}

module.exports = { makeGroupKey, normParams, generateRequisition, assignToGroup, transitionGroup, traceGroup, addFeedback, FLOW };
