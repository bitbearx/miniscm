import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistoryPanelOptions } from '../src/panelOptions';

test('createHistoryPanelOptions retains webview state when opening diff editors', () => {
  const extensionUri = { fsPath: '/extension' };

  assert.deepEqual(createHistoryPanelOptions(extensionUri as never), {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [extensionUri]
  });
});
