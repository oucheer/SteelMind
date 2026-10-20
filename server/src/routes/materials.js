const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db/database');
const { audit } = require('../services/auditService');
const { MEDIA_DIR } = require('../services/mediaService');

router.get('/', (req, res) => {
  const { type, platform, status, keyword } = req.query;
  let sql = `SELECT m.*, p.name product_name, u.real_name uploader FROM materials m
    LEFT JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.uploader_id WHERE 1=1`;
  const args = [];
  if (type) { sql += ` AND m.type=?`; args.push(type); }
  if (platform) { sql += ` AND m.platform=?`; args.push(platform); }
  if (status) { sql += ` AND m.status=?`; args.push(status); }
  if (keyword) { sql += ` AND m.title LIKE ?`; args.push(`%${keyword}%`); }
  sql += ` ORDER BY m.created_at DESC LIMIT 200`;
  res.json(db.prepare(sql).all(...args));
});

router.post('/', (req, res) => {
  const { title, type, url_or_content, tags, campaign, platform, product_id, status } = req.body;
  const id = uuid();
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare(`INSERT INTO materials (id,title,type,url_or_content,tags,campaign,platform,product_id,status,uploader_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, title, type, url_or_content, JSON.stringify(tags || []), campaign || null, platform || '通用', product_id || null, status || '已确认', req.user?.id || null, ts, ts);
  audit(req, '新建素材', 'material', id, null, { title });
  res.json({ id });
});

router.put('/:id', (req, res) => {
  const m = db.prepare(`SELECT * FROM materials WHERE id=?`).get(req.params.id);
  if (!m) return res.status(404).json({ error: '素材不存在' });
  const b = req.body;
  db.prepare(`UPDATE materials SET title=?,type=?,url_or_content=?,tags=?,campaign=?,platform=?,product_id=?,status=?,updated_at=? WHERE id=?`)
    .run(b.title ?? m.title, b.type ?? m.type, b.url_or_content ?? m.url_or_content,
      b.tags ? JSON.stringify(b.tags) : m.tags, b.campaign ?? m.campaign, b.platform ?? m.platform,
      b.product_id ?? m.product_id, b.status ?? m.status, dayjs().format('YYYY-MM-DD HH:mm:ss'), m.id);
  audit(req, '修改素材', 'material', m.id, m, b);
  res.json({ ok: true });
});

// 删除素材：连同生成的媒体文件（音频/视频/SRT）一起清理
router.delete('/:id', (req, res) => {
  const m = db.prepare(`SELECT * FROM materials WHERE id=?`).get(req.params.id);
  if (m) audit(req, '删除素材', 'material', m.id, m, null);
  db.prepare(`DELETE FROM materials WHERE id=?`).run(req.params.id);
  // 收集关联的磁盘文件并清理
  const files = [];
  const collect = (u) => { if (typeof u === 'string' && u.startsWith('/files/media/')) files.push(path.basename(u)); };
  collect(m.url_or_content);
  if (m.type === 'audio') {
    try { const j = JSON.parse(m.url_or_content || '{}'); collect(j.audio_url); collect(j.srt_url); } catch { /* 纯文本素材 */ }
  }
  for (const f of files) { try { fs.unlinkSync(path.join(MEDIA_DIR, f)); } catch { /* 文件不存在则忽略 */ } }
  res.json({ ok: true, files_removed: files.length });
});

module.exports = router;
