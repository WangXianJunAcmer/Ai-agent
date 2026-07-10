(function () {
  var script = document.currentScript;
  var scriptUrl = "";
  try {
    scriptUrl = script ? new URL(script.src, window.location.href) : null;
  } catch (err) {
    scriptUrl = null;
  }
  var inferredApiBase = scriptUrl ? scriptUrl.origin : window.location.origin;
  var apiBase = (script && script.getAttribute("data-api-base")) || inferredApiBase;
  var defaultModel = (script && script.getAttribute("data-default-model")) || "composer-2.5";
  var sessionId = localStorage.getItem("ai-agent-session-id") || "";

  var styles = `
    #ai-agent-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.18);
      z-index: 2147482999; opacity: 0; pointer-events: none; transition: opacity .2s ease;
    }
    #ai-agent-backdrop.open { opacity: 1; pointer-events: auto; }
    #ai-agent-trigger {
      position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px;
      background: linear-gradient(135deg, #10a37f, #1a7f64); color: #fff; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; cursor: pointer;
      box-shadow: 0 10px 28px rgba(16,163,127,.35); z-index: 2147483000;
      font: 700 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; user-select: none;
    }
    #ai-agent-sidebar {
      --ai-bg: #ffffff;
      --ai-surface: #f7f7f8;
      --ai-border: rgba(0,0,0,.08);
      --ai-text: #0d0d0d;
      --ai-muted: #6b6b6b;
      --ai-accent: #0d0d0d;
      --ai-user-bg: #f4f4f4;
      --ai-composer-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.06);
      position: fixed; top: 0; right: -520px; width: min(520px, 96vw); height: 100%;
      background: var(--ai-bg); box-shadow: -8px 0 32px rgba(0,0,0,.12);
      z-index: 2147483001; transition: right .25s ease; display: flex;
      flex-direction: column;
      font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: var(--ai-text);
    }
    #ai-agent-sidebar *, #ai-agent-sidebar *::before, #ai-agent-sidebar *::after { box-sizing: border-box; }
    #ai-agent-sidebar.open { right: 0; }
    #ai-agent-topbar {
      flex: 0 0 auto; height: 52px; padding: 0 14px;
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      border-bottom: 1px solid var(--ai-border);
      background: rgba(255,255,255,.85); backdrop-filter: blur(10px); z-index: 2;
    }
    #ai-agent-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
    #ai-agent-brand-mark {
      width: 28px; height: 28px; border-radius: 8px;
      background: linear-gradient(135deg, #10a37f, #1a7f64);
      color: #fff; display: grid; place-items: center;
      font: 700 12px/1 -apple-system, sans-serif; flex: 0 0 auto;
    }
    #ai-agent-brand strong { font-size: 15px; font-weight: 600; color: var(--ai-text); }
    #ai-agent-run-state {
      font-size: 12px; color: var(--ai-muted); margin-left: 2px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #ai-agent-run-state.is-busy { color: #10a37f; }
    #ai-agent-top-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
    #ai-agent-new-chat, #ai-agent-close {
      border: 1px solid var(--ai-border); background: #fff; color: var(--ai-text);
      border-radius: 999px; padding: 7px 12px; font: 13px/1.2 inherit; cursor: pointer;
    }
    #ai-agent-new-chat:hover, #ai-agent-close:hover { background: var(--ai-surface); }
    #ai-agent-close { width: 32px; height: 32px; padding: 0; display: grid; place-items: center; font-size: 18px; }
    #ai-agent-stop {
      width: 32px; height: 32px; border-radius: 999px; border: 0; cursor: pointer;
      flex: 0 0 auto; display: none; place-items: center;
      background: #0d0d0d; color: #fff;
    }
    #ai-agent-stop.visible { display: grid; }
    #ai-agent-stop:hover { background: #2a2a2a; }
    #ai-agent-stop-square {
      width: 10px; height: 10px; border-radius: 2px; background: #fff;
    }
    #ai-agent-messages {
      flex: 1 1 auto; overflow-y: auto; padding: 18px 16px 12px;
      background: var(--ai-bg); scroll-behavior: smooth;
    }
    #ai-agent-thread { display: flex; flex-direction: column; gap: 18px; min-height: 100%; }
    .ai-agent-worklog { display: flex; flex-direction: column; gap: 8px; margin: 0 0 10px; }
    .ai-agent-worklog:empty { display: none; }
    .ai-agent-card {
      border: 1px solid var(--ai-border); border-radius: 12px; background: #fafafa; overflow: hidden;
    }
    .ai-agent-card-header {
      display: flex; align-items: center; gap: 8px; padding: 9px 12px;
      font-size: 13px; color: var(--ai-text); background: transparent;
    }
    .ai-agent-card-title {
      font-weight: 550; flex: 1 1 auto; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ai-agent-card-meta { font-size: 12px; color: var(--ai-muted); white-space: nowrap; }
    .ai-agent-card-body {
      border-top: 1px solid var(--ai-border); padding: 10px 12px;
      color: var(--ai-muted); font-size: 12.5px; white-space: pre-wrap; word-break: break-word; background: #fff;
    }
    .ai-agent-card-kind {
      flex: 0 0 auto; border-radius: 999px; padding: 2px 8px;
      font-size: 10px; font-weight: 650; background: rgba(0,0,0,.05); color: #444;
      text-transform: uppercase; letter-spacing: .04em;
    }
    .ai-agent-card.kind-plan .ai-agent-card-kind { background: #eef2ff; color: #4338ca; }
    .ai-agent-card.kind-think .ai-agent-card-kind { background: #f5f3ff; color: #6d28d9; }
    .ai-agent-card.kind-explore .ai-agent-card-kind { background: #eff6ff; color: #1d4ed8; }
    .ai-agent-card.kind-edit .ai-agent-card-kind { background: #ecfdf5; color: #047857; }
    .ai-agent-card.kind-run .ai-agent-card-kind { background: #fff7ed; color: #c2410c; }
    .ai-agent-card.kind-verify .ai-agent-card-kind { background: #f1f5f9; color: #475569; }
    .ai-agent-paths { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .ai-agent-path {
      display: inline-flex; align-items: center; max-width: 100%;
      padding: 3px 8px; border-radius: 999px;
      background: #f4f4f4; border: 1px solid var(--ai-border); color: #333;
      font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .ai-agent-diff {
      margin-top: 8px; border: 1px solid var(--ai-border);
      border-radius: 10px; overflow: hidden; background: #fafafa;
    }
    .ai-agent-diff + .ai-agent-diff { margin-top: 8px; }
    .ai-agent-diff-path {
      padding: 7px 10px; background: #eee; color: #111;
      font: 650 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .ai-agent-diff-line {
      display: block; padding: 4px 10px;
      font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: pre-wrap; word-break: break-word;
    }
    .ai-agent-diff-line.added { background: #ecfdf5; color: #166534; }
    .ai-agent-diff-line.removed { background: #fef2f2; color: #991b1b; }
    .ai-agent-msg { display: flex; gap: 12px; align-items: flex-start; width: 100%; }
    .ai-agent-msg.user { justify-content: flex-end; }
    .ai-agent-msg.agent { justify-content: flex-start; }
    .ai-agent-avatar {
      width: 28px; height: 28px; border-radius: 999px; flex: 0 0 auto; margin-top: 2px;
      display: grid; place-items: center; font: 700 11px/1 -apple-system, sans-serif; color: #fff;
    }
    .ai-agent-msg.agent .ai-agent-avatar { background: #10a37f; }
    .ai-agent-msg.user .ai-agent-avatar { display: none; }
    .ai-agent-msg-main { min-width: 0; max-width: 100%; }
    .ai-agent-msg.user .ai-agent-msg-main { max-width: 88%; }
    .ai-agent-msg .role { display: none; }
    .ai-agent-msg .body {
      white-space: pre-wrap; word-break: break-word;
      font: inherit; color: var(--ai-text);
      background: transparent; border: 0; border-radius: 0;
      padding: 2px 0; line-height: 1.7;
    }
    .ai-agent-msg.user .body {
      background: var(--ai-user-bg); border-radius: 22px; padding: 10px 16px;
    }
    .ai-agent-msg.agent .body { padding-top: 4px; }
    .ai-agent-msg.system .body {
      background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412;
      border-radius: 14px; padding: 10px 14px;
    }
    .ai-agent-msg .body > :first-child { margin-top: 0; }
    .ai-agent-msg .body > :last-child { margin-bottom: 0; }
    .ai-agent-msg .body p,
    .ai-agent-msg .body ul,
    .ai-agent-msg .body ol,
    .ai-agent-msg .body pre,
    .ai-agent-msg .body blockquote,
    .ai-agent-msg .body h1,
    .ai-agent-msg .body h2,
    .ai-agent-msg .body h3,
    .ai-agent-msg .body h4 { margin: 0 0 10px; }
    .ai-agent-msg .body ul,
    .ai-agent-msg .body ol { padding-left: 22px; }
    .ai-agent-msg .body li + li { margin-top: 4px; }
    .ai-agent-msg .body li input[type="checkbox"] {
      margin-right: 6px; vertical-align: middle; pointer-events: none;
    }
    .ai-agent-msg .body h1,
    .ai-agent-msg .body h2,
    .ai-agent-msg .body h3,
    .ai-agent-msg .body h4 { line-height: 1.35; font-weight: 650; }
    .ai-agent-msg .body h1 { font-size: 22px; }
    .ai-agent-msg .body h2 { font-size: 19px; }
    .ai-agent-msg .body h3 { font-size: 17px; }
    .ai-agent-msg .body h4 { font-size: 15px; }
    .ai-agent-msg .body strong { font-weight: 650; }
    .ai-agent-msg .body em { font-style: italic; }
    .ai-agent-msg .body del { text-decoration: line-through; color: var(--ai-muted); }
    .ai-agent-msg .body a {
      color: #2563eb; text-decoration: underline; text-underline-offset: 2px;
      word-break: break-word;
    }
    .ai-agent-msg .body a:hover { color: #1d4ed8; }
    .ai-agent-msg .body hr {
      border: 0; border-top: 1px solid var(--ai-border); margin: 12px 0;
    }
    .ai-agent-msg .body table {
      width: 100%; border-collapse: collapse; margin: 0 0 12px;
      font-size: 13px; display: block; overflow-x: auto;
    }
    .ai-agent-msg .body th,
    .ai-agent-msg .body td {
      border: 1px solid var(--ai-border); padding: 8px 10px; text-align: left;
      vertical-align: top;
    }
    .ai-agent-msg .body th { background: #f4f4f4; font-weight: 650; }
    .ai-agent-msg .body code {
      padding: 2px 6px; border-radius: 6px; background: rgba(0,0,0,.06);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .92em;
    }
    .ai-agent-msg .body pre {
      padding: 14px 16px; border-radius: 12px; overflow: auto;
      background: #0d0d0d; color: #f5f5f5;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px;
    }
    .ai-agent-msg .body pre code { background: transparent; padding: 0; color: inherit; }
    .ai-agent-msg .body blockquote {
      padding-left: 12px; border-left: 3px solid rgba(0,0,0,.15); color: var(--ai-muted);
    }
    .ai-agent-msg-images {
      display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; justify-content: flex-end;
    }
    .ai-agent-msg.agent .ai-agent-msg-images { justify-content: flex-start; }
    .ai-agent-msg-images img {
      width: 96px; height: 96px; object-fit: cover;
      border-radius: 14px; border: 1px solid var(--ai-border); background: #fff;
    }
    .ai-agent-msg-files {
      display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; justify-content: flex-end;
    }
    .ai-agent-msg.agent .ai-agent-msg-files { justify-content: flex-start; }
    .ai-agent-file-chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 10px; border-radius: 999px; border: 1px solid var(--ai-border);
      background: #fff; color: #333; font-size: 12px; max-width: 220px;
    }
    .ai-agent-file-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #ai-agent-footer {
      flex: 0 0 auto; padding: 8px 14px 16px;
      background: linear-gradient(180deg, rgba(255,255,255,0), #fff 28%);
      display: flex; flex-direction: column; gap: 8px;
    }
    #ai-agent-queue { display: flex; flex-direction: column; gap: 8px; }
    #ai-agent-queue:empty { display: none; }
    .ai-agent-queue-item {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
      padding: 10px 12px; border: 1px solid var(--ai-border); border-radius: 14px;
      background: var(--ai-surface); color: var(--ai-text); font-size: 13px;
    }
    .ai-agent-queue-item .meta { color: #10a37f; font-size: 12px; margin-bottom: 4px; font-weight: 700; }
    .ai-agent-queue-item .text {
      white-space: pre-wrap; word-break: break-word; max-height: 72px; overflow: hidden;
      cursor: text;
    }
    .ai-agent-queue-item .text:hover { color: #111; }
    .ai-agent-queue-actions {
      display: flex; align-items: center; gap: 4px; flex: 0 0 auto;
    }
    .ai-agent-queue-actions button {
      width: 28px; height: 28px; border: 0; border-radius: 8px;
      background: transparent; color: #555; cursor: pointer;
      display: grid; place-items: center; font-size: 14px; line-height: 1;
    }
    .ai-agent-queue-actions button:hover { background: #fff; color: #111; }
    .ai-agent-queue-actions button.send-now { font-size: 15px; font-weight: 700; }
    .ai-agent-queue-actions button.delete:hover { color: #b91c1c; }
    #ai-agent-compose-shell {
      border-radius: 16px;
      background: #fff;
      box-shadow: var(--ai-composer-shadow);
      padding: 10px 12px 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    #ai-agent-compose-shell.mode-plan {
      box-shadow: 0 0 0 1px rgba(67,56,202,.22), 0 8px 24px rgba(67,56,202,.08);
      background: linear-gradient(180deg, #fff, #fbfbff);
    }
    #ai-agent-mode-wrap {
      position: relative;
      flex: 0 0 auto;
    }
    #ai-agent-mode-tip {
      display: none;
      position: absolute;
      left: 0;
      bottom: calc(100% + 8px);
      z-index: 30;
      width: max-content;
      max-width: 280px;
      border: 1px solid #c7d2fe;
      border-radius: 10px;
      background: #eef2ff;
      color: #4338ca;
      padding: 8px 10px;
      font-size: 12px;
      line-height: 1.45;
      box-shadow: 0 8px 24px rgba(67,56,202,.12);
      pointer-events: none;
    }
    #ai-agent-mode-wrap.show-plan-tip #ai-agent-mode-tip {
      display: block;
    }
    #ai-agent-attachments { display: flex; flex-wrap: wrap; gap: 8px; }
    #ai-agent-attachments:empty { display: none; }
    .ai-agent-thumb { position: relative; width: 56px; height: 56px; }
    .ai-agent-thumb img {
      width: 100%; height: 100%; object-fit: cover;
      border-radius: 10px; border: 1px solid var(--ai-border); background: #fff;
    }
    .ai-agent-thumb.file {
      width: auto; min-width: 110px; height: auto;
      padding: 8px 26px 8px 10px; border: 1px solid var(--ai-border);
      border-radius: 10px; background: #fafafa; color: #333; font-size: 12px;
    }
    .ai-agent-thumb.file .name {
      display: block; max-width: 150px; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; font-weight: 650;
    }
    .ai-agent-thumb.file .kind { color: var(--ai-muted); margin-top: 2px; display: block; }
    .ai-agent-thumb button {
      position: absolute; top: -6px; right: -6px;
      width: 20px; height: 20px; border: 0; border-radius: 50%;
      background: #111; color: #fff; cursor: pointer;
      font: 700 12px/1 system-ui, sans-serif;
    }
    #ai-agent-input {
      width: 100%; border: 0; outline: none; background: transparent; resize: none;
      min-height: 24px; max-height: 140px;
      padding: 2px 2px 0; font: inherit; line-height: 1.45; color: var(--ai-text);
    }
    #ai-agent-input::placeholder { color: #8e8e8e; }
    #ai-agent-compose-toolbar {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    #ai-agent-compose-left, #ai-agent-compose-right {
      display: flex; align-items: center; gap: 6px; min-width: 0;
    }
    #ai-agent-mode, #ai-agent-model {
      appearance: none;
      border: 0;
      background: transparent url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b6b6b' d='M3 4.5L6 8l3-3.5'/%3E%3C/svg%3E") right 0 center no-repeat;
      padding: 2px 16px 2px 8px;
      font: 12px/1.2 inherit; color: var(--ai-muted); cursor: pointer; max-width: 220px;
    }
    #ai-agent-mode {
      background-color: #f4f4f4;
      border-radius: 999px;
      padding: 5px 20px 5px 10px;
      max-width: 82px;
    }
    #ai-agent-model:hover { color: var(--ai-text); }
    #ai-agent-mode:hover { color: var(--ai-text); }
    #ai-agent-file-input { display: none; }
    #ai-agent-pick-file, #ai-agent-send {
      width: 32px; height: 32px; border-radius: 999px; border: 0; cursor: pointer;
      flex: 0 0 auto; display: grid; place-items: center;
    }
    #ai-agent-pick-file { background: transparent; color: #555; font-size: 16px; }
    #ai-agent-pick-file:hover { background: #f3f3f3; }
    #ai-agent-send { background: #0d0d0d; color: #fff; font-size: 15px; }
    #ai-agent-send:hover { background: #2a2a2a; }
    #ai-agent-send.is-queue { font-size: 11px; font-weight: 700; }
    #ai-agent-send.hidden { display: none; }
    #ai-agent-hint {
      margin: 2px 4px 0; text-align: center; font-size: 12px; color: #9a9a9a;
    }
    #ai-agent-current-model { display: none; }
  `;

  var styleEl = document.createElement("style");
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  var container = document.createElement("div");
  container.innerHTML = `
    <div id="ai-agent-backdrop"></div>
    <div id="ai-agent-trigger" title="AI Agent">AI</div>
    <div id="ai-agent-sidebar">
      <div id="ai-agent-topbar">
        <div id="ai-agent-brand">
          <div id="ai-agent-brand-mark">AI</div>
          <strong>Ai-agent</strong>
          <span id="ai-agent-run-state">就绪</span>
        </div>
        <div id="ai-agent-top-actions">
          <button id="ai-agent-new-chat" type="button" title="新对话">新对话</button>
          <button id="ai-agent-close" type="button" title="Close">×</button>
        </div>
      </div>
      <div id="ai-agent-messages">
        <div id="ai-agent-thread"></div>
      </div>
      <div id="ai-agent-footer">
        <div id="ai-agent-queue"></div>
        <div id="ai-agent-compose-shell">
          <div id="ai-agent-attachments"></div>
          <textarea id="ai-agent-input" rows="1" placeholder="Plan, @ for context, / for commands"></textarea>
          <div id="ai-agent-compose-toolbar">
            <div id="ai-agent-compose-left">
              <div id="ai-agent-mode-wrap">
                <select id="ai-agent-mode" title="模式">
                  <option value="agent">Agent</option>
                  <option value="plan" title="Plan mode：只制定/讨论方案，不直接修改代码；确认后可切回 Agent 执行。">Plan</option>
                </select>
                <div id="ai-agent-mode-tip" role="tooltip">Plan mode：只制定/讨论方案，不直接修改代码；确认后可切回 Agent 执行。</div>
              </div>
              <select id="ai-agent-model" title="模型">
                <option value="composer-2.5">composer-2.5</option>
                <option value="auto">auto</option>
              </select>
            </div>
            <div id="ai-agent-compose-right">
              <input id="ai-agent-file-input" type="file" multiple />
              <button id="ai-agent-pick-file" type="button" title="添加文件">📎</button>
              <button id="ai-agent-send" type="button" title="发送">↑</button>
              <button id="ai-agent-stop" type="button" title="终止对话"><span id="ai-agent-stop-square"></span></button>
            </div>
          </div>
        </div>
        <div id="ai-agent-hint">Enter 发送/排队 · ■ 终止 · 队列可编辑/立即发送/删除</div>
      </div>
      <span id="ai-agent-current-model"></span>
    </div>
  `;
  document.body.appendChild(container);

  var backdrop = document.getElementById("ai-agent-backdrop");
  var trigger = document.getElementById("ai-agent-trigger");
  var sidebar = document.getElementById("ai-agent-sidebar");
  var closeBtn = document.getElementById("ai-agent-close");
  var sendBtn = document.getElementById("ai-agent-send");
  var composeShell = document.getElementById("ai-agent-compose-shell");
  var inputField = document.getElementById("ai-agent-input");
  var modeField = document.getElementById("ai-agent-mode");
  var modeWrap = document.getElementById("ai-agent-mode-wrap");
  var modelField = document.getElementById("ai-agent-model");
  var messagesDiv = document.getElementById("ai-agent-messages");
  var threadDiv = document.getElementById("ai-agent-thread");
  var runState = document.getElementById("ai-agent-run-state");
  var currentModel = document.getElementById("ai-agent-current-model");
  var attachmentsDiv = document.getElementById("ai-agent-attachments");
  var queueDiv = document.getElementById("ai-agent-queue");
  var pickFileBtn = document.getElementById("ai-agent-pick-file");
  var fileInput = document.getElementById("ai-agent-file-input");
  var newChatBtn = document.getElementById("ai-agent-new-chat");
  var stopBtn = document.getElementById("ai-agent-stop");
  var pendingFiles = [];
  var sendQueue = [];
  var isRunning = false;
  var queueSeq = 0;
  var activeAbort = null;
  var stopRequested = false;
  modelField.value = defaultModel;
  currentModel.textContent = defaultModel;

  async function loadModelOptions() {
    try {
      var res = await fetch(apiBase + "/api/health");
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      if (Array.isArray(data.model_options) && data.model_options.length) {
        modelField.innerHTML = "";
        data.model_options.forEach(function (model) {
          var option = document.createElement("option");
          option.value = model;
          option.textContent = model;
          modelField.appendChild(option);
        });
      }
      var preferredModel = defaultModel || data.default_model || data.model;
      if (preferredModel && Array.from(modelField.options).some(function (option) { return option.value === preferredModel; })) {
        modelField.value = preferredModel;
      } else if (data.default_model && Array.from(modelField.options).some(function (option) { return option.value === data.default_model; })) {
        modelField.value = data.default_model;
      }
    } catch (err) {
      modelField.value = defaultModel;
    }
  }

  function openSidebar() {
    sidebar.classList.add("open");
    backdrop.classList.add("open");
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("open");
  }

  trigger.onclick = openSidebar;
  closeBtn.onclick = closeSidebar;
  backdrop.onclick = closeSidebar;

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatInlineMarkdown(text) {
    var escaped = escapeHtml(text);
    var inlineCodes = [];
    var out = escaped.replace(/`([^`\n]+)`/g, function (_, code) {
      inlineCodes.push("<code>" + code + "</code>");
      return "%%INLINECODE_" + (inlineCodes.length - 1) + "%%";
    });
    out = out
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/(^|[^"'>])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.+?)__/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
      .replace(/~~(.+?)~~/g, "<del>$1</del>");
    return out.replace(/%%INLINECODE_(\d+)%%/g, function (_, index) {
      return inlineCodes[Number(index)] || "";
    });
  }

  function isTableRow(line) {
    return /^\|.+\|$/.test(line.trim());
  }

  function isTableSeparator(line) {
    return /^\|[\s:|-]+\|$/.test(line.trim());
  }

  function renderTableRows(rows) {
    if (!rows.length) return "";
    var html = ["<table>"];
    rows.forEach(function (row, index) {
      var cells = row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
      var tag = index === 0 ? "th" : "td";
      html.push("<tr>" + cells.map(function (cell) {
        return "<" + tag + ">" + formatInlineMarkdown(cell.trim()) + "</" + tag + ">";
      }).join("") + "</tr>");
    });
    html.push("</table>");
    return html.join("");
  }

  function renderMarkdown(text) {
    var normalized = text.replace(/\r\n/g, "\n");
    var codeBlocks = [];
    normalized = normalized.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, function (_, lang, code) {
      var language = (lang || "").trim();
      var cls = language ? ' class="language-' + escapeHtml(language) + '"' : "";
      codeBlocks.push("<pre><code" + cls + ">" + escapeHtml(code.replace(/\n$/, "")) + "</code></pre>");
      return "%%CODEBLOCK_" + (codeBlocks.length - 1) + "%%";
    });

    var lines = normalized.split("\n");
    var html = [];
    var inList = false;
    var listType = "";

    function closeList() {
      if (inList) {
        html.push("</" + listType + ">");
        inList = false;
        listType = "";
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      if (!trimmed) {
        closeList();
        continue;
      }
      if (/^%%CODEBLOCK_\d+%%$/.test(trimmed)) {
        closeList();
        html.push(trimmed);
        continue;
      }
      if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) {
        closeList();
        html.push("<hr />");
        continue;
      }
      if (isTableRow(trimmed)) {
        closeList();
        var tableRows = [trimmed];
        while (i + 1 < lines.length && isTableRow(lines[i + 1].trim())) {
          i += 1;
          tableRows.push(lines[i].trim());
        }
        if (tableRows.length >= 2 && isTableSeparator(tableRows[1])) {
          html.push(renderTableRows([tableRows[0]].concat(tableRows.slice(2))));
        } else {
          tableRows.forEach(function (row) {
            html.push("<p>" + formatInlineMarkdown(row) + "</p>");
          });
        }
        continue;
      }
      if (/^####\s+/.test(trimmed)) {
        closeList();
        html.push("<h4>" + formatInlineMarkdown(trimmed.replace(/^####\s+/, "")) + "</h4>");
        continue;
      }
      if (/^###\s+/.test(trimmed)) {
        closeList();
        html.push("<h3>" + formatInlineMarkdown(trimmed.replace(/^###\s+/, "")) + "</h3>");
        continue;
      }
      if (/^##\s+/.test(trimmed)) {
        closeList();
        html.push("<h2>" + formatInlineMarkdown(trimmed.replace(/^##\s+/, "")) + "</h2>");
        continue;
      }
      if (/^#\s+/.test(trimmed)) {
        closeList();
        html.push("<h1>" + formatInlineMarkdown(trimmed.replace(/^#\s+/, "")) + "</h1>");
        continue;
      }
      if (/^>\s+/.test(trimmed)) {
        closeList();
        html.push("<blockquote>" + formatInlineMarkdown(trimmed.replace(/^>\s+/, "")) + "</blockquote>");
        continue;
      }
      if (/^[-*]\s+\[[ xX]\]\s+/.test(trimmed)) {
        if (!inList || listType !== "ul") {
          closeList();
          html.push("<ul>");
          inList = true;
          listType = "ul";
        }
        var taskBody = trimmed.replace(/^[-*]\s+/, "");
        var checked = /^\[[xX]\]/.test(taskBody);
        var taskText = taskBody.replace(/^\[[ xX]\]\s+/, "");
        html.push(
          '<li><input type="checkbox" disabled' + (checked ? " checked" : "") + ' />' +
          formatInlineMarkdown(taskText) + "</li>"
        );
        continue;
      }
      if (/^[-*]\s+/.test(trimmed)) {
        if (!inList || listType !== "ul") {
          closeList();
          html.push("<ul>");
          inList = true;
          listType = "ul";
        }
        html.push("<li>" + formatInlineMarkdown(trimmed.replace(/^[-*]\s+/, "")) + "</li>");
        continue;
      }
      if (/^\d+\.\s+/.test(trimmed)) {
        if (!inList || listType !== "ol") {
          closeList();
          html.push("<ol>");
          inList = true;
          listType = "ol";
        }
        html.push("<li>" + formatInlineMarkdown(trimmed.replace(/^\d+\.\s+/, "")) + "</li>");
        continue;
      }

      closeList();
      html.push("<p>" + formatInlineMarkdown(trimmed) + "</p>");
    }
    closeList();

    return html.join("\n").replace(/%%CODEBLOCK_(\d+)%%/g, function (_, index) {
      return codeBlocks[Number(index)] || "";
    });
  }

  function setMessageBody(msg, text, renderAsMarkdown) {
    var body = msg.querySelector(".body");
    if (!text) {
      body.style.display = "none";
      body.innerHTML = "";
      body.textContent = "";
      return;
    }
    body.style.display = "";
    if (renderAsMarkdown) {
      body.innerHTML = renderMarkdown(text);
    } else {
      body.textContent = text;
    }
  }

  function appendMessage(role, text, className, renderAsMarkdown, attachments) {
    var kind = className || role.toLowerCase();
    var msg = document.createElement("div");
    msg.className = "ai-agent-msg " + kind;
    var avatarLabel = kind === "agent" ? "AI" : (kind === "user" ? "你" : "!");
    msg.innerHTML =
      '<div class="ai-agent-avatar">' + avatarLabel + '</div>' +
      '<div class="ai-agent-msg-main">' +
        '<div class="role">' + role + '</div>' +
        '<div class="ai-agent-worklog"></div>' +
        '<div class="body"></div>' +
      '</div>';
    setMessageBody(msg, text, !!renderAsMarkdown);
    var main = msg.querySelector(".ai-agent-msg-main");
    var items = attachments || [];
    var images = items.filter(function (item) { return item.kind === "image" && item.previewUrl; });
    var files = items.filter(function (item) { return item.kind !== "image"; });
    if (images.length) {
      var gallery = document.createElement("div");
      gallery.className = "ai-agent-msg-images";
      images.forEach(function (item) {
        var img = document.createElement("img");
        img.src = item.previewUrl;
        img.alt = item.name || "uploaded image";
        gallery.appendChild(img);
      });
      main.appendChild(gallery);
    }
    if (files.length) {
      var fileRow = document.createElement("div");
      fileRow.className = "ai-agent-msg-files";
      files.forEach(function (item) {
        var chip = document.createElement("div");
        chip.className = "ai-agent-file-chip";
        chip.innerHTML = "<span></span>";
        chip.querySelector("span").textContent = item.name || "file";
        fileRow.appendChild(chip);
      });
      main.appendChild(fileRow);
    }
    threadDiv.appendChild(msg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return msg;
  }

  function getRunMeta(msg) {
    if (!msg.__runMeta) {
      msg.__runMeta = {
        startedAt: Date.now(),
        nextIndex: 1,
        thinkingStartedAt: 0,
      };
    }
    return msg.__runMeta;
  }

  function ensureWorklog(msg) {
    return msg.querySelector(".ai-agent-worklog");
  }

  function elapsedLabel(startedAt) {
    var seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    return seconds + "s";
  }

  function cardKindLabel(kind) {
    if (kind === "plan") return "Plan";
    if (kind === "think") return "Thought";
    if (kind === "explore") return "Explore";
    if (kind === "edit") return "Edit";
    if (kind === "run") return "Run";
    if (kind === "verify") return "Check";
    if (kind === "tool") return "Tool";
    return "Step";
  }

  function makePathsHtml(paths) {
    if (!paths || !paths.length) return "";
    return '<div class="ai-agent-paths">' + paths.map(function (path) {
      return '<span class="ai-agent-path">' + escapeHtml(path) + "</span>";
    }).join("") + "</div>";
  }

  function makeDiffHtml(diffItems) {
    if (!diffItems || !diffItems.length) return "";
    return diffItems.map(function (item) {
      var lines = ['<div class="ai-agent-diff">', '<div class="ai-agent-diff-path">' + escapeHtml(item.path || "changed file") + "</div>"];
      (item.removed || []).forEach(function (line) {
        lines.push('<span class="ai-agent-diff-line removed">- ' + escapeHtml(line) + "</span>");
      });
      (item.added || []).forEach(function (line) {
        lines.push('<span class="ai-agent-diff-line added">+ ' + escapeHtml(line) + "</span>");
      });
      lines.push("</div>");
      return lines.join("");
    }).join("");
  }

  function upsertCard(msg, key, options) {
    var worklog = ensureWorklog(msg);
    var selector = '.ai-agent-card[data-card-key="' + key + '"]';
    var card = worklog.querySelector(selector);
    if (!card) {
      card = document.createElement("div");
      card.className = "ai-agent-card";
      card.setAttribute("data-card-key", key);
      var meta = getRunMeta(msg);
      card.setAttribute("data-card-index", String(meta.nextIndex++));
      card.innerHTML = '<div class="ai-agent-card-header"><span class="ai-agent-card-kind"></span><span class="ai-agent-card-title"></span><span class="ai-agent-card-meta"></span></div><div class="ai-agent-card-body"></div>';
      worklog.appendChild(card);
    }
    var previous = card.__cardData || {};
    var merged = {
      kind: options.kind || previous.kind || "tool",
      title: options.title || previous.title || "",
      meta: options.meta || previous.meta || "",
      detail: options.detail || previous.detail || "",
      paths: (options.paths && options.paths.length) ? options.paths : (previous.paths || []),
      diff: (options.diff && options.diff.length) ? options.diff : (previous.diff || []),
    };
    card.__cardData = merged;
    card.className = "ai-agent-card kind-" + merged.kind;
    card.querySelector(".ai-agent-card-kind").textContent = cardKindLabel(merged.kind);
    card.querySelector(".ai-agent-card-title").textContent = merged.title;
    card.querySelector(".ai-agent-card-meta").textContent = merged.meta;
    var body = card.querySelector(".ai-agent-card-body");
    body.innerHTML = "";
    if (merged.detail) {
      var detail = document.createElement("div");
      detail.textContent = merged.detail;
      body.appendChild(detail);
    }
    var extraHtml = makePathsHtml(merged.paths) + makeDiffHtml(merged.diff);
    if (extraHtml) {
      var extra = document.createElement("div");
      extra.innerHTML = extraHtml;
      body.appendChild(extra);
    }
    if (!merged.detail && !extraHtml) {
      body.style.display = "none";
    } else {
      body.style.display = "";
    }
    return card;
  }

  function appendCard(msg, options) {
    var meta = getRunMeta(msg);
    return upsertCard(msg, "card-" + (meta.nextIndex + 1) + "-" + Date.now(), options);
  }

  function finalizeThoughtCard(msg) {
    var meta = getRunMeta(msg);
    if (!meta.thinkingStartedAt) return;
    appendCard(msg, {
      kind: "think",
      title: "Thought for " + elapsedLabel(meta.thinkingStartedAt),
      meta: "",
      detail: "Reasoned through the next step before replying.",
      paths: [],
    });
    meta.thinkingStartedAt = 0;
  }

  function noteThinking(msg, detail) {
    var meta = getRunMeta(msg);
    if (!meta.thinkingStartedAt) {
      meta.thinkingStartedAt = Date.now();
      appendCard(msg, {
        kind: "think",
        title: "Thinking",
        meta: "live",
        detail: detail || "Working through the next step.",
        paths: [],
      });
    }
  }

  function renderAttachmentPreview() {
    attachmentsDiv.innerHTML = "";
    pendingFiles.forEach(function (item) {
      var wrap = document.createElement("div");
      if (item.kind === "image") {
        wrap.className = "ai-agent-thumb";
        wrap.innerHTML = '<img alt="" /><button type="button" title="移除">×</button>';
        wrap.querySelector("img").src = item.previewUrl;
      } else {
        wrap.className = "ai-agent-thumb file";
        wrap.innerHTML = '<span class="name"></span><span class="kind"></span><button type="button" title="移除">×</button>';
        wrap.querySelector(".name").textContent = item.name || "file";
        wrap.querySelector(".kind").textContent = item.mime_type || "file";
      }
      wrap.querySelector("button").onclick = function () {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        pendingFiles = pendingFiles.filter(function (x) { return x !== item; });
        renderAttachmentPreview();
      };
      attachmentsDiv.appendChild(wrap);
    });
  }

  function removeQueueItem(id, revokeFiles) {
    var kept = [];
    sendQueue.forEach(function (item) {
      if (item.id !== id) {
        kept.push(item);
        return;
      }
      if (revokeFiles) {
        item.files.forEach(function (file) {
          if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
        });
      }
    });
    sendQueue = kept;
    renderQueue();
    updateRunState(isRunning ? "处理中" : "就绪");
  }

  function editQueueItem(item) {
    // Pull queued prompt back into composer (Cursor-style edit).
    if (inputField.value.trim() || pendingFiles.length) {
      if (!confirm("编辑排队消息会覆盖当前输入框内容，继续？")) return;
      clearPendingFiles(true);
    }
    inputField.value = item.text || "";
    modeField.value = item.mode || "agent";
    pendingFiles = item.files.slice();
    removeQueueItem(item.id, false);
    updateModeUI();
    renderAttachmentPreview();
    inputField.focus();
  }

  function sendQueueItemNow(item) {
    // Cursor ↑ : jump this prompt to next / interrupt current run.
    sendQueue = sendQueue.filter(function (x) { return x.id !== item.id; });
    sendQueue.unshift(item);
    renderQueue();
    if (isRunning && activeAbort) {
      activeAbort.abort();
      return;
    }
    drainQueue();
  }

  function renderQueue() {
    queueDiv.innerHTML = "";
    sendQueue.forEach(function (item, index) {
      var row = document.createElement("div");
      row.className = "ai-agent-queue-item";
      var left = document.createElement("div");
      left.innerHTML = '<div class="meta"></div><div class="text" title="点击编辑"></div>';
      left.querySelector(".meta").textContent =
        "排队 #" + (index + 1) + " · " + ((item.mode || "agent") === "plan" ? "Plan" : "Agent") +
        (item.files.length ? " · " + item.files.length + " 个附件" : "");
      left.querySelector(".text").textContent = item.text || "(仅附件)";
      left.querySelector(".text").onclick = function () { editQueueItem(item); };

      var actions = document.createElement("div");
      actions.className = "ai-agent-queue-actions";

      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.title = "编辑";
      editBtn.textContent = "✎";
      editBtn.onclick = function () { editQueueItem(item); };

      var sendNowBtn = document.createElement("button");
      sendNowBtn.type = "button";
      sendNowBtn.className = "send-now";
      sendNowBtn.title = "立即发送";
      sendNowBtn.textContent = "↑";
      sendNowBtn.onclick = function () { sendQueueItemNow(item); };

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "delete";
      deleteBtn.title = "删除";
      deleteBtn.textContent = "🗑";
      deleteBtn.onclick = function () { removeQueueItem(item.id, true); };

      actions.appendChild(editBtn);
      actions.appendChild(sendNowBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(left);
      row.appendChild(actions);
      queueDiv.appendChild(row);
    });
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || "");
        var comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFileSelection(files) {
    var list = Array.from(files || []);
    for (var i = 0; i < list.length; i++) {
      var file = list[i];
      var data = await readFileAsBase64(file);
      var mime = file.type || "application/octet-stream";
      var isImage = mime.indexOf("image/") === 0;
      pendingFiles.push({
        kind: isImage ? "image" : "file",
        name: file.name,
        mime_type: mime,
        data: data,
        previewUrl: isImage ? URL.createObjectURL(file) : "",
      });
    }
    renderAttachmentPreview();
    fileInput.value = "";
  }

  function clearPendingFiles(revokeUrls) {
    if (revokeUrls !== false) {
      pendingFiles.forEach(function (item) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    }
    pendingFiles = [];
    renderAttachmentPreview();
  }

  function buildFilesPayload(files) {
    return (files || []).map(function (item) {
      return {
        name: item.name,
        mime_type: item.mime_type,
        data: item.data,
      };
    });
  }

  function formatAgentError(raw) {
    var msg = String(raw || "unknown");
    var lower = msg.toLowerCase();
    if (
      lower.indexOf("context") >= 0 && (lower.indexOf("limit") >= 0 || lower.indexOf("length") >= 0 || lower.indexOf("window") >= 0 || lower.indexOf("overflow") >= 0 || lower.indexOf("too long") >= 0 || lower.indexOf("exceed") >= 0)
      || lower.indexOf("maximum context") >= 0
      || lower.indexOf("prompt is too long") >= 0
      || lower.indexOf("token") >= 0 && lower.indexOf("limit") >= 0
      || msg.indexOf("上下文") >= 0 && (msg.indexOf("超") >= 0 || msg.indexOf("过长") >= 0)
    ) {
      return "上下文已超限，请点击「新对话」清空后重试，或缩短本次输入/附件。\n原始错误: " + msg;
    }
    return msg;
  }

  function updateRunState(text) {
    if (text) {
      runState.textContent = text;
    } else if (isRunning) {
      runState.textContent = sendQueue.length ? ("处理中 · 队列 " + sendQueue.length) : "处理中";
    } else {
      runState.textContent = sendQueue.length ? ("就绪 · 队列 " + sendQueue.length) : "就绪";
    }
    runState.classList.toggle("is-busy", !!isRunning || runState.textContent.indexOf("中") >= 0);
    currentModel.textContent = modelField.value;
    sendBtn.textContent = isRunning ? "…" : "↑";
    sendBtn.title = isRunning ? "加入队列" : "发送";
    sendBtn.classList.toggle("is-queue", !!isRunning);
    sendBtn.classList.toggle("hidden", !!isRunning);
    stopBtn.classList.toggle("visible", !!isRunning);
  }

  function hidePlanModeTip() {
    modeWrap.classList.remove("show-plan-tip");
  }

  function showPlanModeTip() {
    if (modeField.value !== "plan") return;
    modeWrap.classList.add("show-plan-tip");
  }

  function updateModeUI() {
    var isPlan = modeField.value === "plan";
    composeShell.classList.toggle("mode-plan", isPlan);
    inputField.placeholder = isPlan
      ? "描述你想先规划的问题"
      : "给 Ai-agent 发送消息";
    if (!isPlan) hidePlanModeTip();
  }

  function enqueueCurrentCompose() {
    var text = inputField.value.trim();
    if (!text && !pendingFiles.length) return null;
    var item = {
      id: "q-" + (++queueSeq),
      text: text,
      model: modelField.value,
      mode: modeField.value,
      files: pendingFiles.slice(),
    };
    sendQueue.push(item);
    inputField.value = "";
    autosizeInput();
    pendingFiles = [];
    renderAttachmentPreview();
    renderQueue();
    updateRunState(isRunning ? "处理中" : "就绪");
    return item;
  }

  async function runOne(item) {
    var label = item.text || (item.files.length ? "(附件)" : "");
    appendMessage("You", label, "user", false, item.files);
    var filesPayload = buildFilesPayload(item.files);
    var agentMsg = appendMessage("Agent", "", "agent", true);
    var reply = "";
    var aborted = false;
    appendCard(agentMsg, {
      kind: "plan",
      title: "Planning next move",
      meta: "live",
      detail: "",
      paths: [],
    });

    var controller = new AbortController();
    activeAbort = controller;
    try {
      var res = await fetch(apiBase + "/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: item.text || (item.files.length ? "请查看我上传的附件。" : ""),
          session_id: sessionId || null,
          model: item.model,
          mode: item.mode || "agent",
          files: filesPayload.length ? filesPayload : null,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("HTTP " + res.status);
      }

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";

      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        var parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (var i = 0; i < parts.length; i++) {
          var line = parts[i].trim();
          if (!line.startsWith("data:")) continue;
          var payload = JSON.parse(line.slice(5).trim());

          if (payload.session_id) {
            sessionId = payload.session_id;
            localStorage.setItem("ai-agent-session-id", sessionId);
          }
          if (payload.model) {
            currentModel.textContent = payload.model;
          }

          if (payload.type === "text") {
            updateRunState("回复中");
            finalizeThoughtCard(agentMsg);
            reply += payload.content || "";
            setMessageBody(agentMsg, reply || "…", true);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
          } else if (payload.type === "planning") {
            updateRunState("规划中");
            appendCard(agentMsg, {
              kind: "plan",
              title: "Planning next move",
              meta: "",
              detail: payload.content || "",
              paths: [],
            });
          } else if (payload.type === "upload") {
            updateRunState("已接收附件");
            var names = []
              .concat(payload.images || [])
              .concat(payload.files || [])
              .map(function (f) { return f.name || f.path || "file"; })
              .join(", ");
            appendCard(agentMsg, {
              kind: "run",
              title: "Uploaded attachments",
              meta: "",
              detail: names,
              paths: (payload.files || []).map(function (f) { return f.path; }).filter(Boolean),
            });
          } else if (payload.type === "thinking") {
            updateRunState("正在思考");
            noteThinking(agentMsg, payload.content || "");
          } else if (payload.type === "tool_call") {
            updateRunState("正在调用工具");
            var summary = payload.summary || {};
            var toolKey = payload.call_id
              ? ("tool-" + payload.call_id)
              : ("tool-" + (payload.name || "tool") + "-" + Date.now());
            upsertCard(agentMsg, toolKey, {
              kind: summary.kind || "tool",
              title: summary.title || (payload.name || "tool"),
              meta: payload.status === "running" ? "running" : "done",
              detail: summary.detail || payload.args || payload.result || "",
              paths: summary.paths || [],
              diff: summary.diff || [],
            });
          } else if (payload.type === "status") {
            updateRunState(payload.content || "正在处理");
            appendCard(agentMsg, {
              kind: "run",
              title: payload.content || "Processing",
              meta: payload.status || "",
              detail: "",
              paths: [],
            });
          } else if (payload.type === "task") {
            updateRunState(payload.content || "正在执行任务");
            appendCard(agentMsg, {
              kind: "plan",
              title: payload.content || "Task update",
              meta: payload.status || "",
              detail: "",
              paths: [],
            });
          } else if (payload.type === "error") {
            finalizeThoughtCard(agentMsg);
            setMessageBody(agentMsg, "错误: " + formatAgentError(payload.content || "unknown"), false);
          } else if (payload.type === "done" && !reply) {
            finalizeThoughtCard(agentMsg);
            setMessageBody(agentMsg, "(完成，状态: " + (payload.status || "unknown") + ")", false);
          } else if (payload.type === "done") {
            finalizeThoughtCard(agentMsg);
          }
        }
      }
    } catch (err) {
      if (err && err.name === "AbortError") {
        aborted = true;
        finalizeThoughtCard(agentMsg);
        setMessageBody(agentMsg, stopRequested ? "(已终止)" : "(已中断，准备发送下一条)", false);
      } else {
        var detail = formatAgentError((err && err.message) ? err.message : String(err));
        setMessageBody(
          agentMsg,
          "请求失败 (" + apiBase + "): " + detail + "。请确认已用 python start.py 或 ./run.sh 启动服务（默认 http://127.0.0.1:8765）。",
          false
        );
      }
    } finally {
      if (activeAbort === controller) activeAbort = null;
      item.files.forEach(function (file) {
        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
      });
    }
    return aborted;
  }

  async function drainQueue() {
    if (isRunning) return;
    isRunning = true;
    stopRequested = false;
    updateRunState("处理中");
    while (sendQueue.length) {
      if (stopRequested) break;
      var item = sendQueue.shift();
      renderQueue();
      updateRunState("处理中");
      await runOne(item);
      if (stopRequested) break;
    }
    isRunning = false;
    stopRequested = false;
    updateRunState("就绪");
  }

  function stopConversation() {
    if (!isRunning && !sendQueue.length) return;
    stopRequested = true;
    if (activeAbort) activeAbort.abort();
    updateRunState("正在终止");
  }

  function sendMessage() {
    if (!enqueueCurrentCompose()) return;
    drainQueue();
  }

  sendBtn.onclick = sendMessage;
  stopBtn.onclick = stopConversation;
  modeField.onchange = function () {
    updateModeUI();
    if (modeField.value === "plan") showPlanModeTip();
  };
  modeField.onfocus = showPlanModeTip;
  modeField.onblur = hidePlanModeTip;
  modeWrap.onmouseenter = showPlanModeTip;
  modeWrap.onmouseleave = hidePlanModeTip;
  pickFileBtn.onclick = function () { fileInput.click(); };
  fileInput.addEventListener("change", function (e) {
    handleFileSelection(e.target.files);
  });
  function autosizeInput() {
    inputField.style.height = "auto";
    inputField.style.height = Math.min(inputField.scrollHeight, 140) + "px";
  }
  inputField.addEventListener("input", autosizeInput);
  inputField.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  newChatBtn.onclick = function () {
    if (isRunning || sendQueue.length) {
      if (!confirm("当前有进行中的任务或排队消息，确认清空并开始新对话？")) return;
    }
    stopRequested = true;
    if (activeAbort) activeAbort.abort();
    sendQueue.forEach(function (item) {
      item.files.forEach(function (file) {
        if (file.previewUrl) URL.revokeObjectURL(file.previewUrl);
      });
    });
    sendQueue = [];
    clearPendingFiles(true);
    renderQueue();
    sessionId = "";
    localStorage.removeItem("ai-agent-session-id");
    threadDiv.innerHTML = "";
    isRunning = false;
    stopRequested = false;
    updateRunState("就绪");
  };
  updateRunState("就绪");
  updateModeUI();
  loadModelOptions();
})();
