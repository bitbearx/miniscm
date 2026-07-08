import type { GitBlobEntry } from './types';

export const BLOB_SCHEME = 'miniscm-git';
export const EMPTY_REF = '__MINISCM_EMPTY__';

/**
 * 创建可恢复的 Git blob 虚拟文档 URI 字符串。
 * @param entry Git blob 的读取参数。
 * @returns 可传给 VS Code URI 解析器的 URI 字符串。
 */
export function createGitBlobUriString(entry: GitBlobEntry): string {
  const params = new URLSearchParams({
    repoRoot: entry.repoRoot,
    ref: entry.ref,
    relativePath: entry.relativePath,
    label: entry.label
  });
  const displayPath = `${encodePathSegment(entry.label)}/${encodePath(entry.relativePath)}`;
  return `${BLOB_SCHEME}:/${displayPath}?${params.toString()}`;
}

/**
 * 从 Git blob 虚拟文档 URI 的 query 中解析读取参数。
 * @param query URI query 字符串。
 * @returns Git blob 的读取参数；旧版 id-only query 无法恢复时返回 undefined。
 */
export function parseGitBlobUriEntry(query: string): GitBlobEntry | undefined {
  const params = new URLSearchParams(query);
  const repoRoot = params.get('repoRoot');
  const ref = params.get('ref');
  const relativePath = params.get('relativePath');
  const label = params.get('label');

  if (!repoRoot || !ref || !relativePath || !label) {
    return undefined;
  }

  return {
    repoRoot,
    ref,
    relativePath,
    label
  };
}

/**
 * 编码 URI path 中的完整相对路径，并保留目录分隔符。
 * @param value 待编码路径。
 * @returns 可放入 URI path 的路径片段。
 */
function encodePath(value: string): string {
  return value.split('/').map(encodePathSegment).join('/');
}

/**
 * 编码单个 URI path 片段。
 * @param value 待编码片段。
 * @returns 编码后的片段。
 */
function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}
