# DeepSeek Harness WebUI Contracts

## Scope and capability boundary

The first integration manages the official DeepSeek Harness Web service through existing PTY/daemon ownership. The official WebUI owns conversation interaction, history, models, plugins and Hooks. CLI-Manager does not register a native history source, conversation resume, token statistics, provider type, Hook source or MCP/Skills adapter for DSH. ZCode and community DeepSeek TUI integration remain separate follow-up work.

## Launch and source selection

- Installed CLI: use `dsh --profile web`; append `--port 0` when no explicit port is present. Preserve `--no-open`, explicit port, Web profile and patch arguments. Reject a non-Web profile rather than starting a service whose readiness semantics differ.
- A project custom `startup_cmd` keeps its existing priority; do not rewrite arbitrary shell scripts as DSH commands.
- `CLI_MANAGER_DSH_SOURCE_ROOT` is manager-owned, non-secret configuration stored in existing project `env_vars`. No database migration or new process manager is introduced.
- Source mode runs `node <root>/apps/cli/lib/bin.js` with shell-appropriate literal quoting. Resolve shell keys through `normalizeShellKey`, including absolute cmd/pwsh/wsl executable paths; reject unknown shell identities rather than selecting an unsafe quoting rule. Validate an absolute, existing canonical root whose root manifest name is `@deepseek-ai/dsh-root`, whose manifest is bounded to 64 KiB, and whose CLI entry, dependency directory and Web entry already exist.
- Source validation is read-only: do not install dependencies, compile the source or execute its code. Saving and launch preparation validate the selection. Invalid or unbuilt roots produce stable localized errors.
- The source root selects the executable entry only; cwd remains the target project/Worktree cwd. Do not infer Git state from `.git` being a directory.
- Local source mode is unsupported for WSL and SSH. Installed guest CLI uses the existing environment transport; do not claim arbitrary host environment variables automatically reach WSL.

## Runtime endpoint and lifecycle

- Observe existing deduplicated PTY output frames without changing ACKs, flow control or display-consumer ownership. Register session tracking before process creation and before daemon attach can deliver replay, independently of whether the toolbar or terminal UI is active.
- Parse the official `dsh web: http://…` readiness line across UTF-8/frame boundaries, strip ANSI control colors and bound the pending line buffer. Only accept HTTP URLs with a real port, loopback hostname and no URL username/password.
- Endpoint state belongs to the terminal Tab ID and remains memory-only. Attach can recover it only when retained replay contains the original readiness line. If checkpoint truncation has removed that line, the button remains waiting until a new readiness event; endpoint recovery from a checkpoint alone is not implemented. Do not log or persist URLs or access tokens, guess a default port, or borrow another Tab's endpoint.
- Replay reset clears the previous output generation. One ordered reader at the raw PTY output layer processes readiness and OSC 133/633 command/prompt boundaries plus session-matching legacy OSC 777 lifecycle events in their original byte order; do not duplicate endpoint cleanup in terminalRuntime UI callbacks. `DEEPSEEK_STOP_MARKER` is appended to managed launch commands and clears readiness on service exit even when shell runtime monitoring is disabled. Terminal close, process creation failure and bulk close release tracked sessions.
- The toolbar button belongs to the current session and opens only its ready, running service. `--no-open` affects the official automatic browser opening; explicit user activation of the button remains available.
- Existing live daemon attach remains authoritative and must not start another DSH process. If the daemon/process is gone, restore the DSH Web launch command, not an unsupported native conversation resume command. Readiness must republish the new endpoint.
- SSH loopback URLs identify the remote machine. Disable direct opening and show the localized forwarding requirement; user-managed SSH tunnels are not automatically created by this integration.

## Required validation

- Pure command tests: installed/source entry, supported shell quoting, paths with spaces and special characters, Web profile enforcement, port 0 versus explicit port, help/config inspection commands, custom startup priority and guest source rejection.
- Endpoint tests: split frames/UTF-8 and OSC boundaries, ANSI, malformed/non-loopback URLs, ordered readiness/lifecycle transitions within one frame, OSC 133/633 and legacy 777 session isolation, stop marker with monitoring disabled, replay reset, inactive-UI attach tracking, per-Tab isolation, cleanup and stale endpoint rejection. Include the retained-readiness versus truncated-checkpoint boundary.
- Source Rust tests: official manifest and existing build artifacts, invalid/relative root, oversized manifest and unbuilt source. Do not use the test to run user-selected code.
- Restore tests: live daemon attach keeps its process; dead daemon restarts the Web service without adding conversation resume flags or persisting a previous URL.
- Manual smoke: official service, explicit/allocated port, target project cwd, HTTP Web page and process stop. Record actual evidence and limitations in the task verification file.
- Manual desktop: local/WSL/SSH boundaries, multiple sessions, split panes, Worktree, create/edit/clone, zh-CN/en-US strings and browser reopen. Unavailable environments stay explicitly unverified.
- Delivery checks: targeted Node/Rust tests, TypeScript/build, independent normal and strict architecture checks, and `git diff --check`.

## Usage references

Install/build instructions belong to the [official repository](https://github.com/deepseek-ai/deepseek-harness); CLI/profile behavior is documented in its [CLI reference](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md). See `docs/功能清单.md` under `TEMP / 2026-10-01` for project setup and the SSH forwarding boundary.

## Interrupt cleanup

PowerShell managed launches use `try/finally` and `[Console]::WriteLine` for the exit marker, bypassing the cancelled pipeline. [Microsoft documents](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_try_catch_finally) that finally runs on Ctrl+C but pipeline output may be suppressed. POSIX launches use a scoped subshell with exit/interrupt/termination traps; supported Windows shells also inject lifecycle OSC for the Web service independently of the optional task-status setting. None of this changes the user's global monitoring preference or the turn-status handling for other CLIs.
