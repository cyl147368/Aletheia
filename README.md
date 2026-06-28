<p align="center">
  <img src="https://img.shields.io/badge/Aletheia-Truth%20Unveiled-6366f1?style=for-the-badge" alt="Aletheia" />
  <br>
  <a href="https://github.com/cyl147368/Aletheia">
    <img src="https://img.shields.io/github/stars/cyl147368/Aletheia?style=social" />
  </a>
</p>

<h3 align="center">揭开中转站的面纱，让每一笔 API 调用都有据可查</h3>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/TailwindCSS-4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-green" />
</p>

---

## 为什么需要 Aletheia？

市面上的 LLM API 中转站质量参差不齐——宣称支持 Claude Opus，实际返回的是 GPT-4o-mini；标榜「全模型可用」，结果一半模型超时报错；昨天还能用，今天就静默下线。

**Aletheia**（希腊语 ἀλήθεια，意为「去蔽」「真相」）是一款自托管的中转站模型可用性探测工具。它会持续对中转站发起探测请求，告诉你：

> **哪些模型真正可用？响应有多快？是不是套壳冒充？中转站有没有偷偷涨价？**

## 核心亮点

### 🔐 数据安全第一
- **完全自托管**：所有代码运行在你自己的 VPS 上，不经过第三方服务器
- **JWT + bcrypt 认证**：单用户密码保护，任何设备安全访问
- **零第三方注册依赖**：不需要注册任何 SaaS 服务，开箱即用

### 🧪 智能探测引擎
- **全覆盖探测**：支持 OpenAI、Claude、Gemini 三大生态，Responses API 与 Chat Completions 双路 fallback
- **多维度诊断**：可用性、TTFT、套壳检测、降智检测、能力探测、性能/并发/额度探测六维合一
- **诊断探针**：算术推理、指令遵循、异常拒答三重探针，精准识别"降智"模型
- **1M 上下文自动重试**：探测 Anthropic 1M 上下文模型时自动启用对应 beta header，无需手动配置
- **精细化并发控制**：每站 5 并发，超时自动断开，避免触发中转站限流

### 📊 数据驱动的看板
- **站点总览**：侧边栏实时显示 OK / Warn / Down / Total 站点数，一眼掌握全局
- **可用模型矩阵**：看板自动聚合所有中转站的可用模型，按覆盖站点数排序，轻松对比不同渠道的模型可用性
- **定价透明**：自动拉取并合并中转站定价与官方预估定价（LiteLLM 价格表），一眼识别价格异常
- **历史趋势追踪**：TTFT 变化曲线、可用模型数波动、探测耗时趋势，一眼看出质量滑坡
- **状态自动判定**：绿色 = 全正常，黄色 = 部分故障，红色 = 宕机

### 🎯 精准探测
- **选择性模型探测**：支持对单个中转站仅探测部分模型，避免全量探测浪费配额
- **模型定价展示**：探测页面自动展示模型定价，站点定价、NEW API倍率、LiteLLM 官方参考价三级 fallback
- **批量导入/导出**：支持 JSON 格式批量导入站点，API Key 复制与脱敏展示
- **主题切换**：内置深色/浅色主题，本地持久化存储偏好

### 🧪 探测策略（持续迭代）
| 阶段 | 能力 | 说明 |
|------|------|------|
| 模型列举 | 拉取 `/v1/models`，确认中转站宣称支持哪些模型 |
| 可用性检测 | 对每个模型发送探测请求，验证是否真正可调用 |
| TTFT 测量 | 记录首 token 延迟，识别"掺水"模型 |
| 套壳检测 | 对 OpenAI / Claude / Gemini 兼容格式运行统一诊断探针，结合模型指纹识别疑似套壳 |
| 降智检测 | 通过算术、指令遵循、异常拒答等跨模型探针标记推理/对齐退化 |
| 能力探测 | 标记 streaming、vision、tool calling 等能力信号 |
| 性能/并发/额度探测 | 汇总可用率、TTFT、并发表现，并识别额度/限流异常 |
| 模型定价对比 | 拉取并展示中转站定价与官方参考价，标识价格异常 |

## 快速开始

### 前置要求
- 一台有 Docker 的服务器（Linux / macOS / Windows）
- 至少 256MB 空闲内存
- 你手里的中转站 API Key

### 部署（推荐）

```bash
# 1. 克隆仓库
git clone https://github.com/cyl147368/Aletheia.git
cd Aletheia

# 2.（可选）配置环境变量
cp .env.example .env
# 编辑 .env 设置密码和密钥，不设置则自动生成

# 3. 首次启动（挂载当前仓库目录）
./scripts/run-mounted-container.sh

# 4. 获取管理员密码
docker logs aletheia | grep "admin password"

# 5. 浏览器访问 http://你的服务器IP:8000
#    用上面的密码登录
```

以后更新代码只需要：

```bash
cd Aletheia
git pull
docker restart aletheia
```

容器重启时会自动安装/更新依赖、重新构建前端并启动后端。

### 本地开发

```bash
# 后端
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 前端（新开终端）
cd frontend
npm install
npm run dev
# 默认 http://localhost:5173，自动代理 /api 到后端
```

### 生产构建（不依赖 Docker）

```bash
cd frontend && npm run build
cd ../backend && uvicorn main:app --host 0.0.0.0 --port 8000
```

## 使用说明

1. **登录**后进入看板，初始为空
2. 在**管理页面**添加中转站（名称、Base URL、API Key），支持批量 JSON 导入，可设置探测间隔
3. 点击**探测**按钮进行首次检测，支持选择模型子集探测，或开启**定时探测**由系统自动维护
4. 在**看板**查看所有站点状态概览和可用模型矩阵，在**详情页**查看历史趋势、单模型 TTFT 分布及模型定价

## 技术架构

```
┌─────────────┐     ┌──────────────────────────┐     ┌──────────┐
│  React SPA   │────▶│  FastAPI                 │────▶│  SQLite  │
│  TailwindCSS │◀────│  ├─ /api/auth            │     └──────────┘
│  Recharts   │      │  ├─ /api/stations        │
└─────────────┘      │  │   ├─ CRUD + import    │
                     │  │   └─ /models (pricing)│
                     │  ├─ /api/probe           │
                     │  │   ├─ trigger probe   │
                     │  │   ├─ history/latest  │
                     │  │   └─ history/:batchId│
                     │  ├─ /api/overview        │
                     │  ├─ APScheduler          │
                     │  ├─ KeyCrypto (Fernet)   │
                     │  └─ Probe Engine         │
                     │      ├─ OpenAI双路fallback│
                     │      ├─ Anthropic 1M retry│
                     │      ├─ Gemini SSE        │
                     │      └─ Diagnostic probes│
                     └──────┬───────────────────┘
                            │ httpx / openai SDK
                     ┌──────▼───────────┐
                     │  中转站 APIs      │
                     └──────────────────┘
```

### 后端模块
| 模块 | 职责 |
|------|------|
| `routes/auth.py` | JWT 登录、bcrypt 密码校验 |
| `routes/stations.py` | 站点 CRUD、批量导入、API Key 脱敏展示 |
| `routes/probe.py` | 探测触发、结果保存、历史查询、最新结果 |
| `routes/settings.py` | 全局设置（探测间隔等） |
| `services/probe.pyAffineTransform`  核心的探测引擎，含定价拉取逻辑 |
| `services/scheduler.py` | APScheduler 定时调度探测任务 |
| `crypto.py` | Fernet 加密解密 |
| `database.py` | SQLAlchemy + aiosqlite 异步 ORM |

### 前端页面
| 页面 | 路由 | 功能 |
|------|------|------|
| 登录页 | `/login` | JWT 认证登录 |
| 看板 | `/` | 站点总览、可用模型矩阵、最近活动时间线 |
| 站点管理 | `/manage` | 添加/编辑/删除站点、批量 JSON 导入 |
| 站点详情 | `/stations/:id` | 模型选择（支持搜索/全选/清空）、TTFT 图表、模型结果明细、定价展示、请求/响应详情 |
| 探测结果 | `/stations/:id/probe/:batchId` | 单次探测的完整结果与请求/响应追溯 |

## API 参考

所有 API 均需通过 `POST /api/auth/login` 获取 JWT Token，并在请求头中携带 `Authorization: Bearer <token>`。

### 站点管理
- `GET /api/stations` — 列出所有站点（支持 `?status=` 过滤）
- `POST /api/stations` — 创建站点
- `PUT /api/stations/:id` — 更新站点（支持部分字段更新）
- `DELETE /api/stations/:id` — 删除站点
- `POST /api/stations/import` — 批量导入（JSON 数组）

### 探测
- `POST /api/stations/:id/probe` — 触发探测（可选 `model_ids` 参数进行选择性探测）
- `GET /api/stations/:id/models` — 获取站点模型列表（含定价）
- `GET /api/stations/:id/history` — 探测历史分页
- `GET /api/stations/:id/history/latest` — 最新探测结果
- `GET /api/stations/:id/history/:batchId` — 单次探测详情

### 概览
- `GET /api/overview` — 全局站点状态统计

## 环境变量

| 变量 | 必需 | 说明 | 默认值 |
|------|------|------|------|
| `ALETHEIA_ENCRYPTION_KEY` | 否 | Fernet 加密密钥 | 自动生成（查看日志） |
| `ALETHEIA_JWT_SECRET` | 否 | JWT 签名密钥 | 自动生成 |
| `ALETHEIA_ADMIN_PASSWORD` | 否 | 管理员初始密码 | 自动生成（查看日志） |
| `ALETHEIA_DEFAULT_PROBE_INTERVAL_HOURS` | 否 | 默认探测间隔（小时） | 6 |
| `ALETHEIA_PROBE_CONCURRENCY` | 否 | 单站探测并发数 | 5 |
| `ALETHEIA_PROBE_TIMEOUT_SECONDS` | 否 | 单次探测超时（秒） | 30 |
| `ALETHEIA_PROBE_PROMPT` | 否 | 探测使用的 prompt | `hi` |
| `ALETHEIA_PROBE_MAX_TOKENS` | 否 | 探测最大 token 数 | 5 |

## FAQ

**Q: 探测会不会被中转站发现/封禁？**
A: 探测 payload 仅为 `"hi"`，并发控制在 5 个以内，与正常用户行为无异。也可关闭定时探测、仅手动触发。

**Q: 为什么不用 Redis / PostgreSQL？**
A: 个人或小团队使用 SQLite 完全足够，零运维成本。需要时可自行替换。

**Q: 支持非 OpenAI 兼容 API 的中转站吗？**
A: 模型列举会优先尝试 OpenAI 兼容格式，并 fallback 到 Anthropic / Gemini 原生模型列表；实际探测会按模型类型选择 OpenAI、Claude 或 Gemini 兼容请求格式。

**Q: 定价数据从哪里来的？**
A: 三级 fallback：1) 中转站 `/api/pricing` 自定义定价；2) NEW API 倍率自动换算；3) LiteLLM 官方参考价表在线拉取。

## License

MIT — see [LICENSE](https://github.com/cyl147368/Aletheia/blob/main/LICENSE)

---

<p align="center">
  <a href="https://github.com/cyl147368/Aletheia">View on GitHub</a> ·
  <a href="https://github.com/cyl147368/Aletheia/issues">Report Issue</a>
</p>
