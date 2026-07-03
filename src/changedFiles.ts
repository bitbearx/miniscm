import type { ChangedFile } from './types';

/**
 * 按目录路径和文件名排序变更文件，确保同一目录下的文件连续展示。
 * @param files Git 文件变更列表。
 * @returns 排序后的文件变更列表。
 */
export function sortChangedFilesByDirectory(files: ChangedFile[]): ChangedFile[] {
  return [...files].sort((left, right) => {
    const directoryCompare = getDirectoryPath(left.path).localeCompare(getDirectoryPath(right.path));
    if (directoryCompare !== 0) {
      return directoryCompare;
    }

    const fileNameCompare = getFileName(left.path).localeCompare(getFileName(right.path));
    if (fileNameCompare !== 0) {
      return fileNameCompare;
    }

    return left.path.localeCompare(right.path);
  });
}

/**
 * 获取文件路径中的目录部分。
 * @param filePath Git 仓库内的文件路径。
 * @returns 目录路径；仓库根目录文件返回空字符串。
 */
function getDirectoryPath(filePath: string): string {
  const separatorIndex = filePath.lastIndexOf('/');
  return separatorIndex < 0 ? '' : filePath.slice(0, separatorIndex);
}

/**
 * 获取文件路径中的文件名部分。
 * @param filePath Git 仓库内的文件路径。
 * @returns 文件名。
 */
function getFileName(filePath: string): string {
  const separatorIndex = filePath.lastIndexOf('/');
  return separatorIndex < 0 ? filePath : filePath.slice(separatorIndex + 1);
}
