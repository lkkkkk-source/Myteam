# Migration

Migration records every Source → Build → Install transition. The initial
v0.6.2 entry records the package as built but not installed.

## Rules
- Never mutate runtime during a build.
- Installation must be separately approved and manually executed.
- Record source version, package path, target runtime, backup path, and status.
- `install_status: not-installed` is the current expected state.
