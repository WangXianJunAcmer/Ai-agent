/* ai-agent frontend/js/ide.js — Cursor-like code sidebar (Ctrl+G) */

  var idePanel = document.getElementById("ai-agent-ide");
  var ideExplorer = document.getElementById("ai-agent-ide-explorer");
  var ideTree = document.getElementById("ai-agent-ide-tree");
  var ideRootName = document.getElementById("ai-agent-ide-root-name");
  var ideEditor = document.getElementById("ai-agent-ide-editor");
  var ideTabs = document.getElementById("ai-agent-ide-tabs-scroll") || document.getElementById("ai-agent-ide-tabs");
  var ideMaximizeBtn = document.getElementById("ai-agent-ide-maximize");
  var IDE_MAX_KEY = "ai-agent-ide-maximized:" + provider;
  var ideCodeWrap = document.getElementById("ai-agent-ide-code-wrap");
  var ideGutter = document.getElementById("ai-agent-ide-gutter");
  var ideCode = document.getElementById("ai-agent-ide-code");
  var ideHighlight = document.getElementById("ai-agent-ide-highlight");
  var ideHighlightCode = ideHighlight ? ideHighlight.querySelector("code") : null;
  var idePreview = document.getElementById("ai-agent-ide-preview");
  var ideEmpty = document.getElementById("ai-agent-ide-empty");
  var ideCrumbName = document.getElementById("ai-agent-ide-crumb-name");
  var ideViewTools = document.getElementById("ai-agent-ide-view-tools");
  var ideViewPreview = document.getElementById("ai-agent-ide-view-preview");
  var ideViewSource = document.getElementById("ai-agent-ide-view-source");
  var ideFindBar = document.getElementById("ai-agent-ide-find");
  var ideFindInput = document.getElementById("ai-agent-ide-find-input");
  var ideFindCount = document.getElementById("ai-agent-ide-find-count");
  var ideFindToggle = document.getElementById("ai-agent-ide-find-toggle");
  var ideFindPrev = document.getElementById("ai-agent-ide-find-prev");
  var ideFindNext = document.getElementById("ai-agent-ide-find-next");
  var ideFindClose = document.getElementById("ai-agent-ide-find-close");
  var ideSaveBtn = document.getElementById("ai-agent-ide-save");
  var ideRefreshBtn = document.getElementById("ai-agent-ide-refresh");
  var ideNewFileBtn = document.getElementById("ai-agent-ide-new-file");
  var ideNewFolderBtn = document.getElementById("ai-agent-ide-new-folder");
  var ideBackBtn = document.getElementById("ai-agent-ide-back");
  var ideForwardBtn = document.getElementById("ai-agent-ide-forward");
  var ideToggleBtn = document.getElementById("ai-agent-toggle-ide");
  var ideToggleDockBtn = document.getElementById("ai-agent-toggle-ide-dock");
  var ideCollapseAllBtn = document.getElementById("ai-agent-ide-collapse-all");
  var ideResize = document.getElementById("ai-agent-ide-resize");
  var ideTreeResize = document.getElementById("ai-agent-ide-tree-resize");
  var ideCtx = document.getElementById("ai-agent-ide-ctx");
  var ideOpenTabs = []; // { path, content, dirty, original, view }
  var ideActivePath = "";
  var ideNavStack = [];
  var ideNavIndex = -1;
  var ideExpanded = {};
  var ideChildrenCache = {};
  var ideClipboard = null; // { mode: 'copy'|'cut', path, type }
  var ideCtxTarget = null; // { path, type }
  var ideOutline = document.getElementById("ai-agent-ide-outline");
  var ideOutlineToggle = document.getElementById("ai-agent-ide-outline-toggle");
  var ideFindMatches = [];
  var ideFindIndex = -1;
  var ideOutlineOpen = false;
  var IDE_WIDTH_KEY = "ai-agent-ide-width:" + provider;
  var IDE_TREE_WIDTH_KEY = "ai-agent-ide-tree-width:" + provider;

  function applyIdeWidth(px) {
    if (!sidebar) return;
    var w = Math.max(320, Math.min(Math.floor(window.innerWidth * 0.75), px));
    sidebar.style.setProperty("--ai-ide-width", w + "px");
    try { localStorage.setItem(IDE_WIDTH_KEY, String(w)); } catch (err) {}
  }

  function applyIdeTreeWidth(px) {
    if (!sidebar) return;
    var w = Math.max(140, Math.min(420, px));
    sidebar.style.setProperty("--ai-ide-tree-width", w + "px");
    try { localStorage.setItem(IDE_TREE_WIDTH_KEY, String(w)); } catch (err) {}
  }

  (function restoreIdeWidths() {
    try {
      var w = parseInt(localStorage.getItem(IDE_WIDTH_KEY) || "", 10);
      if (w) applyIdeWidth(w);
      var tw = parseInt(localStorage.getItem(IDE_TREE_WIDTH_KEY) || "", 10);
      if (tw) applyIdeTreeWidth(tw);
    } catch (err) {}
  })();

  function bindDragResize(handle, opts) {
    if (!handle) return;
    handle.addEventListener("mousedown", function (ev) {
      ev.preventDefault();
      if (sidebar) sidebar.classList.add(opts.cls);
      var onMove = function (e) { opts.onMove(e); };
      var onUp = function () {
        if (sidebar) sidebar.classList.remove(opts.cls);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }

  bindDragResize(ideResize, {
    cls: "is-ide-resizing",
    onMove: function (e) {
      var rect = sidebar ? sidebar.getBoundingClientRect() : { right: window.innerWidth };
      applyIdeWidth(rect.right - e.clientX);
    },
  });

  bindDragResize(ideTreeResize, {
    cls: "is-ide-tree-resizing",
    onMove: function (e) {
      if (!ideExplorer) return;
      var rect = ideExplorer.getBoundingClientRect();
      applyIdeTreeWidth(rect.right - e.clientX);
    },
  });

  function ideIsOpen() {
    return !!(sidebar && sidebar.classList.contains("has-ide"));
  }

  function ideIsMaximized() {
    return !!(sidebar && sidebar.classList.contains("ide-maximized"));
  }

  function syncIdeMaximize() {
    var on = ideIsMaximized();
    if (!ideMaximizeBtn) return;
    ideMaximizeBtn.setAttribute("aria-pressed", on ? "true" : "false");
    ideMaximizeBtn.title = on ? "还原编辑器" : "全屏编辑器";
    ideMaximizeBtn.setAttribute("aria-label", on ? "还原编辑器" : "全屏编辑器");
  }

  function setIdeMaximized(on) {
    if (!sidebar) return;
    sidebar.classList.toggle("ide-maximized", !!on);
    try {
      if (on) localStorage.setItem(IDE_MAX_KEY, "1");
      else localStorage.removeItem(IDE_MAX_KEY);
    } catch (err) {}
    syncIdeMaximize();
    updateCrumb();
  }

  function toggleIdeMaximized() {
    if (!ideIsOpen()) openIdePanel(currentIdePanel() || "files");
    setIdeMaximized(!ideIsMaximized());
  }

  function syncIdeToggle() {
    var on = ideIsOpen();
    [ideToggleBtn, ideToggleDockBtn].forEach(function (btn) {
      if (!btn) return;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("is-on", on);
    });
  }

  function workspaceRoot() {
    return activeWorkspaceRoot || homeWorkspaceRoot || "";
  }

  function workspaceDisplayName() {
    var root = workspaceRoot();
    if (!root) return "资源管理器";
    if (homeWorkspaceRoot && String(root).replace(/\\/g, "/").toLowerCase() ===
        String(homeWorkspaceRoot).replace(/\\/g, "/").toLowerCase()) {
      return "Home";
    }
    var parts = String(root).replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || "资源管理器";
  }

  function isMarkdownPath(path) {
    return /\.(md|markdown)$/i.test(String(path || ""));
  }

  function setIdePanel(panel) {
    if (!idePanel) return;
    var next = panel || "files";
    if (next !== "files" && next !== "browser" && next !== "terminal") next = "files";
    idePanel.setAttribute("data-panel", next);
    try { localStorage.setItem("ai-agent-ide-panel:" + provider, next); } catch (err) {}
  }

  function currentIdePanel() {
    return (idePanel && idePanel.getAttribute("data-panel")) || "files";
  }

  function setIdeOpen(on, panel) {
    if (!sidebar) return;
    if (panel) setIdePanel(panel);
    sidebar.classList.toggle("has-ide", !!on);
    try { localStorage.setItem("ai-agent-ide-open:" + provider, on ? "1" : "0"); } catch (err) {}
    syncIdeToggle();
    if (on) {
      if (ideRootName) ideRootName.textContent = workspaceDisplayName();
      if (currentIdePanel() === "files") {
        refreshIdeTree();
        if (ideActivePath) showIdeEditor(true);
      }
    }
  }

  function openIdePanel(panel) {
    setIdeOpen(true, panel || "files");
  }

  function toggleIde() {
    if (ideIsOpen()) setIdeOpen(false);
    else openIdePanel(currentIdePanel() || "files");
  }

  function showIdeEditor(hasFile) {
    if (ideEmpty) ideEmpty.style.display = hasFile ? "none" : "grid";
    syncEditorView();
  }

  function activeTab() {
    return ideOpenTabs.find(function (t) { return t.path === ideActivePath; }) || null;
  }

  function syncEditorView() {
    var tab = activeTab();
    var hasFile = !!(tab && ideActivePath);
    var md = hasFile && isMarkdownPath(ideActivePath);
    if (md && tab && tab.view !== "preview" && tab.view !== "source") tab.view = "preview";
    var preview = !!(md && tab && tab.view === "preview");
    if (ideViewTools) ideViewTools.classList.toggle("is-on", md && hasFile);
    if (ideViewPreview) ideViewPreview.classList.toggle("is-on", preview);
    if (ideViewSource) ideViewSource.classList.toggle("is-on", !preview);
    if (ideOutlineToggle) ideOutlineToggle.style.display = md && hasFile ? "" : "none";
    if (ideEditor) ideEditor.classList.toggle("is-preview", preview);
    if (preview) {
      if (ideCodeWrap) ideCodeWrap.style.display = "none";
      if (idePreview) {
        idePreview.style.display = "block";
        if (typeof renderMarkdown === "function") {
          idePreview.innerHTML = renderMarkdown(tab.content || "");
        } else {
          idePreview.textContent = tab.content || "";
        }
      }
    } else {
      if (idePreview) {
        idePreview.style.display = "none";
        idePreview.innerHTML = "";
      }
      if (ideCodeWrap) ideCodeWrap.style.display = hasFile ? "flex" : "none";
    }
    if (!md || !hasFile) setOutlineOpen(false);
    else if (ideOutlineOpen) renderOutline();
  }

  function setEditorView(mode) {
    var tab = activeTab();
    if (!tab) return;
    tab.view = mode === "preview" ? "preview" : "source";
    if (tab.view === "preview" && !isMarkdownPath(tab.path)) tab.view = "source";
    syncEditorView();
  }

  function setOutlineOpen(on) {
    ideOutlineOpen = !!on && isMarkdownPath(ideActivePath);
    if (ideOutline) ideOutline.classList.toggle("is-on", ideOutlineOpen);
    if (ideOutlineToggle) ideOutlineToggle.classList.toggle("is-on", ideOutlineOpen);
    if (ideOutlineOpen) renderOutline();
    else if (ideOutline) ideOutline.innerHTML = "";
  }

  function renderOutline() {
    if (!ideOutline) return;
    ideOutline.innerHTML = "";
    var tab = activeTab();
    if (!tab) return;
    var lines = String(tab.content || "").split("\n");
    var count = 0;
    lines.forEach(function (line, idx) {
      var m = /^(#{1,3})\s+(.+)$/.exec(line);
      if (!m) return;
      count += 1;
      var level = m[1].length;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ai-agent-ide-outline-item is-h" + level;
      btn.textContent = m[2].replace(/#+\s*$/, "").trim();
      btn.title = btn.textContent;
      btn.onclick = function () {
        var tabNow = activeTab();
        if (!tabNow) return;
        if (tabNow.view === "preview") {
          var all = idePreview ? idePreview.querySelectorAll("h1,h2,h3") : [];
          var nth = 0;
          for (var j = 0; j < lines.length; j++) {
            if (!/^(#{1,3})\s+/.test(lines[j])) continue;
            if (j === idx) {
              if (all[nth]) all[nth].scrollIntoView({ block: "start", behavior: "smooth" });
              return;
            }
            nth += 1;
          }
        } else if (ideCode) {
          var pos = 0;
          for (var k = 0; k < idx; k++) pos += lines[k].length + 1;
          ideCode.focus();
          ideCode.setSelectionRange(pos, pos + line.length);
          var lh = parseFloat(window.getComputedStyle(ideCode).lineHeight) || 20;
          ideCode.scrollTop = Math.max(0, (idx - 2) * lh);
        }
      };
      ideOutline.appendChild(btn);
    });
    if (!count) {
      var empty = document.createElement("div");
      empty.style.cssText = "padding:10px 12px;color:#888;font-size:12px;";
      empty.textContent = "无标题";
      ideOutline.appendChild(empty);
    }
  }

  function openFindBar() {
    if (!ideFindBar || !ideActivePath) return;
    if (activeTab() && activeTab().view === "preview") setEditorView("source");
    ideFindBar.classList.add("is-on");
    if (ideFindInput) {
      ideFindInput.focus();
      ideFindInput.select();
    }
    runFind(false);
  }

  function closeFindBar() {
    if (ideFindBar) ideFindBar.classList.remove("is-on");
    ideFindMatches = [];
    ideFindIndex = -1;
    if (ideFindCount) ideFindCount.textContent = "";
  }

  function runFind(jump) {
    var q = ideFindInput ? String(ideFindInput.value || "") : "";
    var text = ideCode ? String(ideCode.value || "") : "";
    ideFindMatches = [];
    if (q) {
      var lower = text.toLowerCase();
      var needle = q.toLowerCase();
      var from = 0;
      while (from <= lower.length) {
        var i = lower.indexOf(needle, from);
        if (i < 0) break;
        ideFindMatches.push(i);
        from = i + Math.max(needle.length, 1);
      }
    }
    if (!ideFindMatches.length) ideFindIndex = -1;
    else if (ideFindIndex < 0 || ideFindIndex >= ideFindMatches.length) ideFindIndex = 0;
    updateFindUi();
    if (jump !== false) jumpFind(0);
  }

  function updateFindUi() {
    if (!ideFindCount) return;
    if (!ideFindInput || !ideFindInput.value) {
      ideFindCount.textContent = "";
      return;
    }
    if (!ideFindMatches.length) {
      ideFindCount.textContent = "无结果";
      return;
    }
    ideFindCount.textContent = (ideFindIndex + 1) + " / " + ideFindMatches.length;
  }

  function jumpFind(delta) {
    if (!ideCode || !ideFindMatches.length) {
      updateFindUi();
      return;
    }
    if (delta) {
      ideFindIndex = (ideFindIndex + delta + ideFindMatches.length) % ideFindMatches.length;
    }
    if (ideFindIndex < 0) ideFindIndex = 0;
    var start = ideFindMatches[ideFindIndex];
    var len = String(ideFindInput && ideFindInput.value || "").length;
    ideCode.focus();
    ideCode.setSelectionRange(start, start + len);
    var before = ideCode.value.slice(0, start);
    var line = before.split("\n").length;
    var lh = parseFloat(window.getComputedStyle(ideCode).lineHeight) || 20;
    ideCode.scrollTop = Math.max(0, (line - 3) * lh);
    updateFindUi();
  }

  function fileBase(path) {
    return String(path || "").replace(/\\/g, "/").split("/").pop() || path;
  }

  function parentDir(path) {
    var p = String(path || "").replace(/\\/g, "/");
    if (!p || p === ".") return ".";
    var i = p.lastIndexOf("/");
    return i < 0 ? "." : (p.slice(0, i) || ".");
  }

  function joinPath(dir, name) {
    var d = String(dir || ".").replace(/\\/g, "/");
    if (!d || d === ".") return name;
    return d.replace(/\/+$/, "") + "/" + name;
  }

  function fileExtClass(name) {
    var ext = String(name || "").split(".").pop().toLowerCase();
    if (ext === "py") return "is-py";
    if (ext === "js" || ext === "mjs" || ext === "cjs" || ext === "ts" || ext === "tsx") return "is-js";
    if (ext === "html" || ext === "htm") return "is-html";
    if (ext === "css" || ext === "scss") return "is-css";
    if (ext === "md" || ext === "markdown") return "is-md";
    if (ext === "json") return "is-json";
    if (ext === "yml" || ext === "yaml") return "is-yml";
    if (ext === "env" || name === ".env" || name === ".env.example") return "is-env";
    if (ext === "bat" || ext === "cmd") return "is-bat";
    if (ext === "sh" || ext === "bash" || ext === "zsh") return "is-sh";
    return "";
  }

  function fileIconGlyph(name) {
    var ext = String(name || "").split(".").pop().toLowerCase();
    if (ext === "py") return "py";
    if (ext === "js" || ext === "ts") return "JS";
    if (ext === "html") return "<>";
    if (ext === "css") return "#";
    if (ext === "md" || ext === "markdown") return "M↓";
    if (ext === "json") return "{}";
    if (ext === "yml" || ext === "yaml") return "!";
    if (ext === "bat" || ext === "sh") return "$>";
    if (name === ".gitignore") return "gi";
    if (String(name).indexOf(".env") === 0) return "⚙";
    return "·";
  }

  function updateGutter() {
    if (!ideGutter || !ideCode) return;
    var lines = String(ideCode.value || "").split("\n").length;
    var out = [];
    for (var i = 1; i <= lines; i++) out.push(String(i));
    ideGutter.textContent = out.join("\n");
  }

  function langFromPath(path) {
    var base = fileBase(path || "");
    if (!base) return "";
    if (base === "Dockerfile" || base.indexOf("Dockerfile.") === 0) return "bash";
    if (base === "Makefile" || base === "makefile") return "bash";
    var ext = base.indexOf(".") >= 0 ? base.split(".").pop().toLowerCase() : "";
    if (ext === "bat" || ext === "cmd" || ext === "ps1") return "bash";
    return ext;
  }

  function updateIdeHighlight() {
    if (!ideHighlightCode || !ideCode) return;
    var raw = String(ideCode.value || "");
    if (typeof highlightCode !== "function") {
      ideHighlightCode.textContent = raw;
      return;
    }
    var html = highlightCode(raw, langFromPath(ideActivePath));
    // highlightCode strips one trailing newline; keep overlay height in sync.
    if (/\n$/.test(raw)) html += "\n";
    ideHighlightCode.innerHTML = html || " ";
  }

  function syncIdeHighlightScroll() {
    if (!ideHighlight || !ideCode) return;
    ideHighlight.scrollTop = ideCode.scrollTop;
    ideHighlight.scrollLeft = ideCode.scrollLeft;
  }

  function syncNavButtons() {
    if (ideBackBtn) ideBackBtn.disabled = ideNavIndex <= 0;
    if (ideForwardBtn) ideForwardBtn.disabled = ideNavIndex < 0 || ideNavIndex >= ideNavStack.length - 1;
  }

  function pushNav(path) {
    if (!path) return;
    if (ideNavIndex >= 0 && ideNavStack[ideNavIndex] === path) {
      syncNavButtons();
      return;
    }
    ideNavStack = ideNavStack.slice(0, ideNavIndex + 1);
    ideNavStack.push(path);
    if (ideNavStack.length > 40) ideNavStack.shift();
    ideNavIndex = ideNavStack.length - 1;
    syncNavButtons();
  }

  function updateCrumb() {
    if (!ideCrumbName) return;
    if (ideActivePath) {
      ideCrumbName.textContent = fileBase(ideActivePath);
      ideCrumbName.title = ideActivePath;
      return;
    }
    // No open file: show agent/workspace title so the editor header isn't blank.
    var title = (chatTitleEl && String(chatTitleEl.textContent || "").trim())
      || workspaceDisplayName()
      || "";
    ideCrumbName.textContent = title;
    ideCrumbName.title = title;
  }

  function fsApi(path, body) {
    return apiFetch(apiBase + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ root: workspaceRoot() }, body || {})),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var detail = (data && (data.detail || data.message)) || res.statusText;
          if (Array.isArray(detail)) detail = detail.map(function (x) { return x.msg || JSON.stringify(x); }).join("; ");
          throw new Error(detail || "request failed");
        }
        return data;
      });
    });
  }

  function fetchPathInfo(rel) {
    return apiFetch(
      apiBase + "/api/workspace/info?root=" + encodeURIComponent(workspaceRoot()) +
        "&path=" + encodeURIComponent(rel || ".")
    ).then(function (res) { return res.json(); });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.resolve();
  }

  function retargetOpenTabs(fromPath, toPath) {
    ideOpenTabs.forEach(function (tab) {
      if (tab.path === fromPath) tab.path = toPath;
      else if (tab.path.indexOf(fromPath + "/") === 0) {
        tab.path = toPath + tab.path.slice(fromPath.length);
      }
    });
    if (ideActivePath === fromPath) ideActivePath = toPath;
    else if (ideActivePath.indexOf(fromPath + "/") === 0) {
      ideActivePath = toPath + ideActivePath.slice(fromPath.length);
    }
  }

  function closeTabsUnder(path) {
    ideOpenTabs = ideOpenTabs.filter(function (tab) {
      return !(tab.path === path || tab.path.indexOf(path + "/") === 0);
    });
    if (ideActivePath === path || ideActivePath.indexOf(path + "/") === 0) {
      ideActivePath = ideOpenTabs[0] ? ideOpenTabs[0].path : "";
      if (ideActivePath) {
        var tab = ideOpenTabs.find(function (t) { return t.path === ideActivePath; });
        if (ideCode && tab) ideCode.value = tab.content;
        showIdeEditor(true);
      } else {
        if (ideCode) ideCode.value = "";
        showIdeEditor(false);
      }
      updateGutter();
      updateCrumb();
    }
    renderIdeTabs();
  }

  function renderIdeTabs() {
    if (!ideTabs) return;
    ideTabs.innerHTML = "";
    ideOpenTabs.forEach(function (tab) {
      var btn = document.createElement("button");
      btn.type = "button";
      var base = fileBase(tab.path);
      btn.className = "ai-agent-ide-tab" +
        (tab.path === ideActivePath ? " is-active" : "") +
        (tab.dirty ? " is-dirty" : "");
      btn.title = tab.path;
      var icon = document.createElement("span");
      icon.className = "ai-agent-ide-tab-icon " + fileExtClass(base);
      icon.textContent = fileIconGlyph(base);
      btn.appendChild(icon);
      var name = document.createElement("span");
      name.className = "ai-agent-ide-tab-name";
      name.textContent = base;
      btn.appendChild(name);
      var close = document.createElement("span");
      close.className = "ai-agent-ide-tab-close";
      close.setAttribute("role", "button");
      close.title = "关闭";
      close.textContent = "×";
      close.onclick = function (ev) {
        ev.stopPropagation();
        closeIdeTab(tab.path);
      };
      btn.appendChild(close);
      btn.onclick = function () { activateIdeTab(tab.path, true); };
      ideTabs.appendChild(btn);
    });
  }

  function flushActiveBuffer() {
    if (!ideActivePath || !ideCode) return;
    var prev = ideOpenTabs.find(function (t) { return t.path === ideActivePath; });
    if (!prev) return;
    prev.content = ideCode.value;
    prev.dirty = prev.content !== prev.original;
  }

  function activateIdeTab(path, recordNav) {
    var tab = ideOpenTabs.find(function (t) { return t.path === path; });
    if (!tab) return;
    flushActiveBuffer();
    ideActivePath = path;
    if (!tab.view) tab.view = isMarkdownPath(path) ? "preview" : "source";
    if (ideCode) ideCode.value = tab.content;
    showIdeEditor(true);
    updateGutter();
    updateIdeHighlight();
    syncIdeHighlightScroll();
    updateCrumb();
    renderIdeTabs();
    renderIdeTree();
    if (recordNav) pushNav(path);
    else syncNavButtons();
  }

  function closeIdeTab(path) {
    var idx = ideOpenTabs.findIndex(function (t) { return t.path === path; });
    if (idx < 0) return;
    if (path === ideActivePath) flushActiveBuffer();
    ideOpenTabs.splice(idx, 1);
    if (ideActivePath === path) {
      var next = ideOpenTabs[idx] || ideOpenTabs[idx - 1] || null;
      ideActivePath = next ? next.path : "";
      if (next) {
        if (ideCode) ideCode.value = next.content;
        showIdeEditor(true);
      } else {
        if (ideCode) ideCode.value = "";
        closeFindBar();
        setOutlineOpen(false);
        showIdeEditor(false);
      }
      updateGutter();
      updateIdeHighlight();
      syncIdeHighlightScroll();
      updateCrumb();
    }
    renderIdeTabs();
    renderIdeTree();
  }

  function openIdeFile(path, opts) {
    opts = opts || {};
    if (!path) return Promise.resolve();
    setIdeOpen(true);
    var existing = ideOpenTabs.find(function (t) { return t.path === path; });
    if (existing && !opts.forceReload) {
      activateIdeTab(path, true);
      return Promise.resolve(existing);
    }
    return apiFetch(
      apiBase + "/api/workspace/file?root=" + encodeURIComponent(workspaceRoot()) +
        "&path=" + encodeURIComponent(path)
    )
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || data.content == null) throw new Error("read failed");
        var tab = existing || {
          path: path,
          content: "",
          original: "",
          dirty: false,
          view: isMarkdownPath(path) ? "preview" : "source",
        };
        tab.content = String(data.content);
        tab.original = tab.content;
        tab.dirty = false;
        if (!tab.view) tab.view = isMarkdownPath(path) ? "preview" : "source";
        if (!existing) ideOpenTabs.push(tab);
        activateIdeTab(path, true);
        return tab;
      })
      .catch(function (err) {
        console.warn("openIdeFile", err);
      });
  }

  function saveIdeFile() {
    if (!ideActivePath || !ideCode) return Promise.resolve();
    var tab = ideOpenTabs.find(function (t) { return t.path === ideActivePath; });
    if (!tab) return Promise.resolve();
    tab.content = ideCode.value;
    return apiFetch(apiBase + "/api/workspace/file", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        root: workspaceRoot(),
        path: tab.path,
        content: tab.content,
      }),
    })
      .then(function (res) { return res.json(); })
      .then(function () {
        tab.original = tab.content;
        tab.dirty = false;
        renderIdeTabs();
      })
      .catch(function (err) {
        alert("保存失败：" + (err && err.message ? err.message : "unknown"));
      });
  }

  function fetchTreeEntries(relPath) {
    var key = String(relPath || ".");
    return apiFetch(
      apiBase + "/api/workspace/tree?root=" + encodeURIComponent(workspaceRoot()) +
        "&path=" + encodeURIComponent(key) + "&depth=1"
    )
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var entries = (data && data.entries) || [];
        ideChildrenCache[key] = entries;
        return entries;
      });
  }

  function hideIdeCtx() {
    if (!ideCtx) return;
    ideCtx.classList.remove("is-on");
    ideCtx.setAttribute("aria-hidden", "true");
    ideCtx.innerHTML = "";
    ideCtxTarget = null;
  }

  function showIdeCtx(x, y, target) {
    if (!ideCtx) return;
    ideCtxTarget = target;
    var isRoot = !target.path || target.path === ".";
    var isDir = !!target.isDir;
    var hasClip = !!ideClipboard;
    var items = [
      { id: "add-chat", label: "添加到对话", disabled: isRoot },
      { sep: true },
      { id: "reveal", label: "在资源管理器中显示" },
      { id: "new-file", label: "新建文件" },
      { id: "new-folder", label: "新建文件夹" },
      { sep: true },
      { id: "copy-path", label: "复制路径" },
      { id: "copy-rel", label: "复制相对路径", disabled: isRoot },
      { sep: true },
      { id: "cut", label: "剪切", disabled: isRoot },
      { id: "copy", label: "复制", disabled: isRoot },
      { id: "paste", label: "粘贴", disabled: !hasClip || !(isDir || isRoot) },
      { sep: true },
      { id: "rename", label: "重命名", disabled: isRoot },
      { id: "delete", label: "删除", disabled: isRoot },
    ];
    ideCtx.innerHTML = "";
    items.forEach(function (item) {
      if (item.sep) {
        var sep = document.createElement("div");
        sep.className = "ai-agent-ide-ctx-sep";
        ideCtx.appendChild(sep);
        return;
      }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = item.label;
      btn.disabled = !!item.disabled;
      btn.onclick = function () {
        hideIdeCtx();
        runIdeCtxAction(item.id, target);
      };
      ideCtx.appendChild(btn);
    });
    ideCtx.classList.add("is-on");
    ideCtx.setAttribute("aria-hidden", "false");
    var pad = 6;
    var w = ideCtx.offsetWidth || 200;
    var h = ideCtx.offsetHeight || 280;
    var left = Math.min(x, window.innerWidth - w - pad);
    var top = Math.min(y, window.innerHeight - h - pad);
    ideCtx.style.left = Math.max(pad, left) + "px";
    ideCtx.style.top = Math.max(pad, top) + "px";
  }

  function targetDirForCreate(target) {
    if (!target || !target.path || target.path === ".") return ".";
    return target.isDir ? target.path : parentDir(target.path);
  }

  function ensureDirExpanded(dir) {
    if (!dir || dir === ".") return Promise.resolve();
    ideExpanded[dir] = true;
    if (ideChildrenCache[dir]) return Promise.resolve();
    return fetchTreeEntries(dir).catch(function () {});
  }

  function promptInlineName(dir, kind, defaultName) {
    return new Promise(function (resolve) {
      if (!ideTree) {
        resolve(window.prompt(kind === "dir" ? "文件夹名" : "文件名", defaultName || "") || "");
        return;
      }
      ensureDirExpanded(dir).then(function () {
        renderIdeTree();
        var wrap = document.createElement("div");
        wrap.className = "ai-agent-ide-inline-input";
        wrap.style.paddingLeft = "20px";
        var input = document.createElement("input");
        input.type = "text";
        input.value = defaultName || (kind === "dir" ? "新建文件夹" : "未命名.txt");
        wrap.appendChild(input);
        ideTree.insertBefore(wrap, ideTree.firstChild);
        input.focus();
        input.select();
        var done = false;
        function finish(ok) {
          if (done) return;
          done = true;
          var val = ok ? String(input.value || "").trim() : "";
          wrap.remove();
          resolve(val);
        }
        input.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter") {
            ev.preventDefault();
            finish(true);
          } else if (ev.key === "Escape") {
            ev.preventDefault();
            finish(false);
          }
        });
        input.addEventListener("blur", function () { finish(true); });
      });
    });
  }

  function createEntry(kind, aroundTarget) {
    var dir = targetDirForCreate(aroundTarget || { path: ".", isDir: true });
    return promptInlineName(dir, kind).then(function (name) {
      if (!name) return null;
      var path = joinPath(dir, name);
      var endpoint = kind === "dir" ? "/api/workspace/mkdir" : "/api/workspace/create";
      return fsApi(endpoint, { path: path }).then(function (data) {
        return ensureDirExpanded(dir).then(function () {
          return refreshIdeTree().then(function () {
            if (kind !== "dir" && data && data.path) openIdeFile(data.path);
            return data;
          });
        });
      });
    }).catch(function (err) {
      alert((kind === "dir" ? "新建文件夹失败：" : "新建文件失败：") + (err.message || err));
    });
  }

  function renameEntry(target) {
    if (!target || !target.path || target.path === ".") return Promise.resolve();
    var oldName = fileBase(target.path);
    var name = window.prompt("重命名", oldName);
    if (!name || name === oldName) return Promise.resolve();
    return fsApi("/api/workspace/rename", { path: target.path, new_name: name })
      .then(function (data) {
        retargetOpenTabs(target.path, data.path);
        if (ideClipboard && ideClipboard.path === target.path) ideClipboard.path = data.path;
        return refreshIdeTree().then(function () {
          updateCrumb();
          renderIdeTabs();
        });
      })
      .catch(function (err) {
        alert("重命名失败：" + (err.message || err));
      });
  }

  function deleteEntry(target) {
    if (!target || !target.path || target.path === ".") return Promise.resolve();
    if (!window.confirm("删除 " + target.path + " ？")) return Promise.resolve();
    return fsApi("/api/workspace/delete", { path: target.path })
      .then(function () {
        closeTabsUnder(target.path);
        if (ideClipboard && (ideClipboard.path === target.path ||
            ideClipboard.path.indexOf(target.path + "/") === 0)) {
          ideClipboard = null;
        }
        return refreshIdeTree();
      })
      .catch(function (err) {
        alert("删除失败：" + (err.message || err));
      });
  }

  function pasteInto(target) {
    if (!ideClipboard) return Promise.resolve();
    var dir = targetDirForCreate(target || { path: ".", isDir: true });
    var base = fileBase(ideClipboard.path);
    var dest = joinPath(dir, base);
    if (dest === ideClipboard.path) {
      var stem = base;
      var ext = "";
      var dot = base.lastIndexOf(".");
      if (dot > 0 && ideClipboard.type !== "dir") {
        stem = base.slice(0, dot);
        ext = base.slice(dot);
      }
      dest = joinPath(dir, stem + " - copy" + ext);
    }
    var endpoint = ideClipboard.mode === "cut" ? "/api/workspace/move" : "/api/workspace/copy";
    var from = ideClipboard.path;
    return fsApi(endpoint, { path: from, dest: dest })
      .then(function (data) {
        if (ideClipboard.mode === "cut") {
          retargetOpenTabs(from, data.path);
          ideClipboard = null;
        }
        return ensureDirExpanded(dir).then(function () {
          return refreshIdeTree().then(function () {
            if (data.type === "file") openIdeFile(data.path);
          });
        });
      })
      .catch(function (err) {
        alert("粘贴失败：" + (err.message || err));
      });
  }

  function addPathToChat(relPath) {
    if (!relPath || !inputField) return;
    var token = "`" + relPath.replace(/\\/g, "/") + "`";
    var cur = inputField.value || "";
    var needsSpace = cur && !/\s$/.test(cur);
    inputField.value = cur + (needsSpace ? " " : "") + token + " ";
    inputField.focus();
    try {
      inputField.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (err) {}
  }

  function runIdeCtxAction(id, target) {
    if (id === "add-chat") {
      addPathToChat(target.path);
      return;
    }
    if (id === "reveal") {
      fsApi("/api/workspace/reveal", { path: target.path || "." }).catch(function (err) {
        alert("打开失败：" + (err.message || err));
      });
      return;
    }
    if (id === "new-file") { createEntry("file", target); return; }
    if (id === "new-folder") { createEntry("dir", target); return; }
    if (id === "copy-path") {
      fetchPathInfo(target.path || ".").then(function (data) {
        return copyText(data.abs_path || "");
      }).catch(function () {});
      return;
    }
    if (id === "copy-rel") {
      copyText(String(target.path || "").replace(/\\/g, "/")).catch(function () {});
      return;
    }
    if (id === "cut" || id === "copy") {
      if (!target.path || target.path === ".") return;
      ideClipboard = { mode: id === "cut" ? "cut" : "copy", path: target.path, type: target.isDir ? "dir" : "file" };
      renderIdeTree();
      return;
    }
    if (id === "paste") { pasteInto(target); return; }
    if (id === "rename") { renameEntry(target); return; }
    if (id === "delete") { deleteEntry(target); return; }
  }

  function renderIdeTree() {
    if (!ideTree) return;
    ideTree.innerHTML = "";

    function appendEntry(item, depth) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "ai-agent-ide-tree-item" +
        (item.type === "dir" ? " is-dir" : "") +
        (ideExpanded[item.path] ? " is-expanded" : "") +
        (item.path === ideActivePath ? " is-active" : "") +
        (ideClipboard && ideClipboard.mode === "cut" && ideClipboard.path === item.path ? " is-cut" : "");
      row.setAttribute("data-path", item.path);
      row.setAttribute("data-type", item.type);
      row.style.paddingLeft = (4 + depth * 12) + "px";
      row.title = item.path;

      var chev = document.createElement("span");
      chev.className = "ai-agent-ide-tree-chevron";
      chev.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M6 3l5 5-5 5z"/></svg>';
      row.appendChild(chev);

      var icon = document.createElement("span");
      icon.className = "ai-agent-ide-tree-icon " +
        (item.type === "dir" ? "is-dir" : fileExtClass(item.name));
      icon.textContent = item.type === "dir" ? "📁" : fileIconGlyph(item.name);
      row.appendChild(icon);

      var label = document.createElement("span");
      label.className = "ai-agent-ide-tree-label";
      label.textContent = item.name;
      row.appendChild(label);

      row.oncontextmenu = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        showIdeCtx(ev.clientX, ev.clientY, {
          path: item.path,
          isDir: item.type === "dir",
        });
      };

      if (item.type === "dir") {
        row.onclick = function () { toggleDir(item.path); };
      } else {
        row.onclick = function () { openIdeFile(item.path); };
      }
      ideTree.appendChild(row);

      if (item.type === "dir" && ideExpanded[item.path]) {
        var kids = ideChildrenCache[item.path] || [];
        kids.forEach(function (child) { appendEntry(child, depth + 1); });
      }
    }

    var roots = ideChildrenCache["."] || [];
    if (!roots.length) {
      var empty = document.createElement("div");
      empty.style.cssText = "padding:10px 12px;color:#6b6b6b;font-size:12px";
      empty.textContent = "空目录或无权访问";
      ideTree.appendChild(empty);
      return;
    }
    roots.forEach(function (item) { appendEntry(item, 0); });
  }

  function toggleDir(path) {
    if (ideExpanded[path]) {
      delete ideExpanded[path];
      renderIdeTree();
      return;
    }
    ideExpanded[path] = true;
    if (ideChildrenCache[path]) {
      renderIdeTree();
      return;
    }
    fetchTreeEntries(path)
      .then(function () { renderIdeTree(); })
      .catch(function () {
        delete ideExpanded[path];
        renderIdeTree();
      });
  }

  function refreshIdeTree() {
    if (!ideTree) return Promise.resolve();
    if (ideRootName) ideRootName.textContent = workspaceDisplayName();
    ideChildrenCache = {};
    return fetchTreeEntries(".")
      .then(function () {
        var paths = Object.keys(ideExpanded);
        var chain = Promise.resolve();
        paths.forEach(function (p) {
          chain = chain.then(function () { return fetchTreeEntries(p).catch(function () {}); });
        });
        return chain.then(function () { renderIdeTree(); });
      })
      .catch(function () {
        ideTree.innerHTML = "";
        var err = document.createElement("div");
        err.style.cssText = "padding:10px 12px;color:#6b6b6b;font-size:12px";
        err.textContent = "加载文件树失败";
        ideTree.appendChild(err);
      });
  }

  function openPathsFromTurnChanges(payload) {
    if (!payload || !payload.files || !payload.files.length) return;
    setIdeOpen(true);
    var files = payload.files.slice(0, 8);
    var i = 0;
    function next() {
      if (i >= files.length) return;
      var f = files[i++];
      var p = f && f.path;
      if (!p || f.status === "deleted") {
        next();
        return;
      }
      openIdeFile(p).then(next);
    }
    next();
  }

  if (ideToggleBtn) ideToggleBtn.onclick = function () { toggleIde(); };
  if (ideToggleDockBtn) ideToggleDockBtn.onclick = function () { toggleIde(); };
  if (ideCollapseAllBtn) {
    ideCollapseAllBtn.onclick = function () {
      ideExpanded = {};
      renderIdeTree();
    };
  }
  var ideRail = document.getElementById("ai-agent-ide-rail");
  var ideRailNew = document.getElementById("ai-agent-ide-rail-new");
  var ideRailBrowser = document.getElementById("ai-agent-ide-rail-browser");
  var ideRailTerminal = document.getElementById("ai-agent-ide-rail-terminal");
  var ideRailFiles = document.getElementById("ai-agent-ide-rail-files");
  var ideRailExpand = document.getElementById("ai-agent-ide-rail-expand");
  var ideBrowserUrl = document.getElementById("ai-agent-ide-browser-url");
  var ideBrowserGo = document.getElementById("ai-agent-ide-browser-go");
  var ideBrowserFrame = document.getElementById("ai-agent-ide-browser-frame");
  var ideTerm = document.getElementById("ai-agent-ide-term");
  var IDE_RAIL_LABELS_KEY = "ai-agent-ide-rail-labels:" + provider;

  function isIdeRailLabelsOn() {
    return !!(ideRail && ideRail.classList.contains("is-labels"));
  }

  function setIdeRailLabels(on) {
    if (!ideRail) return;
    var open = !!on;
    ideRail.classList.toggle("is-labels", open);
    if (ideRailExpand) {
      ideRailExpand.title = open ? "收起" : "展开";
      ideRailExpand.setAttribute("aria-label", open ? "收起" : "展开");
      ideRailExpand.setAttribute("aria-expanded", open ? "true" : "false");
      var label = ideRailExpand.querySelector(".ai-agent-ide-rail-label");
      if (label) label.textContent = open ? "收起" : "展开";
    }
    try {
      if (open) localStorage.setItem(IDE_RAIL_LABELS_KEY, "1");
      else localStorage.removeItem(IDE_RAIL_LABELS_KEY);
    } catch (err) {}
  }

  try {
    if (localStorage.getItem(IDE_RAIL_LABELS_KEY) === "1") setIdeRailLabels(true);
  } catch (err) {}

  if (ideRailExpand) {
    ideRailExpand.onclick = function () { setIdeRailLabels(!isIdeRailLabelsOn()); };
  }
  if (ideRailFiles) ideRailFiles.onclick = function () { openIdePanel("files"); };
  if (ideRailBrowser) ideRailBrowser.onclick = function () { openIdePanel("browser"); };
  if (ideRailTerminal) ideRailTerminal.onclick = function () { openIdePanel("terminal"); };
  if (ideRailNew) {
    ideRailNew.onclick = function () {
      openIdePanel("files");
      createEntry("file", { path: ".", isDir: true });
    };
  }

  function navigateBrowser() {
    if (!ideBrowserUrl || !ideBrowserFrame) return;
    var url = String(ideBrowserUrl.value || "").trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    ideBrowserUrl.value = url;
    ideBrowserFrame.src = url;
  }
  if (ideBrowserGo) ideBrowserGo.onclick = navigateBrowser;
  if (ideBrowserUrl) {
    ideBrowserUrl.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        navigateBrowser();
      }
    });
  }

  function appendTerm(text) {
    if (!ideTerm) return;
    ideTerm.value = (ideTerm.value || "") + text;
    ideTerm.scrollTop = ideTerm.scrollHeight;
  }
  function runTerminalLine(line) {
    var cmd = String(line || "").trim();
    if (!cmd) return;
    appendTerm("\n$ " + cmd + "\n");
    return apiFetch(apiBase + "/api/workspace/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root: workspaceRoot(), command: cmd }),
    })
      .then(function (res) { return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.detail) || "exec failed");
        return data;
      }); })
      .then(function (data) {
        appendTerm(String(data.output || "") + (data.output && !/\n$/.test(data.output) ? "\n" : ""));
        if (data.exit_code) appendTerm("[exit " + data.exit_code + "]\n");
      })
      .catch(function (err) {
        appendTerm("错误：" + (err.message || err) + "\n");
      });
  }
  if (ideTerm) {
    if (!ideTerm.value) {
      ideTerm.value = "工作区终端 · " + (workspaceRoot() || ".") + "\n输入命令后按 Enter 执行。Ctrl+L 清空。\n";
    }
    ideTerm.addEventListener("keydown", function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && String(ev.key || "").toLowerCase() === "l") {
        ev.preventDefault();
        ideTerm.value = "";
        return;
      }
      if (ev.key !== "Enter" || ev.shiftKey) return;
      ev.preventDefault();
      var full = ideTerm.value || "";
      var lines = full.split("\n");
      var last = lines[lines.length - 1] || "";
      var cmd = last.replace(/^\$\s*/, "");
      // If cursor isn't at a fresh prompt line, use selection or last non-empty
      if (!cmd.trim()) {
        for (var i = lines.length - 1; i >= 0; i--) {
          var t = lines[i].replace(/^\$\s*/, "").trim();
          if (t && t.indexOf("工作区终端") !== 0 && t.indexOf("输入命令") !== 0) {
            cmd = t;
            break;
          }
        }
      }
      runTerminalLine(cmd);
    });
  }

  try {
    var savedPanel = localStorage.getItem("ai-agent-ide-panel:" + provider);
    if (savedPanel) setIdePanel(savedPanel);
  } catch (err) {}

  if (ideSaveBtn) ideSaveBtn.onclick = function () { saveIdeFile(); };
  if (ideRefreshBtn) ideRefreshBtn.onclick = function () { refreshIdeTree(); };
  if (ideMaximizeBtn) ideMaximizeBtn.onclick = function () { toggleIdeMaximized(); };
  if (ideNewFileBtn) ideNewFileBtn.onclick = function () {
    createEntry("file", { path: ideActivePath ? parentDir(ideActivePath) : ".", isDir: true });
  };
  if (ideNewFolderBtn) ideNewFolderBtn.onclick = function () {
    createEntry("dir", { path: ideActivePath ? parentDir(ideActivePath) : ".", isDir: true });
  };
  if (ideViewPreview) ideViewPreview.onclick = function () { setEditorView("preview"); };
  if (ideViewSource) ideViewSource.onclick = function () { setEditorView("source"); };
  if (ideFindToggle) ideFindToggle.onclick = function () {
    if (ideFindBar && ideFindBar.classList.contains("is-on")) closeFindBar();
    else openFindBar();
  };
  if (ideFindClose) ideFindClose.onclick = function () { closeFindBar(); };
  if (ideFindPrev) ideFindPrev.onclick = function () { jumpFind(-1); };
  if (ideFindNext) ideFindNext.onclick = function () { jumpFind(1); };
  if (ideFindInput) {
    ideFindInput.addEventListener("input", function () { runFind(true); });
    ideFindInput.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        jumpFind(ev.shiftKey ? -1 : 1);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        closeFindBar();
      }
    });
  }
  if (ideOutlineToggle) {
    ideOutlineToggle.onclick = function () { setOutlineOpen(!ideOutlineOpen); };
  }
  if (ideBackBtn) {
    ideBackBtn.onclick = function () {
      if (ideNavIndex <= 0) return;
      ideNavIndex -= 1;
      var path = ideNavStack[ideNavIndex];
      if (ideOpenTabs.find(function (t) { return t.path === path; })) activateIdeTab(path, false);
      else openIdeFile(path).then(function () { ideNavIndex = ideNavStack.indexOf(path); syncNavButtons(); });
    };
  }
  if (ideForwardBtn) {
    ideForwardBtn.onclick = function () {
      if (ideNavIndex >= ideNavStack.length - 1) return;
      ideNavIndex += 1;
      var path = ideNavStack[ideNavIndex];
      if (ideOpenTabs.find(function (t) { return t.path === path; })) activateIdeTab(path, false);
      else openIdeFile(path).then(function () { ideNavIndex = ideNavStack.indexOf(path); syncNavButtons(); });
    };
  }
  if (ideCode) {
    ideCode.addEventListener("input", function () {
      var tab = ideOpenTabs.find(function (t) { return t.path === ideActivePath; });
      if (!tab) return;
      tab.content = ideCode.value;
      tab.dirty = tab.content !== tab.original;
      renderIdeTabs();
      updateGutter();
      updateIdeHighlight();
      if (ideOutlineOpen) renderOutline();
      if (ideFindBar && ideFindBar.classList.contains("is-on")) runFind(false);
    });
    ideCode.addEventListener("scroll", function () {
      if (ideGutter) ideGutter.scrollTop = ideCode.scrollTop;
      syncIdeHighlightScroll();
    });
  }

  if (ideTree) {
    ideTree.addEventListener("contextmenu", function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest(".ai-agent-ide-tree-item")) return;
      ev.preventDefault();
      showIdeCtx(ev.clientX, ev.clientY, { path: ".", isDir: true });
    });
  }
  if (ideExplorer) {
    ideExplorer.addEventListener("contextmenu", function (ev) {
      if (ev.target && ev.target.closest && (
        ev.target.closest(".ai-agent-ide-tree-item") ||
        ev.target.closest("#ai-agent-ide-explorer-actions")
      )) return;
      if (ev.target && ev.target.closest && ev.target.closest("#ai-agent-ide-tree")) return;
      ev.preventDefault();
      showIdeCtx(ev.clientX, ev.clientY, { path: ".", isDir: true });
    });
  }

  document.addEventListener("mousedown", function (ev) {
    if (!ideCtx || !ideCtx.classList.contains("is-on")) return;
    if (ideCtx.contains(ev.target)) return;
    hideIdeCtx();
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") hideIdeCtx();
  });
  window.addEventListener("blur", hideIdeCtx);
  window.addEventListener("resize", hideIdeCtx);

  document.addEventListener("keydown", function (ev) {
    if ((ev.ctrlKey || ev.metaKey) && String(ev.key || "").toLowerCase() === "g") {
      ev.preventDefault();
      toggleIde();
    }
    if ((ev.ctrlKey || ev.metaKey) && String(ev.key || "").toLowerCase() === "s" && ideIsOpen()) {
      if (ev.target === ideCode || (sidebar && sidebar.contains(ev.target))) {
        ev.preventDefault();
        saveIdeFile();
      }
    }
    if ((ev.ctrlKey || ev.metaKey) && String(ev.key || "").toLowerCase() === "f" && ideIsOpen()) {
      var inIde = idePanel && idePanel.contains(ev.target);
      var inEditor = ideEditor && ideEditor.contains(ev.target);
      if (inIde || inEditor || ev.target === ideCode || ev.target === ideFindInput) {
        ev.preventDefault();
        openFindBar();
      }
    }
  });

  syncIdeToggle();
  syncIdeMaximize();
  updateCrumb();
  try {
    if (localStorage.getItem("ai-agent-ide-open:" + provider) === "1" && hubFullscreen) {
      setIdeOpen(true);
    }
    if (localStorage.getItem(IDE_MAX_KEY) === "1") {
      setIdeMaximized(true);
    }
  } catch (err) {}
