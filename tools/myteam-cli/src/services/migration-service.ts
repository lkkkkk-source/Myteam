/**
 * MyTeam CLI — Migration Service (migration-service.ts) — v1.1
 * -------------------------------------------------------------------------
 * 升级/迁移治理：detect version → backup → migration plan → approval check →
 * apply → verify。默认 dry-run；不自动升级生产、不删除历史。
 * 复用 platform/runtime-adapter 的 migration-plan / rollback-plan。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { WORKSPACE } from "./registry-service";

export interface UpgradePlan {
  currentVersion: string;
  targetVersion: string;
  dryRun: boolean;
  steps: string[];
  approvalRequired: true;
  approved: boolean;
  plannedChanges: string[];
}

function readManifestVersion(workspace: string): string {
  const f = path.join(workspace, "manifest/platform-manifest.yaml");
  if (!fs.existsSync(f)) return "unknown";
  const t = fs.readFileSync(f, "utf8");
  const ids = [...t.matchAll(/- \{ id: "([^"]+)"/g)].map((m) => m[1]);
  return ids.length ? ids[ids.length - 1] : "unknown";
}

export function planUpgrade(workspace = WORKSPACE, target = "next", dryRun = true): UpgradePlan {
  const current = readManifestVersion(workspace);
  return {
    currentVersion: current,
    targetVersion: target,
    dryRun,
    approvalRequired: true,
    approved: false, // 默认未批准 → 不 apply
    steps: [
      "detect version",
      "backup runtime (rollback/backups/)",
      "generate migration plan (platform/runtime-adapter/migration-plan.yaml)",
      "approval check (deployment-manifest.status=approved required)",
      "apply (platform-owned only, manual)",
      "verify (hash + baseline)",
    ],
    plannedChanges: [
      `version: ${current} -> ${target}`,
      "backup before apply (safety)",
      "no production auto-upgrade (dry-run default)",
      "approval gate before install",
    ],
  };
}

export interface RollbackPlan {
  backupRef: string;
  previousVersion: string;
  restoreSteps: string[];
  deletesHistory: false;
}

export function planRollback(workspace = WORKSPACE, backup = "latest"): RollbackPlan {
  return {
    backupRef: `rollback/backups/${backup}/`,
    previousVersion: "prior-runtime-baseline",
    restoreSteps: [
      "select backup",
      "restore (reuse Recovery + rollback-plan.yaml)",
      "verify baseline agent=30 / mcp=5 / skill=26 / workflow=8",
    ],
    deletesHistory: false, // 禁止删除历史记录
  };
}
