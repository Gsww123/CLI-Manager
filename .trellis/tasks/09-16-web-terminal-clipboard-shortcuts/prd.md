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
