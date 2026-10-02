/**
 * MyTeam OpenCode Plugin — Model Adapter Test (model-adapter.test.ts) — v1.8.4
 * ---------------------------------------------------------------------------
 * Phase 1 — 验证 Model Adapter Contract + NullModelAdapter。
 *
 * 覆盖（题干四·一）：
 *   1. NullModelAdapter 不联网（静态源码扫描：无 fetch / http / sdk / api key）
 *   2. request/response contract 正确（字段齐全 + 确定性 + 取消语义 + json 模式）
 *
 * 跑法：bun plugin/opencode/runtime/model/test/model-adapter.test.ts
 * （工作目录 plugin/opencode）
 * ---------------------------------------------------------------------------
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  NullModelAdapter,
  createNullModelAdapter,
  type ModelRequest,
  type ModelResponse,
} from "../index";
import type { ExecutionPrompt } from "../../prompt/types";

// ---------------------------------------------------------------------------
// 断言工具（沿用 MyTeam runtime 测试风格）
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
const MODEL_DIR = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// 测试用 ExecutionPrompt（含目标）
// ---------------------------------------------------------------------------

function makePrompt(goal = "do the thing"): ExecutionPrompt {
  return {
    schema_version: 1,
    prompt_source: "D:/data/code/Agent/MyTeam/source/prompts/java/java-developer.md",
    identity: { agent: "java-developer", role: "Java 后端开发工程师" },
    goal,
    capabilities: [{ tool: "read", source: "host", reason: "declared allowed" }],
    constraints: {
      workspace: "D:/proj",
      memory_ns: "D:/proj/.team/memory/agents/EX-001/java-developer",
      permissions: ["read"],
    },
    messages: [
      { role: "system", content: "system" },
      { role: "user", content: goal },
    ],
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: NullModelAdapter 不联网（静态源码扫描）
// ---------------------------------------------------------------------------

function testNoNetwork() {
  const files = ["types.ts", "null-adapter.ts", "index.ts"];
  const source = files
    .map((f) => fs.readFileSync(path.join(MODEL_DIR, f), "utf8"))
    .join("\n");

  // 禁止网络出口
  check("no fetch()", !/\bfetch\s*\(/.test(source));
  check("no http/https import", !/from\s+["'](node:)?https?["']/.test(source));
  check("no axios/sdk import", !/\b(axios|openai|anthropic|@google|@aws-sdk)\b/.test(source));
  // 禁止凭据
  check("no process.env", !/process\.env/.test(source));
  check("no api key literal", !/(api[_-]?key|authorization|bearer)/i.test(source));
  // 禁止写盘
  check("no fs.write / writeFile", !/writeFile|createWriteStream|fs\.write/.test(source));
}

// ---------------------------------------------------------------------------
// Scenario 2: request/response contract 正确
// ---------------------------------------------------------------------------

async function testContract() {
  const adapter = createNullModelAdapter();

  // 2a. 默认（text）：ok=true，text=goal，finish_reason=stop
  const reqText: ModelRequest = { prompt: makePrompt("alpha"), expects: "text" };
  const r1: ModelResponse = await adapter.complete(reqText);
  check("text: ok=true", r1.ok === true);
  check("text: echo goal", r1.text === "alpha");
  check("text: finish_reason=stop", r1.finish_reason === "stop");
  check("text: has usage field", r1.usage !== undefined);
  check("text: no error_kind", r1.error_kind === undefined);

  // 2b. json 模式：输出为合法 JSON 且含 kind=answer
  const reqJson: ModelRequest = { prompt: makePrompt("beta"), expects: "json" };
  const r2 = await adapter.complete(reqJson);
  let parsed: any = null;
  try {
    parsed = JSON.parse(r2.text);
  } catch {
    parsed = null;
  }
  check("json: parseable", parsed !== null);
  check("json: kind=answer", parsed?.kind === "answer");
  check("json: text=goal", parsed?.text === "beta");

  // 2c. 确定性：相同请求 → 相同响应
  const a = await adapter.complete(reqText);
  const b = await adapter.complete(reqText);
  check("deterministic text", a.text === b.text && a.finish_reason === b.finish_reason);

  // 2d. 取消语义：aborted → ok=false / error_kind=cancel
  const ctrl = new AbortController();
  ctrl.abort();
  const r3 = await adapter.complete({ prompt: makePrompt(), expects: "text", signal: ctrl.signal });
  check("cancel: ok=false", r3.ok === false);
  check("cancel: error_kind=cancel", r3.error_kind === "cancel");
  check("cancel: finish_reason=error", r3.finish_reason === "error");

  // 2e. 注入 responder：可定制文本
  const custom = new NullModelAdapter(() => "custom-output");
  const r4 = await custom.complete(reqText);
  check("responder: custom text", r4.text === "custom-output");
  check("responder: ok=true", r4.ok === true);

  // 2f. 实现接口形状：complete 为函数
  const iface: { complete: unknown } = adapter;
  check("contract: has complete()", typeof iface.complete === "function");
}

// ---------------------------------------------------------------------------

async function main() {
  console.log("== 1. NullModelAdapter no network ==");
  testNoNetwork();

  console.log("== 2. request/response contract ==");
  await testContract();

  console.log("");
  console.log(`===== model-adapter: ${passed}/${passed + failed} PASS =====`);
  if (failed > 0) process.exit(1);
}

main();
