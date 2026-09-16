# 验证记录

## 已完成

- `npm run check:architecture -- --strict`：1139 个源码文件，0 个超过 2000 行，0 项违规；检查器、baseline 和豁免列表均未修改。
- `node --test scripts/architecture.test.mjs scripts/architectureRust.test.mjs scripts/sidebarLayout.test.mjs scripts/projectSidebarDocking.test.mjs scripts/sidebarExternalTerminalMenu.test.mjs`：21 项通过。
- 终端 OSC/OSC52、PTY socket/process manager、颜色查询过滤、Web 管理菜单、Web 显示和剪贴板回归：61 项通过。
- `node --experimental-strip-types --test src/shared/lib/webTerminalFrames.test.mjs`：8 项通过。
- Web 子代理快照：4 项通过；子代理 smoke 脚本语法检查通过（未启动服务执行 UI smoke）。
- `npx tsc --noEmit`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml --lib web_daemon --locked`：17 项通过。
- `cargo check --manifest-path src-tauri/Cargo.toml --locked`：通过。
- Rust 拆出 URL 策略、Web 管理主体与原实现逐字对照一致；格式化文件做编译 AST 等价复核。
- `git diff --check`：通过。

## 测试入口同步

侧栏布局抽取后，原源码定位断言指向新的 hook。同时发现原 Workspan 不可用提示断言查错组件，改为查询实际的 WorkspaceLayoutMenu；保留原功能保护、文案断言，不删测试、不改产品行为。

## 工具限制与人工验收

GitNexus 无可用索引；memory 刷新后仍给出旧路径，已降级为真实源码、调用引用与回归结果，不把空影响列表视为无影响。

按项目规则未启动桌面/Web 服务做 UI 验证，请测试安装包的侧栏左右拖动及保存、窄窗口折叠恢复、Web 右键菜单和项目启动、终端标签切换/输出/剪贴板、缩放模式、局域网与域名连接。未触及数据库或外部数据；回滚可使用此前安装包覆盖安装，用户配置格式未变化。

## 打包

提交后执行 `npm run tauri:build:local -- --bundles nsis`，由既有流水线重建桌面/Web 资源及 Rust 二进制；安装包版本沿用 1.4.0，无 MSI。构建结果待追加。
