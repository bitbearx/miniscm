import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  getCommitFiles,
  getFileHistory,
  getGitRefs,
  getRepositoryFileInfo,
  gitRefExists,
  parseChangedFiles,
  parseCommitHistory,
  parseGitRefs,
  runGit
} from '../src/gitHistory';

test('parseCommitHistory parses git log entries with renamed files', () => {
  const output = [
    '\x1eabc123\x1fAlice\x1f2026-07-02 10:11:12 +0800\x1fUpdate docs',
    'M\tREADME.md',
    'R100\tsrc/old.js\tsrc/new.js',
    '\x1edef456\x1fBob\x1f2026-07-01 09:00:00 +0800\x1fInitial file',
    'A\tsrc/new.js',
    ''
  ].join('\n');

  assert.deepEqual(parseCommitHistory(output), [
    {
      hash: 'abc123',
      shortHash: 'abc123',
      author: 'Alice',
      date: '2026-07-02 10:11:12 +0800',
      subject: 'Update docs',
      message: 'Update docs',
      files: [
        { status: 'M', path: 'README.md', oldPath: undefined },
        { status: 'R100', path: 'src/new.js', oldPath: 'src/old.js' }
      ]
    },
    {
      hash: 'def456',
      shortHash: 'def456',
      author: 'Bob',
      date: '2026-07-01 09:00:00 +0800',
      subject: 'Initial file',
      message: 'Initial file',
      files: [{ status: 'A', path: 'src/new.js', oldPath: undefined }]
    }
  ]);
});

test('parseCommitHistory preserves multi-line commit descriptions before file changes', () => {
  const output = [
    '\x1eabc123\x1fAlice\x1f2026-07-02 10:11:12 +0800\x1fUpdate docs',
    '',
    'Explain the motivation.',
    'Keep the second paragraph visible.\x1f',
    'M\tREADME.md',
    ''
  ].join('\n');

  assert.deepEqual(parseCommitHistory(output), [
    {
      hash: 'abc123',
      shortHash: 'abc123',
      author: 'Alice',
      date: '2026-07-02 10:11:12 +0800',
      subject: 'Update docs',
      message: 'Update docs\n\nExplain the motivation.\nKeep the second paragraph visible.',
      files: [{ status: 'M', path: 'README.md', oldPath: undefined }]
    }
  ]);
});

test('parseChangedFiles handles renamed paths with spaces', () => {
  const output = [
    'M\tdocs/readme.md',
    'R087\told/name with spaces.md\tnew/name with spaces.md',
    'D\tdeleted/file.txt',
    ''
  ].join('\n');

  assert.deepEqual(parseChangedFiles(output), [
    { status: 'M', path: 'docs/readme.md', oldPath: undefined },
    { status: 'R087', path: 'new/name with spaces.md', oldPath: 'old/name with spaces.md' },
    { status: 'D', path: 'deleted/file.txt', oldPath: undefined }
  ]);
});

test('parseGitRefs groups branches, remote branches, and tags', () => {
  const output = [
    'main\trefs/heads/main',
    'feature/ref-compare\trefs/heads/feature/ref-compare',
    'origin/main\trefs/remotes/origin/main',
    'origin/HEAD\trefs/remotes/origin/HEAD',
    'v1.0.0\trefs/tags/v1.0.0',
    ''
  ].join('\n');

  assert.deepEqual(parseGitRefs(output), [
    { label: 'feature/ref-compare', ref: 'refs/heads/feature/ref-compare', type: 'branch' },
    { label: 'main', ref: 'refs/heads/main', type: 'branch' },
    { label: 'origin/main', ref: 'refs/remotes/origin/main', type: 'remote' },
    { label: 'v1.0.0', ref: 'refs/tags/v1.0.0', type: 'tag' }
  ]);
});

test('getFileHistory reads real git history for a file', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-history-'));
  const filePath = path.join(repoRoot, 'src', 'hello.txt');
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'tester@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Test User']);

  await fs.writeFile(filePath, 'hello\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Add hello file']);

  await fs.writeFile(filePath, 'hello\nworld\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Update hello file', '-m', 'Explain the motivation.']);

  const history = await getFileHistory(filePath);
  assert.equal(history.repoRoot, await fs.realpath(repoRoot));
  assert.equal(history.relativePath, 'src/hello.txt');
  assert.deepEqual(
    history.commits.map((commit) => commit.subject),
    ['Update hello file', 'Add hello file']
  );
  assert.deepEqual(
    history.commits.map((commit) => commit.message),
    ['Update hello file\n\nExplain the motivation.', 'Add hello file']
  );

  const changedFiles = await getCommitFiles(repoRoot, history.commits[0].hash);
  assert.deepEqual(changedFiles, [{ status: 'M', path: 'src/hello.txt', oldPath: undefined }]);
});

test('getRepositoryFileInfo resolves repo root and relative path without file history', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-file-info-'));
  const filePath = path.join(repoRoot, 'src', 'draft.txt');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, 'draft\n', 'utf8');

  await runGit(repoRoot, ['init']);

  const fileInfo = await getRepositoryFileInfo(filePath);
  assert.equal(fileInfo.repoRoot, await fs.realpath(repoRoot));
  assert.equal(fileInfo.relativePath, 'src/draft.txt');
});

test('getGitRefs reads real branches and tags', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-refs-'));
  const filePath = path.join(repoRoot, 'hello.txt');

  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'tester@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Test User']);
  await fs.writeFile(filePath, 'hello\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Add hello file']);
  await runGit(repoRoot, ['branch', 'feature/ref-compare']);
  await runGit(repoRoot, ['tag', 'v1.0.0']);

  const refs = await getGitRefs(repoRoot);

  assert.ok(refs.some((ref) => ref.type === 'branch' && ref.ref === 'refs/heads/feature/ref-compare'));
  assert.ok(refs.some((ref) => ref.type === 'tag' && ref.ref === 'refs/tags/v1.0.0'));
});

test('gitRefExists validates refs before opening a diff', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-ref-exists-'));
  const filePath = path.join(repoRoot, 'hello.txt');

  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'tester@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Test User']);
  await fs.writeFile(filePath, 'hello\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Add hello file']);
  await runGit(repoRoot, ['tag', 'v1.0.0']);

  assert.equal(await gitRefExists(repoRoot, 'HEAD'), true);
  assert.equal(await gitRefExists(repoRoot, 'refs/tags/v1.0.0'), true);
  assert.equal(await gitRefExists(repoRoot, 'missing-ref'), false);
});
