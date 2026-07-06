import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { getRepositoryGraph, parseGraphCommits } from '../src/gitGraph';
import { runGit } from '../src/gitHistory';

const execFileAsync = promisify(execFile);

test('parseGraphCommits reads parents refs and lane data for merge history', () => {
  const output = [
    '3333333333333333333333333333333333333333\x1f1111111111111111111111111111111111111111 2222222222222222222222222222222222222222\x1fAlice\x1f2026-07-03 10:00:00 +0800\x1fMerge feature',
    '2222222222222222222222222222222222222222\x1f0000000000000000000000000000000000000000\x1fBob\x1f2026-07-02 10:00:00 +0800\x1fFeature work',
    '1111111111111111111111111111111111111111\x1f0000000000000000000000000000000000000000\x1fAlice\x1f2026-07-01 10:00:00 +0800\x1fMain work',
    '0000000000000000000000000000000000000000\x1f\x1fAlice\x1f2026-06-30 10:00:00 +0800\x1fInitial commit',
    ''
  ].join('\n');
  const refsByHash = new Map([
    ['3333333333333333333333333333333333333333', [{ label: 'main', ref: 'refs/heads/main', type: 'branch' as const }]],
    ['2222222222222222222222222222222222222222', [{ label: 'feature', ref: 'refs/heads/feature', type: 'branch' as const }]]
  ]);

  const commits = parseGraphCommits(output, refsByHash);

  assert.equal(commits.length, 4);
  assert.equal(commits[0].subject, 'Merge feature');
  assert.deepEqual(commits[0].parents, [
    '1111111111111111111111111111111111111111',
    '2222222222222222222222222222222222222222'
  ]);
  assert.equal(commits[0].isMerge, true);
  assert.deepEqual(commits[0].refs, [{ label: 'main', ref: 'refs/heads/main', type: 'branch' }]);
  assert.equal(commits[0].lane, 0);
  assert.deepEqual(commits[0].parentLanes, [0, 1]);
  assert.ok(commits[1].lane > commits[0].lane);
  assert.ok(commits[0].laneCount >= 2);
});

test('getRepositoryGraph reads all branches by default and can scope to one branch', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-graph-'));
  const filePath = path.join(repoRoot, 'story.txt');

  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'tester@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Test User']);
  await fs.writeFile(filePath, 'base\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Base commit']);
  const defaultBranch = (await runGit(repoRoot, ['branch', '--show-current'])).trim();

  await runGit(repoRoot, ['checkout', '-b', 'feature/graph']);
  await fs.writeFile(filePath, 'base\nfeature\n', 'utf8');
  await runGit(repoRoot, ['commit', '-am', 'Feature branch commit']);

  await runGit(repoRoot, ['checkout', defaultBranch]);
  await fs.writeFile(filePath, 'base\nmain\n', 'utf8');
  await runGit(repoRoot, ['commit', '-am', 'Main branch commit']);

  const allGraph = await getRepositoryGraph(repoRoot);
  const featureGraph = await getRepositoryGraph(repoRoot, 'refs/heads/feature/graph');

  assert.equal(allGraph.repoRoot, await fs.realpath(repoRoot));
  assert.equal(allGraph.selectedRef, undefined);
  assert.ok(allGraph.scopes.some((scope) => scope.ref === 'refs/heads/feature/graph'));
  assert.ok(allGraph.commits.some((commit) => commit.subject === 'Main branch commit'));
  assert.ok(allGraph.commits.some((commit) => commit.subject === 'Feature branch commit'));
  assert.deepEqual(
    featureGraph.commits.map((commit) => commit.subject),
    ['Feature branch commit', 'Base commit']
  );
});

test('getRepositoryGraph defaults to commits from the last year', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-graph-time-filter-'));
  const filePath = path.join(repoRoot, 'story.txt');

  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'tester@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Test User']);
  await fs.writeFile(filePath, 'old\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGitWithEnv(repoRoot, ['commit', '-m', 'Old graph commit'], {
    GIT_AUTHOR_DATE: '2000-01-01T00:00:00+0800',
    GIT_COMMITTER_DATE: '2000-01-01T00:00:00+0800'
  });

  await fs.writeFile(filePath, 'old\nrecent\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Recent graph commit']);

  const graph = await getRepositoryGraph(repoRoot);

  assert.deepEqual(
    graph.commits.map((commit) => commit.subject),
    ['Recent graph commit']
  );
});

test('getRepositoryGraph can include all branch history when requested', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-graph-all-time-'));
  const filePath = path.join(repoRoot, 'story.txt');

  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'tester@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Test User']);
  await fs.writeFile(filePath, 'old\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGitWithEnv(repoRoot, ['commit', '-m', 'Old graph commit'], {
    GIT_AUTHOR_DATE: '2000-01-01T00:00:00+0800',
    GIT_COMMITTER_DATE: '2000-01-01T00:00:00+0800'
  });

  await fs.writeFile(filePath, 'old\nrecent\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Recent graph commit']);

  const graph = await getRepositoryGraph(repoRoot, undefined, { timeRange: 'all' });

  assert.deepEqual(
    graph.commits.map((commit) => commit.subject),
    ['Recent graph commit', 'Old graph commit']
  );
});

test('getRepositoryGraph limits commits to avoid oversized graph payloads', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-graph-limit-'));
  const filePath = path.join(repoRoot, 'story.txt');

  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'tester@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Test User']);

  for (let index = 1; index <= 5; index += 1) {
    await fs.writeFile(filePath, `commit ${index}\n`, 'utf8');
    await runGit(repoRoot, ['add', '.']);
    await runGit(repoRoot, ['commit', '-m', `Graph commit ${index}`]);
  }

  const graph = await getRepositoryGraph(repoRoot, undefined, { timeRange: 'all', maxCommits: 3 });

  assert.equal(graph.maxCommits, 3);
  assert.equal(graph.hasMore, true);
  assert.deepEqual(
    graph.commits.map((commit) => commit.subject),
    ['Graph commit 5', 'Graph commit 4', 'Graph commit 3']
  );
});

test('getRepositoryGraph excludes tag-only commits from the all branches scope', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-graph-branches-only-'));
  const filePath = path.join(repoRoot, 'story.txt');

  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'tester@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Test User']);
  await fs.writeFile(filePath, 'base\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Branch commit']);
  const defaultBranch = (await runGit(repoRoot, ['branch', '--show-current'])).trim();

  await runGit(repoRoot, ['checkout', '--orphan', 'tag-only']);
  await runGit(repoRoot, ['rm', '-rf', '.']);
  await fs.writeFile(filePath, 'tag only\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Tag-only commit']);
  await runGit(repoRoot, ['tag', 'tag-only-ref']);
  await runGit(repoRoot, ['checkout', defaultBranch]);
  await runGit(repoRoot, ['branch', '-D', 'tag-only']);

  const graph = await getRepositoryGraph(repoRoot);

  assert.deepEqual(
    graph.commits.map((commit) => commit.subject),
    ['Branch commit']
  );
});

test('getRepositoryGraph attaches annotated tags to their target commit', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-graph-annotated-tag-'));
  const filePath = path.join(repoRoot, 'story.txt');

  await runGit(repoRoot, ['init']);
  await runGit(repoRoot, ['config', 'user.email', 'tester@example.com']);
  await runGit(repoRoot, ['config', 'user.name', 'Test User']);
  await fs.writeFile(filePath, 'base\n', 'utf8');
  await runGit(repoRoot, ['add', '.']);
  await runGit(repoRoot, ['commit', '-m', 'Tagged commit']);
  await runGit(repoRoot, ['tag', '-a', 'v1.0.0', '-m', 'Release v1.0.0']);

  const graph = await getRepositoryGraph(repoRoot);

  assert.ok(graph.commits[0].refs.some((ref) => ref.type === 'tag' && ref.label === 'v1.0.0'));
});

test('getRepositoryGraph returns an empty graph for repositories without commits', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'miniscm-empty-graph-'));

  await runGit(repoRoot, ['init']);

  const graph = await getRepositoryGraph(repoRoot);

  assert.deepEqual(graph.commits, []);
  assert.deepEqual(graph.scopes, []);
});

async function runGitWithEnv(repoRoot: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
  return stdout;
}
