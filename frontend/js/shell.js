/* ai-agent frontend/js/shell.js */
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
  var AUTH_TOKEN_KEY = "ai-agent-auth-token";
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
  var sessionStorageKey = "ai-agent-session-id:" + provider;
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
    #ai-agent-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.18);
      z-index: 2147482999; opacity: 0; pointer-events: none; transition: opacity .2s ease;
    }
    #ai-agent-backdrop.open { opacity: 1; pointer-events: auto; }
    #ai-agent-trigger {
      position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px;
      padding: 0; border: none; background: transparent; border-radius: 14px;
      display: flex; align-items: center; justify-content: center; cursor: pointer;
      box-shadow: 0 10px 28px rgba(0,0,0,.18); z-index: 2147483000;
      overflow: hidden; user-select: none;
    }
    #ai-agent-trigger svg { width: 56px; height: 56px; display: block; }
    #ai-agent-sidebar {
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
    #ai-agent-nav { display: none; }
    #ai-agent-main {
      flex: 1 1 auto; min-width: 0; min-height: 0;
      display: flex; flex-direction: column; overflow: hidden;
      background: var(--ai-bg);
    }
    #ai-agent-sidebar.is-resizing { transition: none; user-select: none; }
    #ai-agent-sidebar *, #ai-agent-sidebar *::before, #ai-agent-sidebar *::after { box-sizing: border-box; }
    #ai-agent-sidebar.open { right: 0; }
    #ai-agent-sidebar.is-fullscreen {
      --ai-sidebar-width: 100vw;
      right: -100vw;
      width: 100vw;
      max-width: 100vw;
      box-shadow: none;
      flex-direction: column;
    }
    #ai-agent-sidebar.is-fullscreen.open { right: 0; left: 0; }
    #ai-agent-workspace {
      flex: 1 1 auto; min-width: 0; min-height: 0;
      display: flex; flex-direction: column; overflow: hidden;
      position: relative;
    }
    #ai-agent-sidebar.is-fullscreen #ai-agent-workspace {
      flex-direction: row;
    }
    /* Shell wraps expanded nav + collapsed rail so brand/avatar pins stay put. */
    #ai-agent-nav-shell {
      display: none; position: relative; flex: 0 0 auto;
      height: 100%; min-height: 0;
    }
    #ai-agent-sidebar.is-fullscreen #ai-agent-nav-shell {
      display: flex; flex-direction: row;
    }
    #ai-agent-nav-pins {
      position: absolute; inset: 0; z-index: 8;
      pointer-events: none;
    }
    #ai-agent-nav-rail-brand,
    #ai-agent-nav-rail-avatar {
      position: absolute;
      left: var(--ai-nav-chrome-pad-x);
      width: var(--ai-nav-icon-size); height: var(--ai-nav-icon-size);
      pointer-events: auto; padding: 0; cursor: pointer;
      display: grid; place-items: center; box-sizing: border-box;
    }
    #ai-agent-nav-rail-brand {
      top: var(--ai-nav-chrome-pad-y);
      border: 0; border-radius: 8px; background: transparent; overflow: hidden;
      transition: background .15s ease, transform .12s ease, box-shadow .15s ease;
    }
    #ai-agent-sidebar.is-fullscreen.nav-hidden #ai-agent-nav-rail-brand:hover {
      background: rgba(0,0,0,.07);
      box-shadow: 0 0 0 3px rgba(0,0,0,.06);
    }
    #ai-agent-sidebar.is-fullscreen.nav-hidden #ai-agent-nav-rail-brand:active {
      transform: scale(.96);
    }
    #ai-agent-sidebar.is-fullscreen:not(.nav-hidden) #ai-agent-nav-rail-brand {
      cursor: default;
    }
    #ai-agent-nav-rail-brand svg {
      width: var(--ai-nav-icon-size); height: var(--ai-nav-icon-size); display: block;
    }
    #ai-agent-nav-rail-avatar {
      bottom: var(--ai-nav-chrome-pad-y);
      border: 0; border-radius: 999px;
      background: #111; color: #fff; font: 700 12px/1 inherit;
      transition: transform .12s ease, box-shadow .15s ease, opacity .15s ease;
    }
    #ai-agent-nav-rail-avatar:hover {
      transform: scale(1.06);
      box-shadow: 0 0 0 3px rgba(0,0,0,.08);
      opacity: .95;
    }
    .ai-agent-nav-pin-slot {
      width: var(--ai-nav-icon-size); height: var(--ai-nav-icon-size);
      flex: 0 0 auto; visibility: hidden;
    }
    #ai-agent-sidebar.is-fullscreen #ai-agent-nav {
      display: flex; flex-direction: column;
      flex: 0 0 var(--ai-nav-width); width: var(--ai-nav-width);
      height: 100%; background: var(--ai-nav-bg);
      border-right: 1px solid var(--ai-border);
      min-height: 0; position: relative; overflow: hidden;
    }
    #ai-agent-nav-rail {
      display: none; flex: 0 0 var(--ai-nav-rail-width); width: var(--ai-nav-rail-width);
      height: 100%; flex-direction: column; align-items: center; gap: 6px;
      padding: 0; background: var(--ai-nav-bg);
      border-right: 1px solid var(--ai-border); min-height: 0;
    }
    #ai-agent-sidebar.is-fullscreen.nav-hidden #ai-agent-nav { display: none; }
    #ai-agent-sidebar.is-fullscreen.nav-hidden #ai-agent-nav-rail { display: flex; }
    #ai-agent-nav-rail-top,
    #ai-agent-nav-rail-bottom {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      width: 100%;
    }
    #ai-agent-nav-rail-top {
      flex: 0 0 auto;
      padding-top: calc(var(--ai-nav-chrome-pad-y) + var(--ai-nav-icon-size) + 6px);
    }
    #ai-agent-nav-rail-spacer { flex: 1 1 auto; min-height: 8px; }
    #ai-agent-nav-rail-bottom {
      flex: 0 0 auto; margin-top: auto;
      min-height: calc(var(--ai-nav-chrome-pad-y) * 2 + var(--ai-nav-icon-size));
    }
    .ai-agent-nav-rail-btn {
      width: 36px; height: 36px; border: 0; border-radius: 10px;
      background: transparent; color: #444; cursor: pointer;
      display: grid; place-items: center; padding: 0;
      transition: background .15s ease, color .15s ease, transform .12s ease;
    }
    .ai-agent-nav-rail-btn:hover {
      background: rgba(0,0,0,.07); color: var(--ai-text);
    }
    .ai-agent-nav-rail-btn:active {
      background: rgba(0,0,0,.11); transform: scale(.96);
    }
    .ai-agent-nav-rail-btn svg { width: 18px; height: 18px; display: block; }
    .ai-agent-nav-rail-btn.is-on {
      background: rgba(0,0,0,.08); color: var(--ai-text);
    }
    #ai-agent-nav-rail-flyout {
      display: none; position: fixed; z-index: 2147483630;
      width: 300px; max-height: min(72vh, 560px);
      overflow: auto; padding: 10px 8px 12px;
      background: #fff; border: 1px solid rgba(0,0,0,.1);
      border-radius: 14px; box-shadow: 0 12px 36px rgba(0,0,0,.14);
    }
    #ai-agent-nav-rail-flyout.is-on { display: block; }
    #ai-agent-nav-rail-flyout-title {
      padding: 2px 10px 10px; font: 600 15px/1.3 inherit; color: var(--ai-text);
    }
    #ai-agent-nav-rail-flyout-list { display: flex; flex-direction: column; gap: 2px; }
    #ai-agent-nav-rail-flyout-empty {
      display: none; padding: 16px 12px; color: var(--ai-muted);
      font-size: 13px; line-height: 1.45;
    }
    #ai-agent-nav-rail-flyout-empty.is-on { display: block; }
    #ai-agent-nav-head {
      flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 8px;
      height: calc(var(--ai-nav-chrome-pad-y) * 2 + var(--ai-nav-icon-size));
      padding: var(--ai-nav-chrome-pad-y) 10px var(--ai-nav-chrome-pad-y) var(--ai-nav-chrome-pad-x);
      box-sizing: border-box;
    }
    #ai-agent-nav-brand {
      display: flex; align-items: center; gap: 8px; min-width: 0;
    }
    #ai-agent-toggle-nav {
      width: var(--ai-nav-icon-size); height: var(--ai-nav-icon-size); padding: 0; border: 0; border-radius: 6px;
      background: transparent; color: #555; cursor: pointer;
      display: grid; place-items: center; flex: 0 0 auto;
      transition: background .15s ease, color .15s ease;
    }
    #ai-agent-toggle-nav:hover { background: rgba(0,0,0,.06); color: var(--ai-text); }
    #ai-agent-toggle-nav svg { width: 16px; height: 16px; display: block; }
    #ai-agent-nav-resize {
      position: absolute; right: -3px; top: 0; width: 6px; height: 100%;
      cursor: ew-resize; z-index: 6;
    }
    #ai-agent-nav-resize:hover,
    #ai-agent-sidebar.is-nav-resizing #ai-agent-nav-resize {
      background: rgba(0,120,212,.45);
    }
    #ai-agent-sidebar.is-nav-resizing { user-select: none; cursor: ew-resize; }
    #ai-agent-nav-top { flex: 0 0 auto; padding: 12px 12px 8px; }
    #ai-agent-nav-new {
      width: 100%; display: flex; align-items: center; gap: 10px;
      border: 1px solid var(--ai-border); background: #fff; color: var(--ai-text);
      border-radius: 10px; padding: 10px 12px; font: 600 14px/1.2 inherit;
      cursor: pointer; text-align: left;
    }
    #ai-agent-nav-new:hover { background: #f3f3f3; }
    #ai-agent-nav-new svg { width: 16px; height: 16px; flex: 0 0 auto; }
    #ai-agent-ide-topbar {
      flex: 0 0 auto; min-height: 35px; display: flex; align-items: stretch;
      border-bottom: 1px solid var(--ai-border); background: #ececec;
    }
    #ai-agent-ide-body { flex: 1 1 auto; min-height: 0; display: flex; position: relative; }
    #ai-agent-ide-editor {
      flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column;
      background: #fff; border-right: 1px solid var(--ai-border);
    }
    #ai-agent-ide-tabs {
      flex: 1 1 auto; min-width: 0; display: flex; gap: 0; overflow: hidden;
      padding: 0; background: transparent; align-items: stretch;
    }
    #ai-agent-ide-tabs-scroll {
      flex: 1 1 auto; min-width: 0; display: flex; overflow-x: auto; align-items: stretch;
    }
    #ai-agent-ide-maximize {
      flex: 0 0 auto; width: 28px; height: 28px; margin: 3px 4px 0;
      border: 0; border-radius: 6px; background: transparent; color: #666;
      cursor: pointer; display: grid; place-items: center;
    }
    #ai-agent-ide-maximize:hover { background: rgba(0,0,0,.06); color: var(--ai-text); }
    #ai-agent-ide-maximize svg { width: 14px; height: 14px; display: block; }
    #ai-agent-ide-maximize .ai-agent-icon-expand,
    #ai-agent-ide-maximize .ai-agent-icon-shrink {
      display: grid; place-items: center; width: 14px; height: 14px;
    }
    #ai-agent-ide-maximize .ai-agent-icon-shrink { display: none; }
    #ai-agent-sidebar.ide-maximized #ai-agent-ide-maximize .ai-agent-icon-expand { display: none; }
    #ai-agent-sidebar.ide-maximized #ai-agent-ide-maximize .ai-agent-icon-shrink { display: grid; }
    /* Maximized IDE: keep chat title topbar, hide thread/composer, IDE fills the rest. */
    #ai-agent-sidebar.has-ide.ide-maximized #ai-agent-workspace {
      display: grid;
      grid-template-columns: auto 1fr;
      grid-template-rows: auto 1fr;
    }
    #ai-agent-sidebar.has-ide.ide-maximized #ai-agent-nav-shell {
      grid-column: 1;
      grid-row: 1 / -1;
      height: 100%;
      max-height: none;
    }
    #ai-agent-sidebar.has-ide.ide-maximized #ai-agent-main {
      grid-column: 2;
      grid-row: 1;
      display: flex;
      flex: none;
      width: auto;
      min-width: 0;
      min-height: 0;
    }
    #ai-agent-sidebar.has-ide.ide-maximized #ai-agent-scroll-wrap,
    #ai-agent-sidebar.has-ide.ide-maximized #ai-agent-footer {
      display: none !important;
    }
    #ai-agent-sidebar.has-ide.ide-maximized #ai-agent-ide {
      grid-column: 2;
      grid-row: 2;
      display: flex;
      flex: none;
      width: auto;
      max-width: none;
      min-width: 0;
      min-height: 0;
      height: auto;
    }
    #ai-agent-sidebar.has-ide.ide-maximized #ai-agent-ide-resize { display: none; }
    #ai-agent-ide-top-actions {
      flex: 0 0 auto; display: flex; align-items: center; gap: 2px;
      padding: 0 6px 0 4px; border-left: 1px solid rgba(0,0,0,.06);
      background: #ececec;
    }
    #ai-agent-ide-top-actions .ai-agent-ide-icon-btn,
    #ai-agent-toggle-ide-dock {
      width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px;
      background: transparent; color: #555; cursor: pointer;
      display: grid; place-items: center;
    }
    #ai-agent-ide-top-actions .ai-agent-ide-icon-btn:hover,
    #ai-agent-toggle-ide-dock:hover { background: rgba(0,0,0,.06); color: var(--ai-text); }
    #ai-agent-toggle-ide-dock svg { width: 16px; height: 16px; display: block; }
    #ai-agent-sidebar.has-ide #ai-agent-toggle-ide-dock {
      background: rgba(0,0,0,.06); color: var(--ai-text);
    }
    .ai-agent-ide-tab {
      display: inline-flex; align-items: center; gap: 6px;
      border: 0; border-right: 1px solid rgba(0,0,0,.06); background: transparent;
      padding: 0 8px 0 10px; font: 12px/1.2 inherit; color: var(--ai-muted);
      cursor: pointer; max-width: 180px; height: 100%; position: relative;
    }
    .ai-agent-ide-tab:hover { background: rgba(255,255,255,.45); color: var(--ai-text); }
    .ai-agent-ide-tab.is-active {
      background: #fff; color: var(--ai-text);
    }
    .ai-agent-ide-tab-icon {
      flex: 0 0 auto; width: 14px; height: 14px; display: grid; place-items: center;
      font-size: 10px; font-weight: 700; line-height: 1;
    }
    .ai-agent-ide-tab-icon.is-md { color: #0550ae; }
    .ai-agent-ide-tab-icon.is-py { color: #3776ab; }
    .ai-agent-ide-tab-icon.is-js { color: #c5a000; }
    .ai-agent-ide-tab-name {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px;
    }
    .ai-agent-ide-tab.is-dirty .ai-agent-ide-tab-name::after { content: " ●"; color: #0078d4; font-size: 9px; }
    .ai-agent-ide-tab-close {
      flex: 0 0 auto; width: 16px; height: 16px; border: 0; border-radius: 4px;
      background: transparent; color: var(--ai-muted); cursor: pointer;
      display: grid; place-items: center; opacity: 0; font-size: 12px; line-height: 1; padding: 0;
    }
    .ai-agent-ide-tab:hover .ai-agent-ide-tab-close,
    .ai-agent-ide-tab.is-active .ai-agent-ide-tab-close { opacity: 1; }
    .ai-agent-ide-tab-close:hover { background: rgba(0,0,0,.08); color: var(--ai-text); }
    #ai-agent-ide-crumb {
      flex: 0 0 auto; height: 35px; padding: 0 8px 0 4px;
      display: flex; align-items: center; gap: 2px;
      border-bottom: 1px solid var(--ai-border); background: #fff;
      color: var(--ai-muted); font-size: 12px;
    }
    #ai-agent-ide-crumb .ai-agent-ide-icon-btn { width: 24px; height: 24px; }
    #ai-agent-ide-crumb-name {
      margin-left: 4px; color: var(--ai-text); font-weight: 500;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
    }
    #ai-agent-ide-crumb-spacer { flex: 1 1 auto; }
    #ai-agent-ide-view-tools {
      flex: 0 0 auto; display: none; align-items: center; gap: 0;
      margin-right: 6px; padding: 2px; border-radius: 8px; background: #f0f0f0;
    }
    #ai-agent-ide-view-tools.is-on { display: inline-flex; }
    .ai-agent-ide-view-btn {
      border: 0; background: transparent; color: #555; border-radius: 6px;
      padding: 4px 10px; font: 12px/1.2 inherit; cursor: pointer;
    }
    .ai-agent-ide-view-btn:hover { color: var(--ai-text); }
    .ai-agent-ide-view-btn.is-on {
      background: #fff; color: var(--ai-text); font-weight: 600;
      box-shadow: 0 0 0 1px rgba(0,0,0,.06);
    }
    #ai-agent-ide-find {
      display: none; flex: 0 0 auto; align-items: center; gap: 6px;
      padding: 6px 10px; border-bottom: 1px solid var(--ai-border); background: #f7f7f7;
    }
    #ai-agent-ide-find.is-on { display: flex; }
    #ai-agent-ide-find-input {
      flex: 1 1 auto; min-width: 0; border: 1px solid var(--ai-border); border-radius: 6px;
      padding: 5px 8px; font: 12px/1.3 inherit; outline: none;
    }
    #ai-agent-ide-find-input:focus { border-color: #0078d4; }
    #ai-agent-ide-find-count { flex: 0 0 auto; font-size: 11px; color: var(--ai-muted); }
    #ai-agent-ide-code-wrap {
      flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; position: relative; background: #fff;
    }
    #ai-agent-ide-code-pane {
      flex: 1 1 auto; min-width: 0; min-height: 0; position: relative; overflow: hidden;
    }
    #ai-agent-ide-highlight {
      position: absolute; inset: 0; margin: 0; border: 0;
      padding: 10px 14px; overflow: hidden; pointer-events: none;
      font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--ai-text); background: #fff; white-space: pre; tab-size: 2;
    }
    #ai-agent-ide-highlight code {
      font: inherit; color: inherit; background: transparent; padding: 0;
      display: block; white-space: inherit; tab-size: inherit;
    }
    #ai-agent-ide-highlight .tok-kw { color: #0000ff; }
    #ai-agent-ide-highlight .tok-key { color: #0451a5; }
    #ai-agent-ide-highlight .tok-type { color: #267f99; }
    #ai-agent-ide-highlight .tok-fn { color: #795e26; }
    #ai-agent-ide-highlight .tok-str { color: #a31515; }
    #ai-agent-ide-highlight .tok-cmt { color: #008000; font-style: italic; }
    #ai-agent-ide-highlight .tok-num { color: #098658; }
    #ai-agent-ide-highlight .tok-pp { color: #0000ff; }
    #ai-agent-ide-highlight .tok-op { color: #000000; }
    #ai-agent-ide-highlight .tok-punct { color: #000000; }
    #ai-agent-ide-preview {
      display: none; flex: 1 1 auto; min-width: 0; min-height: 0; overflow: auto;
      padding: 20px 28px 40px; background: #fff; color: var(--ai-text);
      font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #ai-agent-ide-stage {
      flex: 1 1 auto; min-height: 0; display: flex; position: relative; background: #fff;
    }
    #ai-agent-ide-outline {
      display: none; flex: 0 0 200px; width: 200px; overflow: auto;
      border-left: 1px solid var(--ai-border); background: #fafafa; padding: 8px 0;
    }
    #ai-agent-ide-outline.is-on { display: block; }
    .ai-agent-ide-outline-item {
      display: block; width: 100%; border: 0; background: transparent; text-align: left;
      padding: 5px 12px; font: 12px/1.35 inherit; color: #444; cursor: pointer;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ai-agent-ide-outline-item:hover { background: rgba(0,0,0,.05); color: var(--ai-text); }
    .ai-agent-ide-outline-item.is-h2 { padding-left: 22px; }
    .ai-agent-ide-outline-item.is-h3 { padding-left: 32px; color: #666; }
    #ai-agent-ide-editor.is-preview #ai-agent-ide-code-wrap { display: none !important; }
    #ai-agent-ide-editor.is-preview #ai-agent-ide-preview { display: block; }
    #ai-agent-ide-editor.is-preview #ai-agent-ide-empty { display: none !important; }
    #ai-agent-ide-preview h1, #ai-agent-ide-preview h2, #ai-agent-ide-preview h3 {
      margin: 1.1em 0 .45em; line-height: 1.3;
    }
    #ai-agent-ide-preview h1 { font-size: 1.7em; border-bottom: 1px solid #eee; padding-bottom: .25em; }
    #ai-agent-ide-preview h2 { font-size: 1.35em; }
    #ai-agent-ide-preview p { margin: .7em 0; }
    #ai-agent-ide-preview pre {
      background: #f6f8fa; border-radius: 8px; padding: 12px 14px; overflow: auto;
      font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    #ai-agent-ide-preview code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: .92em;
    }
    #ai-agent-ide-preview :not(pre) > code {
      background: rgba(0,0,0,.06); padding: .12em .35em; border-radius: 4px;
    }
    #ai-agent-ide-preview ul, #ai-agent-ide-preview ol { padding-left: 1.4em; margin: .6em 0; }
    #ai-agent-ide-preview blockquote {
      margin: .8em 0; padding: .2em 0 .2em 12px; border-left: 3px solid #ddd; color: #555;
    }
    #ai-agent-ide-gutter {
      flex: 0 0 auto; min-width: 40px; padding: 10px 8px 10px 10px;
      text-align: right; font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: #9a9a9a; background: #fff; border-right: 1px solid #f0f0f0;
      overflow: hidden; user-select: none; white-space: pre;
    }
    #ai-agent-ide-code {
      position: absolute; inset: 0; width: 100%; height: 100%; border: 0; resize: none;
      padding: 10px 14px; font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: transparent; caret-color: #111; background: transparent; outline: none;
      white-space: pre; overflow: auto; tab-size: 2; z-index: 1;
    }
    #ai-agent-ide-code::selection {
      background: rgba(0, 120, 212, 0.28); color: transparent;
    }
    #ai-agent-ide-empty {
      flex: 1 1 auto; min-width: 0; display: grid; place-items: center; color: var(--ai-muted);
      font-size: 13px; padding: 24px; text-align: center; background: #fff;
    }
    #ai-agent-ide-explorer {
      flex: 0 0 var(--ai-ide-tree-width, 220px); width: var(--ai-ide-tree-width, 220px);
      min-width: 140px; max-width: 45%; display: flex; flex-direction: column;
      background: #f3f3f3; position: relative;
    }
    #ai-agent-ide-explorer-head {
      flex: 0 0 auto; height: 35px; padding: 0 6px 0 12px;
      display: flex; align-items: center; gap: 4px;
      border-bottom: 0; background: #f3f3f3;
      position: sticky; top: 0; z-index: 2;
    }
    #ai-agent-sidebar.is-fullscreen #ai-agent-top-actions {
      padding-right: 36px;
    }
    #ai-agent-sidebar.has-ide #ai-agent-top-actions {
      padding-right: 0;
    }
    #ai-agent-ide-root-name {
      flex: 1 1 auto; min-width: 0; font-size: 13px; font-weight: 600;
      letter-spacing: 0; text-transform: none; color: var(--ai-text);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #ai-agent-ide-explorer-actions {
      flex: 0 0 auto; display: flex; align-items: center; gap: 0;
      margin-left: auto;
      opacity: 0; pointer-events: none;
      transition: opacity .12s ease;
    }
    #ai-agent-ide-explorer:hover #ai-agent-ide-explorer-actions,
    #ai-agent-ide-explorer:focus-within #ai-agent-ide-explorer-actions {
      opacity: 1; pointer-events: auto;
    }
    #ai-agent-ide-explorer-actions .ai-agent-ide-icon-btn {
      width: 26px; height: 26px;
    }
    #ai-agent-ide-explorer-actions .ai-agent-ide-icon-btn svg {
      width: 14px; height: 14px;
    }
    #ai-agent-ide-ctx {
      display: none; position: fixed; z-index: 2147483640; min-width: 200px;
      padding: 4px 0; margin: 0; list-style: none;
      background: #fff; border: 1px solid rgba(0,0,0,.12); border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,.14);
      font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #222;
    }
    #ai-agent-ide-ctx.is-on { display: block; }
    #ai-agent-ide-ctx button {
      display: block; width: 100%; border: 0; background: transparent;
      text-align: left; padding: 7px 14px; cursor: pointer; color: inherit;
      font: inherit;
    }
    #ai-agent-ide-ctx button:hover:not(:disabled) { background: #f0f0f0; }
    #ai-agent-ide-ctx button:disabled { color: #aaa; cursor: default; }
    #ai-agent-ide-ctx .ai-agent-ide-ctx-sep {
      height: 1px; margin: 4px 0; background: rgba(0,0,0,.08); border: 0;
    }
    .ai-agent-ide-tree-item.is-cut { opacity: .45; }
    .ai-agent-ide-inline-input {
      display: flex; align-items: center; gap: 4px; padding: 2px 8px 2px 4px;
    }
    .ai-agent-ide-inline-input input {
      flex: 1 1 auto; min-width: 0; border: 1px solid #0078d4; border-radius: 4px;
      padding: 2px 6px; font: 13px/1.3 inherit; outline: none;
    }
    #ai-agent-ide-tree {
      flex: 1 1 auto; min-height: 0; overflow: auto; padding: 4px 0 8px;
      font-size: 13px;
    }
    .ai-agent-ide-tree-item {
      display: flex; align-items: center; gap: 4px; width: 100%;
      border: 0; background: transparent; text-align: left;
      padding: 3px 8px 3px 4px; color: var(--ai-text); cursor: pointer;
      font: 13px/1.35 inherit; overflow: hidden;
    }
    .ai-agent-ide-tree-item:hover { background: rgba(0,0,0,.05); }
    .ai-agent-ide-tree-item.is-active { background: rgba(0,120,212,.12); }
    .ai-agent-ide-tree-chevron {
      flex: 0 0 16px; width: 16px; height: 16px; display: grid; place-items: center;
      color: #666; opacity: 0;
    }
    .ai-agent-ide-tree-item.is-dir .ai-agent-ide-tree-chevron { opacity: 1; }
    .ai-agent-ide-tree-chevron svg {
      width: 10px; height: 10px; transition: transform .12s ease;
    }
    .ai-agent-ide-tree-item.is-expanded .ai-agent-ide-tree-chevron svg {
      transform: rotate(90deg);
    }
    .ai-agent-ide-tree-icon {
      flex: 0 0 16px; width: 16px; height: 16px; display: grid; place-items: center;
      font-size: 11px; line-height: 1; border-radius: 3px; font-weight: 700;
    }
    .ai-agent-ide-tree-icon.is-dir { color: #dcb67a; background: transparent; font-size: 13px; }
    .ai-agent-ide-tree-icon.is-py { color: #3776ab; }
    .ai-agent-ide-tree-icon.is-js { color: #c5a000; }
    .ai-agent-ide-tree-icon.is-html { color: #e34c26; }
    .ai-agent-ide-tree-icon.is-css { color: #264de4; }
    .ai-agent-ide-tree-icon.is-md { color: #555; }
    .ai-agent-ide-tree-icon.is-json,
    .ai-agent-ide-tree-icon.is-yml,
    .ai-agent-ide-tree-icon.is-yaml { color: #cb171e; }
    .ai-agent-ide-tree-icon.is-env { color: #888; }
    .ai-agent-ide-tree-icon.is-bat,
    .ai-agent-ide-tree-icon.is-sh { color: #3e7a3e; }
    .ai-agent-ide-tree-label {
      flex: 1 1 auto; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ai-agent-ide-icon-btn {
      width: 28px; height: 28px; border: 0; border-radius: 6px;
      background: transparent; color: #555; cursor: pointer;
      display: grid; place-items: center; padding: 0; flex: 0 0 auto;
    }
    .ai-agent-ide-icon-btn:hover { background: rgba(0,0,0,.06); color: var(--ai-text); }
    .ai-agent-ide-icon-btn.is-on { background: rgba(0,0,0,.08); color: var(--ai-text); }
    .ai-agent-ide-icon-btn:disabled { opacity: .35; cursor: default; }
    .ai-agent-ide-icon-btn svg { width: 16px; height: 16px; display: block; }
    #ai-agent-ctx-bar {
      position: relative;
      display: none; align-items: center; gap: 4px;
      min-height: 28px; padding: 0 2px 2px;
      z-index: 8;
    }
    /* Only on empty / new-agent landing — hide once a real conversation starts. */
    #ai-agent-sidebar.is-empty #ai-agent-ctx-bar { display: flex; }
    .ai-agent-ctx-chip {
      display: inline-flex; align-items: center; gap: 6px;
      max-width: min(100%, 420px); min-width: 0;
      border: 0; background: transparent; color: #3f3f46;
      border-radius: 8px; padding: 5px 8px; margin: 0;
      font: 500 12.5px/1.2 inherit; cursor: pointer;
      white-space: nowrap;
    }
    .ai-agent-ctx-chip:hover { background: rgba(0,0,0,.05); color: #111; }
    .ai-agent-ctx-chip:disabled { opacity: .55; cursor: default; }
    .ai-agent-ctx-chip:disabled:hover { background: transparent; color: #3f3f46; }
    .ai-agent-ctx-chip.is-open { background: rgba(0,0,0,.06); color: #111; }
    .ai-agent-ctx-chip-label {
      min-width: 0; overflow: hidden; text-overflow: ellipsis;
    }
    .ai-agent-ctx-chevron {
      width: 0; height: 0; flex: 0 0 auto;
      border-left: 3.5px solid transparent;
      border-right: 3.5px solid transparent;
      border-top: 4.5px solid currentColor;
      opacity: .55;
    }
    .ai-agent-ctx-icon {
      width: 14px; height: 14px; flex: 0 0 auto; display: block; opacity: .7;
    }
    #ai-agent-ws-picker {
      display: none; position: absolute; left: 0; top: calc(100% + 4px);
      width: min(360px, calc(100vw - 48px));
      background: #fff; border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.06);
      padding: 8px; z-index: 30;
      overflow: visible;
    }
    #ai-agent-ws-picker.is-on { display: block; }
    #ai-agent-ws-flyout {
      display: none; position: absolute; left: calc(100% + 6px); top: 0;
      width: min(280px, calc(100vw - 48px));
      background: #fff; border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.06);
      padding: 6px; z-index: 31;
      max-height: min(420px, 70vh); overflow: auto;
    }
    #ai-agent-ws-flyout.is-on { display: block; }
    #ai-agent-ws-flyout-path {
      display: none; flex-direction: column; gap: 6px;
      padding: 6px 4px 4px;
    }
    #ai-agent-ws-flyout-path.is-on { display: flex; }
    #ai-agent-ws-flyout-path-ue {
      display: none; flex-direction: column; gap: 6px;
      padding: 6px 4px 4px;
    }
    #ai-agent-ws-flyout-path-ue.is-on { display: flex; }
    #ai-agent-ws-flyout-path-ue input {
      width: 100%; box-sizing: border-box; border: 0; background: #f4f4f5;
      border-radius: 8px; padding: 8px 10px; font: 12.5px/1.3 inherit; outline: none;
    }
    #ai-agent-ws-flyout-path-ue button {
      border: 0; background: #111; color: #fff; border-radius: 8px;
      padding: 8px 10px; font: 600 12px/1 inherit; cursor: pointer;
    }
    #ai-agent-ws-flyout-path input {
      width: 100%; box-sizing: border-box; border: 0; background: #f4f4f5;
      border-radius: 8px; padding: 8px 10px; font: 12.5px/1.3 inherit; outline: none;
    }
    #ai-agent-ws-flyout-path button {
      border: 0; background: #111; color: #fff; border-radius: 8px;
      padding: 8px 10px; font: 600 12px/1 inherit; cursor: pointer;
    }
    #ai-agent-ws-flyout-search {
      width: 100%; box-sizing: border-box; border: 0; background: #f4f4f5;
      border-radius: 8px; padding: 8px 10px; margin: 2px 0 6px;
      font: 12.5px/1.3 inherit; outline: none;
    }
    #ai-agent-ws-flyout-list {
      display: flex; flex-direction: column; gap: 1px;
      max-height: 220px; overflow: auto; margin-bottom: 4px;
    }
    #ai-agent-ws-flyout-panels > [data-flyout-panel] { display: none; }
    #ai-agent-ws-flyout-panels > [data-flyout-panel].is-on { display: block; }
    #ai-agent-ws-ssh-form {
      display: none; flex-direction: column; gap: 6px; padding: 4px 2px 6px;
    }
    #ai-agent-ws-ssh-form.is-on { display: flex; }
    #ai-agent-ws-ssh-form label {
      display: flex; flex-direction: column; gap: 3px;
      font-size: 11px; color: #71717a; font-weight: 600;
    }
    #ai-agent-ws-ssh-form input, #ai-agent-ws-ssh-form select {
      border: 0; background: #f4f4f5; border-radius: 8px;
      padding: 8px 10px; font: 12.5px/1.3 inherit; outline: none; color: #18181b;
    }
    #ai-agent-ws-ssh-form-actions {
      display: flex; gap: 6px; margin-top: 4px;
    }
    #ai-agent-ws-ssh-form-actions button {
      flex: 1 1 auto; border: 0; border-radius: 8px;
      padding: 8px 10px; font: 600 12px/1 inherit; cursor: pointer;
    }
    #ai-agent-ws-ssh-test { background: #f4f4f5; color: #18181b; }
    #ai-agent-ws-ssh-save { background: #111; color: #fff; }
    #ai-agent-ws-ssh-status {
      font-size: 11.5px; color: #71717a; min-height: 1.2em; padding: 0 2px;
    }
    #ai-agent-ws-ssh-status.is-err { color: #b91c1c; }
    #ai-agent-ws-ssh-status.is-ok { color: #15803d; }
    .ai-agent-ws-item-host {
      display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: #8b8b93; font-size: 11.5px; margin-top: 2px;
    }
    #ai-agent-ws-search {
      width: 100%; box-sizing: border-box;
      border: 0; background: #f4f4f5; border-radius: 8px;
      padding: 9px 10px; font: 13px/1.3 inherit; color: var(--ai-text);
      margin: 0 0 4px; outline: none;
    }
    #ai-agent-ws-search:focus { background: #ececee; }
    #ai-agent-ws-search::placeholder { color: #8b8b93; }
    .ai-agent-ws-section-label {
      font: 600 11px/1 inherit; color: #8b8b93;
      letter-spacing: .01em; padding: 10px 8px 4px;
    }
    .ai-agent-ws-list { display: flex; flex-direction: column; gap: 1px; max-height: 200px; overflow: auto; }
    .ai-agent-ws-item,
    .ai-agent-ws-nav {
      display: flex; align-items: center; gap: 8px;
      width: 100%; border: 0; background: transparent; color: #18181b;
      border-radius: 8px; padding: 7px 8px; margin: 0;
      font: 13px/1.25 inherit; cursor: pointer; text-align: left;
    }
    .ai-agent-ws-item:hover,
    .ai-agent-ws-nav:hover { background: #f4f4f5; }
    .ai-agent-ws-item.is-active { background: #f0f0f2; }
    .ai-agent-ws-item-ico,
    .ai-agent-ws-nav .ai-agent-ctx-icon {
      width: 15px; height: 15px; flex: 0 0 auto; opacity: .72; display: block;
    }
    .ai-agent-ws-item-main { flex: 1 1 auto; min-width: 0; }
    .ai-agent-ws-item-name {
      display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-weight: 450;
    }
    .ai-agent-ws-item-path {
      display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: #8b8b93; font-size: 11.5px; margin-top: 2px;
    }
    .ai-agent-ws-item-check {
      flex: 0 0 auto; width: 14px; height: 14px; color: #111; opacity: 0;
    }
    .ai-agent-ws-item.is-active .ai-agent-ws-item-check { opacity: 1; }
    .ai-agent-ws-chevron-r {
      width: 0; height: 0; margin-left: auto; flex: 0 0 auto;
      border-top: 4px solid transparent;
      border-bottom: 4px solid transparent;
      border-left: 5px solid #a1a1aa;
    }
    .ai-agent-ws-nav.is-open,
    .ai-agent-ws-nav.is-hot { background: #f4f4f5; }
    .ai-agent-ws-foot {
      display: flex; flex-direction: column; gap: 1px; margin-top: 4px; padding-top: 2px;
    }
    .ai-agent-ws-foot button {
      display: flex; align-items: center; gap: 8px;
      width: 100%; border: 0; background: transparent; color: #18181b;
      border-radius: 8px; padding: 7px 8px; margin: 0;
      font: 13px/1.25 inherit; cursor: pointer; text-align: left;
    }
    .ai-agent-ws-foot button:hover { background: #f4f4f5; }
    #ai-agent-ws-path-row {
      display: none; gap: 6px; padding: 6px 2px 2px; align-items: center;
    }
    #ai-agent-ws-path-row.is-on { display: flex; }
    #ai-agent-ws-path-input {
      flex: 1 1 auto; min-width: 0;
      border: 0; background: #f4f4f5; border-radius: 8px;
      padding: 8px 10px; font: 12.5px/1.3 inherit; outline: none;
    }
    #ai-agent-ws-path-go {
      flex: 0 0 auto; border: 0; background: #111; color: #fff;
      border-radius: 8px; padding: 8px 12px; font: 600 12px/1 inherit; cursor: pointer;
    }
    #ai-agent-ctx-branch[hidden] { display: none !important; }
    #ai-agent-confirm-modal {
      display: none; position: fixed; inset: 0; z-index: 2147483601;
      background: rgba(0,0,0,.35); place-items: center; padding: 24px;
    }
    #ai-agent-confirm-modal.is-on { display: grid; }
    #ai-agent-confirm-card {
      width: min(380px, 100%); background: #fff; border-radius: 14px;
      border: 1px solid var(--ai-border); padding: 20px 18px;
      box-shadow: 0 18px 40px rgba(0,0,0,.12);
    }
    #ai-agent-confirm-card h2 { margin: 0 0 6px; font-size: 17px; }
    #ai-agent-confirm-card p { margin: 0 0 16px; color: var(--ai-muted); font-size: 13px; line-height: 1.45; }
    #ai-agent-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
    #ai-agent-confirm-actions button {
      border: 1px solid var(--ai-border); background: #fff; border-radius: 10px;
      padding: 8px 14px; font: 600 13px/1 inherit; cursor: pointer;
    }
    #ai-agent-confirm-actions .primary { background: #111; color: #fff; border-color: #111; }
    #ai-agent-confirm-actions .danger { background: #c62828; color: #fff; border-color: #c62828; }
    #ai-agent-confirm-actions .danger:hover { background: #b71c1c; }
    .ai-agent-nav-item-meta {
      display: block; font-size: 11px; color: var(--ai-muted); font-weight: 400;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #ai-agent-nav-scroll {
      flex: 1 1 auto; min-height: 0; overflow: auto; padding: 4px 8px 12px;
    }
    #ai-agent-nav-label-row {
      display: flex; align-items: center; gap: 2px;
      padding: 6px 4px 4px; border-radius: 8px;
    }
    #ai-agent-nav-label-row:hover { background: rgba(0,0,0,.03); }
    #ai-agent-nav-label {
      display: flex; align-items: center; gap: 6px; flex: 1 1 auto; min-width: 0;
      border: 0; background: transparent; cursor: pointer; text-align: left;
      padding: 4px 4px; font: 600 12px/1.2 inherit;
      color: var(--ai-muted); letter-spacing: .02em; border-radius: 6px;
    }
    #ai-agent-nav-label:hover { color: var(--ai-text); }
    #ai-agent-nav-label-actions {
      flex: 0 0 auto; display: flex; align-items: center; gap: 0;
      opacity: 0; pointer-events: none; transition: opacity .12s ease;
    }
    #ai-agent-nav-label-row:hover #ai-agent-nav-label-actions,
    #ai-agent-nav-label-row:focus-within #ai-agent-nav-label-actions {
      opacity: 1; pointer-events: auto;
    }
    #ai-agent-nav-label-actions .ai-agent-nav-mini-btn {
      width: 24px; height: 24px; border: 0; border-radius: 6px;
      background: transparent; color: #666; cursor: pointer;
      display: grid; place-items: center; padding: 0;
    }
    #ai-agent-nav-label-actions .ai-agent-nav-mini-btn:hover,
    #ai-agent-nav-label-actions .ai-agent-nav-mini-btn.is-on {
      background: rgba(0,0,0,.08); color: var(--ai-text);
    }
    #ai-agent-nav-label-actions .ai-agent-nav-mini-btn svg {
      width: 14px; height: 14px; display: block;
    }
    .ai-agent-nav-label-chevron {
      width: 0; height: 0; border-style: solid; flex: 0 0 auto;
      border-width: 4px 0 4px 6px; border-color: transparent transparent transparent #888;
      transition: transform .12s ease;
    }
    #ai-agent-nav-label[aria-expanded="true"] .ai-agent-nav-label-chevron {
      transform: rotate(90deg);
    }
    #ai-agent-nav-scroll.is-repos-collapsed #ai-agent-nav-list,
    #ai-agent-nav-scroll.is-repos-collapsed #ai-agent-nav-empty {
      display: none;
    }
    #ai-agent-nav-scroll.is-hide-empty .ai-agent-repo-group.is-empty {
      display: none;
    }
    #ai-agent-nav-list { display: flex; flex-direction: column; gap: 2px; }
    .ai-agent-repo-group { margin: 0 0 6px; }
    .ai-agent-repo-head {
      display: flex; align-items: center; gap: 4px; width: 100%;
      border: 0; background: transparent; color: var(--ai-text);
      border-radius: 8px; padding: 2px 4px 2px 2px; font: 600 13px/1.2 inherit;
    }
    .ai-agent-repo-head:hover { background: rgba(0,0,0,.04); }
    .ai-agent-repo-toggle {
      display: flex; align-items: center; gap: 6px; flex: 1 1 auto; min-width: 0;
      border: 0; background: transparent; color: inherit; font: inherit;
      cursor: pointer; text-align: left; padding: 5px 4px; border-radius: 6px;
    }
    .ai-agent-repo-chevron {
      width: 0; height: 0; border-style: solid;
      border-width: 4px 0 4px 6px; border-color: transparent transparent transparent #888;
      transition: transform .12s ease; flex: 0 0 auto;
    }
    .ai-agent-repo-group.is-collapsed .ai-agent-repo-chevron {
      transform: rotate(0deg);
    }
    .ai-agent-repo-group:not(.is-collapsed) .ai-agent-repo-chevron {
      transform: rotate(90deg);
    }
    .ai-agent-repo-name {
      flex: 1 1 auto; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ai-agent-repo-count {
      flex: 0 0 auto; font-size: 11px; color: var(--ai-muted); font-weight: 500;
      padding-right: 4px;
    }
    .ai-agent-repo-add {
      flex: 0 0 auto; width: 24px; height: 24px; border: 0; border-radius: 6px;
      background: transparent; color: #666; cursor: pointer;
      display: none; place-items: center; padding: 0;
    }
    .ai-agent-repo-add svg { width: 14px; height: 14px; display: block; }
    .ai-agent-repo-add:hover { background: rgba(0,0,0,.08); color: var(--ai-text); }
    .ai-agent-repo-head:hover .ai-agent-repo-add,
    .ai-agent-repo-head:focus-within .ai-agent-repo-add { display: grid; }
    .ai-agent-repo-head:hover .ai-agent-repo-count,
    .ai-agent-repo-head:focus-within .ai-agent-repo-count { display: none; }
    .ai-agent-repo-body { display: flex; flex-direction: column; gap: 1px; padding: 0 0 4px 8px; }
    .ai-agent-repo-group.is-collapsed .ai-agent-repo-body { display: none; }
    .ai-agent-repo-empty {
      padding: 6px 10px 8px; font-size: 12px; color: var(--ai-muted);
    }
    .ai-agent-nav-item {
      display: flex; align-items: center; gap: 6px;
      width: 100%; border: 0; background: transparent; color: var(--ai-text);
      border-radius: 8px; padding: 7px 8px 7px 10px; font: 13px/1.35 inherit;
      cursor: pointer; text-align: left; position: relative;
    }
    .ai-agent-nav-item:hover { background: rgba(0,0,0,.05); }
    .ai-agent-nav-item.is-active { background: rgba(0,0,0,.08); font-weight: 600; }
    .ai-agent-nav-item-spin {
      display: none; flex: 0 0 auto; width: 12px; height: 12px;
      border: 1.5px solid rgba(0,0,0,.14); border-top-color: #444;
      border-radius: 50%; animation: ai-agent-nav-spin .7s linear infinite;
    }
    .ai-agent-nav-item.is-running .ai-agent-nav-item-spin { display: inline-block; }
    @keyframes ai-agent-nav-spin {
      to { transform: rotate(360deg); }
    }
    .ai-agent-nav-item-title {
      flex: 1 1 auto; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      display: block;
    }
    .ai-agent-nav-item.is-renaming {
      background: rgba(0,0,0,.06);
    }
    .ai-agent-nav-item-rename {
      flex: 1 1 auto; min-width: 0; width: 100%;
      border: 1px solid #0078d4; border-radius: 6px;
      padding: 2px 6px; margin: 0; outline: none;
      font: 13px/1.35 inherit; color: var(--ai-text); background: #fff;
      box-shadow: 0 0 0 2px rgba(0,120,212,.18);
    }
    .ai-agent-nav-item-time {
      flex: 0 0 auto; font-size: 11px; color: var(--ai-muted); font-weight: 400;
    }
    .ai-agent-nav-item-actions {
      flex: 0 0 auto; display: none; align-items: center; gap: 1px;
    }
    .ai-agent-nav-item:hover .ai-agent-nav-item-actions,
    .ai-agent-nav-item:focus-within .ai-agent-nav-item-actions,
    .ai-agent-nav-item.is-menu-open .ai-agent-nav-item-actions { display: inline-flex; }
    .ai-agent-nav-item:hover .ai-agent-nav-item-time,
    .ai-agent-nav-item:focus-within .ai-agent-nav-item-time,
    .ai-agent-nav-item.is-menu-open .ai-agent-nav-item-time { display: none; }
    .ai-agent-nav-item-action {
      width: 24px; height: 24px; border: 0; border-radius: 6px;
      background: transparent; color: #555; cursor: pointer;
      display: grid; place-items: center; padding: 0;
    }
    .ai-agent-nav-item-action:hover { background: rgba(0,0,0,.08); color: var(--ai-text); }
    .ai-agent-nav-item-action svg { width: 14px; height: 14px; display: block; }
    #ai-agent-nav-item-menu {
      display: none; position: fixed; z-index: 2147483642; min-width: 180px;
      padding: 6px; margin: 0; list-style: none;
      background: #fff; border: 1px solid rgba(0,0,0,.1); border-radius: 12px;
      box-shadow: 0 10px 28px rgba(0,0,0,.14);
      font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #ai-agent-nav-item-menu.is-on { display: block; }
    #ai-agent-nav-item-menu button {
      width: 100%; display: flex; align-items: center; gap: 10px;
      border: 0; background: transparent; color: var(--ai-text);
      border-radius: 8px; padding: 8px 10px; cursor: pointer; text-align: left;
      font: inherit;
    }
    #ai-agent-nav-item-menu button:hover { background: rgba(0,0,0,.05); }
    #ai-agent-nav-item-menu button.is-danger { color: #c62828; }
    #ai-agent-nav-item-menu button.is-danger:hover { background: rgba(198,40,40,.08); }
    #ai-agent-nav-item-menu button svg {
      width: 15px; height: 15px; flex: 0 0 auto; display: block;
    }
    #ai-agent-nav-empty {
      padding: 16px 10px; color: var(--ai-muted); font-size: 13px; line-height: 1.45;
    }
    #ai-agent-ide {
      display: none; flex: 0 0 var(--ai-ide-width); width: var(--ai-ide-width);
      height: 100%; min-width: 320px; max-width: 75vw; border-left: 1px solid var(--ai-border);
      background: #fff; flex-direction: column; overflow: hidden; position: relative;
    }
    #ai-agent-sidebar.is-fullscreen.has-ide #ai-agent-ide { display: flex; }
    #ai-agent-ide-rail {
      display: none; position: absolute; right: 10px; top: 44px;
      z-index: 28;
      flex-direction: column; align-items: center; gap: 2px;
      width: 44px; padding: 10px 6px; border-radius: 999px;
      background: #fff; border: 1px solid rgba(0,0,0,.1);
      box-shadow: 0 6px 20px rgba(0,0,0,.08);
      transition: width .18s ease, padding .18s ease, border-radius .18s ease;
    }
    #ai-agent-sidebar.is-fullscreen:not(.has-ide) #ai-agent-ide-rail { display: flex; }
    #ai-agent-ide-rail.is-labels {
      width: 168px; align-items: stretch; padding: 8px;
      border-radius: 14px;
    }
    .ai-agent-ide-rail-btn {
      width: 32px; height: 32px; border: 0; border-radius: 999px;
      background: transparent; color: #555; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      gap: 0; padding: 0; flex: 0 0 auto;
      transition: background .15s ease, color .15s ease, transform .12s ease, width .15s ease, border-radius .15s ease;
    }
    #ai-agent-ide-rail.is-labels .ai-agent-ide-rail-btn {
      width: 100%; height: 34px; border-radius: 8px;
      justify-content: flex-start; gap: 10px; padding: 0 10px;
    }
    .ai-agent-ide-rail-btn:hover {
      background: rgba(0,0,0,.07); color: var(--ai-text);
    }
    .ai-agent-ide-rail-btn:active {
      background: rgba(0,0,0,.11); transform: scale(.96);
    }
    .ai-agent-ide-rail-btn svg { width: 16px; height: 16px; display: block; flex: 0 0 auto; }
    .ai-agent-ide-rail-label {
      display: none; font: 13px/1.2 inherit; color: inherit;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #ai-agent-ide-rail.is-labels .ai-agent-ide-rail-label { display: inline; }
    #ai-agent-ide-rail-expand .ai-agent-ide-rail-expand-icon {
      display: block; transition: transform .18s ease;
    }
    #ai-agent-ide-rail.is-labels #ai-agent-ide-rail-expand .ai-agent-ide-rail-expand-icon {
      transform: scaleX(-1);
    }
    #ai-agent-ide-panel-browser,
    #ai-agent-ide-panel-terminal {
      display: none; flex: 1 1 auto; min-height: 0; min-width: 0; width: 100%;
      flex-direction: column; background: #fff;
    }
    #ai-agent-ide[data-panel="browser"] #ai-agent-ide-editor,
    #ai-agent-ide[data-panel="terminal"] #ai-agent-ide-editor,
    #ai-agent-ide[data-panel="browser"] #ai-agent-ide-explorer,
    #ai-agent-ide[data-panel="terminal"] #ai-agent-ide-explorer { display: none !important; }
    #ai-agent-ide[data-panel="browser"] #ai-agent-ide-panel-browser,
    #ai-agent-ide[data-panel="terminal"] #ai-agent-ide-panel-terminal { display: flex; }
    .ai-agent-ide-panel-empty {
      flex: 1 1 auto; display: grid; place-items: center; text-align: center;
      color: var(--ai-muted); font-size: 13px; padding: 24px; gap: 8px;
    }
    .ai-agent-ide-panel-empty strong {
      display: block; color: var(--ai-text); font-size: 15px; margin-bottom: 6px;
    }
    #ai-agent-ide-term {
      flex: 1 1 auto; min-height: 0; width: 100%; border: 0; resize: none;
      padding: 12px 14px; outline: none; background: #1e1e1e; color: #d4d4d4;
      font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    #ai-agent-ide-browser-bar {
      flex: 0 0 auto; display: flex; gap: 8px; align-items: center;
      padding: 8px 10px; border-bottom: 1px solid var(--ai-border); background: #f7f7f7;
    }
    #ai-agent-ide-browser-url {
      flex: 1 1 auto; min-width: 0; border: 1px solid var(--ai-border); border-radius: 8px;
      padding: 7px 10px; font: 13px/1.3 inherit; background: #fff;
    }
    #ai-agent-ide-browser-frame {
      flex: 1 1 auto; min-height: 0; width: 100%; border: 0; background: #fff;
    }
    #ai-agent-ide-resize {
      position: absolute; left: -3px; top: 0; width: 6px; height: 100%;
      cursor: ew-resize; z-index: 5;
    }
    #ai-agent-ide-resize:hover,
    #ai-agent-sidebar.is-ide-resizing #ai-agent-ide-resize {
      background: rgba(0,120,212,.45);
    }
    #ai-agent-ide-tree-resize {
      position: absolute; left: -3px; top: 0; width: 6px; height: 100%;
      cursor: ew-resize; z-index: 3;
    }
    #ai-agent-ide-tree-resize:hover,
    #ai-agent-sidebar.is-ide-tree-resizing #ai-agent-ide-tree-resize {
      background: rgba(0,120,212,.45);
    }
    #ai-agent-sidebar.is-ide-resizing,
    #ai-agent-sidebar.is-ide-tree-resizing { user-select: none; cursor: ew-resize; }
    #ai-agent-nav-footer {
      flex: 0 0 auto; border-top: 1px solid var(--ai-border);
      height: calc(var(--ai-nav-chrome-pad-y) * 2 + var(--ai-nav-icon-size) + 1px);
      padding: var(--ai-nav-chrome-pad-y) var(--ai-nav-chrome-pad-x);
      display: flex; align-items: center; gap: 8px;
      background: var(--ai-nav-bg); box-sizing: border-box;
    }
    #ai-agent-nav-user {
      flex: 1 1 auto; min-width: 0;
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; font-weight: 600; color: var(--ai-text);
    }
    #ai-agent-nav-user-name {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #ai-agent-sidebar.is-fullscreen #ai-agent-user-chip,
    #ai-agent-sidebar.is-fullscreen #ai-agent-new-chat,
    #ai-agent-sidebar.is-fullscreen #ai-agent-fullscreen {
      display: none !important;
    }
    #ai-agent-toggle-ide {
      width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px;
      background: transparent; color: #555; cursor: pointer;
      display: none; place-items: center;
      transition: background .15s ease, color .15s ease;
    }
    /* When IDE is closed: float at workspace top-right. When open: docked in IDE topbar. */
    #ai-agent-sidebar.is-fullscreen:not(.has-ide) #ai-agent-toggle-ide {
      display: grid;
      position: absolute;
      top: 8px;
      right: 10px;
      z-index: 30;
      background: #fff;
    }
    #ai-agent-sidebar.has-ide #ai-agent-toggle-ide { display: none !important; }
    #ai-agent-toggle-ide:hover { background: rgba(0,0,0,.06); color: var(--ai-text); }
    #ai-agent-toggle-ide svg { width: 16px; height: 16px; display: block; }
    @media (max-width: 720px) {
      #ai-agent-sidebar.is-fullscreen #ai-agent-workspace { flex-direction: column; }
      #ai-agent-sidebar.is-fullscreen #ai-agent-nav-shell {
        width: 100%; height: auto; max-height: 38vh;
      }
      #ai-agent-sidebar.is-fullscreen #ai-agent-nav {
        flex: 1 1 auto; width: 100%; height: 100%; max-height: none;
        border-right: 0; border-bottom: 1px solid var(--ai-border);
      }
      #ai-agent-sidebar.is-fullscreen.nav-hidden #ai-agent-nav-rail {
        width: 100%; flex-basis: auto;
      }
    }
    #ai-agent-resize-handle {
      position: absolute; left: 0; top: 0; width: 6px; height: 100%;
      cursor: ew-resize; z-index: 12; touch-action: none;
    }
    #ai-agent-resize-handle::after {
      content: ""; position: absolute; left: 2px; top: 0; bottom: 0; width: 2px;
      border-radius: 2px; background: transparent; transition: background .15s ease;
    }
    #ai-agent-resize-handle:hover::after,
    #ai-agent-sidebar.is-resizing #ai-agent-resize-handle::after {
      background: rgba(16,163,127,.45);
    }
    #ai-agent-sidebar.is-fullscreen #ai-agent-resize-handle { display: none; }
    #ai-agent-topbar {
      flex: 0 0 auto; height: 52px; padding: 0 14px;
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      border-bottom: 1px solid var(--ai-border);
      background: rgba(255,255,255,.85); backdrop-filter: blur(10px); z-index: 2;
    }
    #ai-agent-sidebar.is-fullscreen #ai-agent-topbar {
      height: 44px; padding: 0 14px 0 16px; background: #fff; backdrop-filter: none;
      border-bottom: 0;
    }
    #ai-agent-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
    #ai-agent-brand-mark-main {
      width: var(--ai-nav-icon-size); height: var(--ai-nav-icon-size); border-radius: 8px;
      overflow: hidden; flex: 0 0 auto;
      background: transparent;
      display: grid; place-items: center;
    }
    #ai-agent-brand-mark-main svg {
      width: var(--ai-nav-icon-size); height: var(--ai-nav-icon-size); display: block;
    }
    #ai-agent-brand-text {
      display: flex; align-items: center; gap: 8px; min-width: 0;
    }
    /* Run-state pill (就绪 / Read / Thinking) hidden — crowded next to title. */
    .ai-agent-run-state { display: none !important; }
    /* Expanded fullscreen: logo in left nav. Collapsed / floating: logo beside title. */
    #ai-agent-brand-mark-main { display: none; }
    #ai-agent-sidebar:not(.is-fullscreen) #ai-agent-brand-mark-main { display: grid; }
    #ai-agent-brand strong {
      font-size: 15px; font-weight: 600; color: var(--ai-text);
      line-height: 1.2; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #ai-agent-sidebar.is-fullscreen #ai-agent-brand strong {
      font-size: 14px; font-weight: 600;
    }
    #ai-agent-top-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
    #ai-agent-user-chip {
      display: none; align-items: center; gap: 6px;
      max-width: 170px; padding: 0 2px 0 4px;
      color: var(--ai-muted, #6b6b6b); font: 12px/1.2 inherit;
    }
    #ai-agent-user-chip.is-on { display: inline-flex; }
    #ai-agent-user-name {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 90px;
    }
    #ai-agent-logout {
      border: 1px solid var(--ai-border); background: #fff; color: inherit;
      border-radius: 999px; height: var(--ai-nav-icon-size); padding: 0 10px;
      font: 12px/1 inherit; cursor: pointer; box-sizing: border-box;
      display: inline-flex; align-items: center; flex: 0 0 auto;
    }
    #ai-agent-logout:hover { background: var(--ai-surface); color: var(--ai-text); }
    #ai-agent-new-chat, #ai-agent-fullscreen {
      border: 1px solid var(--ai-border); background: #fff; color: var(--ai-text);
      border-radius: 999px; padding: 7px 12px; font: 12px/1.2 inherit; cursor: pointer;
    }
    #ai-agent-new-chat:hover, #ai-agent-fullscreen:hover { background: var(--ai-surface); }
    #ai-agent-fullscreen {
      width: 32px; height: 32px; padding: 0; display: grid; place-items: center; font-size: 16px;
    }
    #ai-agent-fullscreen .ai-agent-icon-expand,
    #ai-agent-fullscreen .ai-agent-icon-shrink {
      display: grid; place-items: center; width: 16px; height: 16px; color: #444;
    }
    #ai-agent-fullscreen svg {
      width: 16px; height: 16px; display: block;
    }
    #ai-agent-fullscreen .ai-agent-icon-shrink { display: none; }
    #ai-agent-sidebar.is-fullscreen #ai-agent-fullscreen .ai-agent-icon-expand { display: none; }
    #ai-agent-sidebar.is-fullscreen #ai-agent-fullscreen .ai-agent-icon-shrink { display: grid; }
    #ai-agent-trigger.is-hidden { display: none !important; }
    #ai-agent-stop {
      width: 32px; height: 32px; border-radius: 999px; border: 0; cursor: pointer;
      flex: 0 0 auto; display: none; place-items: center;
      background: #0d0d0d; color: #fff;
    }
    #ai-agent-stop.visible { display: grid; }
    #ai-agent-stop:hover { background: #2a2a2a; }
    #ai-agent-stop-square {
      width: 10px; height: 10px; border-radius: 2px; background: #fff;
    }
    #ai-agent-scroll-wrap {
      position: relative;
      flex: 1 1 auto; min-height: 0;
      display: flex; flex-direction: column; overflow: hidden;
    }
    #ai-agent-messages {
      flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 18px 16px 12px;
      background: var(--ai-bg); scroll-behavior: auto;
      -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
    }
    #ai-agent-sidebar.is-fullscreen #ai-agent-messages { padding: 24px 16px 12px; }
    #ai-agent-jump-bottom {
      position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%);
      z-index: 6; display: none; align-items: center; gap: 6px;
      border: 1px solid var(--ai-border); background: #fff; color: #333;
      border-radius: 999px; padding: 8px 14px; font: 13px/1 inherit; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,.08);
    }
    #ai-agent-jump-bottom.visible { display: inline-flex; }
    #ai-agent-jump-bottom:hover { background: #f7f7f8; }
    #ai-agent-thread { display: flex; flex-direction: column; gap: 18px; min-height: 0; }
    #ai-agent-sidebar.is-fullscreen #ai-agent-thread {
      width: min(var(--ai-content-width), 100%);
      margin: 0 auto;
      gap: 22px;
    }
    #ai-agent-empty {
      display: none;
      text-align: center;
      color: var(--ai-text);
    }
    #ai-agent-empty h1 {
      margin: 0 0 8px;
      font-size: 28px;
      font-weight: 600;
      letter-spacing: -.02em;
      text-align: center;
    }
    #ai-agent-empty p {
      margin: 0;
      color: var(--ai-muted);
      font-size: 15px;
      text-align: center;
    }
    /* Empty chat greeting — sidebar + fullscreen. */
    #ai-agent-sidebar.is-empty #ai-agent-empty {
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
    #ai-agent-sidebar.is-empty #ai-agent-empty h1,
    #ai-agent-sidebar.is-empty #ai-agent-empty p {
      width: 100%;
      text-align: center !important;
    }
    #ai-agent-sidebar.is-empty #ai-agent-jump-bottom {
      display: none !important;
    }
    /* Fullscreen landing: same column as composer, text centered (host h1 often forces left). */
    #ai-agent-sidebar.is-fullscreen.is-empty #ai-agent-scroll-wrap {
      flex: 0 0 auto;
      overflow: visible;
      margin-top: auto;
      padding-top: 0;
    }
    #ai-agent-sidebar.is-fullscreen.is-empty #ai-agent-messages {
      flex: 0 0 auto;
      width: min(var(--ai-content-width), 100%);
      max-width: 100%;
      height: auto;
      overflow: visible;
      margin: 0 auto;
      padding: 0 16px;
      box-sizing: border-box;
    }
    #ai-agent-sidebar.is-fullscreen.is-empty #ai-agent-empty {
      min-height: 0;
      margin: 0 0 18px;
      padding: 0;
    }
    #ai-agent-sidebar.is-fullscreen.is-empty #ai-agent-footer {
      flex: 0 0 auto;
      margin-bottom: auto;
      padding: 0 16px max(28px, 8vh);
      background: transparent;
    }
    #ai-agent-sidebar.is-fullscreen.is-empty #ai-agent-composer-wrap {
      width: min(var(--ai-content-width), 100%);
      margin: 0 auto;
    }
    .ai-agent-worklog { display: flex; flex-direction: column; gap: 2px; margin: 0 0 8px; }
    .ai-agent-worklog:empty { display: none; }
    .ai-agent-segment-text {
      margin: 0 0 12px; font-size: 15px; line-height: 1.7; color: var(--ai-text);
      word-break: break-word;
    }
    .ai-agent-segment-text:last-child { margin-bottom: 0; }
    .ai-agent-card {
      border: 0; border-radius: 8px; background: transparent; overflow: hidden;
    }
    .ai-agent-card-header {
      display: flex; align-items: center; gap: 6px; padding: 4px 6px;
      font-size: 13px; color: var(--ai-muted); background: transparent;
      border-radius: 8px; cursor: default; user-select: none;
    }
    .ai-agent-card.has-body .ai-agent-card-header { cursor: pointer; }
    .ai-agent-card.has-body .ai-agent-card-header:hover {
      background: rgba(0,0,0,.04); color: var(--ai-text);
    }
    .ai-agent-card-chevron {
      flex: 0 0 14px; width: 14px; text-align: center;
      font-size: 13px; line-height: 1; color: var(--ai-muted);
      transition: transform .15s ease; transform: rotate(0deg);
    }
    .ai-agent-card:not(.has-body) .ai-agent-card-chevron { visibility: hidden; }
    .ai-agent-card.is-expanded .ai-agent-card-chevron { transform: rotate(90deg); }
    .ai-agent-card-title {
      font-weight: 500; flex: 1 1 auto; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ai-agent-card.is-live .ai-agent-card-title {
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
      animation: ai-agent-live-shimmer 1.2s linear infinite;
    }
    @keyframes ai-agent-live-shimmer {
      0% { background-position: 100% 0; }
      100% { background-position: -100% 0; }
    }
    .ai-agent-card.is-live .ai-agent-card-header {
      color: var(--ai-text);
    }
    .ai-agent-card.kind-plan.is-live .ai-agent-card-header,
    .ai-agent-card.kind-explore.is-live .ai-agent-card-header {
      color: var(--ai-muted);
    }
    .ai-agent-card.is-explore-step .ai-agent-card-header {
      padding-left: 18px;
    }
    .ai-agent-card.is-explore-step .ai-agent-card-title {
      font-weight: 400;
    }
    .ai-agent-card-meta {
      font-size: 12px; color: var(--ai-muted); white-space: nowrap; flex: 0 0 auto;
    }
    .ai-agent-card-body {
      display: none; margin: 0 0 6px 20px; padding: 8px 10px;
      border-left: 2px solid var(--ai-border);
      color: var(--ai-muted); font-size: 12.5px; white-space: pre-wrap;
      word-break: break-word; background: transparent;
      max-height: 240px; overflow-y: auto;
    }
    .ai-agent-card.is-expanded .ai-agent-card-body,
    .ai-agent-card.is-live.has-body .ai-agent-card-body { display: block; }
    .ai-agent-card.is-live:not(.has-body) .ai-agent-card-body { display: none; }
    .ai-agent-card.is-live .ai-agent-card-body {
      max-height: 320px;
      color: var(--ai-text);
    }
    .ai-agent-card.kind-run .ai-agent-card-body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }
    .ai-agent-paths { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .ai-agent-path {
      display: inline-flex; align-items: center; max-width: 100%;
      padding: 3px 8px; border-radius: 999px;
      background: #f4f4f4; border: 1px solid var(--ai-border); color: #333;
      font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .ai-agent-diff {
      margin-top: 8px; border: 1px solid var(--ai-border);
      border-radius: 10px; overflow: hidden; background: #fafafa;
    }
    .ai-agent-diff + .ai-agent-diff { margin-top: 8px; }
    .ai-agent-diff-path {
      padding: 7px 10px; background: #eee; color: #111;
      font: 650 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .ai-agent-diff-line {
      display: block; padding: 1px 12px;
      font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: pre-wrap; word-break: break-word;
    }
    .ai-agent-diff-line.added { background: rgba(22, 101, 52, .06); color: #166534; }
    .ai-agent-diff-line.removed { background: rgba(153, 27, 27, .06); color: #991b1b; }
    /* Codex-like turn change review */
    .ai-agent-turn-changes {
      margin: 12px 0 2px;
      border: 1px solid rgba(0,0,0,.08);
      border-radius: 10px;
      background: #fff;
      overflow: hidden;
    }
    .ai-agent-turn-changes.is-undone { opacity: .72; }
    .ai-agent-turn-changes-header {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      padding: 8px 12px; cursor: pointer; user-select: none;
      background: #fafafa;
      border-bottom: 1px solid rgba(0,0,0,.06);
    }
    .ai-agent-turn-changes-header:hover { background: #f5f5f5; }
    .ai-agent-turn-changes-chevron {
      width: 0; height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 5px solid #8e8e8e;
      transition: transform .12s ease;
      flex: 0 0 auto;
    }
    .ai-agent-turn-changes:not(.is-open) .ai-agent-turn-changes-chevron {
      transform: rotate(-90deg);
    }
    .ai-agent-turn-changes-title {
      font: 600 13px/1.3 inherit; color: var(--ai-text);
    }
    .ai-agent-turn-changes-stats {
      font: 12px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--ai-muted);
    }
    .ai-agent-turn-changes-stats .add,
    .ai-agent-turn-file-meta .add { color: #166534; font-weight: 600; }
    .ai-agent-turn-changes-stats .del,
    .ai-agent-turn-file-meta .del { color: #991b1b; font-weight: 600; }
    .ai-agent-turn-changes-actions { margin-left: auto; display: flex; gap: 6px; }
    .ai-agent-turn-undo {
      border: 1px solid rgba(0,0,0,.1); background: #fff; color: var(--ai-text);
      border-radius: 999px; padding: 3px 10px; font: 12px/1.2 inherit; cursor: pointer;
    }
    .ai-agent-turn-undo:hover { background: #f4f4f4; }
    .ai-agent-turn-undo:disabled { opacity: .5; cursor: default; }
    .ai-agent-turn-undo.is-done { color: #166534; border-color: #bbf7d0; background: #ecfdf5; }
    .ai-agent-turn-file-undo { padding: 2px 8px; font-size: 11px; }
    .ai-agent-turn-changes-body { display: none; }
    .ai-agent-turn-changes.is-open .ai-agent-turn-changes-body { display: block; }
    .ai-agent-turn-file {
      border-top: 1px solid rgba(0,0,0,.06);
    }
    .ai-agent-turn-file:first-child { border-top: 0; }
    .ai-agent-turn-file.is-undone { opacity: .55; }
    .ai-agent-turn-file-head {
      display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
      padding: 10px 12px 6px;
    }
    .ai-agent-turn-file-path {
      font: 600 13px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: #111;
    }
    .ai-agent-turn-file-meta {
      font: 12px/1.35 inherit; color: var(--ai-muted);
    }
    .ai-agent-turn-file-actions { margin-left: auto; }
    .ai-agent-turn-file-status { font-weight: 600; }
    .ai-agent-turn-file.status-deleted .ai-agent-turn-file-status { color: #991b1b; }
    .ai-agent-turn-file.status-created .ai-agent-turn-file-status { color: #166534; }
    .ai-agent-turn-file.status-modified .ai-agent-turn-file-status { color: #a16207; }
    .ai-agent-turn-file .ai-agent-diff {
      margin: 0; border: 0; border-radius: 0; background: transparent;
    }
    .ai-agent-turn-file .ai-agent-diff-path { display: none; }
    .ai-agent-msg { display: flex; gap: 12px; align-items: flex-start; width: 100%; }
    .ai-agent-msg.user { justify-content: flex-end; }
    .ai-agent-msg.agent { justify-content: flex-start; }
    .ai-agent-msg.user .ai-agent-msg-main {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .ai-agent-user-actions {
      display: flex;
      justify-content: flex-end;
      gap: 2px;
      margin-top: 3px;
      opacity: 0;
      transition: opacity .12s ease;
    }
    .ai-agent-user-action {
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
    .ai-agent-user-action svg { width: 15px; height: 15px; display: block; }
    .ai-agent-msg.user:hover .ai-agent-user-actions,
    .ai-agent-msg.user:focus-within .ai-agent-user-actions,
    .ai-agent-msg.user.is-editing .ai-agent-user-actions {
      opacity: 1;
    }
    .ai-agent-msg.user.is-editing .ai-agent-user-action.is-edit {
      background: rgba(0,0,0,.06);
      color: var(--ai-text);
    }
    .ai-agent-edit-textarea {
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
    .ai-agent-edit-shell {
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
    .ai-agent-edit-shell.mode-plan {
      box-shadow: 0 0 0 1px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.04);
    }
    .ai-agent-edit-attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .ai-agent-edit-attachments:empty { display: none; }
    .ai-agent-edit-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .ai-agent-edit-toolbar-left,
    .ai-agent-edit-toolbar-right {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .ai-agent-edit-mode {
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
    .ai-agent-edit-mode:hover { color: var(--ai-text); }
    .ai-agent-edit-model-wrap {
      position: relative;
      flex: 0 0 auto;
      min-width: 0;
      z-index: 5;
    }
    .ai-agent-edit-model-wrap .ai-agent-model-btn {
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
    .ai-agent-edit-model-wrap .ai-agent-model-btn:hover { background: rgba(0,0,0,.04); }
    .ai-agent-edit-model-wrap .ai-agent-model-btn.is-open { background: rgba(0,0,0,.06); }
    .ai-agent-edit-model-wrap .ai-agent-model-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }
    .ai-agent-edit-model-wrap .ai-agent-model-chevron {
      flex: 0 0 auto;
      width: 12px;
      height: 12px;
      opacity: .55;
      background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b6b6b' d='M3 4.5L6 8l3-3.5'/%3E%3C/svg%3E") center / 12px no-repeat;
    }
    .ai-agent-edit-model-wrap .ai-agent-model-menu {
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
    .ai-agent-edit-model-wrap.is-open .ai-agent-model-menu { display: block; }
    .ai-agent-edit-model-wrap .ai-agent-model-auto-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 10px;
      border-radius: 8px;
    }
    .ai-agent-edit-model-wrap .ai-agent-model-auto-row:hover { background: #f7f7f7; }
    .ai-agent-edit-model-wrap .ai-agent-model-auto-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .ai-agent-edit-model-wrap .ai-agent-model-auto-copy strong {
      font-size: 13px;
      font-weight: 600;
      color: var(--ai-text);
    }
    .ai-agent-edit-model-wrap .ai-agent-model-auto-copy span {
      font-size: 11px;
      color: var(--ai-muted);
      line-height: 1.35;
    }
    .ai-agent-edit-model-wrap .ai-agent-model-auto {
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
    .ai-agent-edit-model-wrap .ai-agent-model-auto::after {
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
    .ai-agent-edit-model-wrap .ai-agent-model-auto[aria-checked="true"] { background: #0d0d0d; }
    .ai-agent-edit-model-wrap .ai-agent-model-auto[aria-checked="true"]::after { transform: translateX(16px); }
    .ai-agent-edit-model-wrap .ai-agent-model-list {
      display: none;
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px solid var(--ai-border);
      max-height: 280px;
      overflow-y: auto;
    }
    .ai-agent-edit-model-wrap:not(.is-auto) .ai-agent-model-list { display: block; }
    .ai-agent-edit-file-input { display: none; }
    .ai-agent-edit-pick,
    .ai-agent-edit-send {
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
    .ai-agent-edit-pick {
      background: transparent;
      color: #555;
      font-size: 16px;
    }
    .ai-agent-edit-pick:hover { background: #f3f3f3; }
    .ai-agent-edit-send {
      background: #0d0d0d;
      color: #fff;
    }
    .ai-agent-edit-send:hover { background: #2a2a2a; }
    .ai-agent-edit-send svg { width: 14px; height: 14px; display: block; }
    .ai-agent-msg.user.is-editing .body,
    .ai-agent-msg.user.is-editing .ai-agent-user-actions { display: none !important; }
    /* Edit composer: same full width as #ai-agent-compose-shell (not 88% bubble). */
    .ai-agent-msg.user.is-editing {
      width: 100%;
      justify-content: stretch;
    }
    .ai-agent-msg.user.is-editing .ai-agent-msg-main {
      max-width: 100%;
      width: 100%;
      align-items: stretch;
    }
    .ai-agent-msg.user .body { cursor: text; }
    .ai-agent-user-action:hover {
      background: rgba(0,0,0,.05);
      color: var(--ai-text);
    }
    @media (hover: none) {
      .ai-agent-user-actions { opacity: 1; }
    }
    .ai-agent-avatar {
      width: 28px; height: 28px; border-radius: 999px; flex: 0 0 auto; margin-top: 2px;
      display: grid; place-items: center; font: 700 11px/1 -apple-system, sans-serif; color: #fff;
    }
    .ai-agent-msg.agent .ai-agent-avatar { background: #10a37f; }
    .ai-agent-msg.user .ai-agent-avatar { display: none; }
    .ai-agent-msg-main { min-width: 0; max-width: 100%; }
    .ai-agent-msg.user .ai-agent-msg-main { max-width: 88%; }
    .ai-agent-msg .body {
      white-space: pre-wrap; word-break: break-word;
      font: inherit; color: var(--ai-text);
      background: transparent; border: 0; border-radius: 0;
      padding: 2px 0; line-height: 1.7;
      -webkit-user-select: text; user-select: text;
    }
    .ai-agent-msg.agent .body {
      white-space: normal;
    }
    .ai-agent-msg.user .body {
      background: var(--ai-user-bg); border-radius: 22px; padding: 10px 16px;
    }
    .ai-agent-msg.agent .body { padding-top: 4px; }
    .ai-agent-msg.system .body {
      background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412;
      border-radius: 14px; padding: 10px 14px;
    }
    .ai-agent-msg .body > :first-child { margin-top: 0; }
    .ai-agent-msg .body > :last-child { margin-bottom: 0; }
    .ai-agent-msg .body p,
    .ai-agent-msg .body ul,
    .ai-agent-msg .body ol,
    .ai-agent-msg .body .ai-agent-codeblock,
    .ai-agent-msg .body blockquote,
    .ai-agent-msg .body h1,
    .ai-agent-msg .body h2,
    .ai-agent-msg .body h3,
    .ai-agent-msg .body h4 { margin: 0 0 12px; }
    .ai-agent-msg .body ul,
    .ai-agent-msg .body ol { padding-left: 22px; }
    .ai-agent-msg .body li + li { margin-top: 4px; }
    .ai-agent-msg .body li input[type="checkbox"] {
      margin-right: 6px; vertical-align: middle; pointer-events: none;
    }
    .ai-agent-msg .body h1,
    .ai-agent-msg .body h2,
    .ai-agent-msg .body h3,
    .ai-agent-msg .body h4 { line-height: 1.35; font-weight: 650; }
    .ai-agent-msg .body h1 { font-size: 22px; }
    .ai-agent-msg .body h2 { font-size: 19px; }
    .ai-agent-msg .body h3 { font-size: 17px; }
    .ai-agent-msg .body h4 { font-size: 15px; }
    .ai-agent-msg .body strong { font-weight: 650; }
    .ai-agent-msg .body em { font-style: italic; }
    .ai-agent-msg .body del { text-decoration: line-through; color: var(--ai-muted); }
    /* Beat host CSS (e.g. layui a{color:#333}) so links stay visibly blue. */
    #ai-agent-sidebar .ai-agent-msg a,
    #ai-agent-sidebar .ai-agent-msg .body a,
    #ai-agent-sidebar .ai-agent-segment-text a {
      color: #2563eb !important;
      text-decoration: underline !important;
      text-underline-offset: 2px;
      word-break: break-word;
      cursor: pointer;
    }
    #ai-agent-sidebar .ai-agent-msg a:visited,
    #ai-agent-sidebar .ai-agent-msg .body a:visited,
    #ai-agent-sidebar .ai-agent-segment-text a:visited {
      color: #2563eb !important;
    }
    #ai-agent-sidebar .ai-agent-msg a:hover,
    #ai-agent-sidebar .ai-agent-msg .body a:hover,
    #ai-agent-sidebar .ai-agent-segment-text a:hover {
      color: #1d4ed8 !important;
    }
    .ai-agent-msg .body hr {
      border: 0; border-top: 1px solid var(--ai-border); margin: 12px 0;
    }
    .ai-agent-msg .body .katex-display {
      margin: 10px 0; overflow-x: auto; overflow-y: hidden;
      padding: 2px 0;
    }
    .ai-agent-msg .body .ai-agent-math {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.92em; color: var(--ai-muted);
      white-space: pre-wrap;
    }
    .ai-agent-msg .body .ai-agent-math.is-display {
      display: block;
      margin: 10px 0;
      overflow-x: auto;
      text-align: center;
    }
    .ai-agent-msg .body .md-table-fallback {
      margin: 0 0 12px;
      padding: 10px 12px;
      border-radius: 10px;
      background: #f7f7f8;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: pre-wrap;
      overflow-x: auto;
    }
    .ai-agent-msg .body .md-table-wrap {
      overflow-x: auto;
      margin: 0 0 12px;
      -webkit-overflow-scrolling: touch;
      max-width: 100%;
    }
    .ai-agent-msg .body table {
      /* Grow with columns; wrap scrolls horizontally — don't squeeze cells. */
      width: max-content;
      min-width: 100%;
      border-collapse: collapse;
      margin: 0 0 12px;
      font-size: 13px;
      line-height: 1.4;
      table-layout: auto;
    }
    .ai-agent-msg .body .md-table-wrap table { margin: 0; }
    .ai-agent-msg .body th,
    .ai-agent-msg .body td {
      border: 1px solid var(--ai-border);
      padding: 7px 10px;
      text-align: left;
      vertical-align: middle;
      /* Override .body word-break so "15,481" / "click" / "4.62%" stay on one line. */
      white-space: nowrap;
      word-break: normal;
      overflow-wrap: normal;
    }
    .ai-agent-msg .body th { background: var(--ai-surface); font-weight: 600; }
    .ai-agent-msg .body tr:nth-child(even) td { background: #fafafa; }
    .ai-agent-msg .body code {
      padding: 2px 6px; border-radius: 6px; background: rgba(0,0,0,.06);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .92em;
    }
    .ai-agent-codeblock {
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      overflow: hidden;
      background: #0d0d0d;
      -webkit-user-select: text;
      user-select: text;
    }
    .ai-agent-codeblock-header {
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
    .ai-agent-codeblock-lang {
      color: #b4b4b4;
      font: 500 12px/1.2 ui-sans-serif, system-ui, sans-serif;
      text-transform: lowercase;
    }
    .ai-agent-codeblock-copy {
      appearance: none;
      border: 0;
      background: transparent;
      color: #d4d4d4;
      font: 500 12px/1.2 ui-sans-serif, system-ui, sans-serif;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
    }
    .ai-agent-codeblock-copy:hover { background: rgba(255,255,255,.08); color: #fff; }
    .ai-agent-codeblock-copy.is-copied { color: #86efac; }
    .ai-agent-msg .body .ai-agent-codeblock pre {
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
    .ai-agent-msg .body .ai-agent-codeblock pre code {
      background: transparent;
      padding: 0;
      color: inherit;
      display: block;
      white-space: inherit;
      -webkit-user-select: text;
      user-select: text;
    }
    .ai-agent-msg .body pre .tok-kw { color: #c792ea; }
    .ai-agent-msg .body pre .tok-type { color: #ffcb6b; }
    .ai-agent-msg .body pre .tok-fn { color: #82aaff; }
    .ai-agent-msg .body pre .tok-str { color: #c3e88d; }
    .ai-agent-msg .body pre .tok-cmt { color: #6a7386; font-style: italic; }
    .ai-agent-msg .body pre .tok-num { color: #f78c6c; }
    .ai-agent-msg .body pre .tok-pp { color: #89ddff; }
    .ai-agent-msg .body pre .tok-op { color: #89ddff; }
    .ai-agent-msg .body pre .tok-punct { color: #a6accd; }
    .ai-agent-msg .body blockquote {
      padding-left: 12px; border-left: 3px solid rgba(0,0,0,.15); color: var(--ai-muted);
    }
    .ai-agent-msg-images {
      display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; justify-content: flex-end;
    }
    .ai-agent-msg.agent .ai-agent-msg-images { justify-content: flex-start; }
    .ai-agent-msg-images img {
      width: 96px; height: 96px; object-fit: cover;
      border-radius: 14px; border: 1px solid var(--ai-border); background: #fff;
    }
    .ai-agent-msg-files {
      display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; justify-content: flex-end;
    }
    .ai-agent-msg.agent .ai-agent-msg-files { justify-content: flex-start; }
    .ai-agent-file-chip {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 5px 10px 5px 6px; border-radius: 10px; border: 1px solid var(--ai-border);
      background: #fff; color: #333; font-size: 12px; max-width: 240px;
    }
    .ai-agent-file-chip .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .ai-agent-file-icon {
      min-width: 22px; height: 22px; padding: 0 6px; border-radius: 5px; flex: 0 0 auto;
      display: grid; place-items: center;
      font: 700 9px/1 system-ui, -apple-system, sans-serif; color: #fff;
      letter-spacing: -0.01em; white-space: nowrap;
    }
    #ai-agent-footer {
      flex: 0 0 auto; padding: 8px 14px 16px;
      background: linear-gradient(180deg, rgba(255,255,255,0), #fff 28%);
      display: flex; flex-direction: column; gap: 8px;
    }
    #ai-agent-sidebar.is-fullscreen #ai-agent-footer { padding: 8px 16px 18px; }
    #ai-agent-composer-wrap {
      width: 100%;
      display: flex; flex-direction: column; gap: 8px;
    }
    #ai-agent-sidebar.is-fullscreen #ai-agent-composer-wrap {
      width: min(var(--ai-content-width), 100%);
      margin: 0 auto;
    }
    #ai-agent-queue {
      display: none;
      flex-direction: column;
      border-radius: 12px;
      background: var(--ai-surface);
      color: var(--ai-text);
      border: 1px solid var(--ai-border);
      overflow: hidden;
      font-size: 13px;
    }
    #ai-agent-queue.has-items { display: flex; }
    .ai-agent-queue-toggle {
      display: flex; align-items: center; gap: 8px;
      width: 100%; border: 0; background: transparent; color: var(--ai-muted);
      padding: 10px 12px; cursor: pointer; font: inherit; text-align: left;
    }
    .ai-agent-queue-toggle:hover { color: var(--ai-text); }
    .ai-agent-queue-chevron {
      width: 10px; height: 10px; flex: 0 0 10px;
      border-right: 1.5px solid currentColor;
      border-bottom: 1.5px solid currentColor;
      transform: rotate(45deg) translate(-1px, -1px);
      transition: transform .15s ease;
    }
    #ai-agent-queue.is-collapsed .ai-agent-queue-chevron {
      transform: rotate(-45deg) translate(-1px, 1px);
    }
    .ai-agent-queue-count { font-weight: 500; color: var(--ai-text); }
    .ai-agent-queue-list {
      display: flex; flex-direction: column;
      border-top: 1px solid var(--ai-border);
    }
    #ai-agent-queue.is-collapsed .ai-agent-queue-list { display: none; }
    .ai-agent-queue-item {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 10px 8px 12px; min-height: 36px;
    }
    .ai-agent-queue-item + .ai-agent-queue-item {
      border-top: 1px solid var(--ai-border);
    }
    .ai-agent-queue-dot {
      flex: 0 0 8px; width: 8px; height: 8px;
      border: 1.5px solid var(--ai-muted); border-radius: 50%;
    }
    .ai-agent-queue-text {
      flex: 1 1 auto; min-width: 0; border: 0; background: transparent;
      color: var(--ai-text); font: inherit; text-align: left; cursor: pointer;
      padding: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ai-agent-queue-text:hover { color: #111; }
    .ai-agent-queue-actions {
      display: flex; align-items: center; gap: 2px; flex: 0 0 auto;
    }
    .ai-agent-queue-actions button {
      width: 26px; height: 26px; border: 0; border-radius: 6px;
      background: transparent; color: var(--ai-muted); cursor: pointer;
      display: grid; place-items: center; padding: 0;
    }
    .ai-agent-queue-actions button svg {
      width: 14px; height: 14px; display: block;
    }
    .ai-agent-queue-actions button:hover {
      background: rgba(0,0,0,.05); color: var(--ai-text);
    }
    .ai-agent-queue-actions button.delete:hover { color: #b91c1c; }
    #ai-agent-compose-shell {
      position: relative;
      border-radius: 16px;
      background: #fff;
      box-shadow: var(--ai-composer-shadow);
      padding: 10px 12px 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    #ai-agent-compose-shell.mode-plan {
      box-shadow: 0 0 0 1px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.04);
      background: #fff;
    }
    #ai-agent-mode-wrap {
      position: relative;
      flex: 0 0 auto;
    }
    #ai-agent-think-wrap {
      display: none;
      align-items: center;
      gap: 6px;
      flex: 0 0 auto;
    }
    #ai-agent-think-wrap.is-visible { display: inline-flex; }
    .ai-agent-pill {
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
    .ai-agent-pill:hover { color: var(--ai-text); }
    .ai-agent-pill.is-on {
      color: var(--ai-text);
      font-weight: 600;
      background: #ebebeb;
    }
    .ai-agent-pill.is-select {
      padding-right: 20px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b6b6b' d='M3 4.5L6 8l3-3.5'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
    }
    #ai-agent-attachments { display: flex; flex-wrap: wrap; gap: 8px; }
    #ai-agent-attachments:empty { display: none; }
    .ai-agent-thumb { position: relative; width: 56px; height: 56px; }
    .ai-agent-thumb img {
      width: 100%; height: 100%; object-fit: cover;
      border-radius: 10px; border: 1px solid var(--ai-border); background: #fff;
    }
    .ai-agent-thumb.file {
      display: inline-flex; align-items: center; gap: 8px;
      width: auto; min-width: 110px; height: auto;
      padding: 8px 26px 8px 8px; border: 1px solid var(--ai-border);
      border-radius: 10px; background: #fafafa; color: #333; font-size: 12px;
    }
    .ai-agent-thumb.file .meta { min-width: 0; }
    .ai-agent-thumb.file .name {
      display: block; max-width: 150px; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; font-weight: 650;
    }
    .ai-agent-thumb.file .kind { display: none; }
    .ai-agent-thumb button {
      position: absolute; top: -6px; right: -6px;
      width: 20px; height: 20px; border: 0; border-radius: 50%;
      background: #111; color: #fff; cursor: pointer;
      font: 700 12px/1 system-ui, sans-serif;
    }
    #ai-agent-input {
      width: 100%; border: 0; outline: none; background: transparent; resize: none;
      min-height: 24px; max-height: 140px;
      padding: 2px 2px 0; font: inherit; line-height: 1.45; color: var(--ai-text);
    }
    #ai-agent-input::placeholder { color: #8e8e8e; }
    #ai-agent-slash-menu {
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
    #ai-agent-slash-menu.is-open { display: block; }
    .ai-agent-slash-item {
      display: flex; flex-direction: column; gap: 2px;
      width: 100%; border: 0; background: transparent; text-align: left;
      padding: 8px 10px; border-radius: 8px; cursor: pointer;
      font: inherit; color: var(--ai-text);
    }
    .ai-agent-slash-item:hover,
    .ai-agent-slash-item.is-active { background: #f4f4f4; }
    .ai-agent-slash-item .name {
      font: 600 13px/1.3 inherit;
    }
    .ai-agent-slash-item .name::before { content: "/"; color: var(--ai-muted); font-weight: 500; }
    .ai-agent-slash-item .desc {
      font: 12px/1.35 inherit; color: var(--ai-muted);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ai-agent-slash-empty {
      padding: 10px; font: 12px/1.4 inherit; color: var(--ai-muted);
    }
    #ai-agent-compose-toolbar {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    #ai-agent-compose-left, #ai-agent-compose-right {
      display: flex; align-items: center; gap: 6px; min-width: 0;
    }
    #ai-agent-mode {
      max-width: 82px;
    }
    #ai-agent-model-wrap {
      position: relative;
      flex: 0 0 auto;
      min-width: 0;
    }
    #ai-agent-model-btn {
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
    #ai-agent-model-btn:hover { background: rgba(0,0,0,.04); }
    #ai-agent-model-btn.is-open { background: rgba(0,0,0,.06); }
    #ai-agent-model-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }
    #ai-agent-model-chevron {
      flex: 0 0 auto;
      width: 12px;
      height: 12px;
      opacity: .55;
      background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b6b6b' d='M3 4.5L6 8l3-3.5'/%3E%3C/svg%3E") center / 12px no-repeat;
    }
    #ai-agent-model-menu {
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
    #ai-agent-model-wrap.is-open #ai-agent-model-menu { display: block; }
    #ai-agent-model-auto-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 10px;
      border-radius: 8px;
    }
    #ai-agent-model-auto-row:hover { background: #f7f7f7; }
    #ai-agent-model-auto-copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    #ai-agent-model-auto-copy strong {
      font-size: 13px;
      font-weight: 600;
      color: var(--ai-text);
    }
    #ai-agent-model-auto-copy span {
      font-size: 11px;
      color: var(--ai-muted);
      line-height: 1.35;
    }
    #ai-agent-model-auto-resolved {
      font-size: 11px;
      color: #10a37f;
      line-height: 1.35;
      margin-top: 2px;
    }
    #ai-agent-model-auto-resolved:empty { display: none; }
    #ai-agent-model-auto {
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
    #ai-agent-model-auto::after {
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
    #ai-agent-model-auto[aria-checked="true"] { background: #0d0d0d; }
    #ai-agent-model-auto[aria-checked="true"]::after { transform: translateX(16px); }
    #ai-agent-model-list {
      display: none;
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px solid var(--ai-border);
      max-height: 280px;
      overflow-y: auto;
    }
    #ai-agent-model-wrap:not(.is-auto) #ai-agent-model-list { display: block; }
    .ai-agent-model-option {
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
    .ai-agent-model-option:hover { background: #f4f4f4; }
    .ai-agent-model-option.is-selected {
      background: #f0f0f0;
      font-weight: 600;
    }
    #ai-agent-model { display: none; }
    #ai-agent-file-input { display: none; }
    #ai-agent-pick-file, #ai-agent-send {
      width: 32px; height: 32px; border-radius: 999px; border: 0; cursor: pointer;
      flex: 0 0 auto; display: grid; place-items: center;
    }
    #ai-agent-pick-file { background: transparent; color: #555; font-size: 16px; }
    #ai-agent-pick-file:hover { background: #f3f3f3; }
    #ai-agent-send { background: #0d0d0d; color: #fff; font-size: 15px; }
    #ai-agent-send:hover { background: #2a2a2a; }
    #ai-agent-send.is-queue { font-size: 11px; font-weight: 700; }
    #ai-agent-send.hidden { display: none; }
    body.ai-agent-page-locked { overflow: hidden !important; }
  `;

  var styleEl = document.createElement("style");
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  var container = document.createElement("div");
  container.innerHTML = `
    <div id="ai-agent-backdrop"></div>
    <div id="ai-agent-trigger" title="${providerUi.name}">${providerUi.markHtml}</div>
    <div id="ai-agent-sidebar">
      <div id="ai-agent-resize-handle" title="拖动调整宽度" aria-hidden="true"></div>
      <div id="ai-agent-workspace">
      <button id="ai-agent-toggle-ide" type="button" title="切换编辑器 (Ctrl+G)" aria-label="切换编辑器" aria-pressed="false">
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1.5" y="2" width="13" height="12" rx="1.2" stroke="currentColor" stroke-width="1.2"/>
          <path d="M10.5 2.5v11" stroke="currentColor" stroke-width="1.2"/>
          <rect x="10.5" y="2.5" width="4" height="11" fill="currentColor" opacity=".22"/>
        </svg>
      </button>
      <div id="ai-agent-nav-shell">
      <div id="ai-agent-nav-pins">
        <button type="button" id="ai-agent-nav-rail-brand" title="展开边栏 (Ctrl+B)" aria-label="展开边栏">
          ${providerUi.markHtml}
        </button>
        <button type="button" id="ai-agent-nav-rail-avatar" title="账户" aria-label="账户">A</button>
      </div>
      <aside id="ai-agent-nav-rail" aria-label="收起的边栏">
        <div id="ai-agent-nav-rail-top">
          <button type="button" id="ai-agent-nav-rail-new" class="ai-agent-nav-rail-btn" title="新建 Agent" aria-label="新建 Agent">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
            </svg>
          </button>
          <button type="button" id="ai-agent-nav-rail-chats" class="ai-agent-nav-rail-btn" title="最近聊天" aria-label="最近聊天" aria-expanded="false" aria-haspopup="dialog">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>
        </div>
        <div id="ai-agent-nav-rail-spacer" aria-hidden="true"></div>
        <div id="ai-agent-nav-rail-bottom" aria-hidden="true"></div>
      </aside>
      <div id="ai-agent-nav-rail-flyout" role="dialog" aria-label="最近聊天">
        <div id="ai-agent-nav-rail-flyout-title">最近聊天</div>
        <div id="ai-agent-nav-rail-flyout-list"></div>
        <div id="ai-agent-nav-rail-flyout-empty">还没有 Agent。点上方「新建 Agent」，或在 Home 里开始。</div>
      </div>
      <aside id="ai-agent-nav" aria-label="历史对话">
        <div id="ai-agent-nav-resize" title="拖动调整宽度" aria-hidden="true"></div>
        <div id="ai-agent-nav-head">
          <div id="ai-agent-nav-brand">
            <span class="ai-agent-nav-pin-slot" aria-hidden="true"></span>
            <span id="ai-agent-run-state" class="ai-agent-run-state">就绪</span>
          </div>
          <button id="ai-agent-toggle-nav" type="button" title="收起边栏 (Ctrl+B)" aria-label="收起边栏" aria-pressed="true">
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1.5" y="2" width="13" height="12" rx="1.2" stroke="currentColor" stroke-width="1.2"/>
              <path d="M5.5 2.5v11" stroke="currentColor" stroke-width="1.2"/>
              <rect x="1.5" y="2.5" width="4" height="11" fill="currentColor" opacity=".22"/>
            </svg>
          </button>
        </div>
        <div id="ai-agent-nav-top">
          <button id="ai-agent-nav-new" type="button" title="新建 Agent">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 5v14"></path><path d="M5 12h14"></path>
            </svg>
            <span>新建 Agent</span>
          </button>
        </div>
        <div id="ai-agent-nav-scroll">
          <div id="ai-agent-nav-label-row">
            <button type="button" id="ai-agent-nav-label" title="折叠仓库列表" aria-expanded="true">
              <span class="ai-agent-nav-label-chevron" aria-hidden="true"></span>
              <span>仓库</span>
            </button>
            <div id="ai-agent-nav-label-actions">
              <button type="button" id="ai-agent-nav-filter" class="ai-agent-nav-mini-btn" title="隐藏空仓库" aria-label="隐藏空仓库" aria-pressed="false">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
                  <path d="M2.5 3.5h11l-4 5v3.5l-3 1.5v-5z"/>
                </svg>
              </button>
              <button type="button" id="ai-agent-nav-add-repo" class="ai-agent-nav-mini-btn" title="添加仓库" aria-label="添加仓库">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M2.5 4.5h4l1.2 1.3H13.5v6.7H2.5z"/>
                  <path d="M8 8v4"/><path d="M6 10h4"/>
                </svg>
              </button>
            </div>
          </div>
          <div id="ai-agent-nav-list"></div>
          <div id="ai-agent-nav-empty" style="display:none" hidden></div>
        </div>
        <div id="ai-agent-nav-footer">
          <div id="ai-agent-nav-user">
            <span class="ai-agent-nav-pin-slot" aria-hidden="true"></span>
            <span id="ai-agent-nav-user-name"></span>
          </div>
          <button id="ai-agent-logout" type="button" title="退出登录">退出</button>
        </div>
      </aside>
      </div>
      <div id="ai-agent-main">
      <div id="ai-agent-topbar">
        <div id="ai-agent-brand">
          <div id="ai-agent-brand-mark-main">${providerUi.markHtml}</div>
          <div id="ai-agent-brand-text">
            <span id="ai-agent-run-state-main" class="ai-agent-run-state">就绪</span>
            <strong id="ai-agent-chat-title">${providerUi.name}</strong>
          </div>
        </div>
        <div id="ai-agent-top-actions">
          <div id="ai-agent-user-chip" aria-live="polite">
            <span id="ai-agent-user-name"></span>
          </div>
          <button id="ai-agent-new-chat" type="button" title="新对话">新对话</button>
          <button id="ai-agent-fullscreen" type="button" title="全屏" aria-label="全屏" aria-pressed="false">
            <span class="ai-agent-icon-expand" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 3h6v6"></path>
                <path d="M9 21H3v-6"></path>
                <path d="M21 3l-7 7"></path>
                <path d="M3 21l7-7"></path>
              </svg>
            </span>
            <span class="ai-agent-icon-shrink" aria-hidden="true">
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
      <div id="ai-agent-scroll-wrap">
        <div id="ai-agent-messages">
          <div id="ai-agent-empty" aria-hidden="true">
            <h1>${providerUi.emptyTitle}</h1>
            <p>${providerUi.emptySub}</p>
          </div>
          <div id="ai-agent-thread"></div>
        </div>
        <button id="ai-agent-jump-bottom" type="button" title="回到底部">↓ 回到底部</button>
      </div>
      <div id="ai-agent-footer">
        <div id="ai-agent-composer-wrap">
          <div id="ai-agent-queue"></div>
          <div id="ai-agent-ctx-bar">
            <button type="button" id="ai-agent-ctx-ws" class="ai-agent-ctx-chip" title="选择仓库" aria-haspopup="listbox" aria-expanded="false">
              <svg class="ai-agent-ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z"></path>
              </svg>
              <span id="ai-agent-ctx-ws-label" class="ai-agent-ctx-chip-label">No Repo</span>
              <span class="ai-agent-ctx-chevron" aria-hidden="true"></span>
            </button>
            <button type="button" id="ai-agent-ctx-branch" class="ai-agent-ctx-chip" disabled title="当前分支" hidden>
              <span id="ai-agent-ctx-branch-label" class="ai-agent-ctx-chip-label"></span>
            </button>
            <div id="ai-agent-ws-picker" role="listbox" aria-label="选择仓库" aria-hidden="true">
              <input id="ai-agent-ws-search" type="search" placeholder="Search folders, repos..." autocomplete="off">
              <div class="ai-agent-ws-section-label">Recents</div>
              <div id="ai-agent-ws-recents" class="ai-agent-ws-list"></div>
              <div class="ai-agent-ws-section-label">Repos</div>
              <div id="ai-agent-ws-repos" class="ai-agent-ws-list"></div>
              <div id="ai-agent-ws-path-row">
                <input id="ai-agent-ws-path-input" type="text" placeholder="D:\\code\\my-app" spellcheck="false">
                <button type="button" id="ai-agent-ws-path-go">打开</button>
              </div>
              <div class="ai-agent-ws-foot">
                <button type="button" id="ai-agent-ws-use-existing">
                  <svg class="ai-agent-ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z"></path></svg>
                  <span class="ai-agent-ws-item-main">Use Existing...</span>
                  <span class="ai-agent-ws-chevron-r" aria-hidden="true"></span>
                </button>
                <button type="button" id="ai-agent-ws-new-folder">
                  <svg class="ai-agent-ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z"></path>
                    <path d="M12 11v6"></path><path d="M9 14h6"></path>
                  </svg>
                  New Folder
                </button>
              </div>
              <div id="ai-agent-ws-flyout" aria-hidden="true">
                <div id="ai-agent-ws-flyout-panels">
                  <div data-flyout-panel="pc" id="ai-agent-ws-flyout-pc">
                    <input id="ai-agent-ws-flyout-search" type="search" placeholder="Search This PC..." autocomplete="off">
                    <div id="ai-agent-ws-flyout-list" class="ai-agent-ws-list"></div>
                    <button type="button" id="ai-agent-ws-open-folder" class="ai-agent-ws-item">
                      <svg class="ai-agent-ws-item-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z"></path></svg>
                      <span class="ai-agent-ws-item-main"><span class="ai-agent-ws-item-name">Open Folder</span></span>
                    </button>
                    <div id="ai-agent-ws-flyout-path">
                      <input id="ai-agent-ws-flyout-input" type="text" placeholder="D:\\code\\my-app" spellcheck="false">
                      <button type="button" id="ai-agent-ws-flyout-go">打开</button>
                    </div>
                  </div>
                  <div data-flyout-panel="use-existing" id="ai-agent-ws-flyout-use">
                    <button type="button" id="ai-agent-ws-ue-open-folder" class="ai-agent-ws-item">
                      <svg class="ai-agent-ws-item-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z"></path></svg>
                      <span class="ai-agent-ws-item-main"><span class="ai-agent-ws-item-name">Open Folder</span></span>
                    </button>
                    <button type="button" id="ai-agent-ws-ue-ssh" class="ai-agent-ws-item">
                      <svg class="ai-agent-ws-item-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="11" width="18" height="10" rx="2"></rect><path d="M7 11V8a5 5 0 0 1 10 0v3"></path></svg>
                      <span class="ai-agent-ws-item-main"><span class="ai-agent-ws-item-name">Connect via SSH</span></span>
                    </button>
                    <div id="ai-agent-ws-flyout-path-ue">
                      <input id="ai-agent-ws-ue-path-input" type="text" placeholder="D:\\code\\my-app" spellcheck="false">
                      <button type="button" id="ai-agent-ws-ue-path-go">打开</button>
                    </div>
                  </div>
                  <div data-flyout-panel="ssh-tree" id="ai-agent-ws-flyout-ssh-tree">
                    <div id="ai-agent-ws-ssh-tree-head" class="ai-agent-ws-item-path" style="padding:4px 6px 8px;"></div>
                    <div id="ai-agent-ws-ssh-tree-list" class="ai-agent-ws-list"></div>
                    <button type="button" id="ai-agent-ws-ssh-use-here" class="ai-agent-ws-item">
                      <span class="ai-agent-ws-item-main"><span class="ai-agent-ws-item-name">Use this folder</span></span>
                    </button>
                  </div>
                  <div data-flyout-panel="ssh-form" id="ai-agent-ws-flyout-ssh-form">
                    <div id="ai-agent-ws-ssh-form" class="is-on">
                      <label>ID<input id="ai-agent-ws-ssh-id" type="text" placeholder="wxj_35" autocomplete="off"></label>
                      <label>Label<input id="ai-agent-ws-ssh-label" type="text" placeholder="wxj_35" autocomplete="off"></label>
                      <label>Host<input id="ai-agent-ws-ssh-host" type="text" placeholder="10.0.0.1" autocomplete="off"></label>
                      <label>Port<input id="ai-agent-ws-ssh-port" type="number" value="22" min="1" max="65535"></label>
                      <label>User<input id="ai-agent-ws-ssh-user" type="text" placeholder="wxj" autocomplete="off"></label>
                      <label>Auth
                        <select id="ai-agent-ws-ssh-auth">
                          <option value="key">SSH Key</option>
                          <option value="password">Password</option>
                        </select>
                      </label>
                      <label id="ai-agent-ws-ssh-key-wrap">Key path<input id="ai-agent-ws-ssh-key" type="text" placeholder="~/.ssh/id_rsa" autocomplete="off"></label>
                      <label id="ai-agent-ws-ssh-pass-wrap" style="display:none;">Password<input id="ai-agent-ws-ssh-pass" type="password" autocomplete="new-password"></label>
                      <label>Default path<input id="ai-agent-ws-ssh-default" type="text" placeholder="/home/user" autocomplete="off"></label>
                      <div id="ai-agent-ws-ssh-status"></div>
                      <div id="ai-agent-ws-ssh-form-actions">
                        <button type="button" id="ai-agent-ws-ssh-test">测试连接</button>
                        <button type="button" id="ai-agent-ws-ssh-save">保存</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div id="ai-agent-compose-shell">
          <div id="ai-agent-slash-menu" role="listbox" aria-label="Skills"></div>
          <div id="ai-agent-attachments"></div>
          <textarea id="ai-agent-input" rows="1" placeholder="${providerUi.placeholder}"></textarea>
          <div id="ai-agent-compose-toolbar">
            <div id="ai-agent-compose-left">
              <div id="ai-agent-mode-wrap">
                <select id="ai-agent-mode" class="ai-agent-pill is-select" title="模式">
                  <option value="agent">Agent</option>
                  <option value="plan">Plan</option>
                </select>
              </div>
              <div id="ai-agent-think-wrap" title="DeepSeek 深度思考">
                <button type="button" id="ai-agent-thinking" class="ai-agent-pill" aria-pressed="false">
                  深度思考
                </button>
              </div>
              <div id="ai-agent-model-wrap">
                <button id="ai-agent-model-btn" type="button" title="模型" aria-haspopup="listbox" aria-expanded="false">
                  <span id="ai-agent-model-label"></span>
                  <span id="ai-agent-model-chevron" aria-hidden="true"></span>
                </button>
                <div id="ai-agent-model-menu" role="listbox" aria-label="选择模型">
                  <div id="ai-agent-model-auto-row">
                    <div id="ai-agent-model-auto-copy">
                      <strong>Auto</strong>
                      <span>自动选择适合当前任务的模型</span>
                      <span id="ai-agent-model-auto-resolved"></span>
                    </div>
                    <button id="ai-agent-model-auto" type="button" role="switch" aria-checked="false" title="Auto"></button>
                  </div>
                  <div id="ai-agent-model-list"></div>
                </div>
                <input id="ai-agent-model" type="hidden" value="${defaultModel}" />
              </div>
            </div>
            <div id="ai-agent-compose-right">
              <input id="ai-agent-file-input" type="file" multiple />
              <button id="ai-agent-pick-file" type="button" title="添加文件">📎</button>
              <button id="ai-agent-send" type="button" title="发送">↑</button>
              <button id="ai-agent-stop" type="button" title="终止对话"><span id="ai-agent-stop-square"></span></button>
            </div>
          </div>
        </div>
        </div>
      </div>
      </div>
      <aside id="ai-agent-ide-rail" aria-label="侧栏工具">
        <button type="button" id="ai-agent-ide-rail-new" class="ai-agent-ide-rail-btn" title="新建" aria-label="新建">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
            <path d="M8 3.5v9"/>
            <path d="M3.5 8h9"/>
            <path d="M4 13.5h8"/>
          </svg>
          <span class="ai-agent-ide-rail-label">新建</span>
        </button>
        <button type="button" id="ai-agent-ide-rail-browser" class="ai-agent-ide-rail-btn" title="浏览器" aria-label="浏览器">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5"/>
            <path d="M2.5 8h11"/>
            <path d="M8 2.5c1.8 1.8 2.7 3.6 2.7 5.5S9.8 11.7 8 13.5C6.2 11.7 5.3 9.9 5.3 8S6.2 4.3 8 2.5z"/>
          </svg>
          <span class="ai-agent-ide-rail-label">浏览器</span>
        </button>
        <button type="button" id="ai-agent-ide-rail-terminal" class="ai-agent-ide-rail-btn" title="终端" aria-label="终端">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3.5 5.5L7 8l-3.5 2.5"/>
            <path d="M8 11.5h4.5"/>
          </svg>
          <span class="ai-agent-ide-rail-label">终端</span>
        </button>
        <button type="button" id="ai-agent-ide-rail-files" class="ai-agent-ide-rail-btn" title="文件" aria-label="文件">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 2.5h5.5L12 5v8.5H4z"/>
            <path d="M9.5 2.5V5H12"/>
          </svg>
          <span class="ai-agent-ide-rail-label">文件</span>
        </button>
        <button type="button" id="ai-agent-ide-rail-expand" class="ai-agent-ide-rail-btn" title="展开" aria-label="展开" aria-expanded="false">
          <svg class="ai-agent-ide-rail-expand-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 4L5 8l4 4"/>
            <path d="M12 4L8 8l4 4"/>
          </svg>
          <span class="ai-agent-ide-rail-label">收起</span>
        </button>
      </aside>
      <aside id="ai-agent-ide" aria-label="代码编辑" data-panel="files">
        <div id="ai-agent-ide-resize" title="拖动调整宽度" aria-hidden="true"></div>
        <div id="ai-agent-ide-topbar">
          <div id="ai-agent-ide-tabs">
            <div id="ai-agent-ide-tabs-scroll"></div>
            <button type="button" id="ai-agent-ide-maximize" title="全屏编辑器" aria-label="全屏编辑器" aria-pressed="false">
              <span class="ai-agent-icon-expand" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6V3h3"/><path d="M13 6V3h-3"/><path d="M3 10v3h3"/><path d="M13 10v3h-3"/>
                </svg>
              </span>
              <span class="ai-agent-icon-shrink" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 3v3H3"/><path d="M10 3v3h3"/><path d="M6 13v-3H3"/><path d="M10 13v-3h3"/>
                </svg>
              </span>
            </button>
          </div>
          <div id="ai-agent-ide-top-actions">
            <button id="ai-agent-toggle-ide-dock" type="button" title="切换编辑器 (Ctrl+G)" aria-label="切换编辑器" aria-pressed="true">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="1.5" y="2" width="13" height="12" rx="1.2" stroke="currentColor" stroke-width="1.2"/>
                <path d="M10.5 2.5v11" stroke="currentColor" stroke-width="1.2"/>
                <rect x="10.5" y="2.5" width="4" height="11" fill="currentColor" opacity=".22"/>
              </svg>
            </button>
          </div>
        </div>
        <div id="ai-agent-ide-body">
          <div id="ai-agent-ide-editor">
            <div id="ai-agent-ide-crumb">
              <button type="button" id="ai-agent-ide-back" class="ai-agent-ide-icon-btn" title="上一个文件" aria-label="上一个文件" disabled>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M10 3L5 8l5 5"/>
                </svg>
              </button>
              <button type="button" id="ai-agent-ide-forward" class="ai-agent-ide-icon-btn" title="下一个文件" aria-label="下一个文件" disabled>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M6 3l5 5-5 5"/>
                </svg>
              </button>
              <span id="ai-agent-ide-crumb-name"></span>
              <span id="ai-agent-ide-crumb-spacer"></span>
              <div id="ai-agent-ide-view-tools">
                <button type="button" id="ai-agent-ide-view-preview" class="ai-agent-ide-view-btn" title="预览">预览</button>
                <button type="button" id="ai-agent-ide-view-source" class="ai-agent-ide-view-btn is-on" title="源码">源码</button>
              </div>
              <button type="button" id="ai-agent-ide-find-toggle" class="ai-agent-ide-icon-btn" title="查找 (Ctrl+F)" aria-label="查找">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
                  <circle cx="7" cy="7" r="4.2"/>
                  <path d="M10.2 10.2L13.5 13.5" stroke-linecap="round"/>
                </svg>
              </button>
              <button type="button" id="ai-agent-ide-outline-toggle" class="ai-agent-ide-icon-btn" title="大纲" aria-label="大纲">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
                  <path d="M3 4h10"/><path d="M3 8h7"/><path d="M3 12h10"/>
                </svg>
              </button>
              <button type="button" id="ai-agent-ide-save" class="ai-agent-ide-icon-btn" title="保存 (Ctrl+S)" aria-label="保存">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3.5 2.5h7.2L13 4.8V13.5H3.5z"/>
                  <path d="M5 2.5v3.5h5.5V2.5"/>
                  <path d="M5 13.5v-4h6v4"/>
                </svg>
              </button>
            </div>
            <div id="ai-agent-ide-find">
              <input id="ai-agent-ide-find-input" type="text" placeholder="在文件中查找">
              <span id="ai-agent-ide-find-count"></span>
              <button type="button" id="ai-agent-ide-find-prev" class="ai-agent-ide-icon-btn" title="上一个" aria-label="上一个">↑</button>
              <button type="button" id="ai-agent-ide-find-next" class="ai-agent-ide-icon-btn" title="下一个" aria-label="下一个">↓</button>
              <button type="button" id="ai-agent-ide-find-close" class="ai-agent-ide-icon-btn" title="关闭" aria-label="关闭">×</button>
            </div>
            <div id="ai-agent-ide-stage">
              <div id="ai-agent-ide-code-wrap" style="display:none">
                <div id="ai-agent-ide-gutter" aria-hidden="true"></div>
                <div id="ai-agent-ide-code-pane">
                  <pre id="ai-agent-ide-highlight" aria-hidden="true"><code></code></pre>
                  <textarea id="ai-agent-ide-code" spellcheck="false"></textarea>
                </div>
              </div>
              <div id="ai-agent-ide-preview" aria-label="Markdown 预览"></div>
              <div id="ai-agent-ide-empty">打开文件或等 Agent 修改代码后，会显示在这里。</div>
              <div id="ai-agent-ide-outline" aria-label="文档大纲"></div>
            </div>
          </div>
          <div id="ai-agent-ide-explorer">
            <div id="ai-agent-ide-tree-resize" title="拖动调整资源管理器宽度" aria-hidden="true"></div>
            <div id="ai-agent-ide-explorer-head">
              <strong id="ai-agent-ide-root-name">资源管理器</strong>
              <div id="ai-agent-ide-explorer-actions">
                <button type="button" id="ai-agent-ide-new-file" class="ai-agent-ide-icon-btn" title="新建文件" aria-label="新建文件">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M4 2.5h5.5L12 5v8.5H4z"/>
                    <path d="M9.5 2.5V5H12"/>
                    <path d="M8 7.5v4"/>
                    <path d="M6 9.5h4"/>
                  </svg>
                </button>
                <button type="button" id="ai-agent-ide-new-folder" class="ai-agent-ide-icon-btn" title="新建文件夹" aria-label="新建文件夹">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M2.5 4.5h4l1.2 1.3H13.5v6.7H2.5z"/>
                    <path d="M8 8v4"/>
                    <path d="M6 10h4"/>
                  </svg>
                </button>
                <button type="button" id="ai-agent-ide-refresh" class="ai-agent-ide-icon-btn" title="刷新" aria-label="刷新">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M13 8a5 5 0 1 1-1.3-3.4"/>
                    <path d="M13 2.5V5.5H10"/>
                  </svg>
                </button>
                <button type="button" id="ai-agent-ide-collapse-all" class="ai-agent-ide-icon-btn" title="全部折叠" aria-label="全部折叠">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 4.5h10"/>
                    <path d="M5 8h8"/>
                    <path d="M7 11.5h6"/>
                  </svg>
                </button>
              </div>
            </div>
            <div id="ai-agent-ide-tree"></div>
          </div>
          <div id="ai-agent-ide-panel-browser">
            <div id="ai-agent-ide-browser-bar">
              <input id="ai-agent-ide-browser-url" type="url" placeholder="https://" value="https://">
              <button type="button" id="ai-agent-ide-browser-go" class="ai-agent-ide-icon-btn" title="前往" aria-label="前往">→</button>
            </div>
            <iframe id="ai-agent-ide-browser-frame" title="浏览器" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
          </div>
          <div id="ai-agent-ide-panel-terminal">
            <div class="ai-agent-ide-panel-empty" style="display:none" id="ai-agent-ide-term-hint">
              <div>
                <strong>终端</strong>
                在下方输入命令，回车执行（工作区目录）。
              </div>
            </div>
            <textarea id="ai-agent-ide-term" spellcheck="false" placeholder="$ 在此输入命令，回车执行"></textarea>
          </div>
        </div>
      </aside>
      </div>
      <div id="ai-agent-ide-ctx" role="menu" aria-hidden="true"></div>
      <div id="ai-agent-nav-item-menu" role="menu" aria-hidden="true"></div>
    </div>
    <div id="ai-agent-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="ai-agent-confirm-title" aria-hidden="true">
      <div id="ai-agent-confirm-card">
        <h2 id="ai-agent-confirm-title">确认</h2>
        <p id="ai-agent-confirm-message"></p>
        <div id="ai-agent-confirm-actions">
          <button type="button" id="ai-agent-confirm-cancel">取消</button>
          <button type="button" class="danger" id="ai-agent-confirm-ok">确定</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  var modeField = document.getElementById("ai-agent-mode");
  var thinkWrap = document.getElementById("ai-agent-think-wrap");
  var thinkingField = document.getElementById("ai-agent-thinking");

  if (!providerUi.showAuto) {
    var autoRowEl = document.getElementById("ai-agent-model-auto-row");
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

  var backdrop = document.getElementById("ai-agent-backdrop");
  var trigger = document.getElementById("ai-agent-trigger");
  var sidebar = document.getElementById("ai-agent-sidebar");
  var resizeHandle = document.getElementById("ai-agent-resize-handle");
  var closeBtn = document.getElementById("ai-agent-close");
  var fullscreenBtn = document.getElementById("ai-agent-fullscreen");
  var sendBtn = document.getElementById("ai-agent-send");
  var composeShell = document.getElementById("ai-agent-compose-shell");
  var inputField = document.getElementById("ai-agent-input");
  var slashMenu = document.getElementById("ai-agent-slash-menu");
  var modelWrap = document.getElementById("ai-agent-model-wrap");
  var modelBtn = document.getElementById("ai-agent-model-btn");
  var modelLabel = document.getElementById("ai-agent-model-label");
  var modelMenu = document.getElementById("ai-agent-model-menu");
  var modelList = document.getElementById("ai-agent-model-list");
  var modelAutoBtn = document.getElementById("ai-agent-model-auto");
  var modelAutoResolved = document.getElementById("ai-agent-model-auto-resolved");
  var modelField = document.getElementById("ai-agent-model");
  var messagesDiv = document.getElementById("ai-agent-messages");
  var threadDiv = document.getElementById("ai-agent-thread");
  var emptyEl = document.getElementById("ai-agent-empty");
  var jumpBottomBtn = document.getElementById("ai-agent-jump-bottom");
  var stickToBottom = true;
  var runState = document.getElementById("ai-agent-run-state");
  var attachmentsDiv = document.getElementById("ai-agent-attachments");
  var queueDiv = document.getElementById("ai-agent-queue");
  var pickFileBtn = document.getElementById("ai-agent-pick-file");
  var fileInput = document.getElementById("ai-agent-file-input");
  var newChatBtn = document.getElementById("ai-agent-new-chat");
  var stopBtn = document.getElementById("ai-agent-stop");
  var SIDEBAR_WIDTH_KEY = "ai-agent-sidebar-width";
  var SIDEBAR_OPEN_KEY = "ai-agent-sidebar-open";
  var SIDEBAR_FULLSCREEN_KEY = "ai-agent-fullscreen";
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
        document.body.classList.add("ai-agent-page-locked");
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
        document.body.classList.add("ai-agent-page-locked");
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
    }
  }
  function markRunSlotSettled(convId) {
    if (convId == null) return;
    var slot = getRunSlot(convId);
    slot.busy = false;
    slot.settled = true;
    slot.pendingFollow = true; // still should /follow on open for final text
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
  var HISTORY_KEY = "ai-agent-chat-history:" + provider;
  function historyStorageKey() {
    var uid = currentUser && currentUser.id != null ? String(currentUser.id) : "anon";
    return "ai-agent-chat-history:" + uid + ":" + provider;
  }
  var MODEL_KEY = "ai-agent-selected-model:" + provider;
  var historySaveTimer = null;
  var logoutBtn = document.getElementById("ai-agent-logout");
  var userChip = document.getElementById("ai-agent-user-chip");
  var userNameEl = document.getElementById("ai-agent-user-name");
  var navUserNameEl = document.getElementById("ai-agent-nav-user-name");
  var navRailAvatarEl = document.getElementById("ai-agent-nav-rail-avatar");
  var navNewBtn = document.getElementById("ai-agent-nav-new");
  var activeConversationId = null;
  var conversationList = [];
  var activeWorkspaceRoot = "";
  var homeWorkspaceRoot = "";
  var chatTitleEl = document.getElementById("ai-agent-chat-title");
  function setActiveWorkspace(root, title, opts) {
    opts = opts || {};
    activeWorkspaceRoot = (root || "").trim();
    if (chatTitleEl && !opts.keepTitle) {
      var name = title || "";
      if (!name && activeWorkspaceRoot) {
        if (homeWorkspaceRoot && activeWorkspaceRoot.toLowerCase() === homeWorkspaceRoot.toLowerCase()) {
          name = "Home";
        } else {
          var parts = activeWorkspaceRoot.replace(/\\/g, "/").split("/");
          name = parts[parts.length - 1] || activeWorkspaceRoot;
        }
      }
      chatTitleEl.textContent = name || "Home";
    }
    if (typeof window.syncWorkspaceContextUi === "function") window.syncWorkspaceContextUi();
    if (typeof updateCrumb === "function") updateCrumb();
  }
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
