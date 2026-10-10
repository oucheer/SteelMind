import { Card, Statistic } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

export default function StatCard({ title, value, precision, prefix, suffix, change, icon, color = '#1677ff' }) {
  const up = change != null && change >= 0;
  return (
    <Card variant="outlined" styles={{ body: { padding: '16px 20px' } }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Statistic title={title} value={value} precision={precision} prefix={prefix} suffix={suffix}
          valueStyle={{ color: '#1f2329', fontSize: 24, fontWeight: 600 }} />
        {icon && <div style={{ fontSize: 34, color, opacity: 0.85 }}>{icon}</div>}
      </div>
      {change != null && (
        <div style={{ marginTop: 4, fontSize: 12, color: up ? '#52c41a' : '#ff4d4f' }}>
          {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />} 较昨日 {up ? '+' : ''}{change}%
        </div>
      )}
    </Card>
  );
}
