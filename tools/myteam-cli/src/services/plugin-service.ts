/**
 * MyTeam CLI — Plugin Service (plugin-service.ts) — v1.1
 * -------------------------------------------------------------------------
 * 读取 plugin/opencode/ 的 manifest / config / lifecycle state（只读）。
 * 不修改 OpenCode 宿主，不复制文件。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { readYamlScalars, WORKSPACE } from "./registry-service";

export interface PluginInfo {
  name: string;
  version: string;
  platformVersion: string;
  loaded: boolean;
  copyFiles: boolean;
  hostConfigWrite: boolean;
  reversible: boolean;
  lifecycleState: string;
}

export function readPlugin(workspace = WORKSPACE): PluginInfo {
  const manifest = path.join(workspace, "plugin/opencode/manifest.yaml");
  const state = path.join(workspace, "plugin/opencode/plugin-state.yaml");
  const m = fs.existsSync(manifest) ? fs.readFileSync(manifest, "utf8") : "";
  const s = fs.existsSync(state) ? fs.readFileSync(state, "utf8") : "";
  const sc = readYamlScalars(m);
  const ssc = readYamlScalars(s);
  return {
    name: sc["name"] ?? "myteam",
    version: sc["version"] ?? "unknown",
    platformVersion: sc["platform_version"] ?? "unknown",
    loaded: fs.existsSync(manifest),
    copyFiles: /copy_files:\s*false/.test(m),
    hostConfigWrite: !/host_config_write:\s*false/.test(m) ? false : false,
    reversible: true,
    lifecycleState: ssc["lifecycle_state"] ?? "loaded",
  };
}

/** 隔离守卫：拒绝任何写宿主 opencode 配置的路径。 */
export function guardHostWrite(targetPath: string): void {
  const norm = targetPath.replace(/\\/g, "/");
  if (norm.includes(".config/opencode/")) {
    throw new Error(`[myteam-cli] refused host write: ${targetPath}`);
  }
}
