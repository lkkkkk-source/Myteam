// Phase 1 — Workspace Binding Test (workspace-binding-test.mjs)
// ---------------------------------------------------------------------------
// 验证 workspace-resolver.ts：
//   1) resolveWorkspace 从 myteam-plugin.yaml 读取 myteam_home（无硬编码）
//   2) project_root = ctx.directory, team_root = <project>/.team
//   3) 项目 A / B 隔离：各建各自 .team，互不复用
//   4) ensureTeamRoot 幂等（重复调用不覆盖、不新建）
//   5) 拒绝把 MyTeam Home 当作项目（HomeAsProjectError）
//   6) index 入口链（MyTeamPlugin(src ctx)）在真实项目下可用
// 运行：bun run tests/workspace-binding-test.mjs
// ---------------------------------------------------------------------------
import { MyTeamPlugin } from "../index.ts";
import {
  resolveWorkspace,
  ensureTeamRoot,
  readMyTeamHome,
  isInsideOrEqual,
  HomeAsProjectError,
} from "../workspace-resolver.ts";

import * as fs from "node:fs";
import * as path from "node:path";

const base = "C:/Users/ADMINI~1/AppData/Local/Temp/opencode/myteam-tests";
const projA = path.join(base, "projectA");
const projB = path.join(base, "projectB");

// Fresh-state fixtures: remove any prior .team so every run starts clean.
for (const p of [projA, projB]) {
  fs.rmSync(path.join(p, ".team"), { recursive: true, force: true });
}

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) { console.log("  [PASS]", msg); pass++; }
  else { console.log("  [FAIL]", msg); fail++; }
}

console.log("== 1) myteam_home read from yaml (no hardcode) ==");
const home = readMyTeamHome();
console.log("    myteam_home =", home);
ok(typeof home === "string" && home.length > 0, "myteam_home resolved");

console.log("\n== 2) resolveWorkspace -> Resolution ==");
const ra = resolveWorkspace({ directory: projA });
ok(ra.myteam_home === home, "myteam_home carried through");
ok(ra.project_root === fs.realpathSync(projA), "project_root = realpath(projA)");
ok(ra.team_root === path.join(fs.realpathSync(projA), ".team"), "team_root = <projA>/.team");

console.log("\n== 3) project A / B isolation ==");
const teamA = ensureTeamRoot(ra);
ok(teamA.initialized === true, "first ensureTeamRoot on A creates .team");
ok(fs.existsSync(path.join(ra.team_root, "context.yaml")), "A/context.yaml created");
ok(fs.existsSync(path.join(ra.team_root, "memory")), "A/memory created");
ok(fs.existsSync(path.join(ra.team_root, "execution")), "A/execution created");
ok(fs.existsSync(path.join(ra.team_root, "trace")), "A/trace created");
ok(fs.existsSync(path.join(ra.team_root, "collaboration")), "A/collaboration created");
ok(!fs.existsSync(path.join(ra.team_root, "agents")), "A does NOT create agents/");

console.log("\n== 4) idempotency of ensureTeamRoot ==");
const teamA2 = ensureTeamRoot(ra);
ok(teamA2.initialized === false, "second ensureTeamRoot on A is idempotent (no new files)");
const ctxRaw = fs.readFileSync(path.join(ra.team_root, "context.yaml"), "utf8");
ok(ctxRaw.includes("schema_version: 1"), "context.yaml has schema_version 1");
ok(ctxRaw.includes("status:"), "context.yaml has runtime status");

console.log("\n== 5) project B gets its OWN .team (not reused from A) ==");
const rb = resolveWorkspace({ directory: projB });
ok(rb.team_root !== ra.team_root, "A and B team_roots differ");
const teamB = ensureTeamRoot(rb);
ok(teamB.initialized === true, "B first ensureTeamRoot creates B/.team");
ok(fs.existsSync(path.join(rb.team_root, "context.yaml")), "B/context.yaml created");
// A must still be intact
ok(fs.existsSync(path.join(ra.team_root, "context.yaml")), "A .team still intact after B init");

console.log("\n== 6) reject Home as project ==");
try {
  resolveWorkspace({ directory: home });
  ok(false, "resolving Home as project must throw");
} catch (e) {
  ok(e instanceof HomeAsProjectError, "throws HomeAsProjectError");
}
// inside-home rejection (e.g. a subdir under Home)
try {
  resolveWorkspace({ directory: path.join(home, "plugin") });
  ok(false, "resolving a path inside Home must throw");
} catch (e) {
  ok(e instanceof HomeAsProjectError, "throws HomeAsProjectError for path inside Home");
}

console.log("\n== 7) isInsideOrEqual helper ==");
ok(isInsideOrEqual(home, projA) === false, "projA not inside Home");
ok(isInsideOrEqual(home, home) === true, "Home is inside/equal itself");
ok(isInsideOrEqual(home, path.join(home, "plugin")) === true, "subdir inside Home is inside");

console.log("\n== 8) full plugin entry under real project (index.ts) ==");
const mockLog = [];
const ctx = {
  client: { app: { log: async (x) => { mockLog.push(x?.body?.message ?? x?.message); } } },
  directory: projA,
};
const hooks = await MyTeamPlugin(ctx);
ok(typeof hooks.tool === "object", "hooks.tool present");
ok(Array.isArray(Object.keys(hooks.tool)), "tools registered");
ok("myteam" in hooks.tool, "single entry tool 'myteam' present");
if (hooks.tool?.["myteam"]) {
  const r = await hooks.tool["myteam"].execute({ request: "hello world" }, {});
  const parsed = JSON.parse(r);
  ok(parsed.routed_to === "project-manager-agent", "entry routes to project-manager-agent");
  ok(!!parsed.binding && parsed.binding.project_root === fs.realpathSync(projA), "entry result carries project binding");
}

console.log("");
console.log(`=== RESULT: ${pass} pass, ${fail} fail ===`);
if (fail > 0) process.exit(1);
