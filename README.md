# Ai-agent

可嵌入任意项目的 Cursor Ai-agent sidecar。clone 到宿主项目根目录后，启动本地服务并在网页里注入聊天侧边栏，Agent 会直接读写宿主项目代码。支持**文本 + 图片**多模态对话，并展示 thinking / tool_call 等 Agent 过程。

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

# 4. 启动（先激活你的 Python 3.10+ 环境）
./ai/bin/python start.py
```

自检（不依赖 API Key）：

```bash
./ai/bin/python backend/check.py
```

确认服务正常：

```bash
curl http://127.0.0.1:8765/api/health
```

也可以直接用浏览器打开首页：

```text
http://127.0.0.1:8765/
```

首页自带一份简易说明书，并可直接拉起悬浮聊天框用于联调。

## 嵌入宿主项目前端

在宿主项目任意 HTML 模板（如 `server/templates/base.html`）的 `</body>` 前加一行：

```html
<script src="http://<ai-agent-host>:8765/static/widget.js"></script>
```

如果宿主页面和 Ai-agent API 不在同一域名下，再显式传 `data-api-base`：

```html
<script
  src="http://<ai-agent-host>:8765/static/widget.js"
  data-api-base="http://<ai-agent-host>:8765"
></script>
```

刷新页面后右下角出现 **AI** 按钮，点击展开侧边栏即可对话。侧边栏支持 📷 图片上传，可与文本一起发送给 Agent 分析。

纯后端项目也可以不用 widget，直接调 API：

```bash
curl -X POST http://<ai-agent-host>:8765/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"列出项目顶层目录结构"}'
```

带图片的请求示例：

```bash
curl -X POST http://<ai-agent-host>:8765/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "这张截图里报错是什么意思？",
    "model": "composer-2.5",
    "images": [
      {
        "name": "screenshot.png",
        "mime_type": "image/png",
        "data": "<base64-encoded-image-data>"
      }
    ]
  }'
```

## 配置说明

`config.yaml`：

| 字段 | 说明 |
|------|------|
| `host_project_root` | 宿主项目根目录，相对 Ai-agent 目录，按你的目录结构配置 |
| `server.host` / `server.port` | 本地服务地址，默认 `127.0.0.1:8765` |
| `agent.model` | Cursor 模型，默认 `composer-2.5` |
| `agent.runtime` | `local`（本机改代码）或 `cloud`（云端 VM + GitHub） |
| `agent.cloud.repo_url` | cloud 模式下的 GitHub 仓库 URL |

## API

- `GET /api/health` — 健康检查
- `GET /` — 简易首页 / 使用说明
- `POST /api/chat` — 同步对话 `{ "message": "...", "session_id": "可选", "model": "可选", "images": [{ "data": "...", "mime_type": "image/png", "name": "可选" }] }`
- `POST /api/chat/stream` — SSE 流式对话（widget 使用；支持图片与过程事件：thinking / tool_call / status / task）
- `GET /static/widget.js` — 可嵌入的前端组件（含图片上传与过程面板）

## 安全提示

- 默认 `config.yaml` 绑定 `0.0.0.0` 便于局域网联调；公网环境请改回 `127.0.0.1`
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
├── start.py
└── run.sh
```
