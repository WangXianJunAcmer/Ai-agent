/* ai-agent frontend/js/chrome.js */
  function nearBottom(threshold) {
    var gap = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight;
    return gap <= (threshold || 80);
  }

  function updateJumpButton() {
    if (!jumpBottomBtn) return;
    jumpBottomBtn.classList.toggle("visible", !stickToBottom && !nearBottom(120));
  }

  function scrollToBottom(force) {
    if (!force && !stickToBottom) {
      updateJumpButton();
      return;
    }
    var doScroll = function () {
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    };
    doScroll();
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () {
        doScroll();
        requestAnimationFrame(doScroll);
      });
    } else {
      setTimeout(doScroll, 0);
    }
    stickToBottom = true;
    updateJumpButton();
  }

  messagesDiv.addEventListener("scroll", function () {
    stickToBottom = nearBottom(80);
    updateJumpButton();
  }, { passive: true });
  if (jumpBottomBtn) {
    jumpBottomBtn.onclick = function () { scrollToBottom(true); };
  }
  if (typeof ResizeObserver === "function") {
    var scrollObserver = new ResizeObserver(function () {
      if (stickToBottom) scrollToBottom(false);
      else updateJumpButton();
    });
    scrollObserver.observe(threadDiv);
  }
  if (typeof MutationObserver === "function") {
    var mutationObserver = new MutationObserver(function () {
      if (stickToBottom) scrollToBottom(false);
      else updateJumpButton();
    });
    mutationObserver.observe(threadDiv, { childList: true, subtree: true, characterData: true });
  }

  function serializeWorklog(msg) {
    return Array.prototype.slice.call(msg.querySelectorAll(".ai-agent-card")).map(function (card) {
      var key = card.getAttribute("data-card-key") || "";
      if (key === "status-live" || key === "think-live" || key === "plan-live" || key === "explore-live") {
        return null;
      }
      var data = card.__cardData || {};
      return {
        kind: data.kind || "tool",
        title: data.title || (card.querySelector(".ai-agent-card-title") || {}).textContent || "",
        detail: data.detail || "",
        paths: data.paths || [],
        diff: data.diff || [],
      };
    }).filter(function (card) {
      return card && (card.title || card.detail);
    });
  }

  function serializeTurnChanges(msg) {
    var panel = msg.querySelector(".ai-agent-turn-changes");
    if (!panel) return null;
    // Prefer the live payload (keeps line-level diffs across refresh).
    if (panel.__turnPayload && panel.__turnPayload.files && panel.__turnPayload.files.length) {
      var cached = panel.__turnPayload;
      return {
        turn_id: panel.getAttribute("data-turn-id") || cached.turn_id || "",
        files: cached.files,
        file_count: cached.files.length,
        additions: Number(cached.additions || 0),
        deletions: Number(cached.deletions || 0),
        undoable: !!(panel.getAttribute("data-turn-id") && !panel.classList.contains("is-undone")),
        undone: panel.classList.contains("is-undone"),
      };
    }
    var files = [];
    Array.prototype.slice.call(panel.querySelectorAll(".ai-agent-turn-file")).forEach(function (row) {
      var pathEl = row.querySelector(".ai-agent-turn-file-path");
      var metaEl = row.querySelector(".ai-agent-turn-file-meta");
      var meta = (metaEl && metaEl.textContent) || "";
      var addMatch = meta.match(/\+(\d+)/);
      var delMatch = meta.match(/-(\d+)/);
      var statusEl = row.querySelector(".ai-agent-turn-file-status");
      var statusText = ((statusEl && statusEl.textContent) || meta).toLowerCase();
      files.push({
        path: (pathEl && pathEl.textContent) || "",
        status: /deleted|删除/.test(statusText) ? "deleted"
          : (/added|新建|created/.test(statusText) ? "created" : "modified"),
        additions: addMatch ? Number(addMatch[1]) : 0,
        deletions: delMatch ? Number(delMatch[1]) : 0,
        diff: [],
      });
    });
    if (!files.length) return null;
    var add = 0;
    var del = 0;
    files.forEach(function (f) { add += f.additions; del += f.deletions; });
    return {
      turn_id: panel.getAttribute("data-turn-id") || "",
      files: files,
      file_count: files.length,
      additions: add,
      deletions: del,
      // Session undo map may still hold the snapshot after refresh.
      undoable: !!(panel.getAttribute("data-turn-id") && !panel.classList.contains("is-undone")),
      undone: panel.classList.contains("is-undone"),
    };
  }

  function historyAttachmentMeta(item) {
    // Never persist base64 payloads — large images freeze the UI via
    // JSON.stringify + localStorage + conversation PUT before/during stream.
    return {
      kind: (item && item.kind) || "file",
      name: (item && item.name) || "file",
      mime_type: (item && item.mime_type) || "",
      has_data: !!(item && item.data && String(item.data).length),
    };
  }

  function collectHistoryMessages() {
    return Array.prototype.slice.call(threadDiv.querySelectorAll(".ai-agent-msg")).map(function (msg) {
      var body = msg.querySelector(".body");
      var kind = "agent";
      if (msg.classList.contains("user")) kind = "user";
      else if (msg.classList.contains("system")) kind = "system";
      var role = kind === "user" ? "You" : (kind === "system" ? "System" : "Agent");
      var attachments = [];
      if (msg.__attachments && msg.__attachments.length) {
        attachments = msg.__attachments.map(historyAttachmentMeta);
      } else {
        Array.prototype.slice.call(msg.querySelectorAll(".ai-agent-msg-images img")).forEach(function (img) {
          attachments.push({
            kind: "image",
            name: img.alt || "image",
            mime_type: "image/*",
            has_data: false,
          });
        });
        Array.prototype.slice.call(msg.querySelectorAll(".ai-agent-file-chip")).forEach(function (chip) {
          var nameEl = chip.querySelector(".name");
          attachments.push({
            kind: "file",
            name: (nameEl && nameEl.textContent) || "file",
            mime_type: chip.getAttribute("data-mime") || "",
            has_data: false,
          });
        });
      }
      return {
        role: role,
        kind: kind,
        text: (function () {
          var parts = [];
          Array.prototype.slice.call(msg.querySelectorAll(".ai-agent-segment-text, .body")).forEach(function (el) {
            if (el.classList.contains("ai-agent-worklog")) return;
            var t = el.getAttribute("data-raw-text") || el.textContent || "";
            if (t) parts.push(t);
          });
          return parts.join("\n\n");
        })(),
        markdown: kind === "agent",
        worklog: kind === "agent" ? serializeWorklog(msg) : [],
        turnChanges: kind === "agent" ? serializeTurnChanges(msg) : null,
        attachments: attachments,
      };
    });
  }

  function clearChatHistory() {
    try { localStorage.removeItem(historyStorageKey()); } catch (err) {}
    if (!activeConversationId) return;
    apiFetch(
      apiBase + "/api/conversations/" + encodeURIComponent(activeConversationId),
      { method: "DELETE" }
    )
      .then(function () {
        rememberActiveConversation(null);
        if (typeof refreshConversationList === "function") return refreshConversationList();
      })
      .catch(function () {});
  }

  var historyListRefreshTimer = null;
  function scheduleRefreshConversationList() {
    if (typeof refreshConversationList !== "function") return;
    if (historyListRefreshTimer) clearTimeout(historyListRefreshTimer);
    historyListRefreshTimer = setTimeout(function () {
      historyListRefreshTimer = null;
      refreshConversationList();
    }, 800);
  }

  function saveChatHistory(opts) {
    try {
      opts = opts || {};
      var forceStreaming = Object.prototype.hasOwnProperty.call(opts, "streaming")
        ? !!opts.streaming
        : null;
      var streaming = forceStreaming == null ? !!(isRunning || pendingFollow) : forceStreaming;
      // Pin target conversation at call time — never let a late PUT steal focus
      // or write the current thread into a previously active chat.
      var saveConvId = opts.convId != null ? opts.convId : activeConversationId;
      // DOM-based saves only while this chat is the open one.
      if (saveConvId == null || activeConversationId == null
          || Number(saveConvId) !== Number(activeConversationId)) {
        return Promise.resolve();
      }
      var eventCursor = 0;
      var slotSession = "";
      if (typeof getRunSlot === "function" && saveConvId != null) {
        try {
          var slot = getRunSlot(saveConvId);
          slotSession = (slot && slot.sessionId) || "";
          eventCursor = Number((slot && slot.eventCursor) || 0) || 0;
        } catch (e) {}
      }
      var persistSession = slotSession || sessionId || "";
      if (streaming && saveConvId != null && typeof markRunSlotBusy === "function") {
        markRunSlotBusy(saveConvId, true, persistSession || undefined);
      } else if (!streaming && saveConvId != null && typeof markRunSlotBusy === "function" && !isRunning && !pendingFollow) {
        markRunSlotBusy(saveConvId, false);
      }
      var payload = {
        bootId: serverBootId || "",
        sessionId: persistSession,
        model: modelField.value || defaultModel,
        messages: collectHistoryMessages(),
        // streaming: mid-turn; refresh must /follow (pending kept for older caches)
        streaming: streaming,
        pending: streaming,
        eventCursor: streaming ? eventCursor : 0,
        savedAt: Date.now(),
      };
      var key = historyStorageKey();
      try {
        localStorage.setItem(key, JSON.stringify(payload));
      } catch (quotaErr) {
        // Quota exceeded: drop local cache, still try server persist.
        try { localStorage.removeItem(key); } catch (e2) {}
      }
      var hasMessages = !!(payload.messages && payload.messages.length);
      // Empty placeholder stays as「新对话」until the first turn finishes.
      if (!hasMessages) return Promise.resolve();
      var persist = function (convId) {
        if (convId == null) return Promise.resolve();
        var targetId = Number(convId);
        // Re-check: user may have switched after messages were collected.
        if (Number(activeConversationId) !== targetId) return Promise.resolve();
        return apiFetch(apiBase + "/api/conversations/" + encodeURIComponent(targetId), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payload: payload,
            session_id: payload.sessionId || "",
            model: payload.model || "",
            // Do NOT send workspace_root here — affiliation is fixed at create time.
          }),
        }).then(function (res) { return res.json(); }).then(function (data) {
          if (!(data && data.conversation)) return;
          // Only touch active UI when this save is still for the open chat.
          if (Number(activeConversationId) === targetId) {
            if (data.conversation.title && chatTitleEl && !streaming) {
              var nextTitle = String(data.conversation.title || "").trim();
              // Skip placeholders — title appears after first-round auto-title.
              if (nextTitle && !(typeof isPlaceholderTitle === "function" && isPlaceholderTitle(nextTitle))) {
                chatTitleEl.textContent = nextTitle;
              }
            }
          }
          // Always refresh sidebar so auto-titles show up for the right row.
          if (streaming) scheduleRefreshConversationList();
          else if (typeof refreshConversationList === "function") refreshConversationList();
        });
      };
      return persist(saveConvId).catch(function () {});
    } catch (err) {
      // ponytail: quota / private mode — skip persistence
      return Promise.resolve();
    }
  }

  function scheduleSaveChatHistory(opts) {
    opts = opts || null;
    var scheduledConvId = (opts && opts.convId != null)
      ? opts.convId
      : activeConversationId;
    if (historySaveTimer) clearTimeout(historySaveTimer);
    historySaveTimer = setTimeout(function () {
      historySaveTimer = null;
      if (scheduledConvId == null
          || activeConversationId == null
          || Number(scheduledConvId) !== Number(activeConversationId)) {
        return;
      }
      var nextOpts = opts ? Object.assign({}, opts) : {};
      nextOpts.convId = scheduledConvId;
      saveChatHistory(nextOpts);
    }, 200);
  }

  function flushChatHistory(opts) {
    if (historySaveTimer) {
      clearTimeout(historySaveTimer);
      historySaveTimer = null;
    }
    return saveChatHistory(opts || null);
  }

  function restoreWorklog(msg, cards) {
    (cards || []).forEach(function (card, index) {
      upsertCard(msg, "restored-" + index + "-" + (card.title || "step"), {
        kind: card.kind || "tool",
        title: card.title || "Step",
        meta: "",
        detail: card.detail || "",
        paths: card.paths || [],
        live: false,
        forceCollapsed: true,
      });
    });
  }

  function readChatHistory() {
    var raw = "";
    try { raw = localStorage.getItem(historyStorageKey()) || ""; } catch (err) { return null; }
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      try { localStorage.removeItem(historyStorageKey()); } catch (e2) {}
      return null;
    }
  }

  function clearThreadMessages() {
    Array.prototype.slice.call(threadDiv.querySelectorAll(".ai-agent-msg")).forEach(function (node) {
      node.remove();
    });
  }

  function restoreChatHistory(data) {
    // Prefer explicit payload (server); fall back to user-scoped local cache.
    if (!data) data = readChatHistory();
    if (!data || !(data.messages || []).length) {
      if (data) {
        try { localStorage.removeItem(historyStorageKey()); } catch (err) {}
      }
      return { ok: false, streaming: false };
    }
    try { localStorage.setItem(historyStorageKey(), JSON.stringify(data)); } catch (err) {}
    if (data.bootId) serverBootId = data.bootId;
    if (data.sessionId) {
      sessionId = data.sessionId;
      try { localStorage.setItem(sessionStorageKey, sessionId); } catch (err) {}
    }
    if (data.model) setSelectedModel(data.model, false);
    clearThreadMessages();
    (data.messages || []).forEach(function (item) {
      var text = String(item.text || "");
      // Drop stale interruption notices saved by older clients after a bad follow.
      if (/上次回复已中断|会话已过期/.test(text) && text.replace(/\s+/g, "").length < 40) {
        var kind = item.kind || (item.role === "You" || item.role === "user" ? "user" : "agent");
        if (kind !== "user") return;
      }
      var msg = appendMessage(
        item.role || (item.kind === "user" ? "You" : "Agent"),
        text,
        item.kind || "agent",
        !!item.markdown,
        item.attachments || []
      );
      if (item.kind === "agent" || (!item.kind && item.role !== "You")) {
        restoreWorklog(msg, item.worklog || []);
        if (item.turnChanges) renderTurnChanges(msg, item.turnChanges);
      }
    });
    updateEmptyState();
    if (threadDiv.querySelector(".ai-agent-msg")) {
      scrollToBottom(true);
      var wasStreaming = !!(data.streaming || data.pending);
      return {
        ok: true,
        // sessionId may still be empty if refresh beat the first SSE event.
        streaming: !!wasStreaming,
      };
    }
    return { ok: false, streaming: false };
  }
  function asModelLabel(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (typeof value === "object") {
      // Prefer human label; id is only a fallback.
      if (typeof value.display_name === "string" && value.display_name) return value.display_name;
      if (typeof value.label === "string" && value.label) return value.label;
      if (typeof value.id === "string") return value.id;
    }
    return "";
  }

  function prettyModelId(id) {
    // composer-2.5 → Composer 2.5 (fallback before catalog loads)
    return String(id || "").split(/[-_]/).filter(Boolean).map(function (part) {
      if (/^\d+(\.\d+)*$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join(" ");
  }

  function normalizeModelOption(model) {
    if (typeof model === "string") {
      return { id: model, label: prettyModelId(model) };
    }
    var id = String((model && (model.id != null ? model.id : model.value)) || "").trim();
    if (id === "default") id = "auto";
    var label = asModelLabel(model && model.display_name)
      || asModelLabel(model && model.label)
      || (id === "auto" ? "Auto" : prettyModelId(id));
    return { id: id, label: label };
  }

  function modelLabelFor(id) {
    if (!id || id === "auto" || id === "default") return "Auto";
    for (var i = 0; i < modelOptions.length; i++) {
      if (modelOptions[i].id === id) return modelOptions[i].label || prettyModelId(id);
    }
    return prettyModelId(id);
  }

  function applyResolvedModel(payload) {
    // Keep tracking for debugging if needed, but never surface in the picker UI.
    if (!payload) return;
    var id = payload.resolved_model || "";
    if (!id || id === "auto" || id === "default") return;
    autoResolvedModel = id;
    var labeled = payload.resolved_model_label || "";
    autoResolvedLabel = (labeled && labeled !== id) ? labeled : modelLabelFor(id);
  }

  function knownModelIds() {
    return modelOptions.map(function (m) { return m.id; });
  }

  function closeModelMenu() {
    modelWrap.classList.remove("is-open");
    modelBtn.classList.remove("is-open");
    modelBtn.setAttribute("aria-expanded", "false");
  }

  function openModelMenu() {
    if (editingUserMsg) closeEditModelMenu(editingUserMsg);
    modelWrap.classList.add("is-open");
    modelBtn.classList.add("is-open");
    modelBtn.setAttribute("aria-expanded", "true");
    // First open only: refresh disk cache from Cursor; later opens use memory.
    refreshModelOptionsOnce();
  }

  function syncModelPickerUI() {
    var id = modelField.value || defaultModel;
    var isAuto = id === "auto";
    modelWrap.classList.toggle("is-auto", isAuto);
    modelAutoBtn.setAttribute("aria-checked", isAuto ? "true" : "false");
    modelLabel.textContent = modelLabelFor(id);
    if (modelAutoResolved) modelAutoResolved.textContent = "";
    modelBtn.title = modelLabelFor(id);
    Array.prototype.forEach.call(modelList.querySelectorAll(".ai-agent-model-option"), function (btn) {
      btn.classList.toggle("is-selected", !isAuto && btn.getAttribute("data-model-id") === id);
    });
  }

  function setSelectedModel(id, closeMenu) {
    var next = (id || "").trim() || defaultModel;
    // Don't remap unknown ids before catalog loads — that used to force Composer
    // over a restored DeepSeek/OpenAI pick. fillModelOptions validates later.
    if (next !== "auto") {
      lastManualModel = next;
      autoResolvedModel = "";
      autoResolvedLabel = "";
    }
    modelField.value = next;
    try { localStorage.setItem(MODEL_KEY, next); } catch (err) {}
    syncModelPickerUI();
    updateModeUI();
    if (closeMenu !== false) closeModelMenu();
  }

  function renderModelList() {
    modelList.innerHTML = "";
    modelOptions.forEach(function (model) {
      if (!model.id || model.id === "auto") return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ai-agent-model-option";
      btn.setAttribute("data-model-id", model.id);
      btn.setAttribute("role", "option");
      btn.textContent = model.label || model.id;
      btn.addEventListener("click", function () {
        setSelectedModel(model.id, true);
      });
      modelList.appendChild(btn);
    });
    syncModelPickerUI();
  }

  function fillModelOptions(options, preferred) {
    if (!Array.isArray(options) || !options.length) return;
    var seen = {};
    modelOptions = [];
    options.forEach(function (raw) {
      var model = normalizeModelOption(raw);
      if (!model.id || seen[model.id]) return;
      seen[model.id] = true;
      modelOptions.push(model);
    });
    if (providerUi.showAuto && !seen.auto) modelOptions.unshift({ id: "auto", label: "Auto" });
    var current = preferred || modelField.value || defaultModel;
    if (current !== "auto" && !seen[current]) {
      current = seen[lastManualModel] ? lastManualModel : ((function () {
        for (var i = 0; i < modelOptions.length; i++) {
          if (modelOptions[i].id !== "auto") return modelOptions[i].id;
        }
        return modelOptions[0] && modelOptions[0].id;
      })());
    }
    renderModelList();
    setSelectedModel(current, false);
    if (editingUserMsg) renderEditModelList(editingUserMsg);
  }

  // Paint from injected file cache; Cursor refresh only on first model-menu open.
  var modelCatalogFetched = false;
  var modelCatalogPromise = null;

  function loadModelOptions() {
    var cached = window.__aiAgentModelOptions;
    if (Array.isArray(cached) && cached.length > 0) {
      fillModelOptions(cached, modelField.value || defaultModel);
    }
  }

  function refreshModelOptionsOnce() {
    if (modelCatalogFetched) return Promise.resolve();
    if (modelCatalogPromise) return modelCatalogPromise;
    modelCatalogPromise = apiFetch(apiBase + "/api/models/refresh?provider=" + encodeURIComponent(provider))
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (refreshed) {
        modelCatalogFetched = true;
        if (!refreshed || !refreshed.model_options) return;
        window.__aiAgentModelOptions = refreshed.model_options;
        fillModelOptions(refreshed.model_options, modelField.value || defaultModel);
        if (refreshed.changed) {
          window.dispatchEvent(new CustomEvent("ai-agent-models-updated", {
            detail: { model_options: refreshed.model_options },
          }));
        }
      })
      .catch(function () {
        modelCatalogFetched = true;
      })
      .then(function () {
        modelCatalogPromise = null;
      });
    return modelCatalogPromise;
  }

  function maxSidebarWidth() {
    return Math.min(1200, Math.round(window.innerWidth * 0.92));
  }

  function applySidebarWidth(width, persist) {
    var w = Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxSidebarWidth(), Math.round(width)));
    sidebar.style.setProperty("--ai-sidebar-width", w + "px");
    if (persist !== false) localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
    return w;
  }

  function isFullscreen() {
    return sidebar.classList.contains("is-fullscreen");
  }

  function syncBackdrop() {
    if (!sidebar.classList.contains("open")) {
      backdrop.classList.remove("open");
      return;
    }
    if (isFullscreen()) backdrop.classList.remove("open");
    else backdrop.classList.add("open");
  }

  function syncPageScrollLock() {
    document.body.classList.toggle(
      "ai-agent-page-locked",
      sidebar.classList.contains("open") && isFullscreen()
    );
  }

  function isLandingState() {
    return !threadDiv.querySelector(".ai-agent-msg") && !sendQueue.length;
  }

  function updateEmptyState() {
    // Greeting whenever the thread is empty (sidebar + fullscreen).
    var show = isLandingState();
    sidebar.classList.toggle("is-empty", show);
    if (emptyEl) emptyEl.setAttribute("aria-hidden", show ? "false" : "true");
    // Workspace context bar is landing-only; close its picker when chat starts.
    if (!show && typeof closeContextPickers === "function") closeContextPickers();
    // Empty landing: no header title until first-round auto-title arrives.
    if (show) {
      if (chatTitleEl) chatTitleEl.textContent = "";
      if (typeof updateCrumb === "function") updateCrumb();
    }
  }

  function setFullscreen(on) {
    if (hubFullscreen) on = true; // hub Cursor UI stays full-bleed
    sidebar.classList.toggle("is-fullscreen", !!on);
    trigger.classList.toggle("is-hidden", !!on && sidebar.classList.contains("open"));
    fullscreenBtn.title = on ? "退出全屏" : "全屏";
    fullscreenBtn.setAttribute("aria-pressed", on ? "true" : "false");
    if (!hubFullscreen) localStorage.setItem(SIDEBAR_FULLSCREEN_KEY, on ? "1" : "0");
    syncBackdrop();
    syncPageScrollLock();
    updateEmptyState();
  }

  function openSidebar() {
    sidebar.classList.add("open");
    if (isFullscreen()) trigger.classList.add("is-hidden");
    if (!hubFullscreen) {
      try { localStorage.setItem(SIDEBAR_OPEN_KEY, "1"); } catch (err) {}
    }
    syncBackdrop();
    syncPageScrollLock();
  }

  function closeSidebar() {
    if (hubFullscreen) {
      // Back to provider hub on the home page.
      window.location.href = "/";
      return;
    }
    sidebar.classList.remove("open");
    backdrop.classList.remove("open");
    trigger.classList.remove("is-hidden");
    try { localStorage.setItem(SIDEBAR_OPEN_KEY, "0"); } catch (err) {}
    syncPageScrollLock();
  }

  function startSidebarResize(event) {
    if (isFullscreen()) return;
    event.preventDefault();
    var startX = event.clientX;
    var startW = sidebar.getBoundingClientRect().width;
    sidebar.classList.add("is-resizing");
    document.body.style.cursor = "ew-resize";

    function onMove(moveEvent) {
      applySidebarWidth(startW + (startX - moveEvent.clientX), true);
    }

    function onUp() {
      sidebar.classList.remove("is-resizing");
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  var savedWidth = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY) || "", 10);
  if (savedWidth) applySidebarWidth(savedWidth, false);

  trigger.onclick = openSidebar;
  if (closeBtn) closeBtn.onclick = closeSidebar;
  if (backdrop) backdrop.onclick = closeSidebar;
  fullscreenBtn.onclick = function () { setFullscreen(!isFullscreen()); };
  resizeHandle.addEventListener("mousedown", startSidebarResize);
  window.addEventListener("resize", function () {
    if (isFullscreen()) return;
    var current = sidebar.getBoundingClientRect().width;
    applySidebarWidth(current, true);
  });

  // Left Repositories / history nav: drag resize + Ctrl+B toggle (Cursor-like).
  var navEl = document.getElementById("ai-agent-nav");
  var navResizeHandle = document.getElementById("ai-agent-nav-resize");
  var navToggleBtn = document.getElementById("ai-agent-toggle-nav");
  var NAV_WIDTH_KEY = "ai-agent-nav-width:" + provider;
  var NAV_OPEN_KEY = "ai-agent-nav-open:" + provider;
  var MIN_NAV_WIDTH = 180;
  var MAX_NAV_WIDTH = 480;

  function applyNavWidth(width, persist) {
    if (!sidebar) return;
    var w = Math.max(MIN_NAV_WIDTH, Math.min(MAX_NAV_WIDTH, Math.round(width)));
    sidebar.style.setProperty("--ai-nav-width", w + "px");
    if (persist !== false) {
      try { localStorage.setItem(NAV_WIDTH_KEY, String(w)); } catch (err) {}
    }
    return w;
  }

  function isNavOpen() {
    return !!(sidebar && !sidebar.classList.contains("nav-hidden"));
  }

  function setNavOpen(on) {
    if (!sidebar) return;
    sidebar.classList.toggle("nav-hidden", !on);
    if (navToggleBtn) {
      navToggleBtn.setAttribute("aria-pressed", on ? "true" : "false");
      navToggleBtn.classList.toggle("is-on", !!on);
    }
    var pinBrand = document.getElementById("ai-agent-nav-rail-brand");
    if (pinBrand) {
      // Same pinned node in both states; only the action/label changes.
      pinBrand.title = on ? providerUi.name : "展开边栏 (Ctrl+B)";
      pinBrand.setAttribute("aria-label", on ? providerUi.name : "展开边栏");
    }
    try { localStorage.setItem(NAV_OPEN_KEY, on ? "1" : "0"); } catch (err) {}
    if (on && typeof closeRailChatsFlyout === "function") closeRailChatsFlyout();
  }

  function toggleNav() {
    setNavOpen(!isNavOpen());
  }

  function startNavResize(event) {
    if (!isFullscreen() || !isNavOpen()) return;
    event.preventDefault();
    var startX = event.clientX;
    var startW = navEl ? navEl.getBoundingClientRect().width : 260;
    sidebar.classList.add("is-nav-resizing");
    document.body.style.cursor = "ew-resize";

    function onMove(moveEvent) {
      applyNavWidth(startW + (moveEvent.clientX - startX), true);
    }

    function onUp() {
      sidebar.classList.remove("is-nav-resizing");
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  try {
    var savedNavW = parseInt(localStorage.getItem(NAV_WIDTH_KEY) || "", 10);
    if (savedNavW) applyNavWidth(savedNavW, false);
    var savedNavOpen = localStorage.getItem(NAV_OPEN_KEY);
    if (savedNavOpen === "0") setNavOpen(false);
    else setNavOpen(true);
  } catch (err) {
    setNavOpen(true);
  }

  if (navToggleBtn) navToggleBtn.onclick = function () { toggleNav(); };
  if (navResizeHandle) navResizeHandle.addEventListener("mousedown", startNavResize);

  var navRailBrand = document.getElementById("ai-agent-nav-rail-brand");
  var navRailNew = document.getElementById("ai-agent-nav-rail-new");
  var navRailAvatar = document.getElementById("ai-agent-nav-rail-avatar");
  if (navRailBrand) {
    navRailBrand.onclick = function () {
      if (!isNavOpen()) setNavOpen(true);
    };
  }
  if (navRailNew) {
    navRailNew.onclick = function () {
      var btn = document.getElementById("ai-agent-nav-new");
      if (btn) btn.click();
      else setNavOpen(true);
    };
  }
  if (navRailAvatar) {
    navRailAvatar.onclick = function () {
      setNavOpen(true);
      var logout = document.getElementById("ai-agent-logout");
      if (logout) logout.focus();
    };
  }

  document.addEventListener("keydown", function (ev) {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    if (String(ev.key || "").toLowerCase() !== "b") return;
    // Don't fight browser bookmarks when not in hub/fullscreen chat.
    if (!hubFullscreen && !isFullscreen()) return;
    ev.preventDefault();
    toggleNav();
  });

  // Slash skills (`/name`) — project skills from /api/skills + Cursor setting_sources=project.
  var skillCatalog = [];
  var slashActive = -1;
  var slashMatch = null;

  function closeSlashMenu() {
    if (!slashMenu) return;
    slashMenu.classList.remove("is-open");
    slashMenu.innerHTML = "";
    slashActive = -1;
    slashMatch = null;
  }

  function slashTokenAtCaret() {
    var text = inputField.value || "";
    var caret = typeof inputField.selectionStart === "number" ? inputField.selectionStart : text.length;
    var before = text.slice(0, caret);
    var m = before.match(/(^|[\s\n])\/([\w.-]*)$/);
    if (!m) return null;
    var query = m[2] || "";
    var start = before.length - query.length - 1;
    return { start: start, end: caret, query: query };
  }

  function filteredSkills(query) {
    var q = (query || "").toLowerCase();
    return skillCatalog.filter(function (s) {
      if (!q) return true;
      return (s.name || "").toLowerCase().indexOf(q) >= 0
        || (s.description || "").toLowerCase().indexOf(q) >= 0;
    }).slice(0, 12);
  }

  function renderSlashMenu(items) {
    if (!slashMenu) return;
    slashMenu.innerHTML = "";
    if (!items.length) {
      var empty = document.createElement("div");
      empty.className = "ai-agent-slash-empty";
      empty.textContent = skillCatalog.length ? "没有匹配的 skill" : "当前工作区未发现 skill";
      slashMenu.appendChild(empty);
      slashMenu.classList.add("is-open");
      slashActive = -1;
      return;
    }
    items.forEach(function (skill, idx) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ai-agent-slash-item" + (idx === slashActive ? " is-active" : "");
      btn.setAttribute("role", "option");
      btn.innerHTML = "<span class=\"name\"></span><span class=\"desc\"></span>";
      btn.querySelector(".name").textContent = skill.name;
      btn.querySelector(".desc").textContent = skill.description || "";
      btn.addEventListener("mousedown", function (e) {
        e.preventDefault();
        applySlashSkill(skill);
      });
      slashMenu.appendChild(btn);
    });
    slashMenu.classList.add("is-open");
  }

  function applySlashSkill(skill) {
    if (!slashMatch || !skill) return;
    var text = inputField.value || "";
    var insert = "/" + skill.name + " ";
    var next = text.slice(0, slashMatch.start) + insert + text.slice(slashMatch.end);
    inputField.value = next;
    var caret = slashMatch.start + insert.length;
    inputField.focus();
    inputField.setSelectionRange(caret, caret);
    closeSlashMenu();
    if (typeof autosizeInput === "function") autosizeInput();
    if (typeof updateComposerButtons === "function") updateComposerButtons();
  }

  function updateSlashMenu() {
    if (!slashMenu || provider !== "cursor") {
      closeSlashMenu();
      return;
    }
    slashMatch = slashTokenAtCaret();
    if (!slashMatch) {
      closeSlashMenu();
      return;
    }
    var items = filteredSkills(slashMatch.query);
    if (slashActive >= items.length) slashActive = items.length ? 0 : -1;
    if (slashActive < 0 && items.length) slashActive = 0;
    renderSlashMenu(items);
  }

  function ensureSkillsLoaded() {
    if (provider !== "cursor") return Promise.resolve([]);
    if (skillCatalog.length) return Promise.resolve(skillCatalog);
    return apiFetch(apiBase + "/api/skills")
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        skillCatalog = (data && data.skills) || [];
        return skillCatalog;
      })
      .catch(function () {
        skillCatalog = [];
        return skillCatalog;
      });
  }

  if (slashMenu && inputField && provider === "cursor") {
    ensureSkillsLoaded();
    inputField.addEventListener("input", function () {
      ensureSkillsLoaded().then(updateSlashMenu);
    });
    inputField.addEventListener("click", updateSlashMenu);
    inputField.addEventListener("keyup", function (e) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
        updateSlashMenu();
      }
    });
    inputField.addEventListener("keydown", function (e) {
      if (!slashMenu.classList.contains("is-open")) return;
      var items = filteredSkills(slashMatch && slashMatch.query);
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeSlashMenu();
        return;
      }
      if (!items.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopImmediatePropagation();
        slashActive = (slashActive + 1) % items.length;
        renderSlashMenu(items);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopImmediatePropagation();
        slashActive = (slashActive - 1 + items.length) % items.length;
        renderSlashMenu(items);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (slashActive >= 0 && slashActive < items.length) {
          e.preventDefault();
          e.stopImmediatePropagation();
          applySlashSkill(items[slashActive]);
        }
      }
    }, true);
    document.addEventListener("click", function (e) {
      if (!slashMenu.classList.contains("is-open")) return;
      if (slashMenu.contains(e.target) || e.target === inputField) return;
      closeSlashMenu();
    });
  }

  window.__aiAgentSlashMenuOpen = function () {
    return !!(slashMenu && slashMenu.classList.contains("is-open"));
  };

