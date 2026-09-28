/**
 * MyTeam CLI — Entry (index.ts) — v1.1
 * -------------------------------------------------------------------------
 * 命令分发：init / status / doctor / validate / upgrade / rollback。
 * 只管理 状态 / 验证 / 迁移 / 回滚；不安装、不改 OpenCode、不执行任务。
 */

import { init } from "./commands/init";
import { status } from "./commands/status";
import { doctor } from "./commands/doctor";
import { validate } from "./commands/validate";
import { upgrade } from "./commands/upgrade";
import { rollback } from "./commands/rollback";
import { WORKSPACE } from "./services/registry-service";

export const COMMANDS = ["init", "status", "doctor", "validate", "upgrade", "rollback"] as const;
export type Command = (typeof COMMANDS)[number];

export function run(argv: string[], workspace = WORKSPACE): { text: string; code: number } {
  const cmd = argv[0] as Command | undefined;
  const rest = argv.slice(1);
  switch (cmd) {
    case "init":
      return { text: init(workspace), code: 0 };
    case "status":
      return { text: status(workspace), code: 0 };
    case "doctor":
      return { text: doctor(workspace), code: 0 };
    case "validate": {
      const r = validate(workspace);
      return { text: r.text, code: r.ok ? 0 : 1 };
    }
    case "upgrade":
      return { text: upgrade(workspace, rest), code: 0 };
    case "rollback":
      return { text: rollback(workspace, rest), code: 0 };
    default:
      return {
        text: `MyTeam CLI v1.1\nusage: myteam <${COMMANDS.join(" | ")}> [options]\n  --dry-run (upgrade, default)\n  --backup=<id> (rollback)`,
        code: cmd ? 1 : 0,
      };
  }
}
