/* ai-agent frontend/js/history.js — Repositories / Home grouped agents */

  var navListEl = document.getElementById("ai-agent-nav-list");
  var navEmptyEl = document.getElementById("ai-agent-nav-empty");
  var navLabelBtn = document.getElementById("ai-agent-nav-label");
  var navScrollEl = document.getElementById("ai-agent-nav-scroll");
  var railChatsBtn = document.getElementById("ai-agent-nav-rail-chats");
  var railFlyout = document.getElementById("ai-agent-nav-rail-flyout");
  var railFlyoutList = document.getElementById("ai-agent-nav-rail-flyout-list");
  var railFlyoutEmpty = document.getElementById("ai-agent-nav-rail-flyout-empty");
  var ctxWsBtn = document.getElementById("ai-agent-ctx-ws");
  var ctxWsLabel = document.getElementById("ai-agent-ctx-ws-label");
  var ctxBranchBtn = document.getElementById("ai-agent-ctx-branch");
  var ctxBranchLabel = document.getElementById("ai-agent-ctx-branch-label");
  var wsPicker = document.getElementById("ai-agent-ws-picker");
  var wsSearch = document.getElementById("ai-agent-ws-search");
  var wsRecents = document.getElementById("ai-agent-ws-recents");
  var wsRepos = document.getElementById("ai-agent-ws-repos");
  var wsPathRow = document.getElementById("ai-agent-ws-path-row");
  var wsPathInput = document.getElementById("ai-agent-ws-path-input");
  var wsPathGo = document.getElementById("ai-agent-ws-path-go");
  var wsUseExisting = document.getElementById("ai-agent-ws-use-existing");
  var wsNewFolder = document.getElementById("ai-agent-ws-new-folder");
  var wsFlyout = document.getElementById("ai-agent-ws-flyout");
  var wsOpenFolder = document.getElementById("ai-agent-ws-open-folder");
  var wsFlyoutPath = document.getElementById("ai-agent-ws-flyout-path");
  var wsFlyoutInput = document.getElementById("ai-agent-ws-flyout-input");
  var wsFlyoutGo = document.getElementById("ai-agent-ws-flyout-go");
  var wsFlyoutSearch = document.getElementById("ai-agent-ws-flyout-search");
  var wsFlyoutList = document.getElementById("ai-agent-ws-flyout-list");
  var wsUeOpenFolder = document.getElementById("ai-agent-ws-ue-open-folder");
  var wsUeSsh = document.getElementById("ai-agent-ws-ue-ssh");
  var wsFlyoutPathUe = document.getElementById("ai-agent-ws-flyout-path-ue");
  var wsUePathInput = document.getElementById("ai-agent-ws-ue-path-input");
  var wsUePathGo = document.getElementById("ai-agent-ws-ue-path-go");
  var wsSshTreeHead = document.getElementById("ai-agent-ws-ssh-tree-head");
  var wsSshTreeList = document.getElementById("ai-agent-ws-ssh-tree-list");
  var wsSshUseHere = document.getElementById("ai-agent-ws-ssh-use-here");
  var wsSshId = document.getElementById("ai-agent-ws-ssh-id");
  var wsSshLabel = document.getElementById("ai-agent-ws-ssh-label");
  var wsSshHost = document.getElementById("ai-agent-ws-ssh-host");
  var wsSshPort = document.getElementById("ai-agent-ws-ssh-port");
  var wsSshUser = document.getElementById("ai-agent-ws-ssh-user");
  var wsSshAuth = document.getElementById("ai-agent-ws-ssh-auth");
  var wsSshKey = document.getElementById("ai-agent-ws-ssh-key");
  var wsSshPass = document.getElementById("ai-agent-ws-ssh-pass");
  var wsSshDefault = document.getElementById("ai-agent-ws-ssh-default");
  var wsSshKeyWrap = document.getElementById("ai-agent-ws-ssh-key-wrap");
  var wsSshPassWrap = document.getElementById("ai-agent-ws-ssh-pass-wrap");
  var wsSshStatus = document.getElementById("ai-agent-ws-ssh-status");
  var wsSshTest = document.getElementById("ai-agent-ws-ssh-test");
  var wsSshSave = document.getElementById("ai-agent-ws-ssh-save");
  var workspaceRootsCache = [];
  var sshHostsCache = [];
  var wsPickerMode = "switch"; // switch | new-agent | add-repo
  var wsPcBtn = null;
  var wsUseExistingBtn = null;
  var wsFlyoutMode = ""; // pc | use-existing | ssh-tree | ssh-form
  var sshBrowse = { hostId: "", path: "/", label: "", uri: "" };
  var branchFetchToken = 0;
  var WS_ICON_FOLDER = '<svg class="ai-agent-ws-item-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z"></path></svg>';
  var WS_ICON_HOME = '<svg class="ai-agent-ws-item-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"></path></svg>';
  var WS_ICON_PC = '<svg class="ai-agent-ws-item-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2"></rect><path d="M8 21h8"></path><path d="M12 18v3"></path></svg>';
  var WS_ICON_SSH = '<svg class="ai-agent-ws-item-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="11" width="18" height="10" rx="2"></rect><path d="M7 11V8a5 5 0 0 1 10 0v3"></path></svg>';
  var WS_ICON_CHECK = '<svg class="ai-agent-ws-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg>';
  var REPOS_COLLAPSE_KEY = "ai-agent-repos-collapsed:" + provider;

  function isReposSectionCollapsed() {
    try { return localStorage.getItem(REPOS_COLLAPSE_KEY) === "1"; } catch (err) { return false; }
  }

  function setReposSectionCollapsed(on) {
    if (navScrollEl) navScrollEl.classList.toggle("is-repos-collapsed", !!on);
    if (navLabelBtn) {
      navLabelBtn.setAttribute("aria-expanded", on ? "false" : "true");
      navLabelBtn.title = on ? "展开仓库列表" : "折叠仓库列表";
    }
    try {
      if (on) localStorage.setItem(REPOS_COLLAPSE_KEY, "1");
      else localStorage.removeItem(REPOS_COLLAPSE_KEY);
    } catch (err) {}
  }

  setReposSectionCollapsed(isReposSectionCollapsed());
  if (navLabelBtn) {
    navLabelBtn.onclick = function () {
      setReposSectionCollapsed(!isReposSectionCollapsed());
    };
  }

  function conversationStorageKey() {
    var uid = currentUser && currentUser.id != null ? String(currentUser.id) : "anon";
    return "ai-agent-active-conversation:" + uid + ":" + provider;
  }

  function rememberActiveConversation(id) {
    activeConversationId = id == null ? null : Number(id);
    try {
      if (activeConversationId) {
        localStorage.setItem(conversationStorageKey(), String(activeConversationId));
      } else {
        localStorage.removeItem(conversationStorageKey());
      }
    } catch (err) {}
  }

  function readRememberedConversation() {
    try {
      var raw = localStorage.getItem(conversationStorageKey()) || "";
      var n = parseInt(raw, 10);
      return n > 0 ? n : null;
    } catch (err) {
      return null;
    }
  }

  function normPath(p) {
    return String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  }

  function isHomePath(p) {
    if (!p) return true;
    if (!homeWorkspaceRoot) return false;
    return normPath(p) === normPath(homeWorkspaceRoot);
  }

  function relativeTime(iso) {
    if (!iso) return "";
    var t = Date.parse(String(iso).replace(" ", "T") + "Z");
    if (!t) t = Date.parse(iso);
    if (!t) return "";
    var sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (sec < 60) return sec + "s";
    if (sec < 3600) return Math.floor(sec / 60) + "m";
    if (sec < 86400) return Math.floor(sec / 3600) + "h";
    if (sec < 86400 * 14) return Math.floor(sec / 86400) + "d";
    return Math.floor(sec / (86400 * 7)) + "w";
  }

  function repoCollapseKey(path) {
    return "ai-agent-repo-collapsed:" + provider + ":" + normPath(path || "home");
  }

  function isRepoCollapsed(path) {
    try { return localStorage.getItem(repoCollapseKey(path)) === "1"; } catch (err) { return false; }
  }

  function setRepoCollapsed(path, on) {
    try {
      if (on) localStorage.setItem(repoCollapseKey(path), "1");
      else localStorage.removeItem(repoCollapseKey(path));
    } catch (err) {}
  }

  function groupConversations(list) {
    var map = {};
    var order = [];
    function ensure(key, name, path, isHome) {
      if (!map[key]) {
        map[key] = { key: key, name: name, path: path, isHome: !!isHome, agents: [] };
        order.push(key);
      }
      return map[key];
    }
    // Always show Home first
    ensure("home", "Home", homeWorkspaceRoot || "", true);
    (list || []).forEach(function (item) {
      var root = item.workspace_root || homeWorkspaceRoot || "";
      var home = !!item.is_home || isHomePath(root);
      var key = home ? "home" : ("repo:" + normPath(root));
      var name = home ? "Home" : (item.workspace_name || root || "Project");
      var group = ensure(key, name, root, home);
      group.agents.push(item);
    });
    order.sort(function (a, b) {
      if (a === "home") return -1;
      if (b === "home") return 1;
      return (map[a].name || "").localeCompare(map[b].name || "");
    });
    return order.map(function (k) { return map[k]; });
  }

  function isRailChatsOpen() {
    return !!(railFlyout && railFlyout.classList.contains("is-on"));
  }

  function positionRailChatsFlyout() {
    if (!railFlyout || !railChatsBtn) return;
    var r = railChatsBtn.getBoundingClientRect();
    var left = r.right + 10;
    var top = Math.max(8, r.top - 10);
    railFlyout.style.left = left + "px";
    railFlyout.style.top = top + "px";
    var rect = railFlyout.getBoundingClientRect();
    var maxTop = window.innerHeight - rect.height - 8;
    if (top > maxTop) railFlyout.style.top = Math.max(8, maxTop) + "px";
    var maxLeft = window.innerWidth - rect.width - 8;
    if (left > maxLeft) railFlyout.style.left = Math.max(8, maxLeft) + "px";
  }

  function setRailChatsOpen(on) {
    if (!railFlyout) return;
    var open = !!on;
    railFlyout.classList.toggle("is-on", open);
    if (railChatsBtn) {
      railChatsBtn.classList.toggle("is-on", open);
      railChatsBtn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    if (open) {
      renderConversationList();
      positionRailChatsFlyout();
      requestAnimationFrame(positionRailChatsFlyout);
    }
  }

  function closeRailChatsFlyout() {
    setRailChatsOpen(false);
  }

  function fillConversationGroups(container, opts) {
    opts = opts || {};
    if (!container) return 0;
    container.innerHTML = "";
    var groups = groupConversations(conversationList);
    var totalAgents = 0;
    groups.forEach(function (group) {
      totalAgents += group.agents.length;
      var box = document.createElement("div");
      var collapsed = isRepoCollapsed(group.path || group.key);
      var isEmpty = !group.agents.length;
      box.className = "ai-agent-repo-group"
        + (collapsed ? " is-collapsed" : "")
        + (isEmpty ? " is-empty" : "");
      var head = document.createElement("div");
      head.className = "ai-agent-repo-head";
      var addTitle = "在 " + (group.name || "仓库") + " 新建 Agent";
      head.innerHTML =
        '<button type="button" class="ai-agent-repo-toggle">' +
          '<span class="ai-agent-repo-chevron" aria-hidden="true"></span>' +
          '<span class="ai-agent-repo-name"></span>' +
        '</button>' +
        '<span class="ai-agent-repo-count"></span>' +
        '<button type="button" class="ai-agent-repo-add" title="' + addTitle.replace(/"/g, "&quot;") + '" aria-label="' + addTitle.replace(/"/g, "&quot;") + '">' +
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10"/><path d="M3 8h10"/></svg>' +
        '</button>';
      head.querySelector(".ai-agent-repo-name").textContent = group.name;
      head.querySelector(".ai-agent-repo-count").textContent = String(group.agents.length);
      head.querySelector(".ai-agent-repo-toggle").onclick = function () {
        var next = !box.classList.contains("is-collapsed");
        box.classList.toggle("is-collapsed", next);
        setRepoCollapsed(group.path || group.key, next);
        renderConversationList();
        if (isRailChatsOpen()) positionRailChatsFlyout();
      };
      head.querySelector(".ai-agent-repo-add").onclick = function (ev) {
        ev.stopPropagation();
        createAgentInWorkspace(group.path || homeWorkspaceRoot || "", group.name || "Home");
      };
      var body = document.createElement("div");
      body.className = "ai-agent-repo-body";
      if (isEmpty) {
        var empty = document.createElement("div");
        empty.className = "ai-agent-repo-empty";
        empty.textContent = "暂无 Agent";
        body.appendChild(empty);
      } else {
        group.agents.forEach(function (item) {
          var row = document.createElement("div");
          var isActive = Number(item.id) === Number(activeConversationId);
          var isBusy = typeof isConversationBusy === "function"
            ? isConversationBusy(item.id)
            : (isActive && !!(isRunning || pendingFollow));
          row.className = "ai-agent-nav-item"
            + (isActive ? " is-active" : "")
            + (isBusy ? " is-running" : "");
          row.setAttribute("role", "button");
          row.tabIndex = 0;
          row.dataset.convId = String(item.id);
          row.innerHTML =
            '<span class="ai-agent-nav-item-spin" aria-hidden="true"></span>' +
            '<span class="ai-agent-nav-item-title"></span>' +
            '<span class="ai-agent-nav-item-time"></span>' +
            '<span class="ai-agent-nav-item-actions">' +
              '<button type="button" class="ai-agent-nav-item-action ai-agent-nav-item-more" title="更多" aria-label="更多" aria-haspopup="menu">' +
                '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="12.5" cy="8" r="1.2"/></svg>' +
              '</button>' +
            '</span>';
          row.querySelector(".ai-agent-nav-item-title").textContent = item.title || "新对话";
          row.querySelector(".ai-agent-nav-item-time").textContent = relativeTime(item.updated_at);
          row.onclick = function (ev) {
            if (ev.target && ev.target.closest && ev.target.closest(".ai-agent-nav-item-actions")) return;
            openConversation(item.id).then(function () {
              if (opts.closeOnSelect) closeRailChatsFlyout();
            });
          };
          row.onkeydown = function (ev) {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              openConversation(item.id).then(function () {
                if (opts.closeOnSelect) closeRailChatsFlyout();
              });
            }
          };
          row.querySelector(".ai-agent-nav-item-more").onclick = function (ev) {
            ev.stopPropagation();
            openNavItemMenu(ev.currentTarget, item);
          };
          body.appendChild(row);
        });
      }
      box.appendChild(head);
      box.appendChild(body);
      container.appendChild(box);
    });
    return totalAgents;
  }

  function renderConversationList() {
    if (navListEl) fillConversationGroups(navListEl, { closeOnSelect: false });
    if (railFlyoutList) fillConversationGroups(railFlyoutList, { closeOnSelect: true });
    if (navEmptyEl) navEmptyEl.style.display = "none";
    var empty = !(conversationList && conversationList.length);
    if (railFlyoutEmpty) railFlyoutEmpty.classList.toggle("is-on", empty);
    if (isRailChatsOpen()) positionRailChatsFlyout();
  }

  if (railChatsBtn) {
    railChatsBtn.onclick = function (ev) {
      ev.stopPropagation();
      var next = !isRailChatsOpen();
      if (next) {
        refreshConversationList().finally(function () { setRailChatsOpen(true); });
      } else {
        closeRailChatsFlyout();
      }
    };
  }
  document.addEventListener("mousedown", function (ev) {
    if (!isRailChatsOpen()) return;
    if (railFlyout && railFlyout.contains(ev.target)) return;
    if (railChatsBtn && railChatsBtn.contains(ev.target)) return;
    closeRailChatsFlyout();
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && isRailChatsOpen()) closeRailChatsFlyout();
  });
  window.addEventListener("resize", function () {
    if (isRailChatsOpen()) positionRailChatsFlyout();
  });

  function refreshConversationList() {
    return apiFetch(apiBase + "/api/conversations?provider=" + encodeURIComponent(provider))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        conversationList = (data && data.conversations) || [];
        // Restore sidebar spinners after refresh from persisted streaming flags.
        conversationList.forEach(function (c) {
          if (!c || !c.streaming) return;
          var existing = typeof getRunSlot === "function" ? getRunSlot(c.id) : null;
          if (existing && existing.settled) {
            if (c.session_id) existing.sessionId = c.session_id;
            return;
          }
          if (typeof markRunSlotBusy === "function") {
            markRunSlotBusy(c.id, true, c.session_id || "");
          }
        });
        renderConversationList();
        return conversationList;
      });
  }

  function ensureConversationId() {
    if (activeConversationId) {
      return Promise.resolve(activeConversationId);
    }
    var ws = activeWorkspaceRoot || homeWorkspaceRoot || undefined;
    return apiFetch(apiBase + "/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: provider,
        title: "新对话",
        workspace_root: ws,
      }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var conv = data && data.conversation;
        if (!conv || !conv.id) throw new Error("create conversation failed");
        var createdId = conv.id;
        if (typeof migrateRunSlot === "function") migrateRunSlot(null, createdId);
        rememberActiveConversation(createdId);
        setActiveWorkspace(conv.workspace_root || homeWorkspaceRoot, conv.is_home ? "Home" : conv.title);
        return refreshConversationList().then(function () {
          return activeConversationId;
        });
      });
  }

  function threadHasContent() {
    return !!(
      (threadDiv && threadDiv.querySelector(".ai-agent-msg"))
      || (sendQueue && sendQueue.length)
      || (pendingFiles && pendingFiles.length)
    );
  }

  function isPlaceholderTitle(title) {
    var t = String(title || "").trim();
    if (!t) return true;
    if (t === "新对话" || t === "Agent" || t === "新 Agent" || t === "Untitled" || t === "untitled") {
      return true;
    }
    if (/ Agent$/i.test(t)) return true;
    if (/\u2026$|\.\.\.$/.test(t)) return true;
    return false;
  }

  function isEmptyPlaceholderConv(c) {
    if (!c || c.archived) return false;
    if (c.streaming) return false;
    // Require server is_empty so we never delete a real chat that still has title「新对话」.
    if (c.is_empty !== true) return false;
    return isPlaceholderTitle(c.title);
  }

  function findEmptyPlaceholder(workspacePath, exceptId) {
    var want = normPath(workspacePath || "");
    var list = conversationList || [];
    for (var i = 0; i < list.length; i += 1) {
      var c = list[i];
      if (!isEmptyPlaceholderConv(c)) continue;
      if (exceptId != null && Number(c.id) === Number(exceptId)) continue;
      if (want && normPath(c.workspace_root || "") !== want) continue;
      return c;
    }
    return null;
  }

  function discardEmptyConversation(convId) {
    if (convId == null) return Promise.resolve();
    return apiFetch(apiBase + "/api/conversations/" + encodeURIComponent(convId), {
      method: "DELETE",
    })
      .then(function () {
        conversationList = (conversationList || []).filter(function (c) {
          return Number(c.id) !== Number(convId);
        });
        if (typeof refreshConversationList === "function") return refreshConversationList();
      })
      .catch(function () {});
  }

  function pruneExtraEmptyPlaceholders(keepId) {
    // Collapse stacked blank「新对话」: keep at most one empty per workspace (prefer keepId).
    var list = (conversationList || []).slice();
    var keep = keepId != null ? Number(keepId) : null;
    var seen = {};
    var toDelete = [];
    list.forEach(function (c) {
      if (!isEmptyPlaceholderConv(c)) return;
      var key = normPath(c.workspace_root || "") || "__none__";
      if (keep != null && Number(c.id) === keep) {
        seen[key] = Number(c.id);
        return;
      }
      if (seen[key] != null) {
        toDelete.push(c.id);
        return;
      }
      seen[key] = Number(c.id);
    });
    // Second pass: if keep claimed a workspace, drop other empties there.
    if (keep != null) {
      list.forEach(function (c) {
        if (!isEmptyPlaceholderConv(c)) return;
        if (Number(c.id) === keep) return;
        var key = normPath(c.workspace_root || "") || "__none__";
        if (seen[key] === keep) toDelete.push(c.id);
      });
    }
    var uniq = [];
    toDelete.forEach(function (id) {
      if (uniq.indexOf(Number(id)) < 0) uniq.push(Number(id));
    });
    if (!uniq.length) return Promise.resolve();
    return Promise.all(uniq.map(function (id) {
      return apiFetch(apiBase + "/api/conversations/" + encodeURIComponent(id), {
        method: "DELETE",
      }).catch(function () {});
    })).then(function () {
      if (typeof refreshConversationList === "function") return refreshConversationList();
    });
  }

  function detachActiveConversation(opts) {
    opts = opts || {};
    var leavingId = activeConversationId;
    var leavingBusy = !!(isRunning || pendingFollow || activeAbort || (sendQueue && sendQueue.length));
    var hasContent = threadHasContent() || leavingBusy;
    var leavingMeta = null;
    if (leavingId != null) {
      leavingMeta = (conversationList || []).find(function (c) {
        return Number(c.id) === Number(leavingId);
      }) || null;
    }
    // Only delete true blank placeholders. Never delete when server says it has messages
    // (DOM can be empty briefly while switching / after a failed restore).
    var canDiscardEmpty = !!(
      leavingId != null
      && !hasContent
      && (!leavingMeta || isEmptyPlaceholderConv(leavingMeta))
    );
    if (canDiscardEmpty) {
      rememberActiveConversation(null);
      var discardPromise = discardEmptyConversation(leavingId);
      sendQueue = [];
      if (typeof renderQueue === "function") renderQueue();
      if (opts.clearActive) {
        sessionId = "";
        try { localStorage.removeItem(sessionStorageKey); } catch (err) {}
      }
      if (typeof renderConversationList === "function") renderConversationList();
      return discardPromise.then(function () { return false; });
    }
    if (leavingId != null || leavingBusy || hasContent) {
      // Persist current DOM before switching away (critical for background resume).
      if (typeof flushChatHistory === "function") {
        flushChatHistory({ streaming: leavingBusy });
      }
      if (leavingId != null && typeof parkActiveRunToSlot === "function") {
        parkActiveRunToSlot(leavingId);
        if (leavingBusy && typeof markRunSlotBusy === "function") {
          markRunSlotBusy(leavingId, true, sessionId);
        }
      }
    }
    if (leavingBusy) {
      // Detach local SSE only — do NOT cancel the backend pump.
      stopRequested = false;
      sessionGeneration += 1;
      if (activeAbort) {
        try { activeAbort.abort(); } catch (err) {}
        activeAbort = null;
      }
      isRunning = false;
      pendingFollow = false;
      if (typeof stopRunElapsedTimer === "function") stopRunElapsedTimer();
    }
    sendQueue = [];
    if (typeof renderQueue === "function") renderQueue();
    if (opts.clearActive) {
      rememberActiveConversation(null);
      sessionId = "";
      try { localStorage.removeItem(sessionStorageKey); } catch (err) {}
    }
    if (typeof renderConversationList === "function") renderConversationList();
    return Promise.resolve(leavingBusy);
  }

  function openConversation(id) {
    if (!id) return Promise.resolve();
    // Already on this chat (empty or not) — do not detach/delete self.
    if (Number(id) === Number(activeConversationId)) {
      if (inputField) inputField.focus();
      return Promise.resolve();
    }
    return Promise.resolve(detachActiveConversation({ clearActive: false })).then(function () {
      return apiFetch(apiBase + "/api/conversations/" + encodeURIComponent(id))
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var conv = data && data.conversation;
          if (!conv) return;
          rememberActiveConversation(conv.id);
          setActiveWorkspace(
            conv.workspace_root || homeWorkspaceRoot,
            conv.is_home ? "Home" : (conv.title || conv.workspace_name)
          );
          var slot = typeof getRunSlot === "function" ? getRunSlot(conv.id) : null;
          sessionId = conv.session_id || (slot && slot.sessionId) || "";
          if (slot && sessionId) slot.sessionId = sessionId;
          try {
            if (sessionId) localStorage.setItem(sessionStorageKey, sessionId);
            else localStorage.removeItem(sessionStorageKey);
          } catch (err) {}
          var payload = conv.payload || null;
          if (payload && payload.model) setSelectedModel(payload.model, false);
          else if (conv.model) setSelectedModel(conv.model, false);
          clearThreadMessages();
          if (typeof ideOpenTabs !== "undefined") {
            ideOpenTabs = [];
            ideActivePath = "";
            if (typeof renderIdeTabs === "function") renderIdeTabs();
            if (typeof showIdeEditor === "function") showIdeEditor(false);
          }
          var restored = restoreChatHistory(payload);
          var slotBusy = !!(slot && (slot.busy || slot.pendingFollow || slot.settled));
          bootRestoredStreaming = !!(restored && restored.streaming) || slotBusy || !!conv.streaming;
          sendQueue = (slot && slot.sendQueue && slot.sendQueue.length) ? slot.sendQueue.slice() : [];
          queueCollapsed = !!(slot && slot.queueCollapsed);
          if (typeof renderQueue === "function") renderQueue();
          updateEmptyState();
          renderConversationList();
          if (typeof refreshIdeTree === "function") refreshIdeTree();
          if (bootRestoredStreaming) {
            if (typeof markRunSlotBusy === "function") markRunSlotBusy(conv.id, true, sessionId);
            pendingFollow = true;
            isRunning = true;
            updateRunState("继续接收");
            if (typeof followIfNeeded === "function") followIfNeeded();
          } else if (sendQueue.length && typeof drainQueue === "function") {
            updateRunState("就绪");
            drainQueue();
          } else {
            updateRunState("就绪");
          }
          if (chatTitleEl) chatTitleEl.textContent = conv.title || "新对话";
        })
        .catch(function (err) {
          console.warn("open conversation failed", err);
        });
    });
  }

  var navItemMenu = document.getElementById("ai-agent-nav-item-menu");
  var navItemMenuTarget = null;
  var navItemMenuRow = null;

  function hideNavItemMenu() {
    if (navItemMenu) {
      navItemMenu.classList.remove("is-on");
      navItemMenu.setAttribute("aria-hidden", "true");
      navItemMenu.innerHTML = "";
    }
    if (navItemMenuRow) navItemMenuRow.classList.remove("is-menu-open");
    navItemMenuTarget = null;
    navItemMenuRow = null;
  }

  function patchConversation(id, body) {
    if (!id) return Promise.resolve();
    var wasActive = Number(id) === Number(activeConversationId);
    var archiving = !!(body && body.archived);
    return apiFetch(apiBase + "/api/conversations/" + encodeURIComponent(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    })
      .then(function (res) { return res.json(); })
      .then(function () {
        return refreshConversationList().then(function () {
          if (wasActive && archiving) startNewConversationUi(true);
        });
      })
      .catch(function (err) {
        alert("操作失败：" + (err.message || err));
      });
  }

  function renameConversation(item) {
    if (!item || !item.id) return;
    hideNavItemMenu();
    var rows = document.querySelectorAll('.ai-agent-nav-item[data-conv-id="' + String(item.id) + '"]');
    var row = rows[0] || null;
    if (!row) {
      // Fallback if row not in DOM (e.g. collapsed)
      var typed = window.prompt("重命名", item.title || "新对话");
      if (typed == null) return;
      typed = String(typed).trim();
      if (!typed || typed === item.title) return;
      patchConversation(item.id, { title: typed.slice(0, 80) });
      return;
    }
    var titleEl = row.querySelector(".ai-agent-nav-item-title");
    if (!titleEl || row.classList.contains("is-renaming")) return;
    row.classList.add("is-renaming");
    var original = item.title || "新对话";
    var input = document.createElement("input");
    input.type = "text";
    input.className = "ai-agent-nav-item-rename";
    input.value = original;
    input.maxLength = 80;
    input.setAttribute("aria-label", "重命名");
    titleEl.replaceWith(input);
    var actions = row.querySelector(".ai-agent-nav-item-actions");
    var timeEl = row.querySelector(".ai-agent-nav-item-time");
    if (actions) actions.style.display = "none";
    if (timeEl) timeEl.style.display = "none";

    var finished = false;
    function finish(save) {
      if (finished) return;
      finished = true;
      var next = String(input.value || "").trim().slice(0, 80);
      row.classList.remove("is-renaming");
      if (save && next && next !== original) {
        patchConversation(item.id, { title: next });
        return;
      }
      // Restore UI without network round-trip when cancelled / unchanged
      renderConversationList();
    }
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        ev.stopPropagation();
        finish(true);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener("blur", function () { finish(true); });
    input.addEventListener("click", function (ev) { ev.stopPropagation(); });
    input.addEventListener("mousedown", function (ev) { ev.stopPropagation(); });
    requestAnimationFrame(function () {
      input.focus();
      input.select();
    });
  }

  function openNavItemMenu(anchor, item) {
    if (!navItemMenu || !anchor || !item) return;
    hideNavItemMenu();
    navItemMenuTarget = item;
    navItemMenuRow = anchor.closest(".ai-agent-nav-item");
    if (navItemMenuRow) navItemMenuRow.classList.add("is-menu-open");
    navItemMenu.innerHTML =
      '<button type="button" data-act="share" role="menuitem">' +
        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 9.5V2.5"/><path d="M5.5 4.5L8 2l2.5 2.5"/><path d="M3.5 8v4.5h9V8"/></svg>' +
        '<span>分享</span></button>' +
      '<button type="button" data-act="rename" role="menuitem">' +
        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M9.5 3.5l3 3L6 13H3v-3z"/><path d="M8 4.5l3 3"/></svg>' +
        '<span>重命名</span></button>' +
      '<button type="button" data-act="archive" role="menuitem">' +
        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2.5 4.5h11v2H2.5z"/><path d="M3.5 6.5h9V13h-9z"/><path d="M6.5 9h3"/></svg>' +
        '<span>归档</span></button>' +
      '<button type="button" data-act="delete" class="is-danger" role="menuitem">' +
        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3.5 4.5h9"/><path d="M6 4.5V3h4v1.5"/><path d="M5 6.5v6h6v-6"/></svg>' +
        '<span>删除</span></button>';
    navItemMenu.classList.add("is-on");
    navItemMenu.setAttribute("aria-hidden", "false");
    var rect = anchor.getBoundingClientRect();
    var menuW = 200;
    var left = Math.min(window.innerWidth - menuW - 8, rect.right - 20);
    var top = rect.bottom + 4;
    navItemMenu.style.left = Math.max(8, left) + "px";
    navItemMenu.style.top = top + "px";
    requestAnimationFrame(function () {
      var h = navItemMenu.offsetHeight || 0;
      if (top + h > window.innerHeight - 8) {
        navItemMenu.style.top = Math.max(8, rect.top - h - 4) + "px";
      }
    });
    navItemMenu.onclick = function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("button[data-act]") : null;
      if (!btn || !navItemMenuTarget) return;
      var act = btn.getAttribute("data-act");
      var target = navItemMenuTarget;
      hideNavItemMenu();
      if (act === "rename") renameConversation(target);
      else if (act === "archive") patchConversation(target.id, { archived: true });
      else if (act === "delete") deleteConversation(target.id);
      else if (act === "share") {
        var text = target.title || "新对话";
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            alert("已复制标题：" + text);
          }).catch(function () {
            alert(text);
          });
        } else {
          alert(text);
        }
      }
    };
  }

  document.addEventListener("mousedown", function (ev) {
    if (!navItemMenu || !navItemMenu.classList.contains("is-on")) return;
    if (navItemMenu.contains(ev.target)) return;
    if (ev.target && ev.target.closest && ev.target.closest(".ai-agent-nav-item-more")) return;
    hideNavItemMenu();
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") hideNavItemMenu();
  });
  window.addEventListener("resize", hideNavItemMenu);
  window.addEventListener("scroll", hideNavItemMenu, true);

  var confirmModal = document.getElementById("ai-agent-confirm-modal");
  var confirmTitle = document.getElementById("ai-agent-confirm-title");
  var confirmMessage = document.getElementById("ai-agent-confirm-message");
  var confirmOk = document.getElementById("ai-agent-confirm-ok");
  var confirmCancel = document.getElementById("ai-agent-confirm-cancel");
  var confirmResolve = null;

  function closeConfirmDialog(result) {
    if (!confirmModal) return;
    confirmModal.classList.remove("is-on");
    confirmModal.setAttribute("aria-hidden", "true");
    var resolve = confirmResolve;
    confirmResolve = null;
    if (resolve) resolve(!!result);
  }

  function showConfirmDialog(opts) {
    opts = opts || {};
    if (!confirmModal || !confirmOk || !confirmCancel) {
      return Promise.resolve(false);
    }
    if (confirmResolve) closeConfirmDialog(false);
    if (confirmTitle) confirmTitle.textContent = opts.title || "确认";
    if (confirmMessage) confirmMessage.textContent = opts.message || "";
    confirmOk.textContent = opts.okText || "确定";
    confirmCancel.textContent = opts.cancelText || "取消";
    confirmOk.className = opts.danger ? "danger" : "primary";
    confirmModal.classList.add("is-on");
    confirmModal.setAttribute("aria-hidden", "false");
    confirmOk.focus();
    return new Promise(function (resolve) {
      confirmResolve = resolve;
    });
  }

  if (confirmOk) {
    confirmOk.onclick = function () { closeConfirmDialog(true); };
  }
  if (confirmCancel) {
    confirmCancel.onclick = function () { closeConfirmDialog(false); };
  }
  if (confirmModal) {
    confirmModal.addEventListener("click", function (ev) {
      if (ev.target === confirmModal) closeConfirmDialog(false);
    });
  }
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    if (!confirmModal || !confirmModal.classList.contains("is-on")) return;
    ev.preventDefault();
    closeConfirmDialog(false);
  });

  function deleteConversation(id) {
    if (!id) return Promise.resolve();
    return showConfirmDialog({
      title: "删除对话",
      message: "删除后无法恢复，确定要删除这个对话吗？",
      okText: "删除",
      cancelText: "取消",
      danger: true,
    }).then(function (ok) {
      if (!ok) return;
      return apiFetch(apiBase + "/api/conversations/" + encodeURIComponent(id), {
        method: "DELETE",
      })
        .then(function () {
          var wasActive = Number(id) === Number(activeConversationId);
          return refreshConversationList().then(function () {
            if (!wasActive) return;
            startNewConversationUi(true);
          });
        })
        .catch(function (err) {
          console.warn("delete conversation failed", err);
        });
    });
  }

  function startNewConversationUi(skipConfirm) {
    // Park the current agent in the background — do not cancel its backend run.
    Promise.resolve(detachActiveConversation({ clearActive: true })).then(function () {
      sessionGeneration += 1;
      stopRequested = false;
      pendingFollow = false;
      isRunning = false;
      activeAbort = null;
      sendQueue = [];
      if (typeof clearPendingFiles === "function") clearPendingFiles(true);
      if (typeof renderQueue === "function") renderQueue();
      sessionId = "";
      try { localStorage.removeItem(sessionStorageKey); } catch (err) {}
      try { localStorage.removeItem(historyStorageKey()); } catch (err) {}
      if (!activeWorkspaceRoot) setActiveWorkspace(homeWorkspaceRoot || "", "Home");
      stoppedAgentMsg = null;
      if (typeof leaveEditMode === "function") leaveEditMode();
      clearThreadMessages();
      if (typeof stopRunElapsedTimer === "function") stopRunElapsedTimer();
      updateEmptyState();
      updateRunState("就绪");
      renderConversationList();
      if (typeof refreshIdeTree === "function") refreshIdeTree();
      if (inputField) inputField.focus();
    });
  }

  var createAgentInFlight = Promise.resolve();

  function openNewAgentFlow(opts) {
    opts = opts || {};
    closeContextPickers();
    if (opts.pickWorkspace) {
      openWorkspacePicker({ mode: "new-agent", focusPath: !!opts.focusPath });
      return;
    }
    var ws = String(opts.workspace || activeWorkspaceRoot || homeWorkspaceRoot || "").trim();
    if (!ws) {
      openWorkspacePicker({ mode: "new-agent", focusPath: true });
      return;
    }
    createAgentInWorkspace(ws, opts.name);
  }

  function createAgentInWorkspace(workspacePath, workspaceName) {
    // Serialize creates: rapid clicks previously stacked many blank「新对话」.
    var ws = String(workspacePath || "").trim() || homeWorkspaceRoot || "";
    if (!ws) {
      openWorkspacePicker({ mode: "new-agent", focusPath: true });
      return createAgentInFlight;
    }
    createAgentInFlight = createAgentInFlight.catch(function () {}).then(function () {
      setRepoCollapsed(ws, false);
      if (workspaceName) setActiveWorkspace(ws, workspaceName);
      else setActiveWorkspace(ws);
      return Promise.resolve(detachActiveConversation({ clearActive: true })).then(function () {
        return refreshConversationList();
      }).then(function () {
        // Reuse an existing empty placeholder in this workspace instead of POST again.
        var existing = findEmptyPlaceholder(ws, null);
        if (existing && existing.id) {
          clearThreadMessages();
          if (typeof clearPendingFiles === "function") clearPendingFiles(true);
          sendQueue = [];
          if (typeof renderQueue === "function") renderQueue();
          sessionId = "";
          try { localStorage.removeItem(sessionStorageKey); } catch (err) {}
          stoppedAgentMsg = null;
          if (typeof leaveEditMode === "function") leaveEditMode();
          return pruneExtraEmptyPlaceholders(existing.id).then(function () {
            return openConversation(existing.id);
          }).then(function () {
            if (chatTitleEl) chatTitleEl.textContent = "新对话";
            if (inputField) inputField.focus();
          });
        }
        clearThreadMessages();
        if (typeof clearPendingFiles === "function") clearPendingFiles(true);
        sendQueue = [];
        if (typeof renderQueue === "function") renderQueue();
        sessionId = "";
        try { localStorage.removeItem(sessionStorageKey); } catch (err) {}
        stoppedAgentMsg = null;
        if (typeof leaveEditMode === "function") leaveEditMode();
        return apiFetch(apiBase + "/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: provider,
            title: "新对话",
            workspace_root: ws,
          }),
        })
          .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
          .then(function (result) {
            if (!result.ok) {
              alert((result.data && result.data.detail) || "创建失败");
              startNewConversationUi(true);
              return;
            }
            var createdId = result.data.conversation.id;
            return refreshConversationList().then(function () {
              return pruneExtraEmptyPlaceholders(createdId);
            }).then(function () {
              return openConversation(createdId);
            }).then(function () {
              if (chatTitleEl) chatTitleEl.textContent = "新对话";
              if (inputField) inputField.focus();
            });
          });
      });
    }).catch(function () {
      alert("创建失败，请检查路径是否存在");
      startNewConversationUi(true);
    });
    return createAgentInFlight;
  }

  window.syncWorkspaceContextUi = syncWorkspaceContextUi;

  function loadWorkspaceMeta() {
    return apiFetch(apiBase + "/api/workspace/roots")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        homeWorkspaceRoot = data.home || data.default || "";
        if (!activeWorkspaceRoot) setActiveWorkspace(homeWorkspaceRoot, "Home");
        return data;
      })
      .catch(function () {
        return null;
      });
  }

  function bootstrapConversations() {
    var remembered = readRememberedConversation();
    return loadWorkspaceMeta()
      .then(function () { return refreshConversationList(); })
      .then(function (list) {
        // Clean up historically stacked blank placeholders.
        return pruneExtraEmptyPlaceholders(remembered).then(function () {
          return refreshConversationList();
        }).then(function (cleaned) {
          var rows = cleaned || conversationList || list || [];
          if (remembered && rows.some(function (c) { return Number(c.id) === Number(remembered); })) {
            return openConversation(remembered);
          }
          // Default land on Home — do not auto-open a random project agent.
          setActiveWorkspace(homeWorkspaceRoot || "", "Home");
          startNewConversationUi(true);
          if (typeof refreshIdeTree === "function") refreshIdeTree();
        });
      })
      .catch(function () {
        setActiveWorkspace(homeWorkspaceRoot || "", "Home");
        startNewConversationUi(true);
      });
  }

  function workspaceDisplayName(root) {
    var ws = String(root || "").trim();
    if (!ws) return "Home";
    if (homeWorkspaceRoot && ws.toLowerCase() === String(homeWorkspaceRoot).toLowerCase()) return "Home";
    if (isSshWorkspace(ws)) {
      var m = ws.match(/^ssh:\/\/([^/]+)(\/.*)?$/i);
      if (m) {
        var hostId = decodeURIComponent(m[1] || "");
        var remote = m[2] || "/";
        var base = remote.replace(/\/+$/, "").split("/").pop() || hostId;
        return base + " · " + hostId;
      }
    }
    var parts = ws.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || ws;
  }

  function syncWorkspaceContextUi() {
    var ws = activeWorkspaceRoot || homeWorkspaceRoot || "";
    if (ctxWsLabel) {
      // Cursor-style: No Repo is a label, never the raw home path.
      if (!ws || isHomePath(ws)) {
        ctxWsLabel.textContent = "No Repo";
        if (ctxWsBtn) ctxWsBtn.title = "No Repo";
      } else if (isSshWorkspace(ws)) {
        ctxWsLabel.textContent = workspaceDisplayName(ws);
        if (ctxWsBtn) ctxWsBtn.title = "SSH：" + ws;
      } else {
        ctxWsLabel.textContent = ws;
        if (ctxWsBtn) ctxWsBtn.title = "仓库：" + ws;
      }
    }
    refreshGitBranchLabel(ws);
  }

  function setBranchChip(branch) {
    var name = String(branch || "").trim();
    if (!ctxBranchBtn || !ctxBranchLabel) return;
    if (!name) {
      ctxBranchLabel.textContent = "";
      ctxBranchBtn.hidden = true;
      ctxBranchBtn.title = "当前分支";
      return;
    }
    ctxBranchLabel.textContent = name;
    ctxBranchBtn.hidden = false;
    ctxBranchBtn.title = "当前分支：" + name;
  }

  function refreshGitBranchLabel(ws) {
    var root = String(ws || "").trim();
    if (!root) {
      setBranchChip("");
      return;
    }
    var token = ++branchFetchToken;
    apiFetch(apiBase + "/api/workspace/git?root=" + encodeURIComponent(root))
      .then(function (res) {
        if (!res.ok) throw new Error("git status " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (token !== branchFetchToken) return;
        if (!data || !data.branch) {
          setBranchChip("");
          return;
        }
        setBranchChip(data.branch);
      })
      .catch(function () {
        // Fallback for older servers without /api/workspace/git
        if (token !== branchFetchToken) return;
        apiFetch(apiBase + "/api/workspace/exec", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            root: root,
            command: "git rev-parse --abbrev-ref HEAD",
            timeout: 8,
          }),
        })
          .then(function (res) { return res.ok ? res.json() : null; })
          .then(function (data) {
            if (token !== branchFetchToken) return;
            var out = String((data && data.output) || "").trim().split(/\r?\n/)[0] || "";
            if (!data || data.exit_code !== 0 || !out || /fatal|not a git/i.test(out)) {
              setBranchChip("");
              return;
            }
            setBranchChip(out);
          })
          .catch(function () {
            if (token !== branchFetchToken) return;
            setBranchChip("");
          });
      });
  }

  function closePcFlyout() {
    if (wsFlyout) {
      wsFlyout.classList.remove("is-on");
      wsFlyout.setAttribute("aria-hidden", "true");
    }
    if (wsFlyoutPath) wsFlyoutPath.classList.remove("is-on");
    if (wsFlyoutPathUe) wsFlyoutPathUe.classList.remove("is-on");
    if (wsPcBtn) wsPcBtn.classList.remove("is-open", "is-hot");
    if (wsUseExistingBtn) wsUseExistingBtn.classList.remove("is-open", "is-hot");
    wsFlyoutMode = "";
  }

  function setFlyoutPanel(mode) {
    wsFlyoutMode = mode || "";
    var panels = wsFlyout ? wsFlyout.querySelectorAll("[data-flyout-panel]") : [];
    panels.forEach(function (el) {
      el.classList.toggle("is-on", el.getAttribute("data-flyout-panel") === mode);
    });
  }

  function openWsFlyout(anchor, mode) {
    if (!wsFlyout) return;
    if (wsPcBtn) wsPcBtn.classList.remove("is-open", "is-hot");
    if (wsUseExistingBtn) wsUseExistingBtn.classList.remove("is-open", "is-hot");
    if (anchor) {
      anchor.classList.add("is-open", "is-hot");
      if (wsPicker) {
        var pickerRect = wsPicker.getBoundingClientRect();
        var rowRect = anchor.getBoundingClientRect();
        wsFlyout.style.top = Math.max(0, rowRect.top - pickerRect.top - 6) + "px";
      }
    }
    setFlyoutPanel(mode);
    wsFlyout.classList.add("is-on");
    wsFlyout.setAttribute("aria-hidden", "false");
  }

  function openPcFlyout(anchor) {
    wsPcBtn = anchor || wsPcBtn;
    openWsFlyout(wsPcBtn, "pc");
    loadLocalFolderList(wsFlyoutSearch ? wsFlyoutSearch.value : "");
  }

  function openUseExistingFlyout(anchor) {
    wsUseExistingBtn = anchor || wsUseExisting || wsUseExistingBtn;
    openWsFlyout(wsUseExistingBtn, "use-existing");
    if (wsFlyoutPathUe) wsFlyoutPathUe.classList.remove("is-on");
  }

  function loadLocalFolderList(query) {
    if (!wsFlyoutList) return;
    var q = String(query || "").trim();
    apiFetch(apiBase + "/api/workspace/local?q=" + encodeURIComponent(q))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        wsFlyoutList.innerHTML = "";
        var roots = (data && data.roots) || [];
        if (!roots.length) {
          var empty = document.createElement("div");
          empty.className = "ai-agent-ws-item-path";
          empty.style.padding = "6px 8px";
          empty.textContent = q ? "No matches" : "No folders";
          wsFlyoutList.appendChild(empty);
          return;
        }
        roots.forEach(function (r) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "ai-agent-ws-item";
          btn.innerHTML = WS_ICON_FOLDER
            + '<span class="ai-agent-ws-item-main"><span class="ai-agent-ws-item-name"></span>'
            + '<span class="ai-agent-ws-item-path"></span></span>';
          btn.querySelector(".ai-agent-ws-item-name").textContent = r.name || r.path || "";
          btn.querySelector(".ai-agent-ws-item-path").textContent = r.path || "";
          btn.title = r.path || "";
          btn.onclick = function () { selectWorkspacePath(r.path, r.is_home ? "No Repo" : r.name); };
          wsFlyoutList.appendChild(btn);
        });
      })
      .catch(function () {
        if (wsFlyoutList) wsFlyoutList.innerHTML = "";
      });
  }

  function closeWorkspacePicker() {
    if (!wsPicker) return;
    wsPicker.classList.remove("is-on");
    wsPicker.setAttribute("aria-hidden", "true");
    if (ctxWsBtn) {
      ctxWsBtn.classList.remove("is-open");
      ctxWsBtn.setAttribute("aria-expanded", "false");
    }
    if (wsPathRow) wsPathRow.classList.remove("is-on");
    closePcFlyout();
  }

  function closeContextPickers() {
    closeWorkspacePicker();
  }

  function isSshWorkspace(path) {
    return /^ssh:\/\//i.test(String(path || "").trim());
  }

  function makeRecentRow(r) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ai-agent-ws-item";
    var active = activeWorkspaceRoot
      && String(r.path || "").toLowerCase() === String(activeWorkspaceRoot).toLowerCase();
    if (active) btn.classList.add("is-active");
    var name = r.name || r.path || "";
    var sub = "";
    if (r.is_ssh || isSshWorkspace(r.path)) {
      sub = r.host_label || r.host_id || "SSH";
      btn.innerHTML = WS_ICON_SSH
        + '<span class="ai-agent-ws-item-main"><span class="ai-agent-ws-item-name"></span>'
        + '<span class="ai-agent-ws-item-host"></span></span>'
        + WS_ICON_CHECK;
      btn.querySelector(".ai-agent-ws-item-name").textContent = name;
      btn.querySelector(".ai-agent-ws-item-host").textContent = sub;
    } else {
      btn.innerHTML = WS_ICON_FOLDER
        + '<span class="ai-agent-ws-item-main"><span class="ai-agent-ws-item-name"></span></span>'
        + WS_ICON_CHECK;
      btn.querySelector(".ai-agent-ws-item-name").textContent = r.path || name;
    }
    btn.title = r.path || "";
    btn.onclick = function () {
      selectWorkspacePath(r.path, r.is_home ? "No Repo" : name);
    };
    return btn;
  }

  function makeSshHostRow(host) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ai-agent-ws-nav";
    btn.innerHTML = WS_ICON_SSH
      + '<span class="ai-agent-ws-item-main"><span class="ai-agent-ws-item-name"></span>'
      + '<span class="ai-agent-ws-item-host"></span></span>'
      + '<span class="ai-agent-ws-chevron-r" aria-hidden="true"></span>';
    btn.querySelector(".ai-agent-ws-item-name").textContent = host.label || host.id;
    btn.querySelector(".ai-agent-ws-item-host").textContent =
      (host.user || "") + "@" + (host.host || "") + (host.port && host.port !== 22 ? (":" + host.port) : "");
    btn.onclick = function (ev) {
      ev.stopPropagation();
      openSshTree(host);
    };
    btn.onmouseenter = function () { openSshTree(host, btn); };
    return btn;
  }

  function openSshTree(host, anchor) {
    sshBrowse.hostId = host.id;
    sshBrowse.label = host.label || host.id;
    sshBrowse.path = host.default_path || "/";
    openWsFlyout(anchor || wsPcBtn, "ssh-tree");
    loadSshTree(sshBrowse.hostId, sshBrowse.path);
  }

  function loadSshTree(hostId, path) {
    if (wsSshTreeHead) {
      wsSshTreeHead.textContent = (sshBrowse.label || hostId) + " · " + (path || "/");
    }
    if (wsSshTreeList) wsSshTreeList.innerHTML = "<div class='ai-agent-ws-item-path' style='padding:6px 8px'>Loading…</div>";
    apiFetch(apiBase + "/api/ssh/hosts/" + encodeURIComponent(hostId)
      + "/tree?path=" + encodeURIComponent(path || "/"))
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (result) {
        if (!wsSshTreeList) return;
        wsSshTreeList.innerHTML = "";
        if (!result.ok) {
          var err = document.createElement("div");
          err.className = "ai-agent-ws-item-path";
          err.style.padding = "6px 8px";
          err.textContent = (result.data && (result.data.detail || result.data.message)) || "加载失败";
          wsSshTreeList.appendChild(err);
          return;
        }
        sshBrowse.path = result.data.path || path || "/";
        sshBrowse.uri = result.data.uri || ("ssh://" + hostId + sshBrowse.path);
        if (wsSshTreeHead) {
          wsSshTreeHead.textContent = (result.data.label || hostId) + " · " + sshBrowse.path;
        }
        // Parent nav
        if (sshBrowse.path && sshBrowse.path !== "/") {
          var up = document.createElement("button");
          up.type = "button";
          up.className = "ai-agent-ws-item";
          up.innerHTML = '<span class="ai-agent-ws-item-main"><span class="ai-agent-ws-item-name">..</span></span>';
          up.onclick = function () {
            var parts = sshBrowse.path.replace(/\/+$/, "").split("/");
            parts.pop();
            var parent = parts.join("/") || "/";
            loadSshTree(hostId, parent);
          };
          wsSshTreeList.appendChild(up);
        }
        (result.data.entries || []).forEach(function (e) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "ai-agent-ws-item";
          btn.innerHTML = WS_ICON_FOLDER
            + '<span class="ai-agent-ws-item-main"><span class="ai-agent-ws-item-name"></span></span>'
            + '<span class="ai-agent-ws-chevron-r" aria-hidden="true"></span>';
          btn.querySelector(".ai-agent-ws-item-name").textContent = e.name || e.path;
          btn.onclick = function () { loadSshTree(hostId, e.path); };
          wsSshTreeList.appendChild(btn);
        });
      })
      .catch(function () {
        if (wsSshTreeList) {
          wsSshTreeList.innerHTML = "<div class='ai-agent-ws-item-path' style='padding:6px 8px'>加载失败</div>";
        }
      });
  }

  function openSshForm() {
    openWsFlyout(wsUseExistingBtn || wsUseExisting, "ssh-form");
    if (wsSshStatus) {
      wsSshStatus.textContent = "";
      wsSshStatus.className = "";
    }
    syncSshAuthFields();
  }

  function syncSshAuthFields() {
    var auth = wsSshAuth ? wsSshAuth.value : "key";
    if (wsSshKeyWrap) wsSshKeyWrap.style.display = auth === "password" ? "none" : "";
    if (wsSshPassWrap) wsSshPassWrap.style.display = auth === "password" ? "" : "none";
  }

  function collectSshForm() {
    return {
      id: wsSshId ? String(wsSshId.value || "").trim() : "",
      label: wsSshLabel ? String(wsSshLabel.value || "").trim() : "",
      host: wsSshHost ? String(wsSshHost.value || "").trim() : "",
      port: wsSshPort ? Number(wsSshPort.value || 22) : 22,
      user: wsSshUser ? String(wsSshUser.value || "").trim() : "",
      auth: wsSshAuth ? wsSshAuth.value : "key",
      key_path: wsSshKey ? String(wsSshKey.value || "").trim() : "",
      password: wsSshPass ? String(wsSshPass.value || "") : "",
      default_path: wsSshDefault ? String(wsSshDefault.value || "").trim() || "/" : "/",
    };
  }

  function setSshStatus(msg, kind) {
    if (!wsSshStatus) return;
    wsSshStatus.textContent = msg || "";
    wsSshStatus.className = kind === "err" ? "is-err" : (kind === "ok" ? "is-ok" : "");
  }

  function saveSshHostThenBrowse() {
    var payload = collectSshForm();
    if (!payload.id || !payload.host || !payload.user) {
      setSshStatus("请填写 id / host / user", "err");
      return;
    }
    setSshStatus("保存中…");
    apiFetch(apiBase + "/api/ssh/hosts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (result) {
        if (!result.ok) {
          setSshStatus((result.data && result.data.detail) || "保存失败", "err");
          return;
        }
        setSshStatus("已保存", "ok");
        var host = (result.data && result.data.host) || payload;
        return loadSshHosts().then(function () {
          renderWorkspacePickerList(wsSearch ? wsSearch.value : "");
          openSshTree(host);
        });
      })
      .catch(function () { setSshStatus("保存失败", "err"); });
  }

  function testSshHost() {
    var payload = collectSshForm();
    if (!payload.id || !payload.host || !payload.user) {
      setSshStatus("请填写 id / host / user", "err");
      return;
    }
    setSshStatus("保存并测试…");
    apiFetch(apiBase + "/api/ssh/hosts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (result) {
        if (!result.ok) {
          setSshStatus((result.data && result.data.detail) || "保存失败", "err");
          return null;
        }
        return apiFetch(apiBase + "/api/ssh/hosts/" + encodeURIComponent(payload.id) + "/test", {
          method: "POST",
        }).then(function (res) {
          return res.json().then(function (data) { return { ok: res.ok, data: data }; });
        });
      })
      .then(function (result) {
        if (!result) return;
        if (!result.ok) {
          setSshStatus((result.data && result.data.detail) || "连接失败", "err");
          return;
        }
        setSshStatus("连接成功 · " + ((result.data && result.data.default_path) || "/"), "ok");
        if (result.data && result.data.default_path && wsSshDefault && !String(wsSshDefault.value || "").trim()) {
          wsSshDefault.value = result.data.default_path;
        }
        loadSshHosts();
      })
      .catch(function () { setSshStatus("连接失败", "err"); });
  }

  function loadSshHosts() {
    return apiFetch(apiBase + "/api/ssh/hosts")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        sshHostsCache = (data && data.hosts) || [];
        return sshHostsCache;
      })
      .catch(function () {
        sshHostsCache = [];
        return [];
      });
  }

  function renderWorkspacePickerList(query) {
    var q = String(query || "").trim().toLowerCase();
    var roots = workspaceRootsCache.slice();
    var recents = roots.slice(0, 8);
    var homeRoot = roots.find(function (r) { return r.is_home; })
      || (homeWorkspaceRoot ? { path: homeWorkspaceRoot, name: "Home", is_home: true } : null);
    if (q) {
      recents = roots.filter(function (r) {
        return String(r.path || "").toLowerCase().indexOf(q) >= 0
          || String(r.name || "").toLowerCase().indexOf(q) >= 0
          || String(r.host_label || "").toLowerCase().indexOf(q) >= 0;
      });
    }
    if (wsRecents) {
      wsRecents.innerHTML = "";
      if (!recents.length) {
        var empty = document.createElement("div");
        empty.className = "ai-agent-ws-item-path";
        empty.style.padding = "6px 8px";
        empty.textContent = q ? "No matches" : "No recent folders";
        wsRecents.appendChild(empty);
      } else {
        recents.forEach(function (r) { wsRecents.appendChild(makeRecentRow(r)); });
      }
    }
    if (!wsRepos) return;
    wsRepos.innerHTML = "";
    closePcFlyout();
    // No Repo → Home workspace
    if (homeRoot && (!q || "no repo".indexOf(q) >= 0 || "home".indexOf(q) >= 0
      || String(homeRoot.path || "").toLowerCase().indexOf(q) >= 0
      || q.indexOf("no") >= 0 || q.indexOf("home") >= 0)) {
      var noRepo = document.createElement("button");
      noRepo.type = "button";
      noRepo.className = "ai-agent-ws-item";
      var homeActive = activeWorkspaceRoot
        && String(homeRoot.path || "").toLowerCase() === String(activeWorkspaceRoot).toLowerCase();
      if (homeActive) noRepo.classList.add("is-active");
      noRepo.innerHTML = WS_ICON_HOME
        + '<span class="ai-agent-ws-item-main"><span class="ai-agent-ws-item-name">No Repo</span></span>'
        + WS_ICON_CHECK;
      noRepo.onclick = function () { selectWorkspacePath(homeRoot.path, "No Repo"); };
      wsRepos.appendChild(noRepo);
    }
    // On This PC → cascading flyout
    if (!q || "on this pc".indexOf(q) >= 0 || "this pc".indexOf(q) >= 0 || "open folder".indexOf(q) >= 0) {
      var pcBtn = document.createElement("button");
      pcBtn.type = "button";
      pcBtn.className = "ai-agent-ws-nav";
      pcBtn.innerHTML = WS_ICON_PC
        + '<span class="ai-agent-ws-item-main"><span class="ai-agent-ws-item-name">On This PC</span></span>'
        + '<span class="ai-agent-ws-chevron-r" aria-hidden="true"></span>';
      pcBtn.onmouseenter = function () { openPcFlyout(pcBtn); };
      pcBtn.onclick = function (ev) {
        ev.stopPropagation();
        if (wsFlyout && wsFlyout.classList.contains("is-on") && wsFlyoutMode === "pc" && wsPcBtn === pcBtn) {
          closePcFlyout();
        } else {
          openPcFlyout(pcBtn);
        }
      };
      wsRepos.appendChild(pcBtn);
      wsPcBtn = pcBtn;
    }
    // Saved SSH hosts
    sshHostsCache.forEach(function (host) {
      if (q && String(host.label || "").toLowerCase().indexOf(q) < 0
        && String(host.id || "").toLowerCase().indexOf(q) < 0
        && String(host.host || "").toLowerCase().indexOf(q) < 0) {
        return;
      }
      wsRepos.appendChild(makeSshHostRow(host));
    });
  }

  function loadWorkspaceRootsForPicker() {
    return Promise.all([
      apiFetch(apiBase + "/api/workspace/roots")
        .then(function (res) { return res.json(); })
        .catch(function () { return null; }),
      loadSshHosts(),
    ]).then(function (pair) {
      var data = pair[0];
      if (data && data.home) homeWorkspaceRoot = data.home;
      workspaceRootsCache = (data && data.roots) || [];
      renderWorkspacePickerList(wsSearch ? wsSearch.value : "");
      return data;
    });
  }

  function openWorkspacePicker(opts) {
    opts = opts || {};
    wsPickerMode = opts.mode || "switch";
    if (!wsPicker) return;
    wsPicker.classList.add("is-on");
    wsPicker.setAttribute("aria-hidden", "false");
    if (ctxWsBtn) {
      ctxWsBtn.classList.add("is-open");
      ctxWsBtn.setAttribute("aria-expanded", "true");
    }
    if (wsSearch) wsSearch.value = "";
    if (wsPathRow) {
      wsPathRow.classList.toggle("is-on", !!opts.focusPath);
      if (opts.focusPath && wsPathInput) {
        wsPathInput.value = opts.workspace || "";
      }
    }
    loadWorkspaceRootsForPicker().then(function () {
      if (opts.focusPath && wsPathInput) wsPathInput.focus();
      else if (wsSearch) wsSearch.focus();
    });
  }

  function selectWorkspacePath(path, name) {
    var ws = String(path || "").trim();
    if (!ws) return;
    if (isSshWorkspace(ws) && String(provider || "").toLowerCase() === "cursor") {
      window.alert("Cursor Agent 不支持 SSH 远程工作区。请改用 OpenAI / DeepSeek 页面，或切换到本机文件夹。");
      // Still allow selecting so IDE/browse works; chat will refuse clearly.
    }
    closeWorkspacePicker();
    setRepoCollapsed(ws, false);
    if (wsPickerMode === "new-agent" || wsPickerMode === "add-repo") {
      createAgentInWorkspace(ws, name);
      return;
    }
    var label = name || workspaceDisplayName(ws);
    if (activeConversationId) {
      setActiveWorkspace(ws, label, { keepTitle: true });
    } else {
      setActiveWorkspace(ws, label);
      if (chatTitleEl) chatTitleEl.textContent = "新对话";
    }
    var after = function () {
      if (typeof refreshIdeTree === "function") refreshIdeTree();
      if (inputField) inputField.focus();
    };
    if (!activeConversationId) {
      after();
      return;
    }
    apiFetch(apiBase + "/api/conversations/" + encodeURIComponent(activeConversationId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_root: ws }),
    })
      .then(function () { return refreshConversationList(); })
      .then(after)
      .catch(after);
  }

  function useTypedWorkspacePath(fromFlyout) {
    var ws = "";
    if (fromFlyout && wsFlyoutInput) ws = String(wsFlyoutInput.value || "").trim();
    if (!ws && wsPathInput) ws = String(wsPathInput.value || "").trim();
    if (!ws && wsSearch) {
      var q = String(wsSearch.value || "").trim();
      if (/^[a-zA-Z]:[\\/]/.test(q) || q.indexOf("/") === 0 || q.indexOf("~") === 0
        || /^ssh:\/\//i.test(q)) ws = q;
    }
    if (!ws) {
      if (fromFlyout) {
        openPcFlyout(wsPcBtn);
        if (wsFlyoutPath) wsFlyoutPath.classList.add("is-on");
        if (wsFlyoutInput) wsFlyoutInput.focus();
      } else {
        if (wsPathRow) wsPathRow.classList.add("is-on");
        if (wsPathInput) wsPathInput.focus();
      }
      return;
    }
    selectWorkspacePath(ws);
  }

  function createFolderAndOpen() {
    var raw = window.prompt("新建文件夹名称（默认在 D:\\code 下；也可填完整路径）", "");
    if (raw == null) return;
    var name = String(raw || "").trim();
    if (!name) return;
    var parent = "D:\\code";
    var rel = name;
    if (/^[a-zA-Z]:[\\/]/.test(name) || name.indexOf("/") === 0 || name.indexOf("~") === 0) {
      var norm = name.replace(/\//g, "\\");
      var idx = norm.lastIndexOf("\\");
      if (idx <= 2) {
        alert("请提供完整文件夹路径");
        return;
      }
      parent = norm.slice(0, idx);
      rel = norm.slice(idx + 1);
    }
    function doMkdir(root, pathRel) {
      return apiFetch(apiBase + "/api/workspace/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root: root, path: pathRel }),
      }).then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      });
    }
    doMkdir(parent, rel)
      .catch(function () { return { ok: false }; })
      .then(function (result) {
        if (result && result.ok) {
          var full = (result.data && result.data.abs_path)
            || (parent.replace(/[\\\/]+$/, "") + "\\" + rel);
          selectWorkspacePath(full, rel);
          return;
        }
        // Fallback: create under Home when D:\code is unavailable.
        var fallbackRoot = homeWorkspaceRoot || "";
        if (!fallbackRoot || parent.toLowerCase() === String(fallbackRoot).toLowerCase()) {
          alert((result && result.data && result.data.detail) || "创建文件夹失败");
          return;
        }
        return doMkdir(fallbackRoot, rel).then(function (r2) {
          if (!r2.ok) {
            alert((r2.data && r2.data.detail) || "创建文件夹失败");
            return;
          }
          selectWorkspacePath((r2.data && r2.data.abs_path) || (fallbackRoot + "\\" + rel), rel);
        });
      });
  }

  if (navNewBtn) {
    navNewBtn.onclick = function () {
      openNewAgentFlow();
    };
  }
  var navAddRepoBtn = document.getElementById("ai-agent-nav-add-repo");
  var navFilterBtn = document.getElementById("ai-agent-nav-filter");
  var HIDE_EMPTY_KEY = "ai-agent-hide-empty-repos:" + provider;
  function isHideEmptyRepos() {
    try { return localStorage.getItem(HIDE_EMPTY_KEY) === "1"; } catch (err) { return false; }
  }
  function setHideEmptyRepos(on) {
    if (navScrollEl) navScrollEl.classList.toggle("is-hide-empty", !!on);
    if (navFilterBtn) {
      navFilterBtn.classList.toggle("is-on", !!on);
      navFilterBtn.setAttribute("aria-pressed", on ? "true" : "false");
      navFilterBtn.title = on ? "显示空仓库" : "隐藏空仓库";
    }
    try {
      if (on) localStorage.setItem(HIDE_EMPTY_KEY, "1");
      else localStorage.removeItem(HIDE_EMPTY_KEY);
    } catch (err) {}
  }
  setHideEmptyRepos(isHideEmptyRepos());
  if (navAddRepoBtn) {
    navAddRepoBtn.onclick = function (ev) {
      ev.stopPropagation();
      openWorkspacePicker({ mode: "add-repo", focusPath: true });
    };
  }
  if (navFilterBtn) {
    navFilterBtn.onclick = function (ev) {
      ev.stopPropagation();
      setHideEmptyRepos(!isHideEmptyRepos());
    };
  }
  if (ctxWsBtn) {
    ctxWsBtn.onclick = function (ev) {
      ev.stopPropagation();
      if (wsPicker && wsPicker.classList.contains("is-on")) closeWorkspacePicker();
      else openWorkspacePicker({ mode: "switch" });
    };
  }
  if (wsSearch) {
    wsSearch.addEventListener("input", function () {
      renderWorkspacePickerList(wsSearch.value);
    });
    wsSearch.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        useTypedWorkspacePath();
      }
    });
  }
  if (wsUseExisting) {
    wsUseExisting.onclick = function (ev) {
      ev.stopPropagation();
      if (wsFlyout && wsFlyout.classList.contains("is-on") && wsFlyoutMode === "use-existing") {
        closePcFlyout();
        return;
      }
      openUseExistingFlyout(wsUseExisting);
    };
    wsUseExisting.onmouseenter = function () {
      openUseExistingFlyout(wsUseExisting);
    };
  }
  if (wsNewFolder) {
    wsNewFolder.onclick = function (ev) {
      ev.stopPropagation();
      closePcFlyout();
      createFolderAndOpen();
    };
  }
  if (wsPathGo) {
    wsPathGo.onclick = function (ev) {
      ev.stopPropagation();
      useTypedWorkspacePath(false);
    };
  }
  if (wsPathInput) {
    wsPathInput.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        useTypedWorkspacePath(false);
      }
    });
  }
  if (wsOpenFolder) {
    wsOpenFolder.onclick = function (ev) {
      ev.stopPropagation();
      if (wsFlyoutPath) wsFlyoutPath.classList.add("is-on");
      if (wsFlyoutInput) {
        wsFlyoutInput.value = isSshWorkspace(activeWorkspaceRoot) ? "" : (activeWorkspaceRoot || "");
        wsFlyoutInput.focus();
        wsFlyoutInput.select();
      }
    };
  }
  if (wsFlyoutSearch) {
    wsFlyoutSearch.addEventListener("input", function () {
      loadLocalFolderList(wsFlyoutSearch.value);
    });
  }
  if (wsUeOpenFolder) {
    wsUeOpenFolder.onclick = function (ev) {
      ev.stopPropagation();
      if (wsFlyoutPathUe) wsFlyoutPathUe.classList.add("is-on");
      if (wsUePathInput) {
        wsUePathInput.value = isSshWorkspace(activeWorkspaceRoot) ? "" : (activeWorkspaceRoot || "");
        wsUePathInput.focus();
        wsUePathInput.select();
      }
    };
  }
  if (wsUePathGo) {
    wsUePathGo.onclick = function (ev) {
      ev.stopPropagation();
      var ws = wsUePathInput ? String(wsUePathInput.value || "").trim() : "";
      if (!ws) {
        if (wsFlyoutPathUe) wsFlyoutPathUe.classList.add("is-on");
        if (wsUePathInput) wsUePathInput.focus();
        return;
      }
      selectWorkspacePath(ws);
    };
  }
  if (wsUePathInput) {
    wsUePathInput.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        if (wsUePathGo) wsUePathGo.click();
      }
    });
  }
  if (wsUeSsh) {
    wsUeSsh.onclick = function (ev) {
      ev.stopPropagation();
      openSshForm();
    };
  }
  if (wsSshAuth) {
    wsSshAuth.onchange = function () { syncSshAuthFields(); };
  }
  if (wsSshTest) {
    wsSshTest.onclick = function (ev) {
      ev.stopPropagation();
      testSshHost();
    };
  }
  if (wsSshSave) {
    wsSshSave.onclick = function (ev) {
      ev.stopPropagation();
      saveSshHostThenBrowse();
    };
  }
  if (wsSshUseHere) {
    wsSshUseHere.onclick = function (ev) {
      ev.stopPropagation();
      var uri = sshBrowse.uri || ("ssh://" + sshBrowse.hostId + (sshBrowse.path || "/"));
      var name = workspaceDisplayName(uri);
      selectWorkspacePath(uri, name);
    };
  }
  if (wsFlyoutGo) {
    wsFlyoutGo.onclick = function (ev) {
      ev.stopPropagation();
      useTypedWorkspacePath(true);
    };
  }
  if (wsFlyoutInput) {
    wsFlyoutInput.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        useTypedWorkspacePath(true);
      }
    });
  }
  if (wsFlyout) {
    wsFlyout.addEventListener("click", function (ev) { ev.stopPropagation(); });
    wsFlyout.addEventListener("mouseenter", function () {
      if (wsPcBtn) wsPcBtn.classList.add("is-hot");
      if (wsUseExistingBtn) wsUseExistingBtn.classList.add("is-hot");
    });
  }
  if (wsPicker) {
    wsPicker.addEventListener("click", function (ev) { ev.stopPropagation(); });
  }
  document.addEventListener("click", function () {
    closeContextPickers();
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    closeContextPickers();
  });
  syncWorkspaceContextUi();
