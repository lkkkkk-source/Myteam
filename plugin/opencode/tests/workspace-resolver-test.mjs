// v1.8.3 — Workspace Resolver Dev-Home-Override Test (workspace-resolver-test.mjs)
// ---------------------------------------------------------------------------
// 验证 workspace-resolver.ts 的开发者自测 bypass（MYTEAM_ALLOW_HOME_AS_PROJECT）：
//
//   1) 默认模式：Home as project            => reject (HomeAsProjectError)
//   2) dev override：Home as project        => allow（解析继续）
//   3) 外部项目：正常 allow
//   4) bypass 不改变 team_root
//   5) bypass 不允许 Home 写入（平台资产只读；写入边界仍限于 .team）
//
// 生产默认行为不得被削弱：未设置 / 非 "1" 的取值都必须保持 reject。
//
// 运行：bun run tests/workspace-resolver-test.mjs
// ---------------------------------------------------------------------------
import {
  resolveWorkspace,
  readMyTeamHome,
  isInsideOrEqual,
  isHomeAsProjectDevAllowed,
  guardTeamWrite,
  HomeAsProjectError,
  MyTeamResolutionError,
} from "../workspace-resolver.ts";

import * as fs from "node:fs";
import * as path from "node:path";

const ENV = "MYTEAM_ALLOW_HOME_AS_PROJECT";
const home = readMyTeamHome();
const extBase = "C:/Users/ADMINI~1/AppData/Local/Temp/opencode/myteam-tests";
const projExt = path.join(extBase, "resolver-external");

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) { console.log("  [PASS]", msg); pass++; }
  else { console.log("  [FAIL]", msg); fail++; }
}
function clearEnv() { delete process.env[ENV]; }
function setEnv(v) { process.env[ENV] = v; }

// fixtures
fs.rmSync(path.join(projExt, ".team"), { recursive: true, force: true });
fs.mkdirSync(projExt, { recursive: true });

console.log("== setup ==");
console.log("    myteam_home =", home);
ok(typeof home === "string" && home.length > 0, "myteam_home resolved from yaml");

// ---------------------------------------------------------------------------
console.log("\n== 1) default mode: Home as project => reject ==");
clearEnv();
ok(isHomeAsProjectDevAllowed() === false, "override OFF when env unset");

let rejectedEqual = false;
try {
  resolveWorkspace({ directory: home });
} catch (e) {
  rejectedEqual = e instanceof HomeAsProjectError;
}
ok(rejectedEqual, "resolveWorkspace(home) throws HomeAsProjectError (default)");

// 也覆盖：Home 的子目录同样被拒
let rejectedInside = false;
try {
  resolveWorkspace({ directory: path.join(home, "plugin") });
} catch (e) {
  rejectedInside = e instanceof HomeAsProjectError;
}
ok(rejectedInside, "resolveWorkspace(home/plugin) throws HomeAsProjectError (default)");

// 非 "1" 取值不得放行（生产默认不可削弱）
for (const v of ["0", "true", "yes", "", " 1 ", "2"]) {
  setEnv(v);
  const allowed = isHomeAsProjectDevAllowed();
  let threw = false;
  try { resolveWorkspace({ directory: home }); } catch (e) { threw = e instanceof HomeAsProjectError; }
  ok(allowed === false && threw, `env="${v}" does NOT enable bypass (still reject)`);
}
clearEnv();

// ---------------------------------------------------------------------------
console.log("\n== 2) dev override: Home as project => allow ==");
setEnv("1");
ok(isHomeAsProjectDevAllowed() === true, 'override ON when env === "1"');

let devRes = null;
let devThrew = false;
try {
  devRes = resolveWorkspace({ directory: home });
} catch (e) {
  devThrew = true;
}
ok(!devThrew && devRes !== null, "resolveWorkspace(home) allowed under dev override");
ok(devRes && devRes.project_root === fs.realpathSync(home), "project_root = realpath(home)");
ok(devRes && devRes.myteam_home === home, "myteam_home unchanged (still platform root)");

// ---------------------------------------------------------------------------
console.log("\n== 3) external project: normal allow ==");
const extRes = resolveWorkspace({ directory: projExt });
ok(extRes.project_root === fs.realpathSync(projExt), "project_root = realpath(ext)");
ok(extRes.team_root === path.join(fs.realpathSync(projExt), ".team"), "team_root = <ext>/.team");
ok(!isInsideOrEqual(home, extRes.project_root), "external project is outside Home");

// bypass 仍开启时，外部项目解析不受影响（allow 且 team_root 正确）
ok(isHomeAsProjectDevAllowed() === true, "override still ON for this check");

// ---------------------------------------------------------------------------
console.log("\n== 4) bypass does not change team_root ==");
ok(
  devRes.team_root === path.join(fs.realpathSync(home), ".team"),
  "bypass team_root = <home>/.team (unchanged computation)"
);
// 与默认规则一致：team_root 永远是 path.join(project_root, ".team")
ok(
  devRes.team_root === path.join(devRes.project_root, ".team"),
  "bypass keeps invariant team_root === project_root/.team"
);

// ---------------------------------------------------------------------------
console.log("\n== 5) bypass does NOT allow Home writes ==");
// 5a. 平台资产写入必须被拒绝（source/prompts · agents · registry · platform assets）
const homeAssets = [
  path.join(home, "source", "prompts", "project-manager-agent.md"),
  path.join(home, "agents", "x.yaml"),
  path.join(home, "evolution", "version-registry.yaml"),
  path.join(home, "platform", "runtime-adapter", "agent-binding.yaml"),
];
let allRejected = true;
for (const t of homeAssets) {
  let rejected = false;
  try { guardTeamWrite(devRes, t); } catch (e) { rejected = e instanceof MyTeamResolutionError; }
  if (!rejected) { allRejected = false; console.log("      NOT rejected:", t); }
}
ok(allRejected, "guardTeamWrite rejects all Home platform-asset writes under bypass");

// 5b. 允许的写入目标：仅 <team_root>/** （runtime 数据）
let teamWriteOk = true;
for (const t of [devRes.team_root, path.join(devRes.team_root, "memory"), path.join(devRes.team_root, "context.yaml")]) {
  try { guardTeamWrite(devRes, t); } catch { teamWriteOk = false; console.log("      unexpectedly rejected:", t); }
}
ok(teamWriteOk, "guardTeamWrite allows writes only under <team_root>/.team");

// 5c. 越界（既不在 .team 也不在 Home）同样被拒
let outsideRejected = false;
try { guardTeamWrite(devRes, path.join(extBase, "elsewhere", "x.txt")); }
catch (e) { outsideRejected = e instanceof MyTeamResolutionError; }
ok(outsideRejected, "guardTeamWrite rejects writes outside .team entirely");

// 5d. 关键：bypass 解析本身不产生任何 Home 写入（.team 未被创建）
const homeTeamBefore = fs.existsSync(path.join(home, ".team"));
// 重新解析一次（模拟再次进入 dev 模式）
resolveWorkspace({ directory: home });
const homeTeamAfter = fs.existsSync(path.join(home, ".team"));
ok(homeTeamAfter === homeTeamBefore, "resolve does not create/modify Home/.team (no side effects)");

// cleanup
clearEnv();
fs.rmSync(path.join(projExt, ".team"), { recursive: true, force: true });

console.log("");
console.log(`=== RESULT: ${pass} pass, ${fail} fail ===`);
if (fail > 0) process.exit(1);
