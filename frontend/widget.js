(function () {
  var script = document.currentScript;
  var apiBase = (script && script.getAttribute("data-api-base")) || "http://127.0.0.1:8765";
  var sessionId = localStorage.getItem("ai-agent-session-id") || "";

  var styles = `
    #ai-agent-trigger {
      position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px;
      background: #4f46e5; color: #fff; border-radius: 50%; display: flex;
      align-items: center; justify-content: center; cursor: pointer;
      box-shadow: 0 8px 24px rgba(79,70,229,.35); z-index: 2147483000;
      font: 600 14px/1 system-ui, sans-serif; user-select: none;
    }
    #ai-agent-sidebar {
      position: fixed; top: 0; right: -420px; width: 420px; height: 100%;
      background: #fff; box-shadow: -8px 0 32px rgba(15,23,42,.12);
      z-index: 2147483001; transition: right .25s ease; display: flex;
      flex-direction: column; font: 14px/1.5 system-ui, sans-serif; color: #0f172a;
    }
    #ai-agent-sidebar.open { right: 0; }
    #ai-agent-header {
      padding: 16px 18px; background: #4f46e5; color: #fff;
      display: flex; justify-content: space-between; align-items: center;
    }
    #ai-agent-header strong { font-size: 15px; }
    #ai-agent-close { cursor: pointer; font-size: 22px; line-height: 1; opacity: .9; }
    #ai-agent-messages {
      flex: 1; overflow-y: auto; padding: 16px; background: #f8fafc;
    }
    .ai-agent-msg { margin-bottom: 12px; }
    .ai-agent-msg .role { font-weight: 600; margin-bottom: 4px; }
    .ai-agent-msg.user .role { color: #334155; }
    .ai-agent-msg.agent .role { color: #4f46e5; }
    .ai-agent-msg.system .role { color: #b45309; }
    .ai-agent-msg pre {
      margin: 0; white-space: pre-wrap; word-break: break-word;
      font: inherit; background: #fff; border: 1px solid #e2e8f0;
      border-radius: 8px; padding: 10px 12px;
    }
    #ai-agent-footer {
      padding: 12px; border-top: 1px solid #e2e8f0; display: flex; gap: 8px; background: #fff;
    }
    #ai-agent-input {
      flex: 1; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none;
    }
    #ai-agent-send {
      padding: 10px 14px; background: #4f46e5; color: #fff; border: none;
      border-radius: 8px; cursor: pointer; font-weight: 600;
    }
    #ai-agent-send:disabled { opacity: .6; cursor: not-allowed; }
  `;

  var styleEl = document.createElement("style");
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  var container = document.createElement("div");
  container.innerHTML = `
    <div id="ai-agent-trigger" title="AI Agent">AI</div>
    <div id="ai-agent-sidebar">
      <div id="ai-agent-header">
        <strong>Dev Agent</strong>
        <span id="ai-agent-close" title="Close">×</span>
      </div>
      <div id="ai-agent-messages"></div>
      <div id="ai-agent-footer">
        <input id="ai-agent-input" type="text" placeholder="例如：看一下项目结构，帮我加个接口..." />
        <button id="ai-agent-send">发送</button>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  var trigger = document.getElementById("ai-agent-trigger");
  var sidebar = document.getElementById("ai-agent-sidebar");
  var closeBtn = document.getElementById("ai-agent-close");
  var sendBtn = document.getElementById("ai-agent-send");
  var inputField = document.getElementById("ai-agent-input");
  var messagesDiv = document.getElementById("ai-agent-messages");

  trigger.onclick = function () { sidebar.classList.add("open"); };
  closeBtn.onclick = function () { sidebar.classList.remove("open"); };

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
        body: JSON.stringify({ message: text, session_id: sessionId || null }),
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
