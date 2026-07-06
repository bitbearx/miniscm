import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const blameStatusSource = fs.readFileSync(path.join(process.cwd(), 'src', 'blameStatus.ts'), 'utf8');

test('LineBlameStatusManager renders on the right and makes status item clickable', () => {
  assert.match(blameStatusSource, /createStatusBarItem\(vscode\.StatusBarAlignment\.Right/);
  assert.match(blameStatusSource, /this\.statusItem\.command =/);
  assert.match(blameStatusSource, /command: OPEN_COMMIT_DETAILS_COMMAND/);
  assert.match(blameStatusSource, /arguments: \[createOpenCommitDetailsCommandArgs\(blame\)\]/);
});
