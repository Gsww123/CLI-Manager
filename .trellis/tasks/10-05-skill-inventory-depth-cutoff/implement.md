# Implementation plan

- Add bounded local traversal state, retaining the existing inventory error codes and outer API.
- Mirror classification and soft/hard cutoff semantics in WSL Python; keep partial entries on truncation.
- Add Rust regressions and direct embedded-Python tests.
- Run focused tests, architecture gates and affected-package compilation where dependencies permit.
- Document exact commands and platform/build gaps; never label isolated-function checks as full desktop acceptance.
- Update TEMP changelog and the existing Skills feature-list section.
- Review diff for unexpected files and secrets before commit/fork/PR. PR publication needs owner confirmation.
