/* 认证中间件：token 持久化到 SQLite（服务重启不失效） */
const db = require('../db/database');
const dayjs = require('dayjs');

const cache = new Map();

function getUserByToken(token) {
  if (!token) return null;
  if (cache.has(token)) return cache.get(token);
  const row = db.prepare(`SELECT u.* FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE t.token=?`).get(token);
  const user = row || null;
  cache.set(token, user);
  return user;
}

function authOptional(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  req.user = getUserByToken(token);
  next();
}
function authRequired(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ error: '未登录或登录已过期' });
  req.user = user;
  next();
}
module.exports = { authOptional, authRequired, getUserByToken };
