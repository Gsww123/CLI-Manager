# Root cause and bounded design

## Root-cause statement

Filesystem inventory checks depth before classifying ordinary files, then propagates a deep child's limit through `?`; one deep irrelevant branch aborts all remaining sibling discovery. Fix the producer, not the frontend warning.

## Impact analysis

GitNexus MCP and CLI are unavailable. Use the fallback explicitly allowed by fix-triage-guide: extensions-management-contracts plus symbol references.

- `scan_local` -> `inspect` -> `extensions_skills_inventory` -> Skill inventory consumers: preserve entries/warnings public shape.
- `scan_wsl` / `WSL_SCAN` are sibling implementations: align traversal and retain partial entries through the private subprocess result.
- Existing native/plugin/builtin tests and new regression tests: affected.
- Inventory UI completeness/protected operations: unchanged contract; warnings remain for actual truncation.
- Skill import/deployment/uninstall, DB ownership, credentials, terminal Hooks, cc-connect: unrelated and unchanged.

Risk: localized filesystem traversal change, medium. Continuing siblings must not create unbounded work. Keep maximum depth 8, maximum entries 500, no link recursion, WSL 15-second/1-MiB process bounds; introduce a 10,000-path per-root work budget. Do not indiscriminately exclude node_modules, which might contain a legitimate Skill.

## Design

Classify ordinary files before the depth cutoff. Treat directory depth cutoff as soft truncation and continue bounded siblings. Treat path/entry budgets as hard stops. The local wrapper returns the existing limit code after a partial traversal so outer inventory preserves entries plus a warning.

The WSL subprocess returns a private `{entries, limited}` envelope rather than discarding partial entries through process failure. Filesystem failures still fail; the public IPC shape does not change.

## Scenarios

Native Windows: ordinary file, nested plugin/builtin, valid depth-eight Skill, over-depth directory/Skill, output/path bounds, missing root, directory links. WSL: same embedded Python logic; real distro transport remains separately unverified. Enumeration order affects old omission; new sibling tests must not depend on a mocked sort in Rust. Worktree .git files are ordinary files. Window focus/tray/panes/Hooks do not affect filesystem scan and are unrelated.
