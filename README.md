# Ai-agent

本地浏览器里的 **Coding Agent 控制台**。首页可选择 Cursor / OpenAI / DeepSeek；支持文本与图片附件，以及 thinking、tool_call、summary 等过程展示。

- **Cursor**：云端/SDK Agent（`cursor-sdk`）
- **OpenAI / DeepSeek**：本机 **openai SDK**（兼容 HTTP）+ 本地工具循环（读/写/grep/shell）

## 环境要求

- **Python 3.10+**（Cursor 路径需 `cursor-sdk`）
- 对应厂商的 API Key（见 `.env.example`）

## 快速开始

```bash
git clone <this-repo-url> Ai-agent
cd Ai-agent

conda create -n ai-agent python=3.10 -y
conda activate ai-agent
pip install -r requirements.txt

cp .env.example .env
# 编辑 .env，按需填入 CURSOR_API_KEY / OPENAI_API_KEY / DEEPSEEK_API_KEY

./run.sh
```

自检：

```bash
python -m backend.check
```

浏览器：

```text
http://127.0.0.1:8765/          # 说明 + 入口
http://127.0.0.1:8765/cursor    # Cursor
http://127.0.0.1:8765/openai    # OpenAI（需 OPENAI_API_KEY）
http://127.0.0.1:8765/deepseek  # DeepSeek（需 DEEPSEEK_API_KEY）
```

## 使用方式

1. 打开首页，点 **Cursor** / **OpenAI** / **DeepSeek**。
2. 在对话页选模型、发消息；可粘贴或上传附件（单文件约 50MB 内）。
3. 关闭对话页回到首页。

Agent 默认工作区为本仓库（`host_project_root: "."`）。要操作其它目录，在 `config.yaml` 里改路径。

## HTTP API

```bash
curl -X POST http://127.0.0.1:8765/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"列出工作区顶层目录"}'
```

| 路径 | 说明 |
|------|------|
| `GET /` | 说明页 + 入口 |
| `GET /cursor` | Cursor 对话页 |
| `GET /openai` | OpenAI Agent（兼容 API + 本地工具） |
| `GET /deepseek` | DeepSeek Agent（同上） |
| `GET /api/health` | 健康检查（含 `provider`、`keys` 布尔） |
| `POST /api/chat` | 同步对话（可带 `provider`） |
| `POST /api/chat/stream` | SSE 流式对话（可带 `provider`） |
| `GET /static/widget.js` | 对话页前端脚本 |

## 配置

`config.yaml`：

| 字段 | 说明 |
|------|------|
| `host_project_root` | Agent **工作区**根目录（相对本仓库）。默认 `"."` |
| `server.host` / `server.port` | 默认 `0.0.0.0:8765`（公网请改 `127.0.0.1`） |
| `agent.provider` | `cursor` / `openai` / `deepseek` |
| `agent.model` | 模型 id，如 `composer-2.5` |
| `agent.runtime` | `local` 或 `cloud` |
| `agent.allow_repo_write` | `false` 时只读 |
| `agent.safety_enabled` | 密钥相关防护开关 |

`.env`：

| 变量 | 说明 |
|------|------|
| `CURSOR_API_KEY` | Cursor |
| `OPENAI_API_KEY` | OpenAI |
| `DEEPSEEK_API_KEY` | DeepSeek |

## 安全

- Agent 可读写工作区并执行命令，仅建议本机开发使用
- 勿将 API Key 提交进 git
- 公网暴露请收紧绑定地址并自行加鉴权

## 目录

```
Ai-agent/
├── backend/
├── frontend/
│   ├── index.html
│   ├── cursor.html
│   ├── openai.html
│   ├── deepseek.html
│   └── js/
├── config.yaml
├── .env.example
├── requirements.txt
├── start.py
└── run.sh
```
