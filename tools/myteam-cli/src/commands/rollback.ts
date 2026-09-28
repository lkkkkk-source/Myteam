/** myteam rollback — 调用已有 Recovery + rollback-plan（不删除历史记录）。 */
import { WORKSPACE } from "../services/registry-service";
import { planRollback } from "../services/migration-service";
import { header } from "../output/formatter";

export function rollback(workspace = WORKSPACE, argv: string[] = []): string {
  const backupArg = argv.find((a) => a.startsWith("--backup="));
  const backup = backupArg ? backupArg.split("=")[1] : "latest";
  const plan = planRollback(workspace, backup);
  return [
    header("myteam rollback"),
    `  backup_ref: ${plan.backupRef}`,
    `  previous_version: ${plan.previousVersion}`,
    "  flow:",
    ...plan.restoreSteps.map((s) => `    - ${s}`),
    `  deletes_history: ${plan.deletesHistory}`,
    "",
    "rollback plan ready (reuses Recovery + rollback-plan.yaml). Restore is manual; history preserved.",
  ].join("\n");
}
