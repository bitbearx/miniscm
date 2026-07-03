import assert from 'node:assert/strict';
import test from 'node:test';

import { createI18n } from '../src/i18n';
import { createHistoryHtml } from '../src/webview';

test('createHistoryHtml renders depth classes without inline style attributes', () => {
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

  assert.match(html, /\.tree-line\.depth-1/);
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
