import { useEffect, useState } from 'react';
import { Card, Row, Col, Typography, Tag, Space } from 'antd';
import {
  DollarOutlined, ShoppingCartOutlined, ClockCircleOutlined, CheckCircleOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { Line, Pie, Bar } from '@ant-design/charts';
import { api } from '../../api';
import StatCard from '../../components/StatCard';
import AiChatPanel from '../../components/AiChatPanel';

const { Title } = Typography;

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [source, setSource] = useState([]);
  const [prod, setProd] = useState([]);

  useEffect(() => {
    api.get('/dashboard/summary').then(setSummary);
    api.get('/dashboard/trend').then(setTrend);
    api.get('/dashboard/order-source').then(setSource);
    api.get('/dashboard/production-progress').then(setProd);
  }, []);

  const sourceColors = ['#0d3027', '#52c41a', '#faad14', '#722ed1', '#13c2c2', '#eb2f96'];

  return (
    <div>
      {/* Banner */}
      <Card style={{ marginBottom: 16, background: 'linear-gradient(100deg,#0d3027 0%,#1a5c48 55%,#2f6b57 100%)', border: 'none' }}
        styles={{ body: { padding: '22px 28px', color: '#fff' } }}>
        <Title level={3} style={{ color: '#fff', margin: 0 }}>AI 让钢制家具业务更简单</Title>
        <div style={{ opacity: 0.9, marginTop: 4 }}>从获客到交付，全链路智能协同：运营智能化 · 销售智能化 · 订单自动化 · 生产协同化 · 经营可视化</div>
        <Space wrap style={{ marginTop: 12 }}>
          {['AI 生成营销素材', 'AI 智能客服', 'B端定制设计', '订单管理', '生产协同', '经营看板'].map((t) => (
            <Tag key={t} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none' }}>{t}</Tag>
          ))}
        </Space>
      </Card>

      {/* 指标卡 */}
      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}><StatCard title="设备销售额 (今日)" value={summary?.sales_today ?? 0} prefix="¥" change={summary?.sales_change} icon={<DollarOutlined />} color="#0d3027" /></Col>
        <Col xs={12} lg={6}><StatCard title="订单数量 (今日)" value={summary?.orders_today ?? 0} change={summary?.orders_change} icon={<ShoppingCartOutlined />} color="#52c41a" /></Col>
        <Col xs={12} lg={6}><StatCard title="待生产订单" value={summary?.pending_orders ?? 0} icon={<ClockCircleOutlined />} color="#faad14" /></Col>
        <Col xs={12} lg={6}><StatCard title="生产完成率" value={summary?.production_rate ?? 0} suffix="%" icon={<CheckCircleOutlined />} color="#722ed1" /></Col>
      </Row>

      {/* 图表区 + AI 助手 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={16}>
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Card title="销售趋势 (近7天)" variant="outlined" styles={{ body: { padding: '8px 12px' } }}>
                <Line data={trend} xField="date" yField="销售额" height={200} smooth
                  yAxis={{ labelFormatter: (v) => (v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v) }}
                  areaStyle={{ fill: 'linear-gradient(90deg, rgba(22,119,255,0.25) 0%, rgba(22,119,255,0.02) 100%)' }} />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="订单来源分布" variant="outlined" styles={{ body: { padding: '8px 12px' } }}>
                <Pie data={source} angleField="value" colorField="name" height={220} innerRadius={0.55}
                  color={sourceColors} label={{ text: 'name', style: { fontSize: 12 } }}
                  legend={{ color: { position: 'right' } }}
                  tooltip={{ items: [{ channel: 'y', name: '订单数' }] }} />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="生产进度分布" variant="outlined" styles={{ body: { padding: '8px 12px' } }}>
                <Bar data={prod} xField="cnt" yField="name" height={220} colorField="name"
                  color={sourceColors} legend={false}
                  xAxis={{ labelFormatter: (v) => `${v} 组` }} />
              </Card>
            </Col>
          </Row>
        </Col>
        <Col xs={24} xl={8}>
          <Card variant="outlined" styles={{ body: { padding: 16 } }}>
            <AiChatPanel
              mode="sales_assistant"
              height={560}
              title="AI 销售助手"
              welcome={'您好！我是您的 AI 销售助手，可以帮您：\n· 回答客户咨询、介绍产品卖点\n· 根据需求推荐产品与报价思路\n· 分析客户需求、生成方案建议\n· 提供营销话术与跟单建议\n\n试试问我：「文件柜 30 台多少钱？」'}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
