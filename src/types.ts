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
  files: ChangedFile[];
}

/** 文件树中的文件节点。 */
export interface FileTreeFileNode {
  type: 'file';
  name: string;
  path: string;
  change: ChangedFile;
}

/** 文件树中的目录节点。 */
export interface FileTreeFolderNode {
  type: 'folder';
  name: string;
  path: string;
  children: FileTreeNode[];
}

/** 可渲染的文件树节点。 */
export type FileTreeNode = FileTreeFileNode | FileTreeFolderNode;

/** 文件历史查询结果。 */
export interface FileHistoryResult {
  repoRoot: string;
  relativePath: string;
  commits: CommitHistoryItem[];
}
