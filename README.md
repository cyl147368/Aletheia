# 🔍 Aletheia

<p align="center">
  <strong>Aletheia</strong>（ἀλήθεια）—— 古希腊语"去蔽、揭示真相"。
  一款轻量级的中转站模型可用性探测工具，帮助你持续监控每家中转站：<br/>
  有哪些模型？哪些真正可以用？首 token 延迟多少？是否套壳或降智？
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License">
  <img src="https://img.shields.io/badge/python-3.12+-green" alt="Python">
  <img src="https://img.shields.io/badge/fastapi-0.115+-teal" alt="FastAPI">
  <img src="https://img.shields.io/badge/react-18-f5a623" alt="React">
  <img src="https://img.shields.io/badge/sqlite-3-lightgrey" alt="SQLite">
</p>

---

## ✨ 亮点

- **🔐 数据安全第一**：你的 API Key 永远不会离开你的服务器。所有中转站密钥使用 Fernet 对称加密存储于本地 SQLite，加密密钥由你掌控，无任何遥测或外部上报。
- **📊 一目了然**：看板一眼看清所有中转站状态（正常 / 部分故障 / 宕机），TTFT 分布图表直观对比模型延迟。
- **🤖 定时 + 手动**：按站点独立配置探测间隔，也可随时一键手动触发，混合模式灵活又省心。
- **🪶 极致轻量**：Python + SQLite，单 Docker 镜像。1C1G VPS 流畅运行，零额外依赖，五分钟部署上线。
- **🔍 低调探测**：探测 prompt 仅发送 `"hi"`，最大程度避免被中转站识别为探测流量。
- **🔌 OpenAI 兼容**：支持所有兼容 OpenAI API 格式的中转站，即主流站全覆盖。

---

## 🧭 探测能力

| 探测项 | 说明 | 状态 |
|--------|------|------|
| 模型列表 | 拉取 `/v1/models`，列出所有声称支持的模型 | ✅ |
| 可用性 | 对每个模型发送请求，验证是否真正可返回结果 | ✅ |
| TTFT | 记录每个模型的首 token 延迟（Time to First Token） | ✅ |
| 定时调度 | 按站点独立配置探测间隔 + 开关 | ✅ |
| 历史趋势 | TTFT 分布图表、可用模型数变化趋势 | ✅ |
| 套壳检测 | 检测模型是否冒充（宣称 claude 实际是 GPT 等情况） | 📋 |
| 降智检测 | 检测量化裁切、上下文截断、system prompt 篡改 | 📋 |
| 性能压测 | 吞吐量 / QPS / 并发上限 | 📋 |
| 能力矩阵 | function calling / vision / streaming / 长上下文支持 | 📋 |

---

## 🚀 快速部署

### Docker（推荐）

```bash
# 1. 克隆仓库
git clone https://github.com/你的用户名/Aletheia.git
cd Aletheia

# 2. （可选）配置环境变量，不配置会自动生成
cp .env.example .env

# 3. 启动
docker compose up -d

# 4. 查看初始密码
docker compose logs aletheia | grep -A 3 "admin password"

# 5. 浏览器访问 http://你的服务器IP:8000
```

> 💡 建议搭配 Caddy / Nginx 反代并开启 HTTPS，保护数据传输安全。

---

## 🛠️ 本地开发

### 后端

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

开发模式下前端自动将 `/api` 代理到 `localhost:8000`。

### 生产构建

```bash
cd frontend && npm run build
cd ../backend && uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## 🔒 安全设计

Aletheia 的每项设计都优先考虑你的数据安全：

| 设计 | 说明 |
|------|------|
| **本地存储** | 所有数据（中转站信息、API Key、探测结果）仅存储于你自己的服务器上的 SQLite 文件，不经过任何第三方 |
| **密钥加密** | API Key 使用 Fernet（AES-128-CBC + HMAC）加密后落库，密钥通过环境变量注入，不硬编码 |
| **单用户认证** | JWT + bcrypt 密码保护，72 小时过期，防止未授权访问 |
| **零遥测** | 无埋点、无上报、无外部请求（除了你配置的中转站本身），代码可审计 |
| **密钥脱敏** | 前端仅展示脱敏后的 Key 片段（`sk-***abcd`），完整 Key 不可见 |

### 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `ALETHEIA_ENCRYPTION_KEY` | 否 | Fernet 加密密钥，留空自动生成 |
| `ALETHEIA_JWT_SECRET` | 否 | JWT 签名密钥，留空自动生成 |
| `ALETHEIA_ADMIN_PASSWORD` | 否 | 初始管理员密码，留空自动生成并在日志打印 |
| `ALETHEIA_DEFAULT_PROBE_INTERVAL_HOURS` | 否 | 默认探测间隔，默认 6 小时 |

---

## 🏗️ 技术栈

| 层 | 技术 |
|---|------|
| 后端框架 | FastAPI（Python 3.12+） |
| ORM | SQLAlchemy 2.0 + aiosqlite |
| 定时任务 | APScheduler |
| 加密 | cryptography（Fernet） |
| 认证 | python-jose（JWT）+ passlib（bcrypt） |
| API 调用 | openai SDK (OpenAI 兼容) |
| 前端 | React 18 + TypeScript + Vite |
| 样式 | Tailwind CSS 4 |
| 图表 | Recharts |
| 部署 | Docker + docker-compose |

---

## 📁 项目结构

```
Aletheia/
├── backend/
│   ├── main.py              # FastAPI 应用入口
│   ├── config.py            # Pydantic 配置（环境变量）
│   ├── database.py          # SQLAlchemy async engine
│   ├── crypto.py            # Fernet 加解密服务
│   ├── models/              # ORM 模型定义
│   ├── routes/              # API 路由
│   │   ├── auth.py          # 登录 / 改密
│   │   ├── auth_middleware.py # JWT 鉴权中间件
│   │   ├── stations.py      # 中转站 CRUD + 批量导入
│   │   ├── probe.py         # 探测触发 / 历史 / 明细 / 看板
│   │   └── settings.py      # 全局设置
│   └── services/
│       ├── auth.py          # JWT 签发验证 / bcrypt
│       ├── probe.py         # 核心探测引擎
│       └── scheduler.py     # APScheduler 定时调度
├── frontend/
│   └── src/
│       ├── api/             # axios 客户端 + API 封装
│       └── pages/           # 页面组件
│           ├── LoginPage.tsx
│           ├── DashboardPage.tsx      # 看板首页
│           ├── StationDetailPage.tsx  # 站点详情 + 趋势图
│           ├── ProbeResultPage.tsx    # 探测结果明细
│           └── ManagePage.tsx         # 站点管理 + 批量导入
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## 🗺️ 路线图

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 1 | 核心 MVP：站点管理、手动探测（模型列表 + 可用性 + TTFT）、看板、登录 | ✅ |
| Phase 2 | 定时调度、历史趋势图表 | ✅ |
| Phase 3 | 套壳检测、降智检测（authenticity_score、degradation_flags） | 📋 |
| Phase 4 | 性能压测（吞吐 / QPS）、并发上限、能力矩阵、额度查询 | 📋 |

---

## 📄 License

MIT © 2025

---

<p align="center">
  <sub>名字取自希腊哲学——Aletheia 意为"真相的显现"，也是海德格尔哲学的核心概念之一。</sub>
</p>