/* 报价草稿生成：注入 SKU 快照，价格必须来自注入数据，否则进 pending_fields */
function quoteDraftPrompt(demandText, skuList) {
  return `你是钢制家具企业销售助理。根据客户需求生成报价草稿。

【可用产品 SKU 库】（unit_price 必须从下列条目中选取）
${JSON.stringify(skuList, null, 1)}

【客户需求】
${demandText}

输出 JSON：
{
  "items": [{ "sku_id": "匹配到的sku id", "qty": 数量, "unit_price": 单价(必须来自SKU库), "note": "说明" }],
  "pending_fields": [{ "field": "待确认字段名", "reason": "原因" }],
  "remark": "整体说明"
}

规则：
1. 客户需求与 SKU 不完全匹配时（如尺寸定制、颜色未说明），把不确定项放入 pending_fields，不要假设。
2. 数量未明确的，qty 填 null 并加入 pending_fields。
3. 不要编造 SKU 库中不存在的价格或产品。`;
}

module.exports = { quoteDraftPrompt };
