/* coding-agent frontend/js/history.js — Repositories / Home grouped agents */

  var navListEl = document.getElementById("coding-agent-nav-list");
  var navEmptyEl = document.getElementById("coding-agent-nav-empty");
  var navLabelBtn = document.getElementById("coding-agent-nav-label");
  var navScrollEl = document.getElementById("coding-agent-nav-scroll");
  var railChatsBtn = document.getElementById("coding-agent-nav-rail-chats");
  var railFlyout = document.getElementById("coding-agent-nav-rail-flyout");
  var railFlyoutList = document.getElementById("coding-agent-nav-rail-flyout-list");
  var railFlyoutEmpty = document.getElementById("coding-agent-nav-rail-flyout-empty");
  var ctxWsBtn = document.getElementById("coding-agent-ctx-ws");
  var ctxWsLabel = document.getElementById("coding-agent-ctx-ws-label");
  var ctxBranchBtn = document.getElementById("coding-agent-ctx-branch");
  var ctxBranchLabel = document.getElementById("coding-agent-ctx-branch-label");
  var wsPicker = document.getElementById("coding-agent-ws-picker");
  var wsSearch = document.getElementById("coding-agent-ws-search");
  var wsRecents = document.getElementById("coding-agent-ws-recents");
  var wsRepos = document.getElementById("coding-agent-ws-repos");
  var wsPathRow = document.getElementById("coding-agent-ws-path-row");
  var wsPathInput = document.getElementById("coding-agent-ws-path-input");
  var wsPathGo = document.getElementById("coding-agent-ws-path-go");
  var wsUseExisting = document.getElementById("coding-agent-ws-use-existing");
  var wsNewFolder = document.getElementById("coding-agent-ws-new-folder");
  var wsFlyout = document.getElementById("coding-agent-ws-flyout");
  var wsOpenFolder = document.getElementById("coding-agent-ws-open-folder");
  var wsFlyoutPath = document.getElementById("coding-agent-ws-flyout-path");
  var wsFlyoutInput = document.getElementById("coding-agent-ws-flyout-input");
  var wsFlyoutGo = document.getElementById("coding-agent-ws-flyout-go");
  var wsFlyoutSearch = document.getElementById("coding-agent-ws-flyout-search");
  var wsFlyoutList = document.getElementById("coding-agent-ws-flyout-list");
  var wsUeOpenFolder = document.getElementById("coding-agent-ws-ue-open-folder");
  var wsUeSsh = document.getElementById("coding-agent-ws-ue-ssh");
  var wsFlyoutPathUe = document.getElementById("coding-agent-ws-flyout-path-ue");
  var wsUePathInput = document.getElementById("coding-agent-ws-ue-path-input");
  var wsUePathGo = document.getElementById("coding-agent-ws-ue-path-go");
  var wsSshTreeHead = document.getElementById("coding-agent-ws-ssh-tree-head");
  var wsSshTreeList = document.getElementById("coding-agent-ws-ssh-tree-list");
  var wsSshSearch = document.getElementById("coding-agent-ws-ssh-search");
  var wsSshUseHere = document.getElementById("coding-agent-ws-ssh-use-here");
  var wsSshId = document.getElementById("coding-agent-ws-ssh-id");
  var wsSshLabel = document.getElementById("coding-agent-ws-ssh-label");
  var wsSshHost = document.getElementById("coding-agent-ws-ssh-host");
  var wsSshPort = document.getElementById("coding-agent-ws-ssh-port");
  var wsSshUser = document.getElementById("coding-agent-ws-ssh-user");
  var wsSshAuth = document.getElementById("coding-agent-ws-ssh-auth");
  var wsSshKey = document.getElementById("coding-agent-ws-ssh-key");
  var wsSshPass = document.getElementById("coding-agent-ws-ssh-pass");
  var wsSshDefault = document.getElementById("coding-agent-ws-ssh-default");
  var wsSshKeyWrap = document.getElementById("coding-agent-ws-ssh-key-wrap");
  var wsSshPassWrap = document.getElementById("coding-agent-ws-ssh-pass-wrap");
  var wsSshStatus = document.getElementById("coding-agent-ws-ssh-status");
  var wsSshTest = document.getElementById("coding-agent-ws-ssh-test");
  var wsSshSave = document.getElementById("coding-agent-ws-ssh-save");
  var workspaceRootsCache = [];
  var sshHostsCache = [];
  var wsPickerMode = "switch"; // switch | new-agent | add-repo
  var wsPcBtn = null;
  var wsUseExistingBtn = null;
  var wsFlyoutMode = ""; // pc | use-existing | ssh-tree | ssh-form
  var wsFlyoutAnchor = null;
  var sshBrowse = { hostId: "", path: "/", label: "", uri: "" };
  var sshTreeEntries = []; // last loaded dir entries for client-side Search filter
  // Already-listed remote dirs — Search is client-side; avoid re-SSH on hover/nav.
  var sshTreeCache = {}; // key hostId|path → { entries, path, uri, label, at }
  var SSH_TREE_CACHE_MS = 120000;
  var sshSearchJumpTimer = null;
  var branchFetchToken = 0;
  var WS_ICON_FOLDER = '<svg class="coding-agent-ws-item-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z"></path></svg>';
  var WS_ICON_HOME = '<svg class="coding-agent-ws-item-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"></path></svg>';
  var WS_ICON_PC = '<svg class="coding-agent-ws-item-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2"></rect><path d="M8 21h8"></path><path d="M12 18v3"></path></svg>';
  // Cursor-style remote host (server), not a padlock.
  var WS_ICON_SSH = '<svg class="coding-agent-ws-item-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="2" width="20" height="8" rx="2"></rect><rect x="2" y="14" width="20" height="8" rx="2"></rect><circle cx="6" cy="6" r="1" fill="currentColor" stroke="none"></circle><circle cx="6" cy="18" r="1" fill="currentColor" stroke="none"></circle></svg>';
  var WS_ICON_CHECK = '<svg class="coding-agent-ws-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg>';
  var REPOS_COLLAPSE_KEY = "coding-agent-repos-collapsed:" + provider;

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
    return "coding-agent-active-conversation:" + uid + ":" + provider;
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

  // Last non-Home repo the user focused (sidebar group / opened agent).
  // Last non-home repo the user focused (sidebar group). Per-repo「+」uses the group path
  // directly; top「新建 Agent」defaults to No Repo and ignores this.
  var focusedRepoPath = "";

  function focusRepoWorkspace(path, name) {
    var ws = String(path || "").trim();
    if (!ws) return;
    if (!isHomePath(ws)) focusedRepoPath = ws;
    setRepoCollapsed(ws, false);
    // Only keep chat title when a real conversation is open; empty landing must not
    // keep a previous agent auto-title (e.g. first-message residue).
    var keepTitle = !!(
      activeConversationId
      && sidebar
      && !sidebar.classList.contains("is-empty")
    );
    setActiveWorkspace(ws, name || workspaceDisplayName(ws), { keepTitle: keepTitle });
    if (typeof refreshIdeTree === "function") refreshIdeTree();
    if (!keepTitle && typeof updateCrumb === "function") updateCrumb();
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
    return "coding-agent-repo-collapsed:" + provider + ":" + normPath(path || "home");
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
      // Always derive from path — never trust stale API workspace_name ("wxj_40 · wxj_40").
      var name = home ? "Home" : (workspaceDisplayName(root) || item.workspace_name || root || "Project");
      var group = ensure(key, name, root, home);
      // Keep the freshest computed label if group already existed with a bad name.
      if (!home && name) group.name = name;
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
      var groupLabel = group.isHome
        ? "Home"
        : (workspaceDisplayName(group.path) || group.name || "Project");
      box.className = "coding-agent-repo-group"
        + (collapsed ? " is-collapsed" : "")
        + (isEmpty ? " is-empty" : "");
      var head = document.createElement("div");
      head.className = "coding-agent-repo-head";
      var addTitle = "在 " + (groupLabel || "仓库") + " 新建 Agent";
      head.innerHTML =
        '<button type="button" class="coding-agent-repo-toggle">' +
          '<span class="coding-agent-repo-chevron" aria-hidden="true"></span>' +
          '<span class="coding-agent-repo-name"></span>' +
        '</button>' +
        '<span class="coding-agent-repo-count"></span>' +
        '<button type="button" class="coding-agent-repo-add" title="' + addTitle.replace(/"/g, "&quot;") + '" aria-label="' + addTitle.replace(/"/g, "&quot;") + '">' +
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10"/><path d="M3 8h10"/></svg>' +
        '</button>';
      head.querySelector(".coding-agent-repo-name").textContent = groupLabel;
      head.querySelector(".coding-agent-repo-count").textContent = String(group.agents.length);
      head.querySelector(".coding-agent-repo-toggle").onclick = function () {
        // Focusing the group updates workspace context for IDE / picker; top「新建 Agent」
        // still defaults to No Repo unless the user picks a repo.
        if (group.path) focusRepoWorkspace(group.path, groupLabel);
        var next = !box.classList.contains("is-collapsed");
        box.classList.toggle("is-collapsed", next);
        setRepoCollapsed(group.path || group.key, next);
        renderConversationList();
        if (isRailChatsOpen()) positionRailChatsFlyout();
      };
      head.querySelector(".coding-agent-repo-add").onclick = function (ev) {
        ev.stopPropagation();
        var ws = group.path || homeWorkspaceRoot || "";
        if (ws && !isHomePath(ws)) focusedRepoPath = ws;
        createAgentInWorkspace(ws, groupLabel || "Home");
      };
      var body = document.createElement("div");
      body.className = "coding-agent-repo-body";
      if (isEmpty) {
        var empty = document.createElement("div");
        empty.className = "coding-agent-repo-empty";
        empty.textContent = "暂无 Agent";
        body.appendChild(empty);
      } else {
        group.agents.forEach(function (item) {
          var row = document.createElement("div");
          var isActive = Number(item.id) === Number(activeConversationId);
          var isBusy = typeof isConversationBusy === "function"
            ? isConversationBusy(item.id)
            : (isActive && !!(isRunning || pendingFollow));
          row.className = "coding-agent-nav-item"
            + (isActive ? " is-active" : "")
            + (isBusy ? " is-running" : "");
          row.setAttribute("role", "button");
          row.tabIndex = 0;
          row.dataset.convId = String(item.id);
          row.innerHTML =
            '<span class="coding-agent-nav-item-spin" aria-hidden="true"></span>' +
            '<span class="coding-agent-nav-item-title"></span>' +
            '<span class="coding-agent-nav-item-time"></span>' +
            '<span class="coding-agent-nav-item-actions">' +
              '<button type="button" class="coding-agent-nav-item-action coding-agent-nav-item-more" title="更多" aria-label="更多" aria-haspopup="menu">' +
                '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="12.5" cy="8" r="1.2"/></svg>' +
              '</button>' +
            '</span>';
          row.querySelector(".coding-agent-nav-item-title").textContent = item.title || "新对话";
          row.querySelector(".coding-agent-nav-item-time").textContent = relativeTime(item.updated_at);
          row.onmouseenter = function () { showNavTip(row, item); };
          row.onmouseleave = function () { hideNavTip(); };
          row.onclick = function (ev) {
            hideNavTip();
            if (Date.now() < ignoreNavItemClickUntil) return;
            if (ev.target && ev.target.closest && ev.target.closest(".coding-agent-nav-item-actions")) return;
            openConversation(item.id).then(function () {
              if (opts.closeOnSelect) closeRailChatsFlyout();
            });
          };
          row.onkeydown = function (ev) {
            if (Date.now() < ignoreNavItemClickUntil) return;
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              openConversation(item.id).then(function () {
                if (opts.closeOnSelect) closeRailChatsFlyout();
              });
            }
          };
          var moreBtn = row.querySelector(".coding-agent-nav-item-more");
          moreBtn.onmousedown = function (ev) { ev.stopPropagation(); };
          moreBtn.onclick = function (ev) {
            ev.preventDefault();
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
    if (railFlyoutEmpty) railFlyoutEmpty.classList.remove("is-on");
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
    // Menu / confirm are portaled outside the flyout — keep flyout open while using them.
    var menuEl = document.getElementById("coding-agent-nav-item-menu");
    var confirmEl = document.getElementById("coding-agent-confirm-modal");
    if (menuEl && menuEl.contains(ev.target)) return;
    if (confirmEl && confirmEl.contains(ev.target)) return;
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

  var createAgentInFlight = Promise.resolve();
  var conversationSwitchInFlight = Promise.resolve();
  var conversationSwitching = false;

  function whenConversationReady() {
    return Promise.resolve(conversationSwitchInFlight).catch(function () {}).then(function () {
      return Promise.resolve(createAgentInFlight).catch(function () {});
    });
  }

  function ensureConversationId() {
    if (activeConversationId) {
      return Promise.resolve(activeConversationId);
    }
    // Default No Repo (home). Only keep a non-home workspace if the user already selected one.
    var cur = String(activeWorkspaceRoot || "").trim();
    var ws = cur || homeWorkspaceRoot || undefined;
    var ensureGen = sessionGeneration;
    var ensureWs = String(ws || "").trim();
    // Serialize with createAgentInWorkspace so rapid Home/+ clicks don't race this POST.
    var run = function () {
      if (activeConversationId) return Promise.resolve(activeConversationId);
      if (ensureGen !== sessionGeneration) return Promise.resolve(activeConversationId);
      return apiFetch(apiBase + "/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: provider,
          title: "新对话",
          workspace_root: ensureWs || undefined,
        }),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var conv = data && data.conversation;
          if (!conv || !conv.id) throw new Error("create conversation failed");
          var createdId = conv.id;
          // User already opened/created another chat while this POST was in flight.
          if (ensureGen !== sessionGeneration) {
            return activeConversationId;
          }
          if (activeConversationId != null && Number(activeConversationId) !== Number(createdId)) {
            return activeConversationId;
          }
          if (typeof migrateRunSlot === "function") migrateRunSlot(null, createdId);
          rememberActiveConversation(createdId);
          setActiveWorkspace(
            conv.workspace_root || homeWorkspaceRoot,
            conv.is_home ? "Home" : workspaceDisplayName(conv.workspace_root || homeWorkspaceRoot),
            { keepTitle: true }
          );
          return refreshConversationList().then(function () {
            return activeConversationId;
          });
        });
    };
    if (typeof createAgentInFlight !== "undefined" && createAgentInFlight && createAgentInFlight.then) {
      createAgentInFlight = createAgentInFlight.catch(function () {}).then(run);
      return createAgentInFlight;
    }
    return run();
  }

  function threadHasContent() {
    return !!(
      (threadDiv && threadDiv.querySelector(".coding-agent-msg"))
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
      && Number(leavingId) !== Number(suppressDiscardConvId)
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
      // Await so a quick reopen cannot GET a stale empty payload.
      var flushDone = Promise.resolve();
      if (typeof flushChatHistory === "function") {
        flushDone = Promise.resolve(
          flushChatHistory({ streaming: leavingBusy, convId: leavingId })
        ).catch(function () {});
      }
      if (leavingId != null && typeof parkActiveRunToSlot === "function") {
        parkActiveRunToSlot(leavingId);
        if (leavingBusy && typeof markRunSlotBusy === "function") {
          // Keep the parked slot's own session — do not pass global sessionId.
          markRunSlotBusy(leavingId, true);
        }
      }
      // Always invalidate in-flight UI callbacks (even when leaving an idle chat).
      sessionGeneration += 1;
      if (leavingBusy) {
        // Detach local SSE only — do NOT cancel the backend pump.
        stopRequested = false;
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
      return flushDone.then(function () { return leavingBusy; });
    }
    // Always invalidate in-flight UI callbacks (even when leaving an idle chat).
    sessionGeneration += 1;
    if (leavingBusy) {
      // Detach local SSE only — do NOT cancel the backend pump.
      stopRequested = false;
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
    if (Number(id) === Number(activeConversationId) && !conversationSwitching) {
      if (inputField) inputField.focus();
      return Promise.resolve();
    }
    var targetId = Number(id);
    conversationSwitching = true;
    conversationSwitchInFlight = Promise.resolve(detachActiveConversation({ clearActive: false }))
      .then(function () {
        // Drop active id during load so sendMessage cannot target the previous chat.
        rememberActiveConversation(null);
        sessionId = "";
        try { localStorage.removeItem(sessionStorageKey); } catch (err) {}
        isRunning = false;
        pendingFollow = false;
        sendQueue = [];
        if (typeof renderQueue === "function") renderQueue();
        return apiFetch(apiBase + "/api/conversations/" + encodeURIComponent(targetId));
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
          var conv = data && data.conversation;
          if (!conv) return;
          rememberActiveConversation(conv.id);
          setActiveWorkspace(
            conv.workspace_root || homeWorkspaceRoot,
            conv.is_home ? "Home" : workspaceDisplayName(conv.workspace_root || homeWorkspaceRoot),
            { keepTitle: true }
          );
          if (conv.workspace_root && !conv.is_home && !isHomePath(conv.workspace_root)) {
            focusedRepoPath = conv.workspace_root;
          }
          var slot = typeof getRunSlot === "function" ? getRunSlot(conv.id) : null;
          sessionId = conv.session_id || (slot && slot.sessionId) || "";
          if (slot && sessionId) slot.sessionId = sessionId;
          try {
            if (sessionId) localStorage.setItem(sessionStorageKey, sessionId);
            else localStorage.removeItem(sessionStorageKey);
          } catch (err) {}
          var payload = conv.payload || null;
          // Restore follow cursor so switching chats does not replay the whole thinking chain.
          var savedCursor = Number((payload && payload.eventCursor) || 0) || 0;
          if (slot && savedCursor > 0) {
            slot.eventCursor = Math.max(Number(slot.eventCursor || 0) || 0, savedCursor);
          }
          if (payload && payload.model) setSelectedModel(payload.model, false);
          else if (conv.model) setSelectedModel(conv.model, false);
          clearThreadMessages();
          // Keep IDE tabs (terminal/files) across chat switches.
          var restored = restoreChatHistory(payload);
          // Only resume a live mid-flight run, or a finished pump that still has
          // live_events waiting for one-shot /follow (background poll sets pendingFollow).
          // Do NOT follow merely because slot.settled — that painted「会话已过期」.
          var needsFollow = !!(
            (slot && slot.busy && !slot.settled)
            || (slot && slot.pendingFollow && !slot.settled && (slot.sessionId || conv.session_id))
            || (restored && restored.streaming)
            || (conv.streaming && conv.session_id)
          );
          sendQueue = (slot && slot.sendQueue && slot.sendQueue.length) ? slot.sendQueue.slice() : [];
          queueCollapsed = !!(slot && slot.queueCollapsed);
          if (typeof renderQueue === "function") renderQueue();
          updateEmptyState();
          renderConversationList();
          if (typeof refreshIdeTree === "function") refreshIdeTree();
          if (chatTitleEl) {
            if (isEmptyPlaceholderConv(conv) || isPlaceholderTitle(conv.title)) {
              chatTitleEl.textContent = "";
            } else {
              chatTitleEl.textContent = String(conv.title || "").trim();
            }
          }
          if (needsFollow) {
            if (typeof markRunSlotBusy === "function") markRunSlotBusy(conv.id, true, sessionId);
            pendingFollow = true;
            isRunning = true;
            updateRunState("继续接收");
            // Soft preflight: avoid「会话已过期」when streaming flag is stale.
            var sid = sessionId;
            var convIdForFollow = conv.id;
            var startFollow = function () {
              if (Number(activeConversationId) !== Number(convIdForFollow)) return;
              if (typeof followIfNeeded === "function") followIfNeeded();
            };
            if (!sid) {
              pendingFollow = false;
              isRunning = false;
              if (slot) { slot.busy = false; slot.settled = false; slot.pendingFollow = false; }
              updateRunState("就绪");
            } else {
              apiFetch(apiBase + "/api/chat/status?session_id=" + encodeURIComponent(sid))
                .then(function (res) { return res.ok ? res.json() : null; })
                .then(function (st) {
                  if (Number(activeConversationId) !== Number(convIdForFollow)) return;
                  if (st && st.ok && !st.running && !(st.events > 0)) {
                    pendingFollow = false;
                    isRunning = false;
                    bootRestoredStreaming = false;
                    if (slot) { slot.busy = false; slot.settled = false; slot.pendingFollow = false; }
                    // Clear stale streaming flag server-side.
                    apiFetch(apiBase + "/api/conversations/" + encodeURIComponent(convIdForFollow), {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        session_id: sid,
                        payload: { _clearStreamingOnly: true, sessionId: sid },
                      }),
                    }).catch(function () {});
                    if (sendQueue.length && typeof drainQueue === "function") drainQueue();
                    else updateRunState("就绪");
                    return;
                  }
                  startFollow();
                })
                .catch(function () { startFollow(); });
            }
          } else {
            if (slot) {
              slot.busy = false;
              slot.settled = false;
              slot.pendingFollow = false;
            }
            bootRestoredStreaming = false;
            if (sendQueue.length && typeof drainQueue === "function") {
              updateRunState("就绪");
              drainQueue();
            } else {
              updateRunState("就绪");
            }
          }
      })
      .catch(function (err) {
        console.warn("open conversation failed", err);
      })
      .then(function () {
        conversationSwitching = false;
      });
    return conversationSwitchInFlight;
  }

  var navItemMenu = document.getElementById("coding-agent-nav-item-menu");
  var navItemMenuTarget = null;
  var navItemMenuRow = null;
  var navItemMenuConvId = null;
  var ignoreNavItemClickUntil = 0;
  // Explicit deletes must never race with empty-placeholder discard of another chat.
  var suppressDiscardConvId = null;
  var pendingDeleteId = null;
  var pendingDeleteTitle = "";

  function hideNavItemMenu() {
    if (navItemMenu) {
      navItemMenu.classList.remove("is-on");
      navItemMenu.setAttribute("aria-hidden", "true");
      // Defer clearing: sync innerHTML="" during click lets the event fall through
      // to a different conversation row and can discard/delete the wrong chat.
      var menu = navItemMenu;
      setTimeout(function () {
        if (menu && !menu.classList.contains("is-on")) menu.innerHTML = "";
      }, 0);
    }
    if (navItemMenuRow) navItemMenuRow.classList.remove("is-menu-open");
    navItemMenuTarget = null;
    navItemMenuRow = null;
    navItemMenuConvId = null;
  }

  function lookupConvTitle(id) {
    var want = Number(id);
    var hit = (conversationList || []).find(function (c) {
      return Number(c.id) === want;
    });
    return (hit && hit.title) || "";
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
    var rows = document.querySelectorAll('.coding-agent-nav-item[data-conv-id="' + String(item.id) + '"]');
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
    var titleEl = row.querySelector(".coding-agent-nav-item-title");
    if (!titleEl || row.classList.contains("is-renaming")) return;
    row.classList.add("is-renaming");
    var original = item.title || "新对话";
    var input = document.createElement("input");
    input.type = "text";
    input.className = "coding-agent-nav-item-rename";
    input.value = original;
    input.maxLength = 80;
    input.setAttribute("aria-label", "重命名");
    titleEl.replaceWith(input);
    var actions = row.querySelector(".coding-agent-nav-item-actions");
    var timeEl = row.querySelector(".coding-agent-nav-item-time");
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
    var convId = Number(item.id);
    if (!convId) return;
    navItemMenuTarget = item;
    navItemMenuConvId = convId;
    navItemMenuRow = anchor.closest(".coding-agent-nav-item");
    if (navItemMenuRow) {
      navItemMenuRow.classList.add("is-menu-open");
      // Prefer the row's data-conv-id so we never act on a stale list object.
      var fromDom = Number(navItemMenuRow.getAttribute("data-conv-id") || 0);
      if (fromDom) navItemMenuConvId = fromDom;
    }
    navItemMenu.dataset.convId = String(navItemMenuConvId);
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
    navItemMenu.onmousedown = function (ev) { ev.stopPropagation(); };
    navItemMenu.onclick = function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var btn = ev.target && ev.target.closest ? ev.target.closest("button[data-act]") : null;
      if (!btn) return;
      var act = btn.getAttribute("data-act");
      var target = navItemMenuTarget;
      var pinnedId = Number(navItemMenu.dataset.convId || navItemMenuConvId || (target && target.id) || 0);
      var pinnedTitle = (target && target.title) || "新对话";
      // Block ghost clicks on rows underneath the menu for this gesture.
      ignoreNavItemClickUntil = Date.now() + 500;
      hideNavItemMenu();
      if (!pinnedId) return;
      // Let the current click finish before opening confirm / navigating.
      setTimeout(function () {
        if (act === "rename") {
          renameConversation({ id: pinnedId, title: pinnedTitle });
        } else if (act === "archive") {
          patchConversation(pinnedId, { archived: true });
        } else if (act === "delete") {
          deleteConversation(pinnedId, pinnedTitle);
        } else if (act === "share") {
          var text = pinnedTitle || "新对话";
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
      }, 0);
    };
  }

  document.addEventListener("mousedown", function (ev) {
    if (!navItemMenu || !navItemMenu.classList.contains("is-on")) return;
    if (navItemMenu.contains(ev.target)) return;
    if (ev.target && ev.target.closest && ev.target.closest(".coding-agent-nav-item-more")) return;
    hideNavItemMenu();
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") hideNavItemMenu();
  });
  window.addEventListener("resize", hideNavItemMenu);
  window.addEventListener("scroll", hideNavItemMenu, true);

  var confirmModal = document.getElementById("coding-agent-confirm-modal");
  var confirmTitle = document.getElementById("coding-agent-confirm-title");
  var confirmMessage = document.getElementById("coding-agent-confirm-message");
  var confirmOk = document.getElementById("coding-agent-confirm-ok");
  var confirmCancel = document.getElementById("coding-agent-confirm-cancel");
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
  window.showConfirmDialog = showConfirmDialog;

  function deleteConversation(id, title) {
    var deleteId = Number(id);
    if (!deleteId) return Promise.resolve();
    var label = String(title || "").trim() || "这个对话";
    return showConfirmDialog({
      title: "删除对话",
      message: "确定删除「" + label + "」？删除后无法恢复。",
      okText: "删除",
      cancelText: "取消",
      danger: true,
    }).then(function (ok) {
      if (!ok) return;
      return apiFetch(apiBase + "/api/conversations/" + encodeURIComponent(deleteId), {
        method: "DELETE",
      })
        .then(function () {
          var wasActive = Number(deleteId) === Number(activeConversationId);
          if (typeof getRunSlot === "function") {
            try {
              var slot = getRunSlot(deleteId);
              slot.busy = false;
              slot.settled = true;
              slot.pendingFollow = false;
              slot.eventCursor = 0;
              slot.sessionId = "";
            } catch (e) {}
          }
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
      // New empty session defaults to No Repo (home), not the last opened project.
      focusedRepoPath = "";
      setActiveWorkspace(homeWorkspaceRoot || "", "Home");
      if (typeof resetChatTitleToWorkspace === "function") resetChatTitleToWorkspace();
      stoppedAgentMsg = null;
      if (typeof leaveEditMode === "function") leaveEditMode();
      clearThreadMessages();
      if (typeof stopRunElapsedTimer === "function") stopRunElapsedTimer();
      updateEmptyState();
      updateRunState("就绪");
      renderConversationList();
      if (typeof refreshIdeTree === "function") refreshIdeTree();
      if (typeof updateCrumb === "function") updateCrumb();
      if (inputField) inputField.focus();
    });
  }

  function openNewAgentFlow(opts) {
    opts = opts || {};
    closeContextPickers();
    if (opts.pickWorkspace) {
      openWorkspacePicker({ mode: "new-agent", focusPath: !!opts.focusPath });
      return;
    }
    // Top「新建 Agent」defaults to No Repo (home). Explicit opts.workspace still wins;
    // per-repo「+」calls createAgentInWorkspace directly.
    var ws = String(opts.workspace || "").trim();
    if (!ws) ws = homeWorkspaceRoot || "";
    if (!ws) {
      openWorkspacePicker({ mode: "new-agent", focusPath: true });
      return;
    }
    var name = opts.name || (isHomePath(ws) ? "Home" : workspaceDisplayName(ws));
    createAgentInWorkspace(ws, name);
  }

  function createAgentInWorkspace(workspacePath, workspaceName) {
    // Serialize creates: rapid clicks previously stacked many blank「新对话」.
    var ws = String(workspacePath || "").trim() || homeWorkspaceRoot || "";
    if (!ws) {
      openWorkspacePicker({ mode: "new-agent", focusPath: true });
      return createAgentInFlight;
    }
    createAgentInFlight = createAgentInFlight.catch(function () {}).then(function () {
      // Park/flush the previous chat FIRST while its workspace is still active.
      // Switching activeWorkspaceRoot before flush used to re-tag the old chat as Home.
      return Promise.resolve(detachActiveConversation({ clearActive: true })).then(function () {
        setRepoCollapsed(ws, false);
        if (ws && !isHomePath(ws)) focusedRepoPath = ws;
        // Always label from path so SSH never keeps a stale "host · host" name.
        setActiveWorkspace(ws, workspaceDisplayName(ws) || workspaceName || ws);
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
            if (chatTitleEl) chatTitleEl.textContent = "";
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
              if (chatTitleEl) chatTitleEl.textContent = "";
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
    if (homeWorkspaceRoot && normPath(ws) === normPath(homeWorkspaceRoot)) return "Home";
    if (isSshWorkspace(ws)) {
      var m = ws.match(/^ssh:\/\/([^/]+)(\/.*)?$/i);
      // SSH repos: sidebar / chip show host only (path stays in title / URI).
      if (m) return decodeURIComponent(m[1] || "") || "SSH";
    }
    var segs = ws.replace(/\\/g, "/").split("/");
    return segs[segs.length - 1] || ws;
  }

  function syncWorkspaceContextUi() {
    var ws = activeWorkspaceRoot || homeWorkspaceRoot || "";
    if (ctxWsBtn) {
      ctxWsBtn.classList.toggle("is-ssh", isSshWorkspace(ws) && !isHomePath(ws));
    }
    if (ctxWsLabel) {
      // Cursor-style: No Repo is a label, never the raw home path.
      if (!ws || isHomePath(ws)) {
        ctxWsLabel.textContent = "No Repo";
        if (ctxWsBtn) ctxWsBtn.title = "No Repo";
      } else if (isSshWorkspace(ws)) {
        var m = ws.match(/^ssh:\/\/([^/]+)(\/.*)?$/i);
        var hostId = m ? decodeURIComponent(m[1] || "") : "";
        var remote = m ? (m[2] || "/") : "/";
        ctxWsLabel.textContent = workspaceDisplayName(ws);
        if (ctxWsBtn) {
          ctxWsBtn.title = "SSH " + (hostId || "") + " · " + remote + "\n" + ws;
        }
      } else {
        ctxWsLabel.textContent = workspaceDisplayName(ws) || ws;
        if (ctxWsBtn) ctxWsBtn.title = "仓库：" + ws;
      }
    }
    refreshGitBranchLabel(ws);
  }

  function workspaceTipPath(root) {
    var ws = String(root || "").trim();
    if (!ws) return "";
    if (isSshWorkspace(ws)) {
      var m = ws.match(/^ssh:\/\/([^/]+)(\/.*)?$/i);
      if (!m) return ws;
      var hostId = decodeURIComponent(m[1] || "");
      var remote = m[2] || "/";
      return hostId + ":" + remote;
    }
    return ws;
  }

  function hideNavTip() {
    var tip = document.getElementById("coding-agent-nav-tip");
    if (!tip) return;
    tip.classList.remove("is-on");
    tip.setAttribute("aria-hidden", "true");
  }

  function showNavTip(anchor, item) {
    var tip = document.getElementById("coding-agent-nav-tip");
    if (!tip || !anchor || !item) return;
    var titleEl = tip.querySelector(".tip-title");
    var sshRow = tip.querySelector(".tip-ssh");
    var sshText = tip.querySelector(".tip-ssh-text");
    var pathText = tip.querySelector(".tip-path-text");
    if (titleEl) titleEl.textContent = item.title || "新对话";
    var ws = item.workspace_root || "";
    var ssh = !!(item.is_ssh || isSshWorkspace(ws));
    if (sshRow) sshRow.hidden = !ssh;
    if (ssh && sshText) {
      var m = String(ws).match(/^ssh:\/\/([^/]+)/i);
      var hostId = m ? decodeURIComponent(m[1] || "") : (item.workspace_name || "SSH");
      sshText.textContent = "SSH · " + hostId;
    }
    if (pathText) pathText.textContent = workspaceTipPath(ws) || ws || "(no path)";
    tip.classList.add("is-on");
    tip.setAttribute("aria-hidden", "false");
    var rect = anchor.getBoundingClientRect();
    var tipW = tip.offsetWidth || 240;
    var tipH = tip.offsetHeight || 72;
    var left = rect.right + 8;
    if (left + tipW > window.innerWidth - 8) left = Math.max(8, rect.left - tipW - 8);
    var top = rect.top;
    if (top + tipH > window.innerHeight - 8) top = Math.max(8, window.innerHeight - tipH - 8);
    tip.style.left = left + "px";
    tip.style.top = top + "px";
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
      wsFlyout.style.top = "";
      wsFlyout.style.maxHeight = "";
    }
    if (wsFlyoutPath) wsFlyoutPath.classList.remove("is-on");
    if (wsFlyoutPathUe) wsFlyoutPathUe.classList.remove("is-on");
    if (wsPcBtn) wsPcBtn.classList.remove("is-open", "is-hot");
    if (wsUseExistingBtn) wsUseExistingBtn.classList.remove("is-open", "is-hot");
    wsFlyoutMode = "";
    wsFlyoutAnchor = null;
  }

  function setFlyoutPanel(mode) {
    wsFlyoutMode = mode || "";
    var panels = wsFlyout ? wsFlyout.querySelectorAll("[data-flyout-panel]") : [];
    panels.forEach(function (el) {
      el.classList.toggle("is-on", el.getAttribute("data-flyout-panel") === mode);
    });
  }

  function positionWsFlyout(anchor) {
    if (!wsFlyout || !wsPicker) return;
    var pin = anchor || wsFlyoutAnchor;
    var pickerRect = wsPicker.getBoundingClientRect();
    var gap = 10;
    var preferredTop = 0;
    if (pin) {
      var rowRect = pin.getBoundingClientRect();
      preferredTop = Math.max(0, rowRect.top - pickerRect.top - 6);
    }
    // SSH hosts sit near the bottom of Repos — shift the cascade up so it stays on screen.
    var flyH = wsFlyout.offsetHeight || 280;
    var absTop = pickerRect.top + preferredTop;
    var overflow = absTop + flyH + gap - window.innerHeight;
    if (overflow > 0) preferredTop = Math.max(0, preferredTop - overflow);
    var maxAbsBottom = window.innerHeight - gap;
    var maxH = Math.max(180, Math.min(560, maxAbsBottom - (pickerRect.top + preferredTop)));
    wsFlyout.style.maxHeight = maxH + "px";
    wsFlyout.style.top = preferredTop + "px";
  }

  function openWsFlyout(anchor, mode) {
    if (!wsFlyout) return;
    if (wsPcBtn) wsPcBtn.classList.remove("is-open", "is-hot");
    if (wsUseExistingBtn) wsUseExistingBtn.classList.remove("is-open", "is-hot");
    wsFlyoutAnchor = anchor || null;
    if (anchor) {
      anchor.classList.add("is-open", "is-hot");
    }
    setFlyoutPanel(mode);
    wsFlyout.classList.add("is-on");
    wsFlyout.setAttribute("aria-hidden", "false");
    requestAnimationFrame(function () {
      positionWsFlyout(anchor);
      requestAnimationFrame(function () { positionWsFlyout(anchor); });
    });
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
          empty.className = "coding-agent-ws-item-path";
          empty.style.padding = "6px 8px";
          empty.textContent = q ? "No matches" : "No folders";
          wsFlyoutList.appendChild(empty);
          return;
        }
        roots.forEach(function (r) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "coding-agent-ws-item";
          btn.innerHTML = WS_ICON_FOLDER
            + '<span class="coding-agent-ws-item-main"><span class="coding-agent-ws-item-name"></span>'
            + '<span class="coding-agent-ws-item-path"></span></span>';
          btn.querySelector(".coding-agent-ws-item-name").textContent = r.name || r.path || "";
          btn.querySelector(".coding-agent-ws-item-path").textContent = r.path || "";
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
    btn.className = "coding-agent-ws-item";
    var active = activeWorkspaceRoot
      && normPath(r.path || "") === normPath(activeWorkspaceRoot);
    if (active) btn.classList.add("is-active");
    var name = r.name || r.path || "";
    var sub = "";
    if (r.is_ssh || isSshWorkspace(r.path)) {
      // Cursor-like: remote path (or host) on the left, host id on the right — never duplicate.
      var hostId = r.host_id || r.host_label || "SSH";
      var remote = String(r.remote_path || "").trim();
      if (!remote && isSshWorkspace(r.path)) {
        var m = String(r.path).match(/^ssh:\/\/[^/]+(\/.*)?$/i);
        remote = (m && m[1]) ? m[1] : "/";
      }
      name = workspaceDisplayName(r.path) || name;
      if (remote && remote !== "/" && remote !== name) {
        // Prefer full remote path as title when we have one (Cursor Recents style).
        name = remote;
      }
      sub = hostId;
      if (sub === name) sub = "SSH";
      btn.innerHTML = WS_ICON_SSH
        + '<span class="coding-agent-ws-item-main"><span class="coding-agent-ws-item-name"></span>'
        + '<span class="coding-agent-ws-item-host"></span></span>'
        + WS_ICON_CHECK;
      btn.querySelector(".coding-agent-ws-item-name").textContent = name;
      btn.querySelector(".coding-agent-ws-item-host").textContent = sub;
    } else {
      btn.innerHTML = WS_ICON_FOLDER
        + '<span class="coding-agent-ws-item-main"><span class="coding-agent-ws-item-name"></span></span>'
        + WS_ICON_CHECK;
      btn.querySelector(".coding-agent-ws-item-name").textContent = r.path || name;
    }
    btn.title = r.path || "";
    btn.onclick = function () {
      selectWorkspacePath(r.path, r.is_home ? "No Repo" : workspaceDisplayName(r.path) || name);
    };
    return btn;
  }

  function makeSshHostRow(host) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "coding-agent-ws-nav";
    btn.innerHTML = WS_ICON_SSH
      + '<span class="coding-agent-ws-item-main"><span class="coding-agent-ws-item-name"></span>'
      + '<span class="coding-agent-ws-item-host"></span></span>'
      + '<span class="coding-agent-ws-chevron-r" aria-hidden="true"></span>';
    btn.querySelector(".coding-agent-ws-item-name").textContent = host.label || host.id;
    var sub = (host.user || "") + "@" + (host.host || "")
      + (host.port && host.port !== 22 ? (":" + host.port) : "");
    if (host.source === "config") sub = (sub ? sub + " · " : "") + "SSH config";
    btn.querySelector(".coding-agent-ws-item-host").textContent = sub;
    btn.title = host.source === "config"
      ? "From ~/.ssh/config · " + (host.label || host.id)
      : (host.label || host.id);
    btn.onclick = function (ev) {
      ev.stopPropagation();
      openSshTree(host, null, { soft: false });
    };
    btn.onmouseenter = function () { openSshTree(host, btn, { soft: true }); };
    return btn;
  }

  function sshTreeCacheKey(hostId, path) {
    return String(hostId || "") + "|" + String(path || "/");
  }

  function rememberSshTree(hostId, data) {
    var path = data.path || "/";
    sshTreeCache[sshTreeCacheKey(hostId, path)] = {
      entries: data.entries || [],
      path: path,
      uri: data.uri || "",
      label: data.label || hostId,
      at: Date.now(),
    };
  }

  function readSshTreeCache(hostId, path) {
    var hit = sshTreeCache[sshTreeCacheKey(hostId, path)];
    if (!hit) return null;
    if (Date.now() - hit.at > SSH_TREE_CACHE_MS) return null;
    return hit;
  }

  function latestSshTreeCache(hostId) {
    var prefix = String(hostId || "") + "|";
    var best = null;
    Object.keys(sshTreeCache).forEach(function (k) {
      if (k.indexOf(prefix) !== 0) return;
      var hit = sshTreeCache[k];
      if (!hit) return;
      if (Date.now() - hit.at > SSH_TREE_CACHE_MS) return;
      if (!best || hit.at > best.at) best = hit;
    });
    return best;
  }

  function applySshTreeData(hostId, data, opts) {
    opts = opts || {};
    sshBrowse.hostId = hostId;
    sshBrowse.path = data.path || "/";
    sshBrowse.uri = data.uri || ("ssh://" + hostId + sshBrowse.path);
    if (data.label) sshBrowse.label = data.label;
    sshTreeEntries = data.entries || [];
    if (wsSshTreeHead) {
      var head = (data.label || sshBrowse.label || hostId) + " · " + sshBrowse.path;
      if (opts.stale) head += "（缓存）";
      wsSshTreeHead.textContent = head;
    }
    renderSshFlyoutList(hostId);
  }

  function showSshTreeError(hostId, detail) {
    var cached = latestSshTreeCache(hostId);
    if (cached) {
      applySshTreeData(hostId, cached, { stale: true });
      return;
    }
    if (wsSshTreeHead) wsSshTreeHead.textContent = (sshBrowse.label || hostId) + " · 失败";
    if (wsSshTreeList) {
      wsSshTreeList.innerHTML = "<div class='coding-agent-ws-item-path' style='padding:6px 8px'>"
        + String(detail || "SSH 连接失败") + "</div>";
    }
    requestAnimationFrame(function () { positionWsFlyout(wsFlyoutAnchor); });
  }

  function openSshTree(host, anchor, opts) {
    opts = opts || {};
    var soft = !!opts.soft;
    var hid = host.id;
    var prevHost = sshBrowse.hostId;
    var sameHost = prevHost === hid;
    openWsFlyout(anchor || wsPcBtn, "ssh-tree");
    if (wsSshSearch) wsSshSearch.placeholder = "Search or /path";

    var cached = (sameHost && readSshTreeCache(hid, sshBrowse.path)) || latestSshTreeCache(hid);
    var hasLocal = sameHost && sshBrowse.path
      && (sshTreeEntries.length || readSshTreeCache(hid, sshBrowse.path));

    // Hover must never re-warm (timeout loops). Click can retry when empty.
    if (soft) {
      if (hasLocal) {
        sshBrowse.hostId = hid;
        sshBrowse.label = host.label || host.id;
        applySshTreeData(hid, {
          path: sshBrowse.path,
          uri: sshBrowse.uri,
          label: sshBrowse.label,
          entries: sshTreeEntries.length
            ? sshTreeEntries
            : ((readSshTreeCache(hid, sshBrowse.path) || {}).entries || []),
        });
      } else if (cached) {
        sshBrowse.hostId = hid;
        sshBrowse.label = host.label || host.id;
        applySshTreeData(hid, cached);
      }
      // else: leave current panel (maybe error / user typing path); do not reconnect
      return;
    }

    sshBrowse.hostId = hid;
    sshBrowse.label = host.label || host.id;

    if (hasLocal) {
      applySshTreeData(hid, {
        path: sshBrowse.path,
        uri: sshBrowse.uri,
        label: sshBrowse.label,
        entries: sshTreeEntries.length
          ? sshTreeEntries
          : ((readSshTreeCache(hid, sshBrowse.path) || {}).entries || []),
      });
      return;
    }
    if (cached) {
      applySshTreeData(hid, cached);
      return;
    }
    if (wsSshSearch) {
      wsSshSearch.value = "";
      wsSshSearch.placeholder = "Search or /path";
    }
    sshBrowse.path = "";
    sshBrowse.uri = "";
    sshTreeEntries = [];
    if (wsSshTreeHead) {
      wsSshTreeHead.textContent = (sshBrowse.label || hid) + " · 连接中…";
    }
    if (wsSshTreeList) {
      wsSshTreeList.innerHTML = "<div class='coding-agent-ws-item-path' style='padding:6px 8px'>连接中…</div>";
    }
    // Warm first so we get remote $HOME (not "/") before listing.
    apiFetch(apiBase + "/api/ssh/hosts/" + encodeURIComponent(hid) + "/warm", {
      method: "POST",
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (result) {
        if (sshBrowse.hostId !== hid) return;
        if (!result.ok) {
          showSshTreeError(
            hid,
            (result.data && (result.data.detail || result.data.message)) || "SSH 连接失败"
          );
          return;
        }
        var configured = String(host.default_path || "").trim();
        var path = (configured && configured !== "/" && configured !== "~")
          ? configured
          : (result.data.default_path || "/");
        sshBrowse.path = path;
        loadSshTree(hid, path);
      })
      .catch(function () {
        if (sshBrowse.hostId !== hid) return;
        showSshTreeError(hid, "SSH 连接失败");
      });
  }

  // Remote paths: keep "/" as "/" (normPath strips it to "" and breaks abs jumps).
  function sshPathNorm(p) {
    var s = String(p || "").replace(/\\/g, "/").replace(/\/+/g, "/");
    if (s.length > 1) s = s.replace(/\/+$/, "");
    return s || "/";
  }

  // "/tm" → list "/" filter "tm"; "/home/wxj/" → list that dir; no leading / → current dir only.
  function parseSshPathQuery(q) {
    var s = String(q || "").trim();
    if (!s) return null;
    if (s.charAt(0) === "~") {
      var home = guessSshHome(sshBrowse.hostId);
      if (!home) return null;
      if (s === "~" || s === "~/") {
        return { dir: home, filter: "", full: home };
      }
      if (s.indexOf("~/") === 0) {
        s = home.replace(/\/$/, "") + "/" + s.slice(2);
      } else {
        return null;
      }
    }
    if (s.charAt(0) !== "/") return null;
    s = s.replace(/\/+/g, "/");
    var endsSlash = s.length > 1 && s.slice(-1) === "/";
    var full = endsSlash ? (s.replace(/\/+$/, "") || "/") : s;
    if (full === "/") return { dir: "/", filter: "", full: "/" };
    if (endsSlash) return { dir: full, filter: "", full: full };
    var parts = full.split("/");
    var last = parts.pop() || "";
    var dir = parts.join("/") || "/";
    return { dir: dir, filter: last.toLowerCase(), full: full };
  }

  function scheduleSshPathJump(hostId, parsed) {
    if (!parsed || !hostId) return;
    clearTimeout(sshSearchJumpTimer);
    var go = function () {
      if (sshBrowse.hostId !== hostId) return;
      var cur = sshPathNorm(sshBrowse.path);
      // Already inside the typed path (e.g. browsed into /tmp while q is /tmp).
      if (cur === sshPathNorm(parsed.full) || cur === sshPathNorm(parsed.dir)) {
        renderSshFlyoutList(hostId);
        return;
      }
      var hit = readSshTreeCache(hostId, parsed.dir);
      if (hit) {
        applySshTreeData(hostId, hit);
        return;
      }
      loadSshTree(hostId, parsed.dir, { keepSearch: true });
    };
    if (readSshTreeCache(hostId, parsed.dir)
      || sshPathNorm(sshBrowse.path) === sshPathNorm(parsed.dir)
      || sshPathNorm(sshBrowse.path) === sshPathNorm(parsed.full)) {
      go();
    } else {
      sshSearchJumpTimer = setTimeout(go, 120);
    }
  }

  function guessSshHome(hostId) {
    var p = sshBrowse.path || "";
    var m = String(p).match(/^(\/home\/[^/]+)/);
    if (m) return m[1];
    var hit = latestSshTreeCache(hostId);
    m = hit && String(hit.path || "").match(/^(\/home\/[^/]+)/);
    return m ? m[1] : "";
  }

  function sshHostRecentRoots(hostId) {
    var hid = String(hostId || "").trim();
    if (!hid) return [];
    return (workspaceRootsCache || []).filter(function (r) {
      if (!r || !(r.is_ssh || isSshWorkspace(r.path))) return false;
      if (String(r.host_id || "") === hid) return true;
      var m = String(r.path || "").match(/^ssh:\/\/([^/]+)/i);
      return m && String(m[1]) === hid;
    });
  }

  function renderSshFlyoutList(hostId) {
    if (!wsSshTreeList) return;
    var rawQ = wsSshSearch ? String(wsSshSearch.value || "").trim() : "";
    var parsed = parseSshPathQuery(rawQ);
    var q = rawQ.toLowerCase();
    var cur = sshPathNorm(sshBrowse.path);
    var atAbsExact = parsed && cur === sshPathNorm(parsed.full);
    var atAbsParent = parsed && cur === sshPathNorm(parsed.dir);
    // Prefix search filters parent; exact path (or drilled-in) lists that dir unfiltered.
    var nameFilter = "";
    if (parsed) {
      nameFilter = atAbsExact ? "" : String(parsed.filter || "");
    } else {
      nameFilter = q;
    }
    wsSshTreeList.innerHTML = "";

    // Waiting for parent of an abs prefix query (e.g. /tm while still on /home/…).
    if (parsed && !atAbsParent && !atAbsExact) {
      var wait = document.createElement("div");
      wait.className = "coding-agent-ws-item-path";
      wait.style.padding = "6px 8px";
      wait.textContent = "加载 " + parsed.dir + " …";
      wsSshTreeList.appendChild(wait);
      requestAnimationFrame(function () { positionWsFlyout(wsFlyoutAnchor); });
      return;
    }

    // Recents (path query also matches remote paths).
    var recents = sshHostRecentRoots(hostId).filter(function (r) {
      if (!q) return true;
      var remote = String(r.remote_path || r.path || "").toLowerCase();
      var name = String(r.name || "").toLowerCase();
      return remote.indexOf(q) >= 0 || name.indexOf(q) >= 0;
    });
    recents.forEach(function (r) {
      var remote = String(r.remote_path || "").trim();
      if (!remote && isSshWorkspace(r.path)) {
        var m = String(r.path).match(/^ssh:\/\/[^/]+(\/.*)?$/i);
        remote = (m && m[1]) ? m[1] : "/";
      }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "coding-agent-ws-item";
      btn.innerHTML = WS_ICON_FOLDER
        + '<span class="coding-agent-ws-item-main"><span class="coding-agent-ws-item-name"></span></span>'
        + WS_ICON_CHECK;
      btn.querySelector(".coding-agent-ws-item-name").textContent = remote || r.path || "";
      btn.title = r.path || "";
      btn.onclick = function () {
        selectWorkspacePath(r.path, workspaceDisplayName(r.path) || remote);
      };
      wsSshTreeList.appendChild(btn);
    });

    // Parent nav only when not searching.
    if (!rawQ && sshBrowse.path && sshBrowse.path !== "/") {
      var up = document.createElement("button");
      up.type = "button";
      up.className = "coding-agent-ws-item";
      up.innerHTML = '<span class="coding-agent-ws-item-main"><span class="coding-agent-ws-item-name">..</span></span>';
      up.onclick = function () {
        var parts = sshBrowse.path.replace(/\/+$/, "").split("/");
        parts.pop();
        var parent = parts.join("/") || "/";
        loadSshTree(hostId, parent);
      };
      wsSshTreeList.appendChild(up);
    }

    var entries = (sshTreeEntries || []).filter(function (e) {
      if (!nameFilter) return true;
      var name = String(e.name || "").toLowerCase();
      var path = String(e.path || "").toLowerCase();
      if (parsed && !atAbsExact) {
        return name.indexOf(nameFilter) === 0 || name.indexOf(nameFilter) >= 0;
      }
      return name.indexOf(nameFilter) >= 0 || path.indexOf(nameFilter) >= 0;
    });
    entries.forEach(function (e) {
      if (e.type && e.type !== "dir") return;
      var abs = String(e.path || "");
      if (abs && abs.charAt(0) !== "/") {
        abs = (sshBrowse.path === "/" ? "/" : (sshBrowse.path.replace(/\/+$/, "") + "/")) + abs;
      }
      if (!abs) abs = e.name || "";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "coding-agent-ws-item";
      btn.innerHTML = WS_ICON_FOLDER
        + '<span class="coding-agent-ws-item-main"><span class="coding-agent-ws-item-name"></span></span>'
        + '<span class="coding-agent-ws-chevron-r" aria-hidden="true"></span>';
      btn.querySelector(".coding-agent-ws-item-name").textContent = abs;
      btn.title = abs;
      btn.onclick = function () {
        // Clear abs search so drilling in doesn't stick on "加载 / …".
        if (wsSshSearch) wsSshSearch.value = "";
        loadSshTree(hostId, e.path);
      };
      wsSshTreeList.appendChild(btn);
    });

    if (!wsSshTreeList.children.length) {
      var empty = document.createElement("div");
      empty.className = "coding-agent-ws-item-path";
      empty.style.padding = "6px 8px";
      empty.textContent = q ? "No matches" : "No folders";
      wsSshTreeList.appendChild(empty);
    }
    requestAnimationFrame(function () { positionWsFlyout(wsFlyoutAnchor); });
  }

  function loadSshTree(hostId, path, opts) {
    opts = opts || {};
    var want = path || "/";
    var hit = readSshTreeCache(hostId, want);
    if (hit) {
      applySshTreeData(hostId, hit);
      return;
    }
    if (wsSshTreeHead) {
      wsSshTreeHead.textContent = (sshBrowse.label || hostId) + " · " + want;
    }
    // Keep Search UI while resolving abs path (don't flash empty "No matches").
    if (opts.keepSearch || parseSshPathQuery(wsSshSearch && wsSshSearch.value)) {
      renderSshFlyoutList(hostId);
    } else if (wsSshTreeList) {
      wsSshTreeList.innerHTML = "<div class='coding-agent-ws-item-path' style='padding:6px 8px'>Loading…</div>";
    }
    apiFetch(apiBase + "/api/ssh/hosts/" + encodeURIComponent(hostId)
      + "/tree?path=" + encodeURIComponent(want))
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (result) {
        if (!wsSshTreeList) return;
        if (sshBrowse.hostId !== hostId) return;
        if (!result.ok) {
          // Don't fall back to a different path while user is typing an abs query.
          var abs = parseSshPathQuery(wsSshSearch && wsSshSearch.value);
          if (abs) {
            renderSshFlyoutList(hostId);
            var err = document.createElement("div");
            err.className = "coding-agent-ws-item-path";
            err.style.padding = "6px 8px";
            err.textContent = (result.data && (result.data.detail || result.data.message)) || "加载失败";
            wsSshTreeList.appendChild(err);
            requestAnimationFrame(function () { positionWsFlyout(wsFlyoutAnchor); });
            return;
          }
          var stale = readSshTreeCache(hostId, want) || latestSshTreeCache(hostId);
          if (stale) {
            applySshTreeData(hostId, stale, { stale: true });
            return;
          }
          wsSshTreeList.innerHTML = "";
          var err2 = document.createElement("div");
          err2.className = "coding-agent-ws-item-path";
          err2.style.padding = "6px 8px";
          err2.textContent = (result.data && (result.data.detail || result.data.message)) || "加载失败";
          wsSshTreeList.appendChild(err2);
          requestAnimationFrame(function () { positionWsFlyout(wsFlyoutAnchor); });
          return;
        }
        rememberSshTree(hostId, result.data);
        applySshTreeData(hostId, result.data);
      })
      .catch(function () {
        if (sshBrowse.hostId !== hostId) return;
        var abs = parseSshPathQuery(wsSshSearch && wsSshSearch.value);
        if (abs) {
          renderSshFlyoutList(hostId);
          return;
        }
        var stale = readSshTreeCache(hostId, want) || latestSshTreeCache(hostId);
        if (stale) {
          applySshTreeData(hostId, stale, { stale: true });
          return;
        }
        if (wsSshTreeList) {
          wsSshTreeList.innerHTML = "<div class='coding-agent-ws-item-path' style='padding:6px 8px'>加载失败</div>";
        }
        requestAnimationFrame(function () { positionWsFlyout(wsFlyoutAnchor); });
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
        var d = result.data || {};
        var bits = ["连接成功"];
        if (d.os_label || (d.os && d.os.label)) bits.push(d.os_label || d.os.label);
        if (d.shell) bits.push(d.shell);
        if (d.latency_ms != null) bits.push(d.latency_ms + "ms");
        bits.push(d.default_path || "/");
        setSshStatus(bits.join(" · "), "ok");
        if (d.default_path && wsSshDefault && !String(wsSshDefault.value || "").trim()) {
          wsSshDefault.value = d.default_path;
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
        empty.className = "coding-agent-ws-item-path";
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
      noRepo.className = "coding-agent-ws-item";
      var homeActive = activeWorkspaceRoot
        && String(homeRoot.path || "").toLowerCase() === String(activeWorkspaceRoot).toLowerCase();
      if (homeActive) noRepo.classList.add("is-active");
      noRepo.innerHTML = WS_ICON_HOME
        + '<span class="coding-agent-ws-item-main"><span class="coding-agent-ws-item-name">No Repo</span></span>'
        + WS_ICON_CHECK;
      noRepo.onclick = function () { selectWorkspacePath(homeRoot.path, "No Repo"); };
      wsRepos.appendChild(noRepo);
    }
    // On This PC → cascading flyout
    if (!q || "on this pc".indexOf(q) >= 0 || "this pc".indexOf(q) >= 0 || "open folder".indexOf(q) >= 0) {
      var pcBtn = document.createElement("button");
      pcBtn.type = "button";
      pcBtn.className = "coding-agent-ws-nav";
      pcBtn.innerHTML = WS_ICON_PC
        + '<span class="coding-agent-ws-item-main"><span class="coding-agent-ws-item-name">On This PC</span></span>'
        + '<span class="coding-agent-ws-chevron-r" aria-hidden="true"></span>';
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
    closeWorkspacePicker();
    setRepoCollapsed(ws, false);
    // Switching folder always opens/creates an agent in that workspace.
    // Never PATCH-move the current chat (that made Coding Agent chats jump under Home).
    createAgentInWorkspace(ws, name || workspaceDisplayName(ws));
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
  var navAddRepoBtn = document.getElementById("coding-agent-nav-add-repo");
  var navFilterBtn = document.getElementById("coding-agent-nav-filter");
  var HIDE_EMPTY_KEY = "coding-agent-hide-empty-repos:" + provider;
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
  if (wsSshSearch) {
    wsSshSearch.addEventListener("input", function () {
      if (!sshBrowse.hostId) return;
      var parsed = parseSshPathQuery(wsSshSearch.value);
      if (parsed) scheduleSshPathJump(sshBrowse.hostId, parsed);
      else clearTimeout(sshSearchJumpTimer);
      renderSshFlyoutList(sshBrowse.hostId);
    });
    wsSshSearch.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" || !sshBrowse.hostId) return;
      var parsed = parseSshPathQuery(wsSshSearch.value);
      if (!parsed) return;
      ev.preventDefault();
      clearTimeout(sshSearchJumpTimer);
      // Prefer exact/prefix folder match under parent — not a half-typed dead path.
      var filter = String(parsed.filter || "").toLowerCase();
      var hit = null;
      if (sshPathNorm(sshBrowse.path) === sshPathNorm(parsed.dir) && filter) {
        var dirs = (sshTreeEntries || []).filter(function (e) {
          return (!e.type || e.type === "dir")
            && String(e.name || "").toLowerCase().indexOf(filter) === 0;
        });
        hit = dirs.find(function (e) {
          return String(e.name || "").toLowerCase() === filter;
        }) || (dirs.length === 1 ? dirs[0] : null);
      }
      if (hit) {
        if (wsSshSearch) wsSshSearch.value = "";
        loadSshTree(sshBrowse.hostId, hit.path, { keepSearch: false });
      } else if (!filter) {
        if (wsSshSearch) wsSshSearch.value = "";
        loadSshTree(sshBrowse.hostId, parsed.full, { keepSearch: false });
      } else {
        loadSshTree(sshBrowse.hostId, parsed.dir, { keepSearch: true });
      }
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
