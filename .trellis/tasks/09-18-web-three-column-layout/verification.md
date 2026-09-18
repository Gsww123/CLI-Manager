# Web three-column layout

User approved implementation and NSIS packaging. Installer version remains 1.4.0; release notes use TEMP.

## Cause and discovery

The Web sidebar used absolute positioning and measured spare terminal canvas width. It did not participate in workspace allocation, producing overlay behavior and geometry-driven visibility changes. Fix at the Web layout owner, not inside terminal rendering.

- Workbench / styles: replace overlay with normal-flow columns, explicit visibility and persistent resizable widths.
- File sidebar layout: remove canvas measurement and hysteresis; reserve terminal width, clamp both sidebars as viewport changes.
- ProjectFilesPanel: reuse Material icons, compact heading, toggle search, retain read-only lazy directory cache and cancellation.
- WebTerminal: remove unused layout-notification callback only; retain existing ResizeObserver and PTY ownership policy.
- Desktop terminal, backend API, WSL/SSH/hook execution: unchanged; unsupported file browsing continues to report capability errors.
- GitNexus unavailable (no indexed repositories; earlier index attempt failed on unowned storage). Memory search plus current source, contracts, references and Git diff are the fallback evidence.

## Scenarios / acceptance

Desktop both/one/no sidebars, narrow/wide viewport, device details open, remembered widths and collapse, keyboard/pointer resize, light/dark + zh/en; mobile drawer, touch rows, keyboard viewport; terminal tab switch, subagent split, desktop-owned/Web-owned PTY, offline/missing project/Worktree, explicit other-project menu target. No desktop services or UI will be launched by the agent per quality guidelines.

## Verification

- `node --test scripts/webProjectFiles.test.mjs`: 9 passed, including all sidebar visibility combinations across 768–2560px, device-details allocation, width preference restoration and mobile breakpoint.
- `npm run check:architecture -- --strict`: 1155 files, zero violations.
- Web typecheck + production build passed; existing large-chunk warning remains (Material icons are bundled locally, no CDN requests).
- Memory index refreshed and new resize handle found in the graph. GitNexus impact/detect-changes unavailable; scoped Git diff and source references used instead.
- Desktop typecheck and full NSIS build pending. Human visual validation required: drag/collapse both columns, switch tabs with subagents, resize browser, refresh width preferences, open mobile files/search/preview, check both languages/themes and shared PTY input/scroll behavior.
