import * as vscode from 'vscode';

import { getLineBlame } from './gitHistory';
import type { I18n } from './i18n';
import type { GitLineBlame } from './types';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const BLAME_UPDATE_DELAY_MS = 200;
const OPEN_COMMIT_DETAILS_COMMAND = 'miniscm.openCommitDetails';

/**
 * 管理当前行 Git blame 状态栏展示与详情 tooltip。
 */
export class LineBlameStatusManager implements vscode.HoverProvider {
  private readonly statusItem: vscode.StatusBarItem;
  private latestRequestId = 0;
  private pendingUpdate: NodeJS.Timeout | undefined;
  private lastBlameKey: string | undefined;
  private lastBlame: GitLineBlame | undefined;

  constructor(private readonly i18n: I18n) {
    this.statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusItem.name = this.i18n.t('status.blame.name');
  }

  /**
   * 注册状态栏、编辑器事件和 hover provider。
   * @param context VS Code 扩展上下文。
   */
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      this.statusItem,
      vscode.window.onDidChangeActiveTextEditor(() => {
        void this.updateFromActiveEditor();
      }),
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (event.textEditor === vscode.window.activeTextEditor) {
          this.scheduleUpdateForDocumentPosition(event.textEditor.document, event.selections[0]?.active);
        }
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        this.resetCachedBlame();
        if (document === vscode.window.activeTextEditor?.document) {
          void this.updateFromActiveEditor();
        }
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document === vscode.window.activeTextEditor?.document) {
          this.clearCurrentBlame();
        }
      }),
      vscode.languages.registerHoverProvider({ scheme: 'file' }, this)
    );

    void this.updateFromActiveEditor();
  }

  /**
   * 响应编辑器中的鼠标 hover，并更新状态栏 blame 信息。
   * @param document 当前 hover 的文档。
   * @param position 当前 hover 的位置。
   * @returns 不创建编辑器内 hover，只更新底部状态栏。
   */
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    this.scheduleUpdateForDocumentPosition(document, position);
    return undefined;
  }

  /**
   * 根据当前活动编辑器更新状态栏。
   */
  private async updateFromActiveEditor(): Promise<void> {
    this.clearPendingUpdate();
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.clearCurrentBlame();
      return;
    }

    await this.updateForDocumentPosition(editor.document, editor.selection.active);
  }

  /**
   * 根据指定文档位置读取并展示 blame 信息。
   * @param document 文档。
   * @param position 文档位置。
   */
  private async updateForDocumentPosition(document: vscode.TextDocument, position?: vscode.Position): Promise<void> {
    if (!position || document.uri.scheme !== 'file' || document.isDirty) {
      this.clearCurrentBlame();
      return;
    }

    const lineNumber = position.line + 1;
    const blameKey = createBlameKey(document.uri.fsPath, lineNumber);
    if (blameKey === this.lastBlameKey && this.lastBlame) {
      this.renderBlame(this.lastBlame);
      return;
    }

    const requestId = (this.latestRequestId += 1);
    try {
      const blame = await getLineBlame(document.uri.fsPath, lineNumber);
      if (requestId !== this.latestRequestId) {
        return;
      }
      this.lastBlameKey = blameKey;
      this.lastBlame = blame;
      this.renderBlame(blame);
    } catch {
      if (requestId === this.latestRequestId) {
        this.resetCachedBlame();
        this.statusItem.command = undefined;
        this.statusItem.hide();
      }
    }
  }

  /**
   * 延迟更新指定文档位置，避免连续移动光标时启动过多 Git 进程。
   * @param document 文档。
   * @param position 文档位置。
   */
  private scheduleUpdateForDocumentPosition(document: vscode.TextDocument, position?: vscode.Position): void {
    this.clearPendingUpdate();
    this.pendingUpdate = setTimeout(() => {
      this.pendingUpdate = undefined;
      void this.updateForDocumentPosition(document, position);
    }, BLAME_UPDATE_DELAY_MS);
  }

  /**
   * 清理尚未执行的延迟更新。
   */
  private clearPendingUpdate(): void {
    if (this.pendingUpdate) {
      clearTimeout(this.pendingUpdate);
      this.pendingUpdate = undefined;
    }
  }

  /**
   * 清空当前状态栏 blame 展示，并让未完成请求失效。
   */
  private clearCurrentBlame(): void {
    this.clearPendingUpdate();
    this.resetCachedBlame();
    this.latestRequestId += 1;
    this.statusItem.command = undefined;
    this.statusItem.hide();
  }

  /**
   * 清理最近一次 blame 缓存。
   */
  private resetCachedBlame(): void {
    this.lastBlameKey = undefined;
    this.lastBlame = undefined;
  }

  /**
   * 将 blame 信息渲染到底部状态栏。
   * @param blame 当前行 blame 信息。
   */
  private renderBlame(blame: GitLineBlame): void {
    const author = blame.author || this.i18n.t('label.unknownAuthor');
    this.statusItem.text = this.i18n.t('status.blame.text', author, formatRelativeDays(blame.authorDate, this.i18n));
    this.statusItem.tooltip = createBlameTooltip(blame, this.i18n);
    this.statusItem.command = isOpenableCommitHash(blame.hash)
      ? {
          command: OPEN_COMMIT_DETAILS_COMMAND,
          title: this.i18n.t('action.openCommitDetails'),
          arguments: [createOpenCommitDetailsCommandArgs(blame)]
        }
      : undefined;
    this.statusItem.show();
  }
}

/**
 * 创建状态栏 hover 时展示的 commit 详情卡片。
 * @param blame 当前行 blame 信息。
 * @param i18n 运行时本地化工具。
 * @returns Markdown tooltip。
 */
function createBlameTooltip(blame: GitLineBlame, i18n: I18n): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString('', true);
  if (isOpenableCommitHash(blame.hash)) {
    tooltip.isTrusted = { enabledCommands: [OPEN_COMMIT_DETAILS_COMMAND] };
  }

  tooltip.appendMarkdown('**');
  tooltip.appendText(i18n.t('tooltip.blame.title'));
  tooltip.appendMarkdown('**\n\n');
  tooltip.appendMarkdown(`${i18n.t('label.author')}: `);
  tooltip.appendText(blame.author || i18n.t('label.unknownAuthor'));
  tooltip.appendMarkdown('  \n');
  tooltip.appendMarkdown(`${i18n.t('label.date')}: `);
  tooltip.appendText(formatBlameDate(blame.authorDate, i18n));
  tooltip.appendMarkdown('\n\n');
  tooltip.appendText(blame.message || blame.subject);
  tooltip.appendMarkdown('\n\n');
  tooltip.appendMarkdown(`${i18n.t('label.commit')}: `);
  if (isOpenableCommitHash(blame.hash)) {
    tooltip.appendMarkdown(`[${blame.shortHash}](${createOpenCommitDetailsCommandUri(blame)})`);
  } else {
    tooltip.appendMarkdown(`\`${blame.shortHash}\``);
  }

  if (blame.githubUrl) {
    tooltip.appendMarkdown(` - [${i18n.t('action.openInGitHub')}](${blame.githubUrl})`);
  }

  return tooltip;
}

/**
 * 创建打开 commit 详情面板的 command URI。
 * @param blame 当前行 blame 信息。
 * @returns VS Code command URI。
 */
function createOpenCommitDetailsCommandUri(blame: GitLineBlame): string {
  const args = encodeURIComponent(JSON.stringify([createOpenCommitDetailsCommandArgs(blame)]));
  return `command:${OPEN_COMMIT_DETAILS_COMMAND}?${args}`;
}

/**
 * 创建打开 commit 详情命令所需的参数。
 * @param blame 当前行 blame 信息。
 * @returns commit 详情命令参数。
 */
function createOpenCommitDetailsCommandArgs(blame: GitLineBlame): { repoRoot: string; commitHash: string } {
  return { repoRoot: blame.repoRoot, commitHash: blame.hash };
}

/**
 * 判断 commit hash 是否可打开详情。
 * @param hash commit hash。
 * @returns 是否可打开详情。
 */
function isOpenableCommitHash(hash: string): boolean {
  return Boolean(hash) && !/^0+$/.test(hash);
}

/**
 * 创建最近一次 blame 结果缓存 key。
 * @param filePath 文件绝对路径。
 * @param lineNumber 1-based 行号。
 * @returns 缓存 key。
 */
function createBlameKey(filePath: string, lineNumber: number): string {
  return `${filePath}:${lineNumber}`;
}

/**
 * 将提交时间格式化为 N days ago 风格。
 * @param isoDate ISO 日期文本。
 * @param i18n 运行时本地化工具。
 * @returns 相对天数文案。
 */
function formatRelativeDays(isoDate: string, i18n: I18n): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return i18n.t('time.daysAgo', '0');
  }

  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / MILLISECONDS_PER_DAY));
  return days === 1 ? i18n.t('time.dayAgo') : i18n.t('time.daysAgo', String(days));
}

/**
 * 将提交时间格式化为 tooltip 中的本地日期。
 * @param isoDate ISO 日期文本。
 * @param i18n 运行时本地化工具。
 * @returns 本地日期文案。
 */
function formatBlameDate(isoDate: string, i18n: I18n): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return new Intl.DateTimeFormat(i18n.language === 'zh' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}
