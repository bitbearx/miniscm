import type * as vscode from 'vscode';

import type { CommitHistoryItem, FileTreeNode } from './types';
import type { I18n } from './i18n';

/** Webview 初始渲染所需的数据。 */
export interface HistoryWebviewState {
  fileName: string;
  relativePath: string;
  commits: CommitHistoryItem[];
  filesByCommit: Record<string, FileTreeNode[]>;
}

/**
 * 生成用于内联脚本的随机 nonce。
 * @returns CSP nonce。
 */
export function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 32; index += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

/**
 * 将状态安全地序列化到 script 标签中。
 * @param value 待序列化的数据。
 * @returns 可嵌入 HTML 的 JSON。
 */
export function serializeForScript(value: object): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

/**
 * 创建文件历史 Webview 的完整 HTML。
 * @param webview VS Code Webview 实例。
 * @param state 初始渲染状态。
 * @param i18n 本地化工具。
 * @returns HTML 字符串。
 */
export function createHistoryHtml(webview: vscode.Webview, state: HistoryWebviewState, i18n: I18n): string {
  const nonce = createNonce();
  const labels = {
    actionChange: i18n.t('action.change'),
    actionCompareLatest: i18n.t('action.compareLatest'),
    actionRefresh: i18n.t('action.refresh'),
    ariaLoadFiles: i18n.t('aria.loadFiles'),
    changedFiles: i18n.t('label.changedFiles'),
    commits: i18n.t('label.commits'),
    date: i18n.t('label.date'),
    emptyNoCommits: i18n.t('empty.noCommits'),
    file: i18n.t('label.file'),
    loadingFiles: i18n.t('label.loadingFiles'),
    path: i18n.t('label.path'),
    title: i18n.t('webview.title')
  };

  const bootState = serializeForScript({ ...state, labels });
  const depthStyles = createDepthStyles(16);

  return /* html */ `<!DOCTYPE html>
<html lang="${i18n.language}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${labels.title}</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
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

    .file-meta {
      min-width: 0;
    }

    .file-name {
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .file-path {
      margin-top: 2px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    button {
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 3px;
      padding: 3px 8px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      font: inherit;
      cursor: pointer;
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button.secondary {
      color: var(--vscode-foreground);
      background: transparent;
      border-color: var(--vscode-panel-border);
    }

    main {
      overflow: auto;
    }

    .empty,
    .error {
      padding: 24px 14px;
      color: var(--vscode-descriptionForeground);
    }

    .error {
      color: var(--vscode-errorForeground);
    }

    .commit {
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .commit-row {
      width: 100%;
      display: grid;
      grid-template-columns: minmax(72px, 92px) minmax(180px, 1fr) minmax(170px, 220px);
      align-items: center;
      gap: 12px;
      padding: 9px 14px;
      color: inherit;
      background: transparent;
      border: 0;
      text-align: left;
    }

    .commit-row:hover,
    .commit-row.active {
      background: var(--vscode-list-hoverBackground);
    }

    .hash {
      color: var(--vscode-textLink-foreground);
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }

    .subject {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }

    .meta {
      min-width: 0;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      text-align: right;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .files {
      padding: 4px 0 10px 0;
      background: var(--vscode-editorWidget-background);
      border-top: 1px solid var(--vscode-panel-border);
    }

    .loading {
      padding: 10px 14px;
      color: var(--vscode-descriptionForeground);
    }

    .tree-node {
      min-width: 0;
    }

    .tree-line {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 10px;
      min-height: 28px;
      padding: 2px 14px;
    }

    ${depthStyles}

    .tree-line:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .node-label {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 7px;
      overflow: hidden;
    }

    .node-icon {
      color: var(--vscode-descriptionForeground);
      width: 14px;
      flex: 0 0 14px;
    }

    .node-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .status {
      min-width: 28px;
      padding: 1px 5px;
      border-radius: 3px;
      color: var(--vscode-badge-foreground);
      background: var(--vscode-badge-background);
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      text-align: center;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .actions button {
      padding: 2px 7px;
      color: var(--vscode-foreground);
      background: transparent;
      border-color: var(--vscode-panel-border);
    }

    .actions button:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    @media (max-width: 680px) {
      .commit-row {
        grid-template-columns: 74px 1fr;
      }

      .meta {
        grid-column: 2;
        text-align: left;
      }

      .tree-line {
        grid-template-columns: 1fr;
        align-items: start;
      }

      .actions {
        padding-left: 21px;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="toolbar">
      <div class="file-meta">
        <div class="file-name">${escapeHtml(state.fileName)}</div>
        <div class="file-path">${escapeHtml(state.relativePath)}</div>
      </div>
      <button class="secondary" id="refresh">${labels.actionRefresh}</button>
    </header>
    <main id="app"></main>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = ${bootState};
    const app = document.getElementById('app');
    const refreshButton = document.getElementById('refresh');

    refreshButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'refresh' });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'commitFiles') {
        state.filesByCommit[message.commitHash] = message.tree;
        state.loadingCommit = undefined;
        render();
      }
      if (message.type === 'error') {
        state.error = message.message;
        state.loadingCommit = undefined;
        render();
      }
    });

    function selectCommit(commitHash) {
      state.activeCommit = state.activeCommit === commitHash ? undefined : commitHash;
      state.error = undefined;
      if (state.activeCommit && !state.filesByCommit[commitHash]) {
        state.loadingCommit = commitHash;
        vscode.postMessage({ type: 'loadCommitFiles', commitHash });
      }
      render();
    }

    function render() {
      if (state.error) {
        app.innerHTML = '<div class="error">' + escapeHtml(state.error) + '</div>';
        return;
      }

      if (!state.commits.length) {
        app.innerHTML = '<div class="empty">' + escapeHtml(state.labels.emptyNoCommits) + '</div>';
        return;
      }

      app.innerHTML = state.commits.map(renderCommit).join('');
      app.querySelectorAll('[data-commit]').forEach((button) => {
        button.addEventListener('click', () => selectCommit(button.dataset.commit));
      });
      app.querySelectorAll('[data-action="change"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          vscode.postMessage({ type: 'showChange', commitHash: button.dataset.commitHash, file: JSON.parse(button.dataset.file) });
        });
      });
      app.querySelectorAll('[data-action="latest"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          vscode.postMessage({ type: 'compareLatest', commitHash: button.dataset.commitHash, file: JSON.parse(button.dataset.file) });
        });
      });
    }

    function renderCommit(commit) {
      const active = state.activeCommit === commit.hash;
      const files = state.filesByCommit[commit.hash];
      const meta = commit.author + ' · ' + commit.date;
      const fileArea = active
        ? '<div class="files">' + renderFiles(commit.hash, files) + '</div>'
        : '';

      return '<section class="commit">' +
        '<button class="commit-row ' + (active ? 'active' : '') + '" data-commit="' + escapeAttr(commit.hash) + '" aria-label="' + escapeAttr(state.labels.ariaLoadFiles) + '">' +
          '<span class="hash">' + escapeHtml(commit.shortHash) + '</span>' +
          '<span class="subject">' + escapeHtml(commit.subject) + '</span>' +
          '<span class="meta">' + escapeHtml(meta) + '</span>' +
        '</button>' +
        fileArea +
      '</section>';
    }

    function renderFiles(commitHash, files) {
      if (state.loadingCommit === commitHash || !files) {
        return '<div class="loading">' + escapeHtml(state.labels.loadingFiles) + '</div>';
      }
      return renderTree(files, commitHash, 0);
    }

    function renderTree(nodes, commitHash, depth) {
      return nodes.map((node) => {
        if (node.type === 'folder') {
          return '<div class="tree-node">' +
            '<div class="tree-line ' + depthClass(depth) + '">' +
              '<div class="node-label"><span class="node-icon">▾</span><span class="node-name">' + escapeHtml(node.name) + '</span></div>' +
            '</div>' +
            renderTree(node.children, commitHash, depth + 1) +
          '</div>';
        }

        const fileData = escapeAttr(JSON.stringify(node.change));
        return '<div class="tree-line ' + depthClass(depth) + '">' +
          '<div class="node-label">' +
            '<span class="node-icon">·</span>' +
            '<span class="status">' + escapeHtml(node.change.status) + '</span>' +
            '<span class="node-name" title="' + escapeAttr(node.path) + '">' + escapeHtml(node.name) + '</span>' +
          '</div>' +
          '<div class="actions">' +
            '<button data-action="change" data-commit-hash="' + escapeAttr(commitHash) + '" data-file="' + fileData + '">' + escapeHtml(state.labels.actionChange) + '</button>' +
            '<button data-action="latest" data-commit-hash="' + escapeAttr(commitHash) + '" data-file="' + fileData + '">' + escapeHtml(state.labels.actionCompareLatest) + '</button>' +
          '</div>' +
        '</div>';
      }).join('');
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

    function depthClass(depth) {
      return 'depth-' + Math.min(Math.max(Number(depth) || 0, 0), 16);
    }

    render();
  </script>
</body>
</html>`;
}

/**
 * 转义 HTML 文本，避免文件名和提交信息影响页面结构。
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

/**
 * 生成有限层级的缩进 class，避免 Webview CSP 拦截内联 style。
 * @param maxDepth 允许的最大目录深度。
 * @returns CSS class 文本。
 */
function createDepthStyles(maxDepth: number): string {
  return Array.from({ length: maxDepth + 1 }, (_, depth) => {
    const padding = 14 + depth * 18;
    return `.tree-line.depth-${depth} { padding-left: ${padding}px; }`;
  }).join('\n    ');
}
