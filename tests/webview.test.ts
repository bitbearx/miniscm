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
