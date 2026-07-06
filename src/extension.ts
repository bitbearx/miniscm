import path from 'node:path';

import * as vscode from 'vscode';

import { sortChangedFilesByDirectory } from './changedFiles';
import {
  getCommitFiles,
  getGitRefs,
  getPathHistory,
  getRepositoryFileInfo,
  gitRefExists,
  runGit
} from './gitHistory';
import { normalizeFileHistoryOptions } from './historyOptions';
import { createI18n, type I18n } from './i18n';
import { createHistoryPanelOptions } from './panelOptions';
import { createRefDiffDescriptor } from './refDiff';
import { DEFAULT_FILE_HISTORY_OPTIONS, type ChangedFile, type FileHistoryOptions, type FileHistoryResult, type GitBlobEntry, type GitRef, type GitRefType } from './types';
import { createHistoryHtml, type HistoryWebviewState } from './webview';

const BLOB_SCHEME = 'miniscm-git';
const EMPTY_REF = '__MINISCM_EMPTY__';

/** QuickPick 中的 Git ref 选项。 */
interface RefQuickPickItem extends vscode.QuickPickItem {
  gitRef?: GitRef;
  manual?: boolean;
}

/** Webview 发来的消息。 */
type WebviewMessage =
  | { type: 'refresh' }
  | { type: 'reloadHistory'; options?: Partial<FileHistoryOptions>; requestId?: number }
  | { type: 'loadCommitFiles'; commitHash: string }
  | { type: 'copyCommitHash'; commitHash: string }
  | { type: 'showChange'; commitHash: string; file: ChangedFile }
  | { type: 'compareLatest'; commitHash: string; file: ChangedFile };

/** 单个文件历史面板的可变状态。 */
interface OpenHistoryPanelState {
  history: FileHistoryResult;
  options: FileHistoryOptions;
  latestHistoryRequestId: number;
  render(history: FileHistoryResult, options: FileHistoryOptions): void;
}

/**
 * 为 VS Code diff 命令提供指定提交中的文件内容。
 */
class GitBlobContentProvider implements vscode.TextDocumentContentProvider {
  private readonly entries = new Map<string, GitBlobEntry>();
  private sequence = 0;

  /**
   * 创建一个可被 VS Code 打开的虚拟文档 URI。
   * @param entry Git blob 的读取参数。
   * @returns 虚拟文档 URI。
   */
  createUri(entry: GitBlobEntry): vscode.Uri {
    const id = String((this.sequence += 1));
    this.entries.set(id, entry);
    const safeLabel = encodeURIComponent(entry.label.replaceAll('/', '-'));
    return vscode.Uri.parse(`${BLOB_SCHEME}:/${safeLabel}?id=${encodeURIComponent(id)}`);
  }

  /**
   * 按 URI 中的 id 返回对应 Git blob 内容。
   * @param uri 虚拟文档 URI。
   * @returns 文档内容。
   */
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const params = new URLSearchParams(uri.query);
    const id = params.get('id');
    const entry = id ? this.entries.get(id) : undefined;

    if (!entry || entry.ref === EMPTY_REF) {
      return '';
    }

    try {
      return await runGit(entry.repoRoot, ['show', `${entry.ref}:${entry.relativePath}`]);
    } catch {
      return '';
    }
  }
}

/**
 * 管理文件历史 Webview 与相关 diff 命令。
 */
class HistoryPanelManager {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly i18n: I18n,
    private readonly blobProvider: GitBlobContentProvider
  ) {}

  /**
   * 展示指定文件的提交历史。
   * @param resource 从资源管理器或编辑器菜单传入的文件 URI。
   */
  async show(resource?: vscode.Uri): Promise<void> {
    const target = this.resolveResource(resource);
    if (!target) {
      vscode.window.showWarningMessage(this.i18n.t('error.noPath'));
      return;
    }

    if (target.scheme !== 'file') {
      vscode.window.showWarningMessage(this.i18n.t('error.unsupportedScheme'));
      return;
    }

    try {
      const history = await getPathHistory(target.fsPath, DEFAULT_FILE_HISTORY_OPTIONS);
      this.openPanel(target, history, DEFAULT_FILE_HISTORY_OPTIONS);
    } catch (error) {
      vscode.window.showErrorMessage(`${this.i18n.t('error.loadHistory')} ${formatError(error)}`);
    }
  }

  /**
   * 选择一个 Git ref，并将该 ref 下的文件与当前文件对比。
   * @param resource 从资源管理器或编辑器菜单传入的文件 URI。
   */
  async compareFileWithRef(resource?: vscode.Uri): Promise<void> {
    const target = this.resolveResource(resource);
    if (!target) {
      vscode.window.showWarningMessage(this.i18n.t('error.noFile'));
      return;
    }

    if (target.scheme !== 'file') {
      vscode.window.showWarningMessage(this.i18n.t('error.unsupportedScheme'));
      return;
    }

    try {
      if (await this.isFolder(target)) {
        vscode.window.showWarningMessage(this.i18n.t('error.noFile'));
        return;
      }

      const fileInfo = await getRepositoryFileInfo(target.fsPath);
      const selectedRef = await this.pickGitRef(fileInfo.repoRoot);
      if (!selectedRef) {
        return;
      }
      if (!(await gitRefExists(fileInfo.repoRoot, selectedRef.ref))) {
        vscode.window.showWarningMessage(this.i18n.t('error.invalidRef', selectedRef.label));
        return;
      }
      await this.openRefDiff(fileInfo.repoRoot, fileInfo.relativePath, target, selectedRef);
    } catch (error) {
      vscode.window.showErrorMessage(`${this.i18n.t('error.loadRefs')} ${formatError(error)}`);
    }
  }

  /**
   * 根据命令参数或当前编辑器推导目标文件。
   * @param resource 命令参数中的 URI。
   * @returns 目标文件 URI。
   */
  private resolveResource(resource?: vscode.Uri): vscode.Uri | undefined {
    if (resource) {
      return resource;
    }
    return vscode.window.activeTextEditor?.document.uri;
  }

  /**
   * 判断本地 URI 是否指向文件夹。
   * @param resource 本地文件 URI。
   * @returns 是否为文件夹。
   */
  private async isFolder(resource: vscode.Uri): Promise<boolean> {
    const stat = await vscode.workspace.fs.stat(resource);
    return Boolean(stat.type & vscode.FileType.Directory);
  }

  /**
   * 让用户从仓库 refs 或手动输入中选择要对比的 ref。
   * @param repoRoot Git 仓库根目录。
   * @returns 用户选择的 ref。
   */
  private async pickGitRef(repoRoot: string): Promise<GitRef | undefined> {
    const refs = await getGitRefs(repoRoot);
    const manualItem: RefQuickPickItem = {
      label: this.i18n.t('action.enterRef'),
      description: this.i18n.t('placeholder.enterRef'),
      alwaysShow: true,
      manual: true
    };
    const items: RefQuickPickItem[] = [
      ...refs.map((gitRef) => ({
        label: gitRef.label,
        description: this.i18n.t(getRefTypeMessageKey(gitRef.type)),
        detail: gitRef.ref,
        gitRef
      })),
      manualItem
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: this.i18n.t('placeholder.selectRef'),
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (!selected) {
      return undefined;
    }

    if (!selected.manual) {
      return selected.gitRef;
    }

    const input = await vscode.window.showInputBox({
      prompt: this.i18n.t('placeholder.enterRef'),
      placeHolder: 'main, v1.0.0, HEAD~1'
    });
    const ref = input?.trim();
    return ref ? { label: ref, ref, type: 'branch' } : undefined;
  }

  /**
   * 创建并初始化文件历史 Webview。
   * @param target 当前查看的文件 URI。
   * @param history 文件历史数据。
   */
  private openPanel(target: vscode.Uri, history: FileHistoryResult, options: FileHistoryOptions): void {
    const title = this.i18n.t('panel.title', path.basename(target.fsPath));
    const panel = vscode.window.createWebviewPanel(
      'miniscm.fileHistory',
      title,
      vscode.ViewColumn.Beside,
      createHistoryPanelOptions(this.context.extensionUri)
    );

    const panelState: OpenHistoryPanelState = {
      history,
      options,
      latestHistoryRequestId: 0,
      render: (nextHistory, nextOptions) => {
        panelState.history = nextHistory;
        panelState.options = nextOptions;
        this.renderPanel(panel, target, nextHistory, nextOptions);
      }
    };
    panelState.render(history, options);

    const disposable = panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
      void this.handleMessage(panel, target, panelState, message);
    });
    panel.onDidDispose(() => disposable.dispose());
  }

  /**
   * 根据当前历史数据重绘文件历史 Webview。
   * @param panel 当前 Webview 面板。
   * @param target 当前查看的文件 URI。
   * @param history 文件历史数据。
   * @param options 文件历史筛选选项。
   */
  private renderPanel(panel: vscode.WebviewPanel, target: vscode.Uri, history: FileHistoryResult, options: FileHistoryOptions): void {
    const state: HistoryWebviewState = {
      fileName: path.basename(target.fsPath),
      relativePath: history.relativePath,
      targetKind: history.targetKind,
      commits: history.commits,
      filesByCommit: {},
      options
    };
    panel.webview.html = createHistoryHtml(panel.webview, state, this.i18n);
  }

  /**
   * 处理 Webview 中的用户操作。
   * @param panel 当前 Webview 面板。
   * @param target 当前查看的文件 URI。
   * @param history 文件历史数据。
   * @param message Webview 消息。
   */
  private async handleMessage(
    panel: vscode.WebviewPanel,
    target: vscode.Uri,
    panelState: OpenHistoryPanelState,
    message: WebviewMessage
  ): Promise<void> {
    try {
      if (message.type === 'refresh' || message.type === 'reloadHistory') {
        const options = normalizeFileHistoryOptions(message.type === 'reloadHistory' ? message.options : panelState.options);
        const requestId = message.type === 'reloadHistory' ? message.requestId ?? panelState.latestHistoryRequestId + 1 : panelState.latestHistoryRequestId + 1;
        panelState.latestHistoryRequestId = requestId;
        const refreshed = await getPathHistory(target.fsPath, options);
        if (requestId !== panelState.latestHistoryRequestId) {
          return;
        }
        panelState.render(refreshed, options);
        return;
      }

      if (message.type === 'loadCommitFiles') {
        const scopedPath = panelState.history.targetKind === 'folder' ? panelState.history.relativePath : undefined;
        const files = await getCommitFiles(panelState.history.repoRoot, message.commitHash, scopedPath);
        await panel.webview.postMessage({
          type: 'commitFiles',
          commitHash: message.commitHash,
          files: sortChangedFilesByDirectory(files)
        });
        return;
      }

      if (message.type === 'copyCommitHash') {
        await vscode.env.clipboard.writeText(message.commitHash);
        await panel.webview.postMessage({ type: 'hashCopied' });
        return;
      }

      if (message.type === 'showChange') {
        await this.showChange(panelState.history.repoRoot, message.commitHash, message.file);
        return;
      }

      if (message.type === 'compareLatest') {
        await this.compareWithLatest(panelState.history.repoRoot, message.commitHash, message.file);
      }
    } catch (error) {
      await panel.webview.postMessage({
        type: 'error',
        message: `${this.i18n.t(getWebviewMessageErrorKey(message.type))} ${formatError(error)}`
      });
    }
  }

  /**
   * 打开某次提交对单个文件造成的变更。
   * @param repoRoot Git 仓库根目录。
   * @param commitHash 提交哈希。
   * @param file 文件变更信息。
   */
  private async showChange(repoRoot: string, commitHash: string, file: ChangedFile): Promise<void> {
    const parentRef = await this.getParentRef(repoRoot, commitHash);
    const leftRef = file.status.startsWith('A') ? EMPTY_REF : parentRef;
    const leftPath = file.oldPath && (file.status.startsWith('R') || file.status.startsWith('C')) ? file.oldPath : file.path;
    const rightRef = file.status.startsWith('D') ? EMPTY_REF : commitHash;
    const rightPath = file.path;

    const left = this.blobProvider.createUri({
      repoRoot,
      ref: leftRef,
      relativePath: leftPath,
      label: `${file.path}@before`
    });
    const right = this.blobProvider.createUri({
      repoRoot,
      ref: rightRef,
      relativePath: rightPath,
      label: `${file.path}@${commitHash.slice(0, 8)}`
    });

    await vscode.commands.executeCommand(
      'vscode.diff',
      left,
      right,
      this.i18n.t('title.change', file.path, commitHash.slice(0, 8))
    );
  }

  /**
   * 打开提交中文件版本与当前最新版之间的差异。
   * @param repoRoot Git 仓库根目录。
   * @param commitHash 提交哈希。
   * @param file 文件变更信息。
   */
  private async compareWithLatest(repoRoot: string, commitHash: string, file: ChangedFile): Promise<void> {
    const parentRef = file.status.startsWith('D') ? await this.getParentRef(repoRoot, commitHash) : commitHash;
    const leftPath = file.status.startsWith('D') ? file.oldPath ?? file.path : file.path;
    const left = this.blobProvider.createUri({
      repoRoot,
      ref: parentRef,
      relativePath: leftPath,
      label: `${file.path}@${commitHash.slice(0, 8)}`
    });

    const right = this.blobProvider.createUri({
      repoRoot,
      ref: 'HEAD',
      relativePath: file.path,
      label: `${file.path}@HEAD`
    });

    await vscode.commands.executeCommand(
      'vscode.diff',
      left,
      right,
      this.i18n.t('title.compareLatest', file.path)
    );
  }

  /**
   * 打开所选 ref 下文件与当前工作区文件之间的差异。
   * @param repoRoot Git 仓库根目录。
   * @param relativePath 文件相对仓库根目录的路径。
   * @param currentFile 当前工作区文件 URI。
   * @param gitRef 用户选择的 Git ref。
   */
  private async openRefDiff(repoRoot: string, relativePath: string, currentFile: vscode.Uri, gitRef: GitRef): Promise<void> {
    const descriptor = createRefDiffDescriptor(repoRoot, relativePath, currentFile.fsPath, gitRef);
    const left = this.blobProvider.createUri(descriptor.left);

    await vscode.commands.executeCommand(
      'vscode.diff',
      left,
      currentFile,
      this.i18n.t('title.compareRef', descriptor.titleFile, descriptor.titleRef)
    );
  }

  /**
   * 获取提交的一父提交；根提交没有父提交时返回空文档标记。
   * @param repoRoot Git 仓库根目录。
   * @param commitHash 提交哈希。
   * @returns 父提交哈希或空文档标记。
   */
  private async getParentRef(repoRoot: string, commitHash: string): Promise<string> {
    try {
      return (await runGit(repoRoot, ['rev-parse', `${commitHash}^`])).trim();
    } catch {
      return EMPTY_REF;
    }
  }
}

/**
 * 将未知错误格式化为适合展示的文本。
 * @param error 未知错误对象。
 * @returns 错误文本。
 */
function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 将 Git ref 类型转换为本地化文案 key。
 * @param type Git ref 类型。
 * @returns 本地化文案 key。
 */
function getRefTypeMessageKey(type: GitRefType): 'refType.branch' | 'refType.remote' | 'refType.tag' {
  if (type === 'remote') {
    return 'refType.remote';
  }
  if (type === 'tag') {
    return 'refType.tag';
  }
  return 'refType.branch';
}

/**
 * 将 Webview 消息类型转换为对应的错误文案 key。
 * @param type Webview 消息类型。
 * @returns 错误文案 key。
 */
function getWebviewMessageErrorKey(type: WebviewMessage['type']): 'error.loadCommitFiles' | 'error.loadHistory' | 'error.copyHash' {
  if (type === 'refresh' || type === 'reloadHistory') {
    return 'error.loadHistory';
  }
  if (type === 'copyCommitHash') {
    return 'error.copyHash';
  }
  return 'error.loadCommitFiles';
}

/**
 * VS Code 激活扩展时注册命令和虚拟文档提供器。
 * @param context 扩展上下文。
 */
export function activate(context: vscode.ExtensionContext): void {
  const i18n = createI18n(vscode.env.language);
  const blobProvider = new GitBlobContentProvider();
  const historyPanels = new HistoryPanelManager(context, i18n, blobProvider);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(BLOB_SCHEME, blobProvider),
    vscode.commands.registerCommand('miniscm.showFileHistory', (resource?: vscode.Uri) => {
      void historyPanels.show(resource);
    }),
    vscode.commands.registerCommand('miniscm.compareFileWithRef', (resource?: vscode.Uri) => {
      void historyPanels.compareFileWithRef(resource);
    })
  );
}

/**
 * VS Code 停用扩展时的清理入口。
 */
export function deactivate(): void {}
