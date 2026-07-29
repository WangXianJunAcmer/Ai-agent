/* coding-agent frontend/js/runtime.js */
  function renderAttachmentPreview() {
    attachmentsDiv.innerHTML = "";
    pendingFiles.forEach(function (item) {
      var wrap = document.createElement("div");
      if (item.kind === "image") {
        wrap.className = "coding-agent-thumb";
        wrap.innerHTML = '<img alt="" /><button type="button" title="移除">×</button>';
        wrap.querySelector("img").src = item.previewUrl;
      } else {
        wrap.className = "coding-agent-thumb file";
        wrap.innerHTML = '<span class="coding-agent-file-icon" aria-hidden="true"></span><div class="meta"><span class="name"></span><span class="kind"></span></div><button type="button" title="移除">×</button>';
        fillFileVisual(wrap.querySelector(".coding-agent-file-icon"), wrap.querySelector(".name"), wrap.querySelector(".kind"), item.name, item.mime_type);
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
    toggle.className = "coding-agent-queue-toggle";
    toggle.setAttribute("aria-expanded", queueCollapsed ? "false" : "true");
    toggle.innerHTML = '<span class="coding-agent-queue-chevron" aria-hidden="true"></span><span class="coding-agent-queue-count"></span>';
    toggle.querySelector(".coding-agent-queue-count").textContent = sendQueue.length + " Queued";
    toggle.onclick = function () {
      queueCollapsed = !queueCollapsed;
      renderQueue();
    };

    var list = document.createElement("div");
    list.className = "coding-agent-queue-list";

    sendQueue.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "coding-agent-queue-item";

      var dot = document.createElement("span");
      dot.className = "coding-agent-queue-dot";
      dot.setAttribute("aria-hidden", "true");

      var textBtn = document.createElement("button");
      textBtn.type = "button";
      textBtn.className = "coding-agent-queue-text";
      var label = item.text || (item.files.length ? "(" + item.files.length + " 个附件)" : "(空消息)");
      textBtn.textContent = label;
      textBtn.title = label;
      textBtn.onclick = function () { editQueueItem(item); };

      var actions = document.createElement("div");
      actions.className = "coding-agent-queue-actions";

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
    el.className = "coding-agent-file-icon is-" + info.key;
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
    chip.className = "coding-agent-file-chip";
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

  function filesFromClipboardData(data) {
    // Clipboard screenshot / OS file paste → File list for handleFileSelection.
    // Browsers often expose the same image via both data.files and data.items;
    // dedupe by size/type/name (object identity alone is not enough).
    if (!data) return [];
    var out = [];
    var seen = new Set();
    function fileKey(file) {
      return [
        file.name || "",
        file.size || 0,
        file.type || "",
        file.lastModified || 0,
      ].join("|");
    }
    function pushFile(file) {
      if (!file) return;
      var key = fileKey(file);
      if (seen.has(key)) return;
      seen.add(key);
      if (file.name) {
        out.push(file);
        return;
      }
      // Screenshots often arrive unnamed; invent a stable extension from MIME.
      var mime = file.type || "application/octet-stream";
      var ext = (mime.split("/")[1] || "bin").split(";")[0] || "bin";
      if (ext === "jpeg") ext = "jpg";
      out.push(new File([file], "paste-" + Date.now() + "-" + out.length + "." + ext, { type: mime }));
    }
    if (data.files && data.files.length) {
      Array.prototype.forEach.call(data.files, pushFile);
      return out;
    }
    var items = data.items || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind !== "file") continue;
      pushFile(items[i].getAsFile());
    }
    return out;
  }

  async function ingestSelectedFiles(fileList, targetArray) {
    var list = Array.from(fileList || []);
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
      targetArray.push({
        kind: isImage ? "image" : "file",
        name: file.name || (isImage ? "paste-image.png" : "paste-file"),
        mime_type: mime,
        data: data,
        previewUrl: isImage ? URL.createObjectURL(file) : "",
      });
    }
    if (skipped.length) {
      alert("以下文件超过 50MB 已跳过：\n" + skipped.join("\n"));
    }
  }

  async function handleFileSelection(files) {
    await ingestSelectedFiles(files, pendingFiles);
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
    var showStop = (!!isRunning || !!pendingFollow) && !composeHasDraft();
    sendBtn.classList.toggle("hidden", showStop);
    stopBtn.classList.toggle("visible", showStop);
    sendBtn.title = (isRunning || pendingFollow) && !showStop ? "加入队列" : "发送";
    sendBtn.classList.toggle("is-queue", !!(isRunning || pendingFollow) && !showStop);
  }

  function formatElapsed(ms) {
    var sec = Math.max(0, Math.floor(ms / 1000));
    if (sec < 60) return sec + "s";
    var min = Math.floor(sec / 60);
    var rem = sec % 60;
    return min + "m" + (rem < 10 ? "0" : "") + rem + "s";
  }

  function stopRunElapsedTimer() {
    if (runElapsedTimer) {
      clearInterval(runElapsedTimer);
      runElapsedTimer = null;
    }
    runStartedAt = 0;
  }

  function ensureQuietThinkingHint() {
    if (!isRunning || stopRequested) return;
    var agents = threadDiv.querySelectorAll(".coding-agent-msg.agent");
    var msg = agents.length ? agents[agents.length - 1] : null;
    if (!msg || !threadDiv.contains(msg)) return;
    // Already have a live tool/think/plan/explore card — nothing to fill.
    if (typeof hasOtherLiveCard === "function" && hasOtherLiveCard(msg)) return;
    var statusLive = msg.querySelector('.coding-agent-card.is-live[data-card-key="status-live"]');
    var thinkLive = msg.querySelector('.coding-agent-card.is-live[data-card-key="think-live"]');
    var planLive = msg.querySelector('.coding-agent-card.is-live[data-card-key="plan-live"]');
    if (statusLive || thinkLive || planLive) return;
    rememberActivity(msg, "Thinking");
    noteWorking(msg, "Thinking");
  }

  function startRunElapsedTimer() {
    stopRunElapsedTimer();
    runStartedAt = Date.now();
    runElapsedTimer = setInterval(function () {
      if (!isRunning) {
        stopRunElapsedTimer();
        return;
      }
      ensureQuietThinkingHint();
      updateRunState();
    }, 1000);
  }

  function updateRunState(text) {
    var base;
    if (text) {
      base = text;
    } else if (isRunning) {
      var agents = threadDiv.querySelectorAll(".coding-agent-msg.agent");
      var msg = agents.length ? agents[agents.length - 1] : null;
      var core = currentActivityTitle(msg);
      base = sendQueue.length ? (core + " · 队列 " + sendQueue.length) : core;
    } else {
      base = sendQueue.length ? ("就绪 · 队列 " + sendQueue.length) : "就绪";
    }
    // Strip prior elapsed suffix then re-attach while running.
    base = String(base || "").replace(/\s·\s*\d+m?\d*s\s*$/, "").trim();
    if (isRunning && runStartedAt) {
      base = base + " · " + formatElapsed(Date.now() - runStartedAt);
    }
    var busy = !!isRunning || /Thinking|Running|Explor|Planning|中/.test(String(base));
    var nodes = document.querySelectorAll(".coding-agent-run-state");
    if (nodes && nodes.length) {
      Array.prototype.forEach.call(nodes, function (el) {
        el.textContent = base;
        el.classList.toggle("is-busy", busy);
      });
    } else if (runState) {
      runState.textContent = base;
      runState.classList.toggle("is-busy", busy);
    }
    syncNavRunningState();
    updateComposerButtons();
  }

  function syncNavRunningState() {
    var rows = document.querySelectorAll(".coding-agent-nav-item");
    Array.prototype.forEach.call(rows, function (row) {
      var id = row.dataset ? row.dataset.convId : "";
      var busy = typeof isConversationBusy === "function"
        ? isConversationBusy(id)
        : (row.classList.contains("is-active") && !!(isRunning || pendingFollow));
      row.classList.toggle("is-running", !!busy);
    });
  }

  function updateModeUI() {
    var isPlan = modeField.value === "plan";
    composeShell.classList.toggle("mode-plan", isPlan);
    if (editingUserMsg) {
      inputField.placeholder = "添加后续消息";
      return;
    }
    var selected = modelField.value || defaultModel;
    var target = selected === "auto" ? "自动选择的模型" : modelLabelFor(selected);
    inputField.placeholder = isPlan
      ? "让 " + target + " 先规划这个问题"
      : "给 " + target + " 发送消息";
  }

  function enqueueCurrentCompose() {
    var text = inputField.value.trim();
    if (!text && !pendingFiles.length) return null;
    if (text) pushInputHistory(text);
    var item = {
      id: "q-" + (++queueSeq),
      text: text,
      model: modelField.value,
      mode: modeField.value,
      // thinking read at send time in runOne — queue may wait while user toggles.
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
    var runGen = sessionGeneration;
    var runConvId = activeConversationId;
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
    var state = { reply: "", finished: false, gen: runGen, convId: runConvId, sessionId: sessionId || "", eventCursor: 0 };
    if (typeof markRunSlotBusy === "function" && runConvId != null) {
      markRunSlotBusy(runConvId, true, state.sessionId || sessionId);
      if (typeof getRunSlot === "function") getRunSlot(runConvId).eventCursor = 0;
    }
    flushChatHistory({ streaming: true, convId: runConvId });

    var controller = new AbortController();
    activeAbort = controller;
    try {
      var think = deepseekThinkOpts();
      var res = await apiFetch(apiBase + "/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: item.text || (item.files.length ? "请查看我上传的附件。" : ""),
          session_id: sessionId || null,
          model: item.model,
          mode: item.mode || "agent",
          provider: provider,
          workspace: activeWorkspaceRoot || null,
          thinking: think.thinking,
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
          try {
            var followCtrl = new AbortController();
            activeAbort = followCtrl;
            await fetchFollowReplay(agentMsg, state, followCtrl.signal);
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
        var detached = runGen !== sessionGeneration;
        // Keep whatever was already streamed; no "(已终止)/(已中断)" body text.
        // New-chat may have already detached this node — don't revive it.
        if (!detached && threadDiv.contains(agentMsg)) {
          finalizeLiveCards(agentMsg);
          paintEnsuredReply(agentMsg, state.reply, true);
        }
        if (stopRequested && !detached) {
          // Remember for cleanup on the next send; queue-↑ interrupt keeps it.
          if (threadDiv.contains(agentMsg)) stoppedAgentMsg = agentMsg;
          updateRunState("就绪");
          updateEmptyState();
          // Only explicit ■ stop cancels the backend. Refresh must leave the pump running.
          await requestCancel();
          if (typeof markRunSlotBusy === "function" && runConvId != null) {
            markRunSlotBusy(runConvId, false);
          }
        } else if (detached) {
          // Switched chats: keep parked slot session — do NOT pass global sessionId.
          if (typeof markRunSlotBusy === "function" && runConvId != null) {
            markRunSlotBusy(runConvId, true);
          }
        } else {
          // Refresh/leave: sync streaming=true while isRunning is still true.
          flushChatHistory({ streaming: true, convId: runConvId });
          if (typeof markRunSlotBusy === "function" && runConvId != null) {
            markRunSlotBusy(runConvId, true, state.sessionId || sessionId);
          }
        }
      } else if (isSoftNetworkError(err) && threadDiv.contains(agentMsg)) {
        // 长静默导致 fetch 抛错：后端可能仍在跑，跟未 finished 一样走 follow 重放。
        finalizeLiveCards(agentMsg);
        if (sessionId && !stopRequested && !state.finished) {
          try {
            var softCtrl = new AbortController();
            activeAbort = softCtrl;
            await fetchFollowReplay(agentMsg, state, softCtrl.signal);
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
      if (runGen === sessionGeneration) {
        // Force streaming:false so auto-title can run (isRunning may still be true
        // until drainQueue's finally — a bare scheduleSave would keep pending=true).
        scheduleSaveChatHistory({ convId: runConvId, streaming: false });
      }
    }
  }

  function appendNoticeCard(agentMsg, text) {
    finalizePlanCard(agentMsg);
    var notice = String(text || "").trim();
    if (!notice || !agentMsg) return;
    beginToolSegment(agentMsg);
    appendCard(agentMsg, {
      kind: "run",
      title: notice,
      meta: "",
      detail: "",
      paths: [],
      live: false,
      forceCollapsed: true,
    });
  }

  function applyStreamPayload(agentMsg, payload, state) {
    // New-chat bumps sessionGeneration — ignore late chunks from the aborted stream.
    if (state && state.gen != null && state.gen !== sessionGeneration) return;
    if (payload.session_id) {
      sessionId = payload.session_id;
      localStorage.setItem(sessionStorageKey, sessionId);
      if (state) state.sessionId = payload.session_id;
      var streamConvId = (state && state.convId != null) ? state.convId : activeConversationId;
      if (typeof markRunSlotBusy === "function" && streamConvId != null) {
        markRunSlotBusy(streamConvId, true, payload.session_id);
      }
      if (isRunning && state && state.gen === sessionGeneration) {
        flushChatHistory({ streaming: true, convId: streamConvId });
      }
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
        // Real prose mid-explore ⇒ seal Explored in place, then text BELOW it.
        // (Never beginToolSegment+relocate — that parked Explored under the text.)
        if (textMeta.exploreActive) {
          var splitAt = Math.max(textMeta.sealedReplyLen, textMeta.exploreStartReplyLen || 0);
          finalizeExplorePhase(agentMsg);
          var exploreDone = agentMsg.querySelector("[data-card-key^='explore-done-']");
          if (textMeta.activeTextEl && exploreDone &&
              (textMeta.activeTextEl.compareDocumentPosition(exploreDone) & Node.DOCUMENT_POSITION_FOLLOWING)) {
            if (textMeta.activeTextEl.parentNode) textMeta.activeTextEl.remove();
            textMeta.activeTextEl = null;
            textMeta.sealedReplyLen = splitAt;
          } else if (!textMeta.activeTextEl) {
            textMeta.sealedReplyLen = Math.max(textMeta.sealedReplyLen, splitAt);
          }
        }
        // Seal think before prose so the next burst (if any) opens below tools/text.
        finalizeThoughtCard(agentMsg);
        updateRunState(currentActivityTitle(agentMsg));
        streamTimelineText(agentMsg, state.reply, true);
        noteWorking(agentMsg, currentActivityTitle(agentMsg));
        scrollToBottom(false);
      }
      scheduleSaveChatHistory();
    } else if (payload.type === "summary") {
      // Official Cursor SDK: summary-started / summary / summary-completed.
      if (payload.completed) {
        finalizePlanCard(agentMsg);
      } else if (state.finished) {
        // Post-done "summary" (legacy SSH push) must not reopen Planning shimmer.
        appendNoticeCard(agentMsg, payload.summary || payload.content || "");
      } else {
        rememberActivity(agentMsg, "Planning next moves");
        updateRunState(currentActivityTitle(agentMsg));
        // Don't steal Explored under mid-explore text.
        if (getRunMeta(agentMsg).exploreActive) finalizeExplorePhase(agentMsg);
        beginToolSegment(agentMsg);
        notePlanning(agentMsg, payload.summary || payload.content || "");
      }
      scheduleSaveChatHistory();
    } else if (payload.type === "notice") {
      appendNoticeCard(agentMsg, payload.content || payload.summary || "");
      scheduleSaveChatHistory();
    } else if (payload.type === "upload") {
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
      // Upload card is past-tense; quiet model turns need a live Thinking cue
      // or the UI looks frozen on "Uploaded attachments".
      rememberActivity(agentMsg, "Thinking");
      updateRunState("Thinking");
      noteWorking(agentMsg, "Thinking");
    } else if (payload.type === "thinking") {
      // Seal on completed (one burst → one Thought card). Probe showed GPT and
      // Claude both get ~1 thinking-completed per burst; per-word spam was from
      // sealing every thinking-message, which no longer emits completed.
      if (payload.completed) {
        finalizeThoughtCard(agentMsg);
      } else {
        rememberActivity(agentMsg, "Thinking");
        updateRunState(currentActivityTitle(agentMsg));
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
      // Live only: past-tense titles (Ran / Edited…) belong on sealed cards.
      // Putting them in the topbar between tools causes Running→Ran→Running flicker.
      if (toolRunning) {
        rememberActivity(agentMsg, activityTitle);
        updateRunState(activityTitle);
      }
      // Seal Thought once per call_id on first running — not every partial-tool-call
      // (that was splitting think into one card per token / partial).
      var callId = String(payload.call_id || "");
      var runMeta = getRunMeta(agentMsg);
      if (toolRunning) {
        if (!callId || callId !== runMeta.thoughtSealedForCall) {
          finalizeThoughtCard(agentMsg);
          finalizePlanCard(agentMsg);
          runMeta.thoughtSealedForCall = callId || ("inflight-" + runMeta.nextIndex);
        }
      } else {
        // completed: clear seal mark; orphan completed (no prior running) still seals.
        if (callId && callId === runMeta.thoughtSealedForCall) {
          runMeta.thoughtSealedForCall = "";
        } else {
          finalizeThoughtCard(agentMsg);
          runMeta.thoughtSealedForCall = "";
        }
        finalizePlanCard(agentMsg);
      }
      if (isExplore) {
        // First explore: seal only the leading plan paragraph above; later paragraphs
        // stay unsealed and paint under Explored (Cursor order).
        if (!getRunMeta(agentMsg).exploreActive) {
          beginToolSegment(agentMsg, { peelPlan: true });
          getRunMeta(agentMsg).exploreStartReplyLen = getRunMeta(agentMsg).sealedReplyLen;
        }
        getRunMeta(agentMsg).exploreActive = true;
        noteExploring(agentMsg, exploreStepLabel(payload, toolView), {
          callId: payload.call_id || "",
          running: toolRunning,
          detail: toolView.detail || "",
          paths: summary.paths || [],
        });
      } else {
        if (getRunMeta(agentMsg).exploreActive) finalizeExplorePhase(agentMsg);
        // Flush conclusions that were peeled / arrived during explore — under Explored.
        streamTimelineText(agentMsg, state.reply, true);
        beginToolSegment(agentMsg);
        var toolKey = resolveToolCardKey(agentMsg, payload, toolRunning, summary, toolView);
        upsertCard(agentMsg, toolKey, {
          kind: toolView.kind || summary.kind || "tool",
          title: toolView.title,
          meta: "",
          detail: toolView.detail,
          paths: summary.paths || [],
          diff: summary.diff || [],
          status: summary.status || "",
          additions: summary.additions,
          deletions: summary.deletions,
          live: toolRunning,
          forceCollapsed: !toolRunning,
        });
      }
      if (toolRunning) {
        noteWorking(agentMsg, activityTitle);
      } else if (!hasOtherLiveCard(agentMsg)) {
        rememberActivity(agentMsg, "Thinking");
        updateRunState("Thinking");
        noteWorking(agentMsg, "Thinking");
      } else {
        var keepTitle = currentActivityTitle(agentMsg);
        rememberActivity(agentMsg, keepTitle);
        updateRunState(keepTitle);
        noteWorking(agentMsg, keepTitle);
      }
      scheduleSaveChatHistory();
    } else if (payload.type === "tool_approval") {
      updateRunState("等待确认危险命令");
      rememberActivity(agentMsg, "Waiting for approval");
      var cmd = String(payload.command || "");
      var reason = String(payload.reason || "该命令可能造成不可逆破坏");
      var ask = typeof window.showConfirmDialog === "function"
        ? window.showConfirmDialog
        : function (opts) { return Promise.resolve(window.confirm((opts && opts.message) || "")); };
      ask({
        title: "危险命令确认",
        message: reason + (cmd ? ("\n\n" + cmd) : ""),
        okText: "允许执行",
        cancelText: "拒绝",
        danger: true,
      }).then(function (ok) {
        return apiFetch(apiBase + "/api/chat/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: payload.session_id || sessionId || state.sessionId || "",
            call_id: payload.call_id || "",
            approve: !!ok,
          }),
        });
      }).catch(function () {});
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
    } else if (payload.type === "turn_changes") {
      renderTurnChanges(agentMsg, payload);
      getRunMeta(agentMsg).turnChangesShown = true;
      scheduleSaveChatHistory();
      if (typeof openPathsFromTurnChanges === "function") {
        openPathsFromTurnChanges(payload);
      }
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
        // Keep any restored reply; never replace it with an interruption notice.
        if (!state.hadRestoredAgent && !(state.reply && state.reply.trim())) {
          // Empty mid-flight with no restore — leave bubble blank.
        }
      } else if (doneStatus === "error" || doneStatus === "failed") {
        // Avoid a second scary line when the error event already painted.
        if (!agentMsg.querySelector(".coding-agent-segment-text")) {
          streamStandaloneText(
            agentMsg,
            "错误: " + formatAgentError(doneErr || "Agent 执行失败，请重试或开新对话"),
            false
          );
        }
      } else if (doneErr && !agentBubbleHasVisibleOutput(agentMsg)) {
        streamStandaloneText(agentMsg, doneErr, false);
      } else if (!agentBubbleHasVisibleOutput(agentMsg)) {
        // finished/cancelled with silent model → never leave a blank AI row.
        var emptyHint = doneStatus === "cancelled"
          ? "（已取消）"
          : "（模型未返回内容。请重试，或换个说法再问一次。）";
        streamStandaloneText(agentMsg, emptyHint, false);
      }
      if (!getRunMeta(agentMsg).turnChangesShown) {
        // Don't clobber a backend undoable panel if done races ahead of turn_changes
        // handling in a buffered flush (data-turn-id means server tracked the turn).
        var existingPanel = agentMsg.querySelector(".coding-agent-turn-changes");
        var existingTurnId = existingPanel && existingPanel.getAttribute("data-turn-id");
        if (existingTurnId) {
          getRunMeta(agentMsg).turnChangesShown = true;
        } else {
          var localChanges = collectLocalTurnChanges(agentMsg);
          if (localChanges) renderTurnChanges(agentMsg, localChanges);
        }
      }
      scheduleSaveChatHistory({ streaming: false });
    }
  }

  async function consumeAgentSse(res, agentMsg, state, signal) {
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";
    if (state && state.eventCursor == null) state.eventCursor = 0;

    function bumpCursor() {
      if (!state) return;
      state.eventCursor = (Number(state.eventCursor) || 0) + 1;
      var cid = state.convId != null ? state.convId : activeConversationId;
      if (cid != null && typeof getRunSlot === "function") {
        try { getRunSlot(cid).eventCursor = state.eventCursor; } catch (e) {}
      }
      if (agentMsg && typeof getRunMeta === "function") {
        getRunMeta(agentMsg).eventCursor = state.eventCursor;
      }
    }

    function applyDataLine(raw) {
      var line = String(raw || "").trim();
      if (!line.startsWith("data:")) return;
      var payload;
      try {
        payload = JSON.parse(line.slice(5).trim());
      } catch (parseErr) {
        return;
      }
      if (payload && payload.type === "heartbeat") return;
      bumpCursor();
      applyStreamPayload(agentMsg, payload, state);
    }

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
        applyDataLine(parts[i]);
      }
    }
    // Final frame may arrive without trailing \n\n — don't drop the done event.
    if (buffer.trim()) applyDataLine(buffer);
    if (!state.finished) {
      finalizeLiveCards(agentMsg);
      paintEnsuredReply(agentMsg, state.reply, true);
    }
    return { finished: !!state.finished, seen: Number(state.eventCursor) || 0 };
  }

  function agentBubbleReplyText(agentMsg) {
    if (!agentMsg) return "";
    var parts = [];
    Array.prototype.slice.call(
      agentMsg.querySelectorAll(".coding-agent-segment-text, .coding-agent-msg-main > .body")
    ).forEach(function (el) {
      if (el.classList.contains("coding-agent-worklog")) return;
      var t = el.getAttribute("data-raw-text") || el.textContent || "";
      if (t) parts.push(t);
    });
    return parts.join("\n\n");
  }

  function followAfterIndex(convId, agentMsg) {
    var after = 0;
    if (convId != null && typeof getRunSlot === "function") {
      try { after = Math.max(after, Number(getRunSlot(convId).eventCursor || 0) || 0); } catch (e) {}
    }
    if (agentMsg && agentMsg.__runMeta && agentMsg.__runMeta.eventCursor != null) {
      after = Math.max(after, Number(agentMsg.__runMeta.eventCursor) || 0);
    }
    return after;
  }

  function isSoftNetworkError(err) {
    if (!err || err.name === "AbortError") return false;
    var msg = String(err.message || err || "").toLowerCase();
    return (
      msg.indexOf("failed to fetch") >= 0
      || msg.indexOf("networkerror") >= 0
      || msg.indexOf("network request failed") >= 0
      || msg.indexOf("load failed") >= 0
      || msg.indexOf("econnreset") >= 0
      || msg.indexOf("etimedout") >= 0
      || msg.indexOf("timeout") >= 0
    );
  }

  function wipeAgentBubbleForReplay(agentMsg, state) {
    finalizeThoughtCard(agentMsg);
    finalizeLiveCards(agentMsg);
    delete agentMsg.__runMeta;
    var wl = agentMsg.querySelector(".coding-agent-worklog");
    if (wl) wl.innerHTML = "";
    Array.prototype.slice.call(
      agentMsg.querySelectorAll(".coding-agent-segment-text, .coding-agent-msg-main > .body")
    ).forEach(function (el) { el.remove(); });
    state.reply = "";
    state.finished = false;
  }

  async function fetchFollowReplay(agentMsg, state, signal) {
    wipeAgentBubbleForReplay(agentMsg, state);
    if (state) state.eventCursor = 0;
    if (state && state.convId != null && typeof getRunSlot === "function") {
      try { getRunSlot(state.convId).eventCursor = 0; } catch (e) {}
    }
    var res = await apiFetch(apiBase + "/api/chat/follow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: signal,
      body: JSON.stringify({ session_id: sessionId || null, after: 0 }),
    });
    if (res.ok && res.body) {
      await consumeAgentSse(res, agentMsg, state, signal);
    }
    return res;
  }

  async function followIfNeeded() {
    // Mid-turn refresh / chat switch → continue live_events from eventCursor (not from 0).
    // sessionId may be empty; backend find_running_session covers single-user mid-flight.
    if (isRunning && !pendingFollow) return;
    var followGen = sessionGeneration;
    var followConvId = activeConversationId;
    // Stale streaming=true after a finished turn must not delete the last reply.
    if (sessionId) {
      try {
        var stRes = await apiFetch(
          apiBase + "/api/chat/status?session_id=" + encodeURIComponent(sessionId)
        );
        var st = stRes.ok ? await stRes.json() : null;
        // Still running → follow live. Finished but events remain → one-shot replay
        // (covers "left chat / refreshed while pump finished in background").
        if (st && st.ok && !st.running && !(st.events > 0)) {
          if (followGen !== sessionGeneration) return;
          pendingFollow = false;
          isRunning = false;
          stopRunElapsedTimer();
          var agentsIdle = threadDiv.querySelectorAll(".coding-agent-msg.agent");
          if (agentsIdle.length) {
            var lastIdle = agentsIdle[agentsIdle.length - 1];
            finalizeLiveCards(lastIdle);
            paintEnsuredReply(lastIdle, "", true);
          }
          flushChatHistory({ streaming: false });
          if (typeof markRunSlotBusy === "function" && followConvId != null) {
            markRunSlotBusy(followConvId, false);
          }
          updateRunState("就绪");
          updateComposerButtons();
          syncNavRunningState();
          return;
        }
        if (!st || (!st.running && !(st.events > 0))) {
          // Unknown session — keep going to follow; backend may return expired/done.
        }
      } catch (err) {
        // Offline / status failed — still try follow below.
      }
    }
    if (followGen !== sessionGeneration) return;
    var agents = threadDiv.querySelectorAll(".coding-agent-msg.agent");
    var agentMsg;
    var hadRestoredAgent = false;
    if (agents.length) {
      // Reuse restored bubble — do NOT delete it first (expired follow used to wipe the reply).
      agentMsg = agents[agents.length - 1];
      hadRestoredAgent = !!(
        agentMsg.querySelector(".coding-agent-segment-text")
        || agentMsg.querySelector(".coding-agent-worklog .coding-agent-card")
        || (agentMsg.textContent || "").replace(/\s+/g, "").length > 2
      );
    } else {
      agentMsg = appendMessage("Agent", "", "agent", true);
      notePlanning(agentMsg, "");
    }
    var afterIdx = followAfterIndex(followConvId, agentMsg);
    var state = {
      reply: "",
      finished: false,
      gen: followGen,
      convId: followConvId,
      sessionId: sessionId || "",
      hadRestoredAgent: hadRestoredAgent,
      eventCursor: afterIdx,
    };
    // Resume from saved DOM: seed reply/cursor so new events append instead of replaying.
    if (hadRestoredAgent && afterIdx > 0) {
      state.reply = agentBubbleReplyText(agentMsg);
      if (typeof getRunMeta === "function") {
        var resumeMeta = getRunMeta(agentMsg);
        resumeMeta.sealedReplyLen = Math.max(
          Number(resumeMeta.sealedReplyLen || 0) || 0,
          state.reply.length
        );
        resumeMeta.eventCursor = afterIdx;
      }
      finalizeThoughtCard(agentMsg);
      finalizeLiveCards(agentMsg);
    } else if (hadRestoredAgent && afterIdx <= 0) {
      // Cursor unknown (older payload / never flushed). Always wipe + replay from 0 —
      // jumping to st.events would skip buffered live_events that never hit the DOM.
      wipeAgentBubbleForReplay(agentMsg, state);
      afterIdx = 0;
      state.eventCursor = 0;
      state.hadRestoredAgent = false;
      hadRestoredAgent = false;
      if (followConvId != null && typeof getRunSlot === "function") {
        try { getRunSlot(followConvId).eventCursor = 0; } catch (e2) {}
      }
    }

    pendingFollow = false;
    isRunning = true;
    stopRequested = false;
    if (typeof markRunSlotBusy === "function" && followConvId != null) {
      markRunSlotBusy(followConvId, true, state.sessionId || sessionId);
      if (typeof getRunSlot === "function") {
        getRunSlot(followConvId).eventCursor = Math.max(
          Number(getRunSlot(followConvId).eventCursor || 0) || 0,
          afterIdx
        );
      }
    }
    startRunElapsedTimer();
    updateRunState("继续接收");
    updateEmptyState();
    flushChatHistory({ streaming: true, convId: followConvId });

    async function connectOnce() {
      var controller = new AbortController();
      activeAbort = controller;
      try {
        var res = await apiFetch(apiBase + "/api/chat/follow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            session_id: sessionId || null,
            after: afterIdx,
          }),
        });
        if (!res.ok || !res.body) throw new Error("HTTP " + res.status);
        await consumeAgentSse(res, agentMsg, state, controller.signal);
      } finally {
        if (activeAbort === controller) activeAbort = null;
      }
    }

    function paintFollowResult() {
      if (followGen !== sessionGeneration) return;
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
        if (followGen !== sessionGeneration) {
          if (typeof markRunSlotBusy === "function" && followConvId != null) {
            markRunSlotBusy(followConvId, true);
          }
        } else if (stopRequested) {
          await requestCancel();
          if (typeof markRunSlotBusy === "function" && followConvId != null) {
            markRunSlotBusy(followConvId, false);
          }
        } else {
          flushChatHistory({ streaming: true, convId: followConvId });
          if (typeof markRunSlotBusy === "function" && followConvId != null) {
            markRunSlotBusy(followConvId, true, state.sessionId || sessionId);
          }
        }
      } else if (isSoftNetworkError(err) && state.reply && state.reply.trim()) {
        // 已收到部分/全部内容后断线：当作成功收尾，不弹「无法继续接收」。
        paintFollowResult();
      } else if (isSoftNetworkError(err)) {
        // 空内容断线：静默重试一次
        try {
          if (followGen !== sessionGeneration) throw err;
          wipeAgentBubbleForReplay(agentMsg, state);
          notePlanning(agentMsg, "");
          await connectOnce();
          if (!state.finished) paintFollowResult();
        } catch (err2) {
          if (err2 && err2.name === "AbortError") {
            paintFollowResult();
            if (followGen !== sessionGeneration) {
              if (typeof markRunSlotBusy === "function" && followConvId != null) {
                markRunSlotBusy(followConvId, true);
              }
            } else if (stopRequested) {
              await requestCancel();
            } else {
              flushChatHistory({ streaming: true, convId: followConvId });
            }
          } else if (followGen === sessionGeneration && threadDiv.contains(agentMsg)) {
            paintFollowResult();
            if (!(state.reply && state.reply.trim())) {
              streamStandaloneText(agentMsg, "无法继续接收上次回复，请再刷新一次或重新发送。", false);
            }
          }
        }
      } else if (followGen === sessionGeneration && threadDiv.contains(agentMsg)) {
        paintFollowResult();
        var detail = (err && err.message) ? err.message : String(err);
        streamStandaloneText(agentMsg, "无法继续接收上次回复: " + formatAgentError(detail), false);
      }
    } finally {
      if (followGen !== sessionGeneration) {
        syncNavRunningState();
        return;
      }
      pendingFollow = false;
      isRunning = false;
      stopRequested = false;
      stopRunElapsedTimer();
      flushChatHistory({ streaming: false, convId: followConvId });
      if (typeof markRunSlotBusy === "function" && followConvId != null) {
        markRunSlotBusy(followConvId, false);
      }
      updateRunState("就绪");
      updateEmptyState();
      syncNavRunningState();
      if (sendQueue.length) drainQueue();
    }
  }

  async function drainQueue() {
    if (isRunning || pendingFollow) return;
    var drainGen = sessionGeneration;
    var drainConvId = activeConversationId;
    isRunning = true;
    stopRequested = false;
    if (typeof markRunSlotBusy === "function" && drainConvId != null) {
      markRunSlotBusy(drainConvId, true, sessionId);
    }
    startRunElapsedTimer();
    updateRunState("处理中");
    while (sendQueue.length) {
      if (stopRequested || drainGen !== sessionGeneration) break;
      // Switched chats mid-queue: stop touching this view.
      if (drainConvId != null && Number(activeConversationId) !== Number(drainConvId)) break;
      var item = sendQueue.shift();
      if (typeof getRunSlot === "function" && drainConvId != null) {
        getRunSlot(drainConvId).sendQueue = sendQueue.slice();
      }
      renderQueue();
      updateRunState("处理中");
      await runOne(item);
      if (stopRequested || drainGen !== sessionGeneration) break;
      if (drainConvId != null && Number(activeConversationId) !== Number(drainConvId)) break;
    }
    if (drainGen !== sessionGeneration
        || (drainConvId != null && Number(activeConversationId) !== Number(drainConvId))) {
      // Detached mid-run: parked slot keeps busy/queue; don't touch the new view.
      syncNavRunningState();
      return;
    }
    isRunning = false;
    stopRequested = false;
    stopRunElapsedTimer();
    updateRunState("就绪");
    flushChatHistory({ streaming: false, convId: drainConvId });
    if (typeof markRunSlotBusy === "function" && drainConvId != null) {
      markRunSlotBusy(drainConvId, false);
    }
    syncNavRunningState();
  }

  function stopConversation() {
    if (!isRunning && !pendingFollow && !sendQueue.length) return;
    stopRequested = true;
    pendingFollow = false;
    if (activeAbort) activeAbort.abort();
    requestCancel();
    if (typeof markRunSlotBusy === "function" && activeConversationId != null) {
      markRunSlotBusy(activeConversationId, false);
    }
    // Keep busy UI until drainQueue/follow finally clears isRunning.
    updateRunState(isRunning ? "正在停止" : "就绪");
    updateComposerButtons();
    syncNavRunningState();
  }

  function requestCancel() {
    if (!sessionId) return Promise.resolve();
    return apiFetch(apiBase + "/api/chat/cancel", {
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
    // Bottom composer is independent follow-up — leave inline edit, don't commit it.
    if (editingUserMsg) leaveEditMode();
    var item = enqueueCurrentCompose();
    if (!item) return;
    var startGen = sessionGeneration;
    var start = function () {
      if (startGen !== sessionGeneration && !conversationSwitching) {
        // Generation bumped by an unrelated detach; if switch finished and this is
        // still the active chat queue, continue.
      }
      if (typeof conversationSwitching !== "undefined" && conversationSwitching) {
        if (typeof whenConversationReady === "function") {
          whenConversationReady().then(function () {
            if (isRunning || pendingFollow) {
              renderQueue();
              updateRunState("处理中");
              return;
            }
            drainQueue();
          });
          return;
        }
      }
      if (isRunning || pendingFollow) {
        renderQueue();
        updateRunState("处理中");
        return;
      }
      drainQueue();
    };
    var kick = function () {
      if (!activeConversationId && typeof ensureConversationId === "function") {
        ensureConversationId().then(function (id) {
          if (id == null) return;
          start();
        }).catch(start);
        return;
      }
      start();
    };
    if (typeof whenConversationReady === "function") {
      whenConversationReady().then(kick).catch(kick);
      return;
    }
    kick();
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
    var editWrap = editingUserMsg.querySelector(".coding-agent-edit-model-wrap");
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
      var editWrap = editingUserMsg.querySelector(".coding-agent-edit-model-wrap.is-open");
      if (editWrap) {
        closeEditModelMenu(editingUserMsg);
        return;
      }
      leaveEditMode();
      updateComposerButtons();
    }
  });
  window.__caSetModel = function (id) {
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

  // Shell-like ↑/↓ through previously sent prompts (per provider, localStorage).
  var INPUT_HISTORY_KEY = "coding-agent-input-history:" + provider;
  var INPUT_HISTORY_MAX = 500;
  var inputHistory = [];
  var inputHistoryIndex = -1; // -1 = live draft; 0 = newest sent
  var inputHistoryDraft = "";
  (function loadInputHistory() {
    try {
      var raw = localStorage.getItem(INPUT_HISTORY_KEY) || "";
      var arr = raw ? JSON.parse(raw) : [];
      inputHistory = Array.isArray(arr)
        ? arr.filter(function (s) { return typeof s === "string" && s.trim(); }).slice(0, INPUT_HISTORY_MAX)
        : [];
    } catch (err) {
      inputHistory = [];
    }
  })();

  function saveInputHistory() {
    try {
      localStorage.setItem(INPUT_HISTORY_KEY, JSON.stringify(inputHistory.slice(0, INPUT_HISTORY_MAX)));
    } catch (err) {}
  }

  function pushInputHistory(text) {
    var t = String(text || "").trim();
    if (!t) return;
    if (inputHistory[0] === t) {
      inputHistoryIndex = -1;
      inputHistoryDraft = "";
      return;
    }
    inputHistory = [t].concat(inputHistory.filter(function (s) { return s !== t; })).slice(0, INPUT_HISTORY_MAX);
    saveInputHistory();
    inputHistoryIndex = -1;
    inputHistoryDraft = "";
  }

  function caretAtFirstLine() {
    var start = typeof inputField.selectionStart === "number" ? inputField.selectionStart : 0;
    return (inputField.value || "").slice(0, start).indexOf("\n") < 0;
  }

  function caretAtLastLine() {
    var start = typeof inputField.selectionStart === "number" ? inputField.selectionStart : 0;
    return (inputField.value || "").slice(start).indexOf("\n") < 0;
  }

  function applyInputHistory(idx) {
    inputHistoryIndex = idx;
    inputField.value = idx < 0 ? inputHistoryDraft : (inputHistory[idx] || "");
    autosizeInput();
    updateComposerButtons();
    var len = inputField.value.length;
    inputField.setSelectionRange(len, len);
  }

  inputField.addEventListener("input", function () {
    if (inputHistoryIndex >= 0) {
      // Edited a recalled entry → treat as new draft.
      inputHistoryIndex = -1;
      inputHistoryDraft = "";
    }
    autosizeInput();
    updateComposerButtons();
  });
  inputField.addEventListener("paste", function (e) {
    var files = filesFromClipboardData(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    handleFileSelection(files).then(updateComposerButtons);
  });
  inputField.addEventListener("keydown", function (e) {
    if (typeof window.__caSlashMenuOpen === "function" && window.__caSlashMenuOpen()) {
      if (e.key === "Enter" || e.key === "Tab" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Escape") {
        return;
      }
    }
    if (e.key === "ArrowUp") {
      if (!inputHistory.length) return;
      if (inputHistoryIndex < 0 && !caretAtFirstLine()) return;
      e.preventDefault();
      if (inputHistoryIndex < 0) {
        inputHistoryDraft = inputField.value;
        applyInputHistory(0);
      } else if (inputHistoryIndex < inputHistory.length - 1) {
        applyInputHistory(inputHistoryIndex + 1);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      if (inputHistoryIndex < 0) return;
      if (!caretAtLastLine()) return;
      e.preventDefault();
      if (inputHistoryIndex <= 0) applyInputHistory(-1);
      else applyInputHistory(inputHistoryIndex - 1);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  newChatBtn.onclick = function () {
    if (typeof openNewAgentFlow === "function") {
      openNewAgentFlow();
      return;
    }
    if (typeof startNewConversationUi === "function") {
      startNewConversationUi(false);
      return;
    }
    // Fallback: park current run in background (do not cancel backend).
    if (typeof detachActiveConversation === "function") {
      detachActiveConversation({ clearActive: true });
    }
    sessionGeneration += 1;
    stopRequested = false;
    pendingFollow = false;
    if (activeAbort) {
      try { activeAbort.abort(); } catch (err) {}
      activeAbort = null;
    }
    sendQueue.forEach(function (item) {
      revokeFilePreviews(item.files);
    });
    sendQueue = [];
    clearPendingFiles(true);
    renderQueue();
    sessionId = "";
    localStorage.removeItem(sessionStorageKey);
    rememberActiveConversation(null);
    try { localStorage.removeItem(historyStorageKey()); } catch (err) {}
    stoppedAgentMsg = null;
    leaveEditMode();
    clearThreadMessages();
    isRunning = false;
    stopRequested = false;
    stopRunElapsedTimer();
    updateEmptyState();
    updateRunState("就绪");
    requestAnimationFrame(updateEmptyState);
  };
  // Auth + per-user history from server, then follow if needed.
  loadModelOptions();
  updateModeUI();
  (function maybeFollow() {
    function afterHistoryRestore() {
      return apiFetch(apiBase + "/api/health")
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (health) {
          var boot = health && health.boot_id ? String(health.boot_id) : "";
          if (boot) {
            var prev = serverBootId || "";
            if (prev && prev !== boot) {
              sessionId = "";
              try { localStorage.removeItem(sessionStorageKey); } catch (err) {}
              bootRestoredStreaming = false;
              pendingFollow = false;
              isRunning = false;
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
          return apiFetch(apiBase + "/api/chat/status?session_id=" + encodeURIComponent(sessionId))
            .then(function (res) { return res.json(); })
            .then(function (data) {
              if (data && data.running) followIfNeeded();
            });
        })
        .catch(function () {
          if (bootRestoredStreaming) followIfNeeded();
        });
    }

    apiFetch(apiBase + "/api/auth/me")
      .then(function (res) { return res.json(); })
      .then(function (me) {
        setCurrentUser(me && me.user ? me.user : null);
        if (typeof bootstrapConversations === "function") {
          return bootstrapConversations();
        }
        return null;
      })
      .then(function () {
        updateEmptyState();
        if (bootRestoredStreaming) {
          pendingFollow = true;
          isRunning = true;
          updateRunState("继续接收");
        } else if (!threadDiv.querySelector(".coding-agent-msg")) {
          updateRunState("就绪");
        }
        return afterHistoryRestore();
      })
      .catch(function () {
        // Unauthorized redirects inside apiFetch; other errors keep empty UI.
        updateRunState("就绪");
      });
  })();
  function persistUnloadState() {
    // Force streaming while a turn is in flight — drainQueue may clear isRunning mid-unload.
    var busy = !!(isRunning || pendingFollow || activeAbort);
    if (busy && activeConversationId != null && typeof markRunSlotBusy === "function") {
      markRunSlotBusy(activeConversationId, true, sessionId);
    }
    if (activeConversationId != null && typeof parkActiveRunToSlot === "function") {
      parkActiveRunToSlot(activeConversationId);
    }
    flushChatHistory({ streaming: busy, convId: activeConversationId });
    try {
      localStorage.setItem(SIDEBAR_OPEN_KEY, sidebar.classList.contains("open") ? "1" : "0");
      localStorage.setItem(SIDEBAR_FULLSCREEN_KEY, isFullscreen() ? "1" : "0");
    } catch (err) {}
  }
  window.addEventListener("pagehide", persistUnloadState);
  window.addEventListener("beforeunload", persistUnloadState);

  // Poll background chats so sidebar spinners clear when pumps finish (even if tab was away).
  var backgroundRunPollTimer = null;
  function pollBackgroundRunStatuses() {
    var targets = [];
    if (typeof runSlots !== "undefined" && runSlots) {
      Object.keys(runSlots).forEach(function (key) {
        var slot = runSlots[key];
        if (!slot || !slot.busy || !slot.sessionId) return;
        if (key !== "draft" && Number(key) === Number(activeConversationId) && (isRunning || pendingFollow)) {
          return;
        }
        targets.push({ id: key === "draft" ? null : key, sessionId: slot.sessionId });
      });
    }
    (conversationList || []).forEach(function (c) {
      if (!c || !c.streaming || !c.session_id) return;
      if (Number(c.id) === Number(activeConversationId) && (isRunning || pendingFollow)) return;
      // Already noted as finished-with-events awaiting /follow — don't re-poll forever.
      if (typeof getRunSlot === "function") {
        try {
          var parked = getRunSlot(c.id);
          if (parked && parked.pendingFollow && !parked.busy) return;
        } catch (e0) {}
      }
      if (targets.some(function (t) { return Number(t.id) === Number(c.id); })) return;
      targets.push({ id: c.id, sessionId: c.session_id });
    });
    targets.forEach(function (t) {
      apiFetch(apiBase + "/api/chat/status?session_id=" + encodeURIComponent(t.sessionId))
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (st) {
          if (!st || st.running) return;
          var hasEvents = !!(st.ok && st.events > 0);
          // Pump finished: stop spinner. If live_events remain, leave pendingFollow so
          // reopening can one-shot /follow and persist the final reply.
          if (t.id != null && typeof getRunSlot === "function") {
            try {
              var slot = getRunSlot(t.id);
              slot.busy = false;
              if (hasEvents) {
                slot.settled = false;
                slot.pendingFollow = true;
                if (t.sessionId) slot.sessionId = t.sessionId;
              } else if (typeof markRunSlotSettled === "function") {
                markRunSlotSettled(t.id);
              } else {
                slot.settled = true;
                slot.pendingFollow = false;
                slot.eventCursor = 0;
              }
            } catch (e) {
              if (!hasEvents && typeof markRunSlotSettled === "function") {
                markRunSlotSettled(t.id);
              }
            }
          } else if (t.id != null && !hasEvents && typeof markRunSlotSettled === "function") {
            markRunSlotSettled(t.id);
          }
          if (t.id != null && !hasEvents) {
            // Nothing left to replay — clear server streaming so sidebar stays accurate.
            apiFetch(apiBase + "/api/conversations/" + encodeURIComponent(t.id), {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                session_id: t.sessionId || "",
                payload: {
                  _clearStreamingOnly: true,
                  sessionId: t.sessionId || "",
                },
              }),
            })
              .then(function () {
                if (typeof refreshConversationList === "function") return refreshConversationList();
              })
              .catch(function () {});
          } else if (t.id != null && hasEvents) {
            // Keep streaming=true so a full page reload can still /follow and paint
            // the final reply. In-memory slot.busy=false already hides the spinner.
            if (typeof refreshConversationList === "function") refreshConversationList();
          }
          if (typeof renderConversationList === "function") renderConversationList();
          else syncNavRunningState();
        })
        .catch(function () {});
    });
  }
  if (!backgroundRunPollTimer) {
    backgroundRunPollTimer = setInterval(pollBackgroundRunStatuses, 4000);
  }

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
      "using std::vector;",
      "",
      "void dfs(int u, const vector<vector<int>>& graph, vector<bool>& seen) {",
      "  seen[u] = true;",
      "  for (int v : graph[u]) {",
      "    if (!seen[v]) dfs(v, graph, seen);",
      "  }",
      "}",
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
    var copyOk = mdOut.indexOf("coding-agent-codeblock-copy") >= 0 && mdOut.indexOf("coding-agent-codeblock-lang") >= 0;
    // Short sep (-- / :--) must still parse; two same-header tables must both survive collapse.
    var shortSepSample = [
      "| 指标 | 数值 |",
      "| -- | -- |",
      "| 消费 | 1 |",
      "",
      "| 指标 | 数值 |",
      "| :-- | :-- |",
      "| 曝光 | 2 |",
    ].join("\n");
    var shortSepOut = renderMarkdown(shortSepSample);
    var shortSepOk = (shortSepOut.match(/<table/g) || []).length >= 2
      && shortSepOut.indexOf("消费") >= 0
      && shortSepOut.indexOf("曝光") >= 0;
    var twinKeep = collapseRewriteParagraphs(shortSepSample);
    var twinOk = twinKeep.indexOf("| 消费 | 1 |") >= 0 && twinKeep.indexOf("| 曝光 | 2 |") >= 0;
    // Mid-string path fragment must NOT wipe the full path paragraph.
    var pathPrev = "/data1/wangxianjun/projects/ad-analyzer/scripts/run_daily.py";
    var pathTail = "alyzer/scripts/helpers.py\n\n说明";
    var pathKeep = collapseRewriteParagraphs(pathPrev + "\n\n" + pathTail);
    var pathOk = pathKeep.indexOf(pathPrev) >= 0 && pathKeep.indexOf("alyzer/scripts/helpers.py") >= 0;
    // True rewrite (shared prefix) should still collapse.
    var rewriteKeep = collapseRewriteParagraphs("今天的广告数据如下\n\n今天的广告数据如下所示，详见下表。");
    var rewriteOk = rewriteKeep.indexOf("详见下表") >= 0 && rewriteKeep.indexOf("今天的广告数据如下\n\n") < 0;
    var mathSample = [
      "场方程",
      "",
      "\\[",
      "G_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}",
      "\\]",
      "",
      "- 爱因斯坦张量：\\(G_{\\mu\\nu} = R_{\\mu\\nu} - \\frac{1}{2} R g_{\\mu\\nu}\\)",
    ].join("\n");
    var mathExtract = extractMath(mathSample.replace(/```[\s\S]*?```/g, ""));
    var mathOut = renderMarkdown(mathSample);
    var mathOk = mathExtract.slots.length >= 2
      && mathOut.indexOf("\\[") < 0
      && mathOut.indexOf("\\(") < 0
      && (mathOut.indexOf("katex") >= 0 || mathOut.indexOf("coding-agent-math") >= 0 || mathOut.indexOf("%%MATH_") < 0);
    // Inline code must keep `$x$`; unclosed fence still renders as codeblock; soft breaks merge.
    var codeMathOut = renderMarkdown("用 `$E=mc^2$` 表示能量");
    var codeMathOk = codeMathOut.indexOf("<code>") >= 0
      && codeMathOut.indexOf("coding-agent-math") < 0
      && codeMathOut.indexOf("$E=mc^2$") >= 0;
    var openFenceOut = renderMarkdown("```python\ndef f():\n    return 1\n");
    var openFenceOk = openFenceOut.indexOf("coding-agent-codeblock") >= 0 && openFenceOut.indexOf("def") >= 0;
    var softBreakOut = renderMarkdown("第一行\n第二行\n\n第三段");
    var softBreakOk = (softBreakOut.match(/<p>/g) || []).length === 2
      && softBreakOut.indexOf("<br") >= 0;
    var bqOut = renderMarkdown("> a\n> b");
    var bqOk = (bqOut.match(/<blockquote>/g) || []).length === 1 && bqOut.indexOf("<br") >= 0;
    if (
      mdOut.indexOf("<table") < 0 || mdOut.indexOf("<strong>结论</strong>") < 0 ||
      !pyOk || !cppOk || !citeOk || !copyOk || !shortSepOk || !twinOk || !pathOk || !rewriteOk || !mathOk ||
      !codeMathOk || !openFenceOk || !softBreakOk || !bqOk
    ) {
      console.error("Coding Agent markdown self-check failed", {
        table: mdOut.indexOf("<table") >= 0,
        conclusion: mdOut.indexOf("<strong>结论</strong>") >= 0,
        pyOk: pyOk,
        cppOk: cppOk,
        citeOk: citeOk,
        copyOk: copyOk,
        shortSepOk: shortSepOk,
        twinOk: twinOk,
        pathOk: pathOk,
        rewriteOk: rewriteOk,
        mathOk: mathOk,
        codeMathOk: codeMathOk,
        openFenceOk: openFenceOk,
        softBreakOk: softBreakOk,
        bqOk: bqOk,
        mathSlots: mathExtract.slots.length,
        mathOut: mathOut.slice(0, 500),
      });
    } else {
      console.log("Coding Agent markdown self-check ok");
    }
  }

  // ponytail: ?editcheck=1 — inline edit mirrors bottom toolbar; bottom stays follow-up only.
  if (/\beditcheck=1\b/.test(String(location.search || ""))) {
    var stageSource = editUserMessage.toString();
    var sendSource = sendMessage.toString();
    var commitSource = commitInlineEdit.toString();
    var stageIsSafe = stageSource.indexOf("truncateThreadFrom") < 0
      && stageSource.indexOf("inputField.value") < 0
      && stageSource.indexOf("coding-agent-edit-shell") >= 0
      && stageSource.indexOf("coding-agent-edit-mode") >= 0
      && stageSource.indexOf("coding-agent-edit-model-wrap") >= 0
      && stageSource.indexOf("coding-agent-edit-pick") >= 0;
    var bottomIsFollowUp = sendSource.indexOf("truncateThreadFrom") < 0;
    var commitOk = commitSource.indexOf("truncateThreadFrom(msg)") >= 0;
    if (!stageIsSafe || !bottomIsFollowUp || !commitOk) {
      console.error("Coding Agent staged edit self-check failed");
    } else {
      console.log("Coding Agent staged edit self-check ok");
    }
  }
