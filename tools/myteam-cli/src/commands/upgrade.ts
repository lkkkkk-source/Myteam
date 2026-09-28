/** myteam upgrade — 升级治理（默认 dry-run；不自动升级生产环境）。 */
import { WORKSPACE } from "../services/registry-service";
import { planUpgrade } from "../services/migration-service";
import { header } from "../output/formatter";

export function upgrade(workspace = WORKSPACE, argv: string[] = []): string {
  const dryRun = argv.includes("--dry-run") || !argv.includes("--apply");
  const plan = planUpgrade(workspace, "next", dryRun);
  const lines = [
    header("myteam upgrade"),
    `  mode: ${plan.dryRun ? "dry-run (default)" : "apply-requested"}`,
    `  version: ${plan.currentVersion} -> ${plan.targetVersion}`,
    `  approval_required: ${plan.approvalRequired}`,
    `  approved: ${plan.approved}`,
    "  flow:",
    ...plan.steps.map((s) => `    - ${s}`),
    "  planned changes:",
    ...plan.plannedChanges.map((c) => `    - ${c}`),
    "",
    plan.dryRun
      ? "DRY-RUN: no changes applied. Review migration plan before approval."
      : "APPLY requested but blocked: approval + backup required (no production auto-upgrade).",
  ];
  return lines.join("\n");
}
