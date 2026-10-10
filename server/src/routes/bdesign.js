/* B端设计需求路由 */
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db/database');
const { audit } = require('../services/auditService');

const ts = () => dayjs().format('YYYY-MM-DD HH:mm:ss');

router.get('/requirements', (req, res) => {
  res.json(db.prepare(`SELECT b.*, c.name customer_name, u.real_name user_name FROM b_design_requirements b
    LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN users u ON u.id=b.user_id
    ORDER BY b.created_at DESC LIMIT 100`).all());
});

router.post('/requirements', (req, res) => {
  const b = req.body;
  const id = uuid();
  db.prepare(`INSERT INTO b_design_requirements (id,customer_id,user_id,space_type,space_size,furniture_list,budget,delivery_date,attachments_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, b.customer_id || null, req.user?.id || null, b.space_type || null, b.space_size || null,
      JSON.stringify(b.furniture_list || []), b.budget || null, b.delivery_date || null,
      JSON.stringify(b.attachments || []), '待分析', ts(), ts());
  audit(req, '新建B端设计需求', 'b_design', id, null, { space_type: b.space_type });
  res.json({ id });
});

// 平面布局模拟（mock 酷家乐/CAD）
router.post('/layout-mock', (req, res) => {
  const { requirement_id } = req.body || {};
  const r = db.prepare(`SELECT * FROM b_design_requirements WHERE id=?`).get(requirement_id);
  if (!r) return res.status(404).json({ error: '需求不存在' });
  // 简单网格布局模拟：按家具清单生成摆放方案
  let furniture = [];
  try { furniture = JSON.parse(r.furniture_list || '[]'); } catch { /* */ }
  const layout = {
    tool: '酷家乐(模拟对接)',
    canvas: { width: 1200, height: 800 },
    items: furniture.map((f, i) => ({
      name: `${f.name} x${f.qty}`, size: f.size,
      x: 60 + (i % 3) * 380, y: 60 + Math.floor(i / 3) * 240, w: 320, h: 200,
      note: `占位约 ${f.qty} 组，靠墙/分区摆放`,
    })),
    disclaimers: ['AI 布局为示意方案，尺寸与管线位置需人工复核', '正式施工图需由设计师在酷家乐/CAD 中确认'],
  };
  db.prepare(`UPDATE b_design_requirements SET layout_result=?, status='已出方案', updated_at=? WHERE id=?`).run(JSON.stringify(layout), ts(), r.id);
  res.json(layout);
});

module.exports = router;
