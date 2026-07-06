import assert from 'node:assert/strict';
import test from 'node:test';

import { createI18n } from '../src/i18n';
import { createHistoryHtml } from '../src/webview';

test('createHistoryHtml renders flat changed-file rows without tree depth classes', () => {
  const html = createHistoryHtml(
    { cspSource: 'vscode-resource:' } as never,
    {
      fileName: 'hello.txt',
      relativePath: 'src/hello.txt',
      targetKind: 'file',
      commits: [],
      filesByCommit: {},
      options: { includeMerges: false, timeRange: '1' }
    },
    createI18n('en')
  );

  assert.match(html, /class="file-row"/);
  assert.match(html, /renderFileRows\(files, commitHash\)/);
  assert.match(html, /sortChangedFilesByDirectory\(files\)/);
  assert.doesNotMatch(html, /renderTree/);
  assert.doesNotMatch(html, /tree-line/);
  assert.doesNotMatch(html, /style="/);
});

test('createHistoryHtml renders history filters with default values', () => {
  const html = createHistoryHtml(
    { cspSource: 'vscode-resource:' } as never,
    {
      fileName: 'hello.txt',
      relativePath: 'src/hello.txt',
      targetKind: 'file',
      commits: [],
      filesByCommit: {},
      options: { includeMerges: false, timeRange: '1' }
    },
    createI18n('en')
  );

  assert.match(html, /type="search"/);
  assert.match(html, /Search commits/);
  assert.match(html, /<input id="includeMerges" type="checkbox"/);
  assert.match(html, /Include merge commits/);
  assert.match(html, /<select class="time-select" id="timeRange"/);
  assert.match(html, /value="1" selected/);
  assert.match(html, /Last 2 years/);
  assert.match(html, /Last 3 years/);
  assert.match(html, /Last 5 years/);
  assert.match(html, /All time/);
});

test('createHistoryHtml sends reload requests with an increasing request id', () => {
  const html = createHistoryHtml(
    { cspSource: 'vscode-resource:' } as never,
    {
      fileName: 'hello.txt',
      relativePath: 'src/hello.txt',
      targetKind: 'file',
      commits: [],
      filesByCommit: {},
      options: { includeMerges: false, timeRange: '1' }
    },
    createI18n('en')
  );

  assert.match(html, /state\.historyRequestId/);
  assert.match(html, /requestId: state\.historyRequestId/);
  assert.match(html, /type: 'reloadHistory'/);
});

test('createHistoryHtml filters commits by hash subject and description', () => {
  const html = createHistoryHtml(
    { cspSource: 'vscode-resource:' } as never,
    {
      fileName: 'hello.txt',
      relativePath: 'src/hello.txt',
      targetKind: 'file',
      commits: [],
      filesByCommit: {},
      options: { includeMerges: false, timeRange: '1' }
    },
    createI18n('en')
  );

  assert.match(html, /function getFilteredCommits\(\)/);
  assert.match(html, /commit\.hash/);
  assert.match(html, /commit\.subject/);
  assert.match(html, /commit\.message/);
});

test('createHistoryHtml renders author after hash and keeps multi-line commit message area', () => {
  const html = createHistoryHtml(
    { cspSource: 'vscode-resource:' } as never,
    {
      fileName: 'hello.txt',
      relativePath: 'src/hello.txt',
      targetKind: 'file',
      commits: [
        {
          hash: 'abc123',
          shortHash: 'abc123',
          author: 'Alice',
          date: '2026-07-02 10:11:12 +0800',
          subject: 'Update docs',
          message: 'Update docs\n\nExplain the motivation.',
          isMerge: false,
          files: []
        }
      ],
      filesByCommit: {},
      options: { includeMerges: false, timeRange: '1' }
    },
    createI18n('en')
  );

  assert.match(html, /class="commit-identity"/);
  assert.match(html, /class="commit-author"/);
  assert.match(html, /class="commit-message"/);
  assert.match(html, /white-space: pre-wrap/);
  assert.match(html, /renderCommitMessage\(commit\)/);
});

test('createHistoryHtml renders merge commits with a dedicated badge', () => {
  const html = createHistoryHtml(
    { cspSource: 'vscode-resource:' } as never,
    {
      fileName: 'story.txt',
      relativePath: 'story.txt',
      targetKind: 'file',
      commits: [
        {
          hash: 'abc123',
          shortHash: 'abc123',
          author: 'Alice',
          date: '2026-07-02 10:11:12 +0800',
          subject: 'Merge feature branch',
          message: 'Merge feature branch',
          isMerge: true,
          files: []
        }
      ],
      filesByCommit: {},
      options: { includeMerges: true, timeRange: '1' }
    },
    createI18n('en')
  );

  const mergeBadgeStyle = html.match(/\.merge-badge\s*\{[\s\S]*?\n    \}/)?.[0] ?? '';

  assert.match(html, /class="merge-badge"/);
  assert.match(mergeBadgeStyle, /background: transparent;/);
  assert.doesNotMatch(mergeBadgeStyle, /vscode-badge-background/);
  assert.match(html, /renderMergeBadge\(commit\)/);
  assert.match(html, /Merge/);
});

test('createHistoryHtml renders commit hash as a copy target with success toast', () => {
  const html = createHistoryHtml(
    { cspSource: 'vscode-resource:' } as never,
    {
      fileName: 'hello.txt',
      relativePath: 'src/hello.txt',
      targetKind: 'file',
      commits: [
        {
          hash: 'abc123456789',
          shortHash: 'abc1234',
          author: 'Alice',
          date: '2026-07-02 10:11:12 +0800',
          subject: 'Update docs',
          message: 'Update docs',
          isMerge: false,
          files: []
        }
      ],
      filesByCommit: {},
      options: { includeMerges: false, timeRange: '1' }
    },
    createI18n('en')
  );

  assert.match(html, /data-action="copyHash"/);
  assert.match(html, /data-commit-hash="' \+ escapeAttr\(commit\.hash\) \+ '"/);
  assert.match(html, /Click to copy commit hash/);
  assert.match(html, /copyCommitHash/);
  assert.match(html, /showToast/);
  assert.match(html, /Copied/);
  assert.match(html, /3000/);
  assert.doesNotMatch(html, /contextmenu/);
  assert.doesNotMatch(html, /cursor: copy/);
});
