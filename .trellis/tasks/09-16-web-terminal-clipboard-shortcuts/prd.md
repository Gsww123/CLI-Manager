# Web 终端剪贴板快捷键修复

## 根因

Web 终端未将 Ctrl+V 从终端按键流中区分出来；xterm 可能把控制字符直接送入运行中的 CLI，使其误触发图片粘贴。桌面端已有明确的剪贴板快捷键策略，Web 端尚未对齐。

## 验收

- 终端选中文字时 Ctrl+C 复制选区且不中断；无选区时 Ctrl+C 中断当前 CLI。
- Ctrl+V 粘贴纯文字一次；图片剪贴板走既有上传链路且只上传一次；空剪贴板不得向 PTY 发送 Ctrl+V。
- 失焦、切换标签、断线与移动端原生输入控件不发生重复发送或串会话。
- Web 前端类型检查与构建通过；保留现有后端协议与桌面行为。

## 触点

- `apps/web/src/WebTerminal.tsx`：键盘及 paste 事件路由。
- `apps/web/src/useAppModel.ts` → WebSocket 输入：验证原样透传，不修改协议。
- `apps/web/src/MobileTerminalInput.tsx`：独立输入，不应被桌面快捷键拦截。
- `src/features/terminal/hooks/useXTermController.ts`：桌面语义参照。

## 追加：自动适配与字号解耦（用户已批准，同一分支）

### 根因与发现清单

Web 显示控制层把字号滑块、加减按钮与 Ctrl+滚轮统一写成强制 manual，导致自动适配选择被覆盖；修复控制层参数语义，自动模式先适配再缩放。

- `terminalDisplay.ts`：新增独立 zoom，旧数据默认 100%，手动字号独立保存。
- `WebTerminal.tsx`：滑块/按钮/滚轮接入同一模式规则；布局缓存纳入 zoom，自动适配固定 14px 基准，修正 fit 后才缩放，展示最终字号。
- `i18n.ts`：中英文同步说明模式、缩放与溢出。
- localStorage 与标签激活/ResizeObserver：沿用既有广播和重算入口。
- PTY/WebSocket、桌面端、移动端输入及图片上传：确认无须改动；Web 控制权下仍按原有外层空间及 14px 计算行列。
- GitNexus impact 返回 No indexed repositories found；使用 codebase-memory、源码引用和架构契约复核，范围为 Web 显示链路。

### 场景与验收

- width/contain 调整滑块、按钮、Ctrl+滚轮不改变模式；manual 仍调绝对字号。
- 模式来回切换保留手动字号与自动缩放；恢复默认重置全部显示参数。
- 旧设置缺少 zoom、损坏 JSON、边界数值均归一化；刷新及多标签广播沿用原存储键。
- 桌面/手机、分屏、窗口尺寸/DPR 变化、切换标签：可见终端重新计算 fit 后应用缩放，隐藏终端不主动布局。
- 超过 100% 允许横纵溢出，继续使用已有滚动和输入行跟随，不把字号控制反馈成 PTY resize。
- Shell/WSL/Worktree/hook 状态不参与前端显示参数计算，无对应协议改动。
- 自动验证覆盖参数迁移、模式步进、缩放边界与持久化；真实浏览器滚动、移动端输入行、标签切换和中英文显示待人工验收。
