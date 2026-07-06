import path from 'node:path';

import * as vscode from 'vscode';

import { LineBlameStatusManager } from './blameStatus';
import { sortChangedFilesByDirectory } from './changedFiles';
import {
  getCommitFiles,
  getCommitDetails,
  getGitRefs,
  getPathHistory,
  getRepositoryPathInfo,
  getRepositoryFileInfo,
  gitRefExists,
  runGit
} from './gitHistory';
import { getRepositoryGraph } from './gitGraph';
import { createRepositoryGraphHtml } from './graphWebview';
import { normalizeFileHistoryOptions } from './historyOptions';
import { createI18n, type I18n } from './i18n';
import { createHistoryPanelOptions } from './panelOptions';
import { createRefDiffDescriptor } from './refDiff';
import { DEFAULT_FILE_HISTORY_OPTIONS, type ChangedFile, type FileHistoryOptions, type FileHistoryResult, type GitBlobEntry, type GitCommitDetails, type GitRef, type GitRefType, type RepositoryGraphResult } from './types';
import { createCommitDetailsHtml, createHistoryHtml, type HistoryWebviewState } from './webview';

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
  | { type: 'openCommitDetails'; commitHash: string }
  | { type: 'copyCommitHash'; commitHash: string }
  | { type: 'showChange'; commitHash: string; file: ChangedFile }
  | { type: 'compareLatest'; commitHash: string; file: ChangedFile };

/** Git graph Webview 支持的提交操作。 */
type GraphCommitAction =
  | 'addTag'
  | 'createBranch'
  | 'checkout'
  | 'cherryPick'
  | 'revert'
  | 'copyHash'
  | 'copySubject';

/** Git graph Webview 发来的消息。 */
type GraphWebviewMessage =
  | { type: 'selectGraphScope'; selectedRef?: string }
  | { type: 'openCommitDetails'; commitHash: string }
  | { type: 'graphCommitAction'; action: GraphCommitAction; commitHash: string; subject: string; parentCount: number };

/** 打开 commit 详情命令的参数。 */
interface OpenCommitDetailsCommandArgs {
  repoRoot?: string;
  commitHash?: string;
}

/** SCM 面板打开仓库 graph 时的仓库候选项。 */
interface RepositoryQuickPickItem extends vscode.QuickPickItem {
  repoRoot: string;
}

/** merge commit 操作时选择 mainline parent 的选项。 */
interface MainlineParentQuickPickItem extends vscode.QuickPickItem {
  parentNumber: string;
}

/** 单个文件历史面板的可变状态。 */
interface OpenHistoryPanelState {
  history: FileHistoryResult;
  options: FileHistoryOptions;
  latestHistoryRequestId: number;
  render(history: FileHistoryResult, options: FileHistoryOptions): void;
}

/** 仓库 graph 面板的可变状态。 */
interface OpenGraphPanelState {
  graph: RepositoryGraphResult;
  latestGraphRequestId: number;
  render(graph: RepositoryGraphResult): void;
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
   * 打开指定 commit 的详情面板。
   * @param args 命令参数，包含仓库根目录与提交哈希。
   */
  async openCommitDetails(args?: OpenCommitDetailsCommandArgs): Promise<void> {
    const repoRoot = args?.repoRoot;
    const commitHash = args?.commitHash;
    if (!repoRoot || !commitHash) {
      vscode.window.showWarningMessage(this.i18n.t('error.noCommit'));
      return;
    }

    try {
      const [commit, files] = await Promise.all([
        getCommitDetails(repoRoot, commitHash),
        getCommitFiles(repoRoot, commitHash)
      ]);
      this.openCommitDetailsPanel(repoRoot, commit, sortChangedFilesByDirectory(files));
    } catch (error) {
      vscode.window.showErrorMessage(`${this.i18n.t('error.loadCommitDetails')} ${formatError(error)}`);
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
   * 创建并初始化 commit 详情 Webview。
   * @param repoRoot Git 仓库根目录。
   * @param commit commit 详情。
   * @param files commit 变更文件。
   */
  private openCommitDetailsPanel(repoRoot: string, commit: GitCommitDetails, files: ChangedFile[]): void {
    const panel = vscode.window.createWebviewPanel(
      'miniscm.commitDetails',
      this.i18n.t('webview.commitDetailsTitle'),
      vscode.ViewColumn.Beside,
      createHistoryPanelOptions(this.context.extensionUri)
    );

    panel.webview.html = createCommitDetailsHtml(panel.webview, { commit, files }, this.i18n);
    const disposable = panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
      void this.handleCommitDetailsMessage(repoRoot, commit.hash, message);
    });
    panel.onDidDispose(() => disposable.dispose());
  }

  /**
   * 处理 commit 详情 Webview 中的用户操作。
   * @param repoRoot Git 仓库根目录。
   * @param commitHash 当前 commit 哈希。
   * @param message Webview 消息。
   */
  private async handleCommitDetailsMessage(repoRoot: string, commitHash: string, message: WebviewMessage): Promise<void> {
    try {
      if (message.type === 'copyCommitHash') {
        await vscode.env.clipboard.writeText(message.commitHash);
        return;
      }

      if (message.type === 'showChange') {
        await this.showChange(repoRoot, commitHash, message.file);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`${this.i18n.t('error.loadCommitFiles')} ${formatError(error)}`);
    }
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

      if (message.type === 'openCommitDetails') {
        await this.openCommitDetails({ repoRoot: panelState.history.repoRoot, commitHash: message.commitHash });
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
 * 管理仓库 Git graph Webview 与提交右键操作。
 */
class RepositoryGraphPanelManager {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly i18n: I18n
  ) {}

  /**
   * 展示当前仓库的 Git graph。
   * @param resource 命令参数中可能传入的 URI 或 SCM 上下文。
   */
  async show(resource?: unknown): Promise<void> {
    const repoRoot = await this.resolveRepositoryRoot(resource);
    if (!repoRoot) {
      vscode.window.showWarningMessage(this.i18n.t('error.noRepository'));
      return;
    }

    try {
      this.openPanel(await getRepositoryGraph(repoRoot));
    } catch (error) {
      vscode.window.showErrorMessage(`${this.i18n.t('error.loadGraph')} ${formatError(error)}`);
    }
  }

  /**
   * 根据命令参数、当前编辑器或工作区推导仓库根目录。
   * @param resource 命令传入的上下文。
   * @returns Git 仓库根目录。
   */
  private async resolveRepositoryRoot(resource?: unknown): Promise<string | undefined> {
    const resourceUri = getUriFromCommandArg(resource);
    if (resourceUri?.scheme === 'file') {
      return this.getRepositoryRootForPath(resourceUri.fsPath);
    }

    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri?.scheme === 'file') {
      const activeRepoRoot = await this.getRepositoryRootForPath(activeUri.fsPath);
      if (activeRepoRoot) {
        return activeRepoRoot;
      }
    }

    const workspaceRepos = await this.getWorkspaceRepositoryRoots();
    if (workspaceRepos.length === 0) {
      return undefined;
    }
    if (workspaceRepos.length === 1) {
      return workspaceRepos[0];
    }

    const selected = await vscode.window.showQuickPick(
      workspaceRepos.map((repoRoot): RepositoryQuickPickItem => ({
        label: path.basename(repoRoot),
        description: repoRoot,
        repoRoot
      })),
      {
        placeHolder: this.i18n.t('placeholder.selectRepository'),
        matchOnDescription: true
      }
    );
    return selected?.repoRoot;
  }

  /**
   * 解析指定路径所在的仓库根目录。
   * @param targetPath 本地文件或目录路径。
   * @returns Git 仓库根目录。
   */
  private async getRepositoryRootForPath(targetPath: string): Promise<string | undefined> {
    try {
      return (await getRepositoryPathInfo(targetPath)).repoRoot;
    } catch {
      return undefined;
    }
  }

  /**
   * 收集工作区中的 Git 仓库根目录。
   * @returns 去重后的仓库根目录列表。
   */
  private async getWorkspaceRepositoryRoots(): Promise<string[]> {
    const folders = vscode.workspace.workspaceFolders?.filter((folder) => folder.uri.scheme === 'file') ?? [];
    const repoRoots = new Set<string>();
    for (const folder of folders) {
      try {
        repoRoots.add((await runGit(folder.uri.fsPath, ['rev-parse', '--show-toplevel'])).trim());
      } catch {
        // 允许非 Git 工作区存在，继续检查其他 workspace folder。
      }
    }
    return [...repoRoots].sort((left, right) => left.localeCompare(right));
  }

  /**
   * 创建并初始化仓库 graph Webview。
   * @param graph Git graph 数据。
   */
  private openPanel(graph: RepositoryGraphResult): void {
    const panel = vscode.window.createWebviewPanel(
      'miniscm.repositoryGraph',
      this.i18n.t('webview.graphTitle'),
      vscode.ViewColumn.Beside,
      createHistoryPanelOptions(this.context.extensionUri)
    );

    const panelState: OpenGraphPanelState = {
      graph,
      latestGraphRequestId: 0,
      render: (nextGraph) => {
        panelState.graph = nextGraph;
        panel.webview.html = createRepositoryGraphHtml(panel.webview, nextGraph, this.i18n);
      }
    };
    panelState.render(graph);

    const disposable = panel.webview.onDidReceiveMessage((message: GraphWebviewMessage) => {
      void this.handleMessage(panel, panelState, message);
    });
    panel.onDidDispose(() => disposable.dispose());
  }

  /**
   * 处理 graph Webview 中的用户操作。
   * @param panel 当前 Webview 面板。
   * @param panelState 当前 graph 面板状态。
   * @param message Webview 消息。
   */
  private async handleMessage(
    panel: vscode.WebviewPanel,
    panelState: OpenGraphPanelState,
    message: GraphWebviewMessage
  ): Promise<void> {
    try {
      if (message.type === 'selectGraphScope') {
        const requestId = panelState.latestGraphRequestId + 1;
        panelState.latestGraphRequestId = requestId;
        const graph = await getRepositoryGraph(panelState.graph.repoRoot, message.selectedRef);
        if (requestId !== panelState.latestGraphRequestId) {
          return;
        }
        panelState.render(graph);
        return;
      }

      if (message.type === 'openCommitDetails') {
        await vscode.commands.executeCommand('miniscm.openCommitDetails', {
          repoRoot: panelState.graph.repoRoot,
          commitHash: message.commitHash
        });
        return;
      }

      await this.handleCommitAction(panel, panelState, message);
    } catch (error) {
      await panel.webview.postMessage({
        type: 'graphError',
        message: `${this.i18n.t('error.graphAction')} ${formatError(error)}`
      });
    }
  }

  /**
   * 执行 graph commit 右键菜单动作。
   * @param panel 当前 Webview 面板。
   * @param panelState 当前 graph 面板状态。
   * @param message 提交动作消息。
   */
  private async handleCommitAction(
    panel: vscode.WebviewPanel,
    panelState: OpenGraphPanelState,
    message: Extract<GraphWebviewMessage, { type: 'graphCommitAction' }>
  ): Promise<void> {
    if (message.action === 'copyHash') {
      await vscode.env.clipboard.writeText(message.commitHash);
      await panel.webview.postMessage({ type: 'graphActionDone', message: this.i18n.t('toast.copied') });
      return;
    }

    if (message.action === 'copySubject') {
      await vscode.env.clipboard.writeText(message.subject);
      await panel.webview.postMessage({ type: 'graphActionDone', message: this.i18n.t('toast.copied') });
      return;
    }

    const args = await this.createCommitActionArgs(
      panelState.graph.repoRoot,
      message.action,
      message.commitHash,
      message.parentCount
    );
    if (!args) {
      return;
    }

    await runGit(panelState.graph.repoRoot, args);
    const successMessage = this.i18n.t(getGraphActionSuccessKey(message.action));
    vscode.window.showInformationMessage(successMessage);
    panelState.render(await getRepositoryGraph(panelState.graph.repoRoot, panelState.graph.selectedRef));
    await panel.webview.postMessage({ type: 'graphActionDone', message: successMessage });
  }

  /**
   * 根据用户选择构造 Git 命令参数。
   * @param repoRoot Git 仓库根目录。
   * @param action graph commit 动作。
   * @param commitHash 目标提交哈希。
   * @returns Git 命令参数；用户取消输入时返回 undefined。
   */
  private async createCommitActionArgs(
    repoRoot: string,
    action: Exclude<GraphCommitAction, 'copyHash' | 'copySubject'>,
    commitHash: string,
    parentCount: number
  ): Promise<string[] | undefined> {
    if (action === 'addTag') {
      const tagName = await this.showRefNameInput('placeholder.enterTagName', 'v1.0.0');
      return tagName ? ['tag', tagName, commitHash] : undefined;
    }

    if (action === 'createBranch') {
      const branchName = await this.showRefNameInput('placeholder.enterBranchName', 'feature/new-branch');
      return branchName ? ['branch', branchName, commitHash] : undefined;
    }

    if (action === 'checkout') {
      return ['checkout', commitHash];
    }

    if (action === 'cherryPick') {
      const mainline = parentCount > 1 ? await this.pickMainlineParent(parentCount) : undefined;
      if (parentCount > 1 && !mainline) {
        return undefined;
      }
      return mainline ? ['cherry-pick', '-m', mainline, commitHash] : ['cherry-pick', commitHash];
    }

    await runGit(repoRoot, ['rev-parse', '--verify', `${commitHash}^{commit}`]);
    const mainline = parentCount > 1 ? await this.pickMainlineParent(parentCount) : undefined;
    if (parentCount > 1 && !mainline) {
      return undefined;
    }
    return mainline ? ['revert', '--no-edit', '-m', mainline, commitHash] : ['revert', '--no-edit', commitHash];
  }

  /**
   * 弹出 ref 名称输入框。
   * @param promptKey 输入框提示文案 key。
   * @param placeHolder 输入框占位示例。
   * @returns 用户输入的 ref 名称。
   */
  private async showRefNameInput(promptKey: 'placeholder.enterTagName' | 'placeholder.enterBranchName', placeHolder: string): Promise<string | undefined> {
    const value = await vscode.window.showInputBox({
      prompt: this.i18n.t(promptKey),
      placeHolder
    });
    const trimmed = value?.trim();
    return trimmed || undefined;
  }

  /**
   * 选择 merge commit 操作所需的 mainline parent。
   * @param parentCount merge commit 的父提交数量。
   * @returns mainline parent 序号。
   */
  private async pickMainlineParent(parentCount: number): Promise<string | undefined> {
    const selected = await vscode.window.showQuickPick(
      Array.from({ length: parentCount }, (_, index): MainlineParentQuickPickItem => {
        const parentNumber = String(index + 1);
        return {
          label: this.i18n.t('graph.mainlineParent', parentNumber),
          parentNumber
        };
      }),
      {
        placeHolder: this.i18n.t('placeholder.selectMainlineParent')
      }
    );
    return selected?.parentNumber;
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
 * 将 graph 提交动作转换为成功提示文案 key。
 * @param action graph commit 动作。
 * @returns 成功提示文案 key。
 */
function getGraphActionSuccessKey(
  action: Exclude<GraphCommitAction, 'copyHash' | 'copySubject'>
): 'toast.graphTagCreated' | 'toast.graphBranchCreated' | 'toast.graphCheckedOut' | 'toast.graphCherryPicked' | 'toast.graphReverted' {
  if (action === 'addTag') {
    return 'toast.graphTagCreated';
  }
  if (action === 'createBranch') {
    return 'toast.graphBranchCreated';
  }
  if (action === 'checkout') {
    return 'toast.graphCheckedOut';
  }
  if (action === 'cherryPick') {
    return 'toast.graphCherryPicked';
  }
  return 'toast.graphReverted';
}

/**
 * 从 VS Code 命令参数中尽量提取 URI。
 * @param resource 命令参数。
 * @returns 本地资源 URI。
 */
function getUriFromCommandArg(resource: unknown): vscode.Uri | undefined {
  if (resource instanceof vscode.Uri) {
    return resource;
  }
  if (isUriLike(resource)) {
    return vscode.Uri.file(resource.fsPath);
  }

  const rootUri = (resource as { rootUri?: unknown } | undefined)?.rootUri;
  if (rootUri instanceof vscode.Uri) {
    return rootUri;
  }
  if (isUriLike(rootUri)) {
    return vscode.Uri.file(rootUri.fsPath);
  }
  return undefined;
}

/**
 * 判断对象是否包含可转为本地 URI 的 fsPath。
 * @param value 待判断对象。
 * @returns 是否像 VS Code URI。
 */
function isUriLike(value: unknown): value is { fsPath: string } {
  return typeof value === 'object' && value !== null && typeof (value as { fsPath?: unknown }).fsPath === 'string';
}

/**
 * VS Code 激活扩展时注册命令和虚拟文档提供器。
 * @param context 扩展上下文。
 */
export function activate(context: vscode.ExtensionContext): void {
  const i18n = createI18n(vscode.env.language);
  const blobProvider = new GitBlobContentProvider();
  const historyPanels = new HistoryPanelManager(context, i18n, blobProvider);
  const graphPanels = new RepositoryGraphPanelManager(context, i18n);
  const blameStatus = new LineBlameStatusManager(i18n);
  blameStatus.register(context);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(BLOB_SCHEME, blobProvider),
    vscode.commands.registerCommand('miniscm.showFileHistory', (resource?: vscode.Uri) => {
      void historyPanels.show(resource);
    }),
    vscode.commands.registerCommand('miniscm.compareFileWithRef', (resource?: vscode.Uri) => {
      void historyPanels.compareFileWithRef(resource);
    }),
    vscode.commands.registerCommand('miniscm.openCommitDetails', (args?: OpenCommitDetailsCommandArgs) => {
      void historyPanels.openCommitDetails(args);
    }),
    vscode.commands.registerCommand('miniscm.showRepositoryGraph', (resource?: unknown) => {
      void graphPanels.show(resource);
    })
  );
}

/**
 * VS Code 停用扩展时的清理入口。
 */
export function deactivate(): void {}
