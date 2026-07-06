/** Git 单个文件在提交中的变更信息。 */
export interface ChangedFile {
  status: string;
  path: string;
  oldPath?: string;
}

/** 文件或文件夹相关的一条提交历史记录。 */
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

/** 历史查询目标类型。 */
export type HistoryTargetKind = 'file' | 'folder';

/** 文件或文件夹历史查询结果。 */
export interface FileHistoryResult {
  repoRoot: string;
  relativePath: string;
  targetKind: HistoryTargetKind;
  commits: CommitHistoryItem[];
}

/** 文件在 Git 仓库中的定位信息。 */
export interface RepositoryFileInfo {
  repoRoot: string;
  relativePath: string;
}

/** 文件或文件夹在 Git 仓库中的定位信息。 */
export interface RepositoryPathInfo {
  repoRoot: string;
  relativePath: string;
  targetKind: HistoryTargetKind;
}

/** 可用于对比的 Git 引用类型。 */
export type GitRefType = 'branch' | 'remote' | 'tag';

/** 可用于对比的 Git 引用。 */
export interface GitRef {
  label: string;
  ref: string;
  type: GitRefType;
}

/** Git graph 顶部可选的渲染范围。 */
export type GitGraphScope = GitRef;

/** Git graph 中绑定到提交上的引用标记。 */
export type GitGraphRef = GitRef;

/** Git graph 中的一条提交记录和布局信息。 */
export interface GitGraphCommit {
  hash: string;
  shortHash: string;
  parents: string[];
  author: string;
  date: string;
  subject: string;
  isMerge: boolean;
  refs: GitGraphRef[];
  lane: number;
  parentLanes: number[];
  activeLanes: number[];
  laneCount: number;
}

/** 整个仓库 Git graph Webview 的渲染数据。 */
export interface RepositoryGraphResult {
  repoRoot: string;
  selectedRef?: string;
  scopes: GitGraphScope[];
  commits: GitGraphCommit[];
  hasMore: boolean;
  maxCommits: number;
}

/** 仓库 Git graph 查询选项。 */
export interface RepositoryGraphOptions {
  timeRange: HistoryTimeRange;
  maxCommits: number;
}

/** 仓库 Git graph 默认查询选项：最近一年，最多 1000 条提交。 */
export const DEFAULT_REPOSITORY_GRAPH_OPTIONS: RepositoryGraphOptions = {
  timeRange: '1',
  maxCommits: 1000
};

/** 临时 Git blob 文档的读取参数。 */
export interface GitBlobEntry {
  repoRoot: string;
  ref: string;
  relativePath: string;
  label: string;
}

/** 单个 Git commit 的详情信息。 */
export interface GitCommitDetails {
  repoRoot: string;
  hash: string;
  shortHash: string;
  author: string;
  authorDate: string;
  subject: string;
  message: string;
  githubUrl?: string;
}

/** 指定文件行对应的 Git blame 提交信息。 */
export interface GitLineBlame extends GitCommitDetails {}

/** 与指定 Git ref 对比时所需的 diff 输入描述。 */
export interface RefDiffDescriptor {
  left: GitBlobEntry;
  rightPath: string;
  titleFile: string;
  titleRef: string;
}
