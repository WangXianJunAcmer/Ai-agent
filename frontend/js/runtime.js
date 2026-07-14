/* ai-agent frontend/js/runtime.js */
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
        wrap.innerHTML = '<span class="ai-agent-file-icon" aria-hidden="true"></span><div class="meta"><span class="name"></span><span class="kind"></span></div><button type="button" title="移除">×</button>';
        fillFileVisual(wrap.querySelector(".ai-agent-file-icon"), wrap.querySelector(".name"), wrap.querySelector(".kind"), item.name, item.mime_type);
      }
      wrap.querySelector("button").onclick = function () {
        revokeFilePreviews([item]);
        pendingFiles = pendingFiles.filter(function (x) { return x !== item; });
        renderAttachmentPreview();
      };
      attachmentsDiv.appendChild(wrap);
    });
    updateComposerButtons();
  }

  function removeQueueItem(id, revokeFiles) {
    var kept = [];
    sendQueue.forEach(function (item) {
      if (item.id !== id) {
        kept.push(item);
        return;
      }
      if (revokeFiles) {
        revokeFilePreviews(item.files);
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
    if (item.model) {
      setSelectedModel(item.model, false);
    }
    pendingFiles = item.files.slice();
    removeQueueItem(item.id, false);
    updateModeUI();
    renderAttachmentPreview();
    inputField.focus();
  }

  function queueIcon(name) {
    if (name === "copy") {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"></path></svg>';
    }
    if (name === "edit") {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
    }
    if (name === "send") {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
  }

  function renderQueue() {
    queueDiv.innerHTML = "";
    if (!sendQueue.length) {
      queueDiv.classList.remove("has-items", "is-collapsed");
      updateEmptyState();
      return;
    }
    queueDiv.classList.add("has-items");
    queueDiv.classList.toggle("is-collapsed", queueCollapsed);
    updateEmptyState();

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "ai-agent-queue-toggle";
    toggle.setAttribute("aria-expanded", queueCollapsed ? "false" : "true");
    toggle.innerHTML = '<span class="ai-agent-queue-chevron" aria-hidden="true"></span><span class="ai-agent-queue-count"></span>';
    toggle.querySelector(".ai-agent-queue-count").textContent =
      sendQueue.length + (sendQueue.length === 1 ? " Queued" : " Queued");
    toggle.onclick = function () {
      queueCollapsed = !queueCollapsed;
      renderQueue();
    };

    var list = document.createElement("div");
    list.className = "ai-agent-queue-list";

    sendQueue.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "ai-agent-queue-item";

      var dot = document.createElement("span");
      dot.className = "ai-agent-queue-dot";
      dot.setAttribute("aria-hidden", "true");

      var textBtn = document.createElement("button");
      textBtn.type = "button";
      textBtn.className = "ai-agent-queue-text";
      var label = item.text || (item.files.length ? "(" + item.files.length + " 个附件)" : "(空消息)");
      textBtn.textContent = label;
      textBtn.title = label;
      textBtn.onclick = function () { editQueueItem(item); };

      var actions = document.createElement("div");
      actions.className = "ai-agent-queue-actions";

      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.title = "编辑";
      editBtn.innerHTML = queueIcon("edit");
      editBtn.onclick = function () { editQueueItem(item); };

      var sendNowBtn = document.createElement("button");
      sendNowBtn.type = "button";
      sendNowBtn.className = "send-now";
      sendNowBtn.title = "立即发送";
      sendNowBtn.innerHTML = queueIcon("send");
      sendNowBtn.onclick = function () { interruptAndSend(item); };

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "delete";
      deleteBtn.title = "删除";
      deleteBtn.innerHTML = queueIcon("delete");
      deleteBtn.onclick = function () { removeQueueItem(item.id, true); };

      actions.appendChild(editBtn);
      actions.appendChild(sendNowBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(dot);
      row.appendChild(textBtn);
      row.appendChild(actions);
      list.appendChild(row);
    });

    queueDiv.appendChild(toggle);
    queueDiv.appendChild(list);
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

  function guessImageMime(name, mime) {
    if (mime && mime.indexOf("image/") === 0) return mime;
    var lower = String(name || "").toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".bmp")) return "image/bmp";
    if (lower.endsWith(".svg")) return "image/svg+xml";
    return mime || "application/octet-stream";
  }

  function fileTypeInfo(name, mime) {
    var m = guessImageMime(name, mime || "");
    var lower = String(name || "").toLowerCase();
    var dot = lower.lastIndexOf(".");
    var ext = dot >= 0 ? lower.slice(dot) : "";
    if (m.indexOf("image/") === 0) return { key: "image", label: "图片", color: "#10a37f" };
    if (ext === ".pdf" || m === "application/pdf") return { key: "pdf", label: "PDF", color: "#e74c3c" };
    if (ext === ".doc" || ext === ".docx" || m.indexOf("word") >= 0) return { key: "word", label: "Word", color: "#2b579a" };
    if (ext === ".xls" || ext === ".xlsx" || m.indexOf("spreadsheet") >= 0 || m.indexOf("excel") >= 0) return { key: "excel", label: "Excel", color: "#217346" };
    if (ext === ".ppt" || ext === ".pptx" || m.indexOf("presentation") >= 0) return { key: "ppt", label: "PPT", color: "#d24726" };
    if (ext === ".csv" || m === "text/csv") return { key: "csv", label: "CSV", color: "#217346" };
    if (ext === ".py" || m.indexOf("python") >= 0) return { key: "python", label: "Python", color: "#3572a5" };
    if (ext === ".md" || ext === ".markdown") return { key: "md", label: "Markdown", color: "#6b6b6b" };
    if (ext === ".json" || m === "application/json") return { key: "json", label: "JSON", color: "#6b6b6b" };
    if (ext === ".zip" || ext === ".rar" || ext === ".7z") return { key: "archive", label: "ZIP", color: "#6b6b6b" };
    if (ext === ".txt" || m === "text/plain") return { key: "text", label: "TXT", color: "#6b6b6b" };
    if (ext) return { key: "file", label: ext.slice(1).toUpperCase(), color: "#6b6b6b" };
    return { key: "file", label: "文件", color: "#6b6b6b" };
  }

  function paintFileIcon(el, info) {
    if (!el) return;
    el.className = "ai-agent-file-icon is-" + info.key;
    el.style.background = info.color;
    el.textContent = info.label;
  }

  function fillFileVisual(iconEl, nameEl, _kindEl, name, mime) {
    var info = fileTypeInfo(name, mime);
    paintFileIcon(iconEl, info);
    if (nameEl) nameEl.textContent = name || "file";
  }

  function appendFileChip(container, name, mime) {
    var info = fileTypeInfo(name, mime);
    var chip = document.createElement("div");
    chip.className = "ai-agent-file-chip";
    chip.setAttribute("data-file-key", info.key);
    chip.setAttribute("data-mime", mime || "");
    var icon = document.createElement("span");
    paintFileIcon(icon, info);
    var label = document.createElement("span");
    label.className = "name";
    label.textContent = name || "file";
    chip.appendChild(icon);
    chip.appendChild(label);
    container.appendChild(chip);
    return chip;
  }

  async function handleFileSelection(files) {
    var list = Array.from(files || []);
    var skipped = [];
    for (var i = 0; i < list.length; i++) {
      var file = list[i];
      if (file.size > MAX_ATTACHMENT_BYTES) {
        skipped.push(file.name || "file");
        continue;
      }
      var data = await readFileAsBase64(file);
      var mime = guessImageMime(file.name, file.type || "");
      var isImage = mime.indexOf("image/") === 0;
      pendingFiles.push({
        kind: isImage ? "image" : "file",
        name: file.name,
        mime_type: mime,
        data: data,
        previewUrl: isImage ? URL.createObjectURL(file) : "",
      });
    }
    if (skipped.length) {
      alert("以下文件超过 10MB 已跳过：\n" + skipped.join("\n"));
    }
    renderAttachmentPreview();
    fileInput.value = "";
  }

  function clearPendingFiles(revokeUrls) {
    if (revokeUrls !== false) {
      revokeFilePreviews(pendingFiles);
    }
    pendingFiles = [];
    renderAttachmentPreview();
  }

  function splitUploadPayload(files) {
    var images = [];
    var filesOnly = [];
    (files || []).forEach(function (item) {
      var mime = guessImageMime(item.name, item.mime_type || "");
      var payload = { name: item.name, mime_type: mime, data: item.data };
      if (mime.indexOf("image/") === 0) images.push(payload);
      else filesOnly.push(payload);
    });
    return { images: images, files: filesOnly };
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
    // Backend already rewrites context-overflow; only decorate raw transport errors.
    if (msg.indexOf("上下文已超限") >= 0) return msg;
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

  function composeHasDraft() {
    return !!(inputField.value.trim() || pendingFiles.length);
  }

  function updateComposerButtons() {
    // ponytail: stop only when compose is empty — typing while streaming queues via send
    var showStop = !!isRunning && !composeHasDraft();
    sendBtn.classList.toggle("hidden", showStop);
    stopBtn.classList.toggle("visible", showStop);
    sendBtn.title = isRunning && !showStop ? "加入队列" : "发送";
    sendBtn.classList.toggle("is-queue", !!isRunning && !showStop);
  }

  function updateRunState(text) {
    var base;
    if (text) {
      base = text;
    } else if (isRunning) {
      var agents = threadDiv.querySelectorAll(".ai-agent-msg.agent");
      var msg = agents.length ? agents[agents.length - 1] : null;
      var core = currentActivityTitle(msg);
      base = sendQueue.length ? (core + " · 队列 " + sendQueue.length) : core;
    } else {
      base = sendQueue.length ? ("就绪 · 队列 " + sendQueue.length) : "就绪";
    }
    runState.textContent = base;
    runState.classList.toggle("is-busy", !!isRunning || /Thinking|Running|Explor|Planning|中/.test(String(base)));
    updateComposerButtons();
  }

  function updateModeUI() {
    var isPlan = modeField.value === "plan";
    composeShell.classList.toggle("mode-plan", isPlan);
    if (editingUserMsg) {
      inputField.placeholder = "添加后续消息";
      return;
    }
    inputField.placeholder = isPlan
      ? "描述你想先规划的问题"
      : "给 Ai-agent 发送消息";
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
    queueCollapsed = false;
    inputField.value = "";
    autosizeInput();
    pendingFiles = [];
    renderAttachmentPreview();
    renderQueue();
    updateRunState(isRunning ? "处理中" : "就绪");
    return item;
  }

  function clearStoppedAgentOutput() {
    if (!stoppedAgentMsg) return;
    if (stoppedAgentMsg.parentNode) stoppedAgentMsg.remove();
    stoppedAgentMsg = null;
    scheduleSaveChatHistory();
  }

  async function runOne(item) {
    // Manual ■ stop kept the incomplete reply visible; next send drops it.
    clearStoppedAgentOutput();
    var label = item.text || (item.files.length ? "(附件)" : "");
    appendMessage("You", label, "user", false, item.files);
    var uploadPayload = splitUploadPayload(item.files);
    var agentMsg = appendMessage("Agent", "", "agent", true);
    if ((item.model || "") === "auto") {
      autoResolvedModel = "";
      autoResolvedLabel = "";
      syncModelPickerUI();
    }
    notePlanning(agentMsg, "");
    var state = { reply: "", finished: false };
    flushChatHistory({ streaming: true });

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
          images: uploadPayload.images.length ? uploadPayload.images : null,
          files: uploadPayload.files.length ? uploadPayload.files : null,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("HTTP " + res.status);
      }

      await consumeAgentSse(res, agentMsg, state, controller.signal);
      if (!state.finished) {
        // 长工具/思考静默时浏览器或代理可能先掐断 SSE；后端 pump 仍可能写完 live_events。
        // 清空气泡后整段 /follow replay，避免半截 reply + sealedReplyLen 把正文封死。
        if (sessionId && threadDiv.contains(agentMsg) && !stopRequested) {
          delete agentMsg.__runMeta;
          var wl = agentMsg.querySelector(".ai-agent-worklog");
          if (wl) wl.innerHTML = "";
          Array.prototype.slice.call(
            agentMsg.querySelectorAll(".ai-agent-segment-text, .ai-agent-msg-main > .body")
          ).forEach(function (el) { el.remove(); });
          state.reply = "";
          state.finished = false;
          try {
            var followCtrl = new AbortController();
            activeAbort = followCtrl;
            var followRes = await fetch(apiBase + "/api/chat/follow", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: followCtrl.signal,
              body: JSON.stringify({ session_id: sessionId || null }),
            });
            if (followRes.ok && followRes.body) {
              await consumeAgentSse(followRes, agentMsg, state, followCtrl.signal);
            }
          } catch (followErr) {
            if (followErr && followErr.name === "AbortError" && stopRequested) throw followErr;
          } finally {
            if (activeAbort === followCtrl) activeAbort = null;
          }
        }
        finalizeLiveCards(agentMsg);
        paintEnsuredReply(agentMsg, state.reply, true);
      }
    } catch (err) {
      if (err && err.name === "AbortError") {
        // Keep whatever was already streamed; no "(已终止)/(已中断)" body text.
        // New-chat may have already detached this node — don't revive it.
        if (threadDiv.contains(agentMsg)) {
          finalizeLiveCards(agentMsg);
          paintEnsuredReply(agentMsg, state.reply, true);
        }
        if (stopRequested) {
          // Remember for cleanup on the next send; queue-↑ interrupt keeps it.
          if (threadDiv.contains(agentMsg)) stoppedAgentMsg = agentMsg;
          updateRunState("就绪");
          updateEmptyState();
          // Only explicit ■ stop cancels the backend. Refresh must leave the pump running.
          await requestCancel();
        } else {
          // Refresh/leave: sync streaming=true while isRunning is still true.
          flushChatHistory({ streaming: true });
        }
      } else if (isSoftNetworkError(err) && threadDiv.contains(agentMsg)) {
        // 长静默导致 fetch 抛错：后端可能仍在跑，跟未 finished 一样走 follow 重放。
        finalizeLiveCards(agentMsg);
        if (sessionId && !stopRequested && !state.finished) {
          try {
            delete agentMsg.__runMeta;
            var softWl = agentMsg.querySelector(".ai-agent-worklog");
            if (softWl) softWl.innerHTML = "";
            Array.prototype.slice.call(
              agentMsg.querySelectorAll(".ai-agent-segment-text, .ai-agent-msg-main > .body")
            ).forEach(function (el) { el.remove(); });
            state.reply = "";
            state.finished = false;
            var softCtrl = new AbortController();
            activeAbort = softCtrl;
            var softRes = await fetch(apiBase + "/api/chat/follow", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: softCtrl.signal,
              body: JSON.stringify({ session_id: sessionId || null }),
            });
            if (softRes.ok && softRes.body) {
              await consumeAgentSse(softRes, agentMsg, state, softCtrl.signal);
            }
          } catch (softErr) {
            if (softErr && softErr.name === "AbortError" && stopRequested) {
              /* stop handled below via drainQueue */
            }
          } finally {
            if (activeAbort === softCtrl) activeAbort = null;
          }
        }
        finalizeLiveCards(agentMsg);
        paintEnsuredReply(agentMsg, state.reply, true);
        if (!state.finished && !(state.reply && state.reply.trim())) {
          streamStandaloneText(
            agentMsg,
            "连接中断，请刷新继续接收，或重新发送。",
            false
          );
        }
      } else {
        finalizeLiveCards(agentMsg);
        var detail = formatAgentError((err && err.message) ? err.message : String(err));
        streamStandaloneText(
          agentMsg,
          "请求失败 (" + apiBase + "): " + detail + "。请确认已用 python start.py 或 ./run.sh 启动服务（默认 http://127.0.0.1:8765）。",
          false
        );
      }
    } finally {
      if (activeAbort === controller) activeAbort = null;
      // Keep blob preview URLs — thread thumbs still reference them until navigation.
      scheduleSaveChatHistory();
    }
  }

  function applyStreamPayload(agentMsg, payload, state) {
    if (payload.session_id) {
      sessionId = payload.session_id;
      localStorage.setItem("ai-agent-session-id", sessionId);
      if (isRunning) flushChatHistory({ streaming: true });
    }

    if (payload.resolved_model || payload.type === "model_resolved") {
      applyResolvedModel(payload);
    }

    if (payload.type === "text") {
      state.reply += payload.content || "";
      var textMeta = getRunMeta(agentMsg);
      var pendingChunk = state.reply.slice(Math.max(textMeta.sealedReplyLen, textMeta.interimSkipLen || 0));
      // Full reply OR the post-tool slice may be a status fragment.
      if (isInterimReplyText(state.reply) || isInterimReplyText(pendingChunk)) {
        scrubInterimSegments(agentMsg);
        textMeta.interimSkipLen = state.reply.length;
        updateRunState(currentActivityTitle(agentMsg));
        finalizePlanCard(agentMsg);
        finalizeThoughtCard(agentMsg);
        noteWorking(agentMsg, currentActivityTitle(agentMsg));
        scrollToBottom(false);
      } else {
        if (textMeta.interimSkipLen) {
          textMeta.sealedReplyLen = Math.max(textMeta.sealedReplyLen, textMeta.interimSkipLen);
          textMeta.interimSkipLen = 0;
        }
        // Keep topbar on live tool (Running/Exploring), not a fake「回复中».
        updateRunState(currentActivityTitle(agentMsg));
        streamTimelineText(agentMsg, state.reply, true);
        noteWorking(agentMsg, currentActivityTitle(agentMsg));
        scrollToBottom(false);
      }
      scheduleSaveChatHistory();
    } else if (payload.type === "planning") {
      rememberActivity(agentMsg, "Planning next moves");
      updateRunState(currentActivityTitle(agentMsg));
      beginToolSegment(agentMsg);
      notePlanning(agentMsg, payload.content || "");
      scheduleSaveChatHistory();
    } else if (payload.type === "upload") {
      rememberActivity(agentMsg, "Uploaded attachments");
      updateRunState("已接收附件");
      beginToolSegment(agentMsg);
      finalizePlanCard(agentMsg);
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
      rememberActivity(agentMsg, "Thinking");
      updateRunState(currentActivityTitle(agentMsg));
      // Don't seal mid-reply when Grok interleaves think↔text (orphans first chars).
      if (payload.completed) {
        finalizeThoughtCard(agentMsg);
      } else {
        if (!getRunMeta(agentMsg).exploreActive && !getRunMeta(agentMsg).activeTextEl) {
          beginToolSegment(agentMsg);
        }
        noteThinking(agentMsg, payload.content || "");
      }
      scheduleSaveChatHistory();
    } else if (payload.type === "tool_call") {
      var summary = payload.summary || {};
      var toolView = buildToolPresentation(payload, summary);
      var toolRunning = payload.status === "running";
      var activityTitle = toolView.title || (toolRunning ? "Running" : "Ran");
      var isExplore = summary.kind === "explore";
      rememberActivity(agentMsg, activityTitle);
      updateRunState(activityTitle);
      // Explore steps must accumulate — don't seal/split the burst on every Grep/Read.
      if (!isExplore || !getRunMeta(agentMsg).exploreActive) beginToolSegment(agentMsg);
      else if (getRunMeta(agentMsg).activeTextEl) beginToolSegment(agentMsg);
      finalizePlanCard(agentMsg);
      if (!(isExplore && getRunMeta(agentMsg).exploreActive)) finalizeThoughtCard(agentMsg);
      if (isExplore) {
        getRunMeta(agentMsg).exploreActive = true;
        noteExploring(agentMsg, exploreStepLabel(payload, toolView), {
          callId: payload.call_id || "",
          running: toolRunning,
          detail: toolView.detail || "",
          paths: summary.paths || [],
        });
      } else {
        finalizeExplorePhase(agentMsg);
        var toolKey = payload.call_id ? ("tool-" + payload.call_id) : "";
        if (!toolKey && !toolRunning) {
          var liveTools = agentMsg.querySelectorAll(".ai-agent-card.is-live");
          for (var li = liveTools.length - 1; li >= 0; li--) {
            var lk = liveTools[li].getAttribute("data-card-key") || "";
            if (
              lk === "think-live" || lk === "plan-live" || lk === "explore-live" ||
              lk === "status-live" || lk.indexOf("explore-step-") === 0
            ) continue;
            toolKey = lk;
            break;
          }
        }
        if (!toolKey) {
          toolKey = "tool-" + (payload.name || "tool") + "-" + Date.now();
        }
        upsertCard(agentMsg, toolKey, {
          kind: summary.kind || "tool",
          title: toolView.title,
          meta: "",
          detail: toolView.detail,
          paths: summary.paths || [],
          diff: summary.diff || [],
          live: toolRunning,
          forceCollapsed: !toolRunning,
        });
      }
      if (toolRunning) {
        noteWorking(agentMsg, activityTitle);
      } else if (!hasOtherLiveCard(agentMsg)) {
        rememberActivity(agentMsg, "Thinking");
        noteWorking(agentMsg, "Thinking");
      } else {
        noteWorking(agentMsg, currentActivityTitle(agentMsg));
      }
      scheduleSaveChatHistory();
    } else if (payload.type === "status") {
      var statusText = payload.content || payload.status || "正在处理";
      if (!isNoisyStatus(statusText)) updateRunState(statusText);
    } else if (payload.type === "task") {
      updateRunState(payload.content || "正在执行任务");
      beginToolSegment(agentMsg);
      finalizePlanCard(agentMsg);
      finalizeStatusCard(agentMsg);
      appendCard(agentMsg, {
        kind: "plan",
        title: payload.content || "Task update",
        meta: "",
        detail: "",
        paths: [],
      });
    } else if (payload.type === "error") {
      state.finished = true;
      finalizeLiveCards(agentMsg);
      var errText = formatAgentError(payload.content || "unknown");
      // 已有正文时，SDK/链路的 network error 只收尾，不再盖一条「错误:」吓用户。
      var hasBody = !!(state.reply && state.reply.trim() && !isInterimReplyText(state.reply));
      var softNet = /network|timeout|failed to fetch|econnreset/i.test(String(payload.content || ""));
      if (hasBody && softNet) {
        paintEnsuredReply(agentMsg, state.reply, true);
      } else {
        streamStandaloneText(agentMsg, "错误: " + errText, false);
      }
      scheduleSaveChatHistory();
    } else if (payload.type === "done") {
      state.finished = true;
      scrubInterimSegments(agentMsg);
      finalizeLiveCards(agentMsg);
      var doneStatus = String(payload.status || "").toLowerCase();
      var doneErr = payload.error || payload.result || "";
      var doneMeta = getRunMeta(agentMsg);
      if (doneMeta.interimSkipLen) {
        doneMeta.sealedReplyLen = Math.max(doneMeta.sealedReplyLen, doneMeta.interimSkipLen);
        doneMeta.interimSkipLen = 0;
      }
      var painted = paintEnsuredReply(agentMsg, state.reply, true);
      if (painted) {
        /* reply painted (incl. sealedReplyLen reset path) */
      } else if (doneStatus === "expired") {
        streamStandaloneText(agentMsg, "（上次回复已中断：服务已重启或会话已过期）", false);
      } else if (doneStatus === "error" || doneStatus === "failed") {
        streamStandaloneText(
          agentMsg,
          "错误: " + formatAgentError(doneErr || "图片或请求处理失败，请重试或开新对话"),
          false
        );
      } else if (doneErr && !agentMsg.querySelector(".ai-agent-segment-text")) {
        streamStandaloneText(agentMsg, doneErr, false);
      } else if (!agentMsg.querySelector(".ai-agent-segment-text")) {
        if (doneStatus !== "finished" && doneStatus !== "cancelled") {
          streamStandaloneText(agentMsg, "(完成，状态: " + (payload.status || "unknown") + ")", false);
        }
      }
      scheduleSaveChatHistory();
    }
  }

  async function consumeAgentSse(res, agentMsg, state, signal) {
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";
    var seen = 0;

    while (true) {
      if (signal && signal.aborted) {
        var abortErr = new Error("Aborted");
        abortErr.name = "AbortError";
        throw abortErr;
      }
      var chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      var parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (var i = 0; i < parts.length; i++) {
        var line = parts[i].trim();
        if (!line.startsWith("data:")) continue;
        var payload;
        try {
          payload = JSON.parse(line.slice(5).trim());
        } catch (parseErr) {
          continue;
        }
        if (payload && payload.type === "heartbeat") continue;
        seen += 1;
        applyStreamPayload(agentMsg, payload, state);
      }
    }
    if (!state.finished) {
      finalizeLiveCards(agentMsg);
      paintEnsuredReply(agentMsg, state.reply, true);
    }
    return { finished: !!state.finished, seen: seen };
  }

  function isSoftNetworkError(err) {
    if (!err || err.name === "AbortError") return false;
    var msg = String(err.message || err || "").toLowerCase();
    return (
      msg.indexOf("network") >= 0
      || msg.indexOf("failed to fetch") >= 0
      || msg.indexOf("load failed") >= 0
      || msg.indexOf("fetch") >= 0
    );
  }

  async function followIfNeeded() {
    // Mid-turn refresh → drop stale last agent bubble, replay live_events.
    // sessionId may be empty; backend find_running_session covers single-user mid-flight.
    if (isRunning) return;
    // Stale streaming=true after a finished turn must not delete the last reply.
    if (sessionId) {
      try {
        var stRes = await fetch(
          apiBase + "/api/chat/status?session_id=" + encodeURIComponent(sessionId)
        );
        var st = stRes.ok ? await stRes.json() : null;
        if (!st || !st.running) {
          flushChatHistory({ streaming: false });
          return;
        }
      } catch (err) {
        // Offline / status failed — still try follow below.
      }
    }
    var agents = threadDiv.querySelectorAll(".ai-agent-msg.agent");
    if (agents.length) agents[agents.length - 1].remove();
    var agentMsg = appendMessage("Agent", "", "agent", true);
    notePlanning(agentMsg, "");
    var state = { reply: "", finished: false };

    isRunning = true;
    stopRequested = false;
    updateRunState("继续接收");
    updateEmptyState();
    flushChatHistory({ streaming: true });

    async function connectOnce() {
      var controller = new AbortController();
      activeAbort = controller;
      try {
        var res = await fetch(apiBase + "/api/chat/follow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ session_id: sessionId || null }),
        });
        if (!res.ok || !res.body) throw new Error("HTTP " + res.status);
        await consumeAgentSse(res, agentMsg, state, controller.signal);
      } finally {
        if (activeAbort === controller) activeAbort = null;
      }
    }

    function paintFollowResult() {
      if (!threadDiv.contains(agentMsg)) return;
      finalizeLiveCards(agentMsg);
      paintEnsuredReply(agentMsg, state.reply, true);
    }

    try {
      await connectOnce();
      if (!state.finished) paintFollowResult();
    } catch (err) {
      if (err && err.name === "AbortError") {
        paintFollowResult();
        if (stopRequested) await requestCancel();
        else flushChatHistory({ streaming: true });
      } else if (isSoftNetworkError(err) && state.reply && state.reply.trim()) {
        // 已收到部分/全部内容后断线：当作成功收尾，不弹「无法继续接收」。
        paintFollowResult();
      } else if (isSoftNetworkError(err)) {
        // 空内容断线：静默重试一次
        try {
          state.reply = "";
          state.finished = false;
          delete agentMsg.__runMeta;
          var wl = agentMsg.querySelector(".ai-agent-worklog");
          if (wl) wl.innerHTML = "";
          Array.prototype.slice.call(agentMsg.querySelectorAll(".ai-agent-segment-text")).forEach(function (el) {
            if (el.parentNode) el.remove();
          });
          notePlanning(agentMsg, "");
          await connectOnce();
          if (!state.finished) paintFollowResult();
        } catch (err2) {
          if (err2 && err2.name === "AbortError") {
            paintFollowResult();
            if (stopRequested) await requestCancel();
            else flushChatHistory({ streaming: true });
          } else if (threadDiv.contains(agentMsg)) {
            paintFollowResult();
            if (!(state.reply && state.reply.trim())) {
              streamStandaloneText(agentMsg, "无法继续接收上次回复，请再刷新一次或重新发送。", false);
            }
          }
        }
      } else if (threadDiv.contains(agentMsg)) {
        paintFollowResult();
        var detail = (err && err.message) ? err.message : String(err);
        streamStandaloneText(agentMsg, "无法继续接收上次回复: " + formatAgentError(detail), false);
      }
    } finally {
      isRunning = false;
      stopRequested = false;
      flushChatHistory({ streaming: false });
      updateRunState("就绪");
      updateEmptyState();
      if (sendQueue.length) drainQueue();
    }
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
    flushChatHistory({ streaming: false });
  }

  function stopConversation() {
    if (!isRunning && !sendQueue.length) return;
    stopRequested = true;
    if (activeAbort) activeAbort.abort();
    requestCancel();
    updateRunState("就绪");
  }

  function requestCancel() {
    if (!sessionId) return Promise.resolve();
    return fetch(apiBase + "/api/chat/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(function () {});
  }

  async function interruptAndSend(item) {
    // Move this item to the front (works for 1st, 2nd, or any queued row).
    sendQueue = sendQueue.filter(function (x) { return x.id !== item.id; });
    sendQueue.unshift(item);
    renderQueue();
    if (isRunning && activeAbort) {
      activeAbort.abort();
      // Wait until backend cancels the SDK run before drainQueue continues.
      await requestCancel();
      return;
    }
    drainQueue();
  }

  function sendMessage() {
    // Bottom composer is independent follow-up — never commits an inline edit.
    var item = enqueueCurrentCompose();
    if (!item) return;
    if (isRunning) {
      renderQueue();
      updateRunState("处理中");
      return;
    }
    drainQueue();
  }

  sendBtn.onclick = sendMessage;
  stopBtn.onclick = stopConversation;
  modelBtn.onclick = function (e) {
    e.stopPropagation();
    if (modelWrap.classList.contains("is-open")) closeModelMenu();
    else openModelMenu();
  };
  modelAutoBtn.onclick = function (e) {
    e.stopPropagation();
    var on = modelAutoBtn.getAttribute("aria-checked") !== "true";
    if (on) setSelectedModel("auto", false);
    else setSelectedModel(lastManualModel || "composer-2.5", false);
  };
  modelMenu.addEventListener("click", function (e) { e.stopPropagation(); });
  document.addEventListener("click", function (e) {
    if (modelWrap.classList.contains("is-open")) {
      if (!modelWrap.contains(e.target)) closeModelMenu();
    }
    if (!editingUserMsg) return;
    var editWrap = editingUserMsg.querySelector(".ai-agent-edit-model-wrap");
    if (editWrap && editWrap.classList.contains("is-open") && !editWrap.contains(e.target)) {
      closeEditModelMenu(editingUserMsg);
    }
    // Click outside this bubble → restore original message style (ad-plex).
    if (!editingUserMsg.contains(e.target)) {
      leaveEditMode();
      updateComposerButtons();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    closeModelMenu();
    if (editingUserMsg) {
      var editWrap = editingUserMsg.querySelector(".ai-agent-edit-model-wrap.is-open");
      if (editWrap) {
        closeEditModelMenu(editingUserMsg);
        return;
      }
      leaveEditMode();
      updateComposerButtons();
    }
  });
  window.__aiAgentSetModel = function (id) {
    setSelectedModel(id, false);
  };
  syncModelPickerUI();
  modeField.onchange = function () {
    updateModeUI();
  };
  pickFileBtn.onclick = function () { fileInput.click(); };
  fileInput.addEventListener("change", function (e) {
    handleFileSelection(e.target.files);
  });
  function autosizeInput() {
    inputField.style.height = "auto";
    inputField.style.height = Math.min(inputField.scrollHeight, 140) + "px";
  }
  inputField.addEventListener("input", function () {
    autosizeInput();
    updateComposerButtons();
  });
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
    var cancelSid = sessionId;
    stopRequested = true;
    if (activeAbort) activeAbort.abort();
    if (cancelSid) {
      fetch(apiBase + "/api/chat/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: cancelSid }),
      }).catch(function () {});
    }
    sendQueue.forEach(function (item) {
      revokeFilePreviews(item.files);
    });
    sendQueue = [];
    clearPendingFiles(true);
    renderQueue();
    sessionId = "";
    localStorage.removeItem("ai-agent-session-id");
    clearChatHistory();
    stoppedAgentMsg = null;
    leaveEditMode();
    clearThreadMessages();
    isRunning = false;
    stopRequested = false;
    updateEmptyState();
    updateRunState("就绪");
    // Abort is async — a late stream chunk must not leave empty greeting hidden.
    requestAnimationFrame(updateEmptyState);
  };
  // History already restored right after panel open; finish UI + follow only.
  loadModelOptions();
  updateModeUI();
  (function maybeFollow() {
    // BOOT_ID: process instance uuid. After restart, in-memory sessions are gone —
    // mismatch vs localStorage bootId → drop session/follow, keep message history.
    fetch(apiBase + "/api/health")
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (health) {
        var boot = health && health.boot_id ? String(health.boot_id) : "";
        if (boot) {
          var prev = serverBootId || "";
          if (prev && prev !== boot) {
            sessionId = "";
            try { localStorage.removeItem("ai-agent-session-id"); } catch (err) {}
            bootRestoredStreaming = false;
            serverBootId = boot;
            flushChatHistory({ streaming: false });
            updateRunState("就绪");
            return;
          }
          serverBootId = boot;
          if (!prev) flushChatHistory({ streaming: !!bootRestoredStreaming });
        }
        if (bootRestoredStreaming) {
          followIfNeeded();
          return;
        }
        if (!sessionId) return;
        return fetch(apiBase + "/api/chat/status?session_id=" + encodeURIComponent(sessionId))
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data && data.running) followIfNeeded();
          });
      })
      .catch(function () {
        // Offline: keep restored UI; follow on next successful health.
        if (bootRestoredStreaming) followIfNeeded();
      });
  })();
  function persistUnloadState() {
    // Force streaming while a turn is in flight — drainQueue may clear isRunning mid-unload.
    flushChatHistory({ streaming: !!(isRunning || activeAbort) });
    try {
      localStorage.setItem(SIDEBAR_OPEN_KEY, sidebar.classList.contains("open") ? "1" : "0");
      localStorage.setItem(SIDEBAR_FULLSCREEN_KEY, isFullscreen() ? "1" : "0");
    } catch (err) {}
  }
  window.addEventListener("pagehide", persistUnloadState);
  window.addEventListener("beforeunload", persistUnloadState);

  // ponytail: table self-check — ?mdcheck=1 on host page
  if (/\bmdcheck=1\b/.test(String(location.search || ""))) {
    var mdSample = [
      "今天累计",
      "",
      "| 指标 | 数值 |",
      "",
      "|------|------|",
      "",
      "| 消费 | 4,843.95 |",
      "",
      "**结论**：ROAS 0.76",
      "",
      "```python",
      "def hello():",
      "    return 1",
      "```",
      "",
      "```cpp",
      "#include <vector>",
      "void dfs(int u) { vis[u] = true; }",
      "```",
      "",
      "```143:161:src/demo.cpp",
      "Node* rotateLeft(Node* x) { return x; }",
      "```",
    ].join("\n");
    var mdOut = renderMarkdown(mdSample);
    var pyOk = mdOut.indexOf("tok-kw") >= 0 && mdOut.indexOf("def") >= 0;
    var cppOk = mdOut.indexOf("tok-pp") >= 0 || mdOut.indexOf("tok-type") >= 0;
    var citeOk = mdOut.indexOf("src/demo.cpp") >= 0 && mdOut.indexOf("143:161:src") < 0;
    var copyOk = mdOut.indexOf("ai-agent-codeblock-copy") >= 0 && mdOut.indexOf("ai-agent-codeblock-lang") >= 0;
    if (mdOut.indexOf("<table") < 0 || mdOut.indexOf("<strong>结论</strong>") < 0 || !pyOk || !cppOk || !citeOk || !copyOk) {
      console.error("Ai-agent markdown self-check failed", mdOut);
    } else {
      console.log("Ai-agent markdown self-check ok");
    }
  }

  // ponytail: ?editcheck=1 — inline edit mirrors bottom toolbar; bottom stays follow-up only.
  if (/\beditcheck=1\b/.test(String(location.search || ""))) {
    var stageSource = editUserMessage.toString();
    var sendSource = sendMessage.toString();
    var commitSource = commitInlineEdit.toString();
    var stageIsSafe = stageSource.indexOf("truncateThreadFrom") < 0
      && stageSource.indexOf("inputField.value") < 0
      && stageSource.indexOf("ai-agent-edit-shell") >= 0
      && stageSource.indexOf("ai-agent-edit-mode") >= 0
      && stageSource.indexOf("ai-agent-edit-model-wrap") >= 0
      && stageSource.indexOf("ai-agent-edit-pick") >= 0;
    var bottomIsFollowUp = sendSource.indexOf("truncateThreadFrom") < 0;
    var commitOk = commitSource.indexOf("truncateThreadFrom(msg)") >= 0;
    if (!stageIsSafe || !bottomIsFollowUp || !commitOk) {
      console.error("Ai-agent staged edit self-check failed");
    } else {
      console.log("Ai-agent staged edit self-check ok");
    }
  }
})();
