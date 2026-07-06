import assert from 'node:assert/strict';
import test from 'node:test';

import { createRepositoryGraphHtml } from '../src/graphWebview';
import { createI18n } from '../src/i18n';

test('createRepositoryGraphHtml renders branch selector and context menu actions', () => {
  const html = createRepositoryGraphHtml(
    { cspSource: 'vscode-resource:' } as never,
    {
      repoRoot: '/tmp/repo',
      selectedRef: undefined,
      hasMore: true,
      maxCommits: 1000,
      scopes: [
        { label: 'main', ref: 'refs/heads/main', type: 'branch' },
        { label: 'feature/graph', ref: 'refs/heads/feature/graph', type: 'branch' }
      ],
      commits: [
        {
          hash: 'abc123456789',
          shortHash: 'abc12345',
          parents: ['def456789012'],
          author: 'Alice',
          date: '2026-07-06 10:00:00 +0800',
          subject: 'Add graph view',
          isMerge: false,
          refs: [{ label: 'main', ref: 'refs/heads/main', type: 'branch' }],
          lane: 0,
          parentLanes: [0],
          activeLanes: [0],
          laneCount: 1
        }
      ]
    },
    createI18n('en')
  );

  assert.match(html, /Git Graph/);
  assert.match(html, /All branches/);
  assert.match(html, /Showing latest 1000 commits/);
  assert.match(html, /feature\/graph/);
  assert.match(html, /class="graph-canvas"/);
  assert.match(html, /contextmenu/);
  assert.match(html, /Add tag/);
  assert.match(html, /Create branch/);
  assert.match(html, /Checkout/);
  assert.match(html, /Cherry pick/);
  assert.match(html, /Revert/);
  assert.match(html, /Copy commit hash to Clipboard/);
  assert.match(html, /Copy commit subject to Clipboard/);
  assert.match(html, /type: 'selectGraphScope'/);
  assert.match(html, /type: 'openCommitDetails'/);
  assert.match(html, /type: 'graphCommitAction'/);
  assert.match(html, /data-action="openCommitDetails"/);
  assert.match(html, /data-action="copySubject"/);
  assert.match(html, /action: button\.dataset\.action/);
  assert.match(html, /parentCount: state\.contextParentCount/);
  assert.doesNotMatch(html, /style="/);
});
