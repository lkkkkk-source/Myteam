# Runtime Install Template

Expected OpenCode runtime layout after install. The installer **checks** against
this layout and **never overwrites** unrelated files.

```text
C:\Users\Administrator\.config\opencode\
├── prompts\           # 30 agent prompts (platform)
├── docs\              # 22 platform docs
├── workflows\         # 8 workflows
├── skills\            # 26 CC Switch managed skills (untouched)
├── opencode.json      # base config + platform agent block
├── .opencode\         # user config (untouched)
└── node_modules\      # runtime deps (untouched)
```

## Protected
- `skills/` (CC Switch)
- `.opencode/`
- `.omo/`
- `node_modules/`
- user `provider` / `mcp` blocks

## Installable
- `prompts/`, `docs/`, `workflows/`
- `agent` block in `opencode.json`
