# X Mention Saver / 记得 @

本目录为独立浏览器扩展项目，不是祖先目录中的 tarot 项目。项目事实以本文件、README、manifest 和测试为准。

运行源码无需构建。数据仅本机保存，不新增网络请求，不自动发帖，不操作用户的 X 账号。Chromium 使用 MV3 module worker；Firefox 打包为 background scripts，不能声明 service_worker。Android Chrome / iOS Chrome / X App 不支持本扩展；Firefox Android 与 Safari 转换源须明确区分静态兼容与实机验证。

交付前主 Agent 统一执行 npm ci、npm test、npm run test:browser、npm run check:firefox、python scripts/package.py。子 Agent 只生成代码、测试和本地 commit，不执行构建、测试、类型检查。运行文件修改须同步版本、CHANGELOG、README、progress.md、feature_list.json 与 CI 打包清单。收藏绝不通过 MAIN world 消息返回。
