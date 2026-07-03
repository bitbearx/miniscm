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
      commits: [],
      filesByCommit: {}
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

test('createHistoryHtml renders author after hash and keeps multi-line commit message area', () => {
  const html = createHistoryHtml(
    { cspSource: 'vscode-resource:' } as never,
    {
      fileName: 'hello.txt',
      relativePath: 'src/hello.txt',
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
      filesByCommit: {}
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
      filesByCommit: {}
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

test('createHistoryHtml renders commit hash as a copy target', () => {
  const html = createHistoryHtml(
    { cspSource: 'vscode-resource:' } as never,
    {
      fileName: 'hello.txt',
      relativePath: 'src/hello.txt',
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
      filesByCommit: {}
    },
    createI18n('en')
  );

  assert.match(html, /data-action="copyHash"/);
  assert.match(html, /data-commit-hash="' \+ escapeAttr\(commit\.hash\) \+ '"/);
  assert.match(html, /Copy commit hash/);
  assert.match(html, /copyCommitHash/);
  assert.match(html, /contextmenu/);
});
