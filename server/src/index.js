require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 路由挂载（全局注入可选认证：req.user 供审计与业务归属使用）
const { authOptional } = require('./middleware/auth');
app.use('/api', authOptional);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/materials', require('./routes/materials'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/b-design', require('./routes/bdesign'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/production', require('./routes/production'));
app.use('/api/shipments', require('./routes/shipments'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/mock', require('./routes/mock'));
app.use('/api/media', require('./routes/media'));
app.use('/api/search', require('./routes/search'));

// AI 生成的媒体文件（口播音频/视频）
app.use('/files/media', express.static(path.join(__dirname, '..', 'data', 'media')));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// 错误处理
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
