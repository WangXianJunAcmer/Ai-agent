/* coding-agent frontend/js/shell.js */
  var script = document.currentScript;
  var scriptUrl = "";
  try {
    scriptUrl = script ? new URL(script.src, window.location.href) : null;
  } catch (err) {
    scriptUrl = null;
  }
  var inferredApiBase = scriptUrl ? scriptUrl.origin : window.location.origin;
  var apiBase = (script && script.getAttribute("data-api-base")) || inferredApiBase;
  var defaultModel = (script && script.getAttribute("data-default-model")) || "auto";
  var provider = (script && script.getAttribute("data-provider")) || "cursor";
  var AUTH_TOKEN_KEY = "coding-agent-auth-token";
  var currentUser = null;
  function getAuthToken() {
    try {
      return localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY) || "";
    } catch (err) {
      return "";
    }
  }
  function clearAuthToken() {
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
    } catch (err) {}
  }
  function authHeaders(extra) {
    var headers = extra ? Object.assign({}, extra) : {};
    var token = getAuthToken();
    if (token) headers.Authorization = "Bearer " + token;
    return headers;
  }
  function redirectToLogin() {
    clearAuthToken();
    var next = location.pathname + location.search;
    window.location.href = "/login?next=" + encodeURIComponent(next || "/");
  }
  function apiFetch(url, opts) {
    opts = opts || {};
    var headers = authHeaders(opts.headers || {});
    opts.headers = headers;
    return fetch(url, opts).then(function (res) {
      if (res.status === 401) {
        redirectToLogin();
        return Promise.reject(new Error("Unauthorized"));
      }
      return res;
    });
  }
  var sessionStorageKey = "coding-agent-session-id:" + provider;
  var sessionId = localStorage.getItem(sessionStorageKey) || "";
  // Brand / copy keyed by data-provider (Cursor · OpenAI · DeepSeek).
  var PROVIDER_UI = {
    cursor: {
      name: "Cursor",
      placeholder: "给 Cursor 发送消息",
      emptyTitle: "今天想做点什么？",
      emptySub: "写代码、查问题、改文件，或直接描述你的目标",
      showAuto: true,
      markHtml:
        '<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<rect width="28" height="28" rx="8" fill="#0d0d0d"/>' +
        // Official Cursor cube mark (simple-icons / cursor.com brand), inset on dark tile.
        '<path fill="#fff" transform="translate(2 2)" d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23"/>' +
        "</svg>",
    },
    openai: {
      name: "OpenAI",
      placeholder: "给 OpenAI 发送消息",
      emptyTitle: "今天想做点什么？",
      emptySub: "用 OpenAI 写代码、查问题、改文件",
      showAuto: false,
      markHtml:
        '<svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<rect width="28" height="28" rx="8" fill="#0d0d0d"/>' +
        '<g fill="#fff" transform="translate(4.5 4.5) scale(0.79)">' +
        '<path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.911 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.182a5.985 5.985 0 0 0-3.526 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .511 4.91 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.989 5.989 0 0 0 3.519-2.9 6.056 6.056 0 0 0-.748-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.875-1.041l.142-.08 4.778-2.759a.795.795 0 0 0 .393-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.496 4.494zm-9.661-4.125a4.471 4.471 0 0 1-.535-3.014l.142.085 4.783 2.758a.771.771 0 0 0 .781 0l5.843-3.368v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.499 4.499 0 0 1-6.141-1.646zM2.341 7.896a4.485 4.485 0 0 1 2.365-1.973V11.6a.766.766 0 0 0 .388.676l5.814 3.355-2.02 1.168a.076.076 0 0 1-.071 0L4.0 14.012A4.504 4.504 0 0 1 2.341 7.872zm16.596 3.856L13.104 8.364 15.12 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.104v-5.677a.79.79 0 0 0-.408-.667zm2.011-3.023-.142-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.499 4.499 0 0 1 6.68 4.66zM8.307 12.863l-2.02-1.164a.08.08 0 0 1-.038-.057V6.074a4.499 4.499 0 0 1 7.376-3.454l-.142.081-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365a2.95 2.95 0 0 1 2.55 0l3.029 1.75v3.5l-3.029 1.75a2.95 2.95 0 0 1-2.55 0l-3.029-1.75v-3.5z"/>' +
        "</g></svg>",
    },
    deepseek: {
      name: "DeepSeek",
      placeholder: "给 DeepSeek 发送消息",
      emptyTitle: "今天想做点什么？",
      emptySub: "用 DeepSeek 写代码、查问题、改文件",
      showAuto: false,
      markHtml:
        '<svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<rect width="28" height="28" rx="8" fill="#4d6bfe"/>' +
        '<path fill="#fff" transform="translate(2 2)" d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z"/>' +
        "</svg>",
    },
  };
  var providerUi = PROVIDER_UI[provider] || PROVIDER_UI.cursor;
  // sidebar = embed host (floating trigger). fullscreen = home hub / dedicated Cursor UI.
  var hubFullscreen = (script && script.getAttribute("data-layout")) === "fullscreen";

  var styles = `
    #coding-agent-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.18);
      z-index: 2147482999; opacity: 0; pointer-events: none; transition: opacity .2s ease;
    }
    #coding-agent-backdrop.open { opacity: 1; pointer-events: auto; }
    #coding-agent-trigger {
      position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px;
      padding: 0; border: none; background: transparent; border-radius: 14px;
      display: flex; align-items: center; justify-content: center; cursor: pointer;
      box-shadow: 0 10px 28px rgba(0,0,0,.18); z-index: 2147483000;
      overflow: hidden; user-select: none;
    }
    #coding-agent-trigger svg { width: 56px; height: 56px; display: block; }
    #coding-agent-sidebar {
      --ai-bg: #ffffff;
      --ai-surface: #f7f7f8;
      --ai-border: rgba(0,0,0,.08);
      --ai-text: #0d0d0d;
      --ai-muted: #6b6b6b;
      --ai-accent: #0d0d0d;
      --ai-user-bg: #f4f4f4;
      --ai-nav-bg: #f9f9f9;
      --ai-composer-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.06);
      /* Brand + avatar stay pinned across expand/collapse (shared by nav + rail). */
      --ai-nav-icon-size: 28px;
      --ai-nav-chrome-pad-x: 12px;
      --ai-nav-chrome-pad-y: 10px;
      --ai-nav-rail-width: 52px;
      --ai-sidebar-width: 520px;
      --ai-nav-width: 260px;
      --ai-ide-width: min(520px, 42vw);
      /* Fullscreen reading column — wide enough for code/paths; matches composer. */
      --ai-content-width: min(1100px, 92%);
      position: fixed; top: 0;
      right: calc(-1 * var(--ai-sidebar-width));
      width: var(--ai-sidebar-width);
      max-width: 96vw;
      height: 100%;
      background: var(--ai-bg); box-shadow: -8px 0 32px rgba(0,0,0,.12);
      z-index: 2147483001; transition: right .25s ease, width .15s ease, box-shadow .2s ease;
      display: flex; flex-direction: column; overflow: hidden;
      font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: var(--ai-text);
    }
    #coding-agent-nav { display: none; }
    #coding-agent-main {
      flex: 1 1 auto; min-width: 0; min-height: 0;
      display: flex; flex-direction: column; overflow: hidden;
      background: var(--ai-bg);
    }
    #coding-agent-sidebar.is-resizing { transition: none; user-select: none; }
    #coding-agent-sidebar *, #coding-agent-sidebar *::before, #coding-agent-sidebar *::after { box-sizing: border-box; }
    #coding-agent-sidebar.open { right: 0; }
    #coding-agent-sidebar.is-fullscreen {
      --ai-sidebar-width: 100vw;
      right: -100vw;
      width: 100vw;
      max-width: 100vw;
      box-shadow: none;
      flex-direction: column;
    }
    #coding-agent-sidebar.is-fullscreen.open { right: 0; left: 0; }
    #coding-agent-workspace {
      flex: 1 1 auto; min-width: 0; min-height: 0;
      display: flex; flex-direction: column; overflow: hidden;
      position: relative;
    }
    #coding-agent-sidebar.is-fullscreen #coding-agent-workspace {
      flex-direction: row;
    }
    /* Shell wraps expanded nav + collapsed rail so brand/avatar pins stay put. */
    #coding-agent-nav-shell {
      display: none; position: relative; flex: 0 0 auto;
      height: 100%; min-height: 0;
    }
    #coding-agent-sidebar.is-fullscreen #coding-agent-nav-shell {
      display: flex; flex-direction: row;
    }
    #coding-agent-nav-pins {
      position: absolute; inset: 0; z-index: 8;
      pointer-events: none;
    }
    #coding-agent-nav-rail-brand,
    #coding-agent-nav-rail-avatar {
      position: absolute;
      left: var(--ai-nav-chrome-pad-x);
      width: var(--ai-nav-icon-size); height: var(--ai-nav-icon-size);
      pointer-events: auto; padding: 0; cursor: pointer;
      display: grid; place-items: center; box-sizing: border-box;
    }
    #coding-agent-nav-rail-brand {
      top: var(--ai-nav-chrome-pad-y);
      border: 0; border-radius: 8px; background: transparent; overflow: hidden;
      transition: background .15s ease, transform .12s ease, box-shadow .15s ease;
    }
    #coding-agent-sidebar.is-fullscreen.nav-hidden #coding-agent-nav-rail-brand:hover {
      background: rgba(0,0,0,.07);
      box-shadow: 0 0 0 3px rgba(0,0,0,.06);
    }
    #coding-agent-sidebar.is-fullscreen.nav-hidden #coding-agent-nav-rail-brand:active {
      transform: scale(.96);
    }
    #coding-agent-sidebar.is-fullscreen:not(.nav-hidden) #coding-agent-nav-rail-brand {
      cursor: default;
    }
    #coding-agent-nav-rail-brand svg {
      width: var(--ai-nav-icon-size); height: var(--ai-nav-icon-size); display: block;
    }
    #coding-agent-nav-rail-avatar {
      bottom: var(--ai-nav-chrome-pad-y);
      border: 0; border-radius: 999px;
      background: #111; color: #fff; font: 700 12px/1 inherit;
      transition: transform .12s ease, box-shadow .15s ease, opacity .15s ease;
    }
    #coding-agent-nav-rail-avatar:hover {
      transform: scale(1.06);
      box-shadow: 0 0 0 3px rgba(0,0,0,.08);
      opacity: .95;
    }
    .coding-agent-nav-pin-slot {
      width: var(--ai-nav-icon-size); height: var(--ai-nav-icon-size);
      flex: 0 0 auto; visibility: hidden;
    }
    #coding-agent-sidebar.is-fullscreen #coding-agent-nav {
      display: flex; flex-direction: column;
      flex: 0 0 var(--ai-nav-width); width: var(--ai-nav-width);
      height: 100%; background: var(--ai-nav-bg);
      border-right: 1px solid var(--ai-border);
      min-height: 0; position: relative; overflow: hidden;
    }
    #coding-agent-nav-rail {
      display: none; flex: 0 0 var(--ai-nav-rail-width); width: var(--ai-nav-rail-width);
      height: 100%; flex-direction: column; align-items: center; gap: 6px;
      padding: 0; background: var(--ai-nav-bg);
      border-right: 1px solid var(--ai-border); min-height: 0;
    }
    #coding-agent-sidebar.is-fullscreen.nav-hidden #coding-agent-nav { display: none; }
    #coding-agent-sidebar.is-fullscreen.nav-hidden #coding-agent-nav-rail { display: flex; }
    #coding-agent-nav-rail-top,
    #coding-agent-nav-rail-bottom {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      width: 100%;
    }
    #coding-agent-nav-rail-top {
      flex: 0 0 auto;
      padding-top: calc(var(--ai-nav-chrome-pad-y) + var(--ai-nav-icon-size) + 6px);
    }
    #coding-agent-nav-rail-spacer { flex: 1 1 auto; min-height: 8px; }
    #coding-agent-nav-rail-bottom {
      flex: 0 0 auto; margin-top: auto;
      min-height: calc(var(--ai-nav-chrome-pad-y) * 2 + var(--ai-nav-icon-size));
    }
    .coding-agent-nav-rail-btn {
      width: 36px; height: 36px; border: 0; border-radius: 10px;
      background: transparent; color: #444; cursor: pointer;
      display: grid; place-items: center; padding: 0;
      transition: background .15s ease, color .15s ease, transform .12s ease;
    }
    .coding-agent-nav-rail-btn:hover {
      background: rgba(0,0,0,.07); color: var(--ai-text);
    }
    .coding-agent-nav-rail-btn:active {
      background: rgba(0,0,0,.11); transform: scale(.96);
    }
    .coding-agent-nav-rail-btn svg { width: 18px; height: 18px; display: block; }
    .coding-agent-nav-rail-btn.is-on {
      background: rgba(0,0,0,.08); color: var(--ai-text);
    }
    #coding-agent-nav-rail-flyout {
      display: none; position: fixed; z-index: 2147483630;
      width: 300px; max-height: min(72vh, 560px);
      overflow: auto; padding: 10px 8px 12px;
      background: #fff; border: 1px solid rgba(0,0,0,.1);
      border-radius: 14px; box-shadow: 0 12px 36px rgba(0,0,0,.14);
    }
    #coding-agent-nav-rail-flyout.is-on { display: block; }
    #coding-agent-nav-rail-flyout-title {
      padding: 2px 10px 10px; font: 600 15px/1.3 inherit; color: var(--ai-text);
    }
    #coding-agent-nav-rail-flyout-list { display: flex; flex-direction: column; gap: 2px; }
    #coding-agent-nav-rail-flyout-empty {
      display: none; padding: 16px 12px; color: var(--ai-muted);
      font-size: 13px; line-height: 1.45;
    }
    #coding-agent-nav-rail-flyout-empty.is-on { display: block; }
    #coding-agent-nav-head {
      flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 8px;
      height: calc(var(--ai-nav-chrome-pad-y) * 2 + var(--ai-nav-icon-size));
      padding: var(--ai-nav-chrome-pad-y) 10px var(--ai-nav-chrome-pad-y) var(--ai-nav-chrome-pad-x);
      box-sizing: border-box;
    }
    #coding-agent-nav-brand {
      display: flex; align-items: center; gap: 8px; min-width: 0;
    }
    #coding-agent-toggle-nav {
      width: var(--ai-nav-icon-size); height: var(--ai-nav-icon-size); padding: 0; border: 0; border-radius: 6px;
      background: transparent; color: #555; cursor: pointer;
      display: grid; place-items: center; flex: 0 0 auto;
      transition: background .15s ease, color .15s ease;
    }
    #coding-agent-toggle-nav:hover { background: rgba(0,0,0,.06); color: var(--ai-text); }
    #coding-agent-toggle-nav svg { width: 16px; height: 16px; display: block; }
    #coding-agent-nav-resize {
      position: absolute; right: -3px; top: 0; width: 6px; height: 100%;
      cursor: ew-resize; z-index: 6;
    }
    #coding-agent-nav-resize:hover,
    #coding-agent-sidebar.is-nav-resizing #coding-agent-nav-resize {
      background: rgba(0,120,212,.45);
    }
    #coding-agent-sidebar.is-nav-resizing { user-select: none; cursor: ew-resize; }
    #coding-agent-nav-top { flex: 0 0 auto; padding: 12px 12px 8px; }
    #coding-agent-nav-new {
      width: 100%; display: flex; align-items: center; gap: 10px;
      border: 1px solid var(--ai-border); background: #fff; color: var(--ai-text);
      border-radius: 10px; padding: 10px 12px; font: 600 14px/1.2 inherit;
      cursor: pointer; text-align: left;
    }
    #coding-agent-nav-new:hover { background: #f3f3f3; }
    #coding-agent-nav-new svg { width: 16px; height: 16px; flex: 0 0 auto; }
    #coding-agent-ide-topbar {
      flex: 0 0 auto; height: 35px; min-height: 35px; max-height: 35px;
      display: flex; align-items: stretch;
      border-bottom: 1px solid var(--ai-border); background: #ececec;
      overflow: hidden; position: relative; z-index: 20;
    }
    #coding-agent-ide-body { flex: 1 1 auto; min-height: 0; display: flex; position: relative; }
    #coding-agent-ide-editor {
      flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column;
      background: #fff; border-right: 1px solid var(--ai-border);
    }
    #coding-agent-ide-tabs {
      flex: 1 1 auto; min-width: 0; display: flex; gap: 0; overflow: hidden;
      padding: 0; background: transparent; align-items: stretch;
    }
    #coding-agent-ide-tabs-scroll {
      flex: 1 1 auto; min-width: 0; display: flex; flex-wrap: nowrap;
      overflow-x: auto; overflow-y: hidden; align-items: stretch;
      scrollbar-width: thin;
    }
    #coding-agent-ide-tabs-scroll::-webkit-scrollbar { height: 6px; }
    #coding-agent-ide-tabs-scroll::-webkit-scrollbar-thumb {
      background: rgba(0,0,0,.28); border-radius: 3px;
    }
    #coding-agent-ide-tabs-scroll::-webkit-scrollbar-track { background: transparent; }
    #coding-agent-ide-tab-add {
      flex: 0 0 auto; width: 28px; height: 28px; margin: 3px 2px 0;
      border: 0; border-radius: 6px; background: transparent; color: #666;
      cursor: pointer; display: grid; place-items: center; position: relative;
      font: 600 16px/1 inherit;
    }
    #coding-agent-ide-tab-add:hover,
    #coding-agent-ide-tab-add.is-open { background: rgba(0,0,0,.06); color: var(--ai-text); }
    #coding-agent-ide-new-menu {
      /* fixed: parent #coding-agent-ide / sidebar use overflow:hidden and would clip absolute menus */
      display: none; position: fixed; top: 0; left: 0;
      min-width: 200px; z-index: 2147483600; padding: 4px;
      background: #fff; border-radius: 10px;
      box-shadow: 0 12px 32px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.06);
    }
    #coding-agent-ide-new-menu.is-on { display: block; }
    #coding-agent-ide-new-menu button {
      display: flex; align-items: center; gap: 10px; width: 100%;
      border: 0; background: transparent; border-radius: 8px;
      padding: 8px 10px; margin: 0; cursor: pointer; text-align: left;
      font: 13px/1.25 inherit; color: #18181b;
    }
    #coding-agent-ide-new-menu button:hover { background: #f4f4f5; }
    #coding-agent-ide-new-menu .coding-agent-ide-new-ico {
      width: 16px; height: 16px; flex: 0 0 auto; opacity: .75;
    }
    #coding-agent-ide-new-menu .coding-agent-ide-new-kbd {
      margin-left: auto; color: #a1a1aa; font-size: 11px;
    }
    #coding-agent-ide-maximize {
      flex: 0 0 auto; width: 28px; height: 28px; margin: 3px 4px 0;
      border: 0; border-radius: 6px; background: transparent; color: #666;
      cursor: pointer; display: grid; place-items: center;
    }
    #coding-agent-ide-maximize:hover { background: rgba(0,0,0,.06); color: var(--ai-text); }
    #coding-agent-ide-maximize svg { width: 14px; height: 14px; display: block; }
    #coding-agent-ide-maximize .coding-agent-icon-expand,
    #coding-agent-ide-maximize .coding-agent-icon-shrink {
      display: grid; place-items: center; width: 14px; height: 14px;
    }
    #coding-agent-ide-maximize .coding-agent-icon-shrink { display: none; }
    #coding-agent-sidebar.ide-maximized #coding-agent-ide-maximize .coding-agent-icon-expand { display: none; }
    #coding-agent-sidebar.ide-maximized #coding-agent-ide-maximize .coding-agent-icon-shrink { display: grid; }
    /* Maximized IDE: title + tabs one row (title hugs text); explorer left, editor right. */
    #coding-agent-sidebar.has-ide.ide-maximized #coding-agent-workspace {
      display: grid;
      grid-template-columns: auto max-content minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
      column-gap: 0;
    }
    #coding-agent-sidebar.has-ide.ide-maximized #coding-agent-nav-shell {
      grid-column: 1;
      grid-row: 1 / -1;
      height: 100%;
      max-height: none;
    }
    #coding-agent-sidebar.has-ide.ide-maximized #coding-agent-main {
      display: contents;
    }
    #coding-agent-sidebar.has-ide.ide-maximized #coding-agent-topbar {
      grid-column: 2;
      grid-row: 1;
      height: 35px;
      width: max-content;
      max-width: min(280px, 36vw);
      padding: 0 8px 0 10px;
      background: #ececec;
      border-bottom: 1px solid var(--ai-border);
      border-right: 0;
      backdrop-filter: none;
    }
    #coding-agent-sidebar.has-ide.ide-maximized #coding-agent-top-actions {
      display: none !important;
    }
    #coding-agent-sidebar.has-ide.ide-maximized #coding-agent-brand strong {
      font-size: 13px;
    }
    #coding-agent-sidebar.has-ide.ide-maximized #coding-agent-scroll-wrap,
    #coding-agent-sidebar.has-ide.ide-maximized #coding-agent-footer {
      display: none !important;
    }
    #coding-agent-sidebar.has-ide.ide-maximized #coding-agent-ide,
    #coding-agent-sidebar.is-fullscreen.has-ide.ide-maximized #coding-agent-ide {
      display: contents;
    }
    #coding-agent-sidebar.has-ide.ide-maximized #coding-agent-ide-topbar {
      grid-column: 3;
      grid-row: 1;
      min-width: 0;
    }
    #coding-agent-sidebar.has-ide.ide-maximized #coding-agent-ide-body {
      grid-column: 2 / -1;
      grid-row: 2;
      min-width: 0;
      min-height: 0;
      flex-direction: row-reverse; /* explorer left → opened file to the right */
    }
    #coding-agent-sidebar.has-ide.ide-maximized #coding-agent-ide-panel-terminal {
      grid-column: 2 / -1;
      grid-row: 2;
      min-width: 0;
      min-height: 0;
    }
    #coding-agent-sidebar.has-ide.ide-maximized #coding-agent-ide-editor {
      border-right: 0;
      border-left: 1px solid var(--ai-border);
    }
    #coding-agent-sidebar.has-ide.ide-maximized #coding-agent-ide-tree-resize {
      left: auto;
      right: -3px;
    }
    #coding-agent-sidebar.has-ide.ide-maximized #coding-agent-ide-resize { display: none; }
    #coding-agent-ide-top-actions {
      flex: 0 0 auto; display: flex; align-items: center; gap: 2px;
      padding: 0 6px 0 4px; border-left: 1px solid rgba(0,0,0,.06);
      background: #ececec;
    }
    #coding-agent-ide-top-actions .coding-agent-ide-icon-btn,
    #coding-agent-toggle-ide-dock {
      width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px;
      background: transparent; color: #555; cursor: pointer;
      display: grid; place-items: center;
    }
    #coding-agent-ide-top-actions .coding-agent-ide-icon-btn:hover,
    #coding-agent-toggle-ide-dock:hover { background: rgba(0,0,0,.06); color: var(--ai-text); }
    #coding-agent-toggle-ide-dock svg { width: 16px; height: 16px; display: block; }
    #coding-agent-sidebar.has-ide #coding-agent-toggle-ide-dock {
      background: rgba(0,0,0,.06); color: var(--ai-text);
    }
    .coding-agent-ide-tab {
      display: inline-flex; align-items: center; gap: 6px;
      flex: 0 0 auto; /* never shrink when many tabs — scroll instead */
      border: 0; border-right: 1px solid rgba(0,0,0,.06); background: transparent;
      padding: 0 8px 0 10px; font: 12px/1.2 inherit; color: var(--ai-muted);
      cursor: grab; height: 100%; position: relative;
    }
    .coding-agent-ide-tab:active { cursor: grabbing; }
    .coding-agent-ide-tab.is-dragging { opacity: .45; }
    .coding-agent-ide-tab.is-drag-over {
      box-shadow: inset 2px 0 0 #0078d4;
    }
    .coding-agent-ide-tab:hover { background: rgba(255,255,255,.45); color: var(--ai-text); }
    .coding-agent-ide-tab.is-active {
      background: #fff; color: var(--ai-text);
    }
    .coding-agent-ide-tab-icon {
      flex: 0 0 auto; width: 14px; height: 14px; display: grid; place-items: center;
      font-size: 10px; font-weight: 700; line-height: 1;
    }
    .coding-agent-ide-tab-icon.is-md { color: #0550ae; }
    .coding-agent-ide-tab-icon.is-py { color: #3776ab; }
    .coding-agent-ide-tab-icon.is-js { color: #c5a000; }
    .coding-agent-ide-tab-name {
      white-space: nowrap; /* full filename; bar scrolls when tabs overflow */
    }
    .coding-agent-ide-tab.is-dirty .coding-agent-ide-tab-name::after { content: " ●"; color: #0078d4; font-size: 9px; }
    .coding-agent-ide-tab-close {
      flex: 0 0 auto; width: 16px; height: 16px; border: 0; border-radius: 4px;
      background: transparent; color: var(--ai-muted); cursor: pointer;
      display: grid; place-items: center; opacity: 0; font-size: 12px; line-height: 1; padding: 0;
    }
    .coding-agent-ide-tab:hover .coding-agent-ide-tab-close,
    .coding-agent-ide-tab.is-active .coding-agent-ide-tab-close { opacity: 1; }
    .coding-agent-ide-tab-close:hover { background: rgba(0,0,0,.08); color: var(--ai-text); }
    #coding-agent-ide-crumb {
      flex: 0 0 auto; height: 35px; padding: 0 8px 0 4px;
      display: flex; align-items: center; gap: 2px;
      border-bottom: 1px solid var(--ai-border); background: #fff;
      color: var(--ai-muted); font-size: 12px;
    }
    #coding-agent-ide-crumb .coding-agent-ide-icon-btn { width: 24px; height: 24px; }
    #coding-agent-ide-crumb-name {
      margin-left: 4px; color: var(--ai-text); font-weight: 500;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
    }
    #coding-agent-ide-crumb-spacer { flex: 1 1 auto; }
    #coding-agent-ide-view-tools {
      flex: 0 0 auto; display: none; align-items: center; gap: 0;
      margin-right: 6px; padding: 2px; border-radius: 8px; background: #f0f0f0;
    }
    #coding-agent-ide-view-tools.is-on { display: inline-flex; }
    .coding-agent-ide-view-btn {
      border: 0; background: transparent; color: #555; border-radius: 6px;
      padding: 4px 10px; font: 12px/1.2 inherit; cursor: pointer;
    }
    .coding-agent-ide-view-btn:hover { color: var(--ai-text); }
    .coding-agent-ide-view-btn.is-on {
      background: #fff; color: var(--ai-text); font-weight: 600;
      box-shadow: 0 0 0 1px rgba(0,0,0,.06);
    }
    #coding-agent-ide-find {
      display: none; flex: 0 0 auto; align-items: center; gap: 6px;
      padding: 6px 10px; border-bottom: 1px solid var(--ai-border); background: #f7f7f7;
    }
    #coding-agent-ide-find.is-on { display: flex; }
    #coding-agent-ide-find-input {
      flex: 1 1 auto; min-width: 0; border: 1px solid var(--ai-border); border-radius: 6px;
      padding: 5px 8px; font: 12px/1.3 inherit; outline: none;
    }
    #coding-agent-ide-find-input:focus { border-color: #0078d4; }
    #coding-agent-ide-find-count { flex: 0 0 auto; font-size: 11px; color: var(--ai-muted); }
    #coding-agent-ide-code-wrap {
      flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; position: relative; background: #fff;
    }
    #coding-agent-ide-code-pane {
      flex: 1 1 auto; min-width: 0; min-height: 0; position: relative; overflow: hidden;
    }
    #coding-agent-ide-highlight {
      position: absolute; inset: 0; margin: 0; border: 0;
      padding: 10px 14px; overflow: hidden; pointer-events: none;
      font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--ai-text); background: #fff; white-space: pre; tab-size: 2;
    }
    #coding-agent-ide-highlight code {
      font: inherit; color: inherit; background: transparent; padding: 0;
      display: block; white-space: inherit; tab-size: inherit;
    }
    #coding-agent-ide-highlight .tok-kw { color: #0000ff; }
    #coding-agent-ide-highlight .tok-key { color: #0451a5; }
    #coding-agent-ide-highlight .tok-type { color: #267f99; }
    #coding-agent-ide-highlight .tok-fn { color: #795e26; }
    #coding-agent-ide-highlight .tok-str { color: #a31515; }
    #coding-agent-ide-highlight .tok-cmt { color: #008000; font-style: italic; }
    #coding-agent-ide-highlight .tok-num { color: #098658; }
    #coding-agent-ide-highlight .tok-pp { color: #0000ff; }
    #coding-agent-ide-highlight .tok-op { color: #000000; }
    #coding-agent-ide-highlight .tok-punct { color: #000000; }
    #coding-agent-ide-preview {
      display: none; flex: 1 1 auto; min-width: 0; min-height: 0; overflow: auto;
      padding: 20px 28px 40px; background: #fff; color: var(--ai-text);
      font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #coding-agent-ide-stage {
      flex: 1 1 auto; min-height: 0; display: flex; position: relative; background: #fff;
    }
    #coding-agent-ide-outline {
      display: none; flex: 0 0 200px; width: 200px; overflow: auto;
      border-left: 1px solid var(--ai-border); background: #fafafa; padding: 8px 0;
    }
    #coding-agent-ide-outline.is-on { display: block; }
    .coding-agent-ide-outline-item {
      display: block; width: 100%; border: 0; background: transparent; text-align: left;
      padding: 5px 12px; font: 12px/1.35 inherit; color: #444; cursor: pointer;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .coding-agent-ide-outline-item:hover { background: rgba(0,0,0,.05); color: var(--ai-text); }
    .coding-agent-ide-outline-item.is-h2 { padding-left: 22px; }
    .coding-agent-ide-outline-item.is-h3 { padding-left: 32px; color: #666; }
    #coding-agent-ide-editor.is-preview #coding-agent-ide-code-wrap { display: none !important; }
    #coding-agent-ide-editor.is-preview #coding-agent-ide-preview { display: block; }
    #coding-agent-ide-editor.is-preview #coding-agent-ide-empty { display: none !important; }
    #coding-agent-ide-preview h1, #coding-agent-ide-preview h2, #coding-agent-ide-preview h3 {
      margin: 1.1em 0 .45em; line-height: 1.3;
    }
    #coding-agent-ide-preview h1 { font-size: 1.7em; border-bottom: 1px solid #eee; padding-bottom: .25em; }
    #coding-agent-ide-preview h2 { font-size: 1.35em; }
    #coding-agent-ide-preview p { margin: .7em 0; }
    #coding-agent-ide-preview pre {
      background: #f6f8fa; border-radius: 8px; padding: 12px 14px; overflow: auto;
      font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    #coding-agent-ide-preview code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: .92em;
    }
    #coding-agent-ide-preview :not(pre) > code {
      background: rgba(0,0,0,.06); padding: .12em .35em; border-radius: 4px;
    }
    #coding-agent-ide-preview ul, #coding-agent-ide-preview ol { padding-left: 1.4em; margin: .6em 0; }
    #coding-agent-ide-preview blockquote {
      margin: .8em 0; padding: .2em 0 .2em 12px; border-left: 3px solid #ddd; color: #555;
    }
    #coding-agent-ide-gutter {
      flex: 0 0 auto; min-width: 40px; padding: 10px 8px 10px 10px;
      text-align: right; font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: #9a9a9a; background: #fff; border-right: 1px solid #f0f0f0;
      overflow: hidden; user-select: none; white-space: pre;
    }
    #coding-agent-ide-code {
      position: absolute; inset: 0; width: 100%; height: 100%; border: 0; resize: none;
      padding: 10px 14px; font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: transparent; caret-color: #111; background: transparent; outline: none;
      white-space: pre; overflow: auto; tab-size: 2; z-index: 1;
    }
    #coding-agent-ide-code::selection {
      background: rgba(0, 120, 212, 0.28); color: transparent;
    }
    #coding-agent-ide-empty {
      flex: 1 1 auto; min-width: 0; display: none; place-items: center; color: var(--ai-muted);
      font-size: 13px; padding: 24px; text-align: center; background: #fff;
    }
    #coding-agent-ide-empty.is-on { display: grid; }
    #coding-agent-ide-empty-cards {
      display: flex; align-items: center; justify-content: center; gap: 12px;
    }
    .coding-agent-ide-empty-card {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 6px; width: 96px; height: 84px; border: 1px solid #e8e8ea; border-radius: 10px;
      background: transparent; color: #52525b; cursor: pointer;
      font: 500 12px/1.2 inherit; padding: 10px 8px;
    }
    .coding-agent-ide-empty-card:hover { background: #f4f4f5; border-color: #d4d4d8; color: #18181b; }
    .coding-agent-ide-empty-card svg {
      width: 20px; height: 20px; opacity: .65;
    }
    .coding-agent-ide-empty-card:hover svg { opacity: .9; }
    #coding-agent-ide-explorer {
      flex: 0 0 var(--ai-ide-tree-width, 220px); width: var(--ai-ide-tree-width, 220px);
      min-width: 140px; max-width: 45%; display: flex; flex-direction: column;
      background: #f3f3f3; position: relative;
    }
    #coding-agent-ide-explorer-head {
      flex: 0 0 auto; height: 35px; padding: 0 6px 0 12px;
      display: flex; align-items: center; gap: 4px;
      border-bottom: 0; background: #f3f3f3;
      position: sticky; top: 0; z-index: 2;
    }
    #coding-agent-sidebar.is-fullscreen #coding-agent-top-actions {
      padding-right: 36px;
    }
    #coding-agent-sidebar.has-ide #coding-agent-top-actions {
      padding-right: 0;
    }
    #coding-agent-ide-root-name {
      flex: 1 1 auto; min-width: 0; font-size: 13px; font-weight: 600;
      letter-spacing: 0; text-transform: none; color: var(--ai-text);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #coding-agent-ide-explorer-actions {
      flex: 0 0 auto; display: flex; align-items: center; gap: 0;
      margin-left: auto;
      opacity: 0; pointer-events: none;
      transition: opacity .12s ease;
    }
    #coding-agent-ide-explorer:hover #coding-agent-ide-explorer-actions,
    #coding-agent-ide-explorer:focus-within #coding-agent-ide-explorer-actions {
      opacity: 1; pointer-events: auto;
    }
    #coding-agent-ide-explorer-actions .coding-agent-ide-icon-btn {
      width: 26px; height: 26px;
    }
    #coding-agent-ide-explorer-actions .coding-agent-ide-icon-btn svg {
      width: 14px; height: 14px;
    }
    #coding-agent-ide-ctx {
      display: none; position: fixed; z-index: 2147483640; min-width: 200px;
      padding: 4px 0; margin: 0; list-style: none;
      background: #fff; border: 1px solid rgba(0,0,0,.12); border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,.14);
      font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #222;
    }
    #coding-agent-ide-ctx.is-on { display: block; }
    #coding-agent-ide-ctx button {
      display: block; width: 100%; border: 0; background: transparent;
      text-align: left; padding: 7px 14px; cursor: pointer; color: inherit;
      font: inherit;
    }
    #coding-agent-ide-ctx button:hover:not(:disabled) { background: #f0f0f0; }
    #coding-agent-ide-ctx button:disabled { color: #aaa; cursor: default; }
    #coding-agent-ide-ctx .coding-agent-ide-ctx-sep {
      height: 1px; margin: 4px 0; background: rgba(0,0,0,.08); border: 0;
    }
    .coding-agent-ide-tree-item.is-cut { opacity: .45; }
    .coding-agent-ide-inline-input {
      display: flex; align-items: center; gap: 4px; padding: 2px 8px 2px 4px;
    }
    .coding-agent-ide-inline-input input {
      flex: 1 1 auto; min-width: 0; border: 1px solid #0078d4; border-radius: 4px;
      padding: 2px 6px; font: 13px/1.3 inherit; outline: none;
    }
    #coding-agent-ide-tree {
      flex: 1 1 auto; min-height: 0; overflow: auto; padding: 4px 0 8px;
      font-size: 13px;
    }
    .coding-agent-ide-tree-item {
      display: flex; align-items: center; gap: 4px; width: 100%;
      border: 0; background: transparent; text-align: left;
      padding: 3px 8px 3px 4px; color: var(--ai-text); cursor: pointer;
      font: 13px/1.35 inherit; overflow: hidden;
    }
    .coding-agent-ide-tree-item:hover { background: rgba(0,0,0,.05); }
    .coding-agent-ide-tree-item.is-active { background: rgba(0,120,212,.12); }
    .coding-agent-ide-tree-chevron {
      flex: 0 0 16px; width: 16px; height: 16px; display: grid; place-items: center;
      color: #666; opacity: 0;
    }
    .coding-agent-ide-tree-item.is-dir .coding-agent-ide-tree-chevron { opacity: 1; }
    .coding-agent-ide-tree-chevron svg {
      width: 10px; height: 10px; transition: transform .12s ease;
    }
    .coding-agent-ide-tree-item.is-expanded .coding-agent-ide-tree-chevron svg {
      transform: rotate(90deg);
    }
    .coding-agent-ide-tree-icon {
      flex: 0 0 16px; width: 16px; height: 16px; display: grid; place-items: center;
      font-size: 11px; line-height: 1; border-radius: 3px; font-weight: 700;
    }
    .coding-agent-ide-tree-icon.is-dir { color: #dcb67a; background: transparent; font-size: 13px; }
    .coding-agent-ide-tree-icon.is-py { color: #3776ab; }
    .coding-agent-ide-tree-icon.is-js { color: #c5a000; }
    .coding-agent-ide-tree-icon.is-html { color: #e34c26; }
    .coding-agent-ide-tree-icon.is-css { color: #264de4; }
    .coding-agent-ide-tree-icon.is-md { color: #555; }
    .coding-agent-ide-tree-icon.is-json,
    .coding-agent-ide-tree-icon.is-yml,
    .coding-agent-ide-tree-icon.is-yaml { color: #cb171e; }
    .coding-agent-ide-tree-icon.is-env { color: #888; }
    .coding-agent-ide-tree-icon.is-bat,
    .coding-agent-ide-tree-icon.is-sh { color: #3e7a3e; }
    .coding-agent-ide-tree-icon.is-img { color: #0a7ea4; font-size: 9px; }
    .coding-agent-ide-tree-icon.is-doc { color: #2b579a; }
    .coding-agent-ide-tree-label {
      flex: 1 1 auto; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .coding-agent-ide-icon-btn {
      width: 28px; height: 28px; border: 0; border-radius: 6px;
      background: transparent; color: #555; cursor: pointer;
      display: grid; place-items: center; padding: 0; flex: 0 0 auto;
    }
    .coding-agent-ide-icon-btn:hover { background: rgba(0,0,0,.06); color: var(--ai-text); }
    .coding-agent-ide-icon-btn.is-on { background: rgba(0,0,0,.08); color: var(--ai-text); }
    .coding-agent-ide-icon-btn:disabled { opacity: .35; cursor: default; }
    .coding-agent-ide-icon-btn svg { width: 16px; height: 16px; display: block; }
    #coding-agent-ctx-bar {
      position: relative;
      display: none; align-items: center; gap: 4px;
      min-height: 28px; padding: 0 2px 2px;
      z-index: 8;
    }
    /* Only on empty / new-agent landing — hide once a real conversation starts. */
    #coding-agent-sidebar.is-empty #coding-agent-ctx-bar { display: flex; }
    .coding-agent-ctx-chip {
      display: inline-flex; align-items: center; gap: 6px;
      max-width: min(100%, 420px); min-width: 0;
      border: 0; background: transparent; color: #3f3f46;
      border-radius: 8px; padding: 5px 8px; margin: 0;
      font: 500 12.5px/1.2 inherit; cursor: pointer;
      white-space: nowrap;
    }
    .coding-agent-ctx-chip:hover { background: rgba(0,0,0,.05); color: #111; }
    .coding-agent-ctx-chip:disabled { opacity: .55; cursor: default; }
    .coding-agent-ctx-chip:disabled:hover { background: transparent; color: #3f3f46; }
    .coding-agent-ctx-chip.is-open { background: rgba(0,0,0,.06); color: #111; }
    .coding-agent-ctx-chip-label {
      min-width: 0; overflow: hidden; text-overflow: ellipsis;
    }
    .coding-agent-ctx-chevron {
      width: 0; height: 0; flex: 0 0 auto;
      border-left: 3.5px solid transparent;
      border-right: 3.5px solid transparent;
      border-top: 4.5px solid currentColor;
      opacity: .55;
    }
    .coding-agent-ctx-icon {
      width: 14px; height: 14px; flex: 0 0 auto; display: block; opacity: .7;
    }
    #coding-agent-ws-picker {
      display: none; position: absolute; left: 0; top: calc(100% + 4px);
      width: min(360px, calc(100vw - 48px));
      background: #fff; border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.06);
      padding: 8px; z-index: 30;
      /* Must stay visible: nested #coding-agent-ws-flyout is position:absolute to the
         right; overflow:auto on this box creates phantom empty scroll area. */
      overflow: visible;
    }
    #coding-agent-ws-picker.is-on { display: block; }
    #coding-agent-ws-flyout {
      display: none; position: absolute; left: calc(100% + 6px); top: 0;
      width: min(300px, calc(100vw - 48px));
      background: #fff; border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.06);
      padding: 6px; z-index: 31;
      max-height: min(560px, 85vh); overflow: auto;
    }
    #coding-agent-ws-flyout.is-on { display: block; }
    /* Folder browse (local + SSH): one scrollbar — flyout clips, list scrolls. */
    #coding-agent-ws-flyout.is-on:has([data-flyout-panel="browse"].is-on),
    #coding-agent-ws-flyout.is-on:has([data-flyout-panel="ssh-form"].is-on) {
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: min(420px, 70vh);
    }
    #coding-agent-ws-flyout.is-on:has([data-flyout-panel="browse"].is-on) #coding-agent-ws-flyout-panels,
    #coding-agent-ws-flyout.is-on:has([data-flyout-panel="ssh-form"].is-on) #coding-agent-ws-flyout-panels {
      flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;
    }
    #coding-agent-ws-flyout-path {
      display: none; flex-direction: column; gap: 6px;
      padding: 6px 4px 4px;
    }
    #coding-agent-ws-flyout-path.is-on { display: flex; }
    #coding-agent-ws-flyout-path-ue {
      display: none; flex-direction: column; gap: 6px;
      padding: 6px 4px 4px;
    }
    #coding-agent-ws-flyout-path-ue.is-on { display: flex; }
    #coding-agent-ws-flyout-path-ue input {
      width: 100%; box-sizing: border-box; border: 0; background: #f4f4f5;
      border-radius: 8px; padding: 8px 10px; font: 12.5px/1.3 inherit; outline: none;
    }
    #coding-agent-ws-flyout-path-ue button {
      border: 0; background: #111; color: #fff; border-radius: 8px;
      padding: 8px 10px; font: 600 12px/1 inherit; cursor: pointer;
    }
    #coding-agent-ws-flyout-path input {
      width: 100%; box-sizing: border-box; border: 0; background: #f4f4f5;
      border-radius: 8px; padding: 8px 10px; font: 12.5px/1.3 inherit; outline: none;
    }
    #coding-agent-ws-flyout-path button {
      border: 0; background: #111; color: #fff; border-radius: 8px;
      padding: 8px 10px; font: 600 12px/1 inherit; cursor: pointer;
    }
    #coding-agent-ws-browse-search {
      width: 100%; box-sizing: border-box; border: 0; background: #f4f4f5;
      border-radius: 8px; padding: 8px 10px; margin: 2px 0 6px;
      font: 12.5px/1.3 inherit; outline: none;
    }
    #coding-agent-ws-browse-search::placeholder { color: #8b8b93; }
    #coding-agent-ws-flyout-panels > [data-flyout-panel] { display: none; }
    #coding-agent-ws-flyout-panels > [data-flyout-panel].is-on { display: block; }
    #coding-agent-ws-flyout-panels > [data-flyout-panel="browse"].is-on {
      display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0;
    }
    #coding-agent-ws-flyout-panels > [data-flyout-panel="ssh-form"].is-on {
      display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0;
    }
    #coding-agent-ws-browse-head { flex: 0 0 auto; }
    #coding-agent-ws-browse-search { flex: 0 0 auto; }
    #coding-agent-ws-ssh-form {
      display: none; flex-direction: column; gap: 8px; padding: 4px 2px 6px;
      min-height: 0; flex: 1 1 auto;
    }
    #coding-agent-ws-ssh-form.is-on { display: flex; }
    #coding-agent-ws-ssh-connect-row {
      display: flex; gap: 6px; align-items: stretch; flex: 0 0 auto;
    }
    #coding-agent-ws-ssh-hostname {
      flex: 1 1 auto; min-width: 0;
      border: 0; background: #f4f4f5; border-radius: 8px;
      padding: 9px 10px; font: 12.5px/1.3 inherit; outline: none; color: #18181b;
    }
    #coding-agent-ws-ssh-hostname:focus { background: #ececee; }
    #coding-agent-ws-ssh-connect {
      flex: 0 0 auto; border: 0; border-radius: 8px;
      padding: 0 12px; font: 600 12px/1 inherit; cursor: pointer;
      background: #2563eb; color: #fff;
    }
    #coding-agent-ws-ssh-connect:hover { background: #1d4ed8; }
    #coding-agent-ws-ssh-host-list {
      flex: 1 1 auto; min-height: 0; overflow: auto;
      display: flex; flex-direction: column; gap: 2px;
    }
    #coding-agent-ws-ssh-host-list .coding-agent-ws-item {
      width: 100%;
    }
    #coding-agent-ws-ssh-foot {
      flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
      gap: 8px; padding: 4px 2px 0; font-size: 11px; color: #8b8b93; line-height: 1.35;
    }
    #coding-agent-ws-ssh-open-config {
      border: 0; background: transparent; color: #2563eb;
      font: 600 11.5px/1 inherit; cursor: pointer; padding: 0; white-space: nowrap;
    }
    #coding-agent-ws-ssh-open-config:hover { text-decoration: underline; }
    #coding-agent-ws-ssh-manual {
      display: none; flex-direction: column; gap: 6px; padding-top: 4px;
      border-top: 1px solid #ececee; margin-top: 2px;
    }
    #coding-agent-ws-ssh-manual.is-on { display: flex; }
    #coding-agent-ws-ssh-manual-toggle {
      border: 0; background: transparent; color: #71717a;
      font: 600 11px/1 inherit; cursor: pointer; padding: 4px 2px; text-align: left;
    }
    #coding-agent-ws-ssh-manual-toggle:hover { color: #18181b; }
    #coding-agent-ws-ssh-form label,
    #coding-agent-ws-ssh-manual label {
      display: flex; flex-direction: column; gap: 3px;
      font-size: 11px; color: #71717a; font-weight: 600;
    }
    #coding-agent-ws-ssh-form label input, #coding-agent-ws-ssh-form label select,
    #coding-agent-ws-ssh-manual label input, #coding-agent-ws-ssh-manual label select {
      border: 0; background: #f4f4f5; border-radius: 8px;
      padding: 8px 10px; font: 12.5px/1.3 inherit; outline: none; color: #18181b;
    }
    #coding-agent-ws-ssh-form-actions {
      display: flex; gap: 6px; margin-top: 4px;
    }
    #coding-agent-ws-ssh-form-actions button {
      flex: 1 1 auto; border: 0; border-radius: 8px;
      padding: 8px 10px; font: 600 12px/1 inherit; cursor: pointer;
    }
    #coding-agent-ws-ssh-test { background: #f4f4f5; color: #18181b; }
    #coding-agent-ws-ssh-save { background: #111; color: #fff; }
    #coding-agent-ws-ssh-status {
      font-size: 11.5px; color: #71717a; min-height: 1.2em; padding: 0 2px;
    }
    #coding-agent-ws-ssh-status.is-err { color: #b91c1c; }
    #coding-agent-ws-ssh-status.is-ok { color: #15803d; }
    .coding-agent-ws-item-host {
      display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: #8b8b93; font-size: 11.5px; margin-top: 2px;
    }
    #coding-agent-ws-search {
      width: 100%; box-sizing: border-box;
      border: 0; background: #f4f4f5; border-radius: 8px;
      padding: 9px 10px; font: 13px/1.3 inherit; color: var(--ai-text);
      margin: 0 0 4px; outline: none;
    }
    #coding-agent-ws-search:focus { background: #ececee; }
    #coding-agent-ws-search::placeholder { color: #8b8b93; }
    .coding-agent-ws-section-label {
      font: 600 11px/1 inherit; color: #8b8b93;
      letter-spacing: .01em; padding: 10px 8px 4px;
    }
    .coding-agent-ws-list { display: flex; flex-direction: column; gap: 1px; max-height: 200px; overflow: auto; }
    /* Browse list: only scroller inside the flyout. */
    #coding-agent-ws-browse-list.coding-agent-ws-list {
      flex: 1 1 auto;
      min-height: 0;
      max-height: none;
      overflow: auto;
      margin-bottom: 0;
    }
    #coding-agent-ws-browse-use-here,
    #coding-agent-ws-browse-open-folder,
    #coding-agent-ws-browse-path {
      flex: 0 0 auto;
    }
    #coding-agent-ws-browse-use-here {
      position: static;
      margin-top: 4px;
      background: #fff; border-top: 1px solid #f0f0f0; z-index: 1;
    }
    #coding-agent-ws-browse-open-folder,
    #coding-agent-ws-browse-path { display: none; }
    #coding-agent-ws-flyout.is-on:has([data-flyout-panel="browse"].is-on).is-local-browse #coding-agent-ws-browse-open-folder {
      display: flex;
    }
    #coding-agent-ws-browse-path.is-on { display: flex; flex-direction: column; gap: 6px; padding: 6px 4px 4px; }
    #coding-agent-ws-browse-path input {
      width: 100%; box-sizing: border-box; border: 0; background: #f4f4f5;
      border-radius: 8px; padding: 8px 10px; font: 12.5px/1.3 inherit; outline: none;
    }
    #coding-agent-ws-browse-path button {
      border: 0; background: #111; color: #fff; border-radius: 8px;
      padding: 8px 10px; font: 600 12px/1 inherit; cursor: pointer;
    }
    .coding-agent-ws-item,
    .coding-agent-ws-nav {
      display: flex; align-items: center; gap: 8px;
      width: 100%; border: 0; background: transparent; color: #18181b;
      border-radius: 8px; padding: 7px 8px; margin: 0;
      font: 13px/1.25 inherit; cursor: pointer; text-align: left;
    }
    .coding-agent-ws-item:hover,
    .coding-agent-ws-nav:hover { background: #f4f4f5; }
    .coding-agent-ws-item.is-active { background: #f0f0f2; }
    .coding-agent-ws-item-ico,
    .coding-agent-ws-nav .coding-agent-ctx-icon {
      width: 15px; height: 15px; flex: 0 0 auto; opacity: .72; display: block;
    }
    .coding-agent-ws-item-main { flex: 1 1 auto; min-width: 0; }
    .coding-agent-ws-item-name {
      display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-weight: 450;
    }
    .coding-agent-ws-item-path {
      display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: #8b8b93; font-size: 11.5px; margin-top: 2px;
    }
    .coding-agent-ws-item-check {
      flex: 0 0 auto; width: 14px; height: 14px; color: #111; opacity: 0;
    }
    .coding-agent-ws-item.is-active .coding-agent-ws-item-check { opacity: 1; }
    .coding-agent-ws-chevron-r {
      width: 0; height: 0; margin-left: auto; flex: 0 0 auto;
      border-top: 4px solid transparent;
      border-bottom: 4px solid transparent;
      border-left: 5px solid #a1a1aa;
    }
    .coding-agent-ws-nav.is-open,
    .coding-agent-ws-nav.is-hot { background: #f4f4f5; }
    .coding-agent-ws-foot {
      display: flex; flex-direction: column; gap: 1px; margin-top: 4px; padding-top: 2px;
    }
    .coding-agent-ws-foot button {
      display: flex; align-items: center; gap: 8px;
      width: 100%; border: 0; background: transparent; color: #18181b;
      border-radius: 8px; padding: 7px 8px; margin: 0;
      font: 13px/1.25 inherit; cursor: pointer; text-align: left;
    }
    .coding-agent-ws-foot button:hover { background: #f4f4f5; }
    #coding-agent-ws-path-row {
      display: none; gap: 6px; padding: 6px 2px 2px; align-items: center;
    }
    #coding-agent-ws-path-row.is-on { display: flex; }
    #coding-agent-ws-path-input {
      flex: 1 1 auto; min-width: 0;
      border: 0; background: #f4f4f5; border-radius: 8px;
      padding: 8px 10px; font: 12.5px/1.3 inherit; outline: none;
    }
    #coding-agent-ws-path-go {
      flex: 0 0 auto; border: 0; background: #111; color: #fff;
      border-radius: 8px; padding: 8px 12px; font: 600 12px/1 inherit; cursor: pointer;
    }
    #coding-agent-ctx-branch[hidden] { display: none !important; }
    #coding-agent-confirm-modal {
      display: none; position: fixed; inset: 0; z-index: 2147483601;
      background: rgba(0,0,0,.35); place-items: center; padding: 24px;
    }
    #coding-agent-confirm-modal.is-on { display: grid; }
    #coding-agent-confirm-card {
      width: min(380px, 100%); background: #fff; border-radius: 14px;
      border: 1px solid var(--ai-border); padding: 20px 18px;
      box-shadow: 0 18px 40px rgba(0,0,0,.12);
    }
    #coding-agent-confirm-card h2 { margin: 0 0 6px; font-size: 17px; }
    #coding-agent-confirm-card p { margin: 0 0 16px; color: var(--ai-muted); font-size: 13px; line-height: 1.45; }
    #coding-agent-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
    #coding-agent-confirm-actions button {
      border: 1px solid var(--ai-border); background: #fff; border-radius: 10px;
      padding: 8px 14px; font: 600 13px/1 inherit; cursor: pointer;
    }
    #coding-agent-confirm-actions .primary { background: #111; color: #fff; border-color: #111; }
    #coding-agent-confirm-actions .danger { background: #c62828; color: #fff; border-color: #c62828; }
    #coding-agent-confirm-actions .danger:hover { background: #b71c1c; }
    .coding-agent-nav-item-meta {
      display: block; font-size: 11px; color: var(--ai-muted); font-weight: 400;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #coding-agent-nav-scroll {
      flex: 1 1 auto; min-height: 0; overflow: auto; padding: 4px 8px 12px;
    }
    #coding-agent-nav-label-row {
      display: flex; align-items: center; gap: 2px;
      padding: 6px 4px 4px; border-radius: 8px;
    }
    #coding-agent-nav-label-row:hover { background: rgba(0,0,0,.03); }
    #coding-agent-nav-label {
      display: flex; align-items: center; gap: 6px; flex: 1 1 auto; min-width: 0;
      border: 0; background: transparent; cursor: pointer; text-align: left;
      padding: 4px 4px; font: 600 12px/1.2 inherit;
      color: var(--ai-muted); letter-spacing: .02em; border-radius: 6px;
    }
    #coding-agent-nav-label:hover { color: var(--ai-text); }
    #coding-agent-nav-label-actions {
      flex: 0 0 auto; display: flex; align-items: center; gap: 0;
      opacity: 0; pointer-events: none; transition: opacity .12s ease;
    }
    #coding-agent-nav-label-row:hover #coding-agent-nav-label-actions,
    #coding-agent-nav-label-row:focus-within #coding-agent-nav-label-actions {
      opacity: 1; pointer-events: auto;
    }
    #coding-agent-nav-label-actions .coding-agent-nav-mini-btn {
      width: 24px; height: 24px; border: 0; border-radius: 6px;
      background: transparent; color: #666; cursor: pointer;
      display: grid; place-items: center; padding: 0;
    }
    #coding-agent-nav-label-actions .coding-agent-nav-mini-btn:hover,
    #coding-agent-nav-label-actions .coding-agent-nav-mini-btn.is-on {
      background: rgba(0,0,0,.08); color: var(--ai-text);
    }
    #coding-agent-nav-label-actions .coding-agent-nav-mini-btn svg {
      width: 14px; height: 14px; display: block;
    }
    .coding-agent-nav-label-chevron {
      width: 0; height: 0; border-style: solid; flex: 0 0 auto;
      border-width: 4px 0 4px 6px; border-color: transparent transparent transparent #888;
      transition: transform .12s ease;
    }
    #coding-agent-nav-label[aria-expanded="true"] .coding-agent-nav-label-chevron {
      transform: rotate(90deg);
    }
    #coding-agent-nav-scroll.is-repos-collapsed #coding-agent-nav-list,
    #coding-agent-nav-scroll.is-repos-collapsed #coding-agent-nav-empty {
      display: none;
    }
    #coding-agent-nav-scroll.is-hide-empty .coding-agent-repo-group.is-empty {
      display: none;
    }
    #coding-agent-nav-list { display: flex; flex-direction: column; gap: 2px; }
    .coding-agent-repo-group { margin: 0 0 6px; }
    .coding-agent-repo-head {
      display: flex; align-items: center; gap: 4px; width: 100%;
      border: 0; background: transparent; color: var(--ai-text);
      border-radius: 8px; padding: 2px 4px 2px 2px; font: 600 13px/1.2 inherit;
    }
    .coding-agent-repo-head:hover { background: rgba(0,0,0,.04); }
    .coding-agent-repo-toggle {
      display: flex; align-items: center; gap: 6px; flex: 1 1 auto; min-width: 0;
      border: 0; background: transparent; color: inherit; font: inherit;
      cursor: pointer; text-align: left; padding: 5px 4px; border-radius: 6px;
    }
    .coding-agent-repo-chevron {
      width: 0; height: 0; border-style: solid;
      border-width: 4px 0 4px 6px; border-color: transparent transparent transparent #888;
      transition: transform .12s ease; flex: 0 0 auto;
    }
    .coding-agent-repo-group.is-collapsed .coding-agent-repo-chevron {
      transform: rotate(0deg);
    }
    .coding-agent-repo-group:not(.is-collapsed) .coding-agent-repo-chevron {
      transform: rotate(90deg);
    }
    .coding-agent-repo-name {
      flex: 1 1 auto; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .coding-agent-repo-count {
      flex: 0 0 auto; font-size: 11px; color: var(--ai-muted); font-weight: 500;
      padding-right: 4px;
    }
    .coding-agent-repo-add {
      flex: 0 0 auto; width: 24px; height: 24px; border: 0; border-radius: 6px;
      background: transparent; color: #666; cursor: pointer;
      display: none; place-items: center; padding: 0;
    }
    .coding-agent-repo-add svg { width: 14px; height: 14px; display: block; }
    .coding-agent-repo-add:hover { background: rgba(0,0,0,.08); color: var(--ai-text); }
    .coding-agent-repo-head:hover .coding-agent-repo-add,
    .coding-agent-repo-head:focus-within .coding-agent-repo-add { display: grid; }
    .coding-agent-repo-head:hover .coding-agent-repo-count,
    .coding-agent-repo-head:focus-within .coding-agent-repo-count { display: none; }
    .coding-agent-repo-body { display: flex; flex-direction: column; gap: 1px; padding: 0 0 4px 8px; }
    .coding-agent-repo-group.is-collapsed .coding-agent-repo-body { display: none; }
    .coding-agent-repo-empty {
      padding: 6px 10px 8px; font-size: 12px; color: var(--ai-muted);
    }
    .coding-agent-nav-item {
      display: flex; align-items: center; gap: 6px;
      width: 100%; border: 0; background: transparent; color: var(--ai-text);
      border-radius: 8px; padding: 7px 8px 7px 10px; font: 13px/1.35 inherit;
      cursor: pointer; text-align: left; position: relative;
    }
    .coding-agent-nav-item:hover { background: rgba(0,0,0,.05); }
    .coding-agent-nav-item.is-active { background: rgba(0,0,0,.08); font-weight: 600; }
    .coding-agent-nav-item-spin {
      display: none; flex: 0 0 auto; width: 12px; height: 12px;
      border: 1.5px solid rgba(0,0,0,.14); border-top-color: #444;
      border-radius: 50%; animation: coding-agent-nav-spin .7s linear infinite;
    }
    .coding-agent-nav-item.is-running .coding-agent-nav-item-spin { display: inline-block; }
    @keyframes coding-agent-nav-spin {
      to { transform: rotate(360deg); }
    }
    .coding-agent-nav-item-title {
      flex: 1 1 auto; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      display: block;
    }
    #coding-agent-nav-tip {
      display: none; position: fixed; z-index: 2147483645;
      min-width: 200px; max-width: min(360px, calc(100vw - 24px));
      padding: 10px 12px; border-radius: 10px;
      background: #fff; border: 1px solid rgba(0,0,0,.1);
      box-shadow: 0 10px 28px rgba(0,0,0,.14);
      font: 12.5px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #18181b; pointer-events: none;
    }
    #coding-agent-nav-tip.is-on { display: block; }
    #coding-agent-nav-tip .tip-title {
      font-weight: 650; margin: 0 0 6px; word-break: break-word;
    }
    #coding-agent-nav-tip .tip-row {
      display: flex; align-items: flex-start; gap: 8px;
      color: #52525b; margin-top: 4px;
    }
    #coding-agent-nav-tip .tip-row svg {
      width: 14px; height: 14px; flex: 0 0 auto; margin-top: 1px;
    }
    #coding-agent-nav-tip .tip-row span {
      min-width: 0; word-break: break-all;
    }
    #coding-agent-nav-tip .tip-ssh { color: #15803d; font-weight: 600; }
    #coding-agent-ctx-ws.is-ssh {
      border-color: rgba(21, 128, 61, .28);
      background: rgba(21, 128, 61, .06);
    }
    #coding-agent-ctx-ws.is-ssh .coding-agent-ctx-chip-label::before {
      content: "SSH · ";
      font-weight: 700;
      color: #15803d;
    }
    .coding-agent-nav-item.is-renaming {
      background: rgba(0,0,0,.06);
    }
    .coding-agent-nav-item-rename {
      flex: 1 1 auto; min-width: 0; width: 100%;
      border: 1px solid #0078d4; border-radius: 6px;
      padding: 2px 6px; margin: 0; outline: none;
      font: 13px/1.35 inherit; color: var(--ai-text); background: #fff;
      box-shadow: 0 0 0 2px rgba(0,120,212,.18);
    }
    .coding-agent-nav-item-time {
      flex: 0 0 auto; font-size: 11px; color: var(--ai-muted); font-weight: 400;
    }
    .coding-agent-nav-item-actions {
      flex: 0 0 auto; display: none; align-items: center; gap: 1px;
    }
    .coding-agent-nav-item:hover .coding-agent-nav-item-actions,
    .coding-agent-nav-item:focus-within .coding-agent-nav-item-actions,
    .coding-agent-nav-item.is-menu-open .coding-agent-nav-item-actions { display: inline-flex; }
    .coding-agent-nav-item:hover .coding-agent-nav-item-time,
    .coding-agent-nav-item:focus-within .coding-agent-nav-item-time,
    .coding-agent-nav-item.is-menu-open .coding-agent-nav-item-time { display: none; }
    .coding-agent-nav-item-action {
      width: 24px; height: 24px; border: 0; border-radius: 6px;
      background: transparent; color: #555; cursor: pointer;
      display: grid; place-items: center; padding: 0;
    }
    .coding-agent-nav-item-action:hover { background: rgba(0,0,0,.08); color: var(--ai-text); }
    .coding-agent-nav-item-action svg { width: 14px; height: 14px; display: block; }
    #coding-agent-nav-item-menu {
      display: none; position: fixed; z-index: 2147483642; min-width: 180px;
      padding: 6px; margin: 0; list-style: none;
      background: #fff; border: 1px solid rgba(0,0,0,.1); border-radius: 12px;
      box-shadow: 0 10px 28px rgba(0,0,0,.14);
      font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #coding-agent-nav-item-menu.is-on { display: block; }
    #coding-agent-nav-item-menu button {
      width: 100%; display: flex; align-items: center; gap: 10px;
      border: 0; background: transparent; color: var(--ai-text);
      border-radius: 8px; padding: 8px 10px; cursor: pointer; text-align: left;
      font: inherit;
    }
    #coding-agent-nav-item-menu button:hover { background: rgba(0,0,0,.05); }
    #coding-agent-nav-item-menu button.is-danger { color: #c62828; }
    #coding-agent-nav-item-menu button.is-danger:hover { background: rgba(198,40,40,.08); }
    #coding-agent-nav-item-menu button svg {
      width: 15px; height: 15px; flex: 0 0 auto; display: block;
    }
    #coding-agent-nav-empty {
      padding: 16px 10px; color: var(--ai-muted); font-size: 13px; line-height: 1.45;
    }
    #coding-agent-ide {
      display: none; flex: 0 0 var(--ai-ide-width); width: var(--ai-ide-width);
      height: 100%; min-width: 320px; max-width: 75vw; border-left: 1px solid var(--ai-border);
      background: #fff; flex-direction: column; overflow: hidden; position: relative;
    }
    #coding-agent-sidebar.is-fullscreen.has-ide #coding-agent-ide { display: flex; }
    #coding-agent-ide-rail {
      display: none; position: absolute; right: 10px; top: 44px;
      z-index: 28;
      flex-direction: column; align-items: center; gap: 2px;
      width: 44px; padding: 10px 6px; border-radius: 999px;
      background: #fff; border: 1px solid rgba(0,0,0,.1);
      box-shadow: 0 6px 20px rgba(0,0,0,.08);
      transition: width .18s ease, padding .18s ease, border-radius .18s ease;
    }
    #coding-agent-sidebar.is-fullscreen:not(.has-ide) #coding-agent-ide-rail { display: flex; }
    #coding-agent-ide-rail.is-labels {
      width: 168px; align-items: stretch; padding: 8px;
      border-radius: 14px;
    }
    .coding-agent-ide-rail-btn {
      width: 32px; height: 32px; border: 0; border-radius: 999px;
      background: transparent; color: #555; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      gap: 0; padding: 0; flex: 0 0 auto;
      transition: background .15s ease, color .15s ease, transform .12s ease, width .15s ease, border-radius .15s ease;
    }
    #coding-agent-ide-rail.is-labels .coding-agent-ide-rail-btn {
      width: 100%; height: 34px; border-radius: 8px;
      justify-content: flex-start; gap: 10px; padding: 0 10px;
    }
    .coding-agent-ide-rail-btn:hover {
      background: rgba(0,0,0,.07); color: var(--ai-text);
    }
    .coding-agent-ide-rail-btn:active {
      background: rgba(0,0,0,.11); transform: scale(.96);
    }
    .coding-agent-ide-rail-btn svg { width: 16px; height: 16px; display: block; flex: 0 0 auto; }
    .coding-agent-ide-rail-label {
      display: none; font: 13px/1.2 inherit; color: inherit;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #coding-agent-ide-rail.is-labels .coding-agent-ide-rail-label { display: inline; }
    #coding-agent-ide-rail-expand .coding-agent-ide-rail-expand-icon {
      display: block; transition: transform .18s ease;
    }
    #coding-agent-ide-rail.is-labels #coding-agent-ide-rail-expand .coding-agent-ide-rail-expand-icon {
      transform: scaleX(-1);
    }
    #coding-agent-ide-panel-terminal {
      display: none; flex: 1 1 auto; min-height: 0; min-width: 0; width: 100%;
      flex-direction: column; background: #0c0c0c;
    }
    #coding-agent-ide[data-panel="terminal"] #coding-agent-ide-editor,
    #coding-agent-ide[data-panel="terminal"] #coding-agent-ide-explorer { display: none !important; }
    #coding-agent-ide[data-panel="terminal"] #coding-agent-ide-panel-terminal { display: flex; }
    #coding-agent-ide[data-panel="files"] #coding-agent-ide-explorer { display: flex; }
    .coding-agent-ide-panel-empty {
      flex: 1 1 auto; display: grid; place-items: center; text-align: center;
      color: var(--ai-muted); font-size: 13px; padding: 24px; gap: 8px;
    }
    .coding-agent-ide-panel-empty strong {
      display: block; color: var(--ai-text); font-size: 15px; margin-bottom: 6px;
    }
    #coding-agent-ide-term-mount {
      flex: 1 1 auto; min-height: 0; min-width: 0; width: 100%;
      background: #0c0c0c;
      position: relative;
    }
    #coding-agent-ide-term-mount .coding-agent-ide-xterm-host {
      position: absolute; inset: 0;
    }
    #coding-agent-ide-term-mount .xterm {
      height: 100%;
      padding: 4px 0 0 4px;
    }
    #coding-agent-ide-term-mount .xterm-viewport {
      scrollbar-color: #555 #0c0c0c;
    }
    #coding-agent-ide-resize {
      position: absolute; left: -3px; top: 0; width: 6px; height: 100%;
      cursor: ew-resize; z-index: 5;
    }
    #coding-agent-ide-resize:hover,
    #coding-agent-sidebar.is-ide-resizing #coding-agent-ide-resize {
      background: rgba(0,120,212,.45);
    }
    #coding-agent-ide-tree-resize {
      position: absolute; left: -3px; top: 0; width: 6px; height: 100%;
      cursor: ew-resize; z-index: 3;
    }
    #coding-agent-ide-tree-resize:hover,
    #coding-agent-sidebar.is-ide-tree-resizing #coding-agent-ide-tree-resize {
      background: rgba(0,120,212,.45);
    }
    #coding-agent-sidebar.is-ide-resizing,
    #coding-agent-sidebar.is-ide-tree-resizing { user-select: none; cursor: ew-resize; }
    #coding-agent-nav-footer {
      flex: 0 0 auto; border-top: 1px solid var(--ai-border);
      height: calc(var(--ai-nav-chrome-pad-y) * 2 + var(--ai-nav-icon-size) + 1px);
      padding: var(--ai-nav-chrome-pad-y) var(--ai-nav-chrome-pad-x);
      display: flex; align-items: center; gap: 8px;
      background: var(--ai-nav-bg); box-sizing: border-box;
    }
    #coding-agent-nav-user {
      flex: 1 1 auto; min-width: 0;
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; font-weight: 600; color: var(--ai-text);
    }
    #coding-agent-nav-user-name {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #coding-agent-sidebar.is-fullscreen #coding-agent-user-chip,
    #coding-agent-sidebar.is-fullscreen #coding-agent-new-chat,
    #coding-agent-sidebar.is-fullscreen #coding-agent-fullscreen {
      display: none !important;
    }
    #coding-agent-toggle-ide {
      width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px;
      background: transparent; color: #555; cursor: pointer;
      display: none; place-items: center;
      transition: background .15s ease, color .15s ease;
    }
    /* When IDE is closed: float at workspace top-right. When open: docked in IDE topbar. */
    #coding-agent-sidebar.is-fullscreen:not(.has-ide) #coding-agent-toggle-ide {
      display: grid;
      position: absolute;
      top: 8px;
      right: 10px;
      z-index: 30;
      background: #fff;
    }
    #coding-agent-sidebar.has-ide #coding-agent-toggle-ide { display: none !important; }
    #coding-agent-toggle-ide:hover { background: rgba(0,0,0,.06); color: var(--ai-text); }
    #coding-agent-toggle-ide svg { width: 16px; height: 16px; display: block; }
    @media (max-width: 720px) {
      #coding-agent-sidebar.is-fullscreen #coding-agent-workspace { flex-direction: column; }
      #coding-agent-sidebar.is-fullscreen #coding-agent-nav-shell {
        width: 100%; height: auto; max-height: 38vh;
      }
      #coding-agent-sidebar.is-fullscreen #coding-agent-nav {
        flex: 1 1 auto; width: 100%; height: 100%; max-height: none;
        border-right: 0; border-bottom: 1px solid var(--ai-border);
      }
      #coding-agent-sidebar.is-fullscreen.nav-hidden #coding-agent-nav-rail {
        width: 100%; flex-basis: auto;
      }
    }
    #coding-agent-resize-handle {
      position: absolute; left: 0; top: 0; width: 6px; height: 100%;
      cursor: ew-resize; z-index: 12; touch-action: none;
    }
    #coding-agent-resize-handle::after {
      content: ""; position: absolute; left: 2px; top: 0; bottom: 0; width: 2px;
      border-radius: 2px; background: transparent; transition: background .15s ease;
    }
    #coding-agent-resize-handle:hover::after,
    #coding-agent-sidebar.is-resizing #coding-agent-resize-handle::after {
      background: rgba(16,163,127,.45);
    }
    #coding-agent-sidebar.is-fullscreen #coding-agent-resize-handle { display: none; }
    #coding-agent-topbar {
      flex: 0 0 auto; height: 52px; padding: 0 14px;
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      border-bottom: 1px solid var(--ai-border);
      background: rgba(255,255,255,.85); backdrop-filter: blur(10px); z-index: 2;
    }
    #coding-agent-sidebar.is-fullscreen #coding-agent-topbar {
      height: 44px; padding: 0 14px 0 16px; background: #fff; backdrop-filter: none;
      border-bottom: 0;
    }
    #coding-agent-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
    #coding-agent-brand-mark-main {
      width: var(--ai-nav-icon-size); height: var(--ai-nav-icon-size); border-radius: 8px;
      overflow: hidden; flex: 0 0 auto;
      background: transparent;
      display: grid; place-items: center;
    }
    #coding-agent-brand-mark-main svg {
      width: var(--ai-nav-icon-size); height: var(--ai-nav-icon-size); display: block;
    }
    #coding-agent-brand-text {
      display: flex; align-items: center; gap: 8px; min-width: 0;
    }
    /* Run-state pill (就绪 / Read / Thinking) hidden — crowded next to title. */
    .coding-agent-run-state { display: none !important; }
    /* Expanded fullscreen: logo in left nav. Collapsed / floating: logo beside title. */
    #coding-agent-brand-mark-main { display: none; }
    #coding-agent-sidebar:not(.is-fullscreen) #coding-agent-brand-mark-main { display: grid; }
    #coding-agent-brand strong {
      font-size: 15px; font-weight: 600; color: var(--ai-text);
      line-height: 1.2; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #coding-agent-sidebar.is-fullscreen #coding-agent-brand strong {
      font-size: 14px; font-weight: 600;
    }
    #coding-agent-top-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
    #coding-agent-user-chip {
      display: none; align-items: center; gap: 6px;
      max-width: 170px; padding: 0 2px 0 4px;
      color: var(--ai-muted, #6b6b6b); font: 12px/1.2 inherit;
    }
    #coding-agent-user-chip.is-on { display: inline-flex; }
    #coding-agent-user-name {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 90px;
    }
    #coding-agent-logout {
      border: 1px solid var(--ai-border); background: #fff; color: inherit;
      border-radius: 999px; height: var(--ai-nav-icon-size); padding: 0 10px;
      font: 12px/1 inherit; cursor: pointer; box-sizing: border-box;
      display: inline-flex; align-items: center; flex: 0 0 auto;
    }
    #coding-agent-logout:hover { background: var(--ai-surface); color: var(--ai-text); }
    #coding-agent-new-chat, #coding-agent-fullscreen {
      border: 1px solid var(--ai-border); background: #fff; color: var(--ai-text);
      border-radius: 999px; padding: 7px 12px; font: 12px/1.2 inherit; cursor: pointer;
    }
    #coding-agent-new-chat:hover, #coding-agent-fullscreen:hover { background: var(--ai-surface); }
    #coding-agent-fullscreen {
      width: 32px; height: 32px; padding: 0; display: grid; place-items: center; font-size: 16px;
    }
    #coding-agent-fullscreen .coding-agent-icon-expand,
    #coding-agent-fullscreen .coding-agent-icon-shrink {
      display: grid; place-items: center; width: 16px; height: 16px; color: #444;
    }
    #coding-agent-fullscreen svg {
      width: 16px; height: 16px; display: block;
    }
    #coding-agent-fullscreen .coding-agent-icon-shrink { display: none; }
    #coding-agent-sidebar.is-fullscreen #coding-agent-fullscreen .coding-agent-icon-expand { display: none; }
    #coding-agent-sidebar.is-fullscreen #coding-agent-fullscreen .coding-agent-icon-shrink { display: grid; }
    #coding-agent-trigger.is-hidden { display: none !important; }
    #coding-agent-stop {
      width: 32px; height: 32px; border-radius: 999px; border: 0; cursor: pointer;
      flex: 0 0 auto; display: none; place-items: center;
      background: #0d0d0d; color: #fff;
    }
    #coding-agent-stop.visible { display: grid; }
    #coding-agent-stop:hover { background: #2a2a2a; }
    #coding-agent-stop-square {
      width: 10px; height: 10px; border-radius: 2px; background: #fff;
    }
    #coding-agent-scroll-wrap {
      position: relative;
      flex: 1 1 auto; min-height: 0;
      display: flex; flex-direction: column; overflow: hidden;
    }
    #coding-agent-messages {
      flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 18px 16px 12px;
      background: var(--ai-bg); scroll-behavior: auto;
      -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
    }
    #coding-agent-sidebar.is-fullscreen #coding-agent-messages { padding: 24px 16px 12px; }
    #coding-agent-jump-bottom {
      position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%);
      z-index: 6; display: none; align-items: center; gap: 6px;
      border: 1px solid var(--ai-border); background: #fff; color: #333;
      border-radius: 999px; padding: 8px 14px; font: 13px/1 inherit; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,.08);
    }
    #coding-agent-jump-bottom.visible { display: inline-flex; }
    #coding-agent-jump-bottom:hover { background: #f7f7f8; }
    #coding-agent-thread { display: flex; flex-direction: column; gap: 18px; min-height: 0; }
    #coding-agent-sidebar.is-fullscreen #coding-agent-thread {
      width: min(var(--ai-content-width), 100%);
      margin: 0 auto;
      gap: 22px;
    }
    #coding-agent-empty {
      display: none;
      text-align: center;
      color: var(--ai-text);
    }
    #coding-agent-empty h1 {
      margin: 0 0 8px;
      font-size: 28px;
      font-weight: 600;
      letter-spacing: -.02em;
      text-align: center;
    }
    #coding-agent-empty p {
      margin: 0;
      color: var(--ai-muted);
      font-size: 15px;
      text-align: center;
    }
    /* Empty chat greeting — sidebar + fullscreen. */
    #coding-agent-sidebar.is-empty #coding-agent-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 160px;
      margin: 0;
      padding: 28px 12px 12px;
      text-align: center !important;
    }
    #coding-agent-sidebar.is-empty #coding-agent-empty h1,
    #coding-agent-sidebar.is-empty #coding-agent-empty p {
      width: 100%;
      text-align: center !important;
    }
    #coding-agent-sidebar.is-empty #coding-agent-jump-bottom {
      display: none !important;
    }
    /* Fullscreen landing: greeting + composer sit in the upper third so the
       workspace picker has room to open downward without clipping. */
    #coding-agent-sidebar.is-fullscreen.is-empty #coding-agent-scroll-wrap {
      flex: 0 0 auto;
      overflow: visible;
      margin-top: max(36px, 8vh);
      padding-top: 0;
    }
    #coding-agent-sidebar.is-fullscreen.is-empty #coding-agent-messages {
      flex: 0 0 auto;
      width: min(var(--ai-content-width), 100%);
      max-width: 100%;
      height: auto;
      overflow: visible;
      margin: 0 auto;
      padding: 0 16px;
      box-sizing: border-box;
    }
    #coding-agent-sidebar.is-fullscreen.is-empty #coding-agent-empty {
      min-height: 0;
      margin: 0 0 14px;
      padding: 0;
    }
    #coding-agent-sidebar.is-fullscreen.is-empty #coding-agent-footer {
      flex: 0 0 auto;
      margin-bottom: auto;
      padding: 0 16px max(20px, 4vh);
      background: transparent;
    }
    #coding-agent-sidebar.is-fullscreen.is-empty #coding-agent-composer-wrap {
      width: min(var(--ai-content-width), 100%);
      margin: 0 auto;
      overflow: visible;
    }
    #coding-agent-sidebar.is-fullscreen.is-empty #coding-agent-footer,
    #coding-agent-sidebar.is-fullscreen.is-empty #coding-agent-ctx-bar {
      overflow: visible;
    }
    #coding-agent-sidebar.is-fullscreen.is-empty #coding-agent-main,
    #coding-agent-sidebar.is-fullscreen.is-empty #coding-agent-workspace {
      overflow: visible;
    }
    .coding-agent-worklog { display: flex; flex-direction: column; gap: 2px; margin: 0 0 8px; }
    .coding-agent-worklog:empty { display: none; }
    .coding-agent-segment-text {
      margin: 0 0 12px; font-size: 15px; line-height: 1.7; color: var(--ai-text);
      word-break: break-word;
    }
    .coding-agent-segment-text:last-child { margin-bottom: 0; }
    .coding-agent-card {
      border: 0; border-radius: 8px; background: transparent; overflow: hidden;
    }
    .coding-agent-card-header {
      display: flex; align-items: center; gap: 6px; padding: 4px 6px;
      font-size: 13px; color: var(--ai-muted); background: transparent;
      border-radius: 8px; cursor: default; user-select: none;
    }
    .coding-agent-card.has-body .coding-agent-card-header { cursor: pointer; }
    .coding-agent-card.has-body .coding-agent-card-header:hover {
      background: rgba(0,0,0,.04); color: var(--ai-text);
    }
    .coding-agent-card-chevron {
      flex: 0 0 14px; width: 14px; text-align: center;
      font-size: 13px; line-height: 1; color: var(--ai-muted);
      transition: transform .15s ease; transform: rotate(0deg);
    }
    .coding-agent-card:not(.has-body) .coding-agent-card-chevron { visibility: hidden; }
    .coding-agent-card.is-expanded .coding-agent-card-chevron { transform: rotate(90deg); }
    .coding-agent-card-title {
      font-weight: 500; flex: 1 1 auto; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .coding-agent-card.is-live .coding-agent-card-title {
      position: relative;
      color: transparent;
      -webkit-text-fill-color: transparent;
      background: linear-gradient(
        90deg,
        #9a9a9a 0%,
        #9a9a9a 38%,
        #1a1a1a 50%,
        #9a9a9a 62%,
        #9a9a9a 100%
      );
      background-size: 200% 100%;
      -webkit-background-clip: text;
      background-clip: text;
      animation: coding-agent-live-shimmer 1.2s linear infinite;
    }
    @keyframes coding-agent-live-shimmer {
      0% { background-position: 100% 0; }
      100% { background-position: -100% 0; }
    }
    .coding-agent-card.is-live .coding-agent-card-header {
      color: var(--ai-text);
    }
    .coding-agent-card.kind-plan.is-live .coding-agent-card-header,
    .coding-agent-card.kind-explore.is-live .coding-agent-card-header {
      color: var(--ai-muted);
    }
    .coding-agent-card.is-explore-step .coding-agent-card-header {
      padding-left: 18px;
    }
    .coding-agent-card.is-explore-step .coding-agent-card-title {
      font-weight: 400;
    }
    .coding-agent-card-meta {
      font-size: 12px; color: var(--ai-muted); white-space: nowrap; flex: 0 0 auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .coding-agent-card-meta .add { color: #166534; font-weight: 600; }
    .coding-agent-card-meta .del { color: #991b1b; font-weight: 600; }
    .coding-agent-card-body {
      display: none; margin: 0 0 6px 20px; padding: 8px 10px;
      border-left: 2px solid var(--ai-border);
      color: var(--ai-muted); font-size: 12.5px; white-space: pre-wrap;
      word-break: break-word; background: transparent;
      max-height: 240px; overflow-y: auto;
    }
    .coding-agent-card.is-expanded .coding-agent-card-body,
    .coding-agent-card.is-live.has-body .coding-agent-card-body { display: block; }
    .coding-agent-card.is-live:not(.has-body) .coding-agent-card-body { display: none; }
    .coding-agent-card.is-live .coding-agent-card-body {
      max-height: 320px;
      color: var(--ai-text);
    }
    .coding-agent-card.kind-run .coding-agent-card-body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }
    .coding-agent-paths { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .coding-agent-path {
      display: inline-flex; align-items: center; max-width: 100%;
      padding: 3px 8px; border-radius: 999px;
      background: #f4f4f4; border: 1px solid var(--ai-border); color: #333;
      font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .coding-agent-diff {
      margin-top: 8px; border: 1px solid var(--ai-border);
      border-radius: 10px; overflow: hidden; background: #fafafa;
    }
    .coding-agent-diff + .coding-agent-diff { margin-top: 8px; }
    .coding-agent-diff-path {
      padding: 7px 10px; background: #eee; color: #111;
      font: 650 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .coding-agent-diff-line {
      display: block; padding: 1px 12px;
      font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: pre-wrap; word-break: break-word;
    }
    .coding-agent-diff-line.added { background: rgba(22, 101, 52, .06); color: #166534; }
    .coding-agent-diff-line.removed { background: rgba(153, 27, 27, .06); color: #991b1b; }
    /* Codex-like turn change review */
    .coding-agent-turn-changes {
      margin: 12px 0 2px;
      border: 1px solid rgba(0,0,0,.08);
      border-radius: 10px;
      background: #fff;
      overflow: hidden;
    }
    .coding-agent-turn-changes.is-undone { opacity: .72; }
    .coding-agent-turn-changes-header {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      padding: 8px 12px; cursor: pointer; user-select: none;
      background: #fafafa;
      border-bottom: 1px solid rgba(0,0,0,.06);
    }
    .coding-agent-turn-changes-header:hover { background: #f5f5f5; }
    .coding-agent-turn-changes-chevron {
      width: 0; height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 5px solid #8e8e8e;
      transition: transform .12s ease;
      flex: 0 0 auto;
    }
    .coding-agent-turn-changes:not(.is-open) .coding-agent-turn-changes-chevron {
      transform: rotate(-90deg);
    }
    .coding-agent-turn-changes-title {
      font: 600 13px/1.3 inherit; color: var(--ai-text);
    }
    .coding-agent-turn-changes-stats {
      font: 12px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--ai-muted);
    }
    .coding-agent-turn-changes-stats .add,
    .coding-agent-turn-file-meta .add { color: #166534; font-weight: 600; }
    .coding-agent-turn-changes-stats .del,
    .coding-agent-turn-file-meta .del { color: #991b1b; font-weight: 600; }
    .coding-agent-turn-changes-actions { margin-left: auto; display: flex; gap: 6px; }
    .coding-agent-turn-undo {
      border: 1px solid rgba(0,0,0,.1); background: #fff; color: var(--ai-text);
      border-radius: 999px; padding: 3px 10px; font: 12px/1.2 inherit; cursor: pointer;
    }
    .coding-agent-turn-undo:hover { background: #f4f4f4; }
    .coding-agent-turn-undo:disabled { opacity: .5; cursor: default; }
    .coding-agent-turn-undo.is-done { color: #166534; border-color: #bbf7d0; background: #ecfdf5; }
    .coding-agent-turn-file-undo { padding: 2px 8px; font-size: 11px; }
    .coding-agent-turn-changes-body { display: none; }
    .coding-agent-turn-changes.is-open .coding-agent-turn-changes-body { display: block; }
    .coding-agent-turn-file {
      border-top: 1px solid rgba(0,0,0,.06);
    }
    .coding-agent-turn-file:first-child { border-top: 0; }
    .coding-agent-turn-file.is-undone { opacity: .55; }
    .coding-agent-turn-file-head {
      display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
      padding: 10px 12px 6px;
    }
    .coding-agent-turn-file-path {
      font: 600 13px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: #111;
    }
    .coding-agent-turn-file-meta {
      font: 12px/1.35 inherit; color: var(--ai-muted);
    }
    .coding-agent-turn-file-actions { margin-left: auto; }
    .coding-agent-turn-file-status { font-weight: 600; }
    .coding-agent-turn-file.status-deleted .coding-agent-turn-file-status { color: #991b1b; }
    .coding-agent-turn-file.status-created .coding-agent-turn-file-status { color: #166534; }
    .coding-agent-turn-file.status-modified .coding-agent-turn-file-status { color: #a16207; }
    .coding-agent-turn-file .coding-agent-diff {
      margin: 0; border: 0; border-radius: 0; background: transparent;
    }
    .coding-agent-turn-file .coding-agent-diff-path { display: none; }
    .coding-agent-msg { display: flex; gap: 12px; align-items: flex-start; width: 100%; }
    .coding-agent-msg.user { justify-content: flex-end; }
    .coding-agent-msg.agent { justify-content: flex-start; }
    .coding-agent-msg.user .coding-agent-msg-main {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .coding-agent-user-actions {
      display: flex;
      justify-content: flex-end;
      gap: 2px;
      margin-top: 3px;
      opacity: 0;
      transition: opacity .12s ease;
    }
    .coding-agent-user-action {
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--ai-muted);
      cursor: pointer;
      display: grid;
      place-items: center;
      padding: 0;
      transition: background .12s ease, color .12s ease;
    }
    .coding-agent-user-action svg { width: 15px; height: 15px; display: block; }
    .coding-agent-msg.user:hover .coding-agent-user-actions,
    .coding-agent-msg.user:focus-within .coding-agent-user-actions,
    .coding-agent-msg.user.is-editing .coding-agent-user-actions {
      opacity: 1;
    }
    .coding-agent-msg.user.is-editing .coding-agent-user-action.is-edit {
      background: rgba(0,0,0,.06);
      color: var(--ai-text);
    }
    .coding-agent-edit-textarea {
      display: block;
      width: 100%;
      min-width: 160px;
      max-width: 100%;
      resize: none;
      overflow: hidden;
      box-sizing: border-box;
      background: transparent;
      border: 0;
      border-radius: 0;
      padding: 2px 2px 0;
      font: inherit;
      color: var(--ai-text);
      line-height: 1.45;
      outline: none;
    }
    .coding-agent-edit-shell {
      width: 100%;
      box-sizing: border-box;
      background: #fff;
      border: 0;
      border-radius: 16px;
      box-shadow: var(--ai-composer-shadow);
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow: visible;
    }
    .coding-agent-edit-shell.mode-plan {
      box-shadow: 0 0 0 1px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.04);
    }
    .coding-agent-edit-attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .coding-agent-edit-attachments:empty { display: none; }
    .coding-agent-edit-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .coding-agent-edit-toolbar-left,
    .coding-agent-edit-toolbar-right {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .coding-agent-edit-mode {
      appearance: none;
      -webkit-appearance: none;
      border: 0;
      outline: none;
      background: #f4f4f4 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b6b6b' d='M3 4.5L6 8l3-3.5'/%3E%3C/svg%3E") right 8px center no-repeat;
      border-radius: 999px;
      padding: 5px 20px 5px 10px;
      max-width: 82px;
      font: 12px/1.2 inherit;
      color: var(--ai-muted);
      cursor: pointer;
    }
    .coding-agent-edit-mode:hover { color: var(--ai-text); }
    .coding-agent-edit-model-wrap {
      position: relative;
      flex: 0 0 auto;
      min-width: 0;
      z-index: 5;
    }
    .coding-agent-edit-model-wrap .coding-agent-model-btn {
      appearance: none;
      border: 0;
      outline: none;
      background: transparent;
      padding: 2px 4px 2px 8px;
      font: 500 12px/1.2 inherit;
      color: var(--ai-text);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      max-width: min(280px, 48vw);
      border-radius: 6px;
    }
    .coding-agent-edit-model-wrap .coding-agent-model-btn:hover { background: rgba(0,0,0,.04); }
    .coding-agent-edit-model-wrap .coding-agent-model-btn.is-open { background: rgba(0,0,0,.06); }
    .coding-agent-edit-model-wrap .coding-agent-model-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }
    .coding-agent-edit-model-wrap .coding-agent-model-chevron {
      flex: 0 0 auto;
      width: 12px;
      height: 12px;
      opacity: .55;
      background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b6b6b' d='M3 4.5L6 8l3-3.5'/%3E%3C/svg%3E") center / 12px no-repeat;
    }
    .coding-agent-edit-model-wrap .coding-agent-model-menu {
      display: none;
      position: absolute;
      left: 0;
      top: calc(100% + 8px);
      bottom: auto;
      z-index: 50;
      width: max-content;
      min-width: 168px;
      max-width: min(200px, calc(100vw - 24px));
      border: 1px solid var(--ai-border);
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 12px 32px rgba(0,0,0,.12);
      padding: 8px;
      overflow: hidden;
    }
    .coding-agent-edit-model-wrap.is-open .coding-agent-model-menu { display: block; }
    .coding-agent-edit-model-wrap .coding-agent-model-auto-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 10px;
      border-radius: 8px;
    }
    .coding-agent-edit-model-wrap .coding-agent-model-auto-row:hover { background: #f7f7f7; }
    .coding-agent-edit-model-wrap .coding-agent-model-auto-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .coding-agent-edit-model-wrap .coding-agent-model-auto-copy strong {
      font-size: 13px;
      font-weight: 600;
      color: var(--ai-text);
    }
    .coding-agent-edit-model-wrap .coding-agent-model-auto-copy span {
      font-size: 11px;
      color: var(--ai-muted);
      line-height: 1.35;
    }
    .coding-agent-edit-model-wrap .coding-agent-model-auto {
      appearance: none;
      flex: 0 0 auto;
      width: 36px;
      height: 20px;
      border: 0;
      border-radius: 999px;
      background: #d4d4d4;
      position: relative;
      cursor: pointer;
      transition: background .15s ease;
    }
    .coding-agent-edit-model-wrap .coding-agent-model-auto::after {
      content: "";
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0,0,0,.18);
      transition: transform .15s ease;
    }
    .coding-agent-edit-model-wrap .coding-agent-model-auto[aria-checked="true"] { background: #0d0d0d; }
    .coding-agent-edit-model-wrap .coding-agent-model-auto[aria-checked="true"]::after { transform: translateX(16px); }
    .coding-agent-edit-model-wrap .coding-agent-model-list {
      display: none;
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px solid var(--ai-border);
      max-height: 280px;
      overflow-y: auto;
    }
    .coding-agent-edit-model-wrap:not(.is-auto) .coding-agent-model-list { display: block; }
    .coding-agent-edit-file-input { display: none; }
    .coding-agent-edit-pick,
    .coding-agent-edit-send {
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 999px;
      cursor: pointer;
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      padding: 0;
    }
    .coding-agent-edit-pick {
      background: transparent;
      color: #555;
      font-size: 16px;
    }
    .coding-agent-edit-pick:hover { background: #f3f3f3; }
    .coding-agent-edit-send {
      background: #0d0d0d;
      color: #fff;
    }
    .coding-agent-edit-send:hover { background: #2a2a2a; }
    .coding-agent-edit-send svg { width: 14px; height: 14px; display: block; }
    .coding-agent-msg.user.is-editing .body,
    .coding-agent-msg.user.is-editing .coding-agent-user-actions { display: none !important; }
    /* Edit composer: same full width as #coding-agent-compose-shell (not 88% bubble). */
    .coding-agent-msg.user.is-editing {
      width: 100%;
      justify-content: stretch;
    }
    .coding-agent-msg.user.is-editing .coding-agent-msg-main {
      max-width: 100%;
      width: 100%;
      align-items: stretch;
    }
    .coding-agent-msg.user .body { cursor: text; }
    .coding-agent-user-action:hover {
      background: rgba(0,0,0,.05);
      color: var(--ai-text);
    }
    @media (hover: none) {
      .coding-agent-user-actions { opacity: 1; }
    }
    .coding-agent-avatar {
      width: 28px; height: 28px; border-radius: 999px; flex: 0 0 auto; margin-top: 2px;
      display: grid; place-items: center; font: 700 11px/1 -apple-system, sans-serif; color: #fff;
    }
    .coding-agent-msg.agent .coding-agent-avatar { background: #10a37f; }
    .coding-agent-msg.user .coding-agent-avatar { display: none; }
    .coding-agent-msg-main { min-width: 0; max-width: 100%; }
    .coding-agent-msg.user .coding-agent-msg-main { max-width: 88%; }
    .coding-agent-msg .body {
      white-space: pre-wrap; word-break: break-word;
      font: inherit; color: var(--ai-text);
      background: transparent; border: 0; border-radius: 0;
      padding: 2px 0; line-height: 1.7;
      -webkit-user-select: text; user-select: text;
    }
    .coding-agent-msg.agent .body {
      white-space: normal;
    }
    .coding-agent-msg.user .body {
      background: var(--ai-user-bg); border-radius: 22px; padding: 10px 16px;
    }
    .coding-agent-msg.agent .body { padding-top: 4px; }
    .coding-agent-msg.system .body {
      background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412;
      border-radius: 14px; padding: 10px 14px;
    }
    .coding-agent-msg .body > :first-child { margin-top: 0; }
    .coding-agent-msg .body > :last-child { margin-bottom: 0; }
    .coding-agent-msg .body p,
    .coding-agent-msg .body ul,
    .coding-agent-msg .body ol,
    .coding-agent-msg .body .coding-agent-codeblock,
    .coding-agent-msg .body blockquote,
    .coding-agent-msg .body h1,
    .coding-agent-msg .body h2,
    .coding-agent-msg .body h3,
    .coding-agent-msg .body h4 { margin: 0 0 12px; }
    .coding-agent-msg .body ul,
    .coding-agent-msg .body ol { padding-left: 22px; }
    .coding-agent-msg .body li + li { margin-top: 4px; }
    .coding-agent-msg .body li input[type="checkbox"] {
      margin-right: 6px; vertical-align: middle; pointer-events: none;
    }
    .coding-agent-msg .body h1,
    .coding-agent-msg .body h2,
    .coding-agent-msg .body h3,
    .coding-agent-msg .body h4 { line-height: 1.35; font-weight: 650; }
    .coding-agent-msg .body h1 { font-size: 22px; }
    .coding-agent-msg .body h2 { font-size: 19px; }
    .coding-agent-msg .body h3 { font-size: 17px; }
    .coding-agent-msg .body h4 { font-size: 15px; }
    .coding-agent-msg .body strong { font-weight: 650; }
    .coding-agent-msg .body em { font-style: italic; }
    .coding-agent-msg .body del { text-decoration: line-through; color: var(--ai-muted); }
    /* Beat host CSS (e.g. layui a{color:#333}) so links stay visibly blue. */
    #coding-agent-sidebar .coding-agent-msg a,
    #coding-agent-sidebar .coding-agent-msg .body a,
    #coding-agent-sidebar .coding-agent-segment-text a {
      color: #2563eb !important;
      text-decoration: underline !important;
      text-underline-offset: 2px;
      word-break: break-word;
      cursor: pointer;
    }
    #coding-agent-sidebar .coding-agent-msg a:visited,
    #coding-agent-sidebar .coding-agent-msg .body a:visited,
    #coding-agent-sidebar .coding-agent-segment-text a:visited {
      color: #2563eb !important;
    }
    #coding-agent-sidebar .coding-agent-msg a:hover,
    #coding-agent-sidebar .coding-agent-msg .body a:hover,
    #coding-agent-sidebar .coding-agent-segment-text a:hover {
      color: #1d4ed8 !important;
    }
    .coding-agent-msg .body hr {
      border: 0; border-top: 1px solid var(--ai-border); margin: 12px 0;
    }
    .coding-agent-msg .body .katex-display {
      margin: 10px 0; overflow-x: auto; overflow-y: hidden;
      padding: 2px 0;
    }
    .coding-agent-msg .body .coding-agent-math {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.92em; color: var(--ai-muted);
      white-space: pre-wrap;
    }
    .coding-agent-msg .body .coding-agent-math.is-display {
      display: block;
      margin: 10px 0;
      overflow-x: auto;
      text-align: center;
    }
    .coding-agent-msg .body .md-table-fallback {
      margin: 0 0 12px;
      padding: 10px 12px;
      border-radius: 10px;
      background: #f7f7f8;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: pre-wrap;
      overflow-x: auto;
    }
    .coding-agent-msg .body .md-table-wrap {
      overflow-x: auto;
      margin: 0 0 12px;
      -webkit-overflow-scrolling: touch;
      max-width: 100%;
    }
    .coding-agent-msg .body table {
      /* Grow with columns; wrap scrolls horizontally — don't squeeze cells. */
      width: max-content;
      min-width: 100%;
      border-collapse: collapse;
      margin: 0 0 12px;
      font-size: 13px;
      line-height: 1.4;
      table-layout: auto;
    }
    .coding-agent-msg .body .md-table-wrap table { margin: 0; }
    .coding-agent-msg .body th,
    .coding-agent-msg .body td {
      border: 1px solid var(--ai-border);
      padding: 7px 10px;
      text-align: left;
      vertical-align: middle;
      /* Override .body word-break so "15,481" / "click" / "4.62%" stay on one line. */
      white-space: nowrap;
      word-break: normal;
      overflow-wrap: normal;
    }
    .coding-agent-msg .body th { background: var(--ai-surface); font-weight: 600; }
    .coding-agent-msg .body tr:nth-child(even) td { background: #fafafa; }
    .coding-agent-msg .body code {
      padding: 2px 6px; border-radius: 6px; background: rgba(0,0,0,.06);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .92em;
    }
    .coding-agent-codeblock {
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      overflow: hidden;
      background: #0d0d0d;
      -webkit-user-select: text;
      user-select: text;
    }
    .coding-agent-codeblock-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 12px;
      background: #1a1a1a;
      border-bottom: 1px solid #2a2a2a;
      -webkit-user-select: none;
      user-select: none;
    }
    .coding-agent-codeblock-lang {
      color: #b4b4b4;
      font: 500 12px/1.2 ui-sans-serif, system-ui, sans-serif;
      text-transform: lowercase;
    }
    .coding-agent-codeblock-copy {
      appearance: none;
      border: 0;
      background: transparent;
      color: #d4d4d4;
      font: 500 12px/1.2 ui-sans-serif, system-ui, sans-serif;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
    }
    .coding-agent-codeblock-copy:hover { background: rgba(255,255,255,.08); color: #fff; }
    .coding-agent-codeblock-copy.is-copied { color: #86efac; }
    .coding-agent-msg .body .coding-agent-codeblock pre {
      margin: 0;
      padding: 14px 16px;
      border-radius: 0;
      overflow: auto;
      max-height: min(70vh, 560px);
      background: #0d0d0d;
      color: #e8eaed;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
      line-height: 1.55;
      white-space: pre;
      -webkit-user-select: text;
      user-select: text;
      cursor: text;
    }
    .coding-agent-msg .body .coding-agent-codeblock pre code {
      background: transparent;
      padding: 0;
      color: inherit;
      display: block;
      white-space: inherit;
      -webkit-user-select: text;
      user-select: text;
    }
    .coding-agent-msg .body pre .tok-kw { color: #c792ea; }
    .coding-agent-msg .body pre .tok-type { color: #ffcb6b; }
    .coding-agent-msg .body pre .tok-fn { color: #82aaff; }
    .coding-agent-msg .body pre .tok-str { color: #c3e88d; }
    .coding-agent-msg .body pre .tok-cmt { color: #6a7386; font-style: italic; }
    .coding-agent-msg .body pre .tok-num { color: #f78c6c; }
    .coding-agent-msg .body pre .tok-pp { color: #89ddff; }
    .coding-agent-msg .body pre .tok-op { color: #89ddff; }
    .coding-agent-msg .body pre .tok-punct { color: #a6accd; }
    .coding-agent-msg .body blockquote {
      padding-left: 12px; border-left: 3px solid rgba(0,0,0,.15); color: var(--ai-muted);
    }
    .coding-agent-msg-images {
      display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; justify-content: flex-end;
    }
    .coding-agent-msg.agent .coding-agent-msg-images { justify-content: flex-start; }
    .coding-agent-msg-images img {
      width: 96px; height: 96px; object-fit: cover;
      border-radius: 14px; border: 1px solid var(--ai-border); background: #fff;
    }
    .coding-agent-msg-files {
      display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; justify-content: flex-end;
    }
    .coding-agent-msg.agent .coding-agent-msg-files { justify-content: flex-start; }
    .coding-agent-file-chip {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 5px 10px 5px 6px; border-radius: 10px; border: 1px solid var(--ai-border);
      background: #fff; color: #333; font-size: 12px; max-width: 240px;
    }
    .coding-agent-file-chip .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .coding-agent-file-icon {
      min-width: 22px; height: 22px; padding: 0 6px; border-radius: 5px; flex: 0 0 auto;
      display: grid; place-items: center;
      font: 700 9px/1 system-ui, -apple-system, sans-serif; color: #fff;
      letter-spacing: -0.01em; white-space: nowrap;
    }
    #coding-agent-footer {
      flex: 0 0 auto; padding: 8px 14px 16px;
      background: linear-gradient(180deg, rgba(255,255,255,0), #fff 28%);
      display: flex; flex-direction: column; gap: 8px;
    }
    #coding-agent-sidebar.is-fullscreen #coding-agent-footer { padding: 8px 16px 18px; }
    #coding-agent-composer-wrap {
      width: 100%;
      display: flex; flex-direction: column; gap: 8px;
    }
    #coding-agent-sidebar.is-fullscreen #coding-agent-composer-wrap {
      width: min(var(--ai-content-width), 100%);
      margin: 0 auto;
    }
    #coding-agent-queue {
      display: none;
      flex-direction: column;
      border-radius: 12px;
      background: var(--ai-surface);
      color: var(--ai-text);
      border: 1px solid var(--ai-border);
      overflow: hidden;
      font-size: 13px;
    }
    #coding-agent-queue.has-items { display: flex; }
    .coding-agent-queue-toggle {
      display: flex; align-items: center; gap: 8px;
      width: 100%; border: 0; background: transparent; color: var(--ai-muted);
      padding: 10px 12px; cursor: pointer; font: inherit; text-align: left;
    }
    .coding-agent-queue-toggle:hover { color: var(--ai-text); }
    .coding-agent-queue-chevron {
      width: 10px; height: 10px; flex: 0 0 10px;
      border-right: 1.5px solid currentColor;
      border-bottom: 1.5px solid currentColor;
      transform: rotate(45deg) translate(-1px, -1px);
      transition: transform .15s ease;
    }
    #coding-agent-queue.is-collapsed .coding-agent-queue-chevron {
      transform: rotate(-45deg) translate(-1px, 1px);
    }
    .coding-agent-queue-count { font-weight: 500; color: var(--ai-text); }
    .coding-agent-queue-list {
      display: flex; flex-direction: column;
      border-top: 1px solid var(--ai-border);
    }
    #coding-agent-queue.is-collapsed .coding-agent-queue-list { display: none; }
    .coding-agent-queue-item {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 10px 8px 12px; min-height: 36px;
    }
    .coding-agent-queue-item + .coding-agent-queue-item {
      border-top: 1px solid var(--ai-border);
    }
    .coding-agent-queue-dot {
      flex: 0 0 8px; width: 8px; height: 8px;
      border: 1.5px solid var(--ai-muted); border-radius: 50%;
    }
    .coding-agent-queue-text {
      flex: 1 1 auto; min-width: 0; border: 0; background: transparent;
      color: var(--ai-text); font: inherit; text-align: left; cursor: pointer;
      padding: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .coding-agent-queue-text:hover { color: #111; }
    .coding-agent-queue-actions {
      display: flex; align-items: center; gap: 2px; flex: 0 0 auto;
    }
    .coding-agent-queue-actions button {
      width: 26px; height: 26px; border: 0; border-radius: 6px;
      background: transparent; color: var(--ai-muted); cursor: pointer;
      display: grid; place-items: center; padding: 0;
    }
    .coding-agent-queue-actions button svg {
      width: 14px; height: 14px; display: block;
    }
    .coding-agent-queue-actions button:hover {
      background: rgba(0,0,0,.05); color: var(--ai-text);
    }
    .coding-agent-queue-actions button.delete:hover { color: #b91c1c; }
    #coding-agent-compose-shell {
      position: relative;
      border-radius: 16px;
      background: #fff;
      box-shadow: var(--ai-composer-shadow);
      padding: 10px 12px 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    #coding-agent-compose-shell.mode-plan {
      box-shadow: 0 0 0 1px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.04);
      background: #fff;
    }
    #coding-agent-mode-wrap {
      position: relative;
      flex: 0 0 auto;
    }
    #coding-agent-think-wrap {
      display: none;
      align-items: center;
      gap: 6px;
      flex: 0 0 auto;
    }
    #coding-agent-think-wrap.is-visible { display: inline-flex; }
    .coding-agent-pill {
      appearance: none;
      border: 0;
      background: #f4f4f4;
      border-radius: 999px;
      padding: 5px 10px;
      font: 12px/1.2 inherit;
      color: var(--ai-muted);
      cursor: pointer;
      line-height: 1.2;
    }
    .coding-agent-pill:hover { color: var(--ai-text); }
    .coding-agent-pill.is-on {
      color: var(--ai-text);
      font-weight: 600;
      background: #ebebeb;
    }
    .coding-agent-pill.is-select {
      padding-right: 20px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b6b6b' d='M3 4.5L6 8l3-3.5'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
    }
    #coding-agent-attachments { display: flex; flex-wrap: wrap; gap: 8px; }
    #coding-agent-attachments:empty { display: none; }
    .coding-agent-thumb { position: relative; width: 56px; height: 56px; }
    .coding-agent-thumb img {
      width: 100%; height: 100%; object-fit: cover;
      border-radius: 10px; border: 1px solid var(--ai-border); background: #fff;
    }
    .coding-agent-thumb.file {
      display: inline-flex; align-items: center; gap: 8px;
      width: auto; min-width: 110px; height: auto;
      padding: 8px 26px 8px 8px; border: 1px solid var(--ai-border);
      border-radius: 10px; background: #fafafa; color: #333; font-size: 12px;
    }
    .coding-agent-thumb.file .meta { min-width: 0; }
    .coding-agent-thumb.file .name {
      display: block; max-width: 150px; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; font-weight: 650;
    }
    .coding-agent-thumb.file .kind { display: none; }
    .coding-agent-thumb button {
      position: absolute; top: -6px; right: -6px;
      width: 20px; height: 20px; border: 0; border-radius: 50%;
      background: #111; color: #fff; cursor: pointer;
      font: 700 12px/1 system-ui, sans-serif;
    }
    #coding-agent-input {
      width: 100%; border: 0; outline: none; background: transparent; resize: none;
      min-height: 24px; max-height: 140px;
      padding: 2px 2px 0; font: inherit; line-height: 1.45; color: var(--ai-text);
    }
    #coding-agent-input::placeholder { color: #8e8e8e; }
    #coding-agent-slash-menu {
      display: none;
      position: absolute;
      left: 10px; right: 10px;
      bottom: calc(100% + 6px);
      z-index: 45;
      max-height: 220px;
      overflow-y: auto;
      border: 1px solid var(--ai-border);
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 12px 32px rgba(0,0,0,.12);
      padding: 6px;
    }
    #coding-agent-slash-menu.is-open { display: block; }
    .coding-agent-slash-item {
      display: flex; flex-direction: column; gap: 2px;
      width: 100%; border: 0; background: transparent; text-align: left;
      padding: 8px 10px; border-radius: 8px; cursor: pointer;
      font: inherit; color: var(--ai-text);
    }
    .coding-agent-slash-item:hover,
    .coding-agent-slash-item.is-active { background: #f4f4f4; }
    .coding-agent-slash-item .name {
      font: 600 13px/1.3 inherit;
    }
    .coding-agent-slash-item .name::before { content: "/"; color: var(--ai-muted); font-weight: 500; }
    .coding-agent-slash-item .desc {
      font: 12px/1.35 inherit; color: var(--ai-muted);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .coding-agent-slash-empty {
      padding: 10px; font: 12px/1.4 inherit; color: var(--ai-muted);
    }
    #coding-agent-compose-toolbar {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    #coding-agent-compose-left, #coding-agent-compose-right {
      display: flex; align-items: center; gap: 6px; min-width: 0;
    }
    #coding-agent-mode {
      max-width: 82px;
    }
    #coding-agent-model-wrap {
      position: relative;
      flex: 0 0 auto;
      min-width: 0;
    }
    #coding-agent-model-btn {
      appearance: none;
      border: 0;
      background: transparent;
      padding: 2px 4px 2px 8px;
      font: 12px/1.2 inherit;
      color: var(--ai-text);
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      max-width: min(280px, 48vw);
      border-radius: 6px;
    }
    #coding-agent-model-btn:hover { background: rgba(0,0,0,.04); }
    #coding-agent-model-btn.is-open { background: rgba(0,0,0,.06); }
    #coding-agent-model-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }
    #coding-agent-model-chevron {
      flex: 0 0 auto;
      width: 12px;
      height: 12px;
      opacity: .55;
      background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b6b6b' d='M3 4.5L6 8l3-3.5'/%3E%3C/svg%3E") center / 12px no-repeat;
    }
    #coding-agent-model-menu {
      display: none;
      position: absolute;
      left: 0;
      bottom: calc(100% + 8px);
      z-index: 40;
      width: max-content;
      min-width: 168px;
      max-width: min(200px, calc(100vw - 24px));
      border: 1px solid var(--ai-border);
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 12px 32px rgba(0,0,0,.12);
      padding: 8px;
      overflow: hidden;
    }
    #coding-agent-model-wrap.is-open #coding-agent-model-menu { display: block; }
    #coding-agent-model-auto-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 10px;
      border-radius: 8px;
    }
    #coding-agent-model-auto-row:hover { background: #f7f7f7; }
    #coding-agent-model-auto-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    #coding-agent-model-auto-copy strong {
      font-size: 13px;
      font-weight: 600;
      color: var(--ai-text);
    }
    #coding-agent-model-auto-copy span {
      font-size: 11px;
      color: var(--ai-muted);
      line-height: 1.35;
    }
    #coding-agent-model-auto-resolved {
      font-size: 11px;
      color: #10a37f;
      line-height: 1.35;
      margin-top: 2px;
    }
    #coding-agent-model-auto-resolved:empty { display: none; }
    #coding-agent-model-auto {
      appearance: none;
      flex: 0 0 auto;
      width: 36px;
      height: 20px;
      border: 0;
      border-radius: 999px;
      background: #d4d4d4;
      position: relative;
      cursor: pointer;
      transition: background .15s ease;
    }
    #coding-agent-model-auto::after {
      content: "";
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0,0,0,.18);
      transition: transform .15s ease;
    }
    #coding-agent-model-auto[aria-checked="true"] { background: #0d0d0d; }
    #coding-agent-model-auto[aria-checked="true"]::after { transform: translateX(16px); }
    #coding-agent-model-list {
      display: none;
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px solid var(--ai-border);
      max-height: 280px;
      overflow-y: auto;
    }
    #coding-agent-model-wrap:not(.is-auto) #coding-agent-model-list { display: block; }
    .coding-agent-model-option {
      display: flex;
      align-items: center;
      width: 100%;
      border: 0;
      background: transparent;
      text-align: left;
      padding: 8px 10px;
      border-radius: 8px;
      font: 13px/1.3 inherit;
      color: var(--ai-text);
      cursor: pointer;
    }
    .coding-agent-model-option:hover { background: #f4f4f4; }
    .coding-agent-model-option.is-selected {
      background: #f0f0f0;
      font-weight: 600;
    }
    #coding-agent-model { display: none; }
    #coding-agent-file-input { display: none; }
    #coding-agent-pick-file, #coding-agent-send {
      width: 32px; height: 32px; border-radius: 999px; border: 0; cursor: pointer;
      flex: 0 0 auto; display: grid; place-items: center;
    }
    #coding-agent-pick-file { background: transparent; color: #555; font-size: 16px; }
    #coding-agent-pick-file:hover { background: #f3f3f3; }
    #coding-agent-send { background: #0d0d0d; color: #fff; font-size: 15px; }
    #coding-agent-send:hover { background: #2a2a2a; }
    #coding-agent-send.is-queue { font-size: 11px; font-weight: 700; }
    #coding-agent-send.hidden { display: none; }
    body.coding-agent-page-locked { overflow: hidden !important; }
  `;

  var styleEl = document.createElement("style");
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  var container = document.createElement("div");
  container.innerHTML = `
    <div id="coding-agent-backdrop"></div>
    <div id="coding-agent-trigger" title="${providerUi.name}">${providerUi.markHtml}</div>
    <div id="coding-agent-sidebar">
      <div id="coding-agent-resize-handle" title="拖动调整宽度" aria-hidden="true"></div>
      <div id="coding-agent-workspace">
      <button id="coding-agent-toggle-ide" type="button" title="切换编辑器" aria-label="切换编辑器" aria-pressed="false">
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1.5" y="2" width="13" height="12" rx="1.2" stroke="currentColor" stroke-width="1.2"/>
          <path d="M10.5 2.5v11" stroke="currentColor" stroke-width="1.2"/>
          <rect x="10.5" y="2.5" width="4" height="11" fill="currentColor" opacity=".22"/>
        </svg>
      </button>
      <div id="coding-agent-nav-shell">
      <div id="coding-agent-nav-pins">
        <button type="button" id="coding-agent-nav-rail-brand" title="展开边栏 (Ctrl+B)" aria-label="展开边栏">
          ${providerUi.markHtml}
        </button>
        <button type="button" id="coding-agent-nav-rail-avatar" title="账户" aria-label="账户">A</button>
      </div>
      <aside id="coding-agent-nav-rail" aria-label="收起的边栏">
        <div id="coding-agent-nav-rail-top">
          <button type="button" id="coding-agent-nav-rail-new" class="coding-agent-nav-rail-btn" title="新建 Agent" aria-label="新建 Agent">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
            </svg>
          </button>
          <button type="button" id="coding-agent-nav-rail-chats" class="coding-agent-nav-rail-btn" title="最近聊天" aria-label="最近聊天" aria-expanded="false" aria-haspopup="dialog">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
        </div>
        <div id="coding-agent-nav-rail-spacer" aria-hidden="true"></div>
        <div id="coding-agent-nav-rail-bottom" aria-hidden="true"></div>
      </aside>
      <div id="coding-agent-nav-rail-flyout" role="dialog" aria-label="最近聊天">
        <div id="coding-agent-nav-rail-flyout-title">最近聊天</div>
        <div id="coding-agent-nav-rail-flyout-list"></div>
        <div id="coding-agent-nav-rail-flyout-empty" hidden></div>
      </div>
      <aside id="coding-agent-nav" aria-label="历史对话">
        <div id="coding-agent-nav-resize" title="拖动调整宽度" aria-hidden="true"></div>
        <div id="coding-agent-nav-head">
          <div id="coding-agent-nav-brand">
            <span class="coding-agent-nav-pin-slot" aria-hidden="true"></span>
            <span id="coding-agent-run-state" class="coding-agent-run-state">就绪</span>
          </div>
          <button id="coding-agent-toggle-nav" type="button" title="收起边栏 (Ctrl+B)" aria-label="收起边栏" aria-pressed="true">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1.5" y="2" width="13" height="12" rx="1.2" stroke="currentColor" stroke-width="1.2"/>
              <path d="M5.5 2.5v11" stroke="currentColor" stroke-width="1.2"/>
              <rect x="1.5" y="2.5" width="4" height="11" fill="currentColor" opacity=".22"/>
            </svg>
          </button>
        </div>
        <div id="coding-agent-nav-top">
          <button id="coding-agent-nav-new" type="button" title="新建 Agent">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 5v14"></path><path d="M5 12h14"></path>
            </svg>
            <span>新建 Agent</span>
          </button>
        </div>
        <div id="coding-agent-nav-scroll">
          <div id="coding-agent-nav-label-row">
            <button type="button" id="coding-agent-nav-label" title="折叠仓库列表" aria-expanded="true">
              <span class="coding-agent-nav-label-chevron" aria-hidden="true"></span>
              <span>仓库</span>
            </button>
            <div id="coding-agent-nav-label-actions">
              <button type="button" id="coding-agent-nav-filter" class="coding-agent-nav-mini-btn" title="隐藏空仓库" aria-label="隐藏空仓库" aria-pressed="false">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
                  <path d="M2.5 3.5h11l-4 5v3.5l-3 1.5v-5z"/>
                </svg>
              </button>
              <button type="button" id="coding-agent-nav-add-repo" class="coding-agent-nav-mini-btn" title="添加仓库" aria-label="添加仓库">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M2.5 4.5h4l1.2 1.3H13.5v6.7H2.5z"/>
                  <path d="M8 8v4"/><path d="M6 10h4"/>
                </svg>
              </button>
            </div>
          </div>
          <div id="coding-agent-nav-list"></div>
          <div id="coding-agent-nav-empty" style="display:none" hidden></div>
        </div>
        <div id="coding-agent-nav-footer">
          <div id="coding-agent-nav-user">
            <span class="coding-agent-nav-pin-slot" aria-hidden="true"></span>
            <span id="coding-agent-nav-user-name"></span>
          </div>
          <button id="coding-agent-logout" type="button" title="退出登录">退出</button>
        </div>
      </aside>
      </div>
      <div id="coding-agent-main">
      <div id="coding-agent-topbar">
        <div id="coding-agent-brand">
          <div id="coding-agent-brand-mark-main">${providerUi.markHtml}</div>
          <div id="coding-agent-brand-text">
            <span id="coding-agent-run-state-main" class="coding-agent-run-state">就绪</span>
            <strong id="coding-agent-chat-title"></strong>
          </div>
        </div>
        <div id="coding-agent-top-actions">
          <div id="coding-agent-user-chip" aria-live="polite">
            <span id="coding-agent-user-name"></span>
          </div>
          <button id="coding-agent-new-chat" type="button" title="新对话">新对话</button>
          <button id="coding-agent-fullscreen" type="button" title="全屏" aria-label="全屏" aria-pressed="false">
            <span class="coding-agent-icon-expand" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 3h6v6"></path>
                <path d="M9 21H3v-6"></path>
                <path d="M21 3l-7 7"></path>
                <path d="M3 21l7-7"></path>
              </svg>
            </span>
            <span class="coding-agent-icon-shrink" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 14h6v6"></path>
                <path d="M20 10h-6V4"></path>
                <path d="M14 10l7-7"></path>
                <path d="M3 21l7-7"></path>
              </svg>
            </span>
          </button>
        </div>
      </div>
      <div id="coding-agent-scroll-wrap">
        <div id="coding-agent-messages">
          <div id="coding-agent-empty" aria-hidden="true">
            <h1>${providerUi.emptyTitle}</h1>
            <p>${providerUi.emptySub}</p>
          </div>
          <div id="coding-agent-thread"></div>
        </div>
        <button id="coding-agent-jump-bottom" type="button" title="回到底部">↓ 回到底部</button>
      </div>
      <div id="coding-agent-footer">
        <div id="coding-agent-composer-wrap">
          <div id="coding-agent-queue"></div>
          <div id="coding-agent-ctx-bar">
            <button type="button" id="coding-agent-ctx-ws" class="coding-agent-ctx-chip" title="选择仓库" aria-haspopup="listbox" aria-expanded="false">
              <svg class="coding-agent-ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z"></path>
              </svg>
              <span id="coding-agent-ctx-ws-label" class="coding-agent-ctx-chip-label">No Repo</span>
              <span class="coding-agent-ctx-chevron" aria-hidden="true"></span>
            </button>
            <button type="button" id="coding-agent-ctx-branch" class="coding-agent-ctx-chip" disabled title="当前分支" hidden>
              <span id="coding-agent-ctx-branch-label" class="coding-agent-ctx-chip-label"></span>
            </button>
            <div id="coding-agent-ws-picker" role="listbox" aria-label="选择仓库" aria-hidden="true">
              <input id="coding-agent-ws-search" type="search" placeholder="Search" autocomplete="off">
              <div class="coding-agent-ws-section-label">Recents</div>
              <div id="coding-agent-ws-recents" class="coding-agent-ws-list"></div>
              <div class="coding-agent-ws-section-label">Repos</div>
              <div id="coding-agent-ws-repos" class="coding-agent-ws-list"></div>
              <div id="coding-agent-ws-path-row">
                <input id="coding-agent-ws-path-input" type="text" placeholder="D:\\code\\my-app" spellcheck="false">
                <button type="button" id="coding-agent-ws-path-go">打开</button>
              </div>
              <div class="coding-agent-ws-foot">
                <button type="button" id="coding-agent-ws-use-existing">
                  <svg class="coding-agent-ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z"></path></svg>
                  <span class="coding-agent-ws-item-main">Use Existing...</span>
                  <span class="coding-agent-ws-chevron-r" aria-hidden="true"></span>
                </button>
                <button type="button" id="coding-agent-ws-new-folder">
                  <svg class="coding-agent-ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z"></path>
                    <path d="M12 11v6"></path><path d="M9 14h6"></path>
                  </svg>
                  New Folder
                </button>
              </div>
              <div id="coding-agent-ws-flyout" aria-hidden="true">
                <div id="coding-agent-ws-flyout-panels">
                  <div data-flyout-panel="browse" id="coding-agent-ws-flyout-browse">
                    <input id="coding-agent-ws-browse-search" type="search" placeholder="Search or path" autocomplete="off">
                    <div id="coding-agent-ws-browse-head" class="coding-agent-ws-item-path" style="padding:4px 6px 8px;"></div>
                    <div id="coding-agent-ws-browse-list" class="coding-agent-ws-list"></div>
                    <button type="button" id="coding-agent-ws-browse-use-here" class="coding-agent-ws-item">
                      <span class="coding-agent-ws-item-main"><span class="coding-agent-ws-item-name">Use this folder</span></span>
                    </button>
                    <button type="button" id="coding-agent-ws-browse-open-folder" class="coding-agent-ws-item">
                      <svg class="coding-agent-ws-item-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z"></path></svg>
                      <span class="coding-agent-ws-item-main"><span class="coding-agent-ws-item-name">Open Folder</span></span>
                    </button>
                    <div id="coding-agent-ws-browse-path">
                      <input id="coding-agent-ws-browse-path-input" type="text" placeholder="D:\\code\\my-app" spellcheck="false">
                      <button type="button" id="coding-agent-ws-browse-path-go">打开</button>
                    </div>
                  </div>
                  <div data-flyout-panel="use-existing" id="coding-agent-ws-flyout-use">
                    <button type="button" id="coding-agent-ws-ue-open-folder" class="coding-agent-ws-item">
                      <svg class="coding-agent-ws-item-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z"></path></svg>
                      <span class="coding-agent-ws-item-main"><span class="coding-agent-ws-item-name">Open Folder</span></span>
                    </button>
                    <button type="button" id="coding-agent-ws-ue-ssh" class="coding-agent-ws-item">
                      <svg class="coding-agent-ws-item-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="2" width="20" height="8" rx="2"></rect><rect x="2" y="14" width="20" height="8" rx="2"></rect><circle cx="6" cy="6" r="1" fill="currentColor" stroke="none"></circle><circle cx="6" cy="18" r="1" fill="currentColor" stroke="none"></circle></svg>
                      <span class="coding-agent-ws-item-main"><span class="coding-agent-ws-item-name">Connect via SSH</span></span>
                    </button>
                    <div id="coding-agent-ws-flyout-path-ue">
                      <input id="coding-agent-ws-ue-path-input" type="text" placeholder="D:\\code\\my-app" spellcheck="false">
                      <button type="button" id="coding-agent-ws-ue-path-go">打开</button>
                    </div>
                  </div>
                  <div data-flyout-panel="ssh-form" id="coding-agent-ws-flyout-ssh-form">
                    <div id="coding-agent-ws-ssh-form" class="is-on">
                      <div id="coding-agent-ws-ssh-connect-row">
                        <input id="coding-agent-ws-ssh-hostname" type="text" placeholder="SSH Hostname" spellcheck="false" autocomplete="off">
                        <button type="button" id="coding-agent-ws-ssh-connect" title="Connect">Connect</button>
                      </div>
                      <div id="coding-agent-ws-ssh-host-list" class="coding-agent-ws-list"></div>
                      <div id="coding-agent-ws-ssh-foot">
                        <span>Type a host like user@host or select from SSH config</span>
                        <button type="button" id="coding-agent-ws-ssh-open-config">Open SSH Config</button>
                      </div>
                      <div id="coding-agent-ws-ssh-status"></div>
                      <button type="button" id="coding-agent-ws-ssh-manual-toggle">Add host manually…</button>
                      <div id="coding-agent-ws-ssh-manual">
                        <label>ID<input id="coding-agent-ws-ssh-id" type="text" placeholder="wxj_35" autocomplete="off"></label>
                        <label>Label<input id="coding-agent-ws-ssh-label" type="text" placeholder="wxj_35" autocomplete="off"></label>
                        <label>Host<input id="coding-agent-ws-ssh-host" type="text" placeholder="10.0.0.1" autocomplete="off"></label>
                        <label>Port<input id="coding-agent-ws-ssh-port" type="number" value="22" min="1" max="65535"></label>
                        <label>User<input id="coding-agent-ws-ssh-user" type="text" placeholder="wxj" autocomplete="off"></label>
                        <label>Auth
                          <select id="coding-agent-ws-ssh-auth">
                            <option value="key">SSH Key</option>
                            <option value="password">Password</option>
                          </select>
                        </label>
                        <label id="coding-agent-ws-ssh-key-wrap">Key path<input id="coding-agent-ws-ssh-key" type="text" placeholder="~/.ssh/id_rsa" autocomplete="off"></label>
                        <label id="coding-agent-ws-ssh-pass-wrap" style="display:none;">Password<input id="coding-agent-ws-ssh-pass" type="password" autocomplete="new-password"></label>
                        <label>Default path<input id="coding-agent-ws-ssh-default" type="text" placeholder="/home/user" autocomplete="off"></label>
                        <div id="coding-agent-ws-ssh-form-actions">
                          <button type="button" id="coding-agent-ws-ssh-test">测试连接</button>
                          <button type="button" id="coding-agent-ws-ssh-save">保存</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div id="coding-agent-compose-shell">
          <div id="coding-agent-slash-menu" role="listbox" aria-label="Skills"></div>
          <div id="coding-agent-attachments"></div>
          <textarea id="coding-agent-input" rows="1" placeholder="${providerUi.placeholder}"></textarea>
          <div id="coding-agent-compose-toolbar">
            <div id="coding-agent-compose-left">
              <div id="coding-agent-mode-wrap">
                <select id="coding-agent-mode" class="coding-agent-pill is-select" title="模式">
                  <option value="agent">Agent</option>
                  <option value="plan">Plan</option>
                </select>
              </div>
              <div id="coding-agent-think-wrap" title="DeepSeek 深度思考">
                <button type="button" id="coding-agent-thinking" class="coding-agent-pill" aria-pressed="false">
                  深度思考
                </button>
              </div>
              <div id="coding-agent-model-wrap">
                <button id="coding-agent-model-btn" type="button" title="模型" aria-haspopup="listbox" aria-expanded="false">
                  <span id="coding-agent-model-label"></span>
                  <span id="coding-agent-model-chevron" aria-hidden="true"></span>
                </button>
                <div id="coding-agent-model-menu" role="listbox" aria-label="选择模型">
                  <div id="coding-agent-model-auto-row">
                    <div id="coding-agent-model-auto-copy">
                      <strong>Auto</strong>
                      <span>自动选择适合当前任务的模型</span>
                      <span id="coding-agent-model-auto-resolved"></span>
                    </div>
                    <button id="coding-agent-model-auto" type="button" role="switch" aria-checked="false" title="Auto"></button>
                  </div>
                  <div id="coding-agent-model-list"></div>
                </div>
                <input id="coding-agent-model" type="hidden" value="${defaultModel}" />
              </div>
            </div>
            <div id="coding-agent-compose-right">
              <input id="coding-agent-file-input" type="file" multiple />
              <button id="coding-agent-pick-file" type="button" title="添加文件">📎</button>
              <button id="coding-agent-send" type="button" title="发送">↑</button>
              <button id="coding-agent-stop" type="button" title="终止对话"><span id="coding-agent-stop-square"></span></button>
            </div>
          </div>
        </div>
        </div>
      </div>
      </div>
      <aside id="coding-agent-ide-rail" aria-label="侧栏工具">
        <button type="button" id="coding-agent-ide-rail-terminal" class="coding-agent-ide-rail-btn" title="终端" aria-label="终端">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3.5 5.5L7 8l-3.5 2.5"/>
            <path d="M8 11.5h4.5"/>
          </svg>
          <span class="coding-agent-ide-rail-label">终端</span>
        </button>
        <button type="button" id="coding-agent-ide-rail-files" class="coding-agent-ide-rail-btn" title="文件" aria-label="文件">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 2.5h5.5L12 5v8.5H4z"/>
            <path d="M9.5 2.5V5H12"/>
          </svg>
          <span class="coding-agent-ide-rail-label">文件</span>
        </button>
        <button type="button" id="coding-agent-ide-rail-expand" class="coding-agent-ide-rail-btn" title="展开" aria-label="展开" aria-expanded="false">
          <svg class="coding-agent-ide-rail-expand-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 4L5 8l4 4"/>
            <path d="M12 4L8 8l4 4"/>
          </svg>
          <span class="coding-agent-ide-rail-label">收起</span>
        </button>
      </aside>
      <aside id="coding-agent-ide" aria-label="代码编辑" data-panel="files">
        <div id="coding-agent-ide-resize" title="拖动调整宽度" aria-hidden="true"></div>
        <div id="coding-agent-ide-topbar">
          <div id="coding-agent-ide-tabs">
            <div id="coding-agent-ide-tabs-scroll"></div>
            <div style="position:relative;flex:0 0 auto;">
              <button type="button" id="coding-agent-ide-tab-add" title="新建页签" aria-label="新建页签" aria-haspopup="menu" aria-expanded="false">+</button>
              <div id="coding-agent-ide-new-menu" role="menu" aria-hidden="true">
                <button type="button" data-ide-new="file" role="menuitem">
                  <svg class="coding-agent-ide-new-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 2.5h5.5L12 5v8.5H4z"/><path d="M9.5 2.5V5H12"/></svg>
                  <span>File</span>
                  <span class="coding-agent-ide-new-kbd">Ctrl+G</span>
                </button>
                <button type="button" data-ide-new="terminal" role="menuitem">
                  <svg class="coding-agent-ide-new-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3.5 5.5L7 8l-3.5 2.5"/><path d="M8 11.5h4.5"/></svg>
                  <span>Terminal</span>
                  <span class="coding-agent-ide-new-kbd">Ctrl+J</span>
                </button>
              </div>
            </div>
            <button type="button" id="coding-agent-ide-maximize" title="全屏编辑器" aria-label="全屏编辑器" aria-pressed="false">
              <span class="coding-agent-icon-expand" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6V3h3"/><path d="M13 6V3h-3"/><path d="M3 10v3h3"/><path d="M13 10v3h-3"/>
                </svg>
              </span>
              <span class="coding-agent-icon-shrink" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 3v3H3"/><path d="M10 3v3h3"/><path d="M6 13v-3H3"/><path d="M10 13v-3h3"/>
                </svg>
              </span>
            </button>
          </div>
          <div id="coding-agent-ide-top-actions">
            <button id="coding-agent-toggle-ide-dock" type="button" title="切换编辑器" aria-label="切换编辑器" aria-pressed="true">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="1.5" y="2" width="13" height="12" rx="1.2" stroke="currentColor" stroke-width="1.2"/>
                <path d="M10.5 2.5v11" stroke="currentColor" stroke-width="1.2"/>
                <rect x="10.5" y="2.5" width="4" height="11" fill="currentColor" opacity=".22"/>
              </svg>
            </button>
          </div>
        </div>
        <div id="coding-agent-ide-body">
          <div id="coding-agent-ide-editor">
            <div id="coding-agent-ide-crumb">
              <button type="button" id="coding-agent-ide-back" class="coding-agent-ide-icon-btn" title="上一个文件" aria-label="上一个文件" disabled>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M10 3L5 8l5 5"/>
                </svg>
              </button>
              <button type="button" id="coding-agent-ide-forward" class="coding-agent-ide-icon-btn" title="下一个文件" aria-label="下一个文件" disabled>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M6 3l5 5-5 5"/>
                </svg>
              </button>
              <span id="coding-agent-ide-crumb-name"></span>
              <span id="coding-agent-ide-crumb-spacer"></span>
              <div id="coding-agent-ide-view-tools">
                <button type="button" id="coding-agent-ide-view-preview" class="coding-agent-ide-view-btn" title="预览">预览</button>
                <button type="button" id="coding-agent-ide-view-source" class="coding-agent-ide-view-btn is-on" title="源码">源码</button>
              </div>
              <button type="button" id="coding-agent-ide-find-toggle" class="coding-agent-ide-icon-btn" title="查找 (Ctrl+F)" aria-label="查找">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
                  <circle cx="7" cy="7" r="4.2"/>
                  <path d="M10.2 10.2L13.5 13.5" stroke-linecap="round"/>
                </svg>
              </button>
              <button type="button" id="coding-agent-ide-outline-toggle" class="coding-agent-ide-icon-btn" title="大纲" aria-label="大纲">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
                  <path d="M3 4h10"/><path d="M3 8h7"/><path d="M3 12h10"/>
                </svg>
              </button>
              <button type="button" id="coding-agent-ide-save" class="coding-agent-ide-icon-btn" title="保存 (Ctrl+S)" aria-label="保存">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3.5 2.5h7.2L13 4.8V13.5H3.5z"/>
                  <path d="M5 2.5v3.5h5.5V2.5"/>
                  <path d="M5 13.5v-4h6v4"/>
                </svg>
              </button>
            </div>
            <div id="coding-agent-ide-find">
              <input id="coding-agent-ide-find-input" type="text" placeholder="在文件中查找">
              <span id="coding-agent-ide-find-count"></span>
              <button type="button" id="coding-agent-ide-find-prev" class="coding-agent-ide-icon-btn" title="上一个" aria-label="上一个">↑</button>
              <button type="button" id="coding-agent-ide-find-next" class="coding-agent-ide-icon-btn" title="下一个" aria-label="下一个">↓</button>
              <button type="button" id="coding-agent-ide-find-close" class="coding-agent-ide-icon-btn" title="关闭" aria-label="关闭">×</button>
            </div>
            <div id="coding-agent-ide-stage">
              <div id="coding-agent-ide-code-wrap" style="display:none">
                <div id="coding-agent-ide-gutter" aria-hidden="true"></div>
                <div id="coding-agent-ide-code-pane">
                  <pre id="coding-agent-ide-highlight" aria-hidden="true"><code></code></pre>
                  <textarea id="coding-agent-ide-code" spellcheck="false"></textarea>
                </div>
              </div>
              <div id="coding-agent-ide-preview" aria-label="Markdown 预览"></div>
              <div id="coding-agent-ide-empty">
                <div id="coding-agent-ide-empty-cards">
                  <button type="button" class="coding-agent-ide-empty-card" data-ide-empty="file" title="打开文件" aria-label="打开文件">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 3.5h7l5 5V20.5H6z"/><path d="M13 3.5V8.5h5"/></svg>
                    File
                  </button>
                  <button type="button" class="coding-agent-ide-empty-card" data-ide-empty="terminal" title="新建终端" aria-label="新建终端">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 8l5 4-5 4"/><path d="M12 16h7"/></svg>
                    Terminal
                  </button>
                </div>
              </div>
              <div id="coding-agent-ide-outline" aria-label="文档大纲"></div>
            </div>
          </div>
          <div id="coding-agent-ide-explorer">
            <div id="coding-agent-ide-tree-resize" title="拖动调整资源管理器宽度" aria-hidden="true"></div>
            <div id="coding-agent-ide-explorer-head">
              <strong id="coding-agent-ide-root-name">资源管理器</strong>
              <div id="coding-agent-ide-explorer-actions">
                <button type="button" id="coding-agent-ide-new-file" class="coding-agent-ide-icon-btn" title="新建文件" aria-label="新建文件">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M4 2.5h5.5L12 5v8.5H4z"/>
                    <path d="M9.5 2.5V5H12"/>
                    <path d="M8 7.5v4"/>
                    <path d="M6 9.5h4"/>
                  </svg>
                </button>
                <button type="button" id="coding-agent-ide-new-folder" class="coding-agent-ide-icon-btn" title="新建文件夹" aria-label="新建文件夹">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M2.5 4.5h4l1.2 1.3H13.5v6.7H2.5z"/>
                    <path d="M8 8v4"/>
                    <path d="M6 10h4"/>
                  </svg>
                </button>
                <button type="button" id="coding-agent-ide-refresh" class="coding-agent-ide-icon-btn" title="刷新" aria-label="刷新">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M13 8a5 5 0 1 1-1.3-3.4"/>
                    <path d="M13 2.5V5.5H10"/>
                  </svg>
                </button>
                <button type="button" id="coding-agent-ide-collapse-all" class="coding-agent-ide-icon-btn" title="全部折叠" aria-label="全部折叠">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 4.5h10"/>
                    <path d="M5 8h8"/>
                    <path d="M7 11.5h6"/>
                  </svg>
                </button>
              </div>
            </div>
            <div id="coding-agent-ide-tree"></div>
          </div>
          <div id="coding-agent-ide-panel-terminal">
            <div id="coding-agent-ide-term-mount" aria-label="终端"></div>
          </div>
        </div>
      </aside>
      </div>
      <div id="coding-agent-ide-ctx" role="menu" aria-hidden="true"></div>
      <div id="coding-agent-nav-item-menu" role="menu" aria-hidden="true"></div>
      <div id="coding-agent-nav-tip" aria-hidden="true">
        <div class="tip-title"></div>
        <div class="tip-row tip-ssh" hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="2" width="20" height="8" rx="2"></rect><rect x="2" y="14" width="20" height="8" rx="2"></rect><circle cx="6" cy="6" r="1" fill="currentColor" stroke="none"></circle><circle cx="6" cy="18" r="1" fill="currentColor" stroke="none"></circle></svg>
          <span class="tip-ssh-text"></span>
        </div>
        <div class="tip-row tip-path">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z"></path></svg>
          <span class="tip-path-text"></span>
        </div>
      </div>
    </div>
    <div id="coding-agent-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="coding-agent-confirm-title" aria-hidden="true">
      <div id="coding-agent-confirm-card">
        <h2 id="coding-agent-confirm-title">确认</h2>
        <p id="coding-agent-confirm-message"></p>
        <div id="coding-agent-confirm-actions">
          <button type="button" id="coding-agent-confirm-cancel">取消</button>
          <button type="button" class="danger" id="coding-agent-confirm-ok">确定</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  var modeField = document.getElementById("coding-agent-mode");
  var thinkWrap = document.getElementById("coding-agent-think-wrap");
  var thinkingField = document.getElementById("coding-agent-thinking");

  if (!providerUi.showAuto) {
    var autoRowEl = document.getElementById("coding-agent-model-auto-row");
    if (autoRowEl) autoRowEl.style.display = "none";
  }
  if (provider === "deepseek" && thinkWrap) {
    thinkWrap.classList.add("is-visible");
  }
  function thinkingOn() {
    return thinkingField ? thinkingField.getAttribute("aria-pressed") === "true" : false;
  }
  function syncThinkControls() {
    if (!thinkingField) return;
    var on = thinkingOn();
    thinkingField.classList.toggle("is-on", on);
    thinkingField.setAttribute("aria-pressed", on ? "true" : "false");
  }
  if (thinkingField) {
    thinkingField.addEventListener("click", function () {
      thinkingField.setAttribute("aria-pressed", thinkingOn() ? "false" : "true");
      syncThinkControls();
    });
    syncThinkControls();
  }
  function deepseekThinkOpts() {
    if (provider !== "deepseek") return {};
    // effort: omit — backend defaults Agent turns to max when thinking is on.
    return { thinking: thinkingOn() };
  }

  var backdrop = document.getElementById("coding-agent-backdrop");
  var trigger = document.getElementById("coding-agent-trigger");
  var sidebar = document.getElementById("coding-agent-sidebar");
  var resizeHandle = document.getElementById("coding-agent-resize-handle");
  var closeBtn = document.getElementById("coding-agent-close");
  var fullscreenBtn = document.getElementById("coding-agent-fullscreen");
  var sendBtn = document.getElementById("coding-agent-send");
  var composeShell = document.getElementById("coding-agent-compose-shell");
  var inputField = document.getElementById("coding-agent-input");
  var slashMenu = document.getElementById("coding-agent-slash-menu");
  var modelWrap = document.getElementById("coding-agent-model-wrap");
  var modelBtn = document.getElementById("coding-agent-model-btn");
  var modelLabel = document.getElementById("coding-agent-model-label");
  var modelMenu = document.getElementById("coding-agent-model-menu");
  var modelList = document.getElementById("coding-agent-model-list");
  var modelAutoBtn = document.getElementById("coding-agent-model-auto");
  var modelAutoResolved = document.getElementById("coding-agent-model-auto-resolved");
  var modelField = document.getElementById("coding-agent-model");
  var messagesDiv = document.getElementById("coding-agent-messages");
  var threadDiv = document.getElementById("coding-agent-thread");
  var emptyEl = document.getElementById("coding-agent-empty");
  var jumpBottomBtn = document.getElementById("coding-agent-jump-bottom");
  var stickToBottom = true;
  var runState = document.getElementById("coding-agent-run-state");
  var attachmentsDiv = document.getElementById("coding-agent-attachments");
  var queueDiv = document.getElementById("coding-agent-queue");
  var pickFileBtn = document.getElementById("coding-agent-pick-file");
  var fileInput = document.getElementById("coding-agent-file-input");
  var newChatBtn = document.getElementById("coding-agent-new-chat");
  var stopBtn = document.getElementById("coding-agent-stop");
  var SIDEBAR_WIDTH_KEY = "coding-agent-sidebar-width";
  var SIDEBAR_OPEN_KEY = "coding-agent-sidebar-open";
  var SIDEBAR_FULLSCREEN_KEY = "coding-agent-fullscreen";
  var MIN_SIDEBAR_WIDTH = 360;

  // Restore saved layout immediately; no health or placeholder UI.
  (function openPanelImmediately() {
    try {
      if (hubFullscreen) {
        // Home Cursor entry: full-bleed chat, no floating trigger / sidebar chrome.
        sidebar.style.transition = "none";
        sidebar.classList.add("is-fullscreen", "open");
        trigger.classList.add("is-hidden");
        trigger.style.display = "none";
        document.body.classList.add("coding-agent-page-locked");
        if (fullscreenBtn) fullscreenBtn.style.display = "none";
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { sidebar.style.transition = ""; });
        });
        return;
      }
      var savedWidth = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY) || "", 10);
      if (savedWidth >= MIN_SIDEBAR_WIDTH) {
        var maxW = Math.min(1200, Math.round(window.innerWidth * 0.92));
        var w = Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxW, savedWidth));
        sidebar.style.setProperty("--ai-sidebar-width", w + "px");
      }
      var fs = localStorage.getItem(SIDEBAR_FULLSCREEN_KEY) === "1";
      var open = localStorage.getItem(SIDEBAR_OPEN_KEY) === "1" || fs;
      if (!open) return;
      sidebar.style.transition = "none";
      if (fs) {
        sidebar.classList.add("is-fullscreen");
        trigger.classList.add("is-hidden");
        document.body.classList.add("coding-agent-page-locked");
      } else {
        backdrop.classList.add("open");
      }
      sidebar.classList.add("open");
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { sidebar.style.transition = ""; });
      });
    } catch (err) {}
  })();

  var pendingFiles = [];
  var sendQueue = [];
  var isRunning = false;
  var pendingFollow = false;
  var sessionGeneration = 0;
  var runStartedAt = 0;
  var runElapsedTimer = null;
  var queueSeq = 0;
  var activeAbort = null;
  var stopRequested = false;
  var queueCollapsed = false;
  // Per-conversation run registry — backend pumps can outlive the open tab/view.
  var runSlots = Object.create(null);
  function runSlotKey(convId) {
    return convId == null || convId === "" ? "draft" : String(convId);
  }
  function emptyRunSlot() {
    return {
      sessionId: "",
      busy: false,
      pendingFollow: false,
      settled: false, // pump finished in background; spinner off until user reopens
      sendQueue: [],
      queueCollapsed: false,
      runStartedAt: 0,
      // How many live_events already applied — /follow?after= skips replay on chat switch.
      eventCursor: 0,
    };
  }
  function getRunSlot(convId) {
    var key = runSlotKey(convId);
    if (!runSlots[key]) runSlots[key] = emptyRunSlot();
    return runSlots[key];
  }
  function migrateRunSlot(fromId, toId) {
    if (fromId == null || toId == null) return;
    if (runSlotKey(fromId) === runSlotKey(toId)) return;
    var fromKey = runSlotKey(fromId);
    var toKey = runSlotKey(toId);
    var from = runSlots[fromKey];
    if (!from) return;
    var to = getRunSlot(toId);
    to.sessionId = from.sessionId || to.sessionId;
    to.busy = !!(from.busy || to.busy);
    to.pendingFollow = !!(from.pendingFollow || to.pendingFollow);
    to.sendQueue = (from.sendQueue && from.sendQueue.length) ? from.sendQueue.slice() : (to.sendQueue || []);
    to.queueCollapsed = !!from.queueCollapsed;
    to.runStartedAt = from.runStartedAt || to.runStartedAt;
    to.eventCursor = Math.max(Number(from.eventCursor || 0) || 0, Number(to.eventCursor || 0) || 0);
    delete runSlots[fromKey];
  }
  function markRunSlotBusy(convId, busy, session) {
    if (convId == null) return;
    var slot = getRunSlot(convId);
    slot.busy = !!busy;
    if (session) slot.sessionId = session;
    if (busy) {
      slot.settled = false;
      slot.pendingFollow = true;
    } else {
      slot.pendingFollow = false;
      slot.eventCursor = 0;
    }
  }
  function markRunSlotSettled(convId) {
    if (convId == null) return;
    var slot = getRunSlot(convId);
    slot.busy = false;
    slot.settled = true;
    // Pump finished — do not force /follow on next open (that caused「会话已过期」noise).
    slot.pendingFollow = false;
    slot.eventCursor = 0;
  }
  function isConversationBusy(convId) {
    if (convId == null) return false;
    var slot = runSlots[runSlotKey(convId)];
    if (slot) {
      if (slot.settled) return !!(slot.sendQueue && slot.sendQueue.length);
      if (slot.busy || (slot.sendQueue && slot.sendQueue.length)) return true;
    }
    if (Number(convId) === Number(activeConversationId) && (isRunning || pendingFollow)) {
      return true;
    }
    // Cold boot (no slot yet): use persisted streaming flag for spinner.
    if (!slot) {
      var list = conversationList || [];
      for (var i = 0; i < list.length; i += 1) {
        if (Number(list[i].id) === Number(convId)) {
          return !!(list[i].streaming || list[i].pending);
        }
      }
    }
    return false;
  }
  function parkActiveRunToSlot(convId) {
    if (convId == null) return getRunSlot(null);
    var slot = getRunSlot(convId);
    slot.sessionId = sessionId || slot.sessionId || "";
    slot.sendQueue = (sendQueue && sendQueue.length) ? sendQueue.slice() : [];
    slot.queueCollapsed = !!queueCollapsed;
    slot.runStartedAt = runStartedAt || slot.runStartedAt || 0;
    slot.busy = !!(isRunning || pendingFollow || activeAbort || slot.sendQueue.length || slot.busy);
    slot.pendingFollow = !!(pendingFollow || slot.busy);
    // Keep the highest cursor seen for this chat (bumped live during SSE).
    slot.eventCursor = Math.max(Number(slot.eventCursor || 0) || 0, 0);
    return slot;
  }
  window.getRunSlot = getRunSlot;
  window.migrateRunSlot = migrateRunSlot;
  window.markRunSlotBusy = markRunSlotBusy;
  window.markRunSlotSettled = markRunSlotSettled;
  window.isConversationBusy = isConversationBusy;
  window.parkActiveRunToSlot = parkActiveRunToSlot;
  // Agent bubble left after ■ stop; removed when the user sends again.
  var stoppedAgentMsg = null;
  // Edit is staged until the bubble's own send; bottom composer stays independent.
  var editingUserMsg = null;
  var serverBootId = "";
  // Match backend attachments.MAX_ATTACHMENT_BYTES (Cursor hard limit ≈ 50MB).
  var MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
  var HISTORY_KEY = "coding-agent-chat-history:" + provider;
  function historyStorageKey() {
    var uid = currentUser && currentUser.id != null ? String(currentUser.id) : "anon";
    return "coding-agent-chat-history:" + uid + ":" + provider;
  }
  var MODEL_KEY = "coding-agent-selected-model:" + provider;
  var historySaveTimer = null;
  var logoutBtn = document.getElementById("coding-agent-logout");
  var userChip = document.getElementById("coding-agent-user-chip");
  var userNameEl = document.getElementById("coding-agent-user-name");
  var navUserNameEl = document.getElementById("coding-agent-nav-user-name");
  var navRailAvatarEl = document.getElementById("coding-agent-nav-rail-avatar");
  var navNewBtn = document.getElementById("coding-agent-nav-new");
  var activeConversationId = null;
  var conversationList = [];
  var activeWorkspaceRoot = "";
  var homeWorkspaceRoot = "";
  var chatTitleEl = document.getElementById("coding-agent-chat-title");
  function setActiveWorkspace(root, title, opts) {
    opts = opts || {};
    var prev = activeWorkspaceRoot;
    var next = (root || "").trim();
    activeWorkspaceRoot = next;
    if (typeof onIdeWorkspaceChange === "function") onIdeWorkspaceChange(prev, next);
    // Chat header title is conversation-owned. Never mirror workspace ("Home") here;
    // empty / new chats stay blank until first-round auto-title.
    if (chatTitleEl && !opts.keepTitle) {
      chatTitleEl.textContent = "";
    }
    if (typeof window.syncWorkspaceContextUi === "function") window.syncWorkspaceContextUi();
    if (typeof updateCrumb === "function") updateCrumb();
  }

  function resetChatTitleToWorkspace() {
    if (!chatTitleEl) return;
    chatTitleEl.textContent = "";
    if (typeof updateCrumb === "function") updateCrumb();
  }
  window.resetChatTitleToWorkspace = resetChatTitleToWorkspace;
  if (logoutBtn) {
    logoutBtn.onclick = function () {
      apiFetch(apiBase + "/api/auth/logout", { method: "POST" })
        .catch(function () {})
        .then(function () {
          clearAuthToken();
          window.location.href = "/login";
        });
    };
  }
  function setCurrentUser(user) {
    currentUser = user || null;
    HISTORY_KEY = historyStorageKey();
    var name = user && user.username ? String(user.username) : "";
    if (userChip && userNameEl) {
      if (name) {
        userNameEl.textContent = name;
        userChip.classList.add("is-on");
      } else {
        userNameEl.textContent = "";
        userChip.classList.remove("is-on");
      }
    }
    if (navUserNameEl) navUserNameEl.textContent = name || "未登录";
    var initial = name ? name.charAt(0).toUpperCase() : "?";
    if (navRailAvatarEl) {
      navRailAvatarEl.textContent = initial;
      navRailAvatarEl.title = name ? ("账户：" + name) : "账户";
      navRailAvatarEl.setAttribute("aria-label", name ? ("账户：" + name) : "账户");
    }
  }
  var modelOptions = (function () {
    if (provider === "deepseek") {
      return [
        { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
        { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
      ];
    }
    if (provider === "openai") {
      return [
        { id: "gpt-4o", label: "GPT-4o" },
        { id: "gpt-4.1", label: "GPT-4.1" },
        { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
        { id: "o4-mini", label: "o4-mini" },
      ];
    }
    return [
      { id: "composer-2.5", label: "Composer 2.5" },
      { id: "auto", label: "Auto" },
    ];
  })();
  var savedModel = "";
  try { savedModel = (localStorage.getItem(MODEL_KEY) || "").trim(); } catch (err) {}
  // Cursor default is Auto; ignore stale local pick of only the old injected fallback.
  if (provider === "cursor" && savedModel === "composer-2.5" && defaultModel === "auto") {
    savedModel = "";
    try { localStorage.removeItem(MODEL_KEY); } catch (err) {}
  }
  var bootModel = savedModel || defaultModel;
  var lastManualModel = bootModel === "auto"
    ? (provider === "deepseek" ? "deepseek-v4-flash" : provider === "openai" ? "gpt-4o" : "composer-2.5")
    : bootModel;
  var autoResolvedModel = "";
  var autoResolvedLabel = "";
  modelField.value = bootModel;

  // Server history restore runs in runtime.js after /api/auth/me.
  var bootRestoredStreaming = false;
  updateEmptyState();
  updateRunState("就绪");
