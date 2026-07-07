# Ai-agent

可嵌入任意项目的 Cursor Dev Agent sidecar。clone 到宿主项目根目录后，启动本地服务并在网页里注入聊天侧边栏，Agent 会直接读写宿主项目代码。

## 环境要求

- **Python 3.10+**（`cursor-sdk` 硬性要求）
- Cursor API Key（[Integrations](https://cursor.com/dashboard/integrations)）

## 快速开始

```bash
# 1. 放入宿主项目（示例：ad-plex）
cd /path/to/your-project
git clone <this-repo-url> Ai-agent

# 2. 创建虚拟环境并安装依赖（venv 目录名：ai）
cd Ai-agent
python3.10 -m venv ai
./ai/bin/pip install -r requirements.txt

# 3. 配置
cp .env.example .env
# 编辑 .env，填入 CURSOR_API_KEY

# 4. 启动（默认监听 127.0.0.1:8765；run.sh 优先使用 ./ai/bin/python）
bash run.sh
```

自检（不依赖 API Key）：

```bash
./ai/bin/python backend/check_config.py
```

确认服务正常：

```bash
curl http://127.0.0.1:8765/api/health
```

## 嵌入宿主项目前端

在宿主项目任意 HTML 模板（如 `server/templates/base.html`）的 `</body>` 前加一行：

```html
<script src="http://127.0.0.1:8765/static/widget.js" data-api-base="http://127.0.0.1:8765"></script>
```

刷新页面后右下角出现 **AI** 按钮，点击展开侧边栏即可对话。

纯后端项目也可以不用 widget，直接调 API：

```bash
curl -X POST http://127.0.0.1:8765/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"列出项目顶层目录结构"}'
```

## 配置说明

`config.yaml`：

| 字段 | 说明 |
|------|------|
| `host_project_root` | 宿主项目根目录，相对 Ai-agent 目录，默认 `..` |
| `server.host` / `server.port` | 本地服务地址，默认 `127.0.0.1:8765` |
| `agent.model` | Cursor 模型，默认 `composer-2.5` |
| `agent.runtime` | `local`（本机改代码）或 `cloud`（云端 VM + GitHub） |
| `agent.cloud.repo_url` | cloud 模式下的 GitHub 仓库 URL |

## API

- `GET /api/health` — 健康检查
- `POST /api/chat` — 同步对话 `{ "message": "...", "session_id": "可选" }`
- `POST /api/chat/stream` — SSE 流式对话（widget 使用）
- `GET /static/widget.js` — 可嵌入的前端组件

## 安全提示

- 仅绑定 `127.0.0.1`，**不要**暴露到公网
- Agent 拥有读写宿主项目、执行命令的权限，仅用于本地开发
- `CURSOR_API_KEY` 不要提交到 git

## 目录结构

```
Ai-agent/
├── backend/          # FastAPI + Cursor SDK
├── frontend/         # widget.js
├── config.yaml
├── .env.example
├── requirements.txt
└── run.sh
```

## 后续：LangChain 版

当前为 **Cursor SDK 简单版**（Phase 1）。后续可在 `backend/` 增加 LangChain 实现，通过 `config.yaml` 切换 `backend: cursor | langchain`。
