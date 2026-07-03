import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
const packageNls = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.nls.json'), 'utf8'));
const packageNlsZh = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.nls.zh-cn.json'), 'utf8'));

test('package contributes compare file with ref command in file context menus', () => {
  const commands = packageJson.contributes.commands.map((command: { command: string }) => command.command);
  const explorerMenu = packageJson.contributes.menus['explorer/context'].map((item: { command: string }) => item.command);
  const editorMenu = packageJson.contributes.menus['editor/context'].map((item: { command: string }) => item.command);

  assert.ok(packageJson.activationEvents.includes('onCommand:miniscm.compareFileWithRef'));
  assert.ok(commands.includes('miniscm.compareFileWithRef'));
  assert.ok(explorerMenu.includes('miniscm.compareFileWithRef'));
  assert.ok(editorMenu.includes('miniscm.compareFileWithRef'));
  assert.equal(packageNls['command.compareFileWithRef'], 'Compare File with Ref');
  assert.equal(packageNlsZh['command.compareFileWithRef'], '与其他 Ref 对比');
});
