import path from 'node:path';

import * as vscode from 'vscode';

import { buildFileTree } from './fileTree';
import {
  getCommitFiles,
  getFileHistory,
  runGit
} from './gitHistory';
import { createI18n, type I18n } from './i18n';
import type { ChangedFile, FileHistoryResult } from './types';
import { createHistoryHtml, type HistoryWebviewState } from './webview';

const BLOB_SCHEME = 'miniscm-git';
const EMPTY_REF = '__MINISCM_EMPTY__';

/** 临时 Git blob 文档的读取参数。 */
interface BlobEntry {
  repoRoot: string;
  ref: string;
  relativePath: string;
  label: string;
}

/** Webview 发来的消息。 */
type WebviewMessage =
  | { type: 'refresh' }
  | { type: 'loadCommitFiles'; commitHash: string }
  | { type: 'showChange'; commitHash: string; file: ChangedFile }
  | { type: 'compareLatest'; commitHash: string; file: ChangedFile };

/**
 * 为 VS Code diff 命令提供指定提交中的文件内容。
 */
class GitBlobContentProvider implements vscode.TextDocumentContentProvider {
  private readonly entries = new Map<string, BlobEntry>();
  private sequence = 0;

  /**
   * 创建一个可被 VS Code 打开的虚拟文档 URI。
   * @param entry Git blob 的读取参数。
   * @returns 虚拟文档 URI。
   */
  createUri(entry: BlobEntry): vscode.Uri {
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
      vscode.window.showWarningMessage(this.i18n.t('error.noFile'));
      return;
    }

    if (target.scheme !== 'file') {
      vscode.window.showWarningMessage(this.i18n.t('error.unsupportedScheme'));
      return;
    }

    try {
      const history = await getFileHistory(target.fsPath);
      this.openPanel(target, history);
    } catch (error) {
      vscode.window.showErrorMessage(`${this.i18n.t('error.loadHistory')} ${formatError(error)}`);
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
   * 创建并初始化文件历史 Webview。
   * @param target 当前查看的文件 URI。
   * @param history 文件历史数据。
   */
  private openPanel(target: vscode.Uri, history: FileHistoryResult): void {
    const title = this.i18n.t('panel.title', path.basename(target.fsPath));
    const panel = vscode.window.createWebviewPanel('miniscm.fileHistory', title, vscode.ViewColumn.Beside, {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    });

    const state: HistoryWebviewState = {
      fileName: path.basename(target.fsPath),
      relativePath: history.relativePath,
      commits: history.commits,
      filesByCommit: {}
    };
    panel.webview.html = createHistoryHtml(panel.webview, state, this.i18n);

    const disposable = panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
      void this.handleMessage(panel, target, history, message);
    });
    panel.onDidDispose(() => disposable.dispose());
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
    history: FileHistoryResult,
    message: WebviewMessage
  ): Promise<void> {
    try {
      if (message.type === 'refresh') {
        const refreshed = await getFileHistory(target.fsPath);
        panel.dispose();
        this.openPanel(target, refreshed);
        return;
      }

      if (message.type === 'loadCommitFiles') {
        const files = await getCommitFiles(history.repoRoot, message.commitHash);
        await panel.webview.postMessage({
          type: 'commitFiles',
          commitHash: message.commitHash,
          tree: buildFileTree(files)
        });
        return;
      }

      if (message.type === 'showChange') {
        await this.showChange(history.repoRoot, message.commitHash, message.file);
        return;
      }

      if (message.type === 'compareLatest') {
        await this.compareWithLatest(history.repoRoot, message.commitHash, message.file);
      }
    } catch (error) {
      await panel.webview.postMessage({
        type: 'error',
        message: `${this.i18n.t('error.loadCommitFiles')} ${formatError(error)}`
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
    })
  );
}

/**
 * VS Code 停用扩展时的清理入口。
 */
export function deactivate(): void {}
