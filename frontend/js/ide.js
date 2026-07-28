/* coding-agent frontend/js/ide.js — Cursor-like code sidebar */

  var idePanel = document.getElementById("coding-agent-ide");
  var ideExplorer = document.getElementById("coding-agent-ide-explorer");
  var ideTree = document.getElementById("coding-agent-ide-tree");
  var ideRootName = document.getElementById("coding-agent-ide-root-name");
  var ideEditor = document.getElementById("coding-agent-ide-editor");
  var ideTabs = document.getElementById("coding-agent-ide-tabs-scroll") || document.getElementById("coding-agent-ide-tabs");
  var ideMaximizeBtn = document.getElementById("coding-agent-ide-maximize");
  var IDE_MAX_KEY = "coding-agent-ide-maximized:" + provider;
  var ideCodeWrap = document.getElementById("coding-agent-ide-code-wrap");
  var ideGutter = document.getElementById("coding-agent-ide-gutter");
  var ideCode = document.getElementById("coding-agent-ide-code");
  var ideHighlight = document.getElementById("coding-agent-ide-highlight");
  var ideHighlightCode = ideHighlight ? ideHighlight.querySelector("code") : null;
  var idePreview = document.getElementById("coding-agent-ide-preview");
  var ideEmpty = document.getElementById("coding-agent-ide-empty");
  var ideCrumbName = document.getElementById("coding-agent-ide-crumb-name");
  var ideViewTools = document.getElementById("coding-agent-ide-view-tools");
  var ideViewPreview = document.getElementById("coding-agent-ide-view-preview");
  var ideViewSource = document.getElementById("coding-agent-ide-view-source");
  var ideFindBar = document.getElementById("coding-agent-ide-find");
  var ideFindInput = document.getElementById("coding-agent-ide-find-input");
  var ideFindCount = document.getElementById("coding-agent-ide-find-count");
  var ideFindToggle = document.getElementById("coding-agent-ide-find-toggle");
  var ideFindPrev = document.getElementById("coding-agent-ide-find-prev");
  var ideFindNext = document.getElementById("coding-agent-ide-find-next");
  var ideFindClose = document.getElementById("coding-agent-ide-find-close");
  var ideSaveBtn = document.getElementById("coding-agent-ide-save");
  var ideRefreshBtn = document.getElementById("coding-agent-ide-refresh");
  var ideNewFileBtn = document.getElementById("coding-agent-ide-new-file");
  var ideNewFolderBtn = document.getElementById("coding-agent-ide-new-folder");
  var ideBackBtn = document.getElementById("coding-agent-ide-back");
  var ideForwardBtn = document.getElementById("coding-agent-ide-forward");
  var ideToggleBtn = document.getElementById("coding-agent-toggle-ide");
  var ideToggleDockBtn = document.getElementById("coding-agent-toggle-ide-dock");
  var ideCollapseAllBtn = document.getElementById("coding-agent-ide-collapse-all");
  var ideResize = document.getElementById("coding-agent-ide-resize");
  var ideTreeResize = document.getElementById("coding-agent-ide-tree-resize");
  var ideCtx = document.getElementById("coding-agent-ide-ctx");
  var ideOpenTabs = []; // { id, kind:'file'|'terminal', path?, title?, content?, dirty?, original?, unsaved?, view?, termHtml? }
  var ideActivePath = "";
  var ideActiveId = "";
  var idePageSeq = 1;
  var ideNavStack = [];
  var ideNavIndex = -1;
  var ideExpanded = {};
  var ideChildrenCache = {};
  var ideClipboard = null; // { mode: 'copy'|'cut', path, type }
  var ideCtxTarget = null; // { path, type }
  var ideOutline = document.getElementById("coding-agent-ide-outline");
  var ideOutlineToggle = document.getElementById("coding-agent-ide-outline-toggle");
  var ideFindMatches = [];
  var ideFindIndex = -1;
  var ideOutlineOpen = false;
  var IDE_WIDTH_KEY = "coding-agent-ide-width:" + provider;
  var IDE_TREE_WIDTH_KEY = "coding-agent-ide-tree-width:" + provider;

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
    if (!ideIsOpen()) openIdePanel("files");
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

  /** Explorer title: reuse history.workspaceDisplayName (shared IIFE; do not redeclare). */
  function ideExplorerTitle() {
    var root = workspaceRoot();
    if (!root) return "资源管理器";
    return workspaceDisplayName(root);
  }

  function isMarkdownPath(path) {
    return /\.(md|markdown)$/i.test(String(path || ""));
  }

  function tabKey(tab) {
    if (!tab) return "";
    var kind = tab.kind || "file";
    if (kind === "file") return tab.path || tab.id || "";
    return tab.id || "";
  }

  function findTabByKey(key) {
    var k = String(key || "");
    return ideOpenTabs.find(function (t) { return tabKey(t) === k; }) || null;
  }

  function activePageTab() {
    return findTabByKey(ideActiveId);
  }

  function setIdePanel(panel) {
    if (!idePanel) return;
    var next = panel || "files";
    if (next !== "files" && next !== "terminal") next = "files";
    idePanel.setAttribute("data-panel", next);
    try { localStorage.setItem("coding-agent-ide-panel:" + provider, next); } catch (err) {}
  }

  function currentIdePanel() {
    return (idePanel && idePanel.getAttribute("data-panel")) || "files";
  }

  function setIdeOpen(on, panel) {
    if (!sidebar) return;
    if (panel) setIdePanel(panel);
    sidebar.classList.toggle("has-ide", !!on);
    try { localStorage.setItem("coding-agent-ide-open:" + provider, on ? "1" : "0"); } catch (err) {}
    syncIdeToggle();
    if (on) {
      if (ideRootName) ideRootName.textContent = ideExplorerTitle();
      if (currentIdePanel() === "files") {
        refreshIdeTree();
        syncEditorChrome();
      }
    }
  }

  function openIdePanel(panel) {
    var p = panel || "files";
    if (p === "terminal") {
      openOrFocusSpecialPage("terminal");
      return;
    }
    setIdeOpen(true, "files");
    syncEditorChrome();
  }

  function toggleIde() {
    if (ideIsOpen()) setIdeOpen(false);
    else openIdePanel("files"); // never auto-spawn terminal on Ctrl+G
  }

  // Shortcut routing follows the mouse, not focus (xterm otherwise keeps stealing keys).
  var ideHoverZone = "other"; // terminal | editor | ide | sidebar | other

  function zoneFromElement(el) {
    if (!el || !el.closest) return "other";
    if (el.closest(
      "#coding-agent-ide-panel-terminal, #coding-agent-ide-term-mount, "
      + ".coding-agent-ide-xterm-host, .xterm"
    )) {
      return "terminal";
    }
    if (el === ideCode || (ideFindInput && el === ideFindInput)) return "editor";
    if (ideCode && ideCode.contains && ideCode.contains(el)) return "editor";
    if (idePanel && idePanel.contains(el)) return "ide";
    if (sidebar && sidebar.contains(el)) return "sidebar";
    return "other";
  }

  function ideKeyZone(_ev) {
    return ideHoverZone || "other";
  }

  function syncHoverZone(el) {
    var next = zoneFromElement(el);
    if (next === ideHoverZone) return;
    var prev = ideHoverZone;
    ideHoverZone = next;
    if (prev === "terminal" && next !== "terminal") {
      blurActiveTerminal();
    } else if (next === "terminal") {
      var tab = activePageTab();
      if (tab && tab.kind === "terminal" && tab.xterm) {
        try { tab.xterm.focus(); } catch (e) {}
      }
    }
  }

  document.addEventListener("mousemove", function (ev) {
    syncHoverZone(ev.target);
  }, true);
  document.addEventListener("mouseover", function (ev) {
    syncHoverZone(ev.target);
  }, true);

  function syncEditorChrome() {
    var tab = activePageTab();
    var kind = tab ? (tab.kind || "file") : "files";
    if (!tab || kind === "browser") {
      // Drop legacy browser tabs if any remain in memory.
      if (tab && kind === "browser") {
        ideOpenTabs = ideOpenTabs.filter(function (t) { return t.kind !== "browser"; });
        ideActiveId = ideOpenTabs[0] ? tabKey(ideOpenTabs[0]) : "";
        ideActivePath = "";
        renderIdeTabs();
        tab = activePageTab();
        kind = tab ? (tab.kind || "file") : "files";
      }
      if (!tab) {
        setIdePanel("files");
        showIdeEditor(false);
        return;
      }
    }
    if (kind === "terminal") {
      setIdePanel("terminal");
      showIdeEditor(true);
      if (typeof attachActiveTerminal === "function") attachActiveTerminal(tab);
      return;
    }
    setIdePanel("files");
    showIdeEditor(true);
  }

  function showIdeEditor(hasPage) {
    if (ideEmpty) ideEmpty.classList.toggle("is-on", !hasPage);
    if (hasPage) syncEditorView();
    else {
      if (ideCodeWrap) ideCodeWrap.style.display = "none";
      if (idePreview) {
        idePreview.style.display = "none";
        idePreview.innerHTML = "";
      }
    }
  }

  function activeTab() {
    var tab = activePageTab();
    if (tab && (tab.kind || "file") === "file") return tab;
    return null;
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
      btn.className = "coding-agent-ide-outline-item is-h" + level;
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
    // No open file: leave blank — do not show workspace / Home as a fake file title.
    ideCrumbName.textContent = "";
    ideCrumbName.title = "";
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
      if ((tab.kind || "file") !== "file") return;
      if (tab.path === fromPath) tab.path = toPath;
      else if (tab.path.indexOf(fromPath + "/") === 0) {
        tab.path = toPath + tab.path.slice(fromPath.length);
      }
      if (tab.kind === "file") tab.id = tab.path;
    });
    if (ideActivePath === fromPath) {
      ideActivePath = toPath;
      ideActiveId = toPath;
    } else if (ideActivePath.indexOf(fromPath + "/") === 0) {
      ideActivePath = toPath + ideActivePath.slice(fromPath.length);
      ideActiveId = ideActivePath;
    }
  }

  function closeTabsUnder(path) {
    ideOpenTabs = ideOpenTabs.filter(function (tab) {
      if ((tab.kind || "file") !== "file") return true;
      return !(tab.path === path || tab.path.indexOf(path + "/") === 0);
    });
    if (ideActivePath === path || ideActivePath.indexOf(path + "/") === 0) {
      var nextFile = ideOpenTabs.find(function (t) { return (t.kind || "file") === "file"; });
      var nextAny = nextFile || ideOpenTabs[0] || null;
      if (nextAny) activateIdeTab(tabKey(nextAny), false);
      else {
        ideActivePath = "";
        ideActiveId = "";
        if (ideCode) ideCode.value = "";
        showIdeEditor(false);
        setIdePanel("files");
        updateGutter();
        updateCrumb();
      }
    }
    renderIdeTabs();
  }

  function showIdeTabCtx(x, y, tabKeyId) {
    if (!ideCtx) return;
    var idx = ideOpenTabs.findIndex(function (t) { return tabKey(t) === tabKeyId; });
    if (idx < 0) return;
    var tab = ideOpenTabs[idx];
    var hasRight = idx < ideOpenTabs.length - 1;
    var hasOthers = ideOpenTabs.length > 1;
    ideCtxTarget = { type: "tab", key: tabKeyId, index: idx };
    var items = [
      { id: "tab-rename", label: "Rename tab" },
      { sep: true },
      { id: "tab-close", label: "Close" },
      { id: "tab-close-others", label: "Close Others", disabled: !hasOthers },
      { id: "tab-close-right", label: "Close to the Right", disabled: !hasRight },
      { id: "tab-close-all", label: "Close All" },
    ];
    ideCtx.innerHTML = "";
    items.forEach(function (item) {
      if (item.sep) {
        var sep = document.createElement("div");
        sep.className = "coding-agent-ide-ctx-sep";
        ideCtx.appendChild(sep);
        return;
      }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = item.label;
      btn.disabled = !!item.disabled;
      btn.onclick = function () {
        hideIdeCtx();
        runIdeTabCtxAction(item.id, tabKeyId);
      };
      ideCtx.appendChild(btn);
    });
    ideCtx.classList.add("is-on");
    ideCtx.setAttribute("aria-hidden", "false");
    var pad = 6;
    var w = ideCtx.offsetWidth || 180;
    var h = ideCtx.offsetHeight || 160;
    var left = Math.min(x, window.innerWidth - w - pad);
    var top = Math.min(y, window.innerHeight - h - pad);
    ideCtx.style.left = Math.max(pad, left) + "px";
    ideCtx.style.top = Math.max(pad, top) + "px";
  }

  function renameIdeTab(key) {
    var tab = findTabByKey(key);
    if (!tab) return;
    var kind = tab.kind || "file";
    var current = kind === "file" ? fileBase(tab.path) : (tab.title || kind);
    var next = window.prompt("Rename tab", current);
    if (next == null) return;
    next = String(next).trim();
    if (!next) return;
    if (kind === "file") {
      tab.displayName = next;
    } else {
      tab.title = next;
    }
    renderIdeTabs();
    if (typeof updateCrumb === "function") updateCrumb();
  }

  function closeIdeTabsByKeys(keys, opts) {
    opts = opts || {};
    var want = {};
    (keys || []).forEach(function (k) { want[k] = true; });
    var toClose = ideOpenTabs.filter(function (t) { return want[tabKey(t)]; });
    if (!toClose.length) return;
    if (!opts.force) {
      var unsaved = toClose.some(function (t) {
        return (t.kind || "file") === "file" && t.unsaved && String(t.content || "");
      });
      if (unsaved && !window.confirm("有未保存文件，关闭将丢弃内容？")) return;
    }
    // Close from the end so indices stay stable; skip per-tab unsaved prompts.
    for (var i = ideOpenTabs.length - 1; i >= 0; i--) {
      var t = ideOpenTabs[i];
      var k = tabKey(t);
      if (!want[k]) continue;
      if (t.kind === "terminal") {
        if (typeof disposeTermSession === "function") disposeTermSession(t);
        else t.shellId = "";
      }
      if (k === ideActiveId) flushActiveBuffer();
      ideOpenTabs.splice(i, 1);
    }
    if (!ideOpenTabs.length) {
      ideActivePath = "";
      ideActiveId = "";
      if (ideCode) ideCode.value = "";
      closeFindBar();
      setOutlineOpen(false);
      setIdePanel("files");
      showIdeEditor(false);
      updateGutter();
      updateIdeHighlight();
      syncIdeHighlightScroll();
      updateCrumb();
      renderIdeTabs();
      renderIdeTree();
      syncNavButtons();
      return;
    }
    if (!findTabByKey(ideActiveId)) {
      activateIdeTab(tabKey(ideOpenTabs[0]), false);
    } else {
      renderIdeTabs();
    }
  }

  function runIdeTabCtxAction(action, key) {
    var idx = ideOpenTabs.findIndex(function (t) { return tabKey(t) === key; });
    if (idx < 0 && action !== "tab-close-all") return;
    if (action === "tab-rename") {
      renameIdeTab(key);
      return;
    }
    if (action === "tab-close") {
      closeIdeTab(key);
      return;
    }
    if (action === "tab-close-others") {
      var others = ideOpenTabs
        .filter(function (t) { return tabKey(t) !== key; })
        .map(function (t) { return tabKey(t); });
      closeIdeTabsByKeys(others);
      return;
    }
    if (action === "tab-close-right") {
      var right = ideOpenTabs.slice(idx + 1).map(function (t) { return tabKey(t); });
      closeIdeTabsByKeys(right);
      return;
    }
    if (action === "tab-close-all") {
      closeIdeTabsByKeys(ideOpenTabs.map(function (t) { return tabKey(t); }));
    }
  }

  function renderIdeTabs() {
    if (!ideTabs) return;
    ideTabs.innerHTML = "";
    ideOpenTabs.forEach(function (tab) {
      var kind = tab.kind || "file";
      var key = tabKey(tab);
      var btn = document.createElement("button");
      btn.type = "button";
      var label = kind === "file"
        ? (tab.displayName || fileBase(tab.path))
        : (tab.title || kind);
      btn.className = "coding-agent-ide-tab" +
        (key === ideActiveId ? " is-active" : "") +
        (tab.dirty ? " is-dirty" : "");
      btn.title = kind === "file" ? tab.path : label;
      var icon = document.createElement("span");
      icon.className = "coding-agent-ide-tab-icon";
      if (kind === "terminal") icon.textContent = ">_";
      else {
        icon.className += " " + fileExtClass(fileBase(tab.path) || label);
        icon.textContent = fileIconGlyph(fileBase(tab.path) || label);
      }
      btn.appendChild(icon);
      var name = document.createElement("span");
      name.className = "coding-agent-ide-tab-name";
      name.textContent = label;
      btn.appendChild(name);
      var close = document.createElement("span");
      close.className = "coding-agent-ide-tab-close";
      close.setAttribute("role", "button");
      close.title = "关闭";
      close.textContent = "×";
      close.onclick = function (ev) {
        ev.stopPropagation();
        closeIdeTab(key);
      };
      btn.appendChild(close);
      btn.onclick = function () { activateIdeTab(key, true); };
      btn.oncontextmenu = function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        hideIdeCtx();
        showIdeTabCtx(ev.clientX, ev.clientY, key);
      };
      ideTabs.appendChild(btn);
    });
  }

  function flushActiveBuffer() {
    var prev = activeTab();
    if (!prev || !ideCode) return;
    prev.content = ideCode.value;
    prev.dirty = prev.content !== prev.original;
  }

  function activateIdeTab(key, recordNav) {
    var tab = findTabByKey(key);
    if (!tab) return;
    flushActiveBuffer();
    ideActiveId = tabKey(tab);
    var kind = tab.kind || "file";
    if (kind === "file") {
      ideActivePath = tab.path;
      if (!tab.view) tab.view = isMarkdownPath(tab.path) ? "preview" : "source";
      if (ideCode) ideCode.value = tab.content;
      setIdeOpen(true, "files");
      showIdeEditor(true);
      updateGutter();
      updateIdeHighlight();
      syncIdeHighlightScroll();
      updateCrumb();
      renderIdeTabs();
      renderIdeTree();
      if (recordNav) pushNav(tab.path);
      else syncNavButtons();
      return;
    }
    ideActivePath = "";
    setIdeOpen(true, kind);
    showIdeEditor(true);
    syncEditorChrome();
    renderIdeTabs();
    syncNavButtons();
  }

  function closeIdeTab(key) {
    var idx = ideOpenTabs.findIndex(function (t) { return tabKey(t) === key; });
    if (idx < 0) return;
    if (key === ideActiveId) flushActiveBuffer();
    var closing = ideOpenTabs[idx];
    if (closing && (closing.kind || "file") === "file" && closing.unsaved) {
      var body = String(closing.content || "");
      if (body && !window.confirm("尚未保存，关闭将丢弃内容？")) return;
    }
    if (closing && closing.kind === "terminal") {
      if (typeof disposeTermSession === "function") disposeTermSession(closing);
      else closing.shellId = "";
    }
    ideOpenTabs.splice(idx, 1);
    if (ideActiveId === key) {
      var next = ideOpenTabs[idx] || ideOpenTabs[idx - 1] || null;
      if (next) {
        activateIdeTab(tabKey(next), false);
      } else {
        ideActivePath = "";
        ideActiveId = "";
        if (ideCode) ideCode.value = "";
        closeFindBar();
        setOutlineOpen(false);
        setIdePanel("files");
        showIdeEditor(false);
        updateGutter();
        updateIdeHighlight();
        syncIdeHighlightScroll();
        updateCrumb();
        renderIdeTabs();
        renderIdeTree();
        syncNavButtons();
      }
      return;
    }
    renderIdeTabs();
  }

  function openIdeFile(path, opts) {
    opts = opts || {};
    if (!path) return Promise.resolve();
    setIdeOpen(true, "files");
    var existing = ideOpenTabs.find(function (t) {
      return (t.kind || "file") === "file" && t.path === path;
    });
    if (existing && !opts.forceReload) {
      activateIdeTab(tabKey(existing), true);
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
          id: path,
          kind: "file",
          path: path,
          content: "",
          original: "",
          dirty: false,
          view: isMarkdownPath(path) ? "preview" : "source",
        };
        tab.kind = "file";
        tab.id = path;
        tab.content = String(data.content);
        tab.original = tab.content;
        tab.dirty = false;
        tab.unsaved = false;
        if (!tab.view) tab.view = isMarkdownPath(path) ? "preview" : "source";
        if (!existing) ideOpenTabs.push(tab);
        activateIdeTab(tabKey(tab), true);
        return tab;
      })
      .catch(function (err) {
        console.warn("openIdeFile", err);
      });
  }

  function saveIdeFile() {
    if (!ideActivePath || !ideCode) return Promise.resolve();
    var tab = ideOpenTabs.find(function (t) {
      return (t.kind || "file") === "file" && t.path === ideActivePath;
    });
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
        tab.unsaved = false;
        renderIdeTabs();
        return refreshIdeTree();
      })
      .catch(function (err) {
        alert("保存失败：" + (err && err.message ? err.message : "unknown"));
      });
  }

  function openUntitledFile(path) {
    if (!path) return Promise.resolve();
    setIdeOpen(true, "files");
    var existing = ideOpenTabs.find(function (t) {
      return (t.kind || "file") === "file" && t.path === path;
    });
    if (existing) {
      activateIdeTab(tabKey(existing), true);
      return Promise.resolve(existing);
    }
    var tab = {
      id: path,
      kind: "file",
      path: path,
      content: "",
      original: "",
      dirty: false,
      unsaved: true,
      view: isMarkdownPath(path) ? "preview" : "source",
    };
    ideOpenTabs.push(tab);
    activateIdeTab(tabKey(tab), true);
    return Promise.resolve(tab);
  }

  function nextUntitledName(dir) {
    var names = ["未命名.txt"];
    for (var i = 2; i < 100; i++) names.push("未命名" + i + ".txt");
    for (var n = 0; n < names.length; n++) {
      var p = joinPath(dir, names[n]);
      var open = ideOpenTabs.some(function (t) {
        return (t.kind || "file") === "file" && t.path === p;
      });
      if (!open) return names[n];
    }
    return "未命名-" + Date.now() + ".txt";
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
    var ssh = isTermSsh();
    var items = [
      { id: "add-chat", label: "添加到对话", disabled: isRoot },
      { sep: true },
      { id: "reveal", label: "在资源管理器中显示", disabled: ssh },
      { id: "new-file", label: "新建文件" },
      { id: "new-folder", label: "新建文件夹" },
      { sep: true },
      { id: "copy-path", label: "复制路径" },
      { id: "copy-rel", label: "复制相对路径", disabled: isRoot },
      { sep: true },
      { id: "cut", label: "剪切", disabled: isRoot || ssh },
      { id: "copy", label: "复制", disabled: isRoot || ssh },
      { id: "paste", label: "粘贴", disabled: ssh || !hasClip || !(isDir || isRoot) },
      { sep: true },
      { id: "rename", label: "重命名", disabled: isRoot },
      { id: "delete", label: "删除", disabled: isRoot },
    ];
    ideCtx.innerHTML = "";
    items.forEach(function (item) {
      if (item.sep) {
        var sep = document.createElement("div");
        sep.className = "coding-agent-ide-ctx-sep";
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
        wrap.className = "coding-agent-ide-inline-input";
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
    var defaultName = kind === "dir" ? "新建文件夹" : nextUntitledName(dir);
    return promptInlineName(dir, kind, defaultName).then(function (name) {
      if (!name) return null;
      var path = joinPath(dir, name);
      if (kind === "dir") {
        return fsApi("/api/workspace/mkdir", { path: path }).then(function (data) {
          return ensureDirExpanded(dir).then(function () {
            return refreshIdeTree().then(function () { return data; });
          });
        });
      }
      // New files stay in-memory until Save — do not write an empty file to disk.
      var existing = ideOpenTabs.find(function (t) {
        return (t.kind || "file") === "file" && t.path === path;
      });
      if (existing) {
        activateIdeTab(tabKey(existing), true);
        return existing;
      }
      return fetchPathInfo(path).then(function (info) {
        if (info && info.exists) {
          alert("已存在同名文件或目录");
          return null;
        }
        return openUntitledFile(path);
      }).catch(function () {
        return openUntitledFile(path);
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
    // Unsaved new-file tabs were never written to disk — just close them.
    var unsavedTab = ideOpenTabs.find(function (t) {
      return (t.kind || "file") === "file" && t.path === target.path && t.unsaved;
    });
    if (unsavedTab && !target.isDir) {
      closeIdeTab(tabKey(unsavedTab));
      return Promise.resolve();
    }
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
      row.className = "coding-agent-ide-tree-item" +
        (item.type === "dir" ? " is-dir" : "") +
        (ideExpanded[item.path] ? " is-expanded" : "") +
        (item.path === ideActivePath ? " is-active" : "") +
        (ideClipboard && ideClipboard.mode === "cut" && ideClipboard.path === item.path ? " is-cut" : "");
      row.setAttribute("data-path", item.path);
      row.setAttribute("data-type", item.type);
      row.style.paddingLeft = (4 + depth * 12) + "px";
      row.title = item.path;

      var chev = document.createElement("span");
      chev.className = "coding-agent-ide-tree-chevron";
      chev.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M6 3l5 5-5 5z"/></svg>';
      row.appendChild(chev);

      var icon = document.createElement("span");
      icon.className = "coding-agent-ide-tree-icon " +
        (item.type === "dir" ? "is-dir" : fileExtClass(item.name));
      icon.textContent = item.type === "dir" ? "📁" : fileIconGlyph(item.name);
      row.appendChild(icon);

      var label = document.createElement("span");
      label.className = "coding-agent-ide-tree-label";
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
    if (ideRootName) ideRootName.textContent = ideExplorerTitle();
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
  var ideRail = document.getElementById("coding-agent-ide-rail");
  var ideRailTerminal = document.getElementById("coding-agent-ide-rail-terminal");
  var ideRailFiles = document.getElementById("coding-agent-ide-rail-files");
  var ideRailExpand = document.getElementById("coding-agent-ide-rail-expand");
  var ideTermMount = document.getElementById("coding-agent-ide-term-mount");
  var ideTabAdd = document.getElementById("coding-agent-ide-tab-add");
  var ideNewMenu = document.getElementById("coding-agent-ide-new-menu");
  var IDE_RAIL_LABELS_KEY = "coding-agent-ide-rail-labels:" + provider;
  var _xtermLoadPromise = null;
  var _termEncoder = (typeof TextEncoder !== "undefined") ? new TextEncoder() : null;
  var _termResizeObs = null;

  function isTermSsh() {
    return typeof isSshWorkspace === "function"
      ? isSshWorkspace(workspaceRoot())
      : /^ssh:\/\//i.test(String(workspaceRoot() || ""));
  }

  var remoteOsCache = {}; // hostId -> { family, shell, label, ... }

  function detectLocalOs() {
    var root = String(workspaceRoot() || "").trim();
    if (/^[a-zA-Z]:[\\\/]/.test(root) || root.indexOf("\\\\") === 0) {
      return { family: "windows", shell: "powershell", label: "Windows" };
    }
    if (root.charAt(0) === "/") {
      var uaMac = /Mac|Darwin/i.test(navigator.userAgent || "");
      return { family: "unix", shell: "sh", label: uaMac ? "macOS" : "Linux" };
    }
    var ua = navigator.userAgent || "";
    if (/Windows/i.test(ua)) return { family: "windows", shell: "powershell", label: "Windows" };
    if (/Mac|Darwin/i.test(ua)) return { family: "unix", shell: "sh", label: "macOS" };
    return { family: "unix", shell: "sh", label: "Linux" };
  }

  function termWorkspaceRoot() {
    var root = String(workspaceRoot() || "").trim();
    if (!root) {
      if (isTermSsh()) return "/";
      return detectLocalOs().family === "windows" ? "C:\\" : "/";
    }
    return root;
  }

  function parseSshWorkspace(root) {
    var raw = String(root || "").replace(/^ssh:\/\//i, "");
    var slash = raw.indexOf("/");
    return {
      hostId: decodeURIComponent(slash >= 0 ? raw.slice(0, slash) : raw),
      remote: slash >= 0 ? raw.slice(slash) : "/",
    };
  }

  function activeRemoteOs() {
    if (!isTermSsh()) return detectLocalOs();
    var hostId = parseSshWorkspace(termWorkspaceRoot()).hostId;
    return remoteOsCache[hostId] || { family: "unix", shell: "bash", label: "Linux" };
  }

  function ensureRemoteOs() {
    if (!isTermSsh()) return Promise.resolve(activeRemoteOs());
    var hostId = parseSshWorkspace(termWorkspaceRoot()).hostId;
    if (!hostId) return Promise.resolve(activeRemoteOs());
    if (remoteOsCache[hostId] && remoteOsCache[hostId].family) {
      return Promise.resolve(remoteOsCache[hostId]);
    }
    return apiFetch(apiBase + "/api/ssh/hosts/" + encodeURIComponent(hostId) + "/os")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var info = (data && data.os) || data || {};
        remoteOsCache[hostId] = {
          family: info.family || "unix",
          shell: info.shell || "bash",
          label: info.label || info.os_label || "Unix",
          uname: info.uname || "",
          ver: info.ver || "",
        };
        return remoteOsCache[hostId];
      })
      .catch(function () {
        remoteOsCache[hostId] = { family: "unix", shell: "bash", label: "Linux" };
        return remoteOsCache[hostId];
      });
  }

  function termDefaultCwd() {
    var root = termWorkspaceRoot();
    if (isTermSsh()) return parseSshWorkspace(root).remote || "/";
    if (detectLocalOs().family !== "windows") return root.replace(/\\/g, "/") || "/";
    return root.replace(/\//g, "\\");
  }

  function loadXtermLibs() {
    if (window.Terminal && window.FitAddon && window.FitAddon.FitAddon) {
      return Promise.resolve();
    }
    if (_xtermLoadPromise) return _xtermLoadPromise;
    var base = (apiBase || "") + "/static/vendor/xterm";
    _xtermLoadPromise = new Promise(function (resolve, reject) {
      function fail(err) {
        _xtermLoadPromise = null;
        reject(err || new Error("xterm 加载失败"));
      }
      if (!document.querySelector('link[data-ai-xterm-css]')) {
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = base + "/xterm.css";
        link.setAttribute("data-ai-xterm-css", "1");
        document.head.appendChild(link);
      }
      function loadScript(src) {
        return new Promise(function (res, rej) {
          var existing = document.querySelector('script[src="' + src + '"]');
          if (existing) {
            res();
            return;
          }
          var s = document.createElement("script");
          s.src = src;
          s.async = false;
          s.onload = function () { res(); };
          s.onerror = function () { rej(new Error("无法加载 " + src)); };
          document.head.appendChild(s);
        });
      }
      loadScript(base + "/xterm.js")
        .then(function () { return loadScript(base + "/xterm-addon-fit.js"); })
        .then(function () {
          if (!window.Terminal || !window.FitAddon || !window.FitAddon.FitAddon) {
            fail(new Error("xterm 全局对象缺失"));
            return;
          }
          resolve();
        })
        .catch(fail);
    });
    return _xtermLoadPromise;
  }

  function termWsUrl(cols, rows, shellId, cwd) {
    var httpBase = String(apiBase || "").replace(/\/$/, "");
    if (!httpBase) httpBase = location.origin;
    else if (!/^https?:/i.test(httpBase)) httpBase = location.origin + (httpBase.charAt(0) === "/" ? "" : "/") + httpBase;
    var wsBase = httpBase.replace(/^http/i, "ws");
    var q = [];
    q.push("root=" + encodeURIComponent(workspaceRoot() || ""));
    q.push("cwd=" + encodeURIComponent(cwd || termDefaultCwd() || ""));
    q.push("cols=" + encodeURIComponent(String(cols || 80)));
    q.push("rows=" + encodeURIComponent(String(rows || 24)));
    if (shellId) q.push("shell_id=" + encodeURIComponent(shellId));
    var token = "";
    try { token = getAuthToken() || ""; } catch (e) { token = ""; }
    if (token) q.push("token=" + encodeURIComponent(token));
    return wsBase + "/api/workspace/term/ws?" + q.join("&");
  }

  function disposeTermSession(tab) {
    if (!tab) return;
    try {
      if (tab.termWs) {
        tab.termWs.onopen = null;
        tab.termWs.onmessage = null;
        tab.termWs.onerror = null;
        tab.termWs.onclose = null;
        if (tab.termWs.readyState === 0 || tab.termWs.readyState === 1) tab.termWs.close();
      }
    } catch (e) {}
    tab.termWs = null;
    try {
      if (tab.xterm) tab.xterm.dispose();
    } catch (e2) {}
    tab.xterm = null;
    tab.fitAddon = null;
    tab.termHost = null;
    tab.shellId = "";
    tab.shellReady = false;
  }

  function sendTermResize(tab) {
    if (!tab || !tab.xterm || !tab.termWs || tab.termWs.readyState !== 1) return;
    try {
      tab.termWs.send(JSON.stringify({
        type: "resize",
        cols: tab.xterm.cols,
        rows: tab.xterm.rows,
      }));
    } catch (e) {}
  }

  function fitTabTerminal(tab) {
    if (!tab || !tab.fitAddon || !tab.xterm) return;
    try {
      tab.fitAddon.fit();
    } catch (e) {}
    sendTermResize(tab);
  }

  function connectTermWs(tab) {
    if (!tab || !tab.xterm) return;
    if (tab.termWs && (tab.termWs.readyState === 0 || tab.termWs.readyState === 1)) return;
    var cols = tab.xterm.cols || 80;
    var rows = tab.xterm.rows || 24;
    var url = termWsUrl(cols, rows, tab.shellId || "", tab.termCwd || termDefaultCwd());
    var ws;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      tab.xterm.writeln("\r\n\x1b[31m无法连接终端: " + (err.message || err) + "\x1b[0m");
      return;
    }
    ws.binaryType = "arraybuffer";
    tab.termWs = ws;
    ws.onopen = function () {
      sendTermResize(tab);
      try { tab.xterm.focus(); } catch (e) {}
    };
    ws.onmessage = function (ev) {
      if (typeof ev.data === "string") {
        try {
          var msg = JSON.parse(ev.data);
          if (msg && msg.type === "ready" && msg.shell_id) {
            tab.shellId = msg.shell_id;
            tab.shellReady = true;
          } else if (msg && msg.type === "error") {
            tab.xterm.writeln("\r\n\x1b[31m" + (msg.message || "终端错误") + "\x1b[0m");
          } else if (msg && msg.type === "exit") {
            tab.xterm.writeln("\r\n\x1b[90m[进程已退出 code=" + (msg.code || 0) + "]\x1b[0m");
            tab.shellReady = false;
          }
        } catch (e) {
          tab.xterm.write(ev.data);
        }
        return;
      }
      var buf = ev.data;
      if (buf instanceof ArrayBuffer) {
        tab.xterm.write(new Uint8Array(buf));
      } else if (buf) {
        tab.xterm.write(buf);
      }
    };
    ws.onerror = function () {
      try {
        tab.xterm.writeln("\r\n\x1b[31m终端连接错误\x1b[0m");
      } catch (e) {}
    };
    ws.onclose = function () {
      tab.shellReady = false;
      if (tab.termWs === ws) tab.termWs = null;
    };
  }

  function ensureTabXterm(tab) {
    if (!tab || tab.kind !== "terminal") return Promise.resolve(null);
    return loadXtermLibs().then(function () {
      if (tab.xterm) return tab;
      var host = document.createElement("div");
      host.className = "coding-agent-ide-xterm-host";
      var term = new window.Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Consolas, "Lucida Console", "Courier New", monospace',
        theme: {
          background: "#0c0c0c",
          foreground: "#cccccc",
          cursor: "#cccccc",
          selectionBackground: "#264f78",
        },
        allowTransparency: false,
        convertEol: false,
        scrollback: 5000,
      });
      var fit = new window.FitAddon.FitAddon();
      term.loadAddon(fit);
      term.open(host);
      tab.termHost = host;
      tab.xterm = term;
      tab.fitAddon = fit;
      tab.termCwd = tab.termCwd || termDefaultCwd();
      term.onData(function (data) {
        if (!tab.termWs || tab.termWs.readyState !== 1) return;
        try {
          if (_termEncoder) tab.termWs.send(_termEncoder.encode(data));
          else tab.termWs.send(data);
        } catch (e) {}
      });
      term.onBinary(function (data) {
        if (!tab.termWs || tab.termWs.readyState !== 1) return;
        try {
          var arr = new Uint8Array(data.length);
          for (var i = 0; i < data.length; i += 1) arr[i] = data.charCodeAt(i) & 0xff;
          tab.termWs.send(arr);
        } catch (e) {}
      });
      return tab;
    });
  }

  function attachActiveTerminal(tab) {
    if (!tab || tab.kind !== "terminal") return;
    if (!ideTermMount) ideTermMount = document.getElementById("coding-agent-ide-term-mount");
    ensureTabXterm(tab)
      .then(function () {
        if (!ideTermMount || !tab.termHost) return;
        while (ideTermMount.firstChild) ideTermMount.removeChild(ideTermMount.firstChild);
        ideTermMount.appendChild(tab.termHost);
        requestAnimationFrame(function () {
          fitTabTerminal(tab);
          if (!tab.termWs || tab.termWs.readyState > 1) connectTermWs(tab);
          try { tab.xterm.focus(); } catch (e) {}
        });
      })
      .catch(function (err) {
        if (!ideTermMount) return;
        ideTermMount.textContent = (err && err.message) || String(err);
      });
  }

  function ensureTermResizeObserver() {
    if (_termResizeObs || !ideTermMount || typeof ResizeObserver === "undefined") return;
    _termResizeObs = new ResizeObserver(function () {
      var tab = activePageTab();
      if (tab && tab.kind === "terminal") fitTabTerminal(tab);
    });
    _termResizeObs.observe(ideTermMount);
  }

  function openOrFocusSpecialPage(kind, opts) {
    opts = opts || {};
    if (kind !== "terminal") return null;
    var existing = ideOpenTabs.find(function (t) { return t.kind === kind; });
    if (existing && !opts.forceNew) {
      if (opts.activate !== false) activateIdeTab(tabKey(existing), false);
      return existing;
    }
    idePageSeq += 1;
    var os = activeRemoteOs();
    var termTitle = os.family === "windows" ? "powershell" : (os.shell || "sh");
    var tab = {
      id: kind + "-" + idePageSeq,
      kind: kind,
      title: termTitle + " " + idePageSeq,
      termCwd: termDefaultCwd(),
      shellId: "",
      shellReady: false,
    };
    ideOpenTabs.push(tab);
    if (isTermSsh()) {
      ensureRemoteOs().then(function (info) {
        tab.title = ((info.family === "windows") ? "cmd" : (info.shell || "ssh")) + " " + idePageSeq;
        renderIdeTabs();
      });
    }
    if (opts.activate !== false) activateIdeTab(tabKey(tab), false);
    else renderIdeTabs();
    ensureTermResizeObserver();
    return tab;
  }

  function isTerminalActive() {
    var tab = activePageTab();
    return !!(ideIsOpen() && tab && tab.kind === "terminal");
  }

  function blurActiveTerminal() {
    var tab = activePageTab();
    if (tab && tab.xterm) {
      try { tab.xterm.blur(); } catch (e) {}
    }
  }

  /** Ctrl+J: open terminal from files; minimize IDE when terminal is in front. */
  function minimizeIdeSidebar() {
    blurActiveTerminal();
    setIdeOpen(false);
    if (typeof inputField !== "undefined" && inputField) {
      try { inputField.focus(); } catch (e) {}
    }
  }

  /** What's "in front": mouse hover wins, else active tab. */
  function ideFrontIsTerminal() {
    if (ideHoverZone === "terminal") return true;
    if (ideHoverZone === "editor" || ideHoverZone === "ide") return false;
    return isTerminalActive();
  }

  function focusExplorerForFile() {
    setIdeOpen(true, "files");
    if (!ideOpenTabs.some(function (t) { return (t.kind || "file") === "file"; })) {
      ideActiveId = "";
      ideActivePath = "";
      showIdeEditor(false);
      setIdePanel("files");
    }
    refreshIdeTree();
    renderIdeTabs();
  }


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
      var label = ideRailExpand.querySelector(".coding-agent-ide-rail-label");
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
  if (ideRailFiles) ideRailFiles.onclick = function () { focusExplorerForFile(); };
  if (ideRailTerminal) ideRailTerminal.onclick = function () { openOrFocusSpecialPage("terminal"); };

  function positionIdeNewMenu() {
    if (!ideNewMenu || !ideTabAdd) return;
    var rect = ideTabAdd.getBoundingClientRect();
    var menuW = Math.max(200, ideNewMenu.offsetWidth || 200);
    var left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - menuW - 8));
    var top = rect.bottom + 4;
    // Prefer below the + button; flip up if near the bottom edge.
    if (top + 140 > window.innerHeight && rect.top > 160) {
      top = Math.max(8, rect.top - 4 - (ideNewMenu.offsetHeight || 140));
    }
    ideNewMenu.style.left = left + "px";
    ideNewMenu.style.top = top + "px";
  }

  function closeIdeNewMenu() {
    if (ideNewMenu) {
      ideNewMenu.classList.remove("is-on");
      ideNewMenu.setAttribute("aria-hidden", "true");
    }
    if (ideTabAdd) {
      ideTabAdd.classList.remove("is-open");
      ideTabAdd.setAttribute("aria-expanded", "false");
    }
  }

  function toggleIdeNewMenu() {
    if (!ideNewMenu) return;
    var on = !ideNewMenu.classList.contains("is-on");
    ideNewMenu.classList.toggle("is-on", on);
    ideNewMenu.setAttribute("aria-hidden", on ? "false" : "true");
    if (ideTabAdd) {
      ideTabAdd.classList.toggle("is-open", on);
      ideTabAdd.setAttribute("aria-expanded", on ? "true" : "false");
    }
    if (on) {
      // Measure after display:block so flip-up uses real height.
      positionIdeNewMenu();
      requestAnimationFrame(positionIdeNewMenu);
    }
  }

  if (ideTabAdd) {
    ideTabAdd.onclick = function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      toggleIdeNewMenu();
    };
  }
  if (ideNewMenu) {
    ideNewMenu.addEventListener("click", function (ev) { ev.stopPropagation(); });
    Array.prototype.forEach.call(ideNewMenu.querySelectorAll("[data-ide-new]"), function (btn) {
      btn.onclick = function (ev) {
        if (ev) ev.stopPropagation();
        var kind = btn.getAttribute("data-ide-new");
        closeIdeNewMenu();
        if (kind === "file") {
          focusExplorerForFile();
          createEntry("file", { path: ".", isDir: true });
        } else if (kind === "terminal") {
          openOrFocusSpecialPage("terminal", { forceNew: true });
        }
      };
    });
  }
  document.addEventListener("click", function () { closeIdeNewMenu(); });
  window.addEventListener("resize", function () {
    if (ideNewMenu && ideNewMenu.classList.contains("is-on")) positionIdeNewMenu();
  });
  window.addEventListener("scroll", function () {
    if (ideNewMenu && ideNewMenu.classList.contains("is-on")) positionIdeNewMenu();
  }, true);

  Array.prototype.forEach.call(document.querySelectorAll("[data-ide-empty]"), function (btn) {
    btn.onclick = function () {
      var kind = btn.getAttribute("data-ide-empty");
      if (kind === "file") focusExplorerForFile();
      else if (kind === "terminal") openOrFocusSpecialPage("terminal", { forceNew: true });
    };
  });

  document.addEventListener("keydown", function (ev) {
    if (!sidebar || !sidebar.classList.contains("is-fullscreen")) return;
    if (!(ev.ctrlKey || ev.metaKey) || ev.shiftKey) return;
    var key = String(ev.key || "").toLowerCase();
    if (key !== "g" && key !== "j") return;
    // G/J follow what's in front (hover / active tab), not xterm focus.
    ev.preventDefault();
    var termFront = ideFrontIsTerminal();
    if (key === "j") {
      if (termFront) minimizeIdeSidebar();
      else {
        if (!ideIsOpen()) setIdeOpen(true, "files");
        openOrFocusSpecialPage("terminal", { forceNew: false });
      }
      return;
    }
    // Ctrl+G
    if (termFront) {
      // terminal → file view (prefer an open file tab)
      var fileTab = ideOpenTabs.find(function (t) { return (t.kind || "file") === "file"; });
      if (fileTab) activateIdeTab(tabKey(fileTab), false);
      else focusExplorerForFile();
    } else {
      minimizeIdeSidebar(); // file → collapse IDE rail
    }
  });

  try {
    var savedPanel = localStorage.getItem("coding-agent-ide-panel:" + provider);
    if (savedPanel === "browser" || savedPanel === "terminal") savedPanel = "files";
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
      if (ideOpenTabs.find(function (t) { return (t.kind || "file") === "file" && t.path === path; })) activateIdeTab(path, false);
      else openIdeFile(path).then(function () { ideNavIndex = ideNavStack.indexOf(path); syncNavButtons(); });
    };
  }
  if (ideForwardBtn) {
    ideForwardBtn.onclick = function () {
      if (ideNavIndex >= ideNavStack.length - 1) return;
      ideNavIndex += 1;
      var path = ideNavStack[ideNavIndex];
      if (ideOpenTabs.find(function (t) { return (t.kind || "file") === "file" && t.path === path; })) activateIdeTab(path, false);
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
      if (ev.target && ev.target.closest && ev.target.closest(".coding-agent-ide-tree-item")) return;
      ev.preventDefault();
      showIdeCtx(ev.clientX, ev.clientY, { path: ".", isDir: true });
    });
  }
  if (ideExplorer) {
    ideExplorer.addEventListener("contextmenu", function (ev) {
      if (ev.target && ev.target.closest && (
        ev.target.closest(".coding-agent-ide-tree-item") ||
        ev.target.closest("#coding-agent-ide-explorer-actions")
      )) return;
      if (ev.target && ev.target.closest && ev.target.closest("#coding-agent-ide-tree")) return;
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
    var zone = ideKeyZone(ev);
    // Hover over terminal → don't steal find/save from bash.
    if (zone === "terminal") return;

    if ((ev.ctrlKey || ev.metaKey) && String(ev.key || "").toLowerCase() === "s" && ideIsOpen()) {
      if (zone === "editor" || zone === "ide" || zone === "sidebar") {
        ev.preventDefault();
        saveIdeFile();
      }
    }
    if ((ev.ctrlKey || ev.metaKey) && String(ev.key || "").toLowerCase() === "f" && ideIsOpen()) {
      if (zone === "editor" || zone === "ide") {
        ev.preventDefault();
        openFindBar();
      }
    }
  });

  syncIdeToggle();
  syncIdeMaximize();
  updateCrumb();
  showIdeEditor(!!ideActiveId);
  try {
    if (localStorage.getItem("coding-agent-ide-open:" + provider) === "1" && hubFullscreen) {
      setIdeOpen(true);
      if (!ideActiveId) showIdeEditor(false);
    }
    if (localStorage.getItem(IDE_MAX_KEY) === "1") {
      setIdeMaximized(true);
    }
  } catch (err) {}
