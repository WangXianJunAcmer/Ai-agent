(function () {
  var script = document.currentScript;
  var apiBase = (script && script.getAttribute("data-api-base")) || "http://127.0.0.1:8765";
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
    #ai-agent-messages {
      flex: 1; overflow-y: auto; padding: 18px; background: #f8fafc;
    }
    .ai-agent-msg { margin-bottom: 14px; }
    .ai-agent-msg .role { font-weight: 700; margin-bottom: 6px; font-size: 14px; }
    .ai-agent-msg.user .role { color: #334155; }
    .ai-agent-msg.agent .role { color: #4f46e5; }
    .ai-agent-msg.system .role { color: #b45309; }
    .ai-agent-msg pre {
      margin: 0; white-space: pre-wrap; word-break: break-word;
      font: inherit; color: #0f172a; background: #fff; border: 1px solid #dbe3ee;
      border-radius: 12px; padding: 12px 14px; line-height: 1.7;
    }
    .ai-agent-msg.user pre { background: #f8fafc; border-color: #cbd5e1; }
    .ai-agent-msg.agent pre { background: #eef2ff; border-color: #c7d2fe; color: #1e1b4b; }
    .ai-agent-msg.system pre { background: #fff7ed; border-color: #fed7aa; color: #9a3412; }
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
        <div id="ai-agent-compose">
          <input id="ai-agent-input" type="text" placeholder="输入你的需求" />
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
  modelField.value = defaultModel;

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

  function appendMessage(role, text, className) {
    var msg = document.createElement("div");
    msg.className = "ai-agent-msg " + (className || role.toLowerCase());
    msg.innerHTML = '<div class="role">' + role + '</div><pre></pre>';
    msg.querySelector("pre").textContent = text;
    messagesDiv.appendChild(msg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return msg;
  }

  function setBusy(busy) {
    sendBtn.disabled = busy;
    inputField.disabled = busy;
    modelField.disabled = busy;
  }

  async function sendMessage() {
    var text = inputField.value.trim();
    if (!text) return;

    appendMessage("You", text, "user");
    inputField.value = "";
    setBusy(true);

    var agentMsg = appendMessage("Agent", "思考中...", "agent");
    var agentPre = agentMsg.querySelector("pre");
    var reply = "";

    try {
      var res = await fetch(apiBase + "/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionId || null, model: modelField.value }),
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

          if (payload.type === "text") {
            reply += payload.content || "";
            agentPre.textContent = reply || "…";
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
          } else if (payload.type === "error") {
            agentPre.textContent = "错误: " + (payload.content || "unknown");
          } else if (payload.type === "done" && !reply) {
            agentPre.textContent = "(完成，状态: " + (payload.status || "unknown") + ")";
          }
        }
      }
    } catch (err) {
      agentPre.textContent = "无法连接 Agent 服务 (" + apiBase + ")。请先启动 Ai-agent/run.sh";
    } finally {
      setBusy(false);
    }
  }

  sendBtn.onclick = sendMessage;
  inputField.addEventListener("keydown", function (e) {
    if (e.key === "Enter") sendMessage();
  });
})();
