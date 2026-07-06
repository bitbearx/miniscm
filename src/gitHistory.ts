import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { getGitSinceValue, normalizeFileHistoryOptions } from './historyOptions';
import type { ChangedFile, CommitHistoryItem, FileHistoryOptions, FileHistoryResult, GitRef, GitRefType, RepositoryFileInfo } from './types';

const COMMIT_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';
const MAX_MERGE_DIFF_CHECK_CONCURRENCY = 4;

/**
 * 解析 git log 输出为提交历史列表。
 * @param output git log 的原始文本输出。
 * @returns 提交历史。
 */
export function parseCommitHistory(output: string): CommitHistoryItem[] {
  return output
    .split(COMMIT_SEPARATOR)
    .map((entry) => entry.replace(/^\r?\n/, '').trimEnd())
    .filter(Boolean)
    .map(parseCommitEntry);
}

/**
 * 解析 git name-status 输出为文件变更列表。
 * @param output git name-status 的原始文本输出。
 * @returns 文件变更列表。
 */
export function parseChangedFiles(output: string): ChangedFile[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      const status = parts[0] ?? '';

      if (status.startsWith('R') || status.startsWith('C')) {
        return {
          status,
          oldPath: parts[1],
          path: parts[2] ?? parts[1] ?? ''
        };
      }

      return {
        status,
        path: parts[1] ?? undefined,
        oldPath: undefined
      };
    })
    .filter((change): change is ChangedFile => Boolean(change.path));
}

/**
 * 解析 git for-each-ref 输出为可选择的 ref 列表。
 * @param output git for-each-ref 的原始文本输出。
 * @returns 可用于对比的 Git 引用列表。
 */
export function parseGitRefs(output: string): GitRef[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const [label = '', fullRef = ''] = line.split('\t');
      const type = getRefType(fullRef);
      return type ? { label, ref: fullRef, type } : undefined;
    })
    .filter((ref): ref is GitRef => ref !== undefined && !ref.ref.endsWith('/HEAD'))
    .sort((left, right) => {
      const typeOrder: Record<GitRefType, number> = { branch: 0, remote: 1, tag: 2 };
      return typeOrder[left.type] - typeOrder[right.type] || left.label.localeCompare(right.label);
    });
}

/**
 * 在指定目录执行 Git 命令并返回标准输出。
 * @param cwd Git 命令的执行目录。
 * @param args Git 参数。
 * @returns 命令输出。
 */
export function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const gitError = error as Error;
        gitError.message = stderr ? `${gitError.message}\n${stderr.trim()}` : gitError.message;
        reject(gitError);
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * 查找文件所在的 Git 仓库根目录。
 * @param filePath 文件绝对路径。
 * @returns Git 仓库根目录。
 */
export async function findRepositoryRoot(filePath: string): Promise<string> {
  const cwd = path.dirname(filePath);
  return (await runGit(cwd, ['rev-parse', '--show-toplevel'])).trim();
}

/**
 * 获取文件相对仓库根目录的 POSIX 风格路径。
 * @param repoRoot Git 仓库根目录。
 * @param filePath 文件绝对路径。
 * @returns Git 可识别的相对路径。
 */
export function toGitRelativePath(repoRoot: string, filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

/**
 * 获取文件所在仓库与相对路径，不读取提交历史。
 * @param filePath 文件绝对路径。
 * @returns 文件在 Git 仓库中的定位信息。
 */
export async function getRepositoryFileInfo(filePath: string): Promise<RepositoryFileInfo> {
  const realFilePath = await fs.realpath(filePath);
  const repoRoot = await findRepositoryRoot(realFilePath);
  return {
    repoRoot,
    relativePath: toGitRelativePath(repoRoot, realFilePath)
  };
}

/**
 * 获取指定文件的提交历史。
 * @param filePath 文件绝对路径。
 * @param options 文件历史查询选项。
 * @returns 文件历史数据。
 */
export async function getFileHistory(filePath: string, options?: Partial<FileHistoryOptions>): Promise<FileHistoryResult> {
  const { repoRoot, relativePath } = await getRepositoryFileInfo(filePath);
  const historyOptions = normalizeFileHistoryOptions(options);

  if (!historyOptions.includeMerges) {
    const output = await runGit(repoRoot, ['log', '--follow', ...createFileHistoryArgs(relativePath, historyOptions, false).slice(1)]);
    return {
      repoRoot,
      relativePath,
      commits: parseCommitHistory(output)
    };
  }

  const commonArgs = createFileHistoryArgs(relativePath, historyOptions, true);
  const [fullHistoryOutput, followHistoryOutput] = await Promise.all([
    runGit(repoRoot, commonArgs),
    runGit(repoRoot, ['log', '--follow', ...commonArgs.slice(1)])
  ]);
  const fullHistory = parseCommitHistory(fullHistoryOutput);
  const followHistory = parseCommitHistory(followHistoryOutput);
  const historicalPaths = getHistoricalFilePaths(relativePath, followHistory);
  const historicalFullHistories = await Promise.all(
    historicalPaths.map(async (historicalPath) => parseCommitHistory(await runGit(repoRoot, createFileHistoryArgs(historicalPath, historyOptions, true))))
  );

  return {
    repoRoot,
    relativePath,
    commits: await filterMergeCommitsByPaths(
      repoRoot,
      [relativePath, ...historicalPaths],
      mergeCommitHistories(fullHistory, ...historicalFullHistories, followHistory)
    )
  };
}

/**
 * 获取某个提交中全部变更的文件。
 * @param repoRoot Git 仓库根目录。
 * @param commitHash 提交哈希。
 * @returns 文件变更列表。
 */
export async function getCommitFiles(repoRoot: string, commitHash: string): Promise<ChangedFile[]> {
  const output = await runGit(repoRoot, [
    'show',
    '--format=',
    '--name-status',
    '--find-renames',
    '--diff-merges=first-parent',
    commitHash
  ]);
  return parseChangedFiles(output);
}

/**
 * 获取仓库中的本地分支、远程分支和标签。
 * @param repoRoot Git 仓库根目录。
 * @returns 可用于对比的 Git 引用列表。
 */
export async function getGitRefs(repoRoot: string): Promise<GitRef[]> {
  const output = await runGit(repoRoot, [
    'for-each-ref',
    '--sort=refname',
    '--format=%(refname:short)%09%(refname)',
    'refs/heads',
    'refs/remotes',
    'refs/tags'
  ]);
  return parseGitRefs(output);
}

/**
 * 判断 Git ref 是否能解析为可读取文件树的对象。
 * @param repoRoot Git 仓库根目录。
 * @param ref Git ref、分支名、标签名或提交表达式。
 * @returns ref 是否有效。
 */
export async function gitRefExists(repoRoot: string, ref: string): Promise<boolean> {
  try {
    await runGit(repoRoot, ['rev-parse', '--verify', `${ref}^{tree}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * 根据完整 ref 名称判断引用类型。
 * @param fullRef 完整 Git ref 名称。
 * @returns 引用类型。
 */
function getRefType(fullRef: string): GitRefType | undefined {
  if (fullRef.startsWith('refs/heads/')) {
    return 'branch';
  }
  if (fullRef.startsWith('refs/remotes/')) {
    return 'remote';
  }
  if (fullRef.startsWith('refs/tags/')) {
    return 'tag';
  }
  return undefined;
}

/**
 * 合并多条 Git 历史查询结果，并保留 Git 输出顺序。
 * @param histories 多条提交历史列表。
 * @returns 去重后的提交历史列表。
 */
function mergeCommitHistories(...histories: CommitHistoryItem[][]): CommitHistoryItem[] {
  const commitsByHash = new Map<string, CommitHistoryItem>();
  for (const history of histories) {
    for (const commit of history) {
      if (!commitsByHash.has(commit.hash)) {
        commitsByHash.set(commit.hash, commit);
      }
    }
  }
  return [...commitsByHash.values()];
}

/**
 * 创建查询单个文件历史的 Git 参数。
 * @param relativePath 文件相对仓库根目录的路径。
 * @param options 文件历史查询选项。
 * @param includeFullHistory 是否使用 full-history 查询。
 * @returns Git log 参数列表。
 */
function createFileHistoryArgs(relativePath: string, options: FileHistoryOptions, includeFullHistory: boolean): string[] {
  const args = [
    'log',
    '--date=iso',
    `--format=${COMMIT_SEPARATOR}%H${FIELD_SEPARATOR}%P${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ad${FIELD_SEPARATOR}%B${FIELD_SEPARATOR}`,
    '--name-status',
    '--find-renames'
  ];
  if (includeFullHistory) {
    args.splice(1, 0, '--full-history');
  }
  if (!options.includeMerges) {
    args.push('--no-merges');
  }
  const since = getGitSinceValue(options.timeRange);
  if (since) {
    args.push(`--since=${since}`);
  }
  args.push('--', relativePath);
  return args;
}

/**
 * 从 follow 历史中收集当前文件曾经使用过的旧路径。
 * @param relativePath 当前文件相对仓库根目录的路径。
 * @param commits follow 查询得到的提交历史。
 * @returns 去重后的历史路径列表。
 */
function getHistoricalFilePaths(relativePath: string, commits: CommitHistoryItem[]): string[] {
  const paths = new Set<string>();
  for (const commit of commits) {
    for (const file of commit.files) {
      if (file.status.startsWith('R') && file.oldPath && file.oldPath !== relativePath) {
        paths.add(file.oldPath);
      }
    }
  }
  return [...paths];
}

/**
 * 过滤掉 full-history 中没有实际改动当前文件任一路径的 merge commit。
 * @param repoRoot Git 仓库根目录。
 * @param relativePaths 文件当前路径及历史路径。
 * @param commits 候选提交列表。
 * @returns 过滤后的提交列表。
 */
async function filterMergeCommitsByPaths(
  repoRoot: string,
  relativePaths: string[],
  commits: CommitHistoryItem[]
): Promise<CommitHistoryItem[]> {
  const checks = await mapWithConcurrencyLimit(
    commits,
    MAX_MERGE_DIFF_CHECK_CONCURRENCY,
    async (commit) => ({
      commit,
      keep: !commit.isMerge || commit.files.length > 0 || (await mergeCommitTouchesAnyPath(repoRoot, relativePaths, commit.hash))
    })
  );
  return checks.filter((check) => check.keep).map((check) => check.commit);
}

/**
 * 判断 merge commit 相对第一父提交是否实际改动了任一历史路径。
 * @param repoRoot Git 仓库根目录。
 * @param relativePaths 文件当前路径及历史路径。
 * @param commitHash merge commit 哈希。
 * @returns 是否改动任一路径。
 */
async function mergeCommitTouchesAnyPath(repoRoot: string, relativePaths: string[], commitHash: string): Promise<boolean> {
  for (const relativePath of relativePaths) {
    if (await mergeCommitTouchesPath(repoRoot, relativePath, commitHash)) {
      return true;
    }
  }
  return false;
}

/**
 * 按固定并发数执行异步映射，避免大历史查询时同时启动过多 Git 子进程。
 * @param items 输入列表。
 * @param limit 最大并发数。
 * @param mapper 单项映射函数。
 * @returns 与输入顺序一致的映射结果。
 */
async function mapWithConcurrencyLimit<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * 判断 merge commit 相对第一父提交是否实际改动了指定文件。
 * @param repoRoot Git 仓库根目录。
 * @param relativePath 文件相对仓库根目录的路径。
 * @param commitHash merge commit 哈希。
 * @returns 是否改动指定文件。
 */
async function mergeCommitTouchesPath(repoRoot: string, relativePath: string, commitHash: string): Promise<boolean> {
  const output = await runGit(repoRoot, [
    'diff-tree',
    '--no-commit-id',
    '--name-status',
    '-r',
    '--diff-merges=first-parent',
    commitHash,
    '--',
    relativePath
  ]);
  return parseChangedFiles(output).length > 0;
}

/**
 * 解析单个提交记录，兼容旧的单行 subject 格式和新的完整 message 格式。
 * @param entry 单个提交记录文本。
 * @returns 提交历史记录。
 */
function parseCommitEntry(entry: string): CommitHistoryItem {
  const [header, ...fileLines] = entry.split(/\r?\n/);
  const [hash = '', author = '', date = '', subject = ''] = header.split(FIELD_SEPARATOR);
  const newFormatCommit = parseNewFormatCommitEntry(entry);
  if (newFormatCommit) {
    return newFormatCommit;
  }

  const fullMessageStart = nthIndexOf(entry, FIELD_SEPARATOR, 3);

  if (fullMessageStart < 0) {
    return createCommitHistoryItem(hash, author, date, subject, subject, false, fileLines.join('\n'));
  }

  const messageAndFiles = entry.slice(fullMessageStart + FIELD_SEPARATOR.length);
  const messageEnd = messageAndFiles.indexOf(FIELD_SEPARATOR);
  if (messageEnd < 0) {
    return createCommitHistoryItem(hash, author, date, subject, subject, false, fileLines.join('\n'));
  }

  const message = messageAndFiles.slice(0, messageEnd).trimEnd();
  const files = messageAndFiles.slice(messageEnd + FIELD_SEPARATOR.length).replace(/^\r?\n/, '');
  const firstLine = message.split(/\r?\n/)[0] || subject;
  return createCommitHistoryItem(hash, author, date, firstLine, message || firstLine, false, files);
}

/**
 * 解析包含父提交列表的新格式提交记录。
 * @param entry 单个提交记录文本。
 * @returns 提交历史记录；不是新格式时返回 undefined。
 */
function parseNewFormatCommitEntry(entry: string): CommitHistoryItem | undefined {
  const separatorPositions = getSeparatorPositions(entry, 5);
  if (separatorPositions.length < 5) {
    return undefined;
  }

  const [hashEnd, parentsEnd, authorEnd, dateEnd, messageEnd] = separatorPositions;
  const hash = entry.slice(0, hashEnd);
  const parents = entry.slice(hashEnd + 1, parentsEnd).trim();
  if (!looksLikeParentList(parents)) {
    return undefined;
  }

  const author = entry.slice(parentsEnd + 1, authorEnd);
  const date = entry.slice(authorEnd + 1, dateEnd);
  const message = entry.slice(dateEnd + 1, messageEnd).trimEnd();
  const files = entry.slice(messageEnd + 1).replace(/^\r?\n/, '');
  const firstLine = message.split(/\r?\n/)[0] || '';
  return createCommitHistoryItem(hash, author, date, firstLine, message || firstLine, parents.split(/\s+/).length > 1, files);
}

/**
 * 创建统一的提交历史对象。
 * @param hash 提交哈希。
 * @param author 提交人。
 * @param date 提交日期。
 * @param subject 提交标题。
 * @param message 完整提交描述。
 * @param filesOutput 文件变更输出。
 * @returns 提交历史对象。
 */
function createCommitHistoryItem(
  hash: string,
  author: string,
  date: string,
  subject: string,
  message: string,
  isMerge: boolean,
  filesOutput: string
): CommitHistoryItem {
  return {
    hash,
    shortHash: hash.slice(0, 8),
    author,
    date,
    subject,
    message,
    isMerge,
    files: parseChangedFiles(filesOutput)
  };
}

/**
 * 判断文本是否像 Git 父提交列表。
 * @param value 待判断文本。
 * @returns 是否为父提交列表。
 */
function looksLikeParentList(value: string): boolean {
  return value === '' || /^[0-9a-fA-F]{4,}(?:\s+[0-9a-fA-F]{4,})*$/.test(value);
}

/**
 * 获取前几个字段分隔符的位置。
 * @param value 原始字符串。
 * @param count 需要的位置数量。
 * @returns 分隔符位置列表。
 */
function getSeparatorPositions(value: string, count: number): number[] {
  const positions: number[] = [];
  let position = -1;
  for (let index = 0; index < count; index += 1) {
    position = value.indexOf(FIELD_SEPARATOR, position + 1);
    if (position < 0) {
      break;
    }
    positions.push(position);
  }
  return positions;
}

/**
 * 查找字符串中第 n 次出现的子串位置。
 * @param value 原始字符串。
 * @param search 子串。
 * @param occurrence 第几次出现，从 1 开始。
 * @returns 子串位置，未找到时为 -1。
 */
function nthIndexOf(value: string, search: string, occurrence: number): number {
  let position = -1;
  for (let index = 0; index < occurrence; index += 1) {
    position = value.indexOf(search, position + 1);
    if (position < 0) {
      return -1;
    }
  }
  return position;
}
