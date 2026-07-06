/** Git 单个文件在提交中的变更信息。 */
export interface ChangedFile {
  status: string;
  path: string;
  oldPath?: string;
}

/** 文件相关的一条提交历史记录。 */
export interface CommitHistoryItem {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
  message: string;
  isMerge: boolean;
  files: ChangedFile[];
}

/** 文件历史可选的时间范围。 */
export type HistoryTimeRange = '1' | '2' | '3' | '5' | 'all';

/** 文件历史查询与页面筛选选项。 */
export interface FileHistoryOptions {
  includeMerges: boolean;
  timeRange: HistoryTimeRange;
}

/** 文件历史默认选项：最近一年且不包含合并提交。 */
export const DEFAULT_FILE_HISTORY_OPTIONS: FileHistoryOptions = {
  includeMerges: false,
  timeRange: '1'
};

/** 文件历史查询结果。 */
export interface FileHistoryResult {
  repoRoot: string;
  relativePath: string;
  commits: CommitHistoryItem[];
}

/** 文件在 Git 仓库中的定位信息。 */
export interface RepositoryFileInfo {
  repoRoot: string;
  relativePath: string;
}

/** 可用于对比的 Git 引用类型。 */
export type GitRefType = 'branch' | 'remote' | 'tag';

/** 可用于对比的 Git 引用。 */
export interface GitRef {
  label: string;
  ref: string;
  type: GitRefType;
}

/** 临时 Git blob 文档的读取参数。 */
export interface GitBlobEntry {
  repoRoot: string;
  ref: string;
  relativePath: string;
  label: string;
}

/** 与指定 Git ref 对比时所需的 diff 输入描述。 */
export interface RefDiffDescriptor {
  left: GitBlobEntry;
  rightPath: string;
  titleFile: string;
  titleRef: string;
}
