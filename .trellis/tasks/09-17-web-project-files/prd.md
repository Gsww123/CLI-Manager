# Web project files

Approved: replace Web management modal with read-only file sidebar; no desktop changes.

## Discovery and scenarios
- Workbench: replace entries, retain launch/history/project menus. WebTerminal reports layout only.
- New file panel captures device/project/Worktree; lazy directories, filename search, text/image preview.
- Existing transport and desktop file commands retained: uploads, permissions, root validation unaffected.
- Desktop UI/Rust/SSH/Git/Hook implementations outside modification scope.
- GitNexus impact unavailable (no indexed repositories); fallback: web-service contracts, rg and source.
- Dock only outside active canvas with enough desktop space. Never resize terminal to fit sidebar.
- Mobile/narrow viewport/subagent split: existing accessible drawer; keyboard does not change terminal policy.
- Tab/device/project/Worktree switch: abort old reads, reset results. Refresh is explicit, no filesystem watch.
- Offline/missing context/unsupported SSH/large or binary files: visible errors, no writes or automatic resubmission.
- Focus/tray/minimized/Hook/runtime differences use unchanged host implementation and authorization.
- Test bounded polling/cancellation/context isolation, geometry boundaries, Web build, terminal regressions, architecture.
- Browser/Safari verification remains manual per project rule. TEMP records; no remote push authorized.
