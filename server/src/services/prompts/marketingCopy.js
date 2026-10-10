/* 营销文案生成 */
function marketingCopyPrompt({ platform, product, selling_points, style }) {
  return `为钢制家具产品生成${platform || '通用平台'}营销文案。

产品：${product}
卖点：${selling_points || '优质冷轧钢板、静电喷塑、承重强、防潮防锈、环保无异味'}
风格：${style || '专业务实'}

输出 JSON：
{
  "titles": ["3个标题选项"],
  "body": "正文文案",
  "hashtags": ["话题标签"],
  "video_script": "30秒短视频分镜脚本（镜头-画面-台词）"
}`;
}

module.exports = { marketingCopyPrompt };
