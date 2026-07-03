import type { GitRef, RefDiffDescriptor } from './types';

/**
 * 创建“所选 ref 文件版本 vs 当前文件”的 diff 输入描述。
 * @param repoRoot Git 仓库根目录。
 * @param relativePath 文件相对仓库根目录的路径。
 * @param currentFilePath 当前工作区文件绝对路径。
 * @param gitRef 用户选择的 Git ref。
 * @returns 可供 VS Code diff 使用的输入描述。
 */
export function createRefDiffDescriptor(
  repoRoot: string,
  relativePath: string,
  currentFilePath: string,
  gitRef: GitRef
): RefDiffDescriptor {
  return {
    left: {
      repoRoot,
      ref: gitRef.ref,
      relativePath,
      label: `${relativePath}@${gitRef.label}`
    },
    rightPath: currentFilePath,
    titleFile: relativePath,
    titleRef: gitRef.label
  };
}
