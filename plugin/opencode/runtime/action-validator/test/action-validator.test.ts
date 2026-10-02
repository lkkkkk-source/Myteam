/**
 * MyTeam OpenCode Plugin — Action Validator Test (action-validator.test.ts) — v1.8.4
 * ---------------------------------------------------------------------------
 * Phase 2 — 验证 ActionValidator（ParsedAgentResponse → ValidatedActions）。
 *
 * 覆盖（设计 §6.2 / §9.3）：
 *   1. 工具已声明 → context.tools 查找；未声明 → invalid_response。
 *   2. 来源一致（host/mcp）。
 *   3. 权限允许（allowed=false → tool_denied）。
 *   4. 安全域（allowed_paths / deny_paths → tool_denied）。
 *   5. 宿主配置黑名单（~/.config/opencode → tool_denied）。
 *   6. 参数形状（tool 非空 / arguments 对象）。
 *   7. Fail-Closed：任一拒绝 → 整批无 requests。
 *   8. answer / checkpoint / invalid 透传。
 *   9. 纯计算（静态扫描：无 fs / host-port / tool-adapter）。
 *
 * 跑法：bun plugin/opencode/runtime/action-validator/test/action-validator.test.ts
 * （工作目录 plugin/opencode）
 * ---------------------------------------------------------------------------
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { ActionValidator, createActionValidator, validate } from "../index";
import type { ParsedAgentResponse } from "../../response-parser/types";
import type { AgentExecutionContext } from "../../tool-bridge/context";

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
const VALIDATOR_DIR = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<AgentExecutionContext> = {}): AgentExecutionContext {
  return {
    agent_instance: {} as any,
    workspace: "C:/proj/acme",
    tools: [
      { tool: "read", source: "host", allowed: true, reason: "default" },
      { tool: "edit", source: "host", allowed: true, reason: "default" },
      { tool: "grep", source: "host", allowed: true, reason: "default" },
      { tool: "mcp:search", source: "mcp", allowed: true, reason: "default" },
      { tool: "bash", source: "host", allowed: false, reason: "execute denied" },
    ],
    permissions: { read: true, edit: true, execute: false } as any,
    mcp: [],
    skills: [],
    security: {
      host_config: "C:/Users/me/.config/opencode",
      myteam_home: "C:/myteam-home",
      allowed_paths: ["C:/proj/acme"],
      deny_paths: ["C:/proj/acme/.team/memory/private"],
    },
    persistence_target: "C:/proj/acme/.team/runtime/context/ctx.yaml",
    ...overrides,
  };
}

function calls(...items: unknown[]): ParsedAgentResponse {
  return { kind: "tool_calls", calls: items as any };
}

// ---------------------------------------------------------------------------
// Scenario 1: 工具已声明（§6.2-1）
// ---------------------------------------------------------------------------

function testDeclared() {
  const ctx = makeContext();
  const ok = validate(calls({ tool: "read", arguments: { path: "C:/proj/acme/a.ts" } }), ctx);
  check("declared: ok=true", ok.ok === true);
  check("declared: kind=tool_calls", ok.kind === "tool_calls");
  check("declared: 1 request", ok.ok && ok.requests.length === 1);
  check("declared: request.tool", ok.ok && ok.requests[0].tool === "read");
  check("declared: request.allowed=true", ok.ok && ok.requests[0].allowed === true);

  // 未声明 → invalid_response
  const bad = validate(calls({ tool: "rm_rf", arguments: { path: "C:/proj/acme" } }), ctx);
  check("undeclared: ok=false", bad.ok === false);
  check("undeclared: error_kind=invalid_response", !bad.ok && bad.error_kind === "invalid_response");
  check("undeclared: rejected=1", !bad.ok && bad.rejected.length === 1);
}

// ---------------------------------------------------------------------------
// Scenario 2: 来源一致（§6.2-2）
// ---------------------------------------------------------------------------

function testSource() {
  const ctx = makeContext();
  // mcp 工具：模型声明 source=mcp → 通过
  const ok = validate(calls({ tool: "mcp:search", source: "mcp", arguments: { q: "x" } }), ctx);
  check("source: mcp matches → ok", ok.ok === true);

  // host 工具：模型误声明 source=mcp → invalid_response
  const bad = validate(calls({ tool: "read", source: "mcp", arguments: { path: "C:/proj/acme/a.ts" } }), ctx);
  check("source: mismatch → ok=false", bad.ok === false);
  check("source: mismatch error_kind", !bad.ok && bad.error_kind === "invalid_response");

  // 模型未声明 source → 取声明来源（host）
  const unset = validate(calls({ tool: "read", arguments: { path: "C:/proj/acme/a.ts" } }), ctx);
  check("source: unset → uses declared host", unset.ok && unset.requests[0].source === "host");
}

// ---------------------------------------------------------------------------
// Scenario 3: 权限允许（§6.2-3）
// ---------------------------------------------------------------------------

function testAllowed() {
  const ctx = makeContext();
  const denied = validate(calls({ tool: "bash", arguments: { command: "ls" } }), ctx);
  check("allowed=false → ok=false", denied.ok === false);
  check("allowed=false → tool_denied", !denied.ok && denied.error_kind === "tool_denied");
  check("allowed=false → rejected reason mentions denied", !denied.ok && /denied/.test(denied.rejected[0].reason));
}

// ---------------------------------------------------------------------------
// Scenario 4: 安全域（§6.2-4）
// ---------------------------------------------------------------------------

function testSecurityDomain() {
  const ctx = makeContext();

  // 域内 → 通过
  const inDomain = validate(calls({ tool: "edit", arguments: { path: "C:/proj/acme/src/x.ts" } }), ctx);
  check("domain: inside allowed → ok", inDomain.ok === true);

  // 域外（allowed 之外）→ tool_denied
  const out = validate(calls({ tool: "read", arguments: { path: "C:/Windows/System32/drivers/etc/hosts" } }), ctx);
  check("domain: outside → ok=false", out.ok === false);
  check("domain: outside → tool_denied", !out.ok && out.error_kind === "tool_denied");
  check("domain: outside → rejected reason security", !out.ok && /security domain/.test(out.rejected[0].reason));

  // deny_paths 命中 → tool_denied
  const deny = validate(calls({ tool: "read", arguments: { path: "C:/proj/acme/.team/memory/private/secret.md" } }), ctx);
  check("domain: deny_paths hit → tool_denied", !deny.ok && deny.error_kind === "tool_denied");

  // 非路径参数（command / pattern）不受路径域约束
  const nonPath = validate(calls({ tool: "grep", arguments: { pattern: "foo", directory: "C:/proj/acme" } }), ctx);
  check("domain: non-path args unaffected", nonPath.ok === true);
}

// ---------------------------------------------------------------------------
// Scenario 5: 宿主配置黑名单（§6.2-5）
// ---------------------------------------------------------------------------

function testHostConfig() {
  const ctx = makeContext();
  const w = validate(
    calls({ tool: "edit", arguments: { path: "C:/Users/me/.config/opencode/opencode.json" } }),
    ctx
  );
  check("host-config: write blocked → tool_denied", !w.ok && w.error_kind === "tool_denied");
  check("host-config: rejected reason forbid", !w.ok && /host config/.test(w.rejected[0].reason));
}

// ---------------------------------------------------------------------------
// Scenario 6: 参数形状（§6.2-6）
// ---------------------------------------------------------------------------

function testArgumentShape() {
  const ctx = makeContext();
  const bad = validate(calls({ tool: "read", arguments: "not-an-object" } as any), ctx);
  check("shape: non-object args → invalid_response", !bad.ok && bad.error_kind === "invalid_response");

  const emptyTool = validate(calls({ tool: "  ", arguments: {} } as any), ctx);
  check("shape: empty tool → invalid_response", !emptyTool.ok && emptyTool.error_kind === "invalid_response");
}

// ---------------------------------------------------------------------------
// Scenario 7: Fail-Closed（§9.3 SX-6）
// ---------------------------------------------------------------------------

function testFailClosed() {
  const ctx = makeContext();
  // 混合：1 个合法 + 1 个未声明 + 1 个越域 → 整批拒绝，无 requests
  const mixed = validate(
    calls(
      { tool: "read", arguments: { path: "C:/proj/acme/a.ts" } },
      { tool: "ghost", arguments: {} },
      { tool: "read", arguments: { path: "C:/Windows/Temp/x" } }
    ),
    ctx
  );
  check("fail-closed: ok=false", mixed.ok === false);
  check("fail-closed: no requests field", !mixed.ok && !("requests" in mixed));
  check("fail-closed: rejected=2", !mixed.ok && mixed.rejected.length === 2);
  check("fail-closed: verdicts=3", !mixed.ok && mixed.verdicts.length === 3);

  // 纯 tool_denied 拒绝（越域）→ error_kind=tool_denied
  const denyOnly = validate(
    calls({ tool: "read", arguments: { path: "C:/Windows/Temp/x" } }),
    ctx
  );
  check("fail-closed: pure deny → tool_denied", !denyOnly.ok && denyOnly.error_kind === "tool_denied");
}

// ---------------------------------------------------------------------------
// Scenario 8: answer / checkpoint / invalid 透传
// ---------------------------------------------------------------------------

function testPassthrough() {
  const ctx = makeContext();

  const ans = validate({ kind: "answer", text: "done", artifacts: ["a.md"], truncated: false }, ctx);
  check("answer: ok=true", ans.ok === true && ans.kind === "answer");
  check("answer: text passthrough", ans.kind === "answer" && ans.answer.text === "done");
  check("answer: artifacts passthrough", ans.kind === "answer" && ans.answer.artifacts?.[0] === "a.md");

  const cp = validate({ kind: "checkpoint", message: "confirm?", options: ["y"] }, ctx);
  check("checkpoint: ok=true", cp.ok === true && cp.kind === "checkpoint");
  check("checkpoint: message", cp.kind === "checkpoint" && cp.checkpoint.message === "confirm?");

  const inv = validate({ kind: "invalid", reason: "bad json", errorKind: "invalid_response" }, ctx);
  check("invalid: ok=false", inv.ok === false && inv.kind === "invalid");
  check("invalid: reason passthrough", inv.kind === "invalid" && inv.reason === "bad json");
  check("invalid: error_kind passthrough", inv.kind === "invalid" && inv.error_kind === "invalid_response");
}

// ---------------------------------------------------------------------------
// Scenario 9: 纯计算（静态扫描）
// ---------------------------------------------------------------------------

function testPureComputationStatic() {
  const files = ["types.ts", "validator.ts", "index.ts"];
  const source = files
    .map((f) => fs.readFileSync(path.join(VALIDATOR_DIR, f), "utf8"))
    .join("\n");

  check("validator: no import fs", !/from\s+["'](node:)?fs["']/.test(source));
  check("validator: no host-port/tool-adapter import", !/from\s+["'][^"']*(host-port|tool-adapter)["']/.test(source));
  check("validator: no http/net", !/from\s+["'](node:)?https?["']/.test(source));
  check("validator: no toolPort invoke", !/\.invoke\s*\(/.test(source));
  check("validator: no writeFile", !/writeFile|createWriteStream/.test(source));
  check("validator: no Date.now/random", !/(Date\.now|Math\.random)/.test(source));
  check("validator: no mutation of ctx.tools", !/\.tools\s*=\s|\.allowed\s*=\s/.test(source));
}

// ---------------------------------------------------------------------------
// Scenario 10: 面向对象包装
// ---------------------------------------------------------------------------

function testOop() {
  const validator = createActionValidator();
  check("oop: instance of ActionValidator", validator instanceof ActionValidator);
  const ctx = makeContext();
  const r = validator.validate({
    parsed: calls({ tool: "read", arguments: { path: "C:/proj/acme/a.ts" } }),
    context: ctx,
  });
  check("oop: validate works", r.ok === true && r.kind === "tool_calls");
}

// ---------------------------------------------------------------------------

function main() {
  console.log("== 1. tool declared (6.2-1) ==");
  testDeclared();

  console.log("== 2. source consistency (6.2-2) ==");
  testSource();

  console.log("== 3. permission allowed (6.2-3) ==");
  testAllowed();

  console.log("== 4. security domain (6.2-4) ==");
  testSecurityDomain();

  console.log("== 5. host config blacklist (6.2-5) ==");
  testHostConfig();

  console.log("== 6. argument shape (6.2-6) ==");
  testArgumentShape();

  console.log("== 7. fail-closed (9.3 SX-6) ==");
  testFailClosed();

  console.log("== 8. answer/checkpoint/invalid passthrough ==");
  testPassthrough();

  console.log("== 9. pure computation (static scan) ==");
  testPureComputationStatic();

  console.log("== 10. oop wrapper ==");
  testOop();

  console.log("");
  console.log(`===== action-validator: ${passed}/${passed + failed} PASS =====`);
  if (failed > 0) process.exit(1);
}

main();