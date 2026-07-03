import type * as vscode from 'vscode';

/**
 * 创建文件历史 Webview 面板选项。
 * @param extensionUri 扩展根目录 URI。
 * @returns Webview 面板选项。
 */
export function createHistoryPanelOptions(extensionUri: vscode.Uri): vscode.WebviewPanelOptions & vscode.WebviewOptions {
  return {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [extensionUri]
  };
}
