# Installer

Planned, manual install flow. v0.6.2 has **no auto-install**.

## Plan
- `installer/install-plan.yaml` — step list + protection rules

## Flow
1. `verify-baseline` — confirm package matches agent=30, mcp=5, skill=26, workflow=8
2. `backup-runtime` — snapshot current runtime `opencode.json` into `rollback/backups/`
3. `install-prompts/docs/workflows` — copy platform-owned files only
4. `merge-config` — merge `agent` block into `opencode.json`; never touch mcp/provider/shell
5. `record-migration` — append entry to `migration/migration-log.yaml`

## Safety
- No overwriting of `.opencode/`, `.omo/`, `skills/`, `node_modules/`
- No changes to MCP, providers, or shell config
- Every step writes a migration log entry
