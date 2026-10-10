import { useEffect, useState } from 'react';
import { Card, Row, Col, Button, Input, Select, Form, Tabs, Tag, Empty, App, List, Space } from 'antd';
import { PictureOutlined, VideoCameraOutlined, FileTextOutlined, ThunderboltOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '../../api';
import StatusTag from '../../components/StatusTag';

const { TextArea } = Input;

export default function Marketing() {
  const { message } = App.useApp();
  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState({});
  const [genLoading, setGenLoading] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [form] = Form.useForm();

  const load = () => api.get('/materials', { params: filter }).then(setMaterials);
  useEffect(() => { load(); api.get('/admin/products').then(setProducts); }, []);

  const generate = async (v) => {
    setGenLoading(true);
    setGenResult(null);
    try {
      const r = await api.post('/ai/marketing-copy', v);
      setGenResult(r);
      message.success('文案生成完成');
    } catch (e) { message.error(e.message); }
    finally { setGenLoading(false); }
  };

  const saveCopy = async () => {
    if (!genResult) return;
    await api.post('/materials', {
      title: genResult.titles?.[0] || 'AI 文案',
      type: 'copy',
      url_or_content: `${(genResult.titles || []).join(' / ')}\n\n${genResult.body || ''}\n\n脚本：${genResult.video_script || ''}`,
      tags: genResult.hashtags || [], platform: form.getFieldValue('platform'), status: '待审核',
    });
    message.success('已保存到素材库（待审核）');
    load();
  };

  const typeIcon = { image: <PictureOutlined />, video: <VideoCameraOutlined />, copy: <FileTextOutlined /> };

  const wall = (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Select allowClear placeholder="类型" style={{ width: 110 }} onChange={(v) => setFilter((f) => ({ ...f, type: v }))}
          options={[{ value: 'image', label: '图片' }, { value: 'video', label: '视频' }, { value: 'copy', label: '文案' }]} />
        <Select allowClear placeholder="状态" style={{ width: 110 }} onChange={(v) => setFilter((f) => ({ ...f, status: v }))}
          options={[{ value: 'AI生成', label: 'AI生成' }, { value: '待审核', label: '待审核' }, { value: '已确认', label: '已确认' }]} />
        <Input.Search allowClear placeholder="搜索素材标题" style={{ width: 220 }} onSearch={(v) => setFilter((f) => ({ ...f, keyword: v }))} />
      </Space>
      {materials.length === 0 ? <Empty description="暂无素材" /> : (
        <Row gutter={[12, 12]}>
          {materials.map((m) => (
            <Col xs={12} md={8} xl={6} key={m.id}>
              <Card size="small" variant="outlined" hoverable
                actions={m.status !== '已确认' ? [<span key="ok" onClick={async () => { await api.put(`/materials/${m.id}`, { status: '已确认' }); message.success('已确认'); load(); }}>✓ 审核通过</span>] : undefined}>
                <div style={{ height: 90, borderRadius: 6, background: 'linear-gradient(135deg,#e8f1ff,#f0f5ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, color: '#1677ff' }}>
                  {typeIcon[m.type]}
                </div>
                <div style={{ marginTop: 8, fontWeight: 500, fontSize: 13 }}>{m.title}</div>
                <Space size={4} wrap style={{ marginTop: 6 }}>
                  <Tag color="blue">{m.platform || '通用'}</Tag>
                  <StatusTag status={m.status} />
                  {m.product_name && <Tag>{m.product_name}</Tag>}
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </>
  );

  return (
    <Card variant="outlined">
      <Tabs items={[
        { key: 'wall', label: '素材库', children: wall },
        {
          key: 'gen', label: 'AI 文案生成', children: (
            <Row gutter={24}>
              <Col xs={24} lg={10}>
                <Form form={form} layout="vertical" onFinish={generate} initialValues={{ platform: '抖音' }}>
                  <Form.Item name="product" label="产品" rules={[{ required: true }]}>
                    <Select placeholder="选择产品" showSearch optionFilterProp="label"
                      options={products.map((p) => ({ value: `${p.name} ${p.model}`, label: `${p.name} ${p.model}` }))} />
                  </Form.Item>
                  <Form.Item name="platform" label="平台">
                    <Select options={['抖音', '小红书', '淘宝', '天猫', '京东', '朋友圈', '视频号'].map((v) => ({ value: v, label: v }))} />
                  </Form.Item>
                  <Form.Item name="selling_points" label="卖点（可选）">
                    <TextArea rows={3} placeholder="如：承重强、防潮防锈、支持定制" />
                  </Form.Item>
                  <Form.Item name="style" label="风格（可选）">
                    <Input placeholder="如：专业务实 / 活泼种草" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={genLoading} icon={<ThunderboltOutlined />}>AI 生成文案</Button>
                </Form>
              </Col>
              <Col xs={24} lg={14}>
                {genResult ? (
                  <Card size="small" title={<Space><span>生成结果</span><Tag color="orange">待审核</Tag></Space>} extra={<Button size="small" type="primary" onClick={saveCopy} icon={<PlusOutlined />}>存入素材库</Button>}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>标题选项</div>
                    <List size="small" dataSource={genResult.titles || []} renderItem={(t) => <List.Item>{t}</List.Item>} />
                    <div style={{ fontWeight: 600, margin: '12px 0 4px' }}>正文</div>
                    <div style={{ whiteSpace: 'pre-wrap', background: '#f7f8fa', padding: 12, borderRadius: 6, fontSize: 13 }}>{genResult.body}</div>
                    {genResult.video_script && (<><div style={{ fontWeight: 600, margin: '12px 0 4px' }}>短视频脚本</div>
                      <div style={{ whiteSpace: 'pre-wrap', background: '#f7f8fa', padding: 12, borderRadius: 6, fontSize: 13 }}>{genResult.video_script}</div></>)}
                    <Space wrap style={{ marginTop: 8 }}>{(genResult.hashtags || []).map((h) => <Tag key={h} color="blue">#{h}</Tag>)}</Space>
                  </Card>
                ) : <Empty description="填写左侧信息后点击生成" />}
              </Col>
            </Row>
          ),
        },
      ]} />
    </Card>
  );
}
