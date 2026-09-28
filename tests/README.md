# Build Package — Validation Tests (v0.6.2)

Tests assert baseline, source integrity, prompt references, manifest, and clean-layered
layout. They do **not** touch the runtime.

## Case1 — Baseline 冻结
- Verify manifest declares agent=30, mcp=5, skill=26, workflow=8.
- Verify no `agent` block exists in the current runtime config (development state).

## Case2 — Source Layer 完整性
- `source/prompts/**/*.md` == 30 prompts.
- `source/docs/**` == 22 docs.
- `source/workflows/**` == 8 workflows.
- `source/opencode_source.json` contains agent block with 30 entries, mcp=5.

## Case3 — Runtime 不被开发触碰
- `runtime/README.md` declares the runtime path is read-only in development.
- `installer/install-plan.yaml` is the only planned write path, guarded as manual.

## Case4 — Migration 可追踪
- `migration/migration-log.yaml` exists and contains a v0.6.2 entry with
  `install_status: not-installed` (or `installed` with matching backup).

## Case5 — Rollback 信息完整
- `rollback/rollback-manifest.yaml` exists.
- `rollback/backups/` directory exists.
- Rollback procedure restores config + prompt dirs; guards list protected paths.