# Verification and scope review

Issue: #275. Base: 3a38a2346635cd4f42ea841372f43a0920030c5e.

## Completed checks (Windows 11)

- `cargo +1.95.0 test --manifest-path src-tauri/Cargo.toml --locked --lib extensions::inventory::tests --no-default-features`: 9 passed; builds the actual CLI-Manager library, not the isolated pre-fix reproducer. Other library tests were filtered, not claimed as run.
- `node --test scripts/extensionsI18n.test.mjs scripts/extensionsLists.test.mjs scripts/extensionsManagementUi.test.mjs scripts/extensionsInventory.test.mjs`: 28 passed, 1 skipped. The new tests execute the real embedded Python scanner. POSIX symlink test is skipped on Windows.
- `npm run check:architecture -- --strict`: no violations.
- `npx --no-install tsc --noEmit`: passed.
- `npm run web:build`: passed; required to prepare the upstream Tauri resource glob for a clean checkout's Cargo tests, not part of the fix.
- `git diff --check`: passed.

## Environment prerequisites resolved

The initial offline Cargo attempt lacked an existing dependency; online locked resolution then identified sysinfo's Rust 1.95 MSRV. An explicitly approved independent Rust 1.95.0 toolchain was installed. The user's default stable Rust remains 1.94.1. Dependency versions and lockfiles were not changed. npm dependencies were installed with lifecycle scripts disabled.

The first real Cargo build lacked generated Web assets. Building the existing Web workspace resolved that prerequisite; the subsequent actual-library inventory tests all passed. No desktop app or development server was launched.

## Impact / changes detection

GitNexus MCP/CLI is unavailable; use the explicit fix-triage fallback: reviewed extensions-management contracts, symbol references, and final Git diff. Changed producer flow is `scan_local` -> bounded helper -> `inspect` -> unchanged inventory IPC; WSL private result now preserves entries and truncation status. Frontend inventory completeness/protection, DB ownership, credentials, native writes, and remote/terminal workflows are unchanged.

No new public UI strings, IPC names, package dependencies, migrations, or credential fields. Existing bilingual extension checks pass. Do not treat discovery as session activation.

## Remaining platform/manual coverage

Real WSL process transport, POSIX link tests, and manual desktop visual acceptance were not run on this Windows host. The current native link classification and non-recursion are preserved, but this is not a claim of cross-platform end-to-end acceptance. The 10,000-path budget is a deliberate bound on continuing sibling work and is exposed to maintainer review, not an unlimited traversal promise.

## Privacy and production isolation

Only the new source checkout and disposable test fixtures were modified. Production CLI-Manager, user plugin caches, Pi accounts, platform credentials, and PATH were not modified. Do not attach user screenshots or production configuration to the Issue/PR.
