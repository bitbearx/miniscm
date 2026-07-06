# Mini SCM History

Mini SCM History 是一个 TypeScript 编写的 VS Code 扩展，用于从文件或文件夹右键菜单查看对应路径的 Git 提交历史。

## 功能

- 从资源管理器或编辑器标签页右键打开文件、文件夹的 Git 提交历史。
- 鼠标悬停或移动光标到某一行时，在底部右侧状态栏显示该行 Git Blame；悬停状态栏可查看提交者、提交时间、提交描述、commit hash，并在 GitHub 仓库中打开对应 commit；点击状态栏或 commit hash 可打开提交详情。
- 在历史面板中查看提交摘要、作者、时间、完整说明，以及每次提交影响的文件。
- 点击 commit hash 打开提交详情；在详情中查看该 commit 的文件变更，并打开单个文件在该提交中的修改差异。
- 通过搜索、时间范围和合并提交开关，快速聚焦目标历史。
- 在提交详情中复制完整 commit hash。
- 查看某个文件在指定提交中的改动，或将历史版本、当前文件与最新版、分支、标签、远程分支、任意 Git ref 对比。

## 开发

```bash
npm install
npm test
```

在 VS Code 中打开本目录后，运行 **Run Extension** 调试配置即可启动扩展开发宿主。

## 安装到本地 VS Code

先在项目目录安装依赖并编译：

```bash
npm install
npm run compile
```

然后打包 VSIX 文件：

```bash
npx @vscode/vsce package --allow-missing-repository
```

打包成功后会生成类似 `miniscm-0.0.1.vsix` 的文件。下面命令中的文件名请替换为实际生成的 VSIX 文件名：

```bash
code --install-extension miniscm-0.0.1.vsix
```

如果终端中没有 `code` 命令，可以在 VS Code 中打开命令面板，执行 **Shell Command: Install 'code' command in PATH**，再重新运行安装命令。安装完成后重启或刷新 VS Code，在 Git 仓库中的本地文件或文件夹上右键即可使用扩展命令。

## 目录结构

- `.vscode/`：VS Code 调试与任务配置，用于启动扩展开发宿主。
- `src/`：扩展源码，包含命令入口、Git 历史查询、Git Blame 状态栏、文件历史与提交详情 Webview 渲染、i18n 和共享类型。
- `tests/`：自动化测试，覆盖 Git 解析、真实 Git 仓库查询、Git Blame 链接解析、提交详情渲染、变更文件排序和 Webview 回归。
- `out/`：TypeScript 编译产物，由 `npm run compile` 生成。
- `package.json`：扩展清单、右键菜单贡献点、脚本和依赖。
- `package.nls.json` / `package.nls.zh-cn.json`：扩展清单文案的英文与中文本地化。
- `README.md`：项目说明。后续新增或调整用户可见功能时，需要同步更新这里。

## 说明

这个扩展需要调用本机 `git` 命令读取仓库历史，因此当前实现面向桌面版或远程开发场景的 VS Code 扩展宿主，不是可在纯 `vscode.dev` 沙箱中直接运行的 Web Extension。
