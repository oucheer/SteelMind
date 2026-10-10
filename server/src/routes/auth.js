const router = require('express').Router();
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');
const db = require('../db/database');
const { getUserByToken } = require('../middleware/auth');
const { audit } = require('../services/auditService');

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare(`SELECT * FROM users WHERE username=? AND password=? AND status='active'`).get(username, password);
  if (!user) return res.status(400).json({ error: '用户名或密码错误' });
  const token = uuid();
  const ts = dayjs().format('YYYY-MM-DD HH:mm:ss');
  db.prepare(`INSERT INTO auth_tokens (token,user_id,created_at,updated_at) VALUES (?,?,?,?)`).run(token, user.id, ts, ts);
  audit({ user, ip: req.ip }, '登录系统', 'user', user.id, null, null);
  res.json({ token, user: { id: user.id, username: user.username, real_name: user.real_name, role: user.role } });
});

router.get('/me', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ error: '未登录' });
  res.json({ id: user.id, username: user.username, real_name: user.real_name, role: user.role });
});

router.post('/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  db.prepare(`DELETE FROM auth_tokens WHERE token=?`).run(token);
  res.json({ ok: true });
});

module.exports = router;
