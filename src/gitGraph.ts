import fs from 'node:fs/promises';

import { runGit } from './gitHistory';
import { getGitSinceValue } from './historyOptions';
import { DEFAULT_REPOSITORY_GRAPH_OPTIONS, type GitGraphCommit, type GitGraphRef, type GitGraphScope, type GitRefType, type RepositoryGraphOptions, type RepositoryGraphResult } from './types';

const GRAPH_FIELD_SEPARATOR = '\x1f';

/** Git graph 解析前的提交原始字段。 */
interface RawGraphCommit {
  hash: string;
  parents: string[];
  author: string;
  date: string;
  subject: string;
}

/**
 * 读取仓库完整或单分支 Git graph 数据。
 * @param repoRoot Git 仓库根目录。
 * @param selectedRef 可选的分支 ref；未传入时读取所有分支。
 * @param options Git graph 查询选项。
 * @returns Git graph 渲染数据。
 */
export async function getRepositoryGraph(
  repoRoot: string,
  selectedRef?: string,
  options?: Partial<RepositoryGraphOptions>
): Promise<RepositoryGraphResult> {
  const realRepoRoot = await fs.realpath(repoRoot);
  const graphOptions = normalizeRepositoryGraphOptions(options);
  const { refsByHash, scopes } = await getGraphRefs(realRepoRoot);
  const output = await runGit(realRepoRoot, createGraphLogArgs(selectedRef, graphOptions));
  const commits = parseGraphCommits(output, refsByHash);

  return {
    repoRoot: realRepoRoot,
    selectedRef,
    scopes,
    commits: commits.slice(0, graphOptions.maxCommits),
    hasMore: commits.length > graphOptions.maxCommits,
    maxCommits: graphOptions.maxCommits
  };
}

/**
 * 解析 git log 输出并计算每个提交所在的 graph lane。
 * @param output git log --parents 的原始输出。
 * @param refsByHash 按提交哈希分组的 ref 标记。
 * @returns 带布局信息的提交列表。
 */
export function parseGraphCommits(
  output: string,
  refsByHash: Map<string, GitGraphRef[]> = new Map()
): GitGraphCommit[] {
  const rawCommits = output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map(parseGraphCommitLine);

  return attachGraphLanes(rawCommits, refsByHash);
}

/**
 * 构造读取 graph 的 git log 参数。
 * @param selectedRef 可选分支 ref。
 * @param options Git graph 查询选项。
 * @returns git log 参数。
 */
function createGraphLogArgs(selectedRef: string | undefined, options: RepositoryGraphOptions): string[] {
  const args = [
    'log',
    '--date=iso',
    '--topo-order',
    '--parents',
    `--format=%H%x1f%P%x1f%an%x1f%ad%x1f%s`
  ];
  const since = getGitSinceValue(options.timeRange);
  if (since) {
    args.push(`--since=${since}`);
  }
  args.push(`--max-count=${options.maxCommits + 1}`);
  if (selectedRef) {
    args.push(selectedRef);
  } else {
    args.push('--branches', '--remotes');
  }
  return args;
}

/**
 * 规范化仓库 Git graph 查询选项。
 * @param options 待规范化选项。
 * @returns 可安全使用的查询选项。
 */
function normalizeRepositoryGraphOptions(options?: Partial<RepositoryGraphOptions>): RepositoryGraphOptions {
  const allowedTimeRanges: RepositoryGraphOptions['timeRange'][] = ['1', '2', '3', '5', 'all'];
  const timeRange = allowedTimeRanges.includes(options?.timeRange as RepositoryGraphOptions['timeRange'])
    ? (options?.timeRange as RepositoryGraphOptions['timeRange'])
    : DEFAULT_REPOSITORY_GRAPH_OPTIONS.timeRange;
  const maxCommits = normalizeGraphMaxCommits(options?.maxCommits);
  return { timeRange, maxCommits };
}

/**
 * 规范化 graph 单次加载提交数量，避免 Webview payload 过大。
 * @param value 调用方传入的数量。
 * @returns 安全的提交数量上限。
 */
function normalizeGraphMaxCommits(value?: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return DEFAULT_REPOSITORY_GRAPH_OPTIONS.maxCommits;
  }
  return Math.min(value, DEFAULT_REPOSITORY_GRAPH_OPTIONS.maxCommits);
}

/**
 * 读取 graph 用到的分支范围和提交 ref 标记。
 * @param repoRoot Git 仓库根目录。
 * @returns ref 标记和可选分支范围。
 */
async function getGraphRefs(repoRoot: string): Promise<{ refsByHash: Map<string, GitGraphRef[]>; scopes: GitGraphScope[] }> {
  const output = await runGit(repoRoot, [
    'for-each-ref',
    '--sort=refname',
    '--format=%(objectname)%09%(*objectname)%09%(refname:short)%09%(refname)',
    'refs/heads',
    'refs/remotes',
    'refs/tags'
  ]);
  const refsByHash = new Map<string, GitGraphRef[]>();
  const scopes: GitGraphScope[] = [];

  for (const line of output.split(/\r?\n/)) {
    const [objectHash = '', peeledHash = '', label = '', ref = ''] = line.trimEnd().split('\t');
    const hash = peeledHash || objectHash;
    const type = getGraphRefType(ref);
    if (!hash || !label || !type || ref.endsWith('/HEAD')) {
      continue;
    }

    const graphRef: GitGraphRef = { label, ref, type };
    refsByHash.set(hash, [...(refsByHash.get(hash) ?? []), graphRef]);
    if (type !== 'tag') {
      scopes.push(graphRef);
    }
  }

  scopes.sort((left, right) => {
    const typeOrder: Record<GitRefType, number> = { branch: 0, remote: 1, tag: 2 };
    return typeOrder[left.type] - typeOrder[right.type] || left.label.localeCompare(right.label);
  });
  return { refsByHash, scopes };
}

/**
 * 解析单行 graph commit 输出。
 * @param line git log 的单行输出。
 * @returns 原始提交字段。
 */
function parseGraphCommitLine(line: string): RawGraphCommit {
  const [hash = '', parentsText = '', author = '', date = '', ...subjectParts] = line.split(GRAPH_FIELD_SEPARATOR);
  return {
    hash,
    parents: parentsText ? parentsText.split(/\s+/).filter(Boolean) : [],
    author,
    date,
    subject: subjectParts.join(GRAPH_FIELD_SEPARATOR)
  };
}

/**
 * 为 topo-order 提交序列分配 lane，供 Webview 绘制拓扑线。
 * @param rawCommits 原始提交列表。
 * @param refsByHash 按提交哈希分组的 ref 标记。
 * @returns 带 lane 信息的提交列表。
 */
function attachGraphLanes(rawCommits: RawGraphCommit[], refsByHash: Map<string, GitGraphRef[]>): GitGraphCommit[] {
  const activeHashes: string[] = [];
  const commits: GitGraphCommit[] = [];
  let maxLaneCount = 1;

  for (const rawCommit of rawCommits) {
    let lane = activeHashes.indexOf(rawCommit.hash);
    if (lane < 0) {
      lane = activeHashes.length;
      activeHashes.push(rawCommit.hash);
    }

    const activeLanes = activeHashes.map((_, index) => index);
    const parentLanes = rawCommit.parents.map((parentHash, index) => {
      if (index === 0) {
        return lane;
      }
      const existingLane = activeHashes.indexOf(parentHash);
      if (existingLane >= 0) {
        return existingLane;
      }
      activeHashes.push(parentHash);
      return activeHashes.length - 1;
    });
    maxLaneCount = Math.max(maxLaneCount, activeHashes.length, lane + 1, ...parentLanes.map((parentLane) => parentLane + 1));

    const [primaryParent] = rawCommit.parents;
    if (primaryParent) {
      activeHashes[lane] = primaryParent;
    } else {
      activeHashes.splice(lane, 1);
    }

    commits.push({
      hash: rawCommit.hash,
      shortHash: rawCommit.hash.slice(0, 8),
      parents: rawCommit.parents,
      author: rawCommit.author,
      date: rawCommit.date,
      subject: rawCommit.subject,
      isMerge: rawCommit.parents.length > 1,
      refs: refsByHash.get(rawCommit.hash) ?? [],
      lane,
      parentLanes,
      activeLanes,
      laneCount: maxLaneCount
    });
  }

  return commits;
}

/**
 * 根据完整 ref 名称判断 graph ref 类型。
 * @param ref 完整 Git ref 名称。
 * @returns graph ref 类型。
 */
function getGraphRefType(ref: string): GitRefType | undefined {
  if (ref.startsWith('refs/heads/')) {
    return 'branch';
  }
  if (ref.startsWith('refs/remotes/')) {
    return 'remote';
  }
  if (ref.startsWith('refs/tags/')) {
    return 'tag';
  }
  return undefined;
}
