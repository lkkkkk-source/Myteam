# Rollback

Restores the OpenCode runtime to a known-good state if an install breaks config.

## Location
- Backups: `rollback/backups/`
- Manifest: `rollback/rollback-manifest.yaml`

## Flow
1. Confirm a backup exists in `rollback/backups/`.
2. Restore `opencode.json`, `prompts/`, `docs/`, `workflows/` from backup.
3. Verify runtime baseline (Agent=30, MCP=5, Skill=26, Workflow=8) and platform agent presence.
4. Append recovery entry to `rollback/rollback-manifest.yaml`.

## Guards
- Never touch CC Switch `skills/`.
- Never delete `node_modules/` or user directives.
- Only restore platform-owned paths.