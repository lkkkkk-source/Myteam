/** myteam init — 初始化 MyTeam Plugin 工作环境（只检查，不安装/不复制/不改 OpenCode）。 */
import * as fs from "node:fs";
import * as path from "node:path";
import { WORKSPACE } from "../services/registry-service";
import { header } from "../output/formatter";

export function init(workspace = WORKSPACE): string {
  const checks: Array<[string, boolean]> = [
    ["plugin manifest", fs.existsSync(path.join(workspace, "plugin/opencode/manifest.yaml"))],
    ["workspace", fs.existsSync(workspace)],
    ["source path", fs.existsSync(path.join(workspace, "source"))],
    ["runtime adapter", fs.existsSync(path.join(workspace, "platform/runtime-adapter/adapter-schema.yaml"))],
  ];
  const lines = checks.map(([k, ok]) => `  ${ok ? "✓" : "✗"} ${k}`);
  const allOk = checks.every(([, ok]) => ok);
  return `${header("myteam init")}\n${lines.join("\n")}\n\n${allOk ? "MyTeam initialized" : "MyTeam init incomplete (see above)"}\n(note: no auto-install, no OpenCode modification, no file copy)`;
}
