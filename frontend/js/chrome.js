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
      };
    }).filter(function (card) {
      return card && (card.title || card.detail);
    });
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
        attachments = msg.__attachments.map(function (item) {
          return {
            kind: item.kind || "file",
            name: item.name || "file",
            mime_type: item.mime_type || "",
            data: item.data || "",
          };
        });
      } else {
        Array.prototype.slice.call(msg.querySelectorAll(".ai-agent-msg-images img")).forEach(function (img) {
          attachments.push({ kind: "image", name: img.alt || "image", mime_type: "image/*" });
        });
        Array.prototype.slice.call(msg.querySelectorAll(".ai-agent-file-chip")).forEach(function (chip) {
          var nameEl = chip.querySelector(".name");
          attachments.push({
            kind: "file",
            name: (nameEl && nameEl.textContent) || "file",
            mime_type: chip.getAttribute("data-mime") || "",
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
        attachments: attachments,
      };
    });
  }

  function clearChatHistory() {
    try { localStorage.removeItem(HISTORY_KEY); } catch (err) {}
  }

  function saveChatHistory(opts) {
    try {
      var forceStreaming = opts && Object.prototype.hasOwnProperty.call(opts, "streaming")
        ? !!opts.streaming
        : null;
      var streaming = forceStreaming == null ? !!isRunning : forceStreaming;
      var payload = {
        bootId: serverBootId || "",
        sessionId: sessionId || "",
        model: modelField.value || defaultModel,
        messages: collectHistoryMessages(),
        // streaming: mid-turn; refresh must /follow (pending kept for older caches)
        streaming: streaming,
        pending: streaming,
        savedAt: Date.now(),
      };
      localStorage.setItem(HISTORY_KEY, JSON.stringify(payload));
    } catch (err) {
      // ponytail: quota / private mode — skip persistence
    }
  }

  function scheduleSaveChatHistory() {
    if (historySaveTimer) clearTimeout(historySaveTimer);
    historySaveTimer = setTimeout(function () {
      historySaveTimer = null;
      saveChatHistory();
    }, 200);
  }

  function flushChatHistory(opts) {
    if (historySaveTimer) {
      clearTimeout(historySaveTimer);
      historySaveTimer = null;
    }
    saveChatHistory(opts || null);
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
    try { raw = localStorage.getItem(HISTORY_KEY) || ""; } catch (err) { return null; }
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      clearChatHistory();
      return null;
    }
  }

  function clearThreadMessages() {
    Array.prototype.slice.call(threadDiv.querySelectorAll(".ai-agent-msg")).forEach(function (node) {
      node.remove();
    });
  }

  function restoreChatHistory() {
    // Sync paint from localStorage — no /api/health gate.
    var data = readChatHistory();
    if (!data || !(data.messages || []).length) {
      if (data) clearChatHistory();
      return { ok: false, streaming: false };
    }
    if (data.bootId) serverBootId = data.bootId;
    if (data.sessionId) {
      sessionId = data.sessionId;
      try { localStorage.setItem(sessionStorageKey, sessionId); } catch (err) {}
    }
    if (data.model) setSelectedModel(data.model, false);
    clearThreadMessages();
    (data.messages || []).forEach(function (item) {
      var msg = appendMessage(
        item.role || (item.kind === "user" ? "You" : "Agent"),
        item.text || "",
        item.kind || "agent",
        !!item.markdown,
        item.attachments || []
      );
      if (item.kind === "agent" || (!item.kind && item.role !== "You")) {
        restoreWorklog(msg, item.worklog || []);
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
    var ids = knownModelIds();
    if (next !== "auto" && modelOptions.length && ids.indexOf(next) < 0) {
      next = ids.indexOf(lastManualModel) >= 0 ? lastManualModel : (ids[0] || defaultModel);
    }
    if (next !== "auto") {
      lastManualModel = next;
      autoResolvedModel = "";
      autoResolvedLabel = "";
    }
    modelField.value = next;
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
    modelCatalogPromise = fetch(apiBase + "/api/models/refresh?provider=" + encodeURIComponent(provider))
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (refreshed) {
        modelCatalogFetched = true;
        if (!refreshed || !refreshed.model_options) return;
        window.__aiAgentModelOptions = refreshed.model_options;
        if (refreshed.changed) {
          fillModelOptions(refreshed.model_options, modelField.value || defaultModel);
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
  closeBtn.onclick = closeSidebar;
  backdrop.onclick = closeSidebar;
  fullscreenBtn.onclick = function () { setFullscreen(!isFullscreen()); };
  resizeHandle.addEventListener("mousedown", startSidebarResize);
  window.addEventListener("resize", function () {
    if (isFullscreen()) return;
    var current = sidebar.getBoundingClientRect().width;
    applySidebarWidth(current, true);
  });

