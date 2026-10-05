# Preserve bounded sibling Skill discovery

Issue: https://github.com/dark-hxx/CLI-Manager/issues/275
Changelog target: TEMP

## Goal

Do not let irrelevant ordinary files or depth-limited directories suppress valid shallow sibling Skills. Preserve incomplete-scan warnings and all safety boundaries.

## Acceptance

- An ordinary file at depth nine is ignored rather than misclassified as an incomplete directory scan.
- A real over-depth directory is not traversed, still reports a partial scan, and does not stop other bounded sibling discovery.
- Preserve depth eight and 500 discovered entries; add a finite per-root examined-path budget to bound the additional sibling work.
- Preserve directory-link non-recursion, missing-root handling and unreadable-path errors.
- Align local Rust and embedded WSL Python semantics, retaining WSL partial entries in inventory.
- No cache deletion, database/provider/credential writes, public IPC shape changes, or desktop application launch.
- Add original-behavior regression and boundary tests, update CHANGELOG and feature list.

## Verification limitations

Windows native scanner and embedded Python can be tested locally. Real WSL transport and desktop UI acceptance must be reported separately, not inferred from isolated tests.
