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
        exploreStartReplyLen: 0,
        inflightToolKey: "",
        thoughtSealedForCall: "",
        thinkingStartedAt: 0,
        thinkingDetail: "",
        thinkingTimer: null,
        thinkingPaused: false,
        planningDetail: "",
        sealedReplyLen: 0,
        interimSkipLen: 0,
        replyLenAtToolStart: 0,
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
  // options.peelPlan: on first explore, keep only the leading plan paragraph above
  // tools; later paragraphs (conclusions) stay in the reply buffer and paint under Explored.
  function beginToolSegment(msg, options) {
    options = options || {};
    var meta = getRunMeta(msg);
    scrubInterimSegments(msg);
    if (meta.interimSkipLen) {
      meta.sealedReplyLen = Math.max(meta.sealedReplyLen, meta.interimSkipLen);
      meta.interimSkipLen = 0;
    }
    if (meta.activeTextEl) {
      var raw = (meta.activeTextEl.getAttribute("data-raw-text") || meta.activeTextEl.textContent || "").trim();
      if (isInterimReplyText(raw) || /^正在/.test(raw)) {
        var interimEnd = meta.activeTextEl.__replyEnd || meta.sealedReplyLen;
        if (meta.activeTextEl.parentNode) meta.activeTextEl.remove();
        meta.sealedReplyLen = Math.max(meta.sealedReplyLen, interimEnd);
        meta.activeTextEl = null;
      }
    }
    if (meta.activeTextEl) {
      var replyStart = meta.activeTextEl.__replyStart || 0;
      var sealChunk = meta.activeTextEl.getAttribute("data-raw-text") || "";
      var sealEnd = meta.activeTextEl.__replyEnd || (replyStart + sealChunk.length);
      if (options.peelPlan) {
        // Peel on the original chunk so sealedReplyLen stays aligned with state.reply.
        var peeled = peelLeadingPlanChunk(sealChunk);
        sealChunk = collapseRewriteParagraphs(peeled.plan);
        sealEnd = replyStart + peeled.planEnd;
      } else {
        sealChunk = collapseRewriteParagraphs(sealChunk);
      }
      if (sealChunk.trim()) {
        meta.activeTextEl.__replyEnd = sealEnd;
        meta.activeTextEl.setAttribute("data-raw-text", sealChunk);
        meta.activeTextEl.innerHTML = renderMarkdown(sealChunk);
        bindCodeBlockCopy(meta.activeTextEl);
      } else if (meta.activeTextEl.parentNode) {
        meta.activeTextEl.remove();
      }
      meta.sealedReplyLen = Math.max(meta.sealedReplyLen, sealEnd);
      meta.activeTextEl = null;
      meta.needNewWorklog = true;
      meta.replyLenAtToolStart = meta.sealedReplyLen;
      removeCard(msg, "think-live");
      removeCard(msg, "plan-live");
      removeCard(msg, "status-live");
    } else {
      meta.replyLenAtToolStart = Math.max(meta.replyLenAtToolStart || 0, meta.sealedReplyLen || 0);
    }
  }

  // Keep the first paragraph above tools; defer the rest until after Explored.
  function peelLeadingPlanChunk(chunk) {
    var text = String(chunk || "");
    var parts = text.split(/\n\n+/).map(function (p) { return p.trim(); }).filter(Boolean);
    if (parts.length <= 1) {
      return { plan: text, planEnd: text.length };
    }
    var first = parts[0];
    var idx = text.indexOf(first);
    var planEnd = idx >= 0 ? idx + first.length : first.length;
    while (planEnd < text.length && (text.charAt(planEnd) === "\n" || text.charAt(planEnd) === "\r")) {
      planEnd += 1;
    }
    return { plan: text.slice(0, planEnd).replace(/\s+$/, ""), planEnd: planEnd };
  }

  function collapseRewriteParagraphs(text) {
    var parts = String(text || "").split(/\n\n+/).map(function (p) { return p.trim(); }).filter(Boolean);
    if (parts.length < 2) return String(text || "");
    var out = [];
    parts.forEach(function (p) {
      if (!out.length) {
        out.push(p);
        return;
      }
      var prev = out[out.length - 1];
      var a = prev.replace(/\s+/g, "").slice(0, 20);
      var b = p.replace(/\s+/g, "").slice(0, 20);
      if (a && b && (a === b || prev.indexOf(p.slice(0, 12)) >= 0 || p.indexOf(prev.slice(0, 12)) >= 0)) {
        out[out.length - 1] = p;
      } else {
        out.push(p);
      }
    });
    return out.join("\n\n");
  }

  // Post-tool prose must not grow a text node that already has tool cards below it.
  function hasToolCardsAfter(msg, el) {
    if (!msg || !el) return false;
    var cards = msg.querySelectorAll(".ai-agent-card");
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var key = c.getAttribute("data-card-key") || "";
      if (
        key === "status-live" || key === "think-live" || key === "plan-live" ||
        key.indexOf("think-done-") === 0
      ) continue;
      var toolish = /kind-(explore|edit|run|tool|verify)/.test(c.className)
        || key.indexOf("tool-") === 0
        || key.indexOf("explore-") === 0;
      if (!toolish) continue;
      if (el.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) return true;
    }
    return false;
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
    finalizeStatusCard(msg);

    fullReply = String(fullReply || "");
    // Cursor: never continue a text node that already has tools below it.
    if (meta.activeTextEl && hasToolCardsAfter(msg, meta.activeTextEl)) {
      var keepUntil = (typeof meta.replyLenAtToolStart === "number" && meta.replyLenAtToolStart > 0)
        ? meta.replyLenAtToolStart
        : (meta.exploreStartReplyLen || meta.sealedReplyLen || 0);
      var replyStart = meta.activeTextEl.__replyStart || 0;
      var keepChunk = collapseRewriteParagraphs(fullReply.slice(replyStart, keepUntil));
      if (keepChunk.trim()) {
        meta.activeTextEl.__replyEnd = keepUntil;
        meta.activeTextEl.setAttribute("data-raw-text", keepChunk);
        if (renderAsMarkdown) {
          meta.activeTextEl.innerHTML = renderMarkdown(keepChunk);
          bindCodeBlockCopy(meta.activeTextEl);
        } else {
          meta.activeTextEl.textContent = keepChunk;
        }
      } else if (meta.activeTextEl.parentNode) {
        meta.activeTextEl.remove();
      }
      meta.sealedReplyLen = Math.max(meta.sealedReplyLen, keepUntil);
      meta.activeTextEl = null;
    }

    var chunk = fullReply.slice(meta.sealedReplyLen);
    if (!chunk) {
      return meta.activeTextEl;
    }
    chunk = collapseRewriteParagraphs(chunk);
    var main = msg.querySelector(".ai-agent-msg-main");
    if (!meta.activeTextEl) {
      meta.activeTextEl = document.createElement("div");
      meta.activeTextEl.className = "ai-agent-segment-text body";
      meta.activeTextEl.__replyStart = meta.sealedReplyLen;
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

    var think = deepseekThinkOpts();
    var item = {
      id: "q-" + (++queueSeq),
      text: text,
      model: msg.__editModel || modelField.value,
      mode: (modeSel && modeSel.value) || msg.__editMode || modeField.value,
      thinking: think.thinking,
      files: files,
    };

    if (isRunning || pendingFollow) {
      // Abort in-flight turn but don't set stopRequested — drainQueue must continue into the new item.
      pendingFollow = false;
      if (activeAbort) activeAbort.abort();
      await requestCancel();
    }
    sendQueue.forEach(function (queued) { revokeFilePreviews(queued.files); });
    sendQueue = [item];
    editingUserMsg = null;
    truncateThreadFrom(msg);
    stoppedAgentMsg = null;
    sessionGeneration += 1;
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

    if (providerUi.showAuto) menu.appendChild(autoRow);
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
    msg.__editFiles = msg.__editFiles || [];
    await ingestSelectedFiles(files, msg.__editFiles);
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
      var path = escapeHtml(item.path || "");
      var lines = "";
      (item.removed || []).forEach(function (line) {
        lines += '<span class="ai-agent-diff-line removed">- ' + escapeHtml(line) + "</span>";
      });
      (item.added || []).forEach(function (line) {
        lines += '<span class="ai-agent-diff-line added">+ ' + escapeHtml(line) + "</span>";
      });
      if (!lines) return "";
      return (
        '<div class="ai-agent-diff">' +
          (path ? '<div class="ai-agent-diff-path">' + path + "</div>" : "") +
          lines +
        "</div>"
      );
    }).join("");
  }

  function turnChangesHeaderTitle(files) {
    var n = files.length;
    var unit = n === 1 ? " file" : " files";
    var deleted = 0, created = 0;
    files.forEach(function (f) {
      if (f.status === "deleted") deleted += 1;
      else if (f.status === "created") created += 1;
    });
    // Codex-style: name the action when uniform; otherwise "Changed".
    if (deleted === n) return "Deleted " + n + unit;
    if (created === n) return "Added " + n + unit;
    return "Changed " + n + unit;
  }

  function turnFileStatusLabel(status) {
    if (status === "created") return "added";
    if (status === "deleted") return "deleted";
    return "modified";
  }

  function requestTurnUndo(turnId, path) {
    var body = { session_id: sessionId, turn_id: turnId };
    if (path) body.path = path;
    return fetch(apiBase + "/api/chat/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok, body: data }; });
    });
  }

  function renderTurnChanges(msg, payload) {
    if (!msg || !payload) return null;
    var files = payload.files || [];
    if (!files.length) return null;
    var main = msg.querySelector(".ai-agent-msg-main");
    if (!main) return null;
    var existing = main.querySelector(".ai-agent-turn-changes");
    var wasOpen = !existing || existing.classList.contains("is-open");
    if (existing) existing.remove();

    var panel = document.createElement("div");
    panel.className = "ai-agent-turn-changes" + (wasOpen ? " is-open" : "");
    if (payload.undone) panel.classList.add("is-undone");
    panel.setAttribute("data-turn-id", payload.turn_id || "");
    var add = Number(payload.additions || 0);
    var del = Number(payload.deletions || 0);
    var undoable = !!payload.undoable && !payload.undone;
    var header = document.createElement("div");
    header.className = "ai-agent-turn-changes-header";
    header.innerHTML =
      '<span class="ai-agent-turn-changes-chevron" aria-hidden="true"></span>' +
      '<span class="ai-agent-turn-changes-title">' + turnChangesHeaderTitle(files) + "</span>" +
      '<span class="ai-agent-turn-changes-stats">' +
        '<span class="add">+' + add + "</span> · " +
        '<span class="del">-' + del + "</span>" +
      "</span>" +
      '<span class="ai-agent-turn-changes-actions"></span>';
    var actions = header.querySelector(".ai-agent-turn-changes-actions");
    if (payload.turn_id && (undoable || payload.undone)) {
      var undoBtn = document.createElement("button");
      undoBtn.type = "button";
      undoBtn.className = "ai-agent-turn-undo" + (payload.undone ? " is-done" : "");
      undoBtn.textContent = payload.undone ? "已全部撤销" : "撤销全部";
      undoBtn.disabled = !!payload.undone;
      undoBtn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        if (undoBtn.disabled || !sessionId) return;
        undoBtn.disabled = true;
        undoBtn.textContent = "撤销中…";
        requestTurnUndo(payload.turn_id)
          .then(function (out) {
            if (!out.ok) {
              undoBtn.disabled = false;
              undoBtn.textContent = "撤销全部";
              alert((out.body && out.body.detail) || "撤销失败");
              return;
            }
            renderTurnChanges(msg, out.body);
          })
          .catch(function () {
            undoBtn.disabled = false;
            undoBtn.textContent = "撤销全部";
            alert("撤销失败：无法连接服务");
          });
      });
      actions.appendChild(undoBtn);
    }
    header.addEventListener("click", function () {
      panel.classList.toggle("is-open");
    });
    var body = document.createElement("div");
    body.className = "ai-agent-turn-changes-body";
    files.forEach(function (file) {
      var row = document.createElement("div");
      var fileUndone = !!file.undone || !!payload.undone;
      var fileUndoable = !!payload.turn_id && !fileUndone && (file.undoable !== false);
      row.className = "ai-agent-turn-file status-" + (file.status || "modified") +
        (fileUndone ? " is-undone" : "");
      var status = file.status || "modified";
      var fa = Number(file.additions || 0);
      var fd = Number(file.deletions || 0);
      var head = document.createElement("div");
      head.className = "ai-agent-turn-file-head";
      head.innerHTML =
        '<div class="ai-agent-turn-file-path">' + escapeHtml(file.path || "") + "</div>" +
        '<div class="ai-agent-turn-file-meta">' +
          '<span class="ai-agent-turn-file-status">' + turnFileStatusLabel(status) + "</span>" +
          " · <span class=\"add\">+" + fa + "</span> / <span class=\"del\">-" + fd + "</span></div>" +
        '<span class="ai-agent-turn-file-actions"></span>';
      var fileActions = head.querySelector(".ai-agent-turn-file-actions");
      if (payload.turn_id && (fileUndoable || fileUndone)) {
        var fileUndoBtn = document.createElement("button");
        fileUndoBtn.type = "button";
        fileUndoBtn.className = "ai-agent-turn-undo ai-agent-turn-file-undo" +
          (fileUndone ? " is-done" : "");
        fileUndoBtn.textContent = fileUndone ? "已撤销" : "撤销";
        fileUndoBtn.disabled = fileUndone;
        fileUndoBtn.addEventListener("click", function (ev) {
          ev.stopPropagation();
          if (fileUndoBtn.disabled || !sessionId || !file.path) return;
          fileUndoBtn.disabled = true;
          fileUndoBtn.textContent = "撤销中…";
          requestTurnUndo(payload.turn_id, file.path)
            .then(function (out) {
              if (!out.ok) {
                fileUndoBtn.disabled = false;
                fileUndoBtn.textContent = "撤销";
                alert((out.body && out.body.detail) || "撤销失败");
                return;
              }
              renderTurnChanges(msg, out.body);
            })
            .catch(function () {
              fileUndoBtn.disabled = false;
              fileUndoBtn.textContent = "撤销";
              alert("撤销失败：无法连接服务");
            });
        });
        fileActions.appendChild(fileUndoBtn);
      }
      row.appendChild(head);
      if (!fileUndone) {
        var diffHtml = makeDiffHtml(file.diff || []);
        if (diffHtml) {
          var wrap = document.createElement("div");
          wrap.innerHTML = diffHtml;
          while (wrap.firstChild) row.appendChild(wrap.firstChild);
        }
      }
      body.appendChild(row);
    });
    panel.appendChild(header);
    panel.appendChild(body);
    // Keep full payload (incl. diffs) for localStorage serialize across refresh.
    panel.__turnPayload = {
      turn_id: payload.turn_id || "",
      files: files,
      file_count: files.length,
      additions: add,
      deletions: del,
      undoable: undoable,
      undone: !!payload.undone,
    };
    main.appendChild(panel);
    scheduleSaveChatHistory();
    return panel;
  }

  function editCardStatus(title, summaryStatus) {
    if (summaryStatus === "created" || summaryStatus === "deleted" || summaryStatus === "modified") {
      return summaryStatus;
    }
    var t = String(title || "");
    if (/^(?:Wrote|Writing)\b/.test(t)) return "created";
    if (/^(?:Deleted|Deleting)\b/.test(t)) return "deleted";
    return "modified";
  }

  function preferEditStatus(next, prev) {
    // Late completed(modified/+0) must not downgrade a known create/delete.
    if (prev === "deleted" || next === "deleted") return "deleted";
    if (prev === "created" || next === "created") return "created";
    return next || prev || "";
  }

  function editCardMeta(merged, fallback) {
    if (!merged || merged.kind !== "edit") return fallback || "";
    var a = merged.additions;
    var d = merged.deletions;
    if (typeof a !== "number" && typeof d !== "number") return fallback || "";
    return "+" + Number(a || 0) + " / -" + Number(d || 0);
  }

  function collectLocalTurnChanges(msg) {
    // Cursor path: aggregate edit cards into a summary (no undo).
    var byPath = {};
    var cards = msg.querySelectorAll(".ai-agent-card.kind-edit");
    for (var i = 0; i < cards.length; i++) {
      var data = cards[i].__cardData || {};
      var paths = data.paths || [];
      if (!paths.length && data.title) {
        var m = String(data.title).match(/^(?:Edited|Wrote|Editing|Writing|Deleted|Deleting)\s+(.+)$/);
        if (m) paths = [m[1]];
      }
      paths.forEach(function (p) {
        if (!p) return;
        var status = editCardStatus(data.title, data.status);
        var entry = byPath[p] || {
          path: p,
          status: status,
          additions: 0,
          deletions: 0,
          diff: [],
        };
        entry.status = preferEditStatus(status, entry.status);
        if (data.diff && data.diff.length) entry.diff = data.diff;
        var fa = 0;
        var fd = 0;
        (data.diff || []).forEach(function (d) {
          fa += (d.added || []).length;
          fd += (d.removed || []).length;
        });
        if (typeof data.additions === "number") fa = Math.max(fa, data.additions);
        if (typeof data.deletions === "number") fd = Math.max(fd, data.deletions);
        // Sum per-edit deltas for the same path (two edits ≠ max of one).
        entry.additions += fa;
        entry.deletions += fd;
        byPath[p] = entry;
      });
    }
    var files = Object.keys(byPath).sort().map(function (k) { return byPath[k]; });
    if (!files.length) return null;
    var add = 0;
    var del = 0;
    files.forEach(function (f) { add += f.additions; del += f.deletions; });
    return {
      turn_id: "",
      files: files,
      file_count: files.length,
      additions: add,
      deletions: del,
      undoable: false,
      undone: false,
    };
  }

  function detailEchoesPaths(detail, paths) {
    if (!detail || !paths || !paths.length) return false;
    var d = String(detail).trim();
    if (!d) return false;
    if (d === paths.join(", ") || d === paths.join("\n")) return true;
    return paths.length === 1 && d === paths[0];
  }

  function cardHasBody(merged, renderPaths) {
    if (!merged) return false;
    // Path-edit titles: path is in the title — body is diff only (no path echo).
    if (merged.kind === "edit" || isPathEditTitle(merged.title)) {
      return !!(merged.diff && merged.diff.length);
    }
    var paths = renderPaths !== undefined ? renderPaths : merged.paths;
    return !!(
      (merged.detail && String(merged.detail).trim()) ||
      (paths && paths.length) ||
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

  // Soft-pause used to keep one think-live card across tools — that put later
  // Thought time into the card ABOVE Ran and looked like it covered Running.
  // Seal instead; noteThinking opens a fresh think-live below tools.
  function softPauseThinking(msg) {
    finalizeThoughtCard(msg);
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
    // Always append think-live under the latest worklog (below tools since last seal).
    var worklog = ensureWorklog(msg);
    var card = upsertCard(msg, "think-live", {
      kind: "think",
      title: thinkingTitle(meta, false),
      meta: "",
      detail: meta.thinkingDetail || "",
      paths: [],
      live: true,
      worklog: worklog,
    });
    var body = card && card.querySelector(".ai-agent-card-body");
    if (body) body.scrollTop = body.scrollHeight;
    scrollToBottom(false);
  }

  function isPathEditTitle(title) {
    return /^(?:Editing|Edited|Writing|Wrote|Deleting|Deleted)\b/.test(String(title || ""));
  }

  function buildToolPresentation(payload, summary) {
    var title = (summary && summary.title) ? String(summary.title).trim() : "";
    var detail = (summary && summary.detail) ? String(summary.detail) : "";
    var argsText = payload.args || "";
    var resultText = payload.result || "";
    var kind = (summary && summary.kind) ? String(summary.kind) : "";
    if (isPathEditTitle(title)) kind = "edit";
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
    } else if (kind === "edit" || isPathEditTitle(title)) {
      // Title already has the path — body is diff only (never path / args JSON).
      detail = "";
    } else if (!detail || detail === payload.name) {
      if (payload.status === "completed" && resultText) detail = resultText;
      else if (argsText) detail = argsText;
    }
    // Paths become pills in the card — drop plain/args text that only repeats them.
    var pathList = (summary && summary.paths) || [];
    if (pathList.length && detailEchoesPaths(detail, pathList)) detail = "";
    // Running verify/read with empty summary.detail: args JSON is not useful body text.
    if (pathList.length && kind === "verify" && payload.status === "running") detail = "";
    return { title: title || "Ran", detail: detail, kind: kind };
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
    function preferCount(next, prev) {
      // Never let a late completed(+0) wipe a good running snapshot.
      if (typeof next === "number" && next > 0) return next;
      if (typeof prev === "number" && prev > 0) return prev;
      if (typeof next === "number") return next;
      return prev;
    }
    var nextAdd = options.additions;
    var nextDel = options.deletions;
    var useCompletedPair =
      !options.live &&
      typeof nextAdd === "number" &&
      typeof nextDel === "number" &&
      (nextAdd > 0 || nextDel > 0);
    var merged = {
      kind: options.kind || previous.kind || "tool",
      title: options.title || previous.title || "",
      meta: options.meta !== undefined ? options.meta : (previous.meta || ""),
      detail: options.detail !== undefined ? options.detail : (previous.detail || ""),
      paths: (options.paths && options.paths.length) ? options.paths : (previous.paths || []),
      diff: (options.diff && options.diff.length) ? options.diff : (previous.diff || []),
      status: preferEditStatus(options.status, previous.status),
      additions: useCompletedPair ? nextAdd : preferCount(nextAdd, previous.additions),
      deletions: useCompletedPair ? nextDel : preferCount(nextDel, previous.deletions),
      live: options.live !== undefined ? !!options.live : !!previous.live,
    };
    // Path once: title OR pill OR plain detail — never echo the same path twice.
    var renderPaths = merged.paths;
    if (merged.kind === "edit" || isPathEditTitle(merged.title)) {
      merged.kind = "edit";
      renderPaths = [];
      merged.detail = "";
    } else if (renderPaths.length) {
      var titleText = String(merged.title || "");
      var pathInTitle = renderPaths.some(function (p) { return p && titleText.indexOf(p) >= 0; });
      if (pathInTitle) {
        renderPaths = [];
        if (detailEchoesPaths(merged.detail, merged.paths)) merged.detail = "";
      } else if (detailEchoesPaths(merged.detail, renderPaths)) {
        merged.detail = "";
      }
    }
    if (!merged.live && previous.live) card.__userExpanded = false;
    card.__cardData = merged;
    card.className = "ai-agent-card kind-" + merged.kind;
    card.classList.toggle("is-live", merged.live);
    card.classList.toggle("has-body", cardHasBody(merged, renderPaths));
    card.classList.toggle("is-explore-step", key.indexOf("explore-step-") === 0);
    var header = card.querySelector(".ai-agent-card-header");
    var expandable = cardHasBody(merged, renderPaths);
    header.setAttribute("tabindex", expandable ? "0" : "-1");
    header.setAttribute("role", expandable ? "button" : "presentation");
    card.querySelector(".ai-agent-card-title").textContent = merged.title;
    // Edit cards: show +N/-M on the card itself (counted at edit time).
    card.querySelector(".ai-agent-card-meta").textContent = editCardMeta(merged, merged.meta);
    var body = card.querySelector(".ai-agent-card-body");
    body.innerHTML = "";
    if (merged.detail) {
      var detail = document.createElement("div");
      detail.textContent = merged.detail;
      body.appendChild(detail);
    }
    var showDiff = merged.diff || [];
    if (merged.kind === "edit" && showDiff.length) {
      showDiff = showDiff.map(function (d) {
        return { path: "", removed: d.removed || [], added: d.added || [] };
      });
    }
    var extraHtml = makePathsHtml(renderPaths) + makeDiffHtml(showDiff);
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
    // Don't sticky past-tense shell titles — topbar would flash Ran between tools.
    if (t === "Ran" || t === "Run") return;
    getRunMeta(msg).lastActivityTitle = t;
  }

  function noteWorking(msg, title) {
    if (!msg || !isRunning || !threadDiv.contains(msg)) return;
    if (hasOtherLiveCard(msg)) {
      removeCard(msg, "status-live");
      return;
    }
    var label = String(title || currentActivityTitle(msg)).replace(/\s·\s*\d+s\s*$/, "").trim();
    // Never mirror tool-card titles — that is the › Ran + Ran pulse flash.
    if (
      !label ||
      /^就绪/.test(label) ||
      /^(Ran|Running|Run|Edited|Editing|Wrote|Writing|Deleted|Deleting|Explored|Exploring|Fetched|Fetching|Searched|Searching|Read|Listed)\b/i.test(label)
    ) {
      label = "Thinking";
    }
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

  // Stable tool card keys — Date.now() created duplicate Ran/Edited cards when
  // Cursor omitted call_id on partial/completed events.
  function resolveToolCardKey(msg, payload, toolRunning, summary, toolView) {
    var callId = String((payload && payload.call_id) || "").trim();
    if (callId) return "tool-" + callId;

    var meta = getRunMeta(msg);

    function isToolKey(lk) {
      return (
        lk &&
        lk.indexOf("tool-") === 0 &&
        lk.indexOf("explore-") !== 0
      );
    }

    // Reuse the live tool card so partial updates cannot spawn a twin.
    var liveTools = msg.querySelectorAll(".ai-agent-card.is-live");
    for (var li = liveTools.length - 1; li >= 0; li--) {
      var lk = liveTools[li].getAttribute("data-card-key") || "";
      if (
        lk === "think-live" || lk === "plan-live" || lk === "explore-live" ||
        lk === "status-live" || lk.indexOf("explore-step-") === 0
      ) continue;
      if (isToolKey(lk)) {
        meta.inflightToolKey = lk;
        return lk;
      }
    }

    // No call_id: one in-flight slot per message (started→completed).
    if (toolRunning) {
      if (!meta.inflightToolKey) {
        meta.inflightToolKey = "tool-inflight-" + (meta.nextIndex++);
      }
      return meta.inflightToolKey;
    }
    if (meta.inflightToolKey) {
      var doneKey = meta.inflightToolKey;
      meta.inflightToolKey = "";
      return doneKey;
    }

    // Orphan completed (started lost): stable hash, never Date.now().
    var name = String((payload && payload.name) || (summary && summary.kind) || "tool").trim() || "tool";
    var hint = "";
    if (summary && summary.paths && summary.paths[0]) hint = String(summary.paths[0]);
    else if (toolView && toolView.detail) hint = String(toolView.detail).slice(0, 96);
    else if (payload && payload.args) hint = String(payload.args).slice(0, 96);
    var h = 0;
    var s = name + "\0" + hint;
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return "tool-" + name + "-" + (h >>> 0).toString(36);
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

  function appendExploredMarker(msg, worklog) {
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
      worklog: worklog || undefined,
    });
  }

  // Cursor: Exploring (live) + per-step rows → Explored N files… (collapsed).
  function finalizeExplorePhase(msg) {
    var meta = getRunMeta(msg);
    var live = cardByKey(msg, "explore-live");
    // Pin Explored where Exploring lived — never open a new worklog under mid-explore text.
    var home = (live && live.parentNode && live.parentNode.classList
      && live.parentNode.classList.contains("ai-agent-worklog"))
      ? live.parentNode
      : null;
    var hadExplore = !!meta.exploreActive || !!(meta.exploreSteps || []).length;
    var stepKeys = (meta.exploreStepKeys || []).slice();
    removeCard(msg, "explore-live");
    stepKeys.forEach(function (key) { removeCard(msg, key); });
    meta.exploreStepKeys = [];
    if (!hadExplore) {
      meta.exploreActive = false;
      meta.exploreSteps = [];
      return;
    }
    meta.needNewWorklog = false;
    appendExploredMarker(msg, home);
    meta.exploreActive = false;
    meta.exploreStartReplyLen = 0;
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
    // Consecutive identical titles (Read same file twice) collapse into one row.
    var lastStep = meta.exploreSteps.length ? meta.exploreSteps[meta.exploreSteps.length - 1] : "";
    if (lastStep === step) {
      stepKey = meta.exploreStepKeys[meta.exploreStepKeys.length - 1] || stepKey;
      var lastIdx = meta.exploreStepKeys.indexOf(stepKey);
      if (lastIdx >= 0) meta.exploreSteps[lastIdx] = step;
    } else if (meta.exploreStepKeys.indexOf(stepKey) < 0) {
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
    meta.thinkingPaused = false;
    // Cursor: skip empty brief thoughts — no card clutter.
    if (!detail && elapsed <= 2000) {
      removeCard(msg, "think-live");
      return;
    }
    if (!detail) {
      removeCard(msg, "think-live");
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
      meta.thinkingPaused = false;
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

