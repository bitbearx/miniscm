import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  createGitHubCommitUrl,
  getCommitFiles,
  getFileHistory,
  getGitRefs,
  getLineBlame,
  getPathHistory,
  getRepositoryFileInfo,
  gitRefExists,
  parseChangedFiles,
  parseCommitHistory,
  parseGitRefs,
  runGit
} from '../src/gitHistory';

const execFileAsync = promisify(execFile);

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
      isMerge: false,
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
      isMerge: false,
      files: [{ status: 'A', path: 'src/new.js', oldPath: undefined }]
    }
  ]);
});

test('parseCommitHistory marks commits with multiple parents as merge commits', () => {
  const output = [
    '\x1eabc123\x1f1111111 2222222\x1fAlice\x1f2026-07-02 10:11:12 +0800\x1fMerge feature branch\x1f',
    'M\tREADME.md',
    ''
  ].join('\n');

  assert.deepEqual(parseCommitHistory(output), [
    {
      hash: 'abc123',
      shortHash: 'abc123',
      author: 'Alice',
      date: '2026-07-02 10:11:12 +0800',
      subject: 'Merge feature branch',
      message: 'Merge feature branch',
      isMerge: true,
      files: [{ status: 'M', path: 'README.md', oldPath: undefined }]
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
      isMerge: false,
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

test('createGitHubCommitUrl supports common GitHub remote URL formats', () => {
  assert.equal(
    createGitHubCommitUrl('https://github.com/bitbearx/miniscm.git', 'abc123'),
    'https://github.com/bitbearx/miniscm/commit/abc123'
  );
  assert.equal(
    createGitHubCommitUrl('git@github.com:bitbearx/miniscm.git', 'abc123'),
    'https://github.com/bitbearx/miniscm/commit/abc123'
  );
  assert.equal(
    createGitHubCommitUrl('ssh://git@github.com/bitbearx/miniscm.git', 'abc123'),
    'https://github.com/bitbearx/miniscm/commit/abc123'
  );
  assert.equal(createGitHubCommitUrl('https://gitlab.com/bitbearx/miniscm.git', 'abc123'), undefined);
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
  assert.deepEqual(
    history.commits.map((commit) => commit.isMerge),
    [false, false]
  );

  const changedFiles = await getCommitFiles(repoRoot, history.commits[0].hash);
  assert.deepEqual(changedFiles, [{ status: 'M', path: 'src/hello.txt', oldPath: undefined }]);
});

test('getLineBlame reads commit details and GitHub URL for a specific line', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-line-blame-'));
  const filePath = path.join(repoRoot, 'story.txt');

  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'tester@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Test User']);
  await runGit(repoRoot, ['remote', 'add', 'origin', 'git@github.com:bitbearx/miniscm.git']);

  await fs.writeFile(filePath, 'first\nsecond\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGitWithEnv(repoRoot, ['commit', '-m', 'Add story file'], {
    GIT_AUTHOR_DATE: '2026-07-01T10:00:00+0800',
    GIT_COMMITTER_DATE: '2026-07-01T10:00:00+0800'
  });

  await fs.writeFile(filePath, 'first\nsecond updated\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGitWithEnv(repoRoot, ['commit', '-m', 'Update second line', '-m', 'Explain why the second line changed.'], {
    GIT_AUTHOR_DATE: '2026-07-02T11:12:13+0800',
    GIT_COMMITTER_DATE: '2026-07-02T11:12:13+0800'
  });
  const secondCommitHash = (await runGit(repoRoot, ['rev-parse', 'HEAD'])).trim();

  const blame = await getLineBlame(filePath, 2);

  assert.equal(blame.author, 'Test User');
  assert.equal(blame.authorDate, '2026-07-02T11:12:13+08:00');
  assert.equal(blame.hash, secondCommitHash);
  assert.equal(blame.shortHash, secondCommitHash.slice(0, 8));
  assert.equal(blame.subject, 'Update second line');
  assert.equal(blame.message, 'Update second line\n\nExplain why the second line changed.');
  assert.equal(blame.githubUrl, `https://github.com/bitbearx/miniscm/commit/${secondCommitHash}`);
});

test('getLineBlame omits GitHub URL for uncommitted lines', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-uncommitted-blame-'));
  const filePath = path.join(repoRoot, 'draft.txt');

  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'tester@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Test User']);
  await runGit(repoRoot, ['remote', 'add', 'origin', 'git@github.com:bitbearx/miniscm.git']);
  await fs.writeFile(filePath, 'committed\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Add draft file']);

  await fs.writeFile(filePath, 'uncommitted\n', 'utf8');

  const blame = await getLineBlame(filePath, 1);

  assert.match(blame.hash, /^0+$/);
  assert.equal(blame.githubUrl, undefined);
});

test('getFileHistory excludes merge commits by default', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-merge-default-filter-'));
  const filePath = path.join(repoRoot, 'story.txt');

  await createMergeCommitForFile(repoRoot, filePath, 'story.txt');

  const history = await getFileHistory(filePath);

  assert.equal(
    history.commits.some((commit) => commit.subject === 'Merge feature branch'),
    false
  );
});

test('getFileHistory includes merge commits that change the file', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-merge-history-'));
  const filePath = path.join(repoRoot, 'story.txt');

  await createMergeCommitForFile(repoRoot, filePath, 'story.txt');

  const history = await getFileHistory(filePath, { includeMerges: true, timeRange: '1' });
  const mergeCommit = history.commits.find((commit) => commit.subject === 'Merge feature branch');

  assert.ok(mergeCommit);
  assert.equal(mergeCommit.isMerge, true);

  const changedFiles = await getCommitFiles(repoRoot, mergeCommit.hash);
  assert.deepEqual(changedFiles, [{ status: 'M', path: 'story.txt', oldPath: undefined }]);
});

test('getFileHistory includes merge commits that changed the file before a rename', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-merge-rename-history-'));
  const oldPath = path.join(repoRoot, 'old.txt');
  const newPath = path.join(repoRoot, 'new.txt');

  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'tester@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Test User']);

  await fs.writeFile(oldPath, 'base\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Base file']);
  const defaultBranch = (await runGit(repoRoot, ['branch', '--show-current'])).trim();
  await runGit(repoRoot, ['checkout', '-b', 'feature']);
  await fs.writeFile(oldPath, 'feature\n', 'utf8');
  await runGit(repoRoot, ['commit', '-am', 'Feature edits old file']);
  await runGit(repoRoot, ['checkout', defaultBranch]);
  await fs.writeFile(oldPath, 'main\n', 'utf8');
  await runGit(repoRoot, ['commit', '-am', 'Main edits old file']);
  await assert.rejects(runGit(repoRoot, ['merge', 'feature', '--no-ff', '--no-edit']));
  await fs.writeFile(oldPath, 'main\nfeature\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Merge feature branch']);
  await runGit(repoRoot, ['mv', 'old.txt', 'new.txt']);
  await runGit(repoRoot, ['commit', '-m', 'Rename old file']);

  const history = await getFileHistory(newPath, { includeMerges: true, timeRange: '1' });
  const mergeCommit = history.commits.find((commit) => commit.subject === 'Merge feature branch');

  assert.ok(mergeCommit);
  assert.equal(mergeCommit.isMerge, true);
});

test('getFileHistory excludes merge commits that do not change the file', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-merge-filter-'));
  const storyPath = path.join(repoRoot, 'story.txt');
  const otherPath = path.join(repoRoot, 'other.txt');

  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'tester@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Test User']);

  await fs.writeFile(storyPath, 'base\n', 'utf8');
  await fs.writeFile(otherPath, 'base\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Base files']);
  const defaultBranch = (await runGit(repoRoot, ['branch', '--show-current'])).trim();
  await runGit(repoRoot, ['checkout', '-b', 'feature']);
  await fs.writeFile(otherPath, 'feature\n', 'utf8');
  await runGit(repoRoot, ['commit', '-am', 'Feature edits other file']);
  await runGit(repoRoot, ['checkout', defaultBranch]);
  await fs.writeFile(storyPath, 'main\n', 'utf8');
  await runGit(repoRoot, ['commit', '-am', 'Main edits story file']);
  await runGit(repoRoot, ['merge', 'feature', '--no-ff', '-m', 'Merge feature branch']);

  const history = await getFileHistory(storyPath, { includeMerges: true, timeRange: '1' });

  assert.equal(
    history.commits.some((commit) => commit.subject === 'Merge feature branch'),
    false
  );
});

test('getFileHistory defaults to the last year and can include all history', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-time-filter-'));
  const filePath = path.join(repoRoot, 'notes.txt');

  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'tester@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Test User']);

  await fs.writeFile(filePath, 'old\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGitWithEnv(repoRoot, ['commit', '-m', 'Old file'], {
    GIT_AUTHOR_DATE: '2000-01-01T00:00:00+0800',
    GIT_COMMITTER_DATE: '2000-01-01T00:00:00+0800'
  });

  await fs.writeFile(filePath, 'old\nrecent\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Recent file']);

  const recentHistory = await getFileHistory(filePath);
  const allHistory = await getFileHistory(filePath, { includeMerges: false, timeRange: 'all' });

  assert.deepEqual(
    recentHistory.commits.map((commit) => commit.subject),
    ['Recent file']
  );
  assert.deepEqual(
    allHistory.commits.map((commit) => commit.subject),
    ['Recent file', 'Old file']
  );
});

test('getPathHistory reads recursive folder history and excludes outside commits', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-folder-history-'));
  const srcPath = path.join(repoRoot, 'src');
  const srcFilePath = path.join(srcPath, 'hello.txt');
  const nestedFilePath = path.join(srcPath, 'nested', 'world.txt');
  const outsideFilePath = path.join(repoRoot, 'README.md');

  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'tester@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Test User']);

  await fs.mkdir(path.dirname(nestedFilePath), { recursive: true });
  await fs.writeFile(srcFilePath, 'hello\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Add src file']);

  await fs.writeFile(outsideFilePath, 'outside\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Add outside file']);

  await fs.writeFile(nestedFilePath, 'world\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Add nested src file']);

  const history = await getPathHistory(srcPath);

  assert.equal(history.repoRoot, await fs.realpath(repoRoot));
  assert.equal(history.relativePath, 'src');
  assert.equal(history.targetKind, 'folder');
  assert.deepEqual(
    history.commits.map((commit) => commit.subject),
    ['Add nested src file', 'Add src file']
  );
});

test('getPathHistory represents repository root folders as dot', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-root-folder-history-'));
  const filePath = path.join(repoRoot, 'hello.txt');

  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'tester@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Test User']);
  await fs.writeFile(filePath, 'hello\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Add root file']);

  const history = await getPathHistory(repoRoot);

  assert.equal(history.relativePath, '.');
  assert.equal(history.targetKind, 'folder');
  assert.deepEqual(
    history.commits.map((commit) => commit.subject),
    ['Add root file']
  );
});

test('getCommitFiles can limit changed files to a folder scope', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-commit-files-scope-'));
  const srcFilePath = path.join(repoRoot, 'src', 'hello.txt');
  const outsideFilePath = path.join(repoRoot, 'README.md');

  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'tester@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Test User']);
  await fs.mkdir(path.dirname(srcFilePath), { recursive: true });
  await fs.writeFile(srcFilePath, 'hello\n', 'utf8');
  await fs.writeFile(outsideFilePath, 'outside\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Add files']);
  const commitHash = (await runGit(repoRoot, ['rev-parse', 'HEAD'])).trim();

  assert.deepEqual(await getCommitFiles(repoRoot, commitHash, 'src'), [
    { status: 'A', path: 'src/hello.txt', oldPath: undefined }
  ]);
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

test('getRepositoryFileInfo rejects folder paths', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-file-info-folder-'));
  const folderPath = path.join(repoRoot, 'src');
  await fs.mkdir(folderPath, { recursive: true });

  await runGit(repoRoot, ['init']);

  await assert.rejects(getRepositoryFileInfo(folderPath), /Expected a file path/);
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

async function createMergeCommitForFile(repoRoot: string, filePath: string, relativePath: string): Promise<void> {
  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'tester@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Test User']);

  await fs.writeFile(filePath, 'base\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Base file']);
  const defaultBranch = (await runGit(repoRoot, ['branch', '--show-current'])).trim();
  await runGit(repoRoot, ['checkout', '-b', 'feature']);
  await fs.writeFile(filePath, 'feature\n', 'utf8');
  await runGit(repoRoot, ['commit', '-am', 'Feature edits file']);
  await runGit(repoRoot, ['checkout', defaultBranch]);
  await fs.writeFile(filePath, 'main\n', 'utf8');
  await runGit(repoRoot, ['commit', '-am', 'Main edits file']);
  await assert.rejects(runGit(repoRoot, ['merge', 'feature', '--no-ff', '--no-edit']));
  await fs.writeFile(path.join(repoRoot, relativePath), 'main\nfeature\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Merge feature branch']);
}

async function runGitWithEnv(repoRoot: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
  return stdout;
}
