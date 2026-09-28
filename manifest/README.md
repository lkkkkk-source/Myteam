# Platform Manifest

`platform-manifest.yaml` is the single source of truth describing the Agent Platform release.

## Layers
- **source/** — development source (prompts, docs, workflows, config).
- **build/** — packaging scripts + output packages.
- **runtime/** — OpenCode install target + templates.
- **installer/** — planned install steps (no auto-install).
- **migration/** — upgrade path + logs.
- **rollback/** — restore path + backups.

## Baseline (frozen)
| Item | Count |
|------|-------|
| Agent | 30 |
| MCP | 5 |
| Skill | 26 (CC Switch managed) |
| Workflow | 8 |
