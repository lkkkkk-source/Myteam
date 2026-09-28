/**
 * MyTeam OpenCode Plugin — Execution Store Smoke Test (execution-store.test.ts) — v1.6.5
 * ---------------------------------------------------------------------------
 * 验证 6 项：
 *   1. execution 隔离       2. project 隔离       3. checkpoint roundtrip
 *   4. artifact 路径         5. Home 零写入         6. AgentRun 不复制 instance
 *
 * 跑法：bun plugin/opencode/runtime/execution/test/execution-store.test.ts
 * （工作目录 plugin/opencode）
 * ---------------------------------------------------------------------------
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  create,
  load,
  save,
  list,
  saveRun,
  loadRun,
  listRuns,
  saveCheckpoint,
  loadCheckpoint,
  listCheckpoints,
  saveResultArtifact,
  loadResultArtifacts,
  executionDir,
  assertNotDenied,
  assertValidExecutionId,
} from "../execution-store";
import type { Execution, AgentRun, HumanCheckpoint } from "../types";
import type { Resolution } from "../../../workspace-resolver";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, extra = ""): void {
  if (ok) {
    passed++;
    console.log(`  PASS ${name}${extra ? " " + extra : ""}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${extra ? " " + extra : ""}`);
  }
}

function makeRes(tmp: string): Resolution {
  return {
    myteam_home: path.join(tmp, "MYTEAM_HOME"),
    project_root: path.join(tmp, "proj"),
    team_root: path.join(tmp, "proj", ".team"),
  };
}

// 临时工作区
const root = fs.mkdtempSync(path.join(os.tmpdir(), "myteam-exe-"));
const res = makeRes(root);
const proj = res.project_root;
const home = res.myteam_home;
const projDir = path.join(root, "proj");
fs.mkdirSync(path.join(projDir, ".team", "runtime"), { recursive: true });
fs.mkdirSync(home, { recursive: true });

// 记录 Home 树快照（mtime + 文件名）
function snapshotTree(base: string): string {
  const out: string[] = [];
  if (!fs.existsSync(base)) return out.join("|");
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(`${p}|${fs.statSync(p).mtimeMs}`);
    }
  };
  walk(base);
  return out.join("|");
}

// ---------------------------------------------------------------------------
// 1. Execution 隔离
// ---------------------------------------------------------------------------
console.log("== 1. execution isolation ==");

const exec1: Execution = {
  execution_id: "EX-001",
  project: proj,
  created: new Date().toISOString(),
  status: "received",
  current_stage: "",
  current_agent: "",
  result: "",
};
const exec2: Execution = {
  ...exec1,
  execution_id: "EX-002",
  current_stage: "planning",
  current_agent: "architect",
};

const c1 = create(res, exec1);
check("EX-001 create sets status=received", c1.status === "received");
check("EX-001 create sets result dir", c1.result.endsWith(path.join("EX-001", "result")));

const c2 = create(res, exec2);
check("EX-002 create has own stage", c2.current_stage === "planning");

const list1 = list(res);
check("list() returns 2 executions", list1.length === 2);
check("list() sorted EX-001,EX-002", list1[0].execution_id === "EX-001" && list1[1].execution_id === "EX-002");

// save EX-001 → load EX-002 不受影响
const saved1 = save(res, { ...c1, status: "planning", current_stage: "planning" });
check("save EX-001 to planning", saved1.status === "planning");
const rel2 = load(res, "EX-002");
check("EX-002 still independent", rel2?.status === "received" && rel2.current_stage === "planning");
check("EX-001 reload shows planning", load(res, "EX-001")?.status === "planning");

// 目录骨架
for (const sub of ["runs", "checkpoints", "result"]) {
  const p = path.join(executionDir(res, "EX-001"), sub);
  check(`EX-001/${sub} dir exists`, fs.existsSync(p));
}

// ---------------------------------------------------------------------------
// 2. Project 隔离
// ---------------------------------------------------------------------------
console.log("== 2. project isolation ==");

const resB = makeRes(path.join(root, "projB"));
const projBDir = path.join(root, "projB", "proj");
fs.mkdirSync(path.join(projBDir, ".team", "runtime"), { recursive: true });
const execB1 = create(resB, { ...exec1, project: projBDir });
check("projB EX-001 independent", execB1.project === projBDir.replace(/\\/g, "/"));
check("projB list has 1", list(resB).length === 1);
check("projA still has 2", list(res).length === 2);
check("projA/EX-001 unchanged by projB", load(res, "EX-001")?.project === proj.replace(/\\/g, "/"));

// ---------------------------------------------------------------------------
// 3. Checkpoint roundtrip
// ---------------------------------------------------------------------------
console.log("== 3. checkpoint roundtrip ==");

const cp1: HumanCheckpoint = {
  checkpoint_id: "cp-0001",
  type: "modify",
  stage: "planning",
  message: "计划待确认",
  required_action: "review the plan",
  options: ["continue", "modify", "reject"],
  acknowledged: false,
};
saveCheckpoint(res, cp1, "EX-001");
const loadedCp = loadCheckpoint(res, "EX-001", "cp-0001");
check("cp-0001 roundtrip type=modify", loadedCp?.type === "modify");
check("cp-0001 roundtrip message", loadedCp?.message === "计划待确认");
check("cp-0001 roundtrip required_action", loadedCp?.required_action === "review the plan");
check("cp-0001 roundtrip options len 3", loadedCp?.options.length === 3);
check("cp-0001 not acknowledged", loadedCp?.acknowledged === false);
check("cp-0001 stage=planning", loadedCp?.stage === "planning");

const cp2: HumanCheckpoint = {
  checkpoint_id: "cp-0001",
  type: "continue",
  stage: "",
  message: "继续",
  required_action: "approve",
  options: ["continue"],
  acknowledged: true,
};
saveCheckpoint(res, cp2, "EX-002");
check("EX-002 cp-0001 isolated", loadCheckpoint(res, "EX-001", "cp-0001")?.type === "modify");
check("EX-002 own cp type=continue", loadCheckpoint(res, "EX-002", "cp-0001")?.type === "continue");
check("EX-001 checkpoints=1", listCheckpoints(res, "EX-001").length === 1);
check("EX-002 checkpoints=1", listCheckpoints(res, "EX-002").length === 1);
check("EX-001 cp acknowledged still false", loadCheckpoint(res, "EX-001", "cp-0001")?.acknowledged === false);

// resolution roundtrip
const cp1resolved: HumanCheckpoint = { ...cp1, resolution: "modify", resolved: "update plan step 2", resolved_at: "2026-01-01T00:00:00Z", acknowledged: true };
saveCheckpoint(res, cp1resolved, "EX-001");
const cp1rel = loadCheckpoint(res, "EX-001", "cp-0001");
check("cp resolution roundtrip", cp1rel?.resolution === "modify");
check("cp resolved roundtrip", cp1rel?.resolved === "update plan step 2");
check("cp acknowledged roundtrip", cp1rel?.acknowledged === true);

// ---------------------------------------------------------------------------
// 4. Result artifact 路径
// ---------------------------------------------------------------------------
console.log("== 4. artifact paths ==");

const srcFile = path.join(proj, "build-report.md");
fs.writeFileSync(srcFile, "# Build Report\nok\n", "utf8");
const art = saveResultArtifact(res, "EX-001", srcFile);
const artDir = path.join(executionDir(res, "EX-001"), "result");
check("artifact path inside result", art.path === path.join(artDir, "build-report.md"));
check("artifact size matches", art.size === fs.statSync(srcFile).size);

const nested = saveResultArtifact(res, "EX-001", srcFile, "docs/report.md");
check("nested artifact path", nested.path === path.join(artDir, "docs", "report.md"));

const arts = loadResultArtifacts(res, "EX-001");
check("loadResultArtifacts lists both", arts.length === 2);
check("list sorted", arts[0].name === "build-report.md" && arts[1].name === "docs/report.md");

const artsB = loadResultArtifacts(res, "EX-002");
check("EX-002 artifacts empty", artsB.length === 0);

// ---------------------------------------------------------------------------
// 6. AgentRun 不复制 instance（先声明 run1 供 §5 复用）
// ---------------------------------------------------------------------------
const run1: AgentRun = {
  execution_id: "EX-001",
  agent_instance_id: "EX-001:architect",
  status: "running",
  input: "设计执行生命周期",
  output: "",
  started: "2026-01-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// 5. Home 零写入
// ---------------------------------------------------------------------------
console.log("== 5. home zero writes ==");

const homeBefore = snapshotTree(home);
save(res, load(res, "EX-001") as Execution);
saveRun(res, run1, "run-001");
saveCheckpoint(res, { ...cp1, checkpoint_id: "cp-0002" }, "EX-001");
saveResultArtifact(res, "EX-001", srcFile, "extra.md");
const homeAfter = snapshotTree(home);
check("Home tree unchanged", homeBefore === homeAfter);
check("Home empty", fs.readdirSync(home).length === 0);

// ---------------------------------------------------------------------------
// 6. AgentRun 不复制 instance
// ---------------------------------------------------------------------------
console.log("== 6. run references instance id only ==");

const runYaml = fs.readFileSync(path.join(executionDir(res, "EX-001"), "runs", "run-001.yaml"), "utf8");
check("run yaml has agent_instance_id", /agent_instance_id: "EX-001:architect"/.test(runYaml));
check("run yaml has NO nested instance object", !/agent_instance:\s*{/.test(runYaml) && !/role:/.test(runYaml));

const loadedRun = loadRun(res, "EX-001", "run-001");
check("run roundtrip agent_instance_id", loadedRun?.agent_instance_id === "EX-001:architect");
check("run roundtrip input", loadedRun?.input === "设计执行生命周期");
check("run roundtrip status", loadedRun?.status === "running");
check("listRuns =1", listRuns(res, "EX-001").length === 1);

const run2 = { ...run1, execution_id: "EX-002", agent_instance_id: "EX-002:developer" };
saveRun(res, run2, "run-001");
check("EX-002 run isolated", loadRun(res, "EX-002", "run-001")?.agent_instance_id === "EX-002:developer");
check("EX-001 run unaffected", loadRun(res, "EX-001", "run-001")?.agent_instance_id === "EX-001:architect");

// 安全红线：非法 id 被拒
let rejected = false;
try {
  create(res, { ...exec1, execution_id: "../escape" });
} catch {
  rejected = true;
}
check("illegal execution_id rejected", rejected);

// ---------------------------------------------------------------------------
// 7. Security：路径穿越 / deny 域（MyTeam Home / ~/.config/opencode）
// ---------------------------------------------------------------------------
console.log("== 7. security: traversal + deny domain ==");

function throws(fn: () => unknown): boolean {
  try { fn(); return false; } catch { return true; }
}

// 7a. execution_id 白名单：只有 EX-<数字> 合法
check("id 'EX-001' accepted", assertValidExecutionId("EX-001") === "EX-001");
check("id '../escape' rejected", throws(() => assertValidExecutionId("../escape")));
check("id 'EX-1/../../x' rejected", throws(() => assertValidExecutionId("EX-1/../../x")));
check("id 'EX-001/sub' rejected", throws(() => assertValidExecutionId("EX-001/sub")));
check("id '..\\win' rejected", throws(() => assertValidExecutionId("..\\win")));
check("id 'EX-abc' rejected", throws(() => assertValidExecutionId("EX-abc")));
check("id empty rejected", throws(() => assertValidExecutionId("")));

// 7b. 穿越 id 经 create() 也必须被拒（不得落盘）
check("create('../escape') rejected", throws(() => create(res, { ...exec1, execution_id: "../escape" })));
check("create('EX-001/../EX-9') rejected", throws(() => create(res, { ...exec1, execution_id: "EX-001/../EX-9" })));

// 7c. deny 域：MyTeam Home 及其内部一律拒绝
check("deny myteam_home root", throws(() => assertNotDenied(home, res)));
check("deny myteam_home child", throws(() => assertNotDenied(path.join(home, "runtime", "execution"), res)));
check("deny host ~/.config/opencode", throws(() =>
  assertNotDenied(path.join(os.homedir(), ".config", "opencode"), res)));
check("deny host ~/.config/opencode child", throws(() =>
  assertNotDenied(path.join(os.homedir(), ".config", "opencode", "opencode.json"), res)));

// 7d. 合法 team_root 域放行
check("allow team_root path", !throws(() => assertNotDenied(path.join(res.team_root, "runtime", "execution", "EX-001"), res)));

// 7e. artifact name 逃逸 result 目录被拒
check("artifact name '../escape.md' rejected", throws(() =>
  saveResultArtifact(res, "EX-001", srcFile, "../escape.md")));
check("artifact name '../../x.md' rejected", throws(() =>
  saveResultArtifact(res, "EX-001", srcFile, "../../x.md")));
check("artifact name 'docs/../ok.md' stays inside", !throws(() =>
  saveResultArtifact(res, "EX-001", srcFile, "docs/../ok.md")));

// 7f. 穿越写入后：Home 仍为空、无逃逸产物
check("home still empty after attacks", fs.readdirSync(home).length === 0);
check("no EX-9 escape dir", !fs.existsSync(path.join(res.team_root, "runtime", "execution", "EX-9")));
check("no escape.md outside result", !fs.existsSync(path.join(proj, "escape.md")));

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);

// 清理
fs.rmSync(root, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
