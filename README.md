# Mini SCM History

Mini SCM History 是一个 TypeScript 编写的 VS Code 扩展，用于从文件右键菜单查看该文件的 Git 提交历史。

## 功能

- 在资源管理器或编辑器中右键本地文件，选择 **Show File Commit History / 查看文件提交历史**。
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

## 说明

这个扩展需要调用本机 `git` 命令读取仓库历史，因此当前实现面向桌面版或远程开发场景的 VS Code 扩展宿主，不是可在纯 `vscode.dev` 沙箱中直接运行的 Web Extension。
