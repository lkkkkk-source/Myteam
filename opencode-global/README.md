# OpenCode Global Install Package

This directory is the staged, project-local source of truth for the OpenCode Agent Platform.

## Contents

- `opencode.json`: future global configuration, preserving the original MCP, Provider, and shell settings while adding the 30 Agent definitions.
- `prompts/`: Agent prompt files.
- `docs/`: platform specifications and operating guides.
- `workflows/`: workflow definitions.
- `backup/`: historical configuration backups copied from the former global configuration directory.

## Future Installation

When the platform is ready to install globally, merge `opencode.json` into the global configuration and copy `prompts/`, `docs/`, and `workflows/` to:

`C:\Users\Administrator\.config\opencode\`

Do not copy or modify the CC Switch-managed `skills/` directory. Preserve the existing MCP and Provider sections during installation.

## Current State

- Agent definitions: 30
- MCP definitions: 5
- Provider definitions: 12
- Skill definitions: managed externally by CC Switch
- Workflow files: 8
