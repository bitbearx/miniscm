const MESSAGES = {
  en: {
    'action.change': 'Change',
    'action.compareLatest': 'Compare with Latest',
    'action.copyHash': 'Click to copy commit hash',
    'action.enterRef': 'Enter ref manually',
    'action.refresh': 'Refresh',
    'aria.loadFiles': 'Load changed files',
    'error.loadRefs': 'Failed to load Git refs.',
    'empty.noCommits': 'No commits found for this path.',
    'empty.noMatches': 'No matching commits.',
    'error.loadCommitFiles': 'Failed to load changed files.',
    'error.loadHistory': 'Failed to load path history.',
    'error.copyHash': 'Failed to copy commit hash.',
    'error.noFile': 'Select a file first.',
    'error.noPath': 'Select a file or folder first.',
    'error.invalidRef': 'Git ref "{0}" does not exist.',
    'error.unsupportedScheme': 'Only local files can be inspected.',
    'label.author': 'Author',
    'label.changedFiles': 'Changed files',
    'label.commit': 'Commit',
    'label.commits': 'Commits',
    'label.date': 'Date',
    'label.file': 'File',
    'label.loading': 'Loading...',
    'label.loadingFiles': 'Loading files...',
    'label.merge': 'Merge',
    'label.includeMerges': 'Include merge commits',
    'label.path': 'Path',
    'label.timeRange': 'Time range',
    'placeholder.enterRef': 'Enter branch, tag, commit hash, or other ref',
    'placeholder.searchCommits': 'Search commits',
    'placeholder.selectRef': 'Select a branch, tag, or ref to compare',
    'panel.title': 'Path History: {0}',
    'refType.branch': 'Branch',
    'refType.remote': 'Remote branch',
    'refType.tag': 'Tag',
    'title.change': '{0} change in {1}',
    'title.compareLatest': '{0} vs latest',
    'title.compareRef': '{0}: {1} vs current',
    'timeRange.1': 'Last 1 year',
    'timeRange.2': 'Last 2 years',
    'timeRange.3': 'Last 3 years',
    'timeRange.5': 'Last 5 years',
    'timeRange.all': 'All time',
    'toast.copied': 'Copied',
    'webview.title': 'Path Commit History'
  },
  zh: {
    'action.change': '变更',
    'action.compareLatest': '与最新版对比',
    'action.copyHash': '点击复制提交哈希',
    'action.enterRef': '手动输入 Ref',
    'action.refresh': '刷新',
    'aria.loadFiles': '加载变更文件',
    'error.loadRefs': '加载 Git Ref 失败。',
    'empty.noCommits': '没有找到该路径的提交历史。',
    'empty.noMatches': '没有匹配的提交。',
    'error.loadCommitFiles': '加载变更文件失败。',
    'error.loadHistory': '加载路径历史失败。',
    'error.copyHash': '复制提交哈希失败。',
    'error.noFile': '请先选择一个文件。',
    'error.noPath': '请先选择一个文件或文件夹。',
    'error.invalidRef': 'Git Ref “{0}” 不存在。',
    'error.unsupportedScheme': '只能查看本地文件。',
    'label.author': '作者',
    'label.changedFiles': '变更文件',
    'label.commit': '提交',
    'label.commits': '提交历史',
    'label.date': '日期',
    'label.file': '文件',
    'label.loading': '加载中...',
    'label.loadingFiles': '正在加载文件...',
    'label.merge': '合并',
    'label.includeMerges': '包含合并提交',
    'label.path': '路径',
    'label.timeRange': '时间范围',
    'placeholder.enterRef': '输入分支、标签、提交哈希或其他 Ref',
    'placeholder.searchCommits': '搜索提交',
    'placeholder.selectRef': '选择要对比的分支、标签或 Ref',
    'panel.title': '路径历史：{0}',
    'refType.branch': '分支',
    'refType.remote': '远程分支',
    'refType.tag': '标签',
    'title.change': '{0} 在 {1} 的变更',
    'title.compareLatest': '{0} 与最新版对比',
    'title.compareRef': '{0}：{1} 与当前文件对比',
    'timeRange.1': '最近 1 年',
    'timeRange.2': '最近 2 年',
    'timeRange.3': '最近 3 年',
    'timeRange.5': '最近 5 年',
    'timeRange.all': '全部',
    'toast.copied': '复制成功',
    'webview.title': '路径提交历史'
  }
} as const;

export type Locale = keyof typeof MESSAGES;

/** 运行时本地化工具。 */
export interface I18n {
  language: Locale;
  t(key: MessageKey, ...args: string[]): string;
}

export type MessageKey = keyof typeof MESSAGES.en;

/**
 * 根据 VS Code 当前语言创建本地化工具。
 * @param language VS Code 当前语言代码。
 * @returns 本地化工具。
 */
export function createI18n(language: string): I18n {
  const normalized = (language || 'en').toLowerCase();
  const locale: Locale = normalized.startsWith('zh') ? 'zh' : 'en';
  const table = MESSAGES[locale];

  return {
    language: locale,
    t(key, ...args) {
      const template = table[key] || MESSAGES.en[key] || key;
      return args.reduce((text, value, index) => text.replaceAll(`{${index}}`, value), template);
    }
  };
}
