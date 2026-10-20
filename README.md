# 钢制家具销售与生产协同智能化平台

AI 驱动的销售运营与生产协同平台：打通运营端、销售端、生产端和售后端，实现销售自动化、订单结构化、生产协同化、运营可视化。

## 技术栈
- 前端：React 18 + Ant Design 5 + Vite + @ant-design/charts
- 后端：Node.js + Express + better-sqlite3（SQLite 单文件）
- AI：OpenAI 兼容协议（支持智谱 / DeepSeek / OpenAI 等），SSE 流式输出；未配置 Key 时自动降级为模拟回复
- 媒体：AI 口播（微软 Edge 神经网络 TTS，7 种中文音色，免 API Key）+ AI 视频（LLM 分镜 → 逐镜配音 → ffmpeg 合成），借鉴 MoneyPrinterTurbo 流水线架构

## AI 口播 / AI 视频（营销内容生产页）
- **AI 口播**：选产品自动写口播稿或直接粘贴文案 → Edge TTS 合成 MP3 + SRT 字幕，页面内试听/下载/存素材库
- **AI 视频**：输入主题 → LLM 生成分镜脚本 → 逐镜配音+时间轴字幕 → ffmpeg 合成 9:16/16:9 成片，自动登记素材库
- 依赖：ffmpeg/ffprobe 静态构建已置于 `server/bin/`（从 https://www.gyan.dev/ffmpeg/builds/ 下载 essentials 版解压即可）；TTS 走微软在线服务，需可访问外网（已适配系统代理）

## 快速开始

```bash
# 1. 安装依赖（根目录、server、client 三处）
npm run install:all

# 2. 初始化演示数据
npm run seed

# 3. 配置 AI（可选）：复制 .env.example 为 .env，填写：
#    LLM_BASE_URL / LLM_API_KEY / LLM_MODEL
#    不配置也可运行（AI 为演示模式）

# 4. 启动（server 3001 + client 5173）
npm run dev
```

访问 http://localhost:5173

## 演示账号（密码统一 123456）

| 账号 | 角色 |
|---|---|
| admin | 系统管理员 |
| agent_c1 | C端客服 |
| agent_b1 | B端业务员 |
| manager1 | 销售管理（审批） |
| factory1 | 工厂生产 |

## 核心演示动线
首页驾驶舱 → AI客服页对话并生成报价（待确认字段标红）→ 审批中心通过 → 订单生成报货清单 → 生产协同：产品汇总合并+溯源 → 排产状态流转+进度反馈 → 数据汇总安排发货 → 经营驾驶舱核对数据

## 核心业务规则
- **汇总可追溯**：产品汇总按「型号+颜色+规格+定制参数」归一化分组，只有生产条件一致才合并；每组可反查来源订单和业务员
- **AI 处理边界**：价格/尺寸/交期等无知识库依据的信息一律标记「待确认」，禁止编造
- **关键动作审批**：报价发送等需审批；操作日志记录变更前后内容
