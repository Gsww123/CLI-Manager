# DeepSeek Harness TUI 插件适配

## Goal
将 CLI-Manager 产品中 DSH 统一为官方内核 + dsh-TUI 插件 profile，在现有终端内交互。已有 dsh/deepseek-harness 项目不再默认启动浏览器。

## Requirements
- 统一 DSH CLI 描述符、旧项目识别、品牌图标和配置，安装版默认使用 dsh-tui，由启动器负责官方宿主与 profile；源码调试保留直接官方宿主入口。
- 常规配置沿用其他 CLI 的字段流程；可选源码调试设置收进高级选项，默认收起，已有配置可见且可切回安装版。
- 可选官方源码目录复用 CLI_MANAGER_DSH_SOURCE_ROOT；cwd 保持项目/Worktree；不要求 Web 构建。
- 插件由官方 profile 安装加载。配置校验只读，不隐式安装或修改 profile。
- 移除管理器 Web URL 状态、自动端口参数、WebUI 按钮及退出 marker。
- 明确 ID 恢复、不读共享 last 指针；存活 daemon 复用，失效进程新建终端不灌回旧 TUI 画面。
- 最小管理器 bridge 只报告当前前台 DSH session UUID，限定 PTY UUID，不能把后台/其他 Tab ID 当当前会话。
- 用户自定义启动脚本保留；unsupported 环境/配置给出准确双语说明。
- 不在本批伪造 DSH 原生历史统计、供应商、完成通知、MCP/Skills 能力。

## Acceptance
- [x] 项目/命令/源码/插件 profile 预检通过定向测试。
- [x] 原生 PTY 中 TUI 真正渲染、输入/缩放/退出/恢复验证。
- [x] Web 专属生产代码清理完毕，既有 CLI 定向回归通过。
- [x] TypeScript、Rust、构建及独立 normal/strict architecture 通过。
- [x] 中英文、CHANGELOG TEMP、功能清单、契约与验证记录更新。

## Authorization
用户已明确同意创建 Trellis task，开始实现，并将所有 DSH 入口转移为 TUI。

## Manual acceptance pending
手动界面语言切换及完整配置/窗口/guest 验收尚未执行，限制与真实证据见 verification.md。
