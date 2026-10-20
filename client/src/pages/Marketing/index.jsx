import { useEffect, useState } from 'react';
import { Card, Row, Col, Button, Input, Select, Form, Tabs, Tag, Empty, App, List, Space, Slider, Statistic, Typography } from 'antd';
import { PictureOutlined, VideoCameraOutlined, FileTextOutlined, ThunderboltOutlined, PlusOutlined, AudioOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { api } from '../../api';
import StatusTag from '../../components/StatusTag';

const { TextArea } = Input;
const { Text } = Typography;

export default function Marketing() {
  const { message } = App.useApp();
  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [voices, setVoices] = useState([]);
  const [filter, setFilter] = useState({});
  const [genLoading, setGenLoading] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [form] = Form.useForm();

  // 口播
  const [voLoading, setVoLoading] = useState(false);
  const [voResult, setVoResult] = useState(null);

  // 视频
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoResult, setVideoResult] = useState(null);

  const load = () => api.get('/materials', { params: filter }).then(setMaterials);
  useEffect(() => { load(); api.get('/admin/products').then(setProducts); api.get('/media/voices').then(setVoices).catch(() => {}); }, []);

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

  const genVoiceover = async (v) => {
    setVoLoading(true);
    setVoResult(null);
    try {
      const r = await api.post('/media/voiceover', { ...v, rate: `${v.rate >= 0 ? '+' : ''}${v.rate}%` });
      setVoResult(r);
      message.success(`口播生成完成（${r.duration} 秒）`);
    } catch (e) { message.error(e.message); }
    finally { setVoLoading(false); }
  };

  const saveAudio = async () => {
    if (!voResult) return;
    await api.post('/materials', {
      title: `AI口播：${voResult.script.slice(0, 18)}…`,
      type: 'copy', url_or_content: `音频：${voResult.audio_url}\n文案：${voResult.script}`,
      tags: ['口播'], platform: '通用', status: '待审核',
    });
    message.success('已存入素材库'); load();
  };

  const genVideo = async (v) => {
    setVideoLoading(true);
    setVideoResult(null);
    try {
      const r = await api.post('/media/video', v);
      setVideoResult(r);
      message.success('视频生成完成');
      load();
    } catch (e) { message.error(e.message); }
    finally { setVideoLoading(false); }
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

  const voiceOptions = voices.length ? voices.map((v) => ({ value: v.value, label: v.label }))
    : [{ value: 'zh-CN-XiaoxiaoNeural', label: '晓晓（女·亲切）' }, { value: 'zh-CN-YunjianNeural', label: '云健（男·磁性强健）' }];

  const copyTab = (
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
  );

  const voiceoverTab = (
    <Row gutter={24}>
      <Col xs={24} lg={10}>
        <Form layout="vertical" onFinish={genVoiceover} initialValues={{ voice: 'zh-CN-XiaoxiaoNeural', rate: 0, style: '种草带货' }}>
          <Form.Item name="product" label="产品（不填文案时 AI 自动生成口播稿）">
            <Select allowClear showSearch optionFilterProp="label" placeholder="选择产品"
              options={products.map((p) => ({ value: `${p.name} ${p.model}`, label: `${p.name} ${p.model}` }))} />
          </Form.Item>
          <Form.Item name="text" label="或直接输入口播文案">
            <TextArea rows={4} placeholder="留空则根据产品由 AI 生成 25 秒口播稿" />
          </Form.Item>
          <Form.Item name="style" label="口播风格">
            <Select options={['种草带货', '专业讲解', '工厂直供', '促销急售'].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="voice" label="音色">
            <Select options={voiceOptions} />
          </Form.Item>
          <Form.Item name="rate" label="语速（%）">
            <Slider min={-30} max={30} step={5} marks={{ '-30': '-30%', 0: '标准', 30: '+30%' }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={voLoading} icon={<AudioOutlined />}>生成口播音频</Button>
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>采用微软 Edge 神经网络语音（免费，同 MoneyPrinterTurbo 方案），生成后可直接试听。</Text>
        </Form>
      </Col>
      <Col xs={24} lg={14}>
        {voLoading && <Card size="small" loading style={{ minHeight: 240 }} />}
        {voResult ? (
          <Card size="small" title="口播结果" extra={<Button size="small" onClick={saveAudio} icon={<PlusOutlined />}>存入素材库</Button>}>
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col span={8}><Statistic title="时长" value={voResult.duration} suffix="秒" /></Col>
              <Col span={8}><Statistic title="字数" value={voResult.script.length} suffix="字" /></Col>
              <Col span={8}><Statistic title="语速" value={voResult.rate} /></Col>
            </Row>
            <div style={{ whiteSpace: 'pre-wrap', background: '#f7f8fa', padding: 12, borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{voResult.script}</div>
            <audio controls src={voResult.audio_url} style={{ width: '100%' }} />
            <Space style={{ marginTop: 10 }}>
              <Button size="small" icon={<PlayCircleOutlined />} href={voResult.audio_url} target="_blank">打开音频</Button>
              <Button size="small" href={voResult.srt_url} target="_blank">下载字幕 SRT</Button>
            </Space>
          </Card>
        ) : (!voLoading && <Empty description="生成后可在此试听音频、下载字幕" />)}
      </Col>
    </Row>
  );

  const videoTab = (
    <Row gutter={24}>
      <Col xs={24} lg={10}>
        <Form layout="vertical" onFinish={genVideo} initialValues={{ voice: 'zh-CN-XiaoxiaoNeural', ratio: '9:16' }}>
          <Form.Item name="theme" label="视频主题" rules={[{ required: true, message: '请输入主题' }]}>
            <Input placeholder="如：钢制文件柜工厂直供，30台起订立减2000" />
          </Form.Item>
          <Form.Item name="voice" label="口播音色">
            <Select options={voiceOptions} />
          </Form.Item>
          <Form.Item name="ratio" label="画幅">
            <Select options={[{ value: '9:16', label: '9:16 竖屏（抖音/视频号）' }, { value: '16:9', label: '16:9 横屏（B站/官网）' }]} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={videoLoading} icon={<VideoCameraOutlined />}>AI 生成视频</Button>
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            流水线（同 MoneyPrinterTurbo 架构）：AI 分镜脚本 → 逐镜 AI 口播配音 → 自动时间轴字幕 → ffmpeg 合成成片。生成约需 1-3 分钟。
          </Text>
        </Form>
      </Col>
      <Col xs={24} lg={14}>
        {videoLoading && (
          <Card size="small">
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <VideoCameraOutlined style={{ fontSize: 42, color: '#1677ff' }} />
              <div style={{ marginTop: 12, fontWeight: 600 }}>正在生成视频…</div>
              <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>AI 分镜 → 口播配音 → 字幕对齐 → 合成渲染</div>
            </div>
          </Card>
        )}
        {videoResult ? (
          <Card size="small" title={`成片：${videoResult.title}`} extra={<Statistic valueStyle={{ fontSize: 16 }} value={videoResult.duration} suffix="秒" />}>
            <video controls src={videoResult.video_url} style={{ width: '100%', maxHeight: 420, background: '#000', borderRadius: 8 }} />
            <div style={{ marginTop: 10 }}>
              {videoResult.scenes.map((s, i) => (
                <div key={i} style={{ fontSize: 12, marginBottom: 6 }}>
                  <Tag color="blue">分镜{i + 1}</Tag><b>{s.title}</b> — {s.text}
                </div>
              ))}
            </div>
          </Card>
        ) : (!videoLoading && <Empty description="输入主题后一键生成带货短视频" />)}
      </Col>
    </Row>
  );

  return (
    <Card variant="outlined">
      <Tabs items={[
        { key: 'wall', label: '素材库', children: wall },
        { key: 'gen', label: 'AI 文案生成', children: copyTab },
        { key: 'voiceover', label: <span><AudioOutlined /> AI 口播</span>, children: voiceoverTab },
        { key: 'video', label: <span><VideoCameraOutlined /> AI 视频</span>, children: videoTab },
      ]} />
    </Card>
  );
}
