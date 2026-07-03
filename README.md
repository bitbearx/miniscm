# Mini SCM History

Mini SCM History 是一个 TypeScript 编写的 VS Code 扩展，用于从文件右键菜单查看该文件的 Git 提交历史。

## 功能

- 在资源管理器或编辑器中右键本地文件，选择 **Show File Commit History / 查看文件提交历史**。
- 在资源管理器或编辑器中右键本地文件，选择 **Compare File with Ref / 与其他 Ref 对比**，可与分支、远程分支、标签或手动输入的 ref 进行差异对比。
- 在 Webview 中按行展示该文件的 commit 历史。
- 点击某个 commit 后，按目录树展开该提交变更的全部文件。
- 每个文件提供两个操作：
  - **Change / 变更**：查看该 commit 对这个文件造成的修改。
  - **Compare with Latest / 与最新版对比**：将该 commit 中的文件版本与当前最新版对比。

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

打包成功后会生成类似 `miniscm-0.0.1.vsix` 的文件。使用 VS Code 命令行安装：

```bash
code --install-extension miniscm-0.0.1.vsix
```

如果终端中没有 `code` 命令，可以在 VS Code 中打开命令面板，执行 **Shell Command: Install 'code' command in PATH**，再重新运行安装命令。安装完成后重启或刷新 VS Code，在 Git 仓库中的本地文件上右键即可使用扩展命令。

## 目录结构

- `.vscode/`：VS Code 调试与任务配置，用于启动扩展开发宿主。
- `src/`：扩展源码，包含命令入口、Git 历史查询、Webview 渲染、i18n 和共享类型。
- `tests/`：自动化测试，覆盖 Git 解析、真实 Git 仓库查询、文件树构建和 Webview 回归。
- `out/`：TypeScript 编译产物，由 `npm run compile` 生成。
- `package.json`：扩展清单、右键菜单贡献点、脚本和依赖。
- `package.nls.json` / `package.nls.zh-cn.json`：扩展清单文案的英文与中文本地化。
- `.vscodeignore`：VSIX 打包排除规则。
- `README.md`：项目说明。后续新增或调整用户可见功能时，需要同步更新这里。

## 说明

这个扩展需要调用本机 `git` 命令读取仓库历史，因此当前实现面向桌面版或远程开发场景的 VS Code 扩展宿主，不是可在纯 `vscode.dev` 沙箱中直接运行的 Web Extension。
