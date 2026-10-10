import { Tag } from 'antd';

// 统一状态色映射（中文状态 → 颜色）
const STATUS_COLORS = {
  待确认: 'default', 待排产: 'default', 待审批: 'gold', 待分析: 'gold',
  草稿: 'default', 待签署: 'orange', 待安排: 'orange', 待处理: 'orange',
  待质检: 'purple', 待发货: 'cyan',
  已确认: 'blue', 已排产: 'geekblue', 已发送: 'blue', 已报货: 'blue',
  生产中: 'processing', 进行中: 'processing',
  部分发货: 'warning', 待质检中: 'purple',
  已发货: 'green', 已完成: 'success', 已签署: 'success', 已签收: 'success',
  已确认已发送: 'blue',
  已取消: 'error', 已作废: 'error', 驳回: 'error',
  已排产已发送: 'blue',
  通过: 'success',
};

export default function StatusTag({ status, style }) {
  if (!status) return null;
  return <Tag color={STATUS_COLORS[status] || 'blue'} style={style}>{status}</Tag>;
}
