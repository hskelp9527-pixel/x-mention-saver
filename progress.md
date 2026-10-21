# 1.1.0 实施记录

已实现：显示昵称与旧数据迁移；编辑框内独立 @ 记得入口；扩展来源收藏面板；搜索、多选与安全复制边界；小屏和软键盘视口布局；Chromium、Firefox unsigned 与 Safari 转换源打包；测试/发布工作流。

实现子 Agent 未运行构建或测试。主 Agent 需统一执行模型测试、真实 Chromium 模拟 X 页面测试、Firefox 静态检查和打包。Firefox Android 尚未真机验证；Safari 仅转换源，需 macOS Xcode 转换、签名与设备验证。无云同步。
