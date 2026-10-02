/**
 * MyTeam OpenCode Plugin — Prompt Assembly Test (prompt-assembly.test.ts) — v1.8.4
 * ---------------------------------------------------------------------------
 * Phase 1 — 验证 PromptAssembler / ExecutionPrompt。
 *
 * 覆盖（题干四·二）：
 *   1. prompt_source 仍引用 Home（引用，非正文副本）
 *   2. 不会复制 prompt 文件（无 fs 写入；workspace 内无 prompt 副本）
 *   3. workspace 正确注入
 *   4. agent context 正确合并（capabilities 只含 allowed=true；deny_paths 不入 prompt）
 *   5. 多个 project 隔离（不同 workspace → 互不串扰）
 *
 * 跑法：bun plugin/opencode/runtime/prompt/test/prompt-assembly.test.ts
 * （工作目录 plugin/opencode）
 * ---------------------------------------------------------------------------
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { createPromptAssembler, assemble, type PromptAssemblyInput } from "../index";
import type { AgentRuntimeInstance } from "../../../agent-instance";
import type { AgentExecutionContext } from "../../tool-bridge/context";
import type { TaskInput } from "../../runner/types";

// ---------------------------------------------------------------------------
// 断言工具
// ---------------------------------------------------------------------------

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_DIR = path.resolve(__dirname, "..");

const HOME_PROMPT =
  "D:/data/code/Agent/MyTeam/source/prompts/java/java-developer.md";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeInstance(workspace: string): AgentRuntimeInstance {
  return {
    id: "EX-001:java-developer",
    agent: "java-developer",
    role: "Java 后端开发工程师",
    prompt_source: HOME_PROMPT,
    workspace,
    memory_namespace: `${workspace}/.team/memory/agents/EX-001/java-developer`,
    execution_id: "EX-001",
    permissions: ["read", "edit"],
    status: "bound",
    instance_dir: `${workspace}/.team/runtime/agent-instance/EX-001/java-developer`,
  };
}

function makeContext(
  instance: AgentRuntimeInstance,
  workspace: string
): AgentExecutionContext {
  return {
    schema_version: 1,
    layer: "tool-bridge-context",
    agent_instance: instance,
    workspace,
    tools: [
      { tool: "read", allowed: true, source: "host", reason: "declared allowed" },
      { tool: "edit", allowed: true, source: "host", reason: "declared allowed" },
      { tool: "bash", allowed: false, source: "host", reason: "denied by permission model" },
    ],
    permissions: { read: true, edit: true, execute: false },
    mcp: [],
    skills: ["unit-testing"],
    security: {
      allowed_paths: [workspace, `${workspace}/.team`],
      deny_paths: [
        "D:/data/code/Agent/MyTeam",
        "C:/Users/Administrator/.config/opencode",
      ],
      host_config: "C:/Users/Administrator/.config/opencode",
      myteam_home: "D:/data/code/Agent/MyTeam",
    },
    persistence_target: `${workspace}/.team/runtime/context/java-developer/agent-execution-context.yaml`,
  };
}

function makeTask(instance: AgentRuntimeInstance, goal = "implement feature X"): TaskInput {
  return {
    goal,
    prompt_source: instance.prompt_source,
    workspace: instance.workspace,
    memory_ns: instance.memory_namespace,
    permissions: instance.permissions,
    execution_id: instance.execution_id,
    instance_id: instance.id,
    agent: instance.agent,
  };
}

function makeInput(workspace: string, goal = "implement feature X"): PromptAssemblyInput {
  const instance = makeInstance(workspace);
  return {
    taskInput: makeTask(instance, goal),
    context: makeContext(instance, workspace),
    instance,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: prompt_source 引用 Home（非正文副本）
// ---------------------------------------------------------------------------

function testPromptSourceReference() {
  const input = makeInput("D:/proj/a");
  const prompt = createPromptAssembler().assemble(input);

  check("prompt_source === instance.prompt_source", prompt.prompt_source === HOME_PROMPT);
  check("prompt_source points to Home", prompt.prompt_source.includes("/source/prompts/"));
  // 正文未展开：prompt_source 仍是「路径」，不是文件内容
  check("prompt_source is a path (not content)", !prompt.prompt_source.includes("\n"));
  // 消息里只引用路径，不嵌入正文
  const system = prompt.messages.find((m) => m.role === "system")!.content;
  check("system message references prompt_source", system.includes(HOME_PROMPT));
}

// ---------------------------------------------------------------------------
// Scenario 2: 不会复制 prompt 文件（无 fs 写入）
// ---------------------------------------------------------------------------

function testNoCopy() {
  // 2a. 静态源码扫描：prompt 模块不含任何 fs 写入/复制能力
  const files = ["types.ts", "assembler.ts", "index.ts"];
  const source = files
    .map((f) => fs.readFileSync(path.join(PROMPT_DIR, f), "utf8"))
    .join("\n");
  check("prompt: no import fs", !/from\s+["']node:fs["']/.test(source));
  check("prompt: no copyFile/cp/writeFile", !/copyFile|\bcp\b|writeFile|createWriteStream/.test(source));
  check("prompt: no mkdir", !/mkdir/.test(source));

  // 2b. 装配本身不写 workspace：
  //     用临时 workspace 装配，断言其间没有任何文件被创建。
  const tmp = path.join(
    fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP || "."), "v184-prompt-")),
    "ws"
  );
  fs.mkdirSync(tmp, { recursive: true });
  const before = fs.readdirSync(tmp).length;

  const prompt = assemble(makeInput(tmp, "no-copy-check"));
  // 断言 prompt 内的 system 只含引用路径，不含被复制的正文
  const system = prompt.messages.find((m) => m.role === "system")!.content;
  check("no copy: system omits prompt body (no '## Role')", !system.includes("## Role"));

  const after = fs.readdirSync(tmp).length;
  check("no copy: workspace unchanged", before === after && after === 0);

  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Scenario 3: workspace 正确注入
// ---------------------------------------------------------------------------

function testWorkspaceInjection() {
  const ws = "D:/proj/workspace-injection";
  const prompt = assemble(makeInput(ws, "ws-check"));

  check("constraints.workspace injected", prompt.constraints.workspace === ws);
  check("dependency: taskInput.workspace === instance.workspace", prompt.constraints.workspace === ws);
  const system = prompt.messages.find((m) => m.role === "system")!.content;
  check("system message contains workspace", system.includes(`workspace: ${ws}`));
}

// ---------------------------------------------------------------------------
// Scenario 4: agent context 正确合并
// ---------------------------------------------------------------------------

function testContextMerge() {
  const prompt = assemble(makeInput("D:/proj/ctx-merge"));

  // 4a. capabilities 只含 allowed=true
  const tools = prompt.capabilities.map((c) => c.tool);
  check("capabilities only allowed=true", !tools.includes("bash"));
  check("capabilities includes read/edit", tools.includes("read") && tools.includes("edit"));
  check("capabilities count=2", prompt.capabilities.length === 2);

  // 4b. 安全内部信息绝不进入 prompt
  const system = prompt.messages.find((m) => m.role === "system")!.content;
  check("no deny_paths in prompt", !system.includes("deny_paths"));
  check("no host_config in prompt", !system.includes("host_config"));
  check("no myteam_home leak in prompt", !system.includes("myteam_home"));
  check("no home path leak in prompt body", !system.includes("/.config/opencode"));

  // 4c. 身份合并
  check("identity.agent merged", prompt.identity.agent === "java-developer");
  check("identity.role merged", prompt.identity.role.length > 0);

  // 4d. permissions 声明注入（不含安全域）
  check("permissions injected", prompt.constraints.permissions.join(",") === "read,edit");

  // 4e. goal → user 消息
  const user = prompt.messages.find((m) => m.role === "user")!.content;
  check("goal in user message", user === "implement feature X");
}

// ---------------------------------------------------------------------------
// Scenario 5: 多个 project 隔离
// ---------------------------------------------------------------------------

function testProjectIsolation() {
  const a = assemble(makeInput("D:/proj/alpha", "task-a"));
  const b = assemble(makeInput("D:/proj/beta", "task-b"));

  check("isolation: distinct workspace", a.constraints.workspace !== b.constraints.workspace);
  check("isolation: workspace A", a.constraints.workspace === "D:/proj/alpha");
  check("isolation: workspace B", b.constraints.workspace === "D:/proj/beta");
  check("isolation: goal A", a.goal === "task-a");
  check("isolation: goal B", b.goal === "task-b");
  check("isolation: memory_ns A", a.constraints.memory_ns.includes("D:/proj/alpha"));
  check("isolation: memory_ns B", b.constraints.memory_ns.includes("D:/proj/beta"));
  // 交叉污染检查
  check("isolation: no cross-leak A→B", !b.messages.some((m) => m.content.includes("D:/proj/alpha")));
  check("isolation: no cross-leak B→A", !a.messages.some((m) => m.content.includes("D:/proj/beta")));
}

// ---------------------------------------------------------------------------
// Scenario 6（附加）: prompt_source 引用契约护栏
// ---------------------------------------------------------------------------

function testPromptSourceGuard() {
  const input = makeInput("D:/proj/guard");
  // 篡改 taskInput.prompt_source，使它与 instance 不一致 → 必须抛错
  const bad: PromptAssemblyInput = {
    ...input,
    taskInput: { ...input.taskInput, prompt_source: "D:/elsewhere/evil.md" },
  };
  let threw = false;
  try {
    assemble(bad);
  } catch {
    threw = true;
  }
  check("guard: mismatched prompt_source throws", threw);
}

// ---------------------------------------------------------------------------

function main() {
  console.log("== 1. prompt_source references Home ==");
  testPromptSourceReference();

  console.log("== 2. no prompt file copied ==");
  testNoCopy();

  console.log("== 3. workspace injection ==");
  testWorkspaceInjection();

  console.log("== 4. agent context merge ==");
  testContextMerge();

  console.log("== 5. multi-project isolation ==");
  testProjectIsolation();

  console.log("== 6. prompt_source guard ==");
  testPromptSourceGuard();

  console.log("");
  console.log(`===== prompt-assembly: ${passed}/${passed + failed} PASS =====`);
  if (failed > 0) process.exit(1);
}

main();
