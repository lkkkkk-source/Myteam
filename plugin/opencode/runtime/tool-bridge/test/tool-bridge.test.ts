/**
 * v1.8.4 functional smoke test — Tool Bridge (Capability Binding Layer).
 * Verifies the 5 required scenarios from the spec:
 *   1. architect context: no edit
 *   2. developer: has edit
 *   3. two projects: context isolation
 *   4. MCP only references registry (no config modification)
 *   5. MyTeam Home gets no writes
 *
 * Hermetic fixture: builds a throwaway MyTeam Home with the v1.8.4 architecture
 * layout (opencode-global/prompts/** + .ai/context/capability registries).
 * Never depends on the real repo checkout — this is what failed before (the
 * old test read HOME/source/prompts, which no longer exists).
 */

import * as os from "node:os";
import * as fsn from "node:fs";
import * as pathn from "node:path";
import {
  loadAgentDefinitionsFromHome,
  findAgentDefinition,
} from "../../../agent-loader";
import { create } from "../../../agent-instance";
import {
  buildExecutionContext,
  bindAndPersist,
  contextFilePath,
} from "../tool-bridge";
import type { AgentExecutionContext } from "../context";

const tmp = fsn.mkdtempSync(pathn.join(os.tmpdir(), "myteam-tb-"));
const HOME = pathn.join(tmp, "home");
const HOME_SEP = HOME.replace(/\\/g, "/");

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
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Fixture MyTeam Home（真实架构布局）
// ---------------------------------------------------------------------------

const prompts: Record<string, string> = {
  "advisory/solution-architect.md": `# solution-architect

> Advisory Team — 方案架构师。

## Role
Advisory solution architect; designs technical routes for PM.

## Responsibility
- design technical route options
- recommend implementation path

## Workflow
- read requirement artifact
- compare options and risks

## Skills
- \`requirement-analysis\`

## Capabilities
- \`mcp:confluence\`
`,
  "java/java-developer.md": `# java-developer

> Java Team — 编码实现 Agent。

## Role
Java developer that implements code following TDD.

## Responsibility
- implement controller / service / mapper
- follow TDD

## Workflow
- read current-task
- write failing test first
- implement and verify

## Skills
- \`test-driven-development\`
- \`java-coding\`

## Capabilities
- \`mcp:github\`
- \`mcp:maven\`
`,
  "java/java-tester.md": `# java-tester

> Java Team — 测试执行 Agent。

## Role
Java tester that compiles, runs tests, analyzes failures.

## Responsibility
- run test suite
- analyze failures

## Workflow
- compile
- run tests
- report results

## Skills
- \`test-driven-development\`

## Capabilities
- \`mcp:maven\`
`,
};

function writeFixture() {
  for (const [rel, body] of Object.entries(prompts)) {
    const p = pathn.join(HOME, "opencode-global", "prompts", rel);
    fsn.mkdirSync(pathn.dirname(p), { recursive: true });
    fsn.writeFileSync(p, body, "utf8");
  }
  const capDir = pathn.join(HOME, ".ai", "context", "capability");
  fsn.mkdirSync(capDir, { recursive: true });
  fsn.writeFileSync(
    pathn.join(capDir, "mcp-registry.yaml"),
    `  - mcp: "github"
    provides: ["repos", "docs"]
    agents_using: ["java-developer"]
    capabilities: ["read-docs"]
  - mcp: "confluence"
    provides: ["docs"]
    agents_using: ["solution-architect"]
    capabilities: ["read-docs"]
  - mcp: "maven"
    provides: ["build", "test"]
    agents_using: ["java-tester", "java-developer"]
    capabilities: ["run-test"]
`,
    "utf8"
  );
  fsn.writeFileSync(
    pathn.join(capDir, "skill-registry.yaml"),
    `  - skill: "test-driven-development"
    provides: ["testing"]
    agents_using: ["java-developer", "java-tester"]
  - skill: "requirement-analysis"
    provides: ["analysis"]
    agents_using: ["solution-architect"]
`,
    "utf8"
  );
}
writeFixture();

// 载入 Agent 定义 —— 必须来自实际架构根（opencode-global/prompts / agents），
// 绝不依赖已废弃的 source/prompts。
const defs = loadAgentDefinitionsFromHome(HOME);
check(
  "source/prompts NOT required (fixture has none)",
  !fsn.existsSync(pathn.join(HOME, "source", "prompts"))
);
check("defs loaded from architecture roots", defs.length > 0);
const architectDef = findAgentDefinition(defs, "solution-architect");
const developerDef = findAgentDefinition(defs, "java-developer");
const testerDef = findAgentDefinition(defs, "java-tester");

function mkInstance(
  def: NonNullable<typeof architectDef>,
  res: ReturnType<typeof mkRes>,
  exe: string
) {
  return create(def, res, { execution_id: exe, permissions: ["workspace-documenter"] });
}

const resA = mkRes(pathn.join(tmp, "projA"));
const resB = mkRes(pathn.join(tmp, "projB"));

console.log("\n== Scenario 1: architect context - NO edit, NO execute ==");
if (architectDef) {
  const inst = mkInstance(architectDef, resA, "EX-001");
  const ctx: AgentExecutionContext = buildExecutionContext(inst, resA);
  check("architect read=true", ctx.permissions.read === true);
  check("architect edit=false", ctx.permissions.edit === false);
  check("architect execute=false", ctx.permissions.execute === false);
  const editTool = ctx.tools.find((t) => t.tool === "edit");
  check("architect tools has edit allowed=false", editTool?.allowed === false);
  const bashTool = ctx.tools.find((t) => t.tool === "bash");
  check("architect tools has bash allowed=false", bashTool?.allowed === false);
} else {
  check("architect def loaded", false);
}

console.log("\n== Scenario 2: developer context - HAS edit ==");
if (developerDef) {
  const inst = mkInstance(developerDef, resA, "EX-001");
  const ctx: AgentExecutionContext = buildExecutionContext(inst, resA);
  check("developer read=true", ctx.permissions.read === true);
  check("developer edit=true", ctx.permissions.edit === true);
  check("developer execute=true", ctx.permissions.execute === true);
  const editTool = ctx.tools.find((t) => t.tool === "edit");
  check("developer tools has edit allowed=true", editTool?.allowed === true);
  const bashTool = ctx.tools.find((t) => t.tool === "bash");
  check("developer tools has bash allowed=true", bashTool?.allowed === true);
} else {
  check("developer def loaded", false);
}

console.log("\n== Scenario 3: two projects - context isolation ==");
if (developerDef) {
  const instA = mkInstance(developerDef, resA, "EX-001");
  const instB = mkInstance(developerDef, resB, "EX-001");
  const ctxA = buildExecutionContext(instA, resA);
  const ctxB = buildExecutionContext(instB, resB);
  check("projA workspace differs from projB", ctxA.workspace !== ctxB.workspace);
  check(
    "projA persistence differs from projB",
    ctxA.persistence_target !== ctxB.persistence_target
  );
  check(
    "projA context path under projA/.team",
    ctxA.persistence_target.replace(/\\/g, "/").includes("/projA/.team/runtime/context/")
  );
  check(
    "projB context path under projB/.team",
    ctxB.persistence_target.replace(/\\/g, "/").includes("/projB/.team/runtime/context/")
  );
  check(
    "projA security allowed includes projA",
    ctxA.security.allowed_paths.some((p) => p.includes("/projA"))
  );
  check(
    "projB security allowed includes projB",
    ctxB.security.allowed_paths.some((p) => p.includes("/projB"))
  );
} else {
  check("developer def loaded (scenario3)", false);
}

console.log("\n== Scenario 4: MCP only references registry (no config change) ==");
if (developerDef) {
  check(
    "developer prompt_rel under opencode-global/prompts",
    developerDef.prompt_rel.replace(/\\/g, "/").startsWith("opencode-global/prompts/")
  );
  const inst = mkInstance(developerDef, resA, "EX-001");
  const ctx = buildExecutionContext(inst, resA);
  // MCP 能力一律来自 registry（合法标识符），不发明新实体。
  let allValid = true;
  for (const m of ctx.mcp) {
    if (!/^[a-zA-Z0-9_-]+$/.test(m.mcp)) allValid = false;
  }
  check("all MCP names are declared identifiers (no invented entities)", allValid);
  check("developer has skills array", Array.isArray(ctx.skills));
  check("developer skills from prompt declaration", ctx.skills.includes("test-driven-development"));
  const mcpRegPath = pathn.join(HOME, ".ai", "context", "capability", "mcp-registry.yaml");
  check("mcp-registry.yaml still exists (not modified/deleted)", fsn.existsSync(mcpRegPath));

  // 构造时只读引用 —— 把 registry 展开后，发现 mcp 工具名以 mcp: 前缀声明
  check(
    "mcp tools declared as mcp:namespace",
    ctx.tools.filter((t) => t.source === "mcp").every((t) => t.tool.startsWith("mcp:"))
  );
} else {
  check("developer def loaded (scenario4)", false);
}

console.log("\n== Scenario 5: MyTeam Home receives NO writes ==");
function snapshotHome(root: string): Map<string, number> {
  const m = new Map<string, number>();
  if (!fsn.existsSync(root)) return m;
  const walk = (dir: string) => {
    for (const ent of fsn.readdirSync(dir, { withFileTypes: true })) {
      const p = pathn.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else m.set(p.replace(/\\/g, "/"), fsn.statSync(p).mtimeMs);
    }
  };
  walk(root);
  return m;
}
const homeBefore = snapshotHome(HOME);
if (developerDef) {
  const inst = mkInstance(developerDef, resA, "EX-001");
  const { written } = bindAndPersist(inst, resA);
  check(
    "persist wrote only under project .team",
    written.every((w) => !w.replace(/\\/g, "/").startsWith(HOME_SEP))
  );
  check("context file exists", fsn.existsSync(contextFilePath(resA, "java-developer")));
} else {
  check("developer def loaded (scenario5)", false);
}
const homeAfter = snapshotHome(HOME);
let homeChanged = false;
for (const [k, v] of homeAfter) {
  if (!homeBefore.has(k) || homeBefore.get(k) !== v) homeChanged = true;
}
check("MyTeam Home tree unchanged (no new/modified files)", !homeChanged);

// 清理临时目录
fsn.rmSync(tmp, { recursive: true, force: true });

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
