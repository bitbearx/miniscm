import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
const packageNls = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.nls.json'), 'utf8'));
const packageNlsZh = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.nls.zh-cn.json'), 'utf8'));

test('package contributes path history and file compare context menus', () => {
  const commands = packageJson.contributes.commands.map((command: { command: string }) => command.command);
  const explorerMenu = packageJson.contributes.menus['explorer/context'];
  const explorerCommands = explorerMenu.map((item: { command: string }) => item.command);
  const editorTitleContextMenu = packageJson.contributes.menus['editor/title/context'].map(
    (item: { command: string }) => item.command
  );
  const editorTitleContextGroups = packageJson.contributes.menus['editor/title/context'].map(
    (item: { group: string }) => item.group
  );

  assert.ok(packageJson.activationEvents.includes('onCommand:miniscm.compareFileWithRef'));
  assert.ok(commands.includes('miniscm.compareFileWithRef'));
  assert.ok(explorerCommands.includes('miniscm.compareFileWithRef'));
  assert.equal(
    explorerMenu.find((item: { command: string }) => item.command === 'miniscm.showFileHistory')?.when,
    'resourceScheme == file || explorerResourceIsFolder'
  );
  assert.equal(
    explorerMenu.find((item: { command: string }) => item.command === 'miniscm.compareFileWithRef')?.when,
    'resourceScheme == file && !explorerResourceIsFolder'
  );
  assert.ok(editorTitleContextMenu.includes('miniscm.showFileHistory'));
  assert.ok(editorTitleContextMenu.includes('miniscm.compareFileWithRef'));
  assert.deepEqual(editorTitleContextGroups, ['z_miniscm@20', 'z_miniscm@21']);
  assert.equal(packageNls['command.showFileHistory'], 'Show File or Folder Commit History');
  assert.equal(packageNls['command.compareFileWithRef'], 'Compare File with Ref');
  assert.equal(packageNlsZh['command.showFileHistory'], '查看文件或文件夹提交历史');
  assert.equal(packageNlsZh['command.compareFileWithRef'], '与其他 Ref 对比');
});
