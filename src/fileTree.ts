import type { ChangedFile, FileTreeNode } from './types';

interface MutableFileNode {
  type: 'file';
  name: string;
  path: string;
  change: ChangedFile;
}

interface MutableFolderNode {
  type: 'folder';
  name: string;
  path: string;
  children: Map<string, MutableTreeNode>;
}

type MutableTreeNode = MutableFolderNode | MutableFileNode;

/**
 * 将提交中的文件变更列表转换为稳定排序的目录树。
 * @param files Git 文件变更列表。
 * @returns 可直接渲染的文件树节点。
 */
export function buildFileTree(files: ChangedFile[]): FileTreeNode[] {
  const root = new Map<string, MutableTreeNode>();

  for (const change of files) {
    const segments = change.path.split('/').filter(Boolean);
    let children = root;
    let currentPath = '';

    segments.forEach((segment, index) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isFile = index === segments.length - 1;

      if (isFile) {
        children.set(segment, {
          type: 'file',
          name: segment,
          path: change.path,
          change
        });
        return;
      }

      const existing = children.get(segment);
      if (!existing || existing.type !== 'folder') {
        children.set(segment, {
          type: 'folder',
          name: segment,
          path: currentPath,
          children: new Map<string, MutableTreeNode>()
        });
      }

      const folder = children.get(segment);
      if (folder?.type === 'folder') {
        children = folder.children;
      }
    });
  }

  return sortTree(root);
}

/**
 * 对目录树节点进行字母序排序，并把内部 Map 转成数组。
 * @param nodeMap 待排序的节点集合。
 * @returns 排序后的节点数组。
 */
function sortTree(nodeMap: Map<string, MutableTreeNode>): FileTreeNode[] {
  return [...nodeMap.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((node) => {
      if (node.type === 'folder') {
        return {
          type: 'folder',
          name: node.name,
          path: node.path,
          children: sortTree(node.children)
        };
      }
      return node;
    });
}
