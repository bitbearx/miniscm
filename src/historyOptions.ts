import { DEFAULT_FILE_HISTORY_OPTIONS, type FileHistoryOptions, type HistoryTimeRange } from './types';

const TIME_RANGES: HistoryTimeRange[] = ['1', '2', '3', '5', 'all'];

/**
 * 规范化来自 Webview 或调用方的文件历史选项。
 * @param options 待规范化的选项。
 * @returns 可安全使用的文件历史选项。
 */
export function normalizeFileHistoryOptions(options?: Partial<FileHistoryOptions>): FileHistoryOptions {
  const timeRange = TIME_RANGES.includes(options?.timeRange as HistoryTimeRange)
    ? (options?.timeRange as HistoryTimeRange)
    : DEFAULT_FILE_HISTORY_OPTIONS.timeRange;

  return {
    includeMerges: options?.includeMerges === true,
    timeRange
  };
}

/**
 * 将时间范围转换成 Git 可识别的 --since 参数。
 * @param timeRange 文件历史时间范围。
 * @returns Git since 文本；全部历史返回 undefined。
 */
export function getGitSinceValue(timeRange: HistoryTimeRange): string | undefined {
  return timeRange === 'all' ? undefined : `${timeRange} year ago`;
}
