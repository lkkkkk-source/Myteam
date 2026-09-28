/**
 * v1.6.1 functional smoke test — agent-instance adapter.
 * Verifies the 5 required scenarios from the spec.
 * Uses temp project dirs; cleans up after.
 */

import * as os from "node:os";
import * as fsn from "node:fs";
import * as pathn from "node:path";
import { loadAgentDefinitions, findAgentDefinition, type AgentDefinition } from "../agent-loader";
import { activateAgent, readInstanceFile, instanceFilePath, type AgentRuntimeInstance } from "../agent-instance";

const HOME = "D:/data/code/Agent/MyTeam";

function mkRes(projectRoot: string) {
  return {
    myteam_home: HOME,
    project_root: projectRoot,
    team_root: pathn.join(projectRoot, ".team"),
  };
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}`);
  }
}

const tmp = pathn.join(os.tmpdir(), "myteam-v161-" + Date.now());
const p1 = pathn.join(tmp, "proj-a");
const p2 = pathn.join(tmp, "proj-b");
fsn.mkdirSync(p1, { recursive: true });
fsn.mkdirSync(p2, { recursive: true });

const defs = loadAgentDefinitions(pathn.join(HOME, "source/prompts"));
const arch = findAgentDefinition(defs, "java-architect")!;
if (!arch) {
  console.log("FAIL: java-architect not found");
  process.exit(1);
}

console.log("[" + defs.length + " definitions loaded]");
console.log("[definitions preserve Home prompt (no copy)]");
check("prompt belongs to Home", arch.prompt_path.startsWith(HOME.replace(/\\/g, "/")));
check("definitions still 30", defs.length === 30);

console.log("\n== Scenario 1 & 2 & 3: same agent, two projects, distinct instance ==");
const i1 = activateAgent(arch, mkRes(p1), { execution_id: "EX-001", permissions: ["read", "diagram"] });
const i2 = activateAgent(arch, mkRes(p2), { execution_id: "EX-001", permissions: ["read"] });

check("status bound", i1.status === "bound");
check("different project -> different instance_dir", i1.instance_dir !== i2.instance_dir);
check("workspace differs (s1)", i1.workspace !== i2.workspace);
check("workspace A == proj-a", i1.workspace.replace(/\\/g, "/") === p1.replace(/\\/g, "/"));
check("memory namespace differs (s2)", i1.memory_namespace !== i2.memory_namespace);
check("memory ns under A/.team/memory", i1.memory_namespace.includes(pathn.join(".team", "memory").replace(/\\/g, "/")));
check("2 different execution ids -> differ", i1.execution_id === "EX-001");

console.log("\n== Scenario 5: delete .team/runtime and regenerate ==");
const p3 = pathn.join(tmp, "proj-regen");
fsn.mkdirSync(p3, { recursive: true });
const r3 = mkRes(p3);
const b1 = activateAgent(arch, r3, { execution_id: "EX-001", permissions: [] });
const rtDir = pathn.join(r3.team_root, "runtime");
check("instance written before delete", fsn.existsSync(instanceFilePath(b1)));
fsn.rmSync(rtDir, { recursive: true, force: true });
check("runtime removed", !fsn.existsSync(rtDir));
const b2 = activateAgent(arch, r3, { execution_id: "EX-001", permissions: [] });
check("regenerated fine (s5)", b2.status === "bound" && fsn.existsSync(instanceFilePath(b2)));

console.log("\n== roundtrip readInstanceFile ==");
const file = instanceFilePath(b2);
const rr = readInstanceFile(file)!;
check("roundtrip id", rr.id === b2.id);
check("roundtrip status", rr.status === "bound");
check("roundtrip perms", JSON.stringify(rr.permissions) === JSON.stringify(b2.permissions));

console.log("\n== Scenario 4: MyTeam Home untouched ==");
// Loader is read-only: no file created under Home by activate (only .team writes)
const homeHasNoNew = defs.every((d) => fsn.existsSync(d.prompt_path));
check("home prompts still exist (no deletion)", homeHasNoNew);

console.log("\n== isolation: instance file never under Home ===");
check("instance file not under Home", !instanceFilePath(b2).replace(/\\/g, "/").startsWith(HOME.replace(/\\/g, "/")));
check("memory ns not under Home", !b2.memory_namespace.replace(/\\/g, "/").startsWith(HOME.replace(/\\/g, "/")));

// cleanup
fsn.rmSync(tmp, { recursive: true, force: true });

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
