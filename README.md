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
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-green" />
</p>

---

## 为什么需要 Aletheia？

市面上的 LLM API 中转站质量参差不齐——宣称支持 Claude Opus，实际返回的是 GPT-4o-mini；标榜「全模型可用」，结果一半模型超时报错；昨天还能用，今天就静默下线。

**Aletheia**（希腊语 ἀλήθεια，意为「去蔽」「真相」）是一款自托管的中转站模型可用性探测工具。它会持续对中转站发起探测请求，告诉你：

> **哪些模型真正可用？响应有多快？是不是套壳冒充？**

## 核心亮点

### 🔐 数据安全第一
- **完全自托管**：所有代码运行在你自己的 VPS 上，不经过第三方服务器
- **API Key 加密存储**：使用 Fernet 对称加密算法，密钥由你掌控，即使数据库泄露也无法解密
- **单用户密码保护**：JWT 认证 + bcrypt 哈希，任何设备安全访问
- **零外部依赖**：不需要注册任何第三方服务，你的中转站 Key 永远不出你的服务器

### ⚡️ 轻量高效
- **SQLite 单文件数据库**，零运维成本，备份就是一键 `cp`
- **Docker 一键部署**，1C1G VPS 就能跑
- **最小化探测策略**：仅发送 `"hi"` 作为探测 payload，不被中转站检测为恶意扫描
- **智能并发控制**：每站 5 并发，避免触发限流

### 📊 持续监控
- **定时自动探测**：每个中转站独立配置探测间隔，打开开关即可持续监控
- **手动即时探测**：随时手动触发，结果秒级返回
- **历史趋势追踪**：TTFT 变化曲线、可用模型数波动，一眼看出质量滑坡
- **状态自动判定**：绿色 = 全正常，黄色 = 部分故障，红色 = 宕机

### 🧪 探测策略（持续迭代）
| 阶段 | 能力 | 说明 |
|------|------|------|
| ✅ 已完成 | 模型列举 | 拉取 `/v1/models`，确认中转站宣称支持哪些模型 |
| ✅ 已完成 | 可用性检测 | 对每个模型发送探测请求，验证是否真正可调用 |
| ✅ 已完成 | TTFT 测量 | 记录首 token 延迟，识别「掺水」模型 |
| ✅ 已完成 | 套壳检测 | 对 OpenAI / Claude / Gemini 兼容格式运行统一诊断探针，结合模型指纹识别疑似套壳 |
| ✅ 已完成 | 降智检测 | 通过算术、指令遵循、异常拒答等跨模型探针标记推理/对齐退化 |
| ✅ 已完成 | 能力探测 | 标记 streaming、vision、tool calling 等能力信号 |
| ✅ 已完成 | 性能/并发/额度探测 | 汇总可用率、TTFT、并发表现，并识别额度/限流异常 |

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

# 3. 启动
docker compose up -d

# 4. 获取管理员密码
docker compose logs aletheia | grep "admin password"

# 5. 浏览器访问 http://你的服务器IP:8000
#    用上面的密码登录
```

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

### Podman 用户

如果使用 Podman 替代 Docker：

```bash
# 确保 podman socket 已启动
systemctl start podman.socket
systemctl enable podman.socket

# 然后用 docker-compose 或 podman-compose
podman-compose up -d
# 或
docker compose up -d
```

### 生产构建（不依赖 Docker）

```bash
cd frontend && npm run build
cd ../backend && uvicorn main:app --host 0.0.0.0 --port 8000
```

## 使用说明

1. **登录**后进入看板，初始为空
2. 在**管理页面**添加中转站（名称、Base URL、API Key），支持批量 JSON 导入
3. 点击**探测**按钮进行首次检测，或开启**定时探测**由系统自动维护
4. 在**看板**查看所有站点状态概览，在**详情页**查看历史趋势和单模型 TTFT 分布

## 技术架构

```
┌─────────────┐     ┌──────────────────┐     ┌──────────┐
│  React SPA   │────▶│  FastAPI         │────▶│  SQLite  │
│  (浏览器)    │◀────│  ├─ /api/auth    │     └──────────┘
└─────────────┘     │  ├─ /api/stations│
                    │  ├─ /api/probe   │
                    │  ├─ APScheduler  │
                    │  └─ KeyCrypto    │
                    └──────┬───────────┘
                           │ openai SDK
                    ┌──────▼───────────┐
                    │  中转站 APIs      │
                    └──────────────────┘
```

## 环境变量

| 变量 | 必需 | 说明 |
|------|------|------|
| `ALETHEIA_ENCRYPTION_KEY` | 否 | Fernet 加密密钥，留空自动生成 |
| `ALETHEIA_JWT_SECRET` | 否 | JWT 签名密钥，留空自动生成 |
| `ALETHEIA_ADMIN_PASSWORD` | 否 | 管理员初始密码，留空自动生成并打印 |
| `ALETHEIA_DEFAULT_PROBE_INTERVAL_HOURS` | 否 | 默认探测间隔（小时），默认 6 |

## 迭代计划

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 1 | 站点管理 + 手动探测 + 看板 + 登录 | ✅ |
| Phase 2 | 定时调度 + 历史趋势图表 | ✅ |
| Phase 3 | 套壳检测 + 降智检测 | ✅ |
| Phase 4 | 性能探测 / 并发测试 / 能力探测 / 额度查询 | ✅ |

## FAQ

**Q: 探测会不会被中转站发现/封禁？**
A: 探测 payload 仅为 `"hi"`，并发控制在 5 个以内，与正常用户行为无异。也可关闭定时探测、仅手动触发。

**Q: 为什么不用 Redis / PostgreSQL？**
A: 个人或小团队使用 SQLite 完全足够，零运维成本。需要时可自行替换。

**Q: 支持非 OpenAI 兼容 API 的中转站吗？**
A: 目前仅支持 OpenAI 兼容格式（`/v1/models` 和 `/v1/chat/completions`），这是市面绝大多数中转站的标准。

## License

MIT — see [LICENSE](https://github.com/cyl147368/Aletheia/blob/main/LICENSE)

---

<p align="center">
  <a href="https://github.com/cyl147368/Aletheia">View on GitHub</a> ·
  <a href="https://github.com/cyl147368/Aletheia/issues">Report Issue</a>
</p>
