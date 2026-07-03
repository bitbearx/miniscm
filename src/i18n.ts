const MESSAGES = {
  en: {
    'action.change': 'Change',
    'action.compareLatest': 'Compare with Latest',
    'action.enterRef': 'Enter ref manually',
    'action.refresh': 'Refresh',
    'aria.loadFiles': 'Load changed files',
    'error.loadRefs': 'Failed to load Git refs.',
    'empty.noCommits': 'No commits found for this file.',
    'error.loadCommitFiles': 'Failed to load changed files.',
    'error.loadHistory': 'Failed to load file history.',
    'error.noFile': 'Select a file first.',
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
    'label.path': 'Path',
    'placeholder.enterRef': 'Enter branch, tag, commit hash, or other ref',
    'placeholder.selectRef': 'Select a branch, tag, or ref to compare',
    'panel.title': 'File History: {0}',
    'refType.branch': 'Branch',
    'refType.remote': 'Remote branch',
    'refType.tag': 'Tag',
    'title.change': '{0} change in {1}',
    'title.compareLatest': '{0} vs latest',
    'title.compareRef': '{0}: {1} vs current',
    'webview.title': 'File Commit History'
  },
  zh: {
    'action.change': '变更',
    'action.compareLatest': '与最新版对比',
    'action.enterRef': '手动输入 Ref',
    'action.refresh': '刷新',
    'aria.loadFiles': '加载变更文件',
    'error.loadRefs': '加载 Git Ref 失败。',
    'empty.noCommits': '没有找到该文件的提交历史。',
    'error.loadCommitFiles': '加载变更文件失败。',
    'error.loadHistory': '加载文件历史失败。',
    'error.noFile': '请先选择一个文件。',
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
    'label.path': '路径',
    'placeholder.enterRef': '输入分支、标签、提交哈希或其他 Ref',
    'placeholder.selectRef': '选择要对比的分支、标签或 Ref',
    'panel.title': '文件历史：{0}',
    'refType.branch': '分支',
    'refType.remote': '远程分支',
    'refType.tag': '标签',
    'title.change': '{0} 在 {1} 的变更',
    'title.compareLatest': '{0} 与最新版对比',
    'title.compareRef': '{0}：{1} 与当前文件对比',
    'webview.title': '文件提交历史'
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
