# AGENTS.md

## 基础约定

- 代码尽量使用 TypeScript，并保持改动最小化。
- 新增函数、类、接口或结构体时，需要补充简洁中文注释。
- 有用户可见文案时，需要同步考虑 i18n，不要只写死一种语言。
- 每次新增或调整用户可见功能，都要同步更新 `README.md` 的功能说明、开发方式或使用方式。
- 当有新的目录、文件变化时，需要更新当前文档的目录说明，保持与实际项目结构一致。

## 目录说明

- `.vscode/`：本地 VS Code 调试与任务配置，用于启动扩展开发宿主。
- `src/`：扩展源码。
  - `extension.ts`：扩展入口，注册右键命令、Webview、diff 操作。
  - `gitHistory.ts`：Git 命令调用与提交历史解析。
  - `blameStatus.ts`：当前行 Git Blame 状态栏和 tooltip 展示。
  - `changedFiles.ts`：变更文件列表排序工具。
  - `historyOptions.ts`：文件历史筛选选项的默认值与规范化逻辑。
  - `webview.ts`：文件历史与提交详情 Webview 的 HTML、样式和前端交互。
  - `i18n.ts`：运行时文案国际化。
  - `types.ts`：共享 TypeScript 类型。
- `tests/`：Node 内置 test runner 测试，覆盖 Git 解析、真实 Git 仓库历史读取、Git Blame 链接解析、提交详情渲染、变更文件排序和 Webview 回归。
- `out/`：TypeScript 编译输出目录，由 `npm run compile` 生成，不手动编辑。
- `node_modules/`：npm 依赖目录，不手动编辑。
- `package.json`：VS Code 扩展清单、命令/菜单贡献点、脚本和依赖。
- `package.nls.json` / `package.nls.zh-cn.json`：扩展清单文案的英文与中文本地化。
- `tsconfig.json`：TypeScript 编译配置。
- `.gitignore`：Git 忽略规则。
- `README.md`：面向使用者和开发者的项目说明；新增功能时必须同步维护。

## 验证

- 常规验证命令：`npm test`
- 打包清单验证命令：`npm_config_cache=/private/tmp/miniscm-npm-cache npm pack --dry-run --json`
