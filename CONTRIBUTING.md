# 参与贡献

欢迎通过 Issues 报告问题或建议功能。提交问题时请说明浏览器版本、插件版本、重现步骤和实际结果；截图请先去掉不想公开的收藏及个人信息。

提交改动前运行 `npm ci` 和 `npm test`。涉及弹窗或选中保存的改动，还需要运行 `npm run test:browser`，并在 X 页面手动检查显示位置。插件无需构建；避免添加与功能无关的权限和运行时依赖。

请让每个 PR 聚焦一个问题，说明用户能看到的变化、验证方式和已知限制。插件运行文件变化时同步更新 `manifest.json` 与 `package.json` 版本，并在 `CHANGELOG.md` 记录变更。发布前运行 `python scripts/package.py`。
