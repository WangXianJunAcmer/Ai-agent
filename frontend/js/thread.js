/* ai-agent frontend/js/thread.js */
  function setMessageBody(msg, text, renderAsMarkdown) {
    var body = msg.querySelector(".ai-agent-segment-text.body, .body");
    if (!body) {
      var main = msg.querySelector(".ai-agent-msg-main");
      body = document.createElement("div");
      body.className = msg.classList.contains("agent") ? "ai-agent-segment-text body" : "body";
      main.appendChild(body);
    }
    if (!text) {
      body.style.display = "none";
      body.innerHTML = "";
      body.textContent = "";
      body.removeAttribute("data-raw-text");
      scheduleSaveChatHistory();
      return;
    }
    body.style.display = "";
    body.setAttribute("data-raw-text", text);
    if (renderAsMarkdown) {
      body.innerHTML = renderMarkdown(text);
      bindCodeBlockCopy(body);
    } else {
      body.textContent = text;
    }
    scheduleSaveChatHistory();
  }

  function appendMessage(role, text, className, renderAsMarkdown, attachments) {
    var kind = className || role.toLowerCase();
    var msg = document.createElement("div");
    msg.className = "ai-agent-msg " + kind;
    var avatarLabel = kind === "agent" ? "AI" : (kind === "user" ? "你" : "!");
    msg.innerHTML =
      '<div class="ai-agent-avatar">' + avatarLabel + '</div>' +
      '<div class="ai-agent-msg-main"></div>';
    var main = msg.querySelector(".ai-agent-msg-main");
    if (kind === "agent") {
      var worklog = document.createElement("div");
      worklog.className = "ai-agent-worklog";
      main.appendChild(worklog);
    }
    if (text) {
      var body = document.createElement("div");
      body.className = kind === "agent" ? "ai-agent-segment-text body" : "body";
      main.appendChild(body);
      setMessageBody(msg, text, !!renderAsMarkdown);
    } else if (kind !== "agent") {
      var emptyBody = document.createElement("div");
      emptyBody.className = "body";
      main.appendChild(emptyBody);
    }
    var items = attachments || [];
    var images = items.filter(function (item) {
      return item.kind === "image" && (item.previewUrl || item.data);
    });
    var files = items.filter(function (item) {
      // Non-images, or images with neither preview nor base64 payload.
      return item.kind !== "image" || !(item.previewUrl || item.data);
    });
    if (images.length) {
      var gallery = document.createElement("div");
      gallery.className = "ai-agent-msg-images";
      images.forEach(function (item) {
        var img = document.createElement("img");
        img.src = item.previewUrl
          || ("data:" + (item.mime_type || "image/png") + ";base64," + item.data);
        img.alt = item.name || "uploaded image";
        gallery.appendChild(img);
      });
      main.appendChild(gallery);
    }
    if (files.length) {
      var fileRow = document.createElement("div");
      fileRow.className = "ai-agent-msg-files";
      files.forEach(function (item) {
        appendFileChip(fileRow, item.name || "file", item.mime_type || "");
      });
      main.appendChild(fileRow);
    }
    if (kind === "user") {
      msg.__attachments = (attachments || []).map(cloneAttachmentPayload);
      bindUserMessageEdit(msg);
    }
    threadDiv.appendChild(msg);
    updateEmptyState();
    scrollToBottom(true);
    scheduleSaveChatHistory();
    return msg;
  }

  function getRunMeta(msg) {
    if (!msg.__runMeta) {
      msg.__runMeta = {
        nextIndex: 1,
        thinkSeq: 0,
        exploreSeq: 0,
        exploreSteps: [],
        exploreStepKeys: [],
        exploreActive: false,
        thinkingStartedAt: 0,
        thinkingDetail: "",
        thinkingTimer: null,
        planningDetail: "",
        sealedReplyLen: 0,
        interimSkipLen: 0,
        needNewWorklog: false,
        activeTextEl: null,
      };
    }
    return msg.__runMeta;
  }

  function ensureWorklog(msg) {
    var main = msg.querySelector(".ai-agent-msg-main");
    var meta = getRunMeta(msg);
    if (meta.needNewWorklog) {
      meta.needNewWorklog = false;
      var fresh = document.createElement("div");
      fresh.className = "ai-agent-worklog";
      main.appendChild(fresh);
      return fresh;
    }
    var logs = main.querySelectorAll(".ai-agent-worklog");
    if (logs.length) return logs[logs.length - 1];
    var worklog = document.createElement("div");
    worklog.className = "ai-agent-worklog";
    main.appendChild(worklog);
    return worklog;
  }

  function isInterimReplyText(text) {
    var t = String(text || "").trim();
    if (!t) return true;
    if (t.length > 80) return false;
    // Only ephemeral status lines — real openers like "先看一下项目结构…" must
    // enter the timeline immediately, or later Explored keeps updating above them.
    // Bare "正在…" / "读取您上传的…" leak when tools split one status phrase mid-stream.
    if (/^正在(为您)?$/.test(t)) return true;
    if (/^(正在|正在为您)(搜索|查询|获取|联网|处理|分析|读取|查找|查看|打开|解析)/.test(t)) return true;
    if (/^(读取|查看|打开|解析)(您|你)?(上传的)?(文档|文件|附件|图片|内容)/.test(t)) return true;
    if (/^(Searching|Fetching|Looking|Checking|Querying|Reading)\b/i.test(t)) return true;
    if (/^(正在)?(查询|搜索|获取|联网|读取|查看)(中)?[…\.。]*$/.test(t)) return true;
    return false;
  }

  function scrubInterimSegments(msg) {
    // Drop status fragments already painted ("正在" / "读取您上传的文档内容。").
    Array.prototype.slice.call(msg.querySelectorAll(".ai-agent-segment-text")).forEach(function (el) {
      var raw = (el.getAttribute("data-raw-text") || el.textContent || "").trim();
      if (!isInterimReplyText(raw) && !/^正在/.test(raw)) return;
      if (el.parentNode) el.remove();
    });
    var meta = getRunMeta(msg);
    if (meta.activeTextEl && !meta.activeTextEl.parentNode) meta.activeTextEl = null;
  }

  // After assistant text, later tools open a new worklog *below* that text.
  function beginToolSegment(msg) {
    var meta = getRunMeta(msg);
    // Tools often interrupt mid-status ("正在" … later "读取您上传的…") — never seal those.
    scrubInterimSegments(msg);
    if (meta.interimSkipLen) {
      meta.sealedReplyLen = Math.max(meta.sealedReplyLen, meta.interimSkipLen);
      meta.interimSkipLen = 0;
    }
    if (meta.activeTextEl) {
      var raw = (meta.activeTextEl.getAttribute("data-raw-text") || meta.activeTextEl.textContent || "").trim();
      if (isInterimReplyText(raw) || /^正在/.test(raw)) {
        // Cache before remove — __replyEnd on a detached node is unreliable across browsers.
        var interimEnd = meta.activeTextEl.__replyEnd || meta.sealedReplyLen;
        if (meta.activeTextEl.parentNode) meta.activeTextEl.remove();
        meta.sealedReplyLen = Math.max(meta.sealedReplyLen, interimEnd);
        meta.activeTextEl = null;
      }
    }
    if (meta.activeTextEl) {
      meta.sealedReplyLen = Math.max(meta.sealedReplyLen, meta.activeTextEl.__replyEnd || 0);
      meta.activeTextEl = null;
      meta.needNewWorklog = true;
      // Keep Exploring + step rows across the text seal (ad-plex). finalizeExplorePhase
      // only when leaving explore — otherwise each Grep/Read wiped prior steps.
      removeCard(msg, "think-live");
      removeCard(msg, "plan-live");
      removeCard(msg, "status-live");
    }
  }

  // Move live Exploring + its step cards under the new worklog (below sealed text).
  function relocateExploreCards(msg) {
    var meta = getRunMeta(msg);
    if (!meta.needNewWorklog) return;
    var worklog = ensureWorklog(msg);
    var keys = ["explore-live"].concat(meta.exploreStepKeys || []);
    keys.forEach(function (key) {
      var card = cardByKey(msg, key);
      if (card && card.parentNode !== worklog) worklog.appendChild(card);
    });
  }

  function exploreStepLabel(payload, toolView) {
    var title = String((toolView && toolView.title) || "").trim();
    if (title && !/^exploring$/i.test(title)) return title;
    var name = String((payload && payload.name) || "").trim();
    if (name && !/^tool$/i.test(name)) {
      return name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ")
        .replace(/^\w/, function (c) { return c.toUpperCase(); });
    }
    var detail = String((toolView && toolView.detail) || (payload && payload.args) || "").trim();
    if (detail) {
      var line = detail.split("\n")[0].trim();
      return line.length > 72 ? (line.slice(0, 72) + "…") : line;
    }
    return "Searching";
  }

  function streamTimelineText(msg, fullReply, renderAsMarkdown) {
    var meta = getRunMeta(msg);
    finalizePlanCard(msg);
    finalizeThoughtCard(msg);
    // Do NOT finalizeExplorePhase here: early plan text used to wipe Exploring /
    // tool cards and leave a fake busy pulse while Shell/Grep still ran (ad-plex).
    finalizeStatusCard(msg);

    var chunk = fullReply.slice(meta.sealedReplyLen);
    if (!chunk) {
      return meta.activeTextEl;
    }
    var main = msg.querySelector(".ai-agent-msg-main");
    if (!meta.activeTextEl) {
      meta.activeTextEl = document.createElement("div");
      meta.activeTextEl.className = "ai-agent-segment-text body";
      main.appendChild(meta.activeTextEl);
    }
    meta.activeTextEl.__replyEnd = fullReply.length;
    meta.activeTextEl.style.display = "";
    meta.activeTextEl.setAttribute("data-raw-text", chunk);
    if (renderAsMarkdown) {
      meta.activeTextEl.innerHTML = renderMarkdown(chunk);
      bindCodeBlockCopy(meta.activeTextEl);
    } else {
      meta.activeTextEl.textContent = chunk;
    }
    scheduleSaveChatHistory();
    return meta.activeTextEl;
  }

  // SSE 长静默断连时，早先正文可能已被 sealedReplyLen 吃掉；收尾时若气泡无正文，强制重绘。
  function paintEnsuredReply(msg, reply, renderAsMarkdown) {
    if (!msg || !threadDiv.contains(msg)) return null;
    var full = String(reply || "");
    if (!full.trim() || isInterimReplyText(full)) return null;
    var meta = getRunMeta(msg);
    var hasBody = !!msg.querySelector(".ai-agent-segment-text");
    var visible = full.slice(meta.sealedReplyLen || 0).trim();
    if (!visible || isInterimReplyText(visible)) {
      if (hasBody) return meta.activeTextEl;
      // 工具阶段把 sealed 推到全文末尾后断连 → chunk 为空，界面只剩 Thought。回退整段重绘。
      meta.sealedReplyLen = 0;
      meta.interimSkipLen = 0;
      meta.activeTextEl = null;
    }
    return streamTimelineText(msg, full, renderAsMarkdown !== false);
  }

  function streamStandaloneText(msg, text, renderAsMarkdown) {
    // Error / status lines are not part of the cumulative reply — don't slice by sealedReplyLen.
    beginToolSegment(msg);
    var meta = getRunMeta(msg);
    meta.sealedReplyLen = 0;
    meta.activeTextEl = null;
    return streamTimelineText(msg, text, renderAsMarkdown);
  }

  function cloneAttachmentPayload(item) {
    return {
      kind: item.kind || ((item.mime_type || "").indexOf("image/") === 0 ? "image" : "file"),
      name: item.name || "file",
      mime_type: item.mime_type || "",
      data: item.data || "",
      previewUrl: "",
    };
  }

  function attachmentsForResend(files) {
    // Rebuild image preview URLs from base64 so composer thumbs work after edit.
    return (files || []).map(function (item) {
      var copy = cloneAttachmentPayload(item);
      if (!copy.data) return copy;
      if (copy.kind === "image" || (copy.mime_type || "").indexOf("image/") === 0) {
        copy.kind = "image";
        try {
          var bin = atob(copy.data);
          var bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          copy.previewUrl = URL.createObjectURL(new Blob([bytes], { type: copy.mime_type || "image/png" }));
        } catch (err) {
          copy.previewUrl = "";
        }
      }
      return copy;
    }).filter(function (item) {
      // Need payload to resend; name-only restored chips can't go back on the wire.
      return !!item.data;
    });
  }

  function copyUserMessage(msg, btn) {
    var body = msg.querySelector(".body");
    var text = body ? (body.getAttribute("data-raw-text") || body.textContent || "") : "";
    if (!text) return;

    function copied() {
      btn.title = "已复制";
      setTimeout(function () { btn.title = "复制消息"; }, 1200);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(copied).catch(function () {});
      return;
    }
    var input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    try {
      if (document.execCommand("copy")) copied();
    } catch (err) {}
    input.remove();
  }

  function bindUserMessageEdit(msg) {
    if (!msg || !msg.classList.contains("user") || msg.querySelector(".ai-agent-user-actions")) return;
    var main = msg.querySelector(".ai-agent-msg-main");
    if (!main) return;

    var actions = document.createElement("div");
    actions.className = "ai-agent-user-actions";

    var copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "ai-agent-user-action";
    copyBtn.title = "复制消息";
    copyBtn.setAttribute("aria-label", "复制消息");
    copyBtn.innerHTML = queueIcon("copy");
    copyBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      copyUserMessage(msg, copyBtn);
    };

    var editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "ai-agent-user-action is-edit";
    editBtn.title = "编辑消息";
    editBtn.setAttribute("aria-label", "编辑消息");
    editBtn.innerHTML = queueIcon("edit");
    editBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      editUserMessage(msg);
    };

    actions.appendChild(copyBtn);
    actions.appendChild(editBtn);
    main.appendChild(actions);

    // Click the prompt itself to enter edit — Cursor-style, bottom stays independent.
    var body = msg.querySelector(".body");
    if (body && !body.__editClickBound) {
      body.__editClickBound = true;
      body.addEventListener("click", function (e) {
        if (window.getSelection && String(window.getSelection())) {
          var sel = window.getSelection();
          if (sel && !sel.isCollapsed) return;
        }
        e.preventDefault();
        editUserMessage(msg);
      });
    }
  }

  function clearSendQueue(revokeFiles) {
    if (revokeFiles) {
      sendQueue.forEach(function (item) { revokeFilePreviews(item.files); });
    }
    sendQueue = [];
    renderQueue();
  }

  function truncateThreadFrom(msg) {
    var node = msg;
    var doomed = [];
    while (node) {
      doomed.push(node);
      node = node.nextSibling;
    }
    doomed.forEach(function (el) { el.remove(); });
  }

  function autosizeEditTextarea(ta) {
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.max(44, ta.scrollHeight) + "px";
  }

  function leaveEditMode() {
    if (!editingUserMsg) return;
    var msg = editingUserMsg;
    var shell = msg.querySelector(".ai-agent-edit-shell");
    var body = msg.querySelector(".body");
    var original = msg.__editOriginal != null ? msg.__editOriginal : "";
    if (shell && shell.parentNode) shell.parentNode.removeChild(shell);
    if (body) {
      body.style.display = "";
      body.setAttribute("data-raw-text", original);
      body.textContent = original;
    }
    msg.classList.remove("is-editing");
    delete msg.__editOriginal;
    delete msg.__editFiles;
    delete msg.__editMode;
    delete msg.__editModel;
    editingUserMsg = null;
    updateModeUI();
  }

  async function commitInlineEdit() {
    if (!editingUserMsg || !threadDiv.contains(editingUserMsg)) return;
    var msg = editingUserMsg;
    var ta = msg.querySelector(".ai-agent-edit-textarea");
    var modeSel = msg.querySelector(".ai-agent-edit-mode");
    var text = ta ? String(ta.value || "").trim() : "";
    var files = (msg.__editFiles || []).slice();
    if (!text && !files.length) return;

    var item = {
      id: "q-" + (++queueSeq),
      text: text,
      model: msg.__editModel || modelField.value,
      mode: (modeSel && modeSel.value) || msg.__editMode || modeField.value,
      files: files,
    };

    if (isRunning) {
      if (activeAbort) activeAbort.abort();
      await requestCancel();
    }
    sendQueue.forEach(function (queued) { revokeFilePreviews(queued.files); });
    sendQueue = [item];
    editingUserMsg = null;
    truncateThreadFrom(msg);
    stoppedAgentMsg = null;
    sessionId = "";
    try { localStorage.removeItem(sessionStorageKey); } catch (err) {}
    renderQueue();
    updateEmptyState();
    scheduleSaveChatHistory();
    updateModeUI();
    if (!isRunning) drainQueue();
  }

  function closeEditModelMenu(msg) {
    var wrap = msg && msg.querySelector(".ai-agent-edit-model-wrap");
    if (!wrap) return;
    wrap.classList.remove("is-open");
    var btn = wrap.querySelector(".ai-agent-model-btn");
    if (btn) {
      btn.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
    }
  }

  function syncEditModelPicker(msg) {
    if (!msg) return;
    var wrap = msg.querySelector(".ai-agent-edit-model-wrap");
    if (!wrap) return;
    var id = msg.__editModel || defaultModel;
    var isAuto = id === "auto";
    wrap.classList.toggle("is-auto", isAuto);
    var label = wrap.querySelector(".ai-agent-model-label");
    var btn = wrap.querySelector(".ai-agent-model-btn");
    var autoBtn = wrap.querySelector(".ai-agent-model-auto");
    if (label) label.textContent = modelLabelFor(id);
    if (btn) btn.title = modelLabelFor(id);
    if (autoBtn) autoBtn.setAttribute("aria-checked", isAuto ? "true" : "false");
    Array.prototype.forEach.call(wrap.querySelectorAll(".ai-agent-model-option"), function (opt) {
      opt.classList.toggle("is-selected", !isAuto && opt.getAttribute("data-model-id") === id);
    });
  }

  function setEditModel(msg, id, closeMenu) {
    if (!msg) return;
    var next = (id || "").trim() || defaultModel;
    var ids = knownModelIds();
    if (next !== "auto" && modelOptions.length && ids.indexOf(next) < 0) {
      next = ids.indexOf(lastManualModel) >= 0 ? lastManualModel : (ids[0] || defaultModel);
    }
    msg.__editModel = next;
    syncEditModelPicker(msg);
    if (closeMenu !== false) closeEditModelMenu(msg);
  }

  function renderEditModelList(msg) {
    if (!msg) return;
    var list = msg.querySelector(".ai-agent-edit-model-list");
    if (!list) return;
    list.innerHTML = "";
    modelOptions.forEach(function (model) {
      if (!model.id || model.id === "auto") return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ai-agent-model-option";
      btn.setAttribute("data-model-id", model.id);
      btn.setAttribute("role", "option");
      btn.textContent = model.label || model.id;
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        setEditModel(msg, model.id, true);
      });
      list.appendChild(btn);
    });
    syncEditModelPicker(msg);
  }

  function buildEditModelPicker(msg) {
    var wrap = document.createElement("div");
    wrap.className = "ai-agent-edit-model-wrap is-auto";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ai-agent-model-btn";
    btn.title = "模型";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = '<span class="ai-agent-model-label"></span><span class="ai-agent-model-chevron" aria-hidden="true"></span>';
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      closeModelMenu();
      var open = wrap.classList.contains("is-open");
      if (open) closeEditModelMenu(msg);
      else {
        wrap.classList.add("is-open");
        btn.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
        refreshModelOptionsOnce();
      }
    };

    var menu = document.createElement("div");
    menu.className = "ai-agent-model-menu";
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "选择模型");
    menu.addEventListener("click", function (e) { e.stopPropagation(); });

    var autoRow = document.createElement("div");
    autoRow.className = "ai-agent-model-auto-row";
    autoRow.innerHTML =
      '<div class="ai-agent-model-auto-copy">' +
      "<strong>Auto</strong>" +
      "<span>自动选择适合当前任务的模型</span>" +
      "</div>" +
      '<button class="ai-agent-model-auto" type="button" role="switch" aria-checked="false" title="Auto"></button>';
    var autoBtn = autoRow.querySelector(".ai-agent-model-auto");
    autoBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      var on = autoBtn.getAttribute("aria-checked") !== "true";
      setEditModel(msg, on ? "auto" : (lastManualModel || "composer-2.5"), false);
    };

    var list = document.createElement("div");
    list.className = "ai-agent-model-list ai-agent-edit-model-list";

    menu.appendChild(autoRow);
    menu.appendChild(list);
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    return wrap;
  }

  function renderEditAttachments(msg) {
    if (!msg) return;
    var box = msg.querySelector(".ai-agent-edit-attachments");
    if (!box) return;
    box.innerHTML = "";
    (msg.__editFiles || []).forEach(function (item) {
      var wrap = document.createElement("div");
      if (item.kind === "image") {
        wrap.className = "ai-agent-thumb";
        wrap.innerHTML = '<img alt="" /><button type="button" title="移除">×</button>';
        wrap.querySelector("img").src = item.previewUrl || ("data:" + item.mime_type + ";base64," + item.data);
      } else {
        wrap.className = "ai-agent-thumb file";
        wrap.innerHTML = '<span class="ai-agent-file-icon" aria-hidden="true"></span><div class="meta"><span class="name"></span><span class="kind"></span></div><button type="button" title="移除">×</button>';
        fillFileVisual(wrap.querySelector(".ai-agent-file-icon"), wrap.querySelector(".name"), wrap.querySelector(".kind"), item.name, item.mime_type);
      }
      wrap.querySelector("button").onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        revokeFilePreviews([item]);
        msg.__editFiles = (msg.__editFiles || []).filter(function (x) { return x !== item; });
        renderEditAttachments(msg);
      };
      box.appendChild(wrap);
    });
  }

  async function handleEditFileSelection(msg, files) {
    var list = Array.from(files || []);
    for (var i = 0; i < list.length; i++) {
      var file = list[i];
      var data = await readFileAsBase64(file);
      var mime = guessImageMime(file.name, file.type || "");
      var isImage = mime.indexOf("image/") === 0;
      msg.__editFiles = msg.__editFiles || [];
      msg.__editFiles.push({
        kind: isImage ? "image" : "file",
        name: file.name,
        mime_type: mime,
        data: data,
        previewUrl: isImage ? URL.createObjectURL(file) : "",
      });
    }
    renderEditAttachments(msg);
  }

  function editUserMessage(msg) {
    if (!msg || !msg.classList.contains("user") || !threadDiv.contains(msg)) return;
    var main = msg.querySelector(".ai-agent-msg-main");
    if (!main) return;
    var body = msg.querySelector(".body");
    var text = body
      ? (body.getAttribute("data-raw-text") || body.textContent || "")
      : "";
    var files = attachmentsForResend(msg.__attachments || []);

    // Re-click same bubble: keep staging, just refocus. Bottom composer stays alone.
    if (editingUserMsg === msg) {
      var existing = msg.querySelector(".ai-agent-edit-textarea");
      if (existing) existing.focus();
      return;
    }

    if (editingUserMsg) leaveEditMode();

    editingUserMsg = msg;
    msg.__editOriginal = text;
    msg.__editFiles = files;
    msg.__editMode = modeField.value || "agent";
    msg.__editModel = modelField.value || defaultModel;
    msg.classList.add("is-editing");

    if (!body) {
      body = document.createElement("div");
      body.className = "body";
      var actions = msg.querySelector(".ai-agent-user-actions");
      if (actions) main.insertBefore(body, actions);
      else main.appendChild(body);
    }
    body.style.display = "none";

    var shell = document.createElement("div");
    shell.className = "ai-agent-edit-shell" + (msg.__editMode === "plan" ? " mode-plan" : "");

    var attachBox = document.createElement("div");
    attachBox.className = "ai-agent-edit-attachments";

    var ta = document.createElement("textarea");
    ta.className = "ai-agent-edit-textarea";
    ta.value = text;
    ta.rows = 1;
    ta.setAttribute("aria-label", "编辑消息");
    ta.addEventListener("input", function () { autosizeEditTextarea(ta); });
    ta.addEventListener("paste", function (e) {
      var files = filesFromClipboardData(e.clipboardData);
      if (!files.length) return;
      e.preventDefault();
      handleEditFileSelection(msg, files);
    });
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commitInlineEdit();
      }
    });

    var toolbar = document.createElement("div");
    toolbar.className = "ai-agent-edit-toolbar";

    var left = document.createElement("div");
    left.className = "ai-agent-edit-toolbar-left";

    var modeSel = document.createElement("select");
    modeSel.className = "ai-agent-edit-mode";
    modeSel.title = "模式";
    modeSel.innerHTML = '<option value="agent">Agent</option><option value="plan">Plan</option>';
    modeSel.value = msg.__editMode === "plan" ? "plan" : "agent";
    modeSel.onchange = function () {
      msg.__editMode = modeSel.value;
      shell.classList.toggle("mode-plan", modeSel.value === "plan");
    };

    var modelPicker = buildEditModelPicker(msg);

    left.appendChild(modeSel);
    left.appendChild(modelPicker);

    var right = document.createElement("div");
    right.className = "ai-agent-edit-toolbar-right";

    var fileInputEdit = document.createElement("input");
    fileInputEdit.type = "file";
    fileInputEdit.className = "ai-agent-edit-file-input";
    fileInputEdit.multiple = true;
    fileInputEdit.addEventListener("change", function () {
      handleEditFileSelection(msg, fileInputEdit.files).then(function () {
        fileInputEdit.value = "";
      });
    });

    var pickEdit = document.createElement("button");
    pickEdit.type = "button";
    pickEdit.className = "ai-agent-edit-pick";
    pickEdit.title = "添加文件";
    pickEdit.textContent = "📎";
    pickEdit.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      fileInputEdit.click();
    };

    var sendEdit = document.createElement("button");
    sendEdit.type = "button";
    sendEdit.className = "ai-agent-edit-send";
    sendEdit.title = "发送修改";
    sendEdit.setAttribute("aria-label", "发送修改");
    sendEdit.innerHTML = queueIcon("send");
    sendEdit.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      commitInlineEdit();
    };

    right.appendChild(fileInputEdit);
    right.appendChild(pickEdit);
    right.appendChild(sendEdit);
    toolbar.appendChild(left);
    toolbar.appendChild(right);

    shell.appendChild(attachBox);
    shell.appendChild(ta);
    shell.appendChild(toolbar);

    var actionsEl = msg.querySelector(".ai-agent-user-actions");
    if (actionsEl) main.insertBefore(shell, actionsEl);
    else main.appendChild(shell);

    renderEditAttachments(msg);
    renderEditModelList(msg);
    autosizeEditTextarea(ta);
    updateModeUI();
    ta.focus();
    try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (err) {}
  }

  function revokeFilePreviews(files) {
    (files || []).forEach(function (file) {
      if (file && file.previewUrl) URL.revokeObjectURL(file.previewUrl);
    });
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

  function cardHasBody(merged) {
    return !!(
      (merged.detail && String(merged.detail).trim()) ||
      (merged.paths && merged.paths.length) ||
      (merged.diff && merged.diff.length)
    );
  }

  function setCardExpanded(card, expanded) {
    card.classList.toggle("is-expanded", !!expanded);
    card.classList.toggle("is-collapsed", !expanded);
    var header = card.querySelector(".ai-agent-card-header");
    if (header) header.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  function applyCardExpansion(card, merged, options) {
    options = options || {};
    // live: fully open; finished: collapse unless user reopened it
    if (merged.live) {
      setCardExpanded(card, true);
      return;
    }
    if (options.forceCollapsed && !card.__userExpanded) {
      setCardExpanded(card, false);
      return;
    }
    if (card.__userExpanded) {
      setCardExpanded(card, true);
      return;
    }
    setCardExpanded(card, false);
  }

  function bindCardToggle(card) {
    if (card.__toggleBound) return;
    card.__toggleBound = true;
    var header = card.querySelector(".ai-agent-card-header");
    function toggle() {
      if (!card.classList.contains("has-body") || card.classList.contains("is-live")) return;
      var next = !card.classList.contains("is-expanded");
      card.__userExpanded = next;
      setCardExpanded(card, next);
    }
    header.addEventListener("click", toggle);
    header.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    });
  }

  function thinkingTitle(meta, finalized, startedAt) {
    var base = startedAt || meta.thinkingStartedAt;
    if (!base) return finalized ? "Thought briefly" : "Thinking";
    var elapsed = Date.now() - base;
    var seconds = Math.max(1, Math.round(elapsed / 1000));
    if (!finalized) {
      if (elapsed >= 10000) return "Thinking longer than expected";
      return "Thinking";
    }
    if (seconds <= 2) return "Thought briefly";
    return "Thought for " + seconds + "s";
  }

  // SDK may send cumulative snapshots or pure deltas; merge either shape.
  function mergeStreamText(prev, chunk) {
    if (!chunk) return prev || "";
    if (!prev) return chunk;
    if (chunk.indexOf(prev) === 0) return chunk;
    if (prev.indexOf(chunk) === 0) return prev;
    return prev + chunk;
  }

  function refreshThinkingCard(msg) {
    var meta = getRunMeta(msg);
    if (!meta.thinkingStartedAt) return;
    var card = upsertCard(msg, "think-live", {
      kind: "think",
      title: thinkingTitle(meta, false),
      meta: "",
      detail: meta.thinkingDetail || "",
      paths: [],
      live: true,
    });
    var body = card && card.querySelector(".ai-agent-card-body");
    if (body) body.scrollTop = body.scrollHeight;
    scrollToBottom(false);
  }

  function buildToolPresentation(payload, summary) {
    var title = (summary && summary.title) ? String(summary.title).trim() : "";
    var detail = (summary && summary.detail) ? String(summary.detail) : "";
    var argsText = payload.args || "";
    var resultText = payload.result || "";
    var kind = (summary && summary.kind) ? String(summary.kind) : "";
    // Cursor: › Running / › Ran — command only in expanded detail.
    if (kind === "run") {
      title = payload.status === "running" ? "Running" : "Ran";
    } else if (!title || /^tool$/i.test(title)) {
      var name = (payload.name || "").trim();
      if (name && !/^tool$/i.test(name) && !/^(shell|bash|terminal|awaitshell)$/i.test(name)) {
        var pretty = name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
        title = pretty.charAt(0).toUpperCase() + pretty.slice(1);
      } else if (argsText || /^(shell|bash|terminal|awaitshell)$/i.test(name)) {
        title = payload.status === "running" ? "Running" : "Ran";
      }
    }
    var cmd = detail;
    if (!cmd || cmd === payload.name) cmd = argsText || "";
    if (kind === "run" || title === "Run" || title === "Ran" || title === "Running") {
      if (cmd && resultText && payload.status === "completed") {
        detail = cmd + "\n\n" + resultText;
      } else {
        detail = cmd || resultText || detail;
      }
    } else if (!detail || detail === payload.name) {
      if (payload.status === "completed" && resultText) detail = resultText;
      else if (argsText) detail = argsText;
    }
    return { title: title || "Ran", detail: detail };
  }

  function cardByKey(msg, key) {
    // Avoid CSS attribute selectors — call_id / titles can contain ] " etc. and throw.
    var cards = msg.querySelectorAll(".ai-agent-card");
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute("data-card-key") === key) return cards[i];
    }
    return null;
  }

  function upsertCard(msg, key, options) {
    options = options || {};
    var meta = getRunMeta(msg);
    var existing = cardByKey(msg, key);
    // Don't update a card that still sits above sealed assistant text.
    if (existing && meta.needNewWorklog) {
      existing.remove();
      existing = null;
    }
    var worklog = options.worklog || (existing ? existing.parentNode : ensureWorklog(msg));
    var card = existing;
    if (!card) {
      card = document.createElement("div");
      card.className = "ai-agent-card is-collapsed";
      card.setAttribute("data-card-key", key);
      card.setAttribute("data-card-index", String(meta.nextIndex++));
      card.innerHTML =
        '<div class="ai-agent-card-header" role="button" tabindex="0" aria-expanded="false">' +
          '<span class="ai-agent-card-chevron" aria-hidden="true">›</span>' +
          '<span class="ai-agent-card-title"></span>' +
          '<span class="ai-agent-card-meta"></span>' +
        "</div>" +
        '<div class="ai-agent-card-body"></div>';
      bindCardToggle(card);
      worklog.appendChild(card);
    } else if (options.worklog && card.parentNode !== options.worklog) {
      options.worklog.appendChild(card);
    }
    var previous = card.__cardData || {};
    var merged = {
      kind: options.kind || previous.kind || "tool",
      title: options.title || previous.title || "",
      meta: options.meta !== undefined ? options.meta : (previous.meta || ""),
      detail: options.detail !== undefined ? options.detail : (previous.detail || ""),
      paths: (options.paths && options.paths.length) ? options.paths : (previous.paths || []),
      diff: (options.diff && options.diff.length) ? options.diff : (previous.diff || []),
      live: options.live !== undefined ? !!options.live : !!previous.live,
    };
    if (!merged.live && previous.live) card.__userExpanded = false;
    card.__cardData = merged;
    card.className = "ai-agent-card kind-" + merged.kind;
    card.classList.toggle("is-live", merged.live);
    card.classList.toggle("has-body", cardHasBody(merged));
    card.classList.toggle("is-explore-step", key.indexOf("explore-step-") === 0);
    var header = card.querySelector(".ai-agent-card-header");
    var expandable = cardHasBody(merged);
    header.setAttribute("tabindex", expandable ? "0" : "-1");
    header.setAttribute("role", expandable ? "button" : "presentation");
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
    applyCardExpansion(card, merged, options);
    if (merged.live) scrollToBottom(false);
    if (!merged.live) scheduleSaveChatHistory();
    return card;
  }

  function appendCard(msg, options) {
    var meta = getRunMeta(msg);
    return upsertCard(msg, "card-" + (meta.nextIndex + 1) + "-" + Date.now(), options);
  }

  function removeCard(msg, key) {
    var card = cardByKey(msg, key);
    if (card) {
      card.remove();
      scheduleSaveChatHistory();
    }
  }

  function finalizeStatusCard(msg) {
    removeCard(msg, "status-live");
  }

  function hasOtherLiveCard(msg) {
    if (!msg) return false;
    var live = msg.querySelectorAll(".ai-agent-card.is-live");
    for (var i = 0; i < live.length; i++) {
      if (live[i].getAttribute("data-card-key") !== "status-live") return true;
    }
    return false;
  }

  function liveCardActivityTitle(msg) {
    if (!msg) return "";
    var live = msg.querySelectorAll(".ai-agent-card.is-live");
    var fallback = "";
    for (var i = live.length - 1; i >= 0; i--) {
      var key = live[i].getAttribute("data-card-key") || "";
      if (key === "status-live") continue;
      var title = (live[i].querySelector(".ai-agent-card-title") || {}).textContent || "";
      title = String(title).replace(/\s·\s*\d+s\s*$/, "").trim();
      if (!title) continue;
      if (key === "explore-live") {
        fallback = title;
        continue;
      }
      return title;
    }
    return fallback;
  }

  function currentActivityTitle(msg) {
    return liveCardActivityTitle(msg)
      || (msg ? (getRunMeta(msg).lastActivityTitle || "") : "")
      || "Thinking";
  }

  function rememberActivity(msg, title) {
    if (!msg) return;
    var t = String(title || "").replace(/\s·\s*\d+s\s*$/, "").trim();
    if (!t || /^就绪/.test(t)) return;
    getRunMeta(msg).lastActivityTitle = t;
  }

  function noteWorking(msg, title) {
    if (!msg || !isRunning || !threadDiv.contains(msg)) return;
    if (hasOtherLiveCard(msg)) {
      removeCard(msg, "status-live");
      return;
    }
    var label = String(title || currentActivityTitle(msg)).replace(/\s·\s*\d+s\s*$/, "").trim();
    if (!label || /^就绪/.test(label)) label = "Thinking";
    rememberActivity(msg, label);
    upsertCard(msg, "status-live", {
      kind: "think",
      title: label,
      meta: "",
      detail: "",
      paths: [],
      live: true,
      forceCollapsed: true,
    });
  }

  function exploreSummaryTitle(steps) {
    var files = 0, searches = 0, lists = 0, other = 0;
    (steps || []).forEach(function (s) {
      var t = String(s || "").trim().toLowerCase();
      if (/^read\b/.test(t)) files += 1;
      else if (/^(grep|grepped|search|searched|sem|fetch|fetched|web)/.test(t)) searches += 1;
      else if (/^(list|listed)/.test(t)) lists += 1;
      else other += 1;
    });
    var parts = [];
    if (files) parts.push(files + (files === 1 ? " file" : " files"));
    if (searches) parts.push(searches + (searches === 1 ? " search" : " searches"));
    if (lists) parts.push(lists + (lists === 1 ? " listing" : " listings"));
    if (!parts.length && other) parts.push(other + (other === 1 ? " step" : " steps"));
    else if (other && parts.length) parts.push(other + " more");
    return parts.length ? ("Explored " + parts.join(", ")) : "Explored";
  }

  function appendExploredMarker(msg) {
    var meta = getRunMeta(msg);
    var steps = (meta.exploreSteps || []).slice();
    meta.exploreSteps = [];
    meta.exploreStepKeys = [];
    if (!steps.length) return;
    meta.exploreSeq = (meta.exploreSeq || 0) + 1;
    // Cursor: one collapsed summary row; expand to see Read/Grep/List lines.
    upsertCard(msg, "explore-done-" + meta.exploreSeq, {
      kind: "explore",
      title: exploreSummaryTitle(steps),
      meta: "",
      detail: steps.join("\n"),
      paths: [],
      live: false,
      forceCollapsed: true,
    });
  }

  // Cursor: Exploring (live) + per-step rows → Explored N files… (collapsed).
  function finalizeExplorePhase(msg) {
    var meta = getRunMeta(msg);
    var hadExplore = !!meta.exploreActive || !!(meta.exploreSteps || []).length;
    removeCard(msg, "explore-live");
    (meta.exploreStepKeys || []).forEach(function (key) { removeCard(msg, key); });
    meta.exploreStepKeys = [];
    if (!hadExplore) return;
    appendExploredMarker(msg);
    meta.exploreActive = false;
  }

  function noteExploring(msg, stepTitle, options) {
    options = options || {};
    var meta = getRunMeta(msg);
    if (!meta.exploreSteps) meta.exploreSteps = [];
    if (!meta.exploreStepKeys) meta.exploreStepKeys = [];
    var step = String(stepTitle || "").trim() || "Searching";
    var callId = String(options.callId || "").trim();
    var running = !!options.running;
    var detail = options.detail || "";
    var stepKey = callId
      ? ("explore-step-" + callId)
      : ("explore-step-n" + meta.exploreStepKeys.length + "-" + step.length);

    relocateExploreCards(msg);

    meta.exploreActive = true;
    rememberActivity(msg, step);

    // Register the step before writing Exploring meta so "N steps" is not short by one.
    if (meta.exploreStepKeys.indexOf(stepKey) < 0) {
      var reused = "";
      if (!callId) {
        for (var i = meta.exploreStepKeys.length - 1; i >= 0; i--) {
          var prev = cardByKey(msg, meta.exploreStepKeys[i]);
          var prevTitle = prev && prev.__cardData ? prev.__cardData.title : "";
          if (prevTitle === step) {
            reused = meta.exploreStepKeys[i];
            break;
          }
        }
      }
      if (reused) {
        stepKey = reused;
        var ridx = meta.exploreStepKeys.indexOf(reused);
        if (ridx >= 0) meta.exploreSteps[ridx] = step;
      } else {
        meta.exploreStepKeys.push(stepKey);
        meta.exploreSteps.push(step);
      }
    } else {
      var idx = meta.exploreStepKeys.indexOf(stepKey);
      if (idx >= 0) meta.exploreSteps[idx] = step;
    }

    var worklog = ensureWorklog(msg);
    upsertCard(msg, "explore-live", {
      kind: "explore",
      title: "Exploring",
      meta: running ? step : ((meta.exploreSteps || []).length ? (meta.exploreSteps.length + " steps") : ""),
      detail: "",
      paths: [],
      live: true,
      worklog: worklog,
    });

    upsertCard(msg, stepKey, {
      kind: "explore",
      title: step,
      meta: "",
      detail: detail,
      paths: options.paths || [],
      live: running,
      forceCollapsed: !running,
      worklog: worklog,
    });

    var live = cardByKey(msg, "explore-live");
    if (live && worklog) {
      // Keep prior Explored summaries above: Explored… → Exploring → steps.
      var lastDone = null;
      for (var node = worklog.firstChild; node; node = node.nextSibling) {
        var ck = (node.getAttribute && node.getAttribute("data-card-key")) || "";
        if (ck.indexOf("explore-done-") === 0) lastDone = node;
      }
      if (lastDone) {
        worklog.insertBefore(live, lastDone.nextSibling);
      }
      var pivot = live;
      meta.exploreStepKeys.forEach(function (key) {
        var card = cardByKey(msg, key);
        if (!card) return;
        if (pivot.nextSibling !== card) worklog.insertBefore(card, pivot.nextSibling);
        pivot = card;
      });
    }
    scrollToBottom(false);
  }

  function isNoisyStatus(text) {
    var upper = String(text || "").trim().toUpperCase();
    return (
      !upper ||
      upper === "STARTED" ||
      upper === "RUNNING" ||
      upper === "FINISHED" ||
      upper === "COMPLETED" ||
      upper === "DONE" ||
      upper === "CANCELLED" ||
      upper === "CANCELED"
    );
  }

  function finalizePlanCard(msg) {
    // Ephemeral: gone once planning finishes and execution starts.
    var meta = getRunMeta(msg);
    removeCard(msg, "plan-live");
    meta.planningDetail = "";
  }

  function finalizeThoughtCard(msg) {
    var meta = getRunMeta(msg);
    if (!meta.thinkingStartedAt) return;
    if (meta.thinkingTimer) {
      clearInterval(meta.thinkingTimer);
      meta.thinkingTimer = null;
    }
    var startedAt = meta.thinkingStartedAt;
    var detail = (meta.thinkingDetail || "").trim();
    var elapsed = Date.now() - startedAt;
    meta.thinkingStartedAt = 0;
    meta.thinkingDetail = "";
    // Cursor: skip empty brief thoughts — no card clutter.
    if (!detail && elapsed <= 2000) {
      removeCard(msg, "think-live");
      if (isRunning) noteWorking(msg, currentActivityTitle(msg));
      return;
    }
    if (!detail) {
      removeCard(msg, "think-live");
      if (isRunning) noteWorking(msg, currentActivityTitle(msg));
      return;
    }
    var card = upsertCard(msg, "think-live", {
      kind: "think",
      title: thinkingTitle(meta, true, startedAt),
      meta: "",
      detail: detail,
      paths: [],
      live: false,
      forceCollapsed: true,
    });
    if (card) {
      meta.thinkSeq = (meta.thinkSeq || 0) + 1;
      card.setAttribute("data-card-key", "think-done-" + meta.thinkSeq);
    }
    if (isRunning) noteWorking(msg);
  }

  function sealLiveToolTitle(title) {
    var t = String(title || "");
    // Cursor: completed shell cards say "Ran".
    if (t === "Running") return "Ran";
    if (/^Running\b/i.test(t)) return t.replace(/^Running/i, "Ran");
    if (t === "Run") return "Ran";
    return t || "Ran";
  }

  // Tool cards stay .is-live "Running" until completed — if the stream ends
  // without tool-call-completed, seal them so the UI doesn't look stuck.
  function finalizeLiveToolCards(msg) {
    var cards = Array.prototype.slice.call(msg.querySelectorAll(".ai-agent-card.is-live"));
    cards.forEach(function (card) {
      var key = card.getAttribute("data-card-key") || "";
      if (
        key === "think-live" ||
        key === "plan-live" ||
        key === "explore-live" ||
        key === "status-live" ||
        key.indexOf("explore-step-") === 0
      ) {
        return;
      }
      var data = card.__cardData || {};
      upsertCard(msg, key, {
        kind: data.kind || "tool",
        title: sealLiveToolTitle(data.title),
        meta: "",
        detail: data.detail || "",
        paths: data.paths || [],
        diff: data.diff || [],
        live: false,
        forceCollapsed: true,
      });
    });
  }

  function finalizeLiveCards(msg) {
    finalizePlanCard(msg);
    finalizeThoughtCard(msg);
    finalizeExplorePhase(msg);
    finalizeStatusCard(msg);
    finalizeLiveToolCards(msg);
  }

  function noteThinking(msg, detail) {
    finalizePlanCard(msg);
    finalizeStatusCard(msg);
    var chunk = detail || "";
    var meta = getRunMeta(msg);
    // Cursor folds think↔read into one Explored burst — don't open Thought mid-explore.
    if (meta.exploreActive) {
      if (chunk.trim()) updateRunState(currentActivityTitle(msg));
      return;
    }
    // Empty heartbeat deltas must not open a new Thought row.
    if (!meta.thinkingStartedAt && !chunk.trim()) return;
    if (!meta.thinkingStartedAt) {
      meta.thinkingStartedAt = Date.now();
      meta.thinkingDetail = "";
      rememberActivity(msg, "Thinking");
      if (!meta.thinkingTimer) {
        meta.thinkingTimer = setInterval(function () {
          refreshThinkingCard(msg);
        }, 1000);
      }
    }
    meta.thinkingDetail = mergeStreamText(meta.thinkingDetail, chunk);
    refreshThinkingCard(msg);
  }

  function notePlanning(msg, detail) {
    var meta = getRunMeta(msg);
    // A new planning pass means the previous thinking round is done.
    if (meta.thinkingStartedAt) finalizeThoughtCard(msg);
    finalizeStatusCard(msg);
    meta.planningDetail = mergeStreamText(meta.planningDetail, detail || "");
    var card = upsertCard(msg, "plan-live", {
      kind: "plan",
      title: "Planning next moves",
      meta: "",
      detail: meta.planningDetail || "",
      paths: [],
      live: true,
      forceCollapsed: false,
    });
    var body = card && card.querySelector(".ai-agent-card-body");
    if (body && meta.planningDetail) {
      body.style.display = "block";
      body.scrollTop = body.scrollHeight;
    }
    scrollToBottom(false);
  }

