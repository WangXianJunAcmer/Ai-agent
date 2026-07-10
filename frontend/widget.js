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
      position: fixed; inset: 0; background: rgba(15, 23, 42, .2);
      z-index: 2147482999; opacity: 0; pointer-events: none; transition: opacity .2s ease;
    }
    #ai-agent-backdrop.open { opacity: 1; pointer-events: auto; }
    #ai-agent-trigger {
      position: fixed; bottom: 24px; right: 24px; width: 60px; height: 60px;
      background: #4f46e5; color: #fff; border-radius: 50%; display: flex;
      align-items: center; justify-content: center; cursor: pointer;
      box-shadow: 0 8px 24px rgba(79,70,229,.35); z-index: 2147483000;
      font: 700 15px/1 system-ui, sans-serif; user-select: none;
    }
    #ai-agent-sidebar {
      position: fixed; top: 0; right: -520px; width: min(520px, 96vw); height: 100%;
      background: #fff; box-shadow: -8px 0 32px rgba(15,23,42,.12);
      z-index: 2147483001; transition: right .25s ease; display: flex;
      flex-direction: column; font: 15px/1.6 system-ui, sans-serif; color: #0f172a;
    }
    #ai-agent-sidebar.open { right: 0; }
    #ai-agent-header {
      padding: 18px 20px; background: #4f46e5; color: #fff;
      display: flex; justify-content: space-between; align-items: center;
    }
    #ai-agent-header strong { font-size: 17px; }
    #ai-agent-close { cursor: pointer; font-size: 22px; line-height: 1; opacity: .9; }
    #ai-agent-statusbar {
      padding: 10px 18px;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
      color: #475569;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    #ai-agent-run-state {
      flex: 0 0 auto;
      min-width: 48px;
    }
    #ai-agent-current-model {
      flex: 1 1 auto;
      min-width: 0;
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #ai-agent-messages {
      flex: 1; overflow-y: auto; padding: 18px; background: #f8fafc;
    }
    .ai-agent-worklog {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 10px;
    }
    .ai-agent-card {
      border: 1px solid #dbe3ee;
      border-radius: 14px;
      background: #fff;
      box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
      overflow: hidden;
    }
    .ai-agent-card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 14px;
      font-size: 13px;
      color: #0f172a;
    }
    .ai-agent-card-title {
      font-weight: 700;
      flex: 1 1 auto;
      min-width: 0;
    }
    .ai-agent-card-meta {
      font-size: 12px;
      color: #64748b;
      white-space: nowrap;
    }
    .ai-agent-card-body {
      border-top: 1px solid #eef2f7;
      padding: 12px 14px;
      color: #475569;
      font-size: 13px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .ai-agent-card.kind-plan .ai-agent-card-header { background: #eef2ff; }
    .ai-agent-card.kind-think .ai-agent-card-header { background: #f5f3ff; }
    .ai-agent-card.kind-explore .ai-agent-card-header { background: #eff6ff; }
    .ai-agent-card.kind-edit .ai-agent-card-header { background: #f0fdf4; }
    .ai-agent-card.kind-run .ai-agent-card-header { background: #fff7ed; }
    .ai-agent-card.kind-verify .ai-agent-card-header { background: #f8fafc; }
    .ai-agent-card.kind-tool .ai-agent-card-header { background: #f8fafc; }
    .ai-agent-card-kind {
      flex: 0 0 auto;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 700;
      background: rgba(15, 23, 42, .07);
      color: #334155;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .ai-agent-paths {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    .ai-agent-path {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      padding: 4px 8px;
      border-radius: 999px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      color: #334155;
      font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .ai-agent-diff {
      margin-top: 10px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      background: #f8fafc;
    }
    .ai-agent-diff + .ai-agent-diff { margin-top: 8px; }
    .ai-agent-diff-path {
      padding: 8px 10px;
      background: #e2e8f0;
      color: #0f172a;
      font: 700 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .ai-agent-diff-line {
      display: block;
      padding: 5px 10px;
      font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .ai-agent-diff-line.added { background: #ecfdf5; color: #166534; }
    .ai-agent-diff-line.removed { background: #fef2f2; color: #991b1b; }
    .ai-agent-msg-images {
      display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;
    }
    .ai-agent-msg-images img {
      width: 96px; height: 96px; object-fit: cover;
      border-radius: 10px; border: 1px solid #cbd5e1; background: #fff;
    }
    .ai-agent-msg { margin-bottom: 14px; }
    .ai-agent-msg .role { font-weight: 700; margin-bottom: 6px; font-size: 14px; }
    .ai-agent-msg.user .role { color: #334155; }
    .ai-agent-msg.agent .role { color: #4f46e5; }
    .ai-agent-msg.system .role { color: #b45309; }
    .ai-agent-msg .body {
      white-space: pre-wrap; word-break: break-word;
      font: inherit; color: #0f172a; background: #fff; border: 1px solid #dbe3ee;
      border-radius: 12px; padding: 12px 14px; line-height: 1.7;
    }
    .ai-agent-msg.user .body { background: #f8fafc; border-color: #cbd5e1; }
    .ai-agent-msg.agent .body { background: #eef2ff; border-color: #c7d2fe; color: #1e1b4b; }
    .ai-agent-msg.system .body { background: #fff7ed; border-color: #fed7aa; color: #9a3412; }
    .ai-agent-msg .body > :first-child { margin-top: 0; }
    .ai-agent-msg .body > :last-child { margin-bottom: 0; }
    .ai-agent-msg .body p,
    .ai-agent-msg .body ul,
    .ai-agent-msg .body ol,
    .ai-agent-msg .body pre,
    .ai-agent-msg .body blockquote,
    .ai-agent-msg .body h1,
    .ai-agent-msg .body h2,
    .ai-agent-msg .body h3 { margin: 0 0 10px; }
    .ai-agent-msg .body ul,
    .ai-agent-msg .body ol { padding-left: 22px; }
    .ai-agent-msg .body li + li { margin-top: 4px; }
    .ai-agent-msg .body h1,
    .ai-agent-msg .body h2,
    .ai-agent-msg .body h3 { line-height: 1.35; }
    .ai-agent-msg .body h1 { font-size: 22px; }
    .ai-agent-msg .body h2 { font-size: 19px; }
    .ai-agent-msg .body h3 { font-size: 17px; }
    .ai-agent-msg .body strong { font-weight: 800; }
    .ai-agent-msg .body code {
      padding: 2px 6px; border-radius: 6px; background: rgba(15, 23, 42, .08);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .95em;
    }
    .ai-agent-msg .body pre {
      padding: 12px 14px; border-radius: 10px; overflow: auto; background: #0f172a; color: #e2e8f0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px;
    }
    .ai-agent-msg .body pre code { background: transparent; padding: 0; color: inherit; }
    .ai-agent-msg .body blockquote {
      padding-left: 12px; border-left: 3px solid rgba(79, 70, 229, .35); color: #475569;
    }
    #ai-agent-footer {
      padding: 14px; border-top: 1px solid #e2e8f0; display: flex; gap: 10px; background: #fff;
      flex-direction: column;
    }
    #ai-agent-toolbar {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
    }
    #ai-agent-toolbar label {
      color: #64748b; font-size: 13px; font-weight: 600;
    }
    #ai-agent-model {
      margin-left: 8px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px 8px;
      font: inherit; background: #fff; color: #0f172a;
    }
    #ai-agent-compose {
      display: flex; gap: 10px;
    }
    #ai-agent-attachments {
      display: flex; flex-wrap: wrap; gap: 8px; min-height: 0;
    }
    #ai-agent-attachments:empty { display: none; }
    .ai-agent-thumb {
      position: relative; width: 72px; height: 72px;
    }
    .ai-agent-thumb img {
      width: 100%; height: 100%; object-fit: cover;
      border-radius: 10px; border: 1px solid #cbd5e1; background: #fff;
    }
    .ai-agent-thumb button {
      position: absolute; top: -6px; right: -6px;
      width: 20px; height: 20px; border: 0; border-radius: 50%;
      background: #ef4444; color: #fff; cursor: pointer;
      font: 700 12px/1 system-ui, sans-serif;
    }
    #ai-agent-pick-image {
      border: 1px solid #cbd5e1; background: #fff; color: #334155;
      border-radius: 10px; padding: 12px 14px; cursor: pointer; font-weight: 600;
    }
    #ai-agent-pick-image:disabled { opacity: .6; cursor: not-allowed; }
    #ai-agent-image-input { display: none; }
    #ai-agent-input {
      flex: 1; padding: 12px 14px; border: 1px solid #cbd5e1; border-radius: 10px; outline: none;
      font: inherit;
    }
    #ai-agent-send {
      padding: 12px 16px; background: #4f46e5; color: #fff; border: none;
      border-radius: 10px; cursor: pointer; font-weight: 700; font-size: 14px;
    }
    #ai-agent-send:disabled { opacity: .6; cursor: not-allowed; }
  `;

  var styleEl = document.createElement("style");
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  var container = document.createElement("div");
  container.innerHTML = `
    <div id="ai-agent-backdrop"></div>
    <div id="ai-agent-trigger" title="AI Agent">AI</div>
    <div id="ai-agent-sidebar">
      <div id="ai-agent-header">
        <strong>Dev Agent</strong>
        <span id="ai-agent-close" title="Close">×</span>
      </div>
      <div id="ai-agent-statusbar">
        <span id="ai-agent-run-state">空闲</span>
        <span id="ai-agent-current-model"></span>
      </div>
      <div id="ai-agent-messages"></div>
      <div id="ai-agent-footer">
        <div id="ai-agent-toolbar">
          <label>模型
            <select id="ai-agent-model">
              <option value="composer-2.5">composer-2.5</option>
              <option value="auto">auto</option>
            </select>
          </label>
        </div>
        <div id="ai-agent-attachments"></div>
        <div id="ai-agent-compose">
          <input id="ai-agent-image-input" type="file" accept="image/*" multiple />
          <button id="ai-agent-pick-image" type="button" title="上传图片">📷</button>
          <input id="ai-agent-input" type="text" placeholder="输入你的需求，可附带图片" />
          <button id="ai-agent-send">发送</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  var backdrop = document.getElementById("ai-agent-backdrop");
  var trigger = document.getElementById("ai-agent-trigger");
  var sidebar = document.getElementById("ai-agent-sidebar");
  var closeBtn = document.getElementById("ai-agent-close");
  var sendBtn = document.getElementById("ai-agent-send");
  var inputField = document.getElementById("ai-agent-input");
  var modelField = document.getElementById("ai-agent-model");
  var messagesDiv = document.getElementById("ai-agent-messages");
  var runState = document.getElementById("ai-agent-run-state");
  var currentModel = document.getElementById("ai-agent-current-model");
  var attachmentsDiv = document.getElementById("ai-agent-attachments");
  var pickImageBtn = document.getElementById("ai-agent-pick-image");
  var imageInput = document.getElementById("ai-agent-image-input");
  var pendingImages = [];
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

  function renderMarkdown(text) {
    var escaped = escapeHtml(text).replace(/\r\n/g, "\n");
    var codeBlocks = [];
    escaped = escaped.replace(/```([\s\S]*?)```/g, function (_, code) {
      codeBlocks.push('<pre><code>' + code.trim() + '</code></pre>');
      return "%%CODEBLOCK_" + (codeBlocks.length - 1) + "%%";
    });

    var lines = escaped.split("\n");
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
      if (/^###\s+/.test(trimmed)) {
        closeList();
        html.push("<h3>" + trimmed.replace(/^###\s+/, "") + "</h3>");
        continue;
      }
      if (/^##\s+/.test(trimmed)) {
        closeList();
        html.push("<h2>" + trimmed.replace(/^##\s+/, "") + "</h2>");
        continue;
      }
      if (/^#\s+/.test(trimmed)) {
        closeList();
        html.push("<h1>" + trimmed.replace(/^#\s+/, "") + "</h1>");
        continue;
      }
      if (/^>\s+/.test(trimmed)) {
        closeList();
        html.push("<blockquote>" + trimmed.replace(/^>\s+/, "") + "</blockquote>");
        continue;
      }
      if (/^[-*]\s+/.test(trimmed)) {
        if (!inList || listType !== "ul") {
          closeList();
          html.push("<ul>");
          inList = true;
          listType = "ul";
        }
        html.push("<li>" + trimmed.replace(/^[-*]\s+/, "") + "</li>");
        continue;
      }
      if (/^\d+\.\s+/.test(trimmed)) {
        if (!inList || listType !== "ol") {
          closeList();
          html.push("<ol>");
          inList = true;
          listType = "ol";
        }
        html.push("<li>" + trimmed.replace(/^\d+\.\s+/, "") + "</li>");
        continue;
      }

      closeList();
      html.push("<p>" + trimmed + "</p>");
    }
    closeList();

    var joined = html.join("\n");
    joined = joined
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

    return joined.replace(/%%CODEBLOCK_(\d+)%%/g, function (_, index) {
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

  function appendMessage(role, text, className, renderAsMarkdown, imageUrls) {
    var msg = document.createElement("div");
    msg.className = "ai-agent-msg " + (className || role.toLowerCase());
    msg.innerHTML = '<div class="role">' + role + '</div><div class="ai-agent-worklog"></div><div class="body"></div>';
    setMessageBody(msg, text, !!renderAsMarkdown);
    if (imageUrls && imageUrls.length) {
      var gallery = document.createElement("div");
      gallery.className = "ai-agent-msg-images";
      imageUrls.forEach(function (url) {
        var img = document.createElement("img");
        img.src = url;
        img.alt = "uploaded image";
        gallery.appendChild(img);
      });
      msg.appendChild(gallery);
    }
    messagesDiv.appendChild(msg);
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
    pendingImages.forEach(function (item, index) {
      var wrap = document.createElement("div");
      wrap.className = "ai-agent-thumb";
      wrap.innerHTML = '<img alt="" /><button type="button" title="移除">×</button>';
      wrap.querySelector("img").src = item.previewUrl;
      wrap.querySelector("button").onclick = function () {
        URL.revokeObjectURL(item.previewUrl);
        pendingImages = pendingImages.filter(function (x) { return x !== item; });
        renderAttachmentPreview();
      };
      attachmentsDiv.appendChild(wrap);
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

  async function handleImageSelection(files) {
    var list = Array.from(files || []);
    for (var i = 0; i < list.length; i++) {
      var file = list[i];
      if (!file.type || !file.type.startsWith("image/")) continue;
      var data = await readFileAsBase64(file);
      pendingImages.push({
        name: file.name,
        mime_type: file.type,
        data: data,
        previewUrl: URL.createObjectURL(file),
      });
    }
    renderAttachmentPreview();
    imageInput.value = "";
  }

  function clearPendingImages(revokeUrls) {
    if (revokeUrls !== false) {
      pendingImages.forEach(function (item) {
        URL.revokeObjectURL(item.previewUrl);
      });
    }
    pendingImages = [];
    renderAttachmentPreview();
  }

  function buildImagePayload() {
    return pendingImages.map(function (item) {
      return {
        name: item.name,
        mime_type: item.mime_type,
        data: item.data,
      };
    });
  }

  function setBusy(busy) {
    sendBtn.disabled = busy;
    inputField.disabled = busy;
    modelField.disabled = busy;
    pickImageBtn.disabled = busy;
    runState.textContent = busy ? "处理中" : "就绪";
    currentModel.textContent = modelField.value;
  }

  function updateRunState(text) {
    runState.textContent = text || "处理中";
  }

  async function sendMessage() {
    var text = inputField.value.trim();
    if (!text && !pendingImages.length) return;

    var sentPreviewUrls = pendingImages.map(function (item) { return item.previewUrl; });
    appendMessage("You", text || "(图片)", "user", false, sentPreviewUrls);
    var imagesPayload = buildImagePayload();
    inputField.value = "";
    clearPendingImages(false);
    setBusy(true);

    var agentMsg = appendMessage("Agent", "", "agent", true);
    var reply = "";
    appendCard(agentMsg, {
      kind: "plan",
      title: "Planning next move",
      meta: "live",
      detail: "",
      paths: [],
    });

    try {
      var res = await fetch(apiBase + "/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text || "请分析我上传的图片。",
          session_id: sessionId || null,
          model: modelField.value,
          images: imagesPayload.length ? imagesPayload : null,
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
            updateRunState("已上传图片");
            var names = (payload.images || []).map(function (img) { return img.name || "image"; }).join(", ");
            appendCard(agentMsg, {
              kind: "run",
              title: "Uploaded " + (payload.images || []).length + " image(s)",
              meta: "",
              detail: names,
              paths: [],
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
            setMessageBody(agentMsg, "错误: " + (payload.content || "unknown"), false);
          } else if (payload.type === "done" && !reply) {
            finalizeThoughtCard(agentMsg);
            setMessageBody(agentMsg, "(完成，状态: " + (payload.status || "unknown") + ")", false);
          } else if (payload.type === "done") {
            finalizeThoughtCard(agentMsg);
          }
        }
      }
    } catch (err) {
      setMessageBody(agentMsg, "无法连接 Agent 服务 (" + apiBase + ")。请先启动 Ai-agent/run.sh", false);
    } finally {
      setBusy(false);
    }
  }

  sendBtn.onclick = sendMessage;
  pickImageBtn.onclick = function () { imageInput.click(); };
  imageInput.addEventListener("change", function (e) {
    handleImageSelection(e.target.files);
  });
  inputField.addEventListener("keydown", function (e) {
    if (e.key === "Enter") sendMessage();
  });
  loadModelOptions();
})();
