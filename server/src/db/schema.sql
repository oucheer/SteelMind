-- 钢制家具销售与生产协同智能化平台 数据库结构
PRAGMA foreign_keys = ON;

-- ============ 用户与权限 ============
CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  real_name TEXT NOT NULL,
  role TEXT NOT NULL, -- operator/c_agent/b_agent/sales_manager/production/after_sales/executive/admin
  phone TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT,
  updated_at TEXT
);

-- ============ 客户域 ============
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- c端/b端
  platform TEXT, -- 淘宝/天猫/京东/抖音/拼多多/线下/官网
  phone TEXT,
  wechat TEXT,
  region TEXT,
  level TEXT DEFAULT '普通', -- 普通/VIP
  source_campaign TEXT,
  owner_id TEXT REFERENCES users(id),
  status TEXT DEFAULT 'active',
  remark TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  name TEXT NOT NULL,
  position TEXT,
  phone TEXT,
  email TEXT,
  is_primary INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  user_id TEXT REFERENCES users(id),
  content TEXT NOT NULL,
  type TEXT, -- 电话/微信/拜访
  next_plan TEXT,
  next_time TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- ============ 产品域 ============
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL, -- 文件柜/钢制更衣柜/密集架/货架/工位桌等
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  base_price REAL,
  unit TEXT DEFAULT '件',
  description TEXT,
  image_url TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS product_skus (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  color TEXT NOT NULL,
  spec TEXT NOT NULL, -- 如 900*450*1800
  material TEXT,
  custom_params TEXT, -- JSON 文本，可空
  price REAL NOT NULL,
  stock INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

-- ============ 交易域 ============
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  quote_no TEXT UNIQUE NOT NULL,
  customer_id TEXT REFERENCES customers(id),
  user_id TEXT REFERENCES users(id),
  conversation_id TEXT,
  source TEXT DEFAULT 'manual', -- conversation/b_design/manual
  status TEXT DEFAULT '草稿', -- 草稿/待审批/已发送/已确认/已作废
  total_amount REAL DEFAULT 0,
  valid_until TEXT,
  items_json TEXT, -- 报价行项目 JSON 数组
  ai_generated INTEGER DEFAULT 0,
  pending_fields TEXT, -- JSON：AI 标记待确认的字段列表
  remark TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  contract_no TEXT UNIQUE NOT NULL,
  quote_id TEXT REFERENCES quotes(id),
  customer_id TEXT REFERENCES customers(id),
  amount REAL,
  status TEXT DEFAULT '草稿', -- 草稿/待签署/已签署/已作废
  sign_status_mock TEXT,
  file_url_mock TEXT,
  content_json TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  customer_id TEXT REFERENCES customers(id),
  user_id TEXT REFERENCES users(id), -- 业务员
  quote_id TEXT REFERENCES quotes(id),
  source TEXT, -- 淘宝/天猫/京东/抖音/拼多多/线下/官网
  channel_order_no TEXT,
  status TEXT DEFAULT '待确认', -- 待确认/已确认/生产中/部分发货/已发货/已完成/已取消
  total_amount REAL DEFAULT 0,
  signed_at TEXT,
  expected_delivery TEXT,
  remark TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- 报货明细（原子追溯单元）：颜色/规格/定制参数做快照冗余
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT REFERENCES products(id),
  sku_id TEXT REFERENCES product_skus(id),
  qty INTEGER NOT NULL,
  unit_price REAL,
  color TEXT NOT NULL,
  spec TEXT NOT NULL,
  custom_params TEXT, -- JSON 文本快照
  status TEXT DEFAULT '待报货', -- 待报货/已报货/生产中/已入库/已发货
  note TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- ============ 生产域 ============
-- 产品汇总分组：group_key = sha1(product_id|model|color|spec|custom_params 归一化)
CREATE TABLE IF NOT EXISTS production_groups (
  id TEXT PRIMARY KEY,
  group_key TEXT UNIQUE NOT NULL,
  product_id TEXT REFERENCES products(id),
  model TEXT,
  color TEXT,
  spec TEXT,
  custom_params TEXT,
  total_qty INTEGER DEFAULT 0,
  status TEXT DEFAULT '待确认', -- 待确认/待排产/已排产/生产中/待质检/待发货/已发货/已完成
  plan_start TEXT,
  plan_end TEXT,
  workshop TEXT,
  owner_id TEXT REFERENCES users(id),
  progress_pct INTEGER DEFAULT 0,
  remark TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- 汇总↔明细追溯桥表
CREATE TABLE IF NOT EXISTS production_group_refs (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES production_groups(id),
  order_item_id TEXT NOT NULL REFERENCES order_items(id),
  qty INTEGER NOT NULL,
  created_at TEXT,
  updated_at TEXT
);

-- 生产进度反馈
CREATE TABLE IF NOT EXISTS production_feedbacks (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES production_groups(id),
  user_id TEXT REFERENCES users(id),
  stage TEXT, -- 开工/进度/质检/完工
  content TEXT,
  progress_pct INTEGER,
  notify_user_ids TEXT, -- JSON：需通知的业务员
  created_at TEXT,
  updated_at TEXT
);

-- ============ 履约域 ============
CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  shipment_no TEXT UNIQUE NOT NULL,
  order_id TEXT REFERENCES orders(id),
  logistics_company TEXT,
  tracking_no TEXT,
  status TEXT DEFAULT '待安排', -- 待安排/已发货/已签收
  ship_date TEXT,
  receiver TEXT,
  phone TEXT,
  address TEXT,
  items_json TEXT, -- 发货清单行
  remark TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS after_sales (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES orders(id),
  type TEXT, -- 安装/维修/退换
  status TEXT DEFAULT '待处理',
  handler_id TEXT REFERENCES users(id),
  content TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- ============ 内容与知识 ============
CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL, -- image/video/copy
  url_or_content TEXT,
  tags TEXT, -- JSON 数组
  campaign TEXT,
  platform TEXT,
  product_id TEXT REFERENCES products(id),
  status TEXT DEFAULT '已确认', -- AI生成/待审核/已确认
  uploader_id TEXT REFERENCES users(id),
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS knowledge_base (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT, -- 产品知识/价格政策/售后政策/话术
  content TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  updater_id TEXT REFERENCES users(id),
  created_at TEXT,
  updated_at TEXT
);

-- B端设计需求
CREATE TABLE IF NOT EXISTS b_design_requirements (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  user_id TEXT REFERENCES users(id),
  space_type TEXT,
  space_size TEXT,
  furniture_list TEXT, -- JSON：[{name,qty,size}]
  budget TEXT,
  delivery_date TEXT,
  attachments_json TEXT,
  analysis_result TEXT, -- AI 需求分析结果
  layout_result TEXT, -- 平面布局模拟结果
  status TEXT DEFAULT '待分析',
  created_at TEXT,
  updated_at TEXT
);

-- ============ AI 与审计 ============
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  channel TEXT, -- 淘宝/天猫/京东/抖音/拼多多/内部助手
  type TEXT DEFAULT '客服', -- 客服/销售助手/需求分析
  user_id TEXT REFERENCES users(id),
  status TEXT DEFAULT '进行中',
  last_msg_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id),
  role TEXT NOT NULL, -- user/assistant/system
  content TEXT NOT NULL,
  meta_json TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  user_name TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  before_json TEXT,
  after_json TEXT,
  ip TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- 报价发送/提交生产/交期变更
  target_type TEXT,
  target_id TEXT,
  summary TEXT,
  applicant_id TEXT REFERENCES users(id),
  status TEXT DEFAULT '待审批', -- 待审批/通过/驳回
  approver_id TEXT REFERENCES users(id),
  comment TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- 常用索引
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_pgr_group ON production_group_refs(group_id);
CREATE INDEX IF NOT EXISTS idx_pgr_item ON production_group_refs(order_item_id);
CREATE INDEX IF NOT EXISTS idx_ai_msg_conv ON ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_customer ON follow_ups(customer_id);
