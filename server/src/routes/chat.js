const router = require('express').Router();
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db/database');

router.get('/conversations', (req, res) => {
  const { channel } = req.query;
  let sql = `SELECT c.*, cu.name customer_name, cu.type customer_type FROM ai_conversations c
    LEFT JOIN customers cu ON cu.id=c.customer_id WHERE 1=1`;
  const args = [];
  if (channel && channel !== '全部') { sql += ` AND c.channel=?`; args.push(channel); }
  sql += ` ORDER BY c.last_msg_at DESC LIMIT 100`;
  res.json(db.prepare(sql).all(...args));
});

router.get('/conversations/:id/messages', (req, res) => {
  res.json(db.prepare(`SELECT * FROM ai_messages WHERE conversation_id=? ORDER BY created_at`).all(req.params.id));
});

router.post('/conversations', (req, res) => {
  const { customer_id, channel, type } = req.body;
  const id = uuid();
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare(`INSERT INTO ai_conversations (id,customer_id,channel,type,user_id,status,last_msg_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, customer_id || null, channel || '内部助手', type || '客服', req.user?.id || null, '进行中', ts, ts, ts);
  res.json({ id });
});

router.post('/conversations/:id/messages', (req, res) => {
  const { role, content, meta_json } = req.body;
  const id = uuid();
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare(`INSERT INTO ai_messages (id,conversation_id,role,content,meta_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
    .run(id, req.params.id, role, content, meta_json || null, ts, ts);
  db.prepare(`UPDATE ai_conversations SET last_msg_at=? WHERE id=?`).run(ts, req.params.id);
  res.json({ id });
});

module.exports = router;
