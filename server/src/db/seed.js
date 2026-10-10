/* 演示数据种子脚本：node src/db/seed.js（幂等：重建全部数据） */
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const dayjs = require('dayjs');
const db = require('./database');

// ---------- 工具 ----------
const now = () => dayjs().format('YYYY-MM-DD HH:mm:ss');
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pickQty = () => [1, 1, 2, 2, 3, 5, 8, 10, 15, 20, 30, 50][randInt(0, 11)];

function normParams(cp) {
  if (!cp) return '-';
  try {
    const obj = typeof cp === 'string' ? JSON.parse(cp) : cp;
    const keys = Object.keys(obj).sort();
    return keys.map((k) => `${k}=${obj[k]}`).join('|') || '-';
  } catch {
    return String(cp);
  }
}
function groupKeyOf(itemId) {
  return crypto.createHash('sha1').update(itemId).digest('hex');
}
// 生产分组 key：产品+型号+颜色+规格+参数 归一化
function groupKey(productId, model, color, spec, customParams) {
  const raw = [productId, model, color, spec, normParams(customParams)].join('|');
  return crypto.createHash('sha1').update(raw).digest('hex');
}

// ---------- 清空 ----------
const tables = [
  'audit_logs', 'approvals', 'ai_messages', 'ai_conversations', 'knowledge_base', 'materials',
  'b_design_requirements', 'after_sales', 'shipments', 'production_feedbacks',
  'production_group_refs', 'production_groups', 'order_items', 'orders', 'contracts', 'quotes',
  'product_skus', 'products', 'follow_ups', 'contacts', 'customers', 'users',
];
db.transaction(() => {
  db.exec(`PRAGMA foreign_keys = OFF;`);
  tables.forEach((t) => db.exec(`DROP TABLE IF EXISTS ${t};`));
  db.exec(`PRAGMA foreign_keys = ON;`);
  // 重新建表
  const fs = require('fs');
  db.exec(fs.readFileSync(__dirname + '/schema.sql', 'utf-8'));
})();

const ts = now();

// ---------- 用户 ----------
const roles = [
  ['admin', '系统管理员', 'admin'], ['operator1', '陈运营', 'operator'],
  ['agent_c1', '刘晓敏', 'c_agent'], ['agent_c2', '赵小红', 'c_agent'],
  ['agent_b1', '王建国', 'b_agent'], ['agent_b2', '李明华', 'b_agent'],
  ['manager1', '张总管', 'sales_manager'], ['factory1', '孙工厂', 'production'],
  ['factory2', '周车间', 'production'], ['after1', '吴售后', 'after_sales'],
  ['exec1', '马总', 'executive'],
];
const userIds = {};
const insUser = db.prepare(`INSERT INTO users (id,username,password,real_name,role,phone,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`);
roles.forEach(([u, name, role]) => {
  const id = uuid();
  userIds[u] = id;
  insUser.run(id, u, '123456', name, role, `138${randInt(10000000, 99999999)}`, 'active', ts, ts);
});
const salesAgents = ['agent_c1', 'agent_c2', 'agent_b1', 'agent_b2'].map((u) => ({ u, id: userIds[u] }));

// ---------- 客户 ----------
const cPlatforms = ['淘宝', '天猫', '京东', '抖音', '拼多多'];
const cNames1 = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '林', '罗', '郑'];
const cNames2 = ['先生', '女士', '老师', '经理'];
const regions = ['广东广州', '浙江杭州', '江苏南京', '四川成都', '湖北武汉', '山东青岛', '河南郑州', '福建厦门', '陕西西安', '北京'];
const bCompanies = [
  '华信科技有限公司', '正大办公设备有限公司', '启航教育集团', '康桥医院后勤管理处', '恒力制造有限公司',
  '蓝天幼儿园', '市第一实验中学', '众创空间管理有限公司', '安泰物流集团', '博文图书馆设备公司',
  '金盾保安服务公司', '绿洲酒店管理公司', '纵横律师事务所', '泰康养老院', '精益电子厂',
];
const insCust = db.prepare(`INSERT INTO customers (id,name,type,platform,phone,wechat,region,level,source_campaign,owner_id,status,remark,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const customers = [];
for (let i = 0; i < 25; i++) {
  const owner = rand(salesAgents);
  const c = {
    id: uuid(), name: `${cNames1[i % 20]}${rand(cNames2)}`, type: 'c端', platform: cPlatforms[i % 5],
    phone: `139${randInt(10000000, 99999999)}`, wechat: `wx_${Math.random().toString(36).slice(2, 8)}`,
    region: rand(regions), level: i % 9 === 0 ? 'VIP' : '普通', owner_id: owner.id,
  };
  insCust.run(c.id, c.name, c.type, c.platform, c.phone, c.wechat, c.region, c.level, null, c.owner_id, 'active', null, ts, ts);
  customers.push(c);
}
for (let i = 0; i < 15; i++) {
  const owner = i % 2 === 0 ? salesAgents[2] : salesAgents[3]; // B端分给 b_agent
  const c = {
    id: uuid(), name: bCompanies[i], type: 'b端', platform: rand(['官网', '线下', '抖音', '百度推广']),
    phone: `137${randInt(10000000, 99999999)}`, wechat: `corp_${Math.random().toString(36).slice(2, 8)}`,
    region: rand(regions), level: i < 3 ? 'VIP' : '普通', owner_id: owner.id,
  };
  insCust.run(c.id, c.name, c.type, c.platform, c.phone, c.wechat, c.region, c.level, null, c.owner_id, 'active', null, ts, ts);
  customers.push(c);
}

// ---------- 产品 ----------
const productDefs = [
  { category: '文件柜', name: '钢制文件柜', models: [{ model: 'WJG-2000A', price: 680, specs: ['900*450*2000', '1000*500*2000'] }, { model: 'WJG-1850B', price: 560, specs: ['850*450*1850'] }] },
  { category: '更衣柜', name: '钢制员工更衣柜', models: [{ model: 'GYG-6门', price: 420, specs: ['900*500*1850'] }, { model: 'GYG-12门', price: 760, specs: ['900*500*1850'] }] },
  { category: '密集架', name: '手动密集架', models: [{ model: 'MJS-标准', price: 980, specs: ['2300*900*560'] }] },
  { category: '货架', name: '仓储轻型货架', models: [{ model: 'HJ-200kg', price: 260, specs: ['1500*500*2000'] }, { model: 'HJ-500kg', price: 480, specs: ['2000*600*2000'] }] },
  { category: '工位桌', name: '钢制办公工位桌', models: [{ model: 'GZW-1400', price: 520, specs: ['1400*700*750'] }, { model: 'GZW-1600', price: 610, specs: ['1600*800*750'] }] },
  { category: '床品', name: '钢制公寓床', models: [{ model: 'GYC-上床下桌', price: 1580, specs: ['1980*900*2080'] }] },
];
const colors = ['灰白', '蓝色', '灰色', '米白', '橙色'];
const insProd = db.prepare(`INSERT INTO products (id,category,name,model,base_price,unit,description,image_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
const insSku = db.prepare(`INSERT INTO product_skus (id,product_id,color,spec,material,custom_params,price,stock,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
const products = [], skus = [];
for (const def of productDefs) {
  for (const m of def.models) {
    const pid = uuid();
    const prod = { id: pid, category: def.category, name: def.name, model: m.model, base_price: m.price };
    insProd.run(pid, def.category, def.name, m.model, m.price, '件', `${def.name} ${m.model}，优质冷轧钢板，静电喷塑`, null, ts, ts);
    products.push(prod);
    m.specs.forEach((spec) => {
      colors.slice(0, randInt(2, 3)).forEach((color) => {
        const sid = uuid();
        const cp = Math.random() < 0.25 ? JSON.stringify({ 加装锁具: rand(['电子锁', '机械锁']), 板材厚度: rand(['0.8mm', '1.0mm']) }) : null;
        const sku = { id: sid, product_id: pid, model: m.model, color, spec, custom_params: cp, price: Math.round(m.price * randInt(95, 115) / 100) };
        insSku.run(sid, pid, color, spec, '冷轧钢板', cp, sku.price, randInt(50, 500), ts, ts);
        skus.push(sku);
      });
    });
  }
}

// ---------- 订单 + 明细（刻意让同组合重复出现，制造汇总合并效果） ----------
const orderStatuses = [
  ['已完成', 15], ['已发货', 10], ['生产中', 15], ['待确认', 10], ['部分发货', 5], ['已取消', 5],
];
const statusPool = orderStatuses.flatMap(([s, n]) => Array(n).fill(s));
// 刻意准备高频组合（跨订单重复），保证汇总合并效果明显
const hotCombos = [];
for (let i = 0; i < 6; i++) hotCombos.push(rand(skus));

const insOrder = db.prepare(`INSERT INTO orders (id,order_no,customer_id,user_id,quote_id,source,channel_order_no,status,total_amount,signed_at,expected_delivery,remark,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insItem = db.prepare(`INSERT INTO order_items (id,order_id,product_id,sku_id,qty,unit_price,color,spec,custom_params,status,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const orders = [];
const today = dayjs();
for (let i = 0; i < 60; i++) {
  const status = statusPool[i];
  const cust = rand(customers);
  const owner = salesAgents.find((s) => s.id === cust.owner_id) || rand(salesAgents);
  // 近90天，今日保证 3 单
  const daysAgo = i < 3 ? 0 : randInt(0, 89);
  const createdAt = today.subtract(daysAgo, 'day').subtract(randInt(0, 12), 'hour').format('YYYY-MM-DD HH:mm:ss');
  const oid = uuid();
  const order = { id: oid, order_no: `SO${today.subtract(daysAgo, 'day').format('YYYYMMDD')}${String(1000 + i)}`, customer_id: cust.id, user_id: owner.id, source: cust.platform || '线下', status, created_at: createdAt };
  insOrder.run(oid, order.order_no, cust.id, owner.id, null, order.source, `TB${randInt(100000000, 999999999)}`, status, 0,
    daysAgo < 5 ? createdAt : null, today.subtract(daysAgo, 'day').add(randInt(7, 30), 'day').format('YYYY-MM-DD'), null, createdAt, ts);
  const nItems = randInt(1, 4);
  let total = 0;
  for (let j = 0; j < nItems; j++) {
    // 50% 概率用热组合制造重复
    const sku = Math.random() < 0.5 && hotCombos.length ? rand(hotCombos) : rand(skus);
    const qty = pickQty();
    const amt = sku.price * qty;
    total += amt;
    const stMap = { '待确认': '待报货', '已确认': '已报货', '生产中': '生产中', '已发货': '已入库', '已完成': '已发货' };
    let itemStatus = stMap[status] || '待报货';
    if (status === '部分发货') itemStatus = Math.random() < 0.5 ? '已发货' : '生产中';
    insItem.run(uuid(), oid, sku.product_id, sku.id, qty, sku.price, sku.color, sku.spec, sku.custom_params, status === '已取消' ? '待报货' : itemStatus, null, createdAt, ts);
  }
  db.prepare(`UPDATE orders SET total_amount=? WHERE id=?`).run(total, oid);
  orders.push(order);
}

// ---------- 报价 + 合同 ----------
const insQuote = db.prepare(`INSERT INTO quotes (id,quote_no,customer_id,user_id,conversation_id,source,status,total_amount,valid_until,items_json,ai_generated,pending_fields,remark,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insContract = db.prepare(`INSERT INTO contracts (id,contract_no,quote_id,customer_id,amount,status,sign_status_mock,file_url_mock,content_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const quoteStatuses = ['草稿', '待审批', '已发送', '已确认', '已确认', '已发送'];
for (let i = 0; i < 25; i++) {
  const cust = rand(customers);
  const sku = rand(skus);
  const qty = pickQty();
  const amt = sku.price * qty;
  const status = i < 3 ? '待审批' : rand(quoteStatuses);
  const qid = uuid();
  const items = [{ sku_id: sku.id, product: `${sku.model}`, color: sku.color, spec: sku.spec, qty, unit_price: sku.price, amount: amt }];
  const pending = i < 5 ? JSON.stringify([{ field: '交期', reason: '客户要求加急，需与工厂确认产能' }]) : null;
  insQuote.run(qid, `QT${today.format('YYYYMM')}${String(100 + i)}`, cust.id, cust.owner_id, null,
    i < 3 ? 'conversation' : rand(['manual', 'conversation']), status, amt,
    today.add(randInt(5, 30), 'day').format('YYYY-MM-DD'), JSON.stringify(items),
    i < 3 ? 1 : 0, pending, null, ts, ts);
  if (status === '已确认' && i % 2 === 0) {
    const cid = uuid();
    insContract.run(cid, `HT${today.format('YYYYMM')}${String(50 + i)}`, qid, cust.id, amt,
      i % 4 === 0 ? '已签署' : '待签署', i % 4 === 0 ? '已签署(e签宝mock)' : null, `/files/mock/contract_${50 + i}.pdf`, JSON.stringify(items), ts, ts);
  }
}

// ---------- 生产分组 + refs（全部 order_items 归组，非取消订单） ----------
const insGroup = db.prepare(`INSERT INTO production_groups (id,group_key,product_id,model,color,spec,custom_params,total_qty,status,plan_start,plan_end,workshop,owner_id,progress_pct,remark,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insRef = db.prepare(`INSERT INTO production_group_refs (id,group_id,order_item_id,qty,created_at,updated_at) VALUES (?,?,?,?,?,?)`);
const groupMap = new Map();
const groupStatusPool = ['待确认', '待排产', '已排产', '生产中', '生产中', '待质检', '待发货', '已发货', '已完成', '已完成'];
let gsIdx = 0;
const allItems = db.prepare(`SELECT oi.*, o.status as order_status FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status != '已取消'`).all();
for (const item of allItems) {
  const prod = products.find((p) => p.id === item.product_id);
  const gk = groupKey(item.product_id, prod ? prod.model : '', item.color, item.spec, item.custom_params);
  let g = groupMap.get(gk);
  if (!g) {
    const gid = uuid();
    const status = item.status === '待报货' ? '待确认' : groupStatusPool[gsIdx++ % groupStatusPool.length];
    const progress = { 待确认: 0, 待排产: 0, 已排产: 10, 生产中: randInt(30, 70), 待质检: 85, 待发货: 95, 已发货: 100, 已完成: 100 }[status] ?? 0;
    g = { id: gid, group_key: gk, product_id: item.product_id, model: prod ? prod.model : '', color: item.color, spec: item.spec, custom_params: item.custom_params, total_qty: 0, status, progress };
    insGroup.run(gid, gk, item.product_id, g.model, item.color, item.spec, item.custom_params, 0, status,
      status === '待确认' ? null : today.subtract(randInt(1, 15), 'day').format('YYYY-MM-DD'),
      today.add(randInt(3, 25), 'day').format('YYYY-MM-DD'),
      rand(['一车间', '二车间', '三车间']), userIds.factory1, progress, null, ts, ts);
    groupMap.set(gk, g);
  }
  g.total_qty += item.qty;
  insRef.run(uuid(), g.id, item.id, item.qty, ts, ts);
}
for (const g of groupMap.values()) {
  db.prepare(`UPDATE production_groups SET total_qty=? WHERE id=?`).run(g.total_qty, g.id);
}
// 明细状态与所属组状态保持一致（与生产服务 ITEM_STATUS_MAP 相同映射）
const SEED_ITEM_MAP = { 待确认: '已报货', 待排产: '已报货', 已排产: '已报货', 生产中: '生产中', 待质检: '生产中', 待发货: '已入库', 已发货: '已发货', 已完成: '已发货' };
for (const g of groupMap.values()) {
  const st = SEED_ITEM_MAP[g.status];
  if (st) db.prepare(`UPDATE order_items SET status=? WHERE id IN (SELECT order_item_id FROM production_group_refs WHERE group_id=?)`).run(st, g.id);
}

// ---------- 发货 ----------
const insShip = db.prepare(`INSERT INTO shipments (id,shipment_no,order_id,logistics_company,tracking_no,status,ship_date,receiver,phone,address,items_json,remark,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const logistics = ['德邦物流', '跨越速运', '顺丰速运'];
const shippableOrders = orders.filter((o) => ['已发货', '部分发货', '已完成'].includes(o.status));
shippableOrders.forEach((o, i) => {
  const cust = customers.find((c) => c.id === o.customer_id);
  const status = o.status === '部分发货' ? '待安排' : rand(['已发货', '已签收']);
  insShip.run(uuid(), `SH${today.format('YYYYMM')}${String(200 + i)}`, o.id, rand(logistics),
    `SF${randInt(100000000000, 999999999999)}`, status,
    status === '待安排' ? null : today.subtract(randInt(1, 20), 'day').format('YYYY-MM-DD'),
    cust.name, cust.phone, `${cust.region}某某工业园区18号`, null, null, ts, ts);
});

// ---------- 素材 + 知识库 ----------
const insMat = db.prepare(`INSERT INTO materials (id,title,type,url_or_content,tags,campaign,platform,product_id,status,uploader_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
const matDefs = [
  ['钢制文件柜 主图', 'image'], ['员工更衣柜 详情图', 'image'], ['密集架 场景图', 'image'],
  ['双11活动海报', 'image'], ['工厂生产线实拍', 'video'], ['安装教程视频', 'video'],
  ['办公室场景展示', 'video'], ['文件柜卖点文案', 'copy'], ['更衣柜小红书种草文', 'copy'],
  ['京东详情页文案', 'copy'], ['抖音短视频脚本', 'copy'], ['新品上架宣传图', 'image'],
];
matDefs.forEach(([title, type], i) => {
  insMat.run(uuid(), title, type, type === 'copy' ? `【${title}】优质冷轧钢板，静电喷塑，承重强、防潮防锈，办公存储首选。` : `/files/mock/material_${i + 1}.${type === 'image' ? 'jpg' : 'mp4'}`,
    JSON.stringify([rand(['新品', '活动', '场景', '工厂', '教程'])]), rand(['双11', '年货节', '日常']), rand([...cPlatforms, '通用']), rand(products).id,
    i < 3 ? '待审核' : '已确认', userIds.operator1, ts, ts);
});

const insKb = db.prepare(`INSERT INTO knowledge_base (id,title,category,content,enabled,updater_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`);
const kbDefs = [
  ['文件柜价格政策', '价格政策', 'WJG-2000A 文件柜零售价 680 元/件，10 件以上享 95 折，50 件以上享 9 折；定制颜色不加价，定制尺寸需人工报价。'],
  ['更衣柜价格政策', '价格政策', 'GYG-6门更衣柜 420 元/件，GYG-12门 760 元/件；学校批量采购（100 门以上）联系销售经理获取项目价。'],
  ['标准交期政策', '价格政策', '常规产品 15 天内发货；定制参数产品 25-30 天；加急订单需审批，最快 7 天（加收 15% 加急费）。'],
  ['密集架产品知识', '产品知识', '手动密集架 MJS-标准规格 2300*900*560mm/组，每组承重 800kg，底架采用轨道式移动，节省 60% 空间。'],
  ['板材与工艺', '产品知识', '全系产品采用优质冷轧钢板，板材厚度 0.8-1.0mm，表面静电喷塑，环保无异味，防潮防锈。'],
  ['物流与安装', '售后政策', '德邦/跨越物流发货，大件到物流点自提或送货上门（加收费用）；提供安装说明书与视频，可预约上门安装。'],
  ['退换货政策', '售后政策', '非质量问题签收后 7 日内可退换（运费买家承担）；质量问题 30 日内免费换新，终身提供配件。'],
  ['常见问题-颜色', '产品知识', '常规颜色：灰白/蓝色/灰色/米白/橙色，支持定制颜色（起订量 20 件，交期延长 7 天）。'],
  ['常见问题-承重', '产品知识', '文件柜每层承重约 60kg；货架 HJ-200kg 型每层 200kg，HJ-500kg 型每层 500kg。'],
  ['售前话术-接待', '话术', '您好，欢迎咨询！请问您需要什么产品、大概数量和尺寸？我可以为您推荐合适型号并提供报价。'],
];
kbDefs.forEach(([title, category, content]) => {
  insKb.run(uuid(), title, category, content, 1, userIds.admin, ts, ts);
});

// ---------- AI 会话 ----------
const insConv = db.prepare(`INSERT INTO ai_conversations (id,customer_id,channel,type,user_id,status,last_msg_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`);
const insMsg = db.prepare(`INSERT INTO ai_messages (id,conversation_id,role,content,meta_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`);
const convSeeds = [
  ['淘宝', '这款钢制文件柜多钱？WJG-2000A 的', '您好！WJG-2000A 钢制文件柜零售价 680 元/件，现在下单 10 件以上可享 95 折哦～请问您大概需要几件？'],
  ['京东', '更衣柜有 12 门的吗？多高', '有的！GYG-12门 更衣柜 900*500*1850mm，760 元/件，灰白/蓝色现货。'],
  ['抖音', '你们密集架能承重多少', '您好，MJS-标准 手动密集架每组承重 800kg，底架轨道式移动，可节省 60% 空间。'],
  ['拼多多', '文件柜什么板材？会不会有味', '采用优质冷轧钢板，板材厚度 0.8-1.0mm，表面静电喷塑，环保无异味，请放心。'],
  ['天猫', '我要 30 个文件柜，多久能发', '常规 15 天内发货，30 件可享 9 折优惠。请问需要定制颜色吗？'],
  ['内部助手', '帮我整理一下昨天张经理的需求，他要 50 组密集架放档案室，10月20日要货', '已为您结构化：客户需求——密集架 MJS-标准 ×50 组，用途：档案室存放，要求交期 10月20日。注意：标准交期 15 天，建议尽快下单或申请加急审批。'],
];
convSeeds.forEach(([channel, userMsg, aiMsg], i) => {
  const cid = uuid();
  const cust = customers.find((c) => c.platform === channel) || null;
  const t = today.subtract(randInt(0, 2), 'day').format('YYYY-MM-DD HH:mm:ss');
  insConv.run(cid, cust ? cust.id : null, channel, channel === '内部助手' ? '销售助手' : '客服', userIds.agent_c1, '进行中', t, t, ts);
  insMsg.run(uuid(), cid, 'user', userMsg, null, t, ts);
  insMsg.run(uuid(), cid, 'assistant', aiMsg, null, t, ts);
});

// ---------- B端设计需求 ----------
db.prepare(`INSERT INTO b_design_requirements (id,customer_id,user_id,space_type,space_size,furniture_list,budget,delivery_date,attachments_json,analysis_result,layout_result,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  .run(uuid(), customers[25 + 3].id, userIds.agent_b1, '办公室', '12m x 8m', JSON.stringify([
    { name: '文件柜', qty: 10, size: '900*450*2000' }, { name: '工位桌', qty: 8, size: '1400*700*750' }, { name: '更衣柜', qty: 4, size: '900*500*1850' },
  ]), '8万以内', today.add(20, 'day').format('YYYY-MM-DD'), null, null, null, '待分析', ts, ts);

// ---------- 审批 ----------
const pendingQuotes = db.prepare(`SELECT id, quote_no, total_amount FROM quotes WHERE status='待审批' LIMIT 3`).all();
const insAppr = db.prepare(`INSERT INTO approvals (id,type,target_type,target_id,summary,applicant_id,status,approver_id,comment,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
pendingQuotes.forEach((q) => {
  insAppr.run(uuid(), '报价发送', 'quote', q.id, `报价单 ${q.quote_no}（¥${q.total_amount}）申请发送`, userIds.agent_c1, '待审批', null, null, ts, ts);
});

// ---------- 审计日志 ----------
const insLog = db.prepare(`INSERT INTO audit_logs (id,user_id,user_name,action,target_type,target_id,before_json,after_json,ip,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const logActions = [
  ['登录系统', 'user'], ['修改产品价格', 'product'], ['更新订单状态', 'order'], ['生成报货清单', 'order'],
  ['生产状态流转', 'production_group'], ['修改交期', 'order'], ['发送报价单', 'quote'], ['导入订单', 'order'],
];
for (let i = 0; i < 30; i++) {
  const [action, targetType] = rand(logActions);
  const usersArr = Object.entries(userIds);
  const [uname, uid] = rand(usersArr);
  insLog.run(uuid(), uid, roles.find((r) => r[0] === uname) ? roles.find((r) => r[0] === uname)[1] : uname,
    action, targetType, uuid(), null, JSON.stringify({ note: '演示日志' }), '192.168.1.' + randInt(2, 254),
    today.subtract(randInt(0, 30), 'day').format('YYYY-MM-DD HH:mm:ss'), ts);
}

// ---------- 统计 ----------
const cnt = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
console.log('✅ 种子数据完成：');
['users', 'customers', 'products', 'product_skus', 'quotes', 'contracts', 'orders', 'order_items',
  'production_groups', 'production_group_refs', 'shipments', 'materials', 'knowledge_base',
  'ai_conversations', 'ai_messages', 'audit_logs', 'approvals'].forEach((t) => console.log(`  ${t}: ${cnt(t)}`));
