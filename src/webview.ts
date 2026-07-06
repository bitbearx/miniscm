import type * as vscode from 'vscode';

import type { ChangedFile, CommitHistoryItem, FileHistoryOptions, GitCommitDetails, HistoryTargetKind, HistoryTimeRange } from './types';
import type { I18n } from './i18n';

/** Webview 初始渲染所需的数据。 */
export interface HistoryWebviewState {
  fileName: string;
  relativePath: string;
  targetKind: HistoryTargetKind;
  commits: CommitHistoryItem[];
  filesByCommit: Record<string, ChangedFile[]>;
  options: FileHistoryOptions;
}

/** Commit 详情 Webview 初始渲染所需的数据。 */
export interface CommitDetailsWebviewState {
  commit: GitCommitDetails;
  files: ChangedFile[];
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
    actionOpenCommitDetails: i18n.t('action.openCommitDetails'),
    actionRefresh: i18n.t('action.refresh'),
    ariaLoadFiles: i18n.t('aria.loadFiles'),
    changedFiles: i18n.t('label.changedFiles'),
    commits: i18n.t('label.commits'),
    date: i18n.t('label.date'),
    emptyNoCommits: i18n.t('empty.noCommits'),
    file: i18n.t('label.file'),
    loading: i18n.t('label.loading'),
    loadingFiles: i18n.t('label.loadingFiles'),
    merge: i18n.t('label.merge'),
    path: i18n.t('label.path'),
    copied: i18n.t('toast.copied'),
    emptyNoMatches: i18n.t('empty.noMatches'),
    includeMerges: i18n.t('label.includeMerges'),
    searchCommits: i18n.t('placeholder.searchCommits'),
    timeRange: i18n.t('label.timeRange'),
    timeRange1: i18n.t('timeRange.1'),
    timeRange2: i18n.t('timeRange.2'),
    timeRange3: i18n.t('timeRange.3'),
    timeRange5: i18n.t('timeRange.5'),
    timeRangeAll: i18n.t('timeRange.all'),
    title: i18n.t('webview.title')
  };

  const bootState = serializeForScript({ ...state, labels });
  const timeOptions: Array<{ value: HistoryTimeRange; label: string }> = [
    { value: '1', label: labels.timeRange1 },
    { value: '2', label: labels.timeRange2 },
    { value: '3', label: labels.timeRange3 },
    { value: '5', label: labels.timeRange5 },
    { value: 'all', label: labels.timeRangeAll }
  ];

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

    .history-controls {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }

    .search-input,
    .time-select {
      min-height: 26px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 3px;
      font: inherit;
    }

    .search-input {
      width: min(260px, 32vw);
      padding: 3px 8px;
    }

    .time-select {
      padding: 3px 6px;
    }

    .filter-check {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
      user-select: none;
    }

    .filter-check input {
      margin: 0;
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

    .hash-open {
      flex: 0 0 auto;
      margin: 0;
      padding: 0;
      color: var(--vscode-textLink-foreground);
      background: transparent;
      border: 0;
      font: inherit;
      cursor: pointer;
    }

    .hash-open:hover {
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

    .commit-detail-actions {
      padding: 8px 14px 0;
      background: var(--vscode-editorWidget-background);
      border-top: 1px solid var(--vscode-panel-border);
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

    .toast {
      position: fixed;
      right: 14px;
      bottom: 14px;
      z-index: 10;
      max-width: min(260px, calc(100vw - 28px));
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

    @media (max-width: 680px) {
      .toolbar {
        align-items: stretch;
        flex-direction: column;
      }

      .history-controls {
        justify-content: flex-start;
      }

      .search-input {
        width: 100%;
      }

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
      <div class="history-controls">
        <input class="search-input" id="searchCommits" type="search" placeholder="${escapeHtml(labels.searchCommits)}" aria-label="${escapeHtml(labels.searchCommits)}">
        <label class="filter-check"><input id="includeMerges" type="checkbox"${state.options.includeMerges ? ' checked' : ''}>${escapeHtml(labels.includeMerges)}</label>
        <select class="time-select" id="timeRange" aria-label="${escapeHtml(labels.timeRange)}">
          ${timeOptions.map((option) => `<option value="${option.value}"${option.value === state.options.timeRange ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
        </select>
        <button class="secondary" id="refresh">${escapeHtml(labels.actionRefresh)}</button>
      </div>
    </header>
    <main id="app"></main>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = ${bootState};
    const app = document.getElementById('app');
    const refreshButton = document.getElementById('refresh');
    const includeMergesInput = document.getElementById('includeMerges');
    const searchInput = document.getElementById('searchCommits');
    const timeRangeSelect = document.getElementById('timeRange');
    const toast = document.getElementById('toast');
    let toastTimer = undefined;
    state.historyRequestId = 0;

    refreshButton.addEventListener('click', () => reloadHistory());
    includeMergesInput.addEventListener('change', () => {
      state.options.includeMerges = includeMergesInput.checked;
      reloadHistory();
    });
    timeRangeSelect.addEventListener('change', () => {
      state.options.timeRange = timeRangeSelect.value;
      reloadHistory();
    });
    searchInput.addEventListener('input', () => {
      state.searchQuery = searchInput.value;
      render();
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
      if (message.type === 'hashCopied') {
        showToast(state.labels.copied);
      }
    });

    function reloadHistory() {
      state.error = undefined;
      state.loadingCommit = undefined;
      state.historyRequestId += 1;
      app.innerHTML = '<div class="loading">' + escapeHtml(state.labels.loading) + '</div>';
      vscode.postMessage({ type: 'reloadHistory', options: state.options, requestId: state.historyRequestId });
    }

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

      const commits = getFilteredCommits();
      if (!commits.length) {
        const emptyText = state.commits.length ? state.labels.emptyNoMatches : state.labels.emptyNoCommits;
        app.innerHTML = '<div class="empty">' + escapeHtml(emptyText) + '</div>';
        return;
      }

      app.innerHTML = commits.map(renderCommit).join('');
      app.querySelectorAll('[data-commit]').forEach((row) => {
        row.addEventListener('click', () => selectCommit(row.dataset.commit));
        row.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectCommit(row.dataset.commit);
          }
        });
      });
      app.querySelectorAll('[data-action="openCommit"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          vscode.postMessage({ type: 'openCommitDetails', commitHash: button.dataset.commitHash });
        });
      });
      app.querySelectorAll('[data-action="copyHash"]').forEach((button) => {
        button.addEventListener('click', copyCommitHash);
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

    function getFilteredCommits() {
      const query = String(state.searchQuery || '').trim().toLowerCase();
      if (!query) {
        return state.commits;
      }
      return state.commits.filter((commit) => {
        return [commit.hash, commit.shortHash, commit.subject, commit.message]
          .some((value) => String(value || '').toLowerCase().includes(query));
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
      return '<button class="hash-open" data-action="openCommit" data-commit-hash="' + escapeAttr(commit.hash) + '" title="' + escapeAttr(state.labels.actionOpenCommitDetails) + '" aria-label="' + escapeAttr(state.labels.actionOpenCommitDetails) + '">' +
        '<span class="hash">' + escapeHtml(commit.shortHash) + '</span>' +
      '</button>';
    }

    function showToast(message) {
      toast.textContent = message;
      toast.classList.add('visible');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toast.classList.remove('visible');
      }, 3000);
    }

    function renderMergeBadge(commit) {
      if (!commit.isMerge) {
        return '';
      }
      return '<span class="merge-badge">' + escapeHtml(state.labels.merge) + '</span>';
    }

    function renderCommitMessage(commit) {
      const message = String(commit.message || commit.subject || '').trim();
      const actions = '<div class="commit-detail-actions"><button data-action="copyHash" data-commit-hash="' + escapeAttr(commit.hash) + '">' + escapeHtml(state.labels.actionCopyHash) + '</button></div>';
      if (!message || message === commit.subject) {
        return actions;
      }
      return actions + '<div class="commit-message">' + escapeHtml(message) + '</div>';
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
 * 创建 commit 详情 Webview 的完整 HTML。
 * @param webview VS Code Webview 实例。
 * @param state 初始渲染状态。
 * @param i18n 本地化工具。
 * @returns HTML 字符串。
 */
export function createCommitDetailsHtml(webview: vscode.Webview, state: CommitDetailsWebviewState, i18n: I18n): string {
  const nonce = createNonce();
  const labels = {
    actionChange: i18n.t('action.change'),
    actionCopyHash: i18n.t('action.copyHash'),
    actionOpenInGitHub: i18n.t('action.openInGitHub'),
    author: i18n.t('label.author'),
    changedFiles: i18n.t('label.changedFiles'),
    commit: i18n.t('label.commit'),
    date: i18n.t('label.date'),
    title: i18n.t('webview.commitDetailsTitle')
  };
  const bootState = serializeForScript({ commit: state.commit });
  const githubLink = state.commit.githubUrl
    ? `<a href="${escapeHtml(state.commit.githubUrl)}" rel="noreferrer noopener">${escapeHtml(labels.actionOpenInGitHub)}</a>`
    : '';

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
      min-height: 100vh;
    }

    .header {
      padding: 14px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }

    .title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .meta {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    .hash {
      color: var(--vscode-textLink-foreground);
      font-family: var(--vscode-editor-font-family);
    }

    .message {
      margin: 0;
      padding: 12px 14px;
      border-bottom: 1px solid var(--vscode-panel-border);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      line-height: 1.45;
    }

    .section-title {
      padding: 10px 14px 6px;
      color: var(--vscode-descriptionForeground);
      font-weight: 600;
    }

    .file-row {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 10px;
      min-height: 30px;
      padding: 3px 14px;
      border-top: 1px solid var(--vscode-panel-border);
    }

    .file-main {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 7px;
      overflow: hidden;
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

    .file-path-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    button {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 3px;
      padding: 2px 7px;
      color: var(--vscode-foreground);
      background: transparent;
      font: inherit;
      cursor: pointer;
    }

    button:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    a {
      color: var(--vscode-textLink-foreground);
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="header">
      <h1 class="title">${escapeHtml(state.commit.subject || labels.title)}</h1>
      <div class="meta">
        <span>${escapeHtml(labels.author)}: ${escapeHtml(state.commit.author)}</span>
        <span>${escapeHtml(labels.date)}: ${escapeHtml(state.commit.authorDate)}</span>
        <span>${escapeHtml(labels.commit)}: <span class="hash">${escapeHtml(state.commit.shortHash)}</span></span>
        <button data-action="copyHash">${escapeHtml(labels.actionCopyHash)}</button>
        ${githubLink}
      </div>
    </header>
    <pre class="message">${escapeHtml(state.commit.message || state.commit.subject)}</pre>
    <div class="section-title">${escapeHtml(labels.changedFiles)}</div>
    <main>
      ${state.files.map((file) => renderCommitDetailsFileRow(file, labels.actionChange)).join('')}
    </main>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = ${bootState};
    document.querySelector('[data-action="copyHash"]')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'copyCommitHash', commitHash: state.commit.hash });
    });
    document.querySelectorAll('[data-action="change"]').forEach((button) => {
      button.addEventListener('click', () => {
        vscode.postMessage({ type: 'showChange', commitHash: state.commit.hash, file: JSON.parse(button.dataset.file) });
      });
    });
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
 * 渲染 commit 详情中的单个变更文件。
 * @param file 变更文件。
 * @param actionLabel diff 按钮文案。
 * @returns 文件行 HTML。
 */
function renderCommitDetailsFileRow(file: ChangedFile, actionLabel: string): string {
  const fileData = escapeHtml(JSON.stringify(file));
  const label = file.oldPath && file.oldPath !== file.path ? `${file.oldPath} → ${file.path}` : file.path;
  return '<div class="file-row">' +
    '<div class="file-main">' +
      '<span class="status">' + escapeHtml(file.status) + '</span>' +
      '<span class="file-path-name" title="' + escapeHtml(label) + '">' + escapeHtml(label) + '</span>' +
    '</div>' +
    '<button data-action="change" data-file="' + fileData + '">' + escapeHtml(actionLabel) + '</button>' +
  '</div>';
}
