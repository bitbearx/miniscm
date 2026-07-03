import type * as vscode from 'vscode';

import type { ChangedFile, CommitHistoryItem } from './types';
import type { I18n } from './i18n';

/** Webview 初始渲染所需的数据。 */
export interface HistoryWebviewState {
  fileName: string;
  relativePath: string;
  commits: CommitHistoryItem[];
  filesByCommit: Record<string, ChangedFile[]>;
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
    actionCopyHash: i18n.t('action.copyHash'),
    actionRefresh: i18n.t('action.refresh'),
    ariaLoadFiles: i18n.t('aria.loadFiles'),
    changedFiles: i18n.t('label.changedFiles'),
    commits: i18n.t('label.commits'),
    date: i18n.t('label.date'),
    emptyNoCommits: i18n.t('empty.noCommits'),
    file: i18n.t('label.file'),
    loadingFiles: i18n.t('label.loadingFiles'),
    merge: i18n.t('label.merge'),
    path: i18n.t('label.path'),
    title: i18n.t('webview.title')
  };

  const bootState = serializeForScript({ ...state, labels });

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
      grid-template-columns: minmax(160px, 240px) minmax(180px, 1fr) minmax(140px, 200px);
      align-items: center;
      gap: 12px;
      padding: 9px 14px;
      color: inherit;
      background: transparent;
      border: 0;
      text-align: left;
      cursor: pointer;
    }

    .commit-identity {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
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

    .hash-copy {
      flex: 0 0 auto;
      margin: 0;
      padding: 0;
      color: var(--vscode-textLink-foreground);
      background: transparent;
      border: 0;
      font: inherit;
      cursor: copy;
    }

    .hash-copy:hover {
      color: var(--vscode-textLink-activeForeground);
      background: transparent;
      text-decoration: underline;
    }

    .commit-author {
      min-width: 0;
      color: var(--vscode-descriptionForeground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .merge-badge {
      flex: 0 0 auto;
      padding: 1px 6px;
      border-radius: 999px;
      color: var(--vscode-descriptionForeground);
      background: transparent;
      border: 1px solid var(--vscode-panel-border);
      font-size: 10px;
      font-weight: 500;
      line-height: 1.5;
      opacity: 0.82;
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

    .commit-message {
      padding: 10px 14px 8px 14px;
      color: var(--vscode-foreground);
      background: var(--vscode-editorWidget-background);
      border-top: 1px solid var(--vscode-panel-border);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      line-height: 1.45;
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

    .file-row {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 10px;
      min-height: 28px;
      padding: 2px 14px;
    }

    .file-row:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .file-main {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 7px;
      overflow: hidden;
    }

    .file-path-name {
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
        grid-template-columns: 1fr;
      }

      .meta {
        text-align: left;
      }

      .file-row {
        grid-template-columns: 1fr;
        align-items: start;
      }

      .actions {
        padding-left: 35px;
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
        state.filesByCommit[message.commitHash] = message.files;
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
      app.querySelectorAll('[data-commit]').forEach((row) => {
        row.addEventListener('click', () => selectCommit(row.dataset.commit));
        row.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectCommit(row.dataset.commit);
          }
        });
      });
      app.querySelectorAll('[data-action="copyHash"]').forEach((button) => {
        button.addEventListener('click', copyCommitHash);
        button.addEventListener('contextmenu', copyCommitHash);
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
      const meta = commit.date;
      const fileArea = active
        ? renderCommitMessage(commit) + '<div class="files">' + renderFiles(commit.hash, files) + '</div>'
        : '';

      return '<section class="commit">' +
        '<div class="commit-row ' + (active ? 'active' : '') + '" data-commit="' + escapeAttr(commit.hash) + '" role="button" tabindex="0" aria-label="' + escapeAttr(state.labels.ariaLoadFiles) + '">' +
          '<span class="commit-identity">' + renderCommitHash(commit) + '<span class="commit-author">' + escapeHtml(commit.author) + '</span>' + renderMergeBadge(commit) + '</span>' +
          '<span class="subject">' + escapeHtml(commit.subject) + '</span>' +
          '<span class="meta">' + escapeHtml(meta) + '</span>' +
        '</div>' +
        fileArea +
      '</section>';
    }

    function copyCommitHash(event) {
      event.preventDefault();
      event.stopPropagation();
      vscode.postMessage({ type: 'copyCommitHash', commitHash: event.currentTarget.dataset.commitHash });
    }

    function renderCommitHash(commit) {
      return '<button class="hash-copy" data-action="copyHash" data-commit-hash="' + escapeAttr(commit.hash) + '" title="' + escapeAttr(state.labels.actionCopyHash) + '" aria-label="' + escapeAttr(state.labels.actionCopyHash) + '">' +
        '<span class="hash">' + escapeHtml(commit.shortHash) + '</span>' +
      '</button>';
    }

    function renderMergeBadge(commit) {
      if (!commit.isMerge) {
        return '';
      }
      return '<span class="merge-badge">' + escapeHtml(state.labels.merge) + '</span>';
    }

    function renderCommitMessage(commit) {
      const message = String(commit.message || commit.subject || '').trim();
      if (!message || message === commit.subject) {
        return '';
      }
      return '<div class="commit-message">' + escapeHtml(message) + '</div>';
    }

    function renderFiles(commitHash, files) {
      if (state.loadingCommit === commitHash || !files) {
        return '<div class="loading">' + escapeHtml(state.labels.loadingFiles) + '</div>';
      }
      return renderFileRows(files, commitHash);
    }

    // 将变更文件按行渲染，不再展示目录树节点。
    function renderFileRows(files, commitHash) {
      return sortChangedFilesByDirectory(files).map((file) => {
        const fileData = escapeAttr(JSON.stringify(file));
        return '<div class="file-row">' +
          '<div class="file-main">' +
            '<span class="status">' + escapeHtml(file.status) + '</span>' +
            '<span class="file-path-name" title="' + escapeAttr(file.path) + '">' + escapeHtml(file.path) + '</span>' +
          '</div>' +
          '<div class="actions">' +
            '<button data-action="change" data-commit-hash="' + escapeAttr(commitHash) + '" data-file="' + fileData + '">' + escapeHtml(state.labels.actionChange) + '</button>' +
            '<button data-action="latest" data-commit-hash="' + escapeAttr(commitHash) + '" data-file="' + fileData + '">' + escapeHtml(state.labels.actionCompareLatest) + '</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    // 按目录路径和文件名排序，确保同目录文件连续显示。
    function sortChangedFilesByDirectory(files) {
      return [...files].sort((left, right) => {
        const directoryCompare = getDirectoryPath(left.path).localeCompare(getDirectoryPath(right.path));
        if (directoryCompare !== 0) {
          return directoryCompare;
        }

        const fileNameCompare = getFileName(left.path).localeCompare(getFileName(right.path));
        if (fileNameCompare !== 0) {
          return fileNameCompare;
        }

        return left.path.localeCompare(right.path);
      });
    }

    // 获取文件路径中的目录部分。
    function getDirectoryPath(filePath) {
      const separatorIndex = String(filePath || '').lastIndexOf('/');
      return separatorIndex < 0 ? '' : filePath.slice(0, separatorIndex);
    }

    // 获取文件路径中的文件名部分。
    function getFileName(filePath) {
      const separatorIndex = String(filePath || '').lastIndexOf('/');
      return separatorIndex < 0 ? filePath : filePath.slice(separatorIndex + 1);
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
