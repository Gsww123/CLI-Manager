# Verification — 1.4.1

## Baseline / scope

- Branch `feat/web-git-readonly` from latest fetched master `99ea43c0`; initial worktree clean. No remote push.
- Root cause: directory session mixed first-load and stale-cache revalidation loading state; new Git feature lacked Web registration/transport/UI entry.
- Touched: Web directory cache/session/file panel, shared read operation path, desktop/mobile inspector mounting, Git read UI/DTO/i18n/CSS; desktop management read routing and server allowlist. Native Git/PTY/desktop panels/DB/SSH untouched.
- GitNexus unavailable: used contracts + refreshed codebase-memory + source/diff. Call graph flags bridge direct callers high/critical; user informed. New query validation is isolated; write confirmation preserved.

## Checks

- Web and desktop TypeScript checks passed.
- Node directory/read-only Git/Diff regressions passed; final count recorded below after last pass.
- Server Cargo test: 55 unit + 5 integration passed (including existing reconnect/authorization and new read kinds).
- Strict architecture: zero >2000-line files / zero violations.
- First test pass found old static `ProjectFilesPanel` mount assertion after introducing inspector; updated assertion to verify both real mount points and File child. Initial Web typecheck found untyped factory lambda; annotated explicitly and reran successfully.
- No application or long-running service launched for UI verification. Server tests use temporary test fixtures, not the user's service/database.

## Manual acceptance (not yet performed)

1. Install, start existing Web service, browser hard refresh; inspect desktop and Safari mobile Files/Git switch and drawer back/close. Verify terminal stays mounted and sidebar width still adjusts.
2. Main project/Worktree/nested repo switch during a slow query: no old repository data; empty/missing/offline/SSH states have readable feedback.
3. Changes groups, textual Diff and rename historical Diff; binary/oversize reports explicitly; no write controls. History search, previous/next 50-item pages and refresh.
4. Directory expand/reopen within 30s and after 30s but before 10min: cached contents show immediately without spinner; uncached slow directory retains loading feedback. Hover/focus prefetch doesn't scan recursively. Refresh/reconnect/logout invalidate correctly.
5. Chinese/English labels and 24-hour dates, keyboard navigation, narrow viewport/long filenames; runtime visual acceptance remains human verification.

## Release

- User approved commit before NSIS packaging, version 1.4.1. Build/package path and hash pending.
- Diff deliberately renders full bounded read-only snapshot text; desktop parsed/editable viewer is not loaded into standalone Web. No promise of zero latency on uncached first reads.
- Existing installer retained as rollback; no schema migration. If running the old host/Web service, restart after installing to load new operation handlers.
