(function () {
  var script = document.currentScript;
  var scriptUrl = "";
  try {
    scriptUrl = script ? new URL(script.src, window.location.href) : null;
  } catch (err) {
    scriptUrl = null;
  }
  var inferredApiBase = scriptUrl ? scriptUrl.origin : window.location.origin;
  var apiBase = (script && script.getAttribute("data-api-base")) || inferredApiBase;
  var defaultModel = (script && script.getAttribute("data-default-model")) || "composer-2.5";
  var sessionId = localStorage.getItem("ai-agent-session-id") || "";

  var styles = `
    #ai-agent-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.18);
      z-index: 2147482999; opacity: 0; pointer-events: none; transition: opacity .2s ease;
    }
    #ai-agent-backdrop.open { opacity: 1; pointer-events: auto; }
    #ai-agent-trigger {
      position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px;
      background: linear-gradient(135deg, #10a37f, #1a7f64); color: #fff; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; cursor: pointer;
      box-shadow: 0 10px 28px rgba(16,163,127,.35); z-index: 2147483000;
      font: 700 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; user-select: none;
    }
    #ai-agent-sidebar {
      --ai-bg: #ffffff;
      --ai-surface: #f7f7f8;
      --ai-border: rgba(0,0,0,.08);
      --ai-text: #0d0d0d;
      --ai-muted: #6b6b6b;
      --ai-accent: #0d0d0d;
      --ai-user-bg: #f4f4f4;
      --ai-composer-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.06);
      --ai-sidebar-width: 520px;
      --ai-content-width: 768px;
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
    #ai-agent-sidebar.is-resizing { transition: none; user-select: none; }
    #ai-agent-sidebar *, #ai-agent-sidebar *::before, #ai-agent-sidebar *::after { box-sizing: border-box; }
    #ai-agent-sidebar.open { right: 0; }
    #ai-agent-sidebar.is-fullscreen {
      --ai-sidebar-width: 100vw;
      right: -100vw;
      width: 100vw;
      max-width: 100vw;
      box-shadow: none;
    }
    #ai-agent-sidebar.is-fullscreen.open { right: 0; left: 0; }
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
      padding: 0 16px; background: #fff; backdrop-filter: none;
    }
    #ai-agent-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
    #ai-agent-brand-mark {
      width: 28px; height: 28px; border-radius: 8px;
      background: linear-gradient(135deg, #10a37f, #1a7f64);
      color: #fff; display: grid; place-items: center;
      font: 700 12px/1 -apple-system, sans-serif; flex: 0 0 auto;
    }
    #ai-agent-brand-text {
      display: flex; align-items: baseline; gap: 8px; min-width: 0;
    }
    #ai-agent-brand strong {
      font-size: 15px; font-weight: 600; color: var(--ai-text);
      line-height: 1.2; flex: 0 0 auto;
    }
    #ai-agent-run-state {
      font-size: 12px; line-height: 1.2; color: #10a37f; margin: 0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
    }
    #ai-agent-run-state.is-busy { color: var(--ai-muted); }
    #ai-agent-top-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
    #ai-agent-new-chat, #ai-agent-fullscreen, #ai-agent-close {
      border: 1px solid var(--ai-border); background: #fff; color: var(--ai-text);
      border-radius: 999px; padding: 7px 12px; font: 13px/1.2 inherit; cursor: pointer;
    }
    #ai-agent-new-chat:hover, #ai-agent-fullscreen:hover, #ai-agent-close:hover { background: var(--ai-surface); }
    #ai-agent-fullscreen, #ai-agent-close {
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
      display: block; padding: 4px 10px;
      font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: pre-wrap; word-break: break-word;
    }
    .ai-agent-diff-line.added { background: #ecfdf5; color: #166534; }
    .ai-agent-diff-line.removed { background: #fef2f2; color: #991b1b; }
    .ai-agent-msg { display: flex; gap: 12px; align-items: flex-start; width: 100%; }
    .ai-agent-msg.user { justify-content: flex-end; }
    .ai-agent-msg.agent { justify-content: flex-start; }
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
    .ai-agent-msg .body a {
      color: #2563eb; text-decoration: underline; text-underline-offset: 2px;
      word-break: break-word;
    }
    .ai-agent-msg .body a:hover { color: #1d4ed8; }
    .ai-agent-msg .body hr {
      border: 0; border-top: 1px solid var(--ai-border); margin: 12px 0;
    }
    .ai-agent-msg .body .md-table-wrap {
      overflow-x: auto; margin: 0 0 12px; -webkit-overflow-scrolling: touch;
    }
    .ai-agent-msg .body table {
      width: 100%; border-collapse: collapse; margin: 0 0 12px;
      font-size: 14px; line-height: 1.45;
    }
    .ai-agent-msg .body .md-table-wrap table { margin: 0; }
    .ai-agent-msg .body th,
    .ai-agent-msg .body td {
      border: 1px solid var(--ai-border); padding: 8px 10px; text-align: left;
      vertical-align: top;
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
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 10px; border-radius: 999px; border: 1px solid var(--ai-border);
      background: #fff; color: #333; font-size: 12px; max-width: 220px;
    }
    .ai-agent-file-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
    #ai-agent-attachments { display: flex; flex-wrap: wrap; gap: 8px; }
    #ai-agent-attachments:empty { display: none; }
    .ai-agent-thumb { position: relative; width: 56px; height: 56px; }
    .ai-agent-thumb img {
      width: 100%; height: 100%; object-fit: cover;
      border-radius: 10px; border: 1px solid var(--ai-border); background: #fff;
    }
    .ai-agent-thumb.file {
      width: auto; min-width: 110px; height: auto;
      padding: 8px 26px 8px 10px; border: 1px solid var(--ai-border);
      border-radius: 10px; background: #fafafa; color: #333; font-size: 12px;
    }
    .ai-agent-thumb.file .name {
      display: block; max-width: 150px; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; font-weight: 650;
    }
    .ai-agent-thumb.file .kind { color: var(--ai-muted); margin-top: 2px; display: block; }
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
    #ai-agent-compose-toolbar {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    #ai-agent-compose-left, #ai-agent-compose-right {
      display: flex; align-items: center; gap: 6px; min-width: 0;
    }
    #ai-agent-mode {
      appearance: none;
      border: 0;
      background: #f4f4f4 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b6b6b' d='M3 4.5L6 8l3-3.5'/%3E%3C/svg%3E") right 8px center no-repeat;
      border-radius: 999px;
      padding: 5px 20px 5px 10px;
      max-width: 82px;
      font: 12px/1.2 inherit;
      color: var(--ai-muted);
      cursor: pointer;
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
    #ai-agent-mode:hover { color: var(--ai-text); }
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
    <div id="ai-agent-trigger" title="AI Agent">AI</div>
    <div id="ai-agent-sidebar">
      <div id="ai-agent-resize-handle" title="拖动调整宽度" aria-hidden="true"></div>
      <div id="ai-agent-topbar">
        <div id="ai-agent-brand">
          <div id="ai-agent-brand-mark">AI</div>
          <div id="ai-agent-brand-text">
            <strong>Ai-agent</strong>
            <span id="ai-agent-run-state">就绪</span>
          </div>
        </div>
        <div id="ai-agent-top-actions">
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
          <button id="ai-agent-close" type="button" title="关闭">×</button>
        </div>
      </div>
      <div id="ai-agent-scroll-wrap">
        <div id="ai-agent-messages">
          <div id="ai-agent-thread"></div>
        </div>
        <button id="ai-agent-jump-bottom" type="button" title="回到底部">↓ 回到底部</button>
      </div>
      <div id="ai-agent-footer">
        <div id="ai-agent-composer-wrap">
          <div id="ai-agent-queue"></div>
          <div id="ai-agent-compose-shell">
          <div id="ai-agent-attachments"></div>
          <textarea id="ai-agent-input" rows="1" placeholder="给 Ai-agent 发送消息"></textarea>
          <div id="ai-agent-compose-toolbar">
            <div id="ai-agent-compose-left">
              <div id="ai-agent-mode-wrap">
                <select id="ai-agent-mode" title="模式">
                  <option value="agent">Agent</option>
                  <option value="plan">Plan</option>
                </select>
              </div>
              <div id="ai-agent-model-wrap">
                <button id="ai-agent-model-btn" type="button" title="模型" aria-haspopup="listbox" aria-expanded="false">
                  <span id="ai-agent-model-label">Composer 2.5</span>
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
                <input id="ai-agent-model" type="hidden" value="composer-2.5" />
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
  `;
  document.body.appendChild(container);

  var backdrop = document.getElementById("ai-agent-backdrop");
  var trigger = document.getElementById("ai-agent-trigger");
  var sidebar = document.getElementById("ai-agent-sidebar");
  var resizeHandle = document.getElementById("ai-agent-resize-handle");
  var closeBtn = document.getElementById("ai-agent-close");
  var fullscreenBtn = document.getElementById("ai-agent-fullscreen");
  var sendBtn = document.getElementById("ai-agent-send");
  var composeShell = document.getElementById("ai-agent-compose-shell");
  var inputField = document.getElementById("ai-agent-input");
  var modeField = document.getElementById("ai-agent-mode");
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
  var jumpBottomBtn = document.getElementById("ai-agent-jump-bottom");
  var stickToBottom = true;
  var runState = document.getElementById("ai-agent-run-state");
  var attachmentsDiv = document.getElementById("ai-agent-attachments");
  var queueDiv = document.getElementById("ai-agent-queue");
  var pickFileBtn = document.getElementById("ai-agent-pick-file");
  var fileInput = document.getElementById("ai-agent-file-input");
  var newChatBtn = document.getElementById("ai-agent-new-chat");
  var stopBtn = document.getElementById("ai-agent-stop");
  var pendingFiles = [];
  var sendQueue = [];
  var isRunning = false;
  var queueSeq = 0;
  var activeAbort = null;
  var stopRequested = false;
  var queueCollapsed = false;
  // Agent bubble left after ■ stop; removed when the user sends again.
  var stoppedAgentMsg = null;
  var serverBootId = "";
  var HISTORY_KEY = "ai-agent-chat-history";
  var historySaveTimer = null;
  var modelOptions = [
    { id: "composer-2.5", label: "Composer 2.5" },
    { id: "auto", label: "Auto" },
  ];
  var lastManualModel = defaultModel === "auto" ? "composer-2.5" : defaultModel;
  var autoResolvedModel = "";
  var autoResolvedLabel = "";
  modelField.value = defaultModel;

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
      var data = card.__cardData || {};
      return {
        kind: data.kind || "tool",
        title: data.title || (card.querySelector(".ai-agent-card-title") || {}).textContent || "",
        detail: data.detail || "",
        paths: data.paths || [],
      };
    }).filter(function (card) {
      return card.title || card.detail;
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
      Array.prototype.slice.call(msg.querySelectorAll(".ai-agent-msg-images img")).forEach(function (img) {
        attachments.push({ kind: "image", name: img.alt || "image", mime_type: "image/*" });
      });
      Array.prototype.slice.call(msg.querySelectorAll(".ai-agent-file-chip span")).forEach(function (span) {
        attachments.push({ kind: "file", name: span.textContent || "file", mime_type: "" });
      });
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

  function saveChatHistory() {
    if (!serverBootId) return;
    try {
      var payload = {
        bootId: serverBootId,
        sessionId: sessionId || "",
        model: modelField.value || defaultModel,
        messages: collectHistoryMessages(),
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

  function restoreChatHistory(bootId) {
    var raw = "";
    try { raw = localStorage.getItem(HISTORY_KEY) || ""; } catch (err) { return false; }
    if (!raw) return false;
    var data = null;
    try { data = JSON.parse(raw); } catch (err) {
      clearChatHistory();
      return false;
    }
    if (!data || data.bootId !== bootId) {
      // Service restarted — drop stale UI history (backend sessions are gone).
      clearChatHistory();
      sessionId = "";
      try { localStorage.removeItem("ai-agent-session-id"); } catch (err) {}
      return false;
    }
    if (data.sessionId) {
      sessionId = data.sessionId;
      try { localStorage.setItem("ai-agent-session-id", sessionId); } catch (err) {}
    }
    if (data.model) setSelectedModel(data.model, false);
    threadDiv.innerHTML = "";
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
    if (threadDiv.children.length) {
      scrollToBottom(true);
      return true;
    }
    return false;
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

  function modelPickerLabel(id) {
    if (id === "auto") return "Auto";
    return modelLabelFor(id);
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
    modelWrap.classList.add("is-open");
    modelBtn.classList.add("is-open");
    modelBtn.setAttribute("aria-expanded", "true");
  }

  function syncModelPickerUI() {
    var id = modelField.value || defaultModel;
    var isAuto = id === "auto";
    modelWrap.classList.toggle("is-auto", isAuto);
    modelAutoBtn.setAttribute("aria-checked", isAuto ? "true" : "false");
    modelLabel.textContent = modelPickerLabel(id);
    if (modelAutoResolved) modelAutoResolved.textContent = "";
    modelBtn.title = modelPickerLabel(id);
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
    if (!seen.auto) modelOptions.unshift({ id: "auto", label: "Auto" });
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
  }

  async function loadModelOptions() {
    try {
      var res = await fetch(apiBase + "/api/health");
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      serverBootId = data.boot_id || "";
      fillModelOptions(data.model_options, defaultModel || data.model);
      if (serverBootId) restoreChatHistory(serverBootId);
    } catch (err) {
      fillModelOptions(
        [
          { id: "composer-2.5", label: "Composer 2.5" },
          { id: "auto", label: "Auto" },
        ],
        defaultModel
      );
    }
  }

  var SIDEBAR_WIDTH_KEY = "ai-agent-sidebar-width";
  var SIDEBAR_FULLSCREEN_KEY = "ai-agent-fullscreen";
  var MIN_SIDEBAR_WIDTH = 360;

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

  function setFullscreen(on) {
    sidebar.classList.toggle("is-fullscreen", !!on);
    trigger.classList.toggle("is-hidden", !!on && sidebar.classList.contains("open"));
    fullscreenBtn.title = on ? "退出全屏" : "全屏";
    fullscreenBtn.setAttribute("aria-pressed", on ? "true" : "false");
    localStorage.setItem(SIDEBAR_FULLSCREEN_KEY, on ? "1" : "0");
    syncBackdrop();
    syncPageScrollLock();
  }

  function openSidebar() {
    sidebar.classList.add("open");
    if (isFullscreen()) trigger.classList.add("is-hidden");
    syncBackdrop();
    syncPageScrollLock();
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("open");
    trigger.classList.remove("is-hidden");
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
  if (localStorage.getItem(SIDEBAR_FULLSCREEN_KEY) === "1") setFullscreen(true);

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

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatInlineMarkdown(text) {
    var escaped = escapeHtml(text).replace(/&lt;br\s*\/?&gt;/gi, "<br />");
    var inlineCodes = [];
    var out = escaped.replace(/`([^`\n]+)`/g, function (_, code) {
      inlineCodes.push("<code>" + code + "</code>");
      return "%%INLINECODE_" + (inlineCodes.length - 1) + "%%";
    });
    out = out
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/(^|[^"'>])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.+?)__/g, "<strong>$1</strong>")
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
      .replace(/~~(.+?)~~/g, "<del>$1</del>");
    return out.replace(/%%INLINECODE_(\d+)%%/g, function (_, index) {
      return inlineCodes[Number(index)] || "";
    });
  }

  function isTableRowLine(line) {
    var trimmed = String(line || "").trim();
    return trimmed.indexOf("|") >= 0 && /^\|?.+\|.+/.test(trimmed);
  }

  function parseTableCells(line) {
    var trimmed = String(line || "").trim();
    if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
    if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
    return trimmed.split("|").map(function (cell) { return cell.trim(); });
  }

  function isTableSeparatorCells(cells) {
    return cells.length > 0 && cells.every(function (cell) {
      return /^:?-{3,}:?$/.test(cell);
    });
  }

  function readTableBlock(lines, start) {
    var rows = [];
    var i = start;
    while (i < lines.length) {
      var trimmed = lines[i].trim();
      if (!trimmed) {
        i += 1;
        continue;
      }
      if (!isTableRowLine(lines[i])) break;
      rows.push(parseTableCells(lines[i]));
      i += 1;
    }
    if (rows.length < 2 || !isTableSeparatorCells(rows[1])) return null;
    var header = rows[0];
    var bodyRows = rows.slice(2);
    var parts = ['<div class="md-table-wrap"><table><thead><tr>'];
    header.forEach(function (cell) {
      parts.push("<th>" + formatInlineMarkdown(cell) + "</th>");
    });
    parts.push("</tr></thead><tbody>");
    bodyRows.forEach(function (row) {
      parts.push("<tr>");
      for (var c = 0; c < header.length; c += 1) {
        parts.push("<td>" + formatInlineMarkdown(row[c] || "") + "</td>");
      }
      parts.push("</tr>");
    });
    parts.push("</tbody></table></div>");
    return { html: parts.join(""), next: i };
  }

  function normalizeCodeLang(lang) {
    var raw = String(lang || "").trim().toLowerCase();
    if (!raw) return "generic";
    if (/^(c\+\+|cpp|cc|cxx|hpp|h\+\+)$/.test(raw)) return "cpp";
    if (/^(c|h)$/.test(raw)) return "c";
    if (/^(js|javascript|jsx|mjs|cjs)$/.test(raw)) return "javascript";
    if (/^(ts|typescript|tsx)$/.test(raw)) return "typescript";
    if (/^(py|python|python3)$/.test(raw)) return "python";
    if (/^(sh|bash|shell|zsh)$/.test(raw)) return "bash";
    if (/^(yml|yaml)$/.test(raw)) return "yaml";
    if (/^(md|markdown)$/.test(raw)) return "markdown";
    return raw;
  }

  function highlightCode(code, lang) {
    var source = String(code || "").replace(/\n$/, "");
    var kind = normalizeCodeLang(lang);
    var keywords = {
      python: "False|True|None|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield",
      cpp: "alignas|alignof|and|and_eq|asm|auto|bitand|bitor|bool|break|case|catch|char|char8_t|char16_t|char32_t|class|compl|concept|const|consteval|constexpr|constinit|const_cast|continue|co_await|co_return|co_yield|decltype|default|delete|do|double|dynamic_cast|else|enum|explicit|export|extern|false|float|for|friend|goto|if|inline|int|long|mutable|namespace|new|noexcept|not|not_eq|nullptr|operator|or|or_eq|private|protected|public|register|reinterpret_cast|requires|return|short|signed|sizeof|static|static_assert|static_cast|struct|switch|template|this|thread_local|throw|true|try|typedef|typeid|typename|union|unsigned|using|virtual|void|volatile|wchar_t|while|xor|xor_eq",
      c: "auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|_Bool|_Complex|_Imaginary",
      javascript: "async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|true|try|typeof|undefined|var|void|while|with|yield",
      typescript: "abstract|any|as|asserts|async|await|boolean|break|case|catch|class|const|constructor|continue|debugger|declare|default|delete|do|else|enum|export|extends|false|finally|for|from|function|get|if|implements|import|in|infer|instanceof|interface|is|keyof|let|module|namespace|never|new|null|number|object|of|package|private|protected|public|readonly|require|return|set|static|string|super|switch|symbol|this|throw|true|try|type|typeof|undefined|unique|unknown|var|void|while|with|yield",
      bash: "if|then|else|elif|fi|for|while|do|done|case|esac|function|select|until|in|time|coproc",
      go: "break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go|goto|if|import|interface|map|package|range|return|select|struct|switch|type|var",
      rust: "as|async|await|break|const|continue|crate|dyn|else|enum|extern|false|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|self|Self|static|struct|super|trait|true|type|unsafe|use|where|while",
      java: "abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while|true|false|null",
      sql: "add|all|alter|and|as|asc|between|by|case|check|column|constraint|create|database|default|delete|desc|distinct|drop|else|end|exists|foreign|from|full|group|having|in|index|inner|insert|into|is|join|key|left|like|limit|not|null|on|or|order|outer|primary|references|right|select|set|table|then|union|unique|update|values|when|where",
    };
    var types = {
      cpp: "string|wstring|u16string|u32string|vector|map|set|unordered_map|unordered_set|pair|tuple|optional|variant|array|deque|list|queue|stack|priority_queue|shared_ptr|unique_ptr|weak_ptr|size_t|ssize_t|ptrdiff_t|int8_t|int16_t|int32_t|int64_t|uint8_t|uint16_t|uint32_t|uint64_t|ifstream|ofstream|ostream|istream|stringstream",
      c: "size_t|ssize_t|ptrdiff_t|int8_t|int16_t|int32_t|int64_t|uint8_t|uint16_t|uint32_t|uint64_t|FILE",
      typescript: "string|number|boolean|object|symbol|bigint|any|unknown|never|void|Record|Partial|Required|Readonly|Array|Promise|Map|Set",
      java: "String|Integer|Boolean|Double|Float|Long|Short|Byte|Character|Object|List|Map|Set|Optional",
      go: "string|bool|byte|rune|error|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|uintptr|float32|float64|complex64|complex128",
      rust: "String|str|bool|char|i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize|f32|f64|Vec|Option|Result|Box|Rc|Arc|HashMap|HashSet",
      python: "int|float|str|bool|list|dict|set|tuple|bytes|object|NoneType",
    };
    var kw = keywords[kind] || keywords.javascript;
    var ty = types[kind] || "";
    var tokens = [];
    var i = 0;
    var n = source.length;

    function pushTok(type, value) {
      if (!value) return;
      tokens.push({ type: type, value: value });
    }

    function startsWith(str) {
      return source.slice(i, i + str.length) === str;
    }

    while (i < n) {
      var ch = source[i];
      var next = source[i + 1] || "";

      // comments
      if (kind === "python" && ch === "#") {
        var cEnd = source.indexOf("\n", i);
        if (cEnd < 0) cEnd = n;
        pushTok("cmt", source.slice(i, cEnd));
        i = cEnd;
        continue;
      }
      if ((kind === "bash") && ch === "#") {
        var bEnd = source.indexOf("\n", i);
        if (bEnd < 0) bEnd = n;
        pushTok("cmt", source.slice(i, bEnd));
        i = bEnd;
        continue;
      }
      if (ch === "/" && next === "/" && kind !== "python") {
        var lineEnd = source.indexOf("\n", i);
        if (lineEnd < 0) lineEnd = n;
        pushTok("cmt", source.slice(i, lineEnd));
        i = lineEnd;
        continue;
      }
      if (ch === "/" && next === "*" && kind !== "python" && kind !== "bash") {
        var blockEnd = source.indexOf("*/", i + 2);
        if (blockEnd < 0) blockEnd = n - 2;
        pushTok("cmt", source.slice(i, blockEnd + 2));
        i = blockEnd + 2;
        continue;
      }

      // preprocessor
      if ((kind === "cpp" || kind === "c") && ch === "#") {
        var pEnd = i + 1;
        while (pEnd < n && source[pEnd] !== "\n") {
          if (source[pEnd] === "\\" && source[pEnd + 1] === "\n") pEnd += 2;
          else pEnd += 1;
        }
        pushTok("pp", source.slice(i, pEnd));
        i = pEnd;
        continue;
      }

      // strings
      if (ch === "'" || ch === '"' || (ch === "`" && (kind === "javascript" || kind === "typescript" || kind === "bash"))) {
        var quote = ch;
        var j = i + 1;
        var triple = (kind === "python" && startsWith(quote + quote + quote));
        if (triple) {
          j = i + 3;
          var close = source.indexOf(quote + quote + quote, j);
          if (close < 0) close = n - 3;
          pushTok("str", source.slice(i, close + 3));
          i = close + 3;
          continue;
        }
        while (j < n) {
          if (source[j] === "\\" && j + 1 < n) { j += 2; continue; }
          if (source[j] === quote) { j += 1; break; }
          if (quote !== "`" && source[j] === "\n") break;
          j += 1;
        }
        pushTok("str", source.slice(i, j));
        i = j;
        continue;
      }
      if (kind === "python" && (startsWith('r"') || startsWith("r'") || startsWith('f"') || startsWith("f'") || startsWith('b"') || startsWith("b'"))) {
        var q = source[i + 1];
        var k = i + 2;
        while (k < n) {
          if (source[k] === "\\" && k + 1 < n) { k += 2; continue; }
          if (source[k] === q) { k += 1; break; }
          if (source[k] === "\n") break;
          k += 1;
        }
        pushTok("str", source.slice(i, k));
        i = k;
        continue;
      }

      // numbers
      if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(next))) {
        var m = source.slice(i).match(/^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d[\d_]*(\.\d[\d_]*)?([eE][+-]?\d+)?[fFlLuU]*)/);
        if (m) {
          pushTok("num", m[0]);
          i += m[0].length;
          continue;
        }
      }

      // identifiers / keywords / types / functions
      if (/[A-Za-z_$@]/.test(ch)) {
        var idMatch = source.slice(i).match(/^[A-Za-z_$@][A-Za-z0-9_$@]*/);
        var id = idMatch ? idMatch[0] : ch;
        var after = source.slice(i + id.length).match(/^\s*\(/);
        if (new RegExp("^(?:" + kw + ")$").test(id)) pushTok("kw", id);
        else if (ty && new RegExp("^(?:" + ty + ")$").test(id)) pushTok("type", id);
        else if (after) pushTok("fn", id);
        else if (/^[A-Z][A-Za-z0-9_]*$/.test(id) && kind !== "bash") pushTok("type", id);
        else pushTok("", id);
        i += id.length;
        continue;
      }

      // operators / punctuation
      if (/[+\-*/%=<>!&|^~?:]/.test(ch)) {
        var opMatch = source.slice(i).match(/^(<<=|>>=|<=>|::|->|\+\+|--|&&|\|\||<<|>>|<=|>=|==|!=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|={1,3}|[+\-*/%=<>!&|^~?:])/);
        if (opMatch) {
          pushTok("op", opMatch[0]);
          i += opMatch[0].length;
          continue;
        }
      }
      if (/[()[\]{},.;]/.test(ch)) {
        pushTok("punct", ch);
        i += 1;
        continue;
      }

      pushTok("", ch);
      i += 1;
    }

    return tokens.map(function (tok) {
      var safe = escapeHtml(tok.value);
      if (!tok.type) return safe;
      return '<span class="tok-' + tok.type + '">' + safe + "</span>";
    }).join("");
  }

  function parseCodeFenceInfo(info) {
    // Cursor citation fences look like: ```143:161:examples/foo.cpp
    var raw = String(info || "").trim();
    if (!raw) return { lang: "", label: "code" };
    var cite = raw.match(/^(\d+):(\d+):(.+)$/);
    if (cite) {
      var path = cite[3].trim();
      var base = path.split(/[\\/]/).pop() || path;
      var ext = (base.indexOf(".") >= 0 ? base.split(".").pop() : "").toLowerCase();
      return { lang: ext || "", label: path };
    }
    // Bare path / file.ext used as fence info
    if (/[\\/]/.test(raw) || /\.[A-Za-z0-9]{1,10}$/.test(raw)) {
      var base2 = raw.split(/[\\/]/).pop() || raw;
      var ext2 = (base2.indexOf(".") >= 0 ? base2.split(".").pop() : "").toLowerCase();
      if (ext2 && !/\s/.test(ext2)) return { lang: ext2, label: raw };
    }
    return { lang: raw, label: "" };
  }

  function codeLangLabel(lang) {
    var kind = normalizeCodeLang(lang);
    var labels = {
      python: "python",
      cpp: "cpp",
      c: "c",
      javascript: "javascript",
      typescript: "typescript",
      bash: "bash",
      go: "go",
      rust: "rust",
      java: "java",
      sql: "sql",
      yaml: "yaml",
      json: "json",
      html: "html",
      css: "css",
      markdown: "markdown",
      generic: "code",
    };
    if (labels[kind]) return labels[kind];
    return String(lang || "code").trim().toLowerCase() || "code";
  }

  function renderCodeBlock(lang, code) {
    var raw = String(code || "").replace(/\n$/, "");
    var info = parseCodeFenceInfo(lang);
    var language = info.lang;
    var label = info.label || codeLangLabel(language);
    var cls = language ? ' class="language-' + escapeHtml(normalizeCodeLang(language)) + '"' : "";
    var highlighted = highlightCode(raw, language);
    return (
      '<div class="ai-agent-codeblock">' +
        '<div class="ai-agent-codeblock-header">' +
          '<span class="ai-agent-codeblock-lang">' + escapeHtml(label) + "</span>" +
          '<button type="button" class="ai-agent-codeblock-copy" data-copy-label="复制">复制</button>' +
        "</div>" +
        "<pre><code" + cls + ">" + highlighted + "</code></pre>" +
      "</div>"
    );
  }

  function bindCodeBlockCopy(root) {
    if (!root) return;
    Array.prototype.forEach.call(root.querySelectorAll(".ai-agent-codeblock"), function (block) {
      if (block.__copyBound) return;
      block.__copyBound = true;
      var btn = block.querySelector(".ai-agent-codeblock-copy");
      var codeEl = block.querySelector("pre code");
      if (!btn || !codeEl) return;
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var text = codeEl.textContent || "";
        function markCopied() {
          btn.textContent = "已复制";
          btn.classList.add("is-copied");
          setTimeout(function () {
            btn.textContent = btn.getAttribute("data-copy-label") || "复制";
            btn.classList.remove("is-copied");
          }, 1400);
        }
        function fallbackCopy() {
          var range = document.createRange();
          range.selectNodeContents(codeEl);
          var sel = window.getSelection();
          if (!sel) return false;
          sel.removeAllRanges();
          sel.addRange(range);
          var ok = false;
          try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
          sel.removeAllRanges();
          return ok;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(markCopied).catch(function () {
            if (fallbackCopy()) markCopied();
          });
        } else if (fallbackCopy()) {
          markCopied();
        }
      });
    });
  }

  function renderMarkdown(text) {
    var normalized = text.replace(/\r\n/g, "\n");
    var codeBlocks = [];
    normalized = normalized.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, function (_, lang, code) {
      codeBlocks.push(renderCodeBlock(lang, code));
      return "%%CODEBLOCK_" + (codeBlocks.length - 1) + "%%";
    });

    var lines = normalized.split("\n");
    var html = [];
    var inList = false;
    var listType = "";

    function closeList() {
      if (inList) {
        html.push("</" + listType + ">");
        inList = false;
        listType = "";
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      if (!trimmed) {
        closeList();
        continue;
      }
      if (/^%%CODEBLOCK_\d+%%$/.test(trimmed)) {
        closeList();
        html.push(trimmed);
        continue;
      }
      if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) {
        closeList();
        html.push("<hr />");
        continue;
      }
      if (isTableRowLine(line)) {
        var table = readTableBlock(lines, i);
        if (table) {
          closeList();
          html.push(table.html);
          i = table.next - 1;
          continue;
        }
      }
      if (/^####\s+/.test(trimmed)) {
        closeList();
        html.push("<h4>" + formatInlineMarkdown(trimmed.replace(/^####\s+/, "")) + "</h4>");
        continue;
      }
      if (/^###\s+/.test(trimmed)) {
        closeList();
        html.push("<h3>" + formatInlineMarkdown(trimmed.replace(/^###\s+/, "")) + "</h3>");
        continue;
      }
      if (/^##\s+/.test(trimmed)) {
        closeList();
        html.push("<h2>" + formatInlineMarkdown(trimmed.replace(/^##\s+/, "")) + "</h2>");
        continue;
      }
      if (/^#\s+/.test(trimmed)) {
        closeList();
        html.push("<h1>" + formatInlineMarkdown(trimmed.replace(/^#\s+/, "")) + "</h1>");
        continue;
      }
      if (/^>\s+/.test(trimmed)) {
        closeList();
        html.push("<blockquote>" + formatInlineMarkdown(trimmed.replace(/^>\s+/, "")) + "</blockquote>");
        continue;
      }
      if (/^[-*]\s+\[[ xX]\]\s+/.test(trimmed)) {
        if (!inList || listType !== "ul") {
          closeList();
          html.push("<ul>");
          inList = true;
          listType = "ul";
        }
        var taskBody = trimmed.replace(/^[-*]\s+/, "");
        var checked = /^\[[xX]\]/.test(taskBody);
        var taskText = taskBody.replace(/^\[[ xX]\]\s+/, "");
        html.push(
          '<li><input type="checkbox" disabled' + (checked ? " checked" : "") + ' />' +
          formatInlineMarkdown(taskText) + "</li>"
        );
        continue;
      }
      if (/^[-*]\s+/.test(trimmed)) {
        if (!inList || listType !== "ul") {
          closeList();
          html.push("<ul>");
          inList = true;
          listType = "ul";
        }
        html.push("<li>" + formatInlineMarkdown(trimmed.replace(/^[-*]\s+/, "")) + "</li>");
        continue;
      }
      if (/^\d+\.\s+/.test(trimmed)) {
        if (!inList || listType !== "ol") {
          closeList();
          html.push("<ol>");
          inList = true;
          listType = "ol";
        }
        html.push("<li>" + formatInlineMarkdown(trimmed.replace(/^\d+\.\s+/, "")) + "</li>");
        continue;
      }

      closeList();
      html.push("<p>" + formatInlineMarkdown(trimmed) + "</p>");
    }
    closeList();

    return html.join("\n").replace(/%%CODEBLOCK_(\d+)%%/g, function (_, index) {
      return codeBlocks[Number(index)] || "";
    });
  }

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
    var images = items.filter(function (item) { return item.kind === "image" && item.previewUrl; });
    var files = items.filter(function (item) {
      // Live uploads: non-images. Restored history: names only (no previewUrl).
      return item.kind !== "image" || !item.previewUrl;
    });
    if (images.length) {
      var gallery = document.createElement("div");
      gallery.className = "ai-agent-msg-images";
      images.forEach(function (item) {
        var img = document.createElement("img");
        img.src = item.previewUrl;
        img.alt = item.name || "uploaded image";
        gallery.appendChild(img);
      });
      main.appendChild(gallery);
    }
    if (files.length) {
      var fileRow = document.createElement("div");
      fileRow.className = "ai-agent-msg-files";
      files.forEach(function (item) {
        var chip = document.createElement("div");
        chip.className = "ai-agent-file-chip";
        chip.innerHTML = "<span></span>";
        chip.querySelector("span").textContent = item.name || "file";
        fileRow.appendChild(chip);
      });
      main.appendChild(fileRow);
    }
    threadDiv.appendChild(msg);
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

  // After assistant text, later tools open a new worklog *below* that text.
  function beginToolSegment(msg) {
    var meta = getRunMeta(msg);
    if (meta.activeTextEl) {
      meta.sealedReplyLen = Math.max(meta.sealedReplyLen, meta.activeTextEl.__replyEnd || 0);
      meta.activeTextEl = null;
      meta.needNewWorklog = true;
      // Drop any live Exploring still above the sealed text so upserts don't revive it.
      removeCard(msg, "explore-live");
      (meta.exploreStepKeys || []).forEach(function (key) { removeCard(msg, key); });
      removeCard(msg, "think-live");
      removeCard(msg, "plan-live");
      removeCard(msg, "status-live");
      meta.exploreActive = false;
      meta.exploreSteps = [];
      meta.exploreStepKeys = [];
    }
  }

  function streamTimelineText(msg, fullReply, renderAsMarkdown) {
    var meta = getRunMeta(msg);
    finalizePlanCard(msg);
    finalizeThoughtCard(msg);
    finalizeExplorePhase(msg);
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

  function streamStandaloneText(msg, text, renderAsMarkdown) {
    // Error / status lines are not part of the cumulative reply — don't slice by sealedReplyLen.
    beginToolSegment(msg);
    var meta = getRunMeta(msg);
    meta.sealedReplyLen = 0;
    meta.activeTextEl = null;
    return streamTimelineText(msg, text, renderAsMarkdown);
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
    // Cursor: › Run / › Running — command only in expanded detail.
    if (kind === "run") {
      title = payload.status === "running" ? "Running" : "Run";
    } else if (!title || /^tool$/i.test(title)) {
      var name = (payload.name || "").trim();
      if (name && !/^tool$/i.test(name) && !/^(shell|bash|terminal|awaitshell)$/i.test(name)) {
        var pretty = name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
        title = pretty.charAt(0).toUpperCase() + pretty.slice(1);
      } else if (argsText || /^(shell|bash|terminal|awaitshell)$/i.test(name)) {
        title = payload.status === "running" ? "Running" : "Run";
      }
    }
    var cmd = detail;
    if (!cmd || cmd === payload.name) cmd = argsText || "";
    if (kind === "run" || title === "Run" || title === "Running") {
      if (cmd && resultText && payload.status === "completed") {
        detail = cmd + "\n\n" + resultText;
      } else {
        detail = cmd || resultText || detail;
      }
    } else if (!detail || detail === payload.name) {
      if (payload.status === "completed" && resultText) detail = resultText;
      else if (argsText) detail = argsText;
    }
    return { title: title || "Run", detail: detail };
  }

  function upsertCard(msg, key, options) {
    var meta = getRunMeta(msg);
    var existing = msg.querySelector('.ai-agent-card[data-card-key="' + key + '"]');
    // Don't update a card that still sits above sealed assistant text.
    if (existing && meta.needNewWorklog) {
      existing.remove();
      existing = null;
    }
    var worklog = existing ? existing.parentNode : ensureWorklog(msg);
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
    var card = msg.querySelector('.ai-agent-card[data-card-key="' + key + '"]');
    if (card) {
      card.remove();
      scheduleSaveChatHistory();
    }
  }

  function finalizeStatusCard(msg) {
    removeCard(msg, "status-live");
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
    removeCard(msg, "explore-live");
    (meta.exploreStepKeys || []).forEach(function (key) { removeCard(msg, key); });
    meta.exploreStepKeys = [];
    if (!meta.exploreActive && !(meta.exploreSteps || []).length) return;
    appendExploredMarker(msg);
    meta.exploreActive = false;
  }

  function noteExploring(msg, stepTitle, options) {
    options = options || {};
    var meta = getRunMeta(msg);
    if (!meta.exploreSteps) meta.exploreSteps = [];
    if (!meta.exploreStepKeys) meta.exploreStepKeys = [];
    var step = String(stepTitle || "").trim();
    var callId = String(options.callId || "").trim();
    var running = !!options.running;
    var detail = options.detail || "";
    var stepKey = callId
      ? ("explore-step-" + callId)
      : (step ? ("explore-step-" + step) : "");

    meta.exploreActive = true;
    // Parent keeps shimmering for the whole explore burst.
    upsertCard(msg, "explore-live", {
      kind: "explore",
      title: "Exploring",
      meta: "",
      detail: "",
      paths: [],
      live: true,
    });

    if (!step || !stepKey) {
      scrollToBottom(false);
      return;
    }
    if (meta.exploreStepKeys.indexOf(stepKey) < 0) {
      meta.exploreStepKeys.push(stepKey);
      meta.exploreSteps.push(step);
    } else {
      // Keep summary title in sync if the completed event has a better label.
      var idx = meta.exploreStepKeys.indexOf(stepKey);
      if (idx >= 0 && step) meta.exploreSteps[idx] = step;
    }

    // Sub-task: shimmer while running; stop shimmer + collapse when done.
    upsertCard(msg, stepKey, {
      kind: "explore",
      title: step,
      meta: "",
      detail: detail,
      paths: options.paths || [],
      live: running,
      forceCollapsed: !running,
    });
    scrollToBottom(false);
  }

  function isNoisyStatus(text) {
    var upper = String(text || "").trim().toUpperCase();
    return (
      !upper ||
      upper === "RUNNING" ||
      upper === "FINISHED" ||
      upper === "COMPLETED" ||
      upper === "DONE" ||
      upper === "CANCELLED" ||
      upper === "CANCELED"
    );
  }

  function isInterimReplyText(text) {
    var t = String(text || "").trim();
    if (!t) return true;
    if (t.length > 80) return false;
    // Only ephemeral status lines — real openers like "先看一下项目结构…" must
    // enter the timeline immediately, or later Explored keeps updating above them.
    if (/^(正在|正在为您)(搜索|查询|获取|联网|处理|分析|读取|查找)/.test(t)) return true;
    if (/^(Searching|Fetching|Looking|Checking|Querying|Reading)\b/i.test(t)) return true;
    if (/^(正在)?(查询|搜索|获取|联网)(中)?[…\.。]*$/.test(t)) return true;
    return false;
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

  function finalizeLiveCards(msg) {
    finalizePlanCard(msg);
    finalizeThoughtCard(msg);
    finalizeExplorePhase(msg);
    finalizeStatusCard(msg);
  }

  function noteThinking(msg, detail) {
    finalizePlanCard(msg);
    finalizeStatusCard(msg);
    var chunk = detail || "";
    var meta = getRunMeta(msg);
    // Cursor folds think↔read into one Explored burst — don't open Thought mid-explore.
    if (meta.exploreActive) {
      if (chunk.trim()) updateRunState("正在思考");
      return;
    }
    // Empty heartbeat deltas must not open a new Thought row.
    if (!meta.thinkingStartedAt && !chunk.trim()) return;
    if (!meta.thinkingStartedAt) {
      meta.thinkingStartedAt = Date.now();
      meta.thinkingDetail = "";
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

  function renderAttachmentPreview() {
    attachmentsDiv.innerHTML = "";
    pendingFiles.forEach(function (item) {
      var wrap = document.createElement("div");
      if (item.kind === "image") {
        wrap.className = "ai-agent-thumb";
        wrap.innerHTML = '<img alt="" /><button type="button" title="移除">×</button>';
        wrap.querySelector("img").src = item.previewUrl;
      } else {
        wrap.className = "ai-agent-thumb file";
        wrap.innerHTML = '<span class="name"></span><span class="kind"></span><button type="button" title="移除">×</button>';
        wrap.querySelector(".name").textContent = item.name || "file";
        wrap.querySelector(".kind").textContent = item.mime_type || "file";
      }
      wrap.querySelector("button").onclick = function () {
        revokeFilePreviews([item]);
        pendingFiles = pendingFiles.filter(function (x) { return x !== item; });
        renderAttachmentPreview();
      };
      attachmentsDiv.appendChild(wrap);
    });
  }

  function removeQueueItem(id, revokeFiles) {
    var kept = [];
    sendQueue.forEach(function (item) {
      if (item.id !== id) {
        kept.push(item);
        return;
      }
      if (revokeFiles) {
        revokeFilePreviews(item.files);
      }
    });
    sendQueue = kept;
    renderQueue();
    updateRunState(isRunning ? "处理中" : "就绪");
  }

  function editQueueItem(item) {
    // Pull queued prompt back into composer (Cursor-style edit).
    if (inputField.value.trim() || pendingFiles.length) {
      if (!confirm("编辑排队消息会覆盖当前输入框内容，继续？")) return;
      clearPendingFiles(true);
    }
    inputField.value = item.text || "";
    modeField.value = item.mode || "agent";
    if (item.model) {
      setSelectedModel(item.model, false);
    }
    pendingFiles = item.files.slice();
    removeQueueItem(item.id, false);
    updateModeUI();
    renderAttachmentPreview();
    inputField.focus();
  }

  function queueIcon(name) {
    if (name === "edit") {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
    }
    if (name === "send") {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
  }

  function renderQueue() {
    queueDiv.innerHTML = "";
    if (!sendQueue.length) {
      queueDiv.classList.remove("has-items", "is-collapsed");
      return;
    }
    queueDiv.classList.add("has-items");
    queueDiv.classList.toggle("is-collapsed", queueCollapsed);

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "ai-agent-queue-toggle";
    toggle.setAttribute("aria-expanded", queueCollapsed ? "false" : "true");
    toggle.innerHTML = '<span class="ai-agent-queue-chevron" aria-hidden="true"></span><span class="ai-agent-queue-count"></span>';
    toggle.querySelector(".ai-agent-queue-count").textContent =
      sendQueue.length + (sendQueue.length === 1 ? " Queued" : " Queued");
    toggle.onclick = function () {
      queueCollapsed = !queueCollapsed;
      renderQueue();
    };

    var list = document.createElement("div");
    list.className = "ai-agent-queue-list";

    sendQueue.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "ai-agent-queue-item";

      var dot = document.createElement("span");
      dot.className = "ai-agent-queue-dot";
      dot.setAttribute("aria-hidden", "true");

      var textBtn = document.createElement("button");
      textBtn.type = "button";
      textBtn.className = "ai-agent-queue-text";
      var label = item.text || (item.files.length ? "(" + item.files.length + " 个附件)" : "(空消息)");
      textBtn.textContent = label;
      textBtn.title = label;
      textBtn.onclick = function () { editQueueItem(item); };

      var actions = document.createElement("div");
      actions.className = "ai-agent-queue-actions";

      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.title = "编辑";
      editBtn.innerHTML = queueIcon("edit");
      editBtn.onclick = function () { editQueueItem(item); };

      var sendNowBtn = document.createElement("button");
      sendNowBtn.type = "button";
      sendNowBtn.className = "send-now";
      sendNowBtn.title = "立即发送";
      sendNowBtn.innerHTML = queueIcon("send");
      sendNowBtn.onclick = function () { sendQueueItemNow(item); };

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "delete";
      deleteBtn.title = "删除";
      deleteBtn.innerHTML = queueIcon("delete");
      deleteBtn.onclick = function () { removeQueueItem(item.id, true); };

      actions.appendChild(editBtn);
      actions.appendChild(sendNowBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(dot);
      row.appendChild(textBtn);
      row.appendChild(actions);
      list.appendChild(row);
    });

    queueDiv.appendChild(toggle);
    queueDiv.appendChild(list);
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || "");
        var comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFileSelection(files) {
    var list = Array.from(files || []);
    for (var i = 0; i < list.length; i++) {
      var file = list[i];
      var data = await readFileAsBase64(file);
      var mime = file.type || "application/octet-stream";
      var isImage = mime.indexOf("image/") === 0;
      pendingFiles.push({
        kind: isImage ? "image" : "file",
        name: file.name,
        mime_type: mime,
        data: data,
        previewUrl: isImage ? URL.createObjectURL(file) : "",
      });
    }
    renderAttachmentPreview();
    fileInput.value = "";
  }

  function clearPendingFiles(revokeUrls) {
    if (revokeUrls !== false) {
      revokeFilePreviews(pendingFiles);
    }
    pendingFiles = [];
    renderAttachmentPreview();
  }

  function buildFilesPayload(files) {
    return (files || []).map(function (item) {
      return {
        name: item.name,
        mime_type: item.mime_type,
        data: item.data,
      };
    });
  }

  function formatAgentError(raw) {
    var msg = String(raw || "unknown");
    // Backend already rewrites context-overflow; only decorate raw transport errors.
    if (msg.indexOf("上下文已超限") >= 0) return msg;
    var lower = msg.toLowerCase();
    if (
      lower.indexOf("context") >= 0 && (lower.indexOf("limit") >= 0 || lower.indexOf("length") >= 0 || lower.indexOf("window") >= 0 || lower.indexOf("overflow") >= 0 || lower.indexOf("too long") >= 0 || lower.indexOf("exceed") >= 0)
      || lower.indexOf("maximum context") >= 0
      || lower.indexOf("prompt is too long") >= 0
      || lower.indexOf("token") >= 0 && lower.indexOf("limit") >= 0
      || msg.indexOf("上下文") >= 0 && (msg.indexOf("超") >= 0 || msg.indexOf("过长") >= 0)
    ) {
      return "上下文已超限，请点击「新对话」清空后重试，或缩短本次输入/附件。\n原始错误: " + msg;
    }
    return msg;
  }

  function updateRunState(text) {
    if (text) {
      runState.textContent = text;
    } else if (isRunning) {
      runState.textContent = sendQueue.length ? ("处理中 · 队列 " + sendQueue.length) : "处理中";
    } else {
      runState.textContent = sendQueue.length ? ("就绪 · 队列 " + sendQueue.length) : "就绪";
    }
    runState.classList.toggle("is-busy", !!isRunning || runState.textContent.indexOf("中") >= 0);
    sendBtn.textContent = isRunning ? "↑" : "↑";
    sendBtn.title = isRunning ? "加入队列" : "发送";
    sendBtn.classList.toggle("is-queue", !!isRunning);
    sendBtn.classList.toggle("hidden", false);
    stopBtn.classList.toggle("visible", !!isRunning);
  }

  function updateModeUI() {
    var isPlan = modeField.value === "plan";
    composeShell.classList.toggle("mode-plan", isPlan);
    inputField.placeholder = isPlan
      ? "描述你想先规划的问题"
      : "给 Ai-agent 发送消息";
  }

  function enqueueCurrentCompose() {
    var text = inputField.value.trim();
    if (!text && !pendingFiles.length) return null;
    var item = {
      id: "q-" + (++queueSeq),
      text: text,
      model: modelField.value,
      mode: modeField.value,
      files: pendingFiles.slice(),
    };
    sendQueue.push(item);
    queueCollapsed = false;
    inputField.value = "";
    autosizeInput();
    pendingFiles = [];
    renderAttachmentPreview();
    renderQueue();
    updateRunState(isRunning ? "处理中" : "就绪");
    return item;
  }

  function clearStoppedAgentOutput() {
    if (!stoppedAgentMsg) return;
    if (stoppedAgentMsg.parentNode) stoppedAgentMsg.remove();
    stoppedAgentMsg = null;
    scheduleSaveChatHistory();
  }

  async function runOne(item) {
    // Manual ■ stop kept the incomplete reply visible; next send drops it.
    clearStoppedAgentOutput();
    var label = item.text || (item.files.length ? "(附件)" : "");
    appendMessage("You", label, "user", false, item.files);
    var filesPayload = buildFilesPayload(item.files);
    var agentMsg = appendMessage("Agent", "", "agent", true);
    if ((item.model || "") === "auto") {
      autoResolvedModel = "";
      autoResolvedLabel = "";
      syncModelPickerUI();
    }
    notePlanning(agentMsg, "");
    var reply = "";
    var finished = false;

    var controller = new AbortController();
    activeAbort = controller;
    try {
      var res = await fetch(apiBase + "/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: item.text || (item.files.length ? "请查看我上传的附件。" : ""),
          session_id: sessionId || null,
          model: item.model,
          mode: item.mode || "agent",
          files: filesPayload.length ? filesPayload : null,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("HTTP " + res.status);
      }

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";

      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        var parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (var i = 0; i < parts.length; i++) {
          var line = parts[i].trim();
          if (!line.startsWith("data:")) continue;
          var payload;
          try {
            payload = JSON.parse(line.slice(5).trim());
          } catch (parseErr) {
            continue;
          }

          if (payload.session_id) {
            sessionId = payload.session_id;
            localStorage.setItem("ai-agent-session-id", sessionId);
          }

          if (payload.resolved_model || payload.type === "model_resolved") {
            applyResolvedModel(payload);
          }

          if (payload.type === "text") {
            reply += payload.content || "";
            if (isInterimReplyText(reply)) {
              // Short status-like lines stay in the header only.
              updateRunState(reply.trim() || "搜索中");
              finalizePlanCard(agentMsg);
              finalizeThoughtCard(agentMsg);
              finalizeStatusCard(agentMsg);
              scrollToBottom(false);
            } else {
              updateRunState("回复中");
              streamTimelineText(agentMsg, reply, true);
              scrollToBottom(false);
            }
          } else if (payload.type === "planning") {
            updateRunState("规划中");
            beginToolSegment(agentMsg);
            notePlanning(agentMsg, payload.content || "");
          } else if (payload.type === "upload") {
            updateRunState("已接收附件");
            beginToolSegment(agentMsg);
            finalizePlanCard(agentMsg);
            var names = []
              .concat(payload.images || [])
              .concat(payload.files || [])
              .map(function (f) { return f.name || f.path || "file"; })
              .join(", ");
            appendCard(agentMsg, {
              kind: "run",
              title: "Uploaded attachments",
              meta: "",
              detail: names,
              paths: (payload.files || []).map(function (f) { return f.path; }).filter(Boolean),
            });
          } else if (payload.type === "thinking") {
            updateRunState("正在思考");
            beginToolSegment(agentMsg);
            noteThinking(agentMsg, payload.content || "");
          } else if (payload.type === "tool_call") {
            var summary = payload.summary || {};
            var toolView = buildToolPresentation(payload, summary);
            var toolRunning = payload.status === "running";
            updateRunState(toolRunning ? (toolView.title || "执行中") : "执行中");
            beginToolSegment(agentMsg);
            finalizePlanCard(agentMsg);
            finalizeStatusCard(agentMsg);
            var isExplore = summary.kind === "explore";
            // Within one Explored burst, keep a single Thought — don't re-archive each Read/Grep.
            if (!(isExplore && getRunMeta(agentMsg).exploreActive)) finalizeThoughtCard(agentMsg);
            if (isExplore) {
              getRunMeta(agentMsg).exploreActive = true;
              noteExploring(agentMsg, toolView.title, {
                callId: payload.call_id || "",
                running: toolRunning,
                detail: toolView.detail || "",
                paths: summary.paths || [],
              });
            } else {
              finalizeExplorePhase(agentMsg);
              var toolKey = payload.call_id
                ? ("tool-" + payload.call_id)
                : ("tool-" + (payload.name || "tool") + "-" + Date.now());
              upsertCard(agentMsg, toolKey, {
                kind: summary.kind || "tool",
                title: toolView.title,
                meta: "",
                detail: toolView.detail,
                paths: summary.paths || [],
                diff: summary.diff || [],
                live: toolRunning,
                forceCollapsed: !toolRunning,
              });
            }
          } else if (payload.type === "status") {
            var statusText = payload.content || payload.status || "正在处理";
            if (!isNoisyStatus(statusText)) updateRunState(statusText);
          } else if (payload.type === "task") {
            updateRunState(payload.content || "正在执行任务");
            beginToolSegment(agentMsg);
            finalizePlanCard(agentMsg);
            finalizeStatusCard(agentMsg);
            appendCard(agentMsg, {
              kind: "plan",
              title: payload.content || "Task update",
              meta: "",
              detail: "",
              paths: [],
            });
          } else if (payload.type === "error") {
            finished = true;
            finalizeLiveCards(agentMsg);
            streamStandaloneText(agentMsg, "错误: " + formatAgentError(payload.content || "unknown"), false);
          } else if (payload.type === "done") {
            finished = true;
            finalizeLiveCards(agentMsg);
            if (reply) {
              streamTimelineText(agentMsg, reply, true);
            } else if (!agentMsg.querySelector(".ai-agent-segment-text")) {
              streamStandaloneText(agentMsg, "(完成，状态: " + (payload.status || "unknown") + ")", false);
            }
          }
        }
      }
      if (!finished) {
        finalizeLiveCards(agentMsg);
        if (reply) streamTimelineText(agentMsg, reply, true);
      }
    } catch (err) {
      if (err && err.name === "AbortError") {
        // Keep whatever was already streamed; no "(已终止)/(已中断)" body text.
        finalizeLiveCards(agentMsg);
        if (reply && reply.trim() && !isInterimReplyText(reply)) {
          streamTimelineText(agentMsg, reply, true);
        }
        if (stopRequested) {
          // Remember for cleanup on the next send; queue-↑ interrupt keeps it.
          stoppedAgentMsg = agentMsg;
          updateRunState("就绪");
        } else {
          updateRunState("已中断");
        }
        // Always wait for backend cancel so the next queued send doesn't hit a busy agent.
        await requestCancel();
      } else {
        finalizeLiveCards(agentMsg);
        var detail = formatAgentError((err && err.message) ? err.message : String(err));
        streamStandaloneText(
          agentMsg,
          "请求失败 (" + apiBase + "): " + detail + "。请确认已用 python start.py 或 ./run.sh 启动服务（默认 http://127.0.0.1:8765）。",
          false
        );
      }
    } finally {
      if (activeAbort === controller) activeAbort = null;
      revokeFilePreviews(item.files);
    }
  }

  async function drainQueue() {
    if (isRunning) return;
    isRunning = true;
    stopRequested = false;
    updateRunState("处理中");
    while (sendQueue.length) {
      if (stopRequested) break;
      var item = sendQueue.shift();
      renderQueue();
      updateRunState("处理中");
      await runOne(item);
      if (stopRequested) break;
    }
    isRunning = false;
    stopRequested = false;
    updateRunState("就绪");
  }

  function stopConversation() {
    if (!isRunning && !sendQueue.length) return;
    stopRequested = true;
    if (activeAbort) activeAbort.abort();
    requestCancel();
    updateRunState("就绪");
  }

  function requestCancel() {
    if (!sessionId) return Promise.resolve();
    return fetch(apiBase + "/api/chat/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(function () {});
  }

  async function interruptAndSend(item) {
    // Move this item to the front (works for 1st, 2nd, or any queued row).
    sendQueue = sendQueue.filter(function (x) { return x.id !== item.id; });
    sendQueue.unshift(item);
    renderQueue();
    if (isRunning && activeAbort) {
      activeAbort.abort();
      // Wait until backend cancels the SDK run before drainQueue continues.
      await requestCancel();
      return;
    }
    drainQueue();
  }

  function sendQueueItemNow(item) {
    interruptAndSend(item);
  }

  function sendMessage() {
    var item = enqueueCurrentCompose();
    if (!item) return;
    if (isRunning) {
      renderQueue();
      updateRunState("处理中");
      return;
    }
    drainQueue();
  }

  sendBtn.onclick = sendMessage;
  stopBtn.onclick = stopConversation;
  modelBtn.onclick = function (e) {
    e.stopPropagation();
    if (modelWrap.classList.contains("is-open")) closeModelMenu();
    else openModelMenu();
  };
  modelAutoBtn.onclick = function (e) {
    e.stopPropagation();
    var on = modelAutoBtn.getAttribute("aria-checked") !== "true";
    if (on) setSelectedModel("auto", false);
    else setSelectedModel(lastManualModel || "composer-2.5", false);
  };
  modelMenu.addEventListener("click", function (e) { e.stopPropagation(); });
  document.addEventListener("click", function (e) {
    if (!modelWrap.classList.contains("is-open")) return;
    if (modelWrap.contains(e.target)) return;
    closeModelMenu();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModelMenu();
  });
  window.__aiAgentSetModel = function (id) {
    setSelectedModel(id, false);
  };
  syncModelPickerUI();
  modeField.onchange = function () {
    updateModeUI();
  };
  pickFileBtn.onclick = function () { fileInput.click(); };
  fileInput.addEventListener("change", function (e) {
    handleFileSelection(e.target.files);
  });
  function autosizeInput() {
    inputField.style.height = "auto";
    inputField.style.height = Math.min(inputField.scrollHeight, 140) + "px";
  }
  inputField.addEventListener("input", autosizeInput);
  inputField.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  newChatBtn.onclick = function () {
    if (isRunning || sendQueue.length) {
      if (!confirm("当前有进行中的任务或排队消息，确认清空并开始新对话？")) return;
    }
    stopRequested = true;
    if (activeAbort) activeAbort.abort();
    sendQueue.forEach(function (item) {
      revokeFilePreviews(item.files);
    });
    sendQueue = [];
    clearPendingFiles(true);
    renderQueue();
    sessionId = "";
    localStorage.removeItem("ai-agent-session-id");
    clearChatHistory();
    stoppedAgentMsg = null;
    threadDiv.innerHTML = "";
    isRunning = false;
    stopRequested = false;
    updateRunState("就绪");
  };
  updateRunState("就绪");
  updateModeUI();
  loadModelOptions();
  window.addEventListener("beforeunload", function () {
    if (historySaveTimer) {
      clearTimeout(historySaveTimer);
      historySaveTimer = null;
    }
    saveChatHistory();
  });

  // ponytail: table self-check — ?mdcheck=1 on host page
  if (/\bmdcheck=1\b/.test(String(location.search || ""))) {
    var mdSample = [
      "今天累计",
      "",
      "| 指标 | 数值 |",
      "",
      "|------|------|",
      "",
      "| 消费 | 4,843.95 |",
      "",
      "**结论**：ROAS 0.76",
      "",
      "```python",
      "def hello():",
      "    return 1",
      "```",
      "",
      "```cpp",
      "#include <vector>",
      "void dfs(int u) { vis[u] = true; }",
      "```",
      "",
      "```143:161:examples/red_black_tree.cpp",
      "Node* rotateLeft(Node* x) { return x; }",
      "```",
    ].join("\n");
    var mdOut = renderMarkdown(mdSample);
    var pyOk = mdOut.indexOf("tok-kw") >= 0 && mdOut.indexOf("def") >= 0;
    var cppOk = mdOut.indexOf("tok-pp") >= 0 || mdOut.indexOf("tok-type") >= 0;
    var citeOk = mdOut.indexOf("examples/red_black_tree.cpp") >= 0 && mdOut.indexOf("143:161:examples") < 0;
    var copyOk = mdOut.indexOf("ai-agent-codeblock-copy") >= 0 && mdOut.indexOf("ai-agent-codeblock-lang") >= 0;
    if (mdOut.indexOf("<table") < 0 || mdOut.indexOf("<strong>结论</strong>") < 0 || !pyOk || !cppOk || !citeOk || !copyOk) {
      console.error("Ai-agent markdown self-check failed", mdOut);
    } else {
      console.log("Ai-agent markdown self-check ok");
    }
  }
})();
