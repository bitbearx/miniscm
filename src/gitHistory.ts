import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { ChangedFile, CommitHistoryItem, FileHistoryResult } from './types';

const COMMIT_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';

/**
 * 解析 git log 输出为提交历史列表。
 * @param output git log 的原始文本输出。
 * @returns 提交历史。
 */
export function parseCommitHistory(output: string): CommitHistoryItem[] {
  return output
    .split(COMMIT_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [header, ...fileLines] = entry.split(/\r?\n/);
      const [hash = '', author = '', date = '', subject = ''] = header.split(FIELD_SEPARATOR);
      return {
        hash,
        shortHash: hash.slice(0, 8),
        author,
        date,
        subject,
        files: parseChangedFiles(fileLines.join('\n'))
      };
    });
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
 * 获取指定文件的提交历史。
 * @param filePath 文件绝对路径。
 * @returns 文件历史数据。
 */
export async function getFileHistory(filePath: string): Promise<FileHistoryResult> {
  const realFilePath = await fs.realpath(filePath);
  const repoRoot = await findRepositoryRoot(realFilePath);
  const relativePath = toGitRelativePath(repoRoot, realFilePath);
  const output = await runGit(repoRoot, [
    'log',
    '--follow',
    '--date=iso',
    `--format=${COMMIT_SEPARATOR}%H${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ad${FIELD_SEPARATOR}%s`,
    '--name-status',
    '--find-renames',
    '--',
    relativePath
  ]);

  return {
    repoRoot,
    relativePath,
    commits: parseCommitHistory(output)
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
    commitHash
  ]);
  return parseChangedFiles(output);
}
