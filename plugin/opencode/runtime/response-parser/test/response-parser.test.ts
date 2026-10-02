/**
 * MyTeam OpenCode Plugin — Response Parser Test (response-parser.test.ts) — v1.8.4
 * ---------------------------------------------------------------------------
 * Phase 2 — 验证 ResponseParser（ModelResponse → ParsedAgentResponse）。
 *
 * 覆盖（设计 §5）：
 *   1. R-1 严格模式：expects="json" 时必须是合法 JSON；解析失败 → invalid。
 *   2. R-2 结构校验：tool_calls[].tool 非空字符串、arguments 为对象。
 *   3. R-3 不信任字段：解析器不判定工具合法性/权限（交给 ActionValidator）。
 *   4. R-4 无执行：解析器纯转换（静态扫描无 fs/net/tool 调用）。
 *   5. R-5 安全截断：超长文本按上限截断并标注 truncated。
 *
 * 跑法：bun plugin/opencode/runtime/response-parser/test/response-parser.test.ts
 * （工作目录 plugin/opencode）
 * ---------------------------------------------------------------------------
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { parse, ResponseParser, createResponseParser, MAX_RESPONSE_TEXT_LENGTH, MAX_RESPONSE_RAW_LENGTH, MAX_TOOL_CALLS } from "../index";
import type { ModelResponse } from "../../model/types";

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
const PARSER_DIR = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function okResponse(text: string, finish_reason: ModelResponse["finish_reason"] = "stop"): ModelResponse {
  return { ok: true, text, finish_reason, usage: {} };
}

function failResponse(kind: string, detail: string): ModelResponse {
  return { ok: false, text: "", finish_reason: "error", error_kind: kind as any, error_detail: detail };
}

// ---------------------------------------------------------------------------
// Scenario 1: R-1 严格模式（合法 JSON / 非法 JSON）
// ---------------------------------------------------------------------------

function testStrictJson() {
  // 合法 answer
  const good = parse(okResponse(JSON.stringify({ kind: "answer", text: "hello" })));
  check("strict: valid answer parses", good.kind === "answer");
  check("strict: answer text", good.kind === "answer" && good.text === "hello");

  // 非法 JSON → invalid
  const bad = parse(okResponse("{ not valid json"));
  check("strict: invalid json → invalid", bad.kind === "invalid");
  check("strict: invalid reason present", bad.kind === "invalid" && bad.reason.length > 0);

  // JSON 数组 / 标量 → invalid（外层必须是对象）
  const arr = parse(okResponse("[1,2,3]"));
  check("strict: array root → invalid", arr.kind === "invalid");
  const str = parse(okResponse('"just a string"'));
  check("strict: string root → invalid", str.kind === "invalid");

  // 无 kind → invalid
  const nokind = parse(okResponse(JSON.stringify({ foo: 1 })));
  check("strict: unknown kind → invalid", nokind.kind === "invalid");
}

// ---------------------------------------------------------------------------
// Scenario 2: text 模式
// ---------------------------------------------------------------------------

function testTextMode() {
  const r = parse(okResponse("plain answer"), { expects: "text" });
  check("text: → answer", r.kind === "answer");
  check("text: raw text kept", r.kind === "answer" && r.text === "plain answer");

  // 空文本 → invalid
  const empty = parse(okResponse("   "), { expects: "text" });
  check("text: empty → invalid", empty.kind === "invalid");

  // 缺省 expects = json
  const def = parse(okResponse('{"kind":"answer","text":"x"}'));
  check("default expects=json", def.kind === "answer");
}

// ---------------------------------------------------------------------------
// Scenario 3: R-2 结构校验（tool_calls）
// ---------------------------------------------------------------------------

function testToolCallShape() {
  // 合法：calls 数组 + tool + arguments
  const good = parse(
    okResponse(
      JSON.stringify({
        kind: "tool_calls",
        calls: [
          { tool: "read", arguments: { path: "/proj/a.ts" } },
          { tool: "grep", arguments: { pattern: "foo", directory: "/proj" }, source: "host" },
        ],
      })
    )
  );
  check("tool_calls: parses", good.kind === "tool_calls");
  check("tool_calls: calls length 2", good.kind === "tool_calls" && good.calls.length === 2);
  check("tool_calls: tool name", good.kind === "tool_calls" && good.calls[0].tool === "read");
  check("tool_calls: args object", good.kind === "tool_calls" && typeof good.calls[0].arguments === "object");

  // tool 为空字符串 / 缺失 → invalid
  const noTool = parse(
    okResponse(JSON.stringify({ kind: "tool_calls", calls: [{ arguments: { path: "/x" } }] }))
  );
  check("tool_calls: missing tool → invalid", noTool.kind === "invalid");

  const emptyTool = parse(
    okResponse(JSON.stringify({ kind: "tool_calls", calls: [{ tool: "", arguments: {} }] }))
  );
  check("tool_calls: empty tool → invalid", emptyTool.kind === "invalid");

  // arguments 非对象（数组 / 字符串）→ invalid
  const badArgs = parse(
    okResponse(JSON.stringify({ kind: "tool_calls", calls: [{ tool: "read", arguments: "nope" }] }))
  );
  check("tool_calls: non-object arguments → invalid", badArgs.kind === "invalid");

  // calls 缺失 / 空数组 → invalid
  const noCalls = parse(okResponse(JSON.stringify({ kind: "tool_calls" })));
  check("tool_calls: missing calls → invalid", noCalls.kind === "invalid");
  const emptyCalls = parse(okResponse(JSON.stringify({ kind: "tool_calls", calls: [] })));
  check("tool_calls: empty calls → invalid", emptyCalls.kind === "invalid");

  // calls 超出上限 → invalid（防 DoS）
  const many = Array.from({ length: MAX_TOOL_CALLS + 1 }, (_, i) => ({ tool: `t${i}`, arguments: {} }));
  const over = parse(okResponse(JSON.stringify({ kind: "tool_calls", calls: many })));
  check("tool_calls: over max calls → invalid", over.kind === "invalid");
}

// ---------------------------------------------------------------------------
// Scenario 4: checkpoint
// ---------------------------------------------------------------------------

function testCheckpoint() {
  const r = parse(okResponse(JSON.stringify({ kind: "checkpoint", message: "confirm?", options: ["y", "n"] })));
  check("checkpoint: parses", r.kind === "checkpoint");
  check("checkpoint: message", r.kind === "checkpoint" && r.message === "confirm?");
  check("checkpoint: options", r.kind === "checkpoint" && r.options?.length === 2);

  const noMsg = parse(okResponse(JSON.stringify({ kind: "checkpoint" })));
  check("checkpoint: missing message → invalid", noMsg.kind === "invalid");
}

// ---------------------------------------------------------------------------
// Scenario 5: 模型失败 / 取消 → invalid
// ---------------------------------------------------------------------------

function testModelFailure() {
  const r = parse(failResponse("model_error", "upstream down"));
  check("model fail → invalid", r.kind === "invalid");
  check("model fail: errorKind preserved", r.kind === "invalid" && r.errorKind === "model_error");
  check("model fail: reason readable", r.kind === "invalid" && r.reason.includes("upstream down"));

  const c = parse(failResponse("cancel", "aborted"));
  check("cancel → invalid errorKind=cancel", c.kind === "invalid" && c.errorKind === "cancel");
}

// ---------------------------------------------------------------------------
// Scenario 6: R-5 安全截断
// ---------------------------------------------------------------------------

function testTruncation() {
  // 超长 answer 文本（< raw 上限）→ 字段级截断 + truncated=true
  const long = "a".repeat(500);
  const r = parse(okResponse(JSON.stringify({ kind: "answer", text: long })), { maxTextLength: 100 });
  check("truncate: kind=answer", r.kind === "answer");
  check("truncate: text capped", r.kind === "answer" && r.text.length === 100);
  check("truncate: truncated=true", r.kind === "answer" && r.truncated === true);

  // 超长原始 JSON 文本 > raw 硬上限 → 截断后 JSON 残缺 → invalid + truncated（防 DoS）
  const hugeRaw = '{"kind":"answer","text":"' + "b".repeat(MAX_RESPONSE_RAW_LENGTH + 10) + '"}';
  const h = parse(okResponse(hugeRaw));
  check("truncate: huge raw → invalid", h.kind === "invalid");
  check("truncate: huge raw truncated flag", h.kind === "invalid" && h.truncated === true);
}

// ---------------------------------------------------------------------------
// Scenario 7: R-3 不信任字段（解析器不判定合法性）+ R-4 无执行（静态扫描）
// ---------------------------------------------------------------------------

function testNoJudgement() {
  // 解析器对「未声明 / 不允许 / 越域」工具一律照常产出 tool_calls（合法性交给 ActionValidator）
  const r = parse(
    okResponse(
      JSON.stringify({
        kind: "tool_calls",
        calls: [
          { tool: "evil_tool", arguments: { path: "C:/Windows/system32" } },
          { tool: "bash", arguments: { command: "rm -rf" } },
        ],
      })
    )
  );
  check("parser: no legality judgement", r.kind === "tool_calls" && r.calls.length === 2);
}

function testNoExecutionStatic() {
  const files = ["types.ts", "parser.ts", "index.ts"];
  const source = files
    .map((f) => fs.readFileSync(path.join(PARSER_DIR, f), "utf8"))
    .join("\n");

  // R-4 无执行：不 import fs / net / sdk；不调用工具
  check("parser: no import fs", !/from\s+["'](node:)?fs["']/.test(source));
  check("parser: no import http/net", !/from\s+["'](node:)?https?["']/.test(source));
  check("parser: no sdk import", !/from\s+["'][^"']*(@opencode|sdk)["']/.test(source));
  check("parser: no toolPort invoke", !/\.invoke\s*\(/.test(source));
  check("parser: no process.env", !/process\.env/.test(source));
  check("parser: no writeFile", !/writeFile|createWriteStream/.test(source));
  check("parser: no random/time", !/(Math\.random|Date\.now|setTimeout)/.test(source));
}

// ---------------------------------------------------------------------------
// Scenario 8: 面向对象包装 + 确定性
// ---------------------------------------------------------------------------

async function testOopAndDeterminism() {
  const parser = createResponseParser();
  check("oop: instance of ResponseParser", parser instanceof ResponseParser);
  check("oop: has parse()", typeof parser.parse === "function");

  const a = parser.parse(okResponse('{"kind":"answer","text":"same"}'));
  const b = parser.parse(okResponse('{"kind":"answer","text":"same"}'));
  check("determinism: identical output", JSON.stringify(a) === JSON.stringify(b));
}

// ---------------------------------------------------------------------------

async function main() {
  console.log("== 1. strict json (R-1) ==");
  testStrictJson();

  console.log("== 2. text mode ==");
  testTextMode();

  console.log("== 3. tool_calls shape (R-2) ==");
  testToolCallShape();

  console.log("== 4. checkpoint ==");
  testCheckpoint();

  console.log("== 5. model failure → invalid ==");
  testModelFailure();

  console.log("== 6. safe truncation (R-5) ==");
  testTruncation();

  console.log("== 7. no legality judgement (R-3) + no execution (R-4) ==");
  testNoJudgement();
  testNoExecutionStatic();

  console.log("== 8. oop wrapper + determinism ==");
  await testOopAndDeterminism();

  console.log("");
  console.log(`===== response-parser: ${passed}/${passed + failed} PASS =====`);
  if (failed > 0) process.exit(1);
}

main();