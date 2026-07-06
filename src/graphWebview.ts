import type * as vscode from 'vscode';

import type { I18n } from './i18n';
import type { GitGraphCommit, RepositoryGraphResult } from './types';
import { createNonce, serializeForScript } from './webview';

/** Repository graph Webview 初始渲染所需的数据。 */
export interface RepositoryGraphWebviewState extends RepositoryGraphResult {
}

/**
 * 创建仓库 Git graph Webview 的完整 HTML。
 * @param webview VS Code Webview 实例。
 * @param state 初始渲染状态。
 * @param i18n 本地化工具。
 * @returns HTML 字符串。
 */
export function createRepositoryGraphHtml(
  webview: vscode.Webview,
  state: RepositoryGraphWebviewState,
  i18n: I18n
): string {
  const nonce = createNonce();
  const labels = {
    actionAddTag: i18n.t('graph.action.addTag'),
    actionCheckout: i18n.t('graph.action.checkout'),
    actionCherryPick: i18n.t('graph.action.cherryPick'),
    actionCopyHash: i18n.t('graph.action.copyHash'),
    actionCopySubject: i18n.t('graph.action.copySubject'),
    actionCreateBranch: i18n.t('graph.action.createBranch'),
    actionOpenCommitDetails: i18n.t('action.openCommitDetails'),
    actionRefresh: i18n.t('action.refresh'),
    actionRevert: i18n.t('graph.action.revert'),
    allBranches: i18n.t('graph.scope.allBranches'),
    author: i18n.t('label.author'),
    branch: i18n.t('refType.branch'),
    copied: i18n.t('toast.copied'),
    date: i18n.t('label.date'),
    empty: i18n.t('graph.empty.noCommits'),
    limited: i18n.t('graph.limitNotice', String(state.maxCommits)),
    loading: i18n.t('label.loading'),
    remote: i18n.t('refType.remote'),
    tag: i18n.t('refType.tag'),
    title: i18n.t('webview.graphTitle')
  };
  const bootState = serializeForScript({ ...state, labels });

  return /* html */ `<!DOCTYPE html>
<html lang="${i18n.language}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(labels.title)}</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    .shell {
      display: grid;
      grid-template-rows: auto 1fr;
      min-height: 100vh;
    }

    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }

    .repo-meta {
      min-width: 0;
    }

    .title {
      font-weight: 600;
    }

    .repo-root {
      margin-top: 2px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .limit-notice {
      margin-top: 4px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    .controls {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }

    select,
    button {
      min-height: 26px;
      color: var(--vscode-foreground);
      background: transparent;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 3px;
      font: inherit;
    }

    select {
      max-width: min(280px, 42vw);
      padding: 3px 7px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border-color: var(--vscode-input-border, var(--vscode-panel-border));
    }

    button {
      padding: 3px 8px;
      cursor: pointer;
    }

    button:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    main {
      overflow: auto;
    }

    .empty,
    .loading,
    .error {
      padding: 24px 14px;
      color: var(--vscode-descriptionForeground);
    }

    .error {
      color: var(--vscode-errorForeground);
    }

    .commit-row {
      display: grid;
      grid-template-columns: auto minmax(180px, 1fr) minmax(120px, 220px);
      align-items: stretch;
      gap: 10px;
      min-height: 38px;
      padding: 0 14px 0 6px;
      border-bottom: 1px solid var(--vscode-panel-border);
      cursor: default;
    }

    .commit-row:hover,
    .commit-row.active {
      background: var(--vscode-list-hoverBackground);
    }

    .graph-cell {
      display: flex;
      align-items: center;
      min-width: 48px;
      overflow: hidden;
    }

    .graph-canvas {
      display: block;
      overflow: visible;
    }

    .graph-line {
      stroke: var(--vscode-descriptionForeground);
      stroke-width: 1.4;
      opacity: 0.58;
      fill: none;
    }

    .graph-dot {
      fill: var(--vscode-textLink-foreground);
      stroke: var(--vscode-editor-background);
      stroke-width: 2;
    }

    .commit-main {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
    }

    .hash {
      flex: 0 0 auto;
      color: var(--vscode-textLink-foreground);
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }

    .hash-open {
      flex: 0 0 auto;
      padding: 0;
      padding-right: 6px;
      padding-left: 6px;
      color: inherit;
      background: transparent;
      border: 0;
      cursor: pointer;
    }

    .hash-open:hover .hash,
    .hash-open:focus-visible .hash {
      text-decoration: underline;
    }

    .subject {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }

    .refs {
      flex: 0 1 auto;
      min-width: 0;
      display: flex;
      gap: 4px;
      overflow: hidden;
    }

    .ref {
      flex: 0 0 auto;
      max-width: 120px;
      padding: 1px 5px;
      border-radius: 3px;
      color: var(--vscode-badge-foreground);
      background: var(--vscode-badge-background);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
    }

    .ref.tag {
      color: var(--vscode-descriptionForeground);
      background: transparent;
      border: 1px solid var(--vscode-panel-border);
    }

    .meta {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      overflow: hidden;
    }

    .author,
    .date {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .context-menu {
      position: fixed;
      z-index: 20;
      display: none;
      min-width: 220px;
      padding: 4px;
      color: var(--vscode-menu-foreground, var(--vscode-foreground));
      background: var(--vscode-menu-background, var(--vscode-editorWidget-background));
      border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
      box-shadow: 0 8px 24px rgb(0 0 0 / 28%);
    }

    .context-menu.visible {
      display: block;
    }

    .context-menu button {
      display: block;
      width: 100%;
      min-height: 26px;
      padding: 4px 8px;
      border: 0;
      border-radius: 2px;
      text-align: left;
      color: inherit;
      background: transparent;
    }

    .context-menu button:hover {
      background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
    }

    .toast {
      position: fixed;
      right: 14px;
      bottom: 14px;
      z-index: 30;
      max-width: min(300px, calc(100vw - 28px));
      padding: 8px 12px;
      color: var(--vscode-button-foreground, #ffffff);
      background: var(--vscode-button-background, #0e639c);
      border: 1px solid var(--vscode-button-hoverBackground, #1177bb);
      border-radius: 4px;
      box-shadow: 0 8px 24px rgb(0 0 0 / 28%);
      font-weight: 600;
      opacity: 0;
      pointer-events: none;
      transform: translateY(4px);
      transition: opacity 120ms ease, transform 120ms ease;
    }

    .toast.visible {
      opacity: 1;
      transform: translateY(0);
    }

    @media (max-width: 720px) {
      .toolbar {
        align-items: stretch;
        flex-direction: column;
      }

      .controls {
        justify-content: flex-start;
      }

      select {
        max-width: 100%;
      }

      .commit-row {
        grid-template-columns: auto minmax(0, 1fr);
      }

      .meta {
        grid-column: 2;
        justify-content: flex-start;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="toolbar">
      <div class="repo-meta">
        <div class="title">${escapeHtml(labels.title)}</div>
        <div class="repo-root">${escapeHtml(state.repoRoot)}</div>
        ${state.hasMore ? `<div class="limit-notice">${escapeHtml(labels.limited)}</div>` : ''}
      </div>
      <div class="controls">
        <select id="scopeSelect" aria-label="${escapeHtml(labels.allBranches)}">
          <option value=""${state.selectedRef ? '' : ' selected'}>${escapeHtml(labels.allBranches)}</option>
          ${state.scopes.map((scope) => `<option value="${escapeHtml(scope.ref)}"${scope.ref === state.selectedRef ? ' selected' : ''}>${escapeHtml(scope.label)}</option>`).join('')}
        </select>
        <button id="refresh">${escapeHtml(labels.actionRefresh)}</button>
      </div>
    </header>
    <main id="app"></main>
    <div class="context-menu" id="contextMenu" role="menu">
      <button data-action="addTag" role="menuitem">${escapeHtml(labels.actionAddTag)}</button>
      <button data-action="createBranch" role="menuitem">${escapeHtml(labels.actionCreateBranch)}</button>
      <button data-action="checkout" role="menuitem">${escapeHtml(labels.actionCheckout)}</button>
      <button data-action="cherryPick" role="menuitem">${escapeHtml(labels.actionCherryPick)}</button>
      <button data-action="revert" role="menuitem">${escapeHtml(labels.actionRevert)}</button>
      <button data-action="copyHash" role="menuitem">${escapeHtml(labels.actionCopyHash)}</button>
      <button data-action="copySubject" role="menuitem">${escapeHtml(labels.actionCopySubject)}</button>
    </div>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = ${bootState};
    const app = document.getElementById('app');
    const scopeSelect = document.getElementById('scopeSelect');
    const refreshButton = document.getElementById('refresh');
    const contextMenu = document.getElementById('contextMenu');
    const toast = document.getElementById('toast');
    let toastTimer = undefined;

    scopeSelect.addEventListener('change', () => {
      reloadGraph(scopeSelect.value || undefined);
    });
    refreshButton.addEventListener('click', () => {
      reloadGraph(state.selectedRef);
    });
    document.addEventListener('click', () => hideContextMenu());
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        hideContextMenu();
      }
    });
    contextMenu.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!state.contextCommit) {
          return;
        }
        vscode.postMessage({
          type: 'graphCommitAction',
          action: button.dataset.action,
          commitHash: state.contextCommit,
          subject: state.contextSubject || '',
          parentCount: state.contextParentCount || 0
        });
        hideContextMenu();
      });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'graphActionDone') {
        showToast(message.message || state.labels.copied);
      }
      if (message.type === 'graphError') {
        state.error = message.message;
        render();
      }
    });

    function reloadGraph(selectedRef) {
      state.selectedRef = selectedRef;
      state.error = undefined;
      app.innerHTML = '<div class="loading">' + escapeHtml(state.labels.loading) + '</div>';
      vscode.postMessage({ type: 'selectGraphScope', selectedRef });
    }

    function render() {
      if (state.error) {
        app.innerHTML = '<div class="error">' + escapeHtml(state.error) + '</div>';
        return;
      }
      if (!state.commits.length) {
        app.innerHTML = '<div class="empty">' + escapeHtml(state.labels.empty) + '</div>';
        return;
      }
      app.innerHTML = state.commits.map(renderCommit).join('');
      app.querySelectorAll('[data-commit]').forEach((row) => {
        row.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          const commit = state.commits.find((item) => item.hash === row.dataset.commit);
          if (!commit) {
            return;
          }
          state.contextCommit = commit.hash;
          state.contextSubject = commit.subject;
          state.contextParentCount = commit.parents.length;
          showContextMenu(event.clientX, event.clientY);
        });
      });
      app.querySelectorAll('[data-action="openCommitDetails"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          vscode.postMessage({ type: 'openCommitDetails', commitHash: button.dataset.commitHash });
        });
      });
    }

    function renderCommit(commit) {
      return '<section class="commit-row" data-commit="' + escapeAttr(commit.hash) + '">' +
        '<div class="graph-cell">' + renderGraph(commit) + '</div>' +
        '<div class="commit-main">' +
          '<button class="hash-open" data-action="openCommitDetails" data-commit-hash="' + escapeAttr(commit.hash) + '" title="' + escapeAttr(state.labels.actionOpenCommitDetails) + '" aria-label="' + escapeAttr(state.labels.actionOpenCommitDetails) + '">' +
            '<span class="hash">' + escapeHtml(commit.shortHash) + '</span>' +
          '</button>' +
          '<span class="subject" title="' + escapeAttr(commit.subject) + '">' + escapeHtml(commit.subject) + '</span>' +
          renderRefs(commit) +
        '</div>' +
        '<div class="meta">' +
          '<span class="author" title="' + escapeAttr(commit.author) + '">' + escapeHtml(commit.author) + '</span>' +
          '<span class="date" title="' + escapeAttr(commit.date) + '">' + escapeHtml(commit.date) + '</span>' +
        '</div>' +
      '</section>';
    }

    function renderGraph(commit) {
      const laneWidth = 18;
      const height = 38;
      const width = Math.max(48, commit.laneCount * laneWidth + 12);
      const centerY = height / 2;
      const laneX = (lane) => 6 + lane * laneWidth;
      const lines = [];
      commit.activeLanes.forEach((lane) => {
        lines.push('<line class="graph-line" x1="' + laneX(lane) + '" y1="0" x2="' + laneX(lane) + '" y2="' + height + '"></line>');
      });
      commit.parentLanes.forEach((lane) => {
        lines.push('<line class="graph-line" x1="' + laneX(commit.lane) + '" y1="' + centerY + '" x2="' + laneX(lane) + '" y2="' + height + '"></line>');
      });
      return '<svg class="graph-canvas" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" aria-hidden="true">' +
        lines.join('') +
        '<circle class="graph-dot" cx="' + laneX(commit.lane) + '" cy="' + centerY + '" r="4.5"></circle>' +
      '</svg>';
    }

    function renderRefs(commit) {
      if (!commit.refs.length) {
        return '';
      }
      return '<span class="refs">' + commit.refs.map((ref) => {
        const className = ref.type === 'tag' ? 'ref tag' : 'ref';
        return '<span class="' + className + '" title="' + escapeAttr(ref.ref) + '">' + escapeHtml(ref.label) + '</span>';
      }).join('') + '</span>';
    }

    function showContextMenu(clientX, clientY) {
      contextMenu.classList.add('visible');
      const menuRect = contextMenu.getBoundingClientRect();
      const left = Math.min(clientX, window.innerWidth - menuRect.width - 8);
      const top = Math.min(clientY, window.innerHeight - menuRect.height - 8);
      contextMenu.style.left = Math.max(8, left) + 'px';
      contextMenu.style.top = Math.max(8, top) + 'px';
    }

    function hideContextMenu() {
      contextMenu.classList.remove('visible');
    }

    function showToast(message) {
      toast.textContent = message;
      toast.classList.add('visible');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toast.classList.remove('visible');
      }, 3000);
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function escapeAttr(value) {
      return escapeHtml(value);
    }

    render();
  </script>
</body>
</html>`;
}

/**
 * 转义 HTML 文本，避免仓库路径和提交信息影响页面结构。
 * @param value 原始值。
 * @returns 转义后的 HTML 文本。
 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
