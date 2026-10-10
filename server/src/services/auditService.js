/* 统一操作日志 */
const db = require('../db/database');
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');

function audit(req, action, targetType, targetId, beforeJson, afterJson) {
  const user = req.user || {};
  db.prepare(`INSERT INTO audit_logs (id,user_id,user_name,action,target_type,target_id,before_json,after_json,ip,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uuid(), user.id || null, user.real_name || '系统', action, targetType, targetId || null,
      beforeJson ? JSON.stringify(beforeJson) : null, afterJson ? JSON.stringify(afterJson) : null,
      req.ip || '', dayjs().format('YYYY-MM-DD HH:mm:ss'), dayjs().format('YYYY-MM-DD HH:mm:ss'));
}
module.exports = { audit };
