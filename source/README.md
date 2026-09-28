# Source Layer

Development source of truth for the Agent Platform. All changes to prompts, docs,
workflows, and platform configuration happen **here**, never directly in
`C:\Users\Administrator\.config\opencode`.

## Contents
| Path | Purpose |
|------|---------|
| `prompts/` | Agent prompt files (30 agents) |
| `docs/` | Platform specifications (22 docs) |
| `workflows/` | Workflow definitions (8 workflows) |
| `opencode_source.json` | Platform config incl. 30 agents, 5 MCP, providers |
| `context/` | Optional context seeds for runtime install |

## Rules
- Only edit files under `source/`.
- `source/` never imports runtime state from `~/.config/opencode`.
- The runtime layer is produced only via the Build + Install flow.
- No auto-install, no auto-upgrade, no capability selection in this stage.
