/* 客户资料提取：输出结构化 JSON */
function extractProfilePrompt(convText) {
  return `从以下客服/销售对话记录中提取客户信息，输出 JSON（找不到的字段填 null）：

{
  "name": "客户称呼",
  "phone": "电话号码",
  "wechat": "微信号",
  "region": "所在地区",
  "company": "公司名称",
  "intent_products": ["意向产品，含型号"],
  "quantity": 数量数字或 null,
  "budget": "预算描述",
  "urgency": "高/中/低",
  "notes": "其他关键信息"
}

【对话记录】
${convText}

只输出 JSON，不要其他文字。`;
}

module.exports = { extractProfilePrompt };
