/**
 * MyTeam OpenCode Plugin — Tool Adapter Core Test (adapter.test.ts) — v1.7.3
 * ---------------------------------------------------------------------------
 * 验证 7 项（对齐任务范围）：
 *   1. allowed tool    — host 工具 allowed=true + 权限覆盖 → 下发宿主成功
 *   2. denied tool     — host 工具 allowed=false → assertion_error，不下发宿主
 *   3. security deny   — 路径越出 allowed / 命中 deny → assertion_error
 *   4. mcp missing     — source=mcp 但 ctx.mcp 无绑定 → tool_error
 *   5. error mapping   — 宿主失败 → mapHostError 归一（timeout/cancel/IO/拒绝写/兜底）
 *   6. no fs           — 静态：adapter 不 import node:fs；动态：invoke 不新增文件
 *   7. no host config  — 写宿主 opencode 配置 → 黑名单命中 → assertion_error
 *
 * 跑法：bun plugin/opencode/runtime/tool-adapter/test/adapter.test.ts
 * （工作目录 plugin/opencode）
 *
 * 约束：
 *   - hostPort 为 mock（不接真实宿主工具）；不启动 MCP；不实现 Trace。
 *   - 不修改 OpenCode 配置、不绕过 Tool Bridge、不触碰既有任何实现文件。
 * ---------------------------------------------------------------------------
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { AgentRun } from "../../runner/types";
import type { AgentRuntimeInstance } from "../../../agent-instance";
import type {
  ToolInvocationRequest,
  ToolInvocationResult,
} from "../../runner/types";
import type {
  AgentExecutionContext,
  ToolDeclaration,
} from "../../tool-bridge/context";
import type { McpCapability } from "../../tool-bridge/mcp-resolver";
import type { AgentPermission } from "../../tool-bridge/permission-resolver";

import {
  ToolAdapter,
  adapterInvoke,
  type HostToolPort,
} from "../adapter";
import { checkPermission } from "../permission-check";
import { mapMcpInvocation } from "../mcp-map";
import { mapHostError, type HostError } from "../error-map";
import {
  isHostConfigWrite,
  checkSecurityDomain,
} from "../security";

// ---------------------------------------------------------------------------
// 测试基建
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

let seq = 0;
function makeRun(over?: Partial<AgentRun>): AgentRun {
  seq++;
  const execution_id = `EX-${seq.toString().padStart(3, "0")}`;
  return {
    execution_id,
    agent_instance_id: `${execution_id}:coder`,
    status: "running",
    input: "do the task",
    output: "",
    started: new Date().toISOString(),
    ...over,
  };
}

function makeInstance(execution_id: string): AgentRuntimeInstance {
  return {
    id: `${execution_id}:coder`,
    agent: "coder",
    role: "code agent",
    prompt_source: "D:/data/code/Agent/MyTeam/agents/coder.md",
    workspace: "D:/data/code/Agent/MyTeam",
    memory_namespace: "D:/data/code/Agent/MyTeam/.team/memory/agents/coder",
    execution_id,
    permissions: ["read", "edit", "execute"],
    status: "bound",
    instance_dir: `D:/data/code/Agent/MyTeam/.team/runtime/agent-instance/${execution_id}/coder`,
  };
}

function makePermissions(over?: Partial<AgentPermission>): AgentPermission {
  return { read: true, edit: true, execute: true, ...over };
}

function makeContext(over?: {
  tools?: ToolDeclaration[];
  permissions?: AgentPermission;
  mcp?: McpCapability[];
}): AgentExecutionContext {
  return {
    schema_version: 1,
    layer: "tool-bridge-context",
    agent_instance: makeInstance("EX-000"),
    workspace: "D:/data/code/Agent/MyTeam",
    tools: over?.tools ?? [
      { tool: "read", allowed: true, source: "host", reason: "dev can read" },
      { tool: "write", allowed: true, source: "host", reason: "dev can write" },
      { tool: "bash", allowed: true, source: "host", reason: "dev can execute" },
      { tool: "mcp:context7:query", allowed: true, source: "mcp", reason: "mcp bound" },
    ],
    permissions: over?.permissions ?? makePermissions(),
    mcp: over?.mcp ?? [
      {
        mcp: "context7",
        provides: ["docs"],
        capabilities: ["query", "resolve"],
      },
    ],
    skills: [],
    security: {
      allowed_paths: ["D:/data/code/Agent/MyTeam"],
      deny_paths: ["C:/Users/Administrator/.config/opencode"],
      host_config: "C:/Users/Administrator/.config/opencode/opencode.json",
      myteam_home: "C:/Users/Administrator/.myteam",
    },
    persistence_target: "D:/data/code/Agent/MyTeam/.team/execution-context",
  };
}

function makeRequest(over?: Partial<ToolInvocationRequest>): ToolInvocationRequest {
  return {
    tool: "read",
    source: "host",
    arguments: { filePath: "D:/data/code/Agent/MyTeam/bridge.ts" },
    allowed: true,
    security: {
      allowed_paths: ["D:/data/code/Agent/MyTeam"],
      deny_paths: ["C:/Users/Administrator/.config/opencode"],
      host_config: "C:/Users/Administrator/.config/opencode/opencode.json",
    },
    ...over,
  };
}

/** 可控 mock 宿主端口：不接真实宿主工具，可记录调用 / 注入失败。 */
class MockHostPort implements HostToolPort {
  calls: ToolInvocationRequest[] = [];
  lastOpts: { mcp?: { server: string; method: string; args: Record<string, unknown> } }[] = [];
  nextResult: ToolInvocationResult | { hostError: HostError } | (() => unknown) =
    { ok: true, value: "host-ok", duration: 0 };

  async invoke(
    req: ToolInvocationRequest,
    opts: { mcp?: { server: string; method: string; args: Record<string, unknown> } }
  ): Promise<ToolInvocationResult> {
    this.calls.push(req);
    this.lastOpts.push(opts);
    const r = this.nextResult;
    if (typeof r === "function") {
      this.nextResult = { ok: true, value: "host-ok", duration: 0 };
      return r() as ToolInvocationResult;
    }
    if ("hostError" in r) {
      this.nextResult = { ok: true, value: "host-ok", duration: 0 };
      const he = r.hostError;
      return {
        ok: false,
        error: he.message,
        error_code: he.code,
        duration: 0,
      };
    }
    this.nextResult = { ok: true, value: "host-ok", duration: 0 };
    return r;
  }
}

const NOW_BASE = 1_700_000_000_000;
const nowFn = (() => {
  let t = NOW_BASE;
  return () => (t += 100);
})();

// ---------------------------------------------------------------------------
// 1. allowed tool
// ---------------------------------------------------------------------------

async function testAllowedTool() {
  const ctx = makeContext();
  const port = new MockHostPort();
  const adapter = new ToolAdapter(ctx, { hostPort: port, now: nowFn });

  const req = makeRequest({ tool: "read", source: "host", allowed: true });
  const res = await adapter.invoke(req);

  check("allowed tool returns ok", res.ok === true, `ok=${res.ok}`);
  check("allowed tool forwarded to host exactly once", port.calls.length === 1, `calls=${port.calls.length}`);
  check("allowed tool value propagated", res.value === "host-ok");
  check("allowed tool no error_kind on success", res.error_kind === undefined);

  // 验证权限矩阵：read 工具需 permissions.read=true
  const ctxNoRead = makeContext({ permissions: makePermissions({ read: false }) });
  const port2 = new MockHostPort();
  const res2 = await adapterInvoke(req, ctxNoRead, { hostPort: port2, now: nowFn });
  check("read denied when permission.read=false", res2.ok === false && res2.error_kind === "assertion_error");
  check("read denied: host not called", port2.calls.length === 0, `calls=${port2.calls.length}`);
}

// ---------------------------------------------------------------------------
// 2. denied tool
// ---------------------------------------------------------------------------

async function testDeniedTool() {
  const ctx = makeContext({
    tools: [
      { tool: "write", allowed: false, source: "host", reason: "denied" },
    ],
  });
  const port = new MockHostPort();
  const adapter = new ToolAdapter(ctx, { hostPort: port, now: nowFn });

  const req = makeRequest({ tool: "write", source: "host", allowed: false });
  const res = await adapter.invoke(req);

  check("denied tool returns assertion_error", res.ok === false && res.error_kind === "assertion_error");
  check("denied tool: host not called", port.calls.length === 0, `calls=${port.calls.length}`);
  check("denied tool: reason mentions not allowed", /not allowed/i.test(res.error ?? ""));

  // 未声明工具
  const ctxNoTool = makeContext({ tools: [] });
  const port3 = new MockHostPort();
  const res3 = await adapterInvoke(makeRequest({ tool: "write", allowed: true }), ctxNoTool, { hostPort: port3, now: nowFn });
  check("undeclared tool → assertion_error (capability)", res3.ok === false && res3.error_kind === "assertion_error");
  check("undeclared tool: host not called", port3.calls.length === 0, `calls=${port3.calls.length}`);
}

// ---------------------------------------------------------------------------
// 3. security deny
// ---------------------------------------------------------------------------

async function testSecurityDeny() {
  // 路径不在 allowed_paths
  const ctx = makeContext();
  const port = new MockHostPort();
  const reqOutside = makeRequest({
    tool: "read",
    source: "host",
    arguments: { filePath: "D:/other/project/file.ts" },
    allowed: true,
  });
  const res1 = await adapterInvoke(reqOutside, ctx, { hostPort: port, now: nowFn });
  check("path outside allowed → assertion_error", res1.ok === false && res1.error_kind === "assertion_error");
  check("path outside allowed: host not called", port.calls.length === 0, `calls=${port.calls.length}`);

  // 路径命中 deny_paths
  const port2 = new MockHostPort();
  const reqDeny = makeRequest({
    tool: "write",
    source: "host",
    arguments: { filePath: "C:/Users/Administrator/.config/opencode/opencode.json" },
    allowed: true,
  });
  const res2 = await adapterInvoke(reqDeny, ctx, { hostPort: port2, now: nowFn });
  check("path in deny domain → assertion_error", res2.ok === false && res2.error_kind === "assertion_error");
  check("deny domain: host not called", port2.calls.length === 0, `calls=${port2.calls.length}`);
}

// ---------------------------------------------------------------------------
// 4. mcp missing
// ---------------------------------------------------------------------------

async function testMcpMissing() {
  // ctx.mcp 为空（未绑定）
  const ctxNoMcp = makeContext({ mcp: [] });
  const port = new MockHostPort();
  const req = makeRequest({
    tool: "mcp:context7:query",
    source: "mcp",
    arguments: { query: "opencode docs" },
    allowed: true,
  });
  const res = await adapterInvoke(req, ctxNoMcp, { hostPort: port, now: nowFn });
  check("mcp missing → tool_error", res.ok === false && res.error_kind === "tool_error");
  check("mcp missing: host not called", port.calls.length === 0, `calls=${port.calls.length}`);
  check("mcp missing: reason mentions not found in ctx.mcp", /not found in ctx\.mcp/i.test(res.error ?? ""));

  // mcp 已绑定 + 映射成功
  const ctxWithMcp = makeContext();
  const port2 = new MockHostPort();
  const res2 = await adapterInvoke(req, ctxWithMcp, { hostPort: port2, now: nowFn });
  check("mcp bound → ok", res2.ok === true);
  const mcpOpts = port2.lastOpts[0]?.mcp;
  check("mcp mapping: server=context7", mcpOpts?.server === "context7");
  check("mcp mapping: method=query", mcpOpts?.method === "query");
  check("mcp mapping: args carried", mcpOpts?.args["query"] === "opencode docs");

  // mapMcpInvocation 直接断言
  const m = mapMcpInvocation(req, ctxWithMcp.mcp);
  check("mapMcpInvocation: mcp=true + invocation", m.mcp === true && m.invocation !== undefined);
  const mMiss = mapMcpInvocation(req, []);
  check("mapMcpInvocation: missing server → mcp=false", mMiss.mcp === false);
}

// ---------------------------------------------------------------------------
// 5. error mapping
// ---------------------------------------------------------------------------

function testErrorMapping() {
  // 宿主 IO 错误 → tool_error（可重试）
  const io = mapHostError({ code: "ENOENT", message: "no such file" });
  check("host IO error → tool_error (retryable)", io.kind === "tool_error" && io.retryable === true);

  // 宿主拒绝写（guardHostWrite）→ assertion_error（不可重试）
  const rej = mapHostError({ message: "host write rejected", hostRejectWrite: true });
  check("host reject write → assertion_error (not retryable)", rej.kind === "assertion_error" && rej.retryable === false);

  // 宿主超时 → timeout
  const to = mapHostError({ message: "host timeout", timeout: true });
  check("host timeout → timeout", to.kind === "timeout" && to.retryable === false);

  // 取消 → cancel
  const cx = mapHostError({ message: "cancelled", cancelled: true });
  check("host cancel → cancel", cx.kind === "cancel" && cx.retryable === false);

  // MCP 不可达 → tool_error（可重试）
  const mcpTo = mapHostError({ code: "EHOSTUNREACH", message: "mcp down" });
  check("mcp unreachable → tool_error (retryable)", mcpTo.kind === "tool_error" && mcpTo.retryable === true);

  // 参数 schema 拒绝 → tool_error（不可重试）
  const bad = mapHostError({ code: "EINVALID_ARG", message: "bad arg" });
  check("arg rejected → tool_error (not retryable)", bad.kind === "tool_error" && bad.retryable === false);

  // 兜底：非标准 → agent_error
  const unknown = mapHostError({ message: "weird host crash" });
  check("unknown host error → agent_error (fallback)", unknown.kind === "agent_error");

  // adapter 端：宿主返回 ok=false → 归一
  const ctx = makeContext();
  const port = new MockHostPort();
  port.nextResult = { hostError: { message: "host tool failed", code: "ENOENT" } };
  const res = adapterInvoke(makeRequest({ tool: "read" }), ctx, { hostPort: port, now: nowFn });
  res.then((r) => {
    check("adapter: host ok=false → tool_error kind", r.ok === false && r.error_kind === "tool_error");
  });
}

// ---------------------------------------------------------------------------
// 6. no fs
// ---------------------------------------------------------------------------

async function testNoFilesystem() {
  // 静态：adapter 相关模块不 import node:fs
  const files = [
    "adapter.ts",
    "permission-check.ts",
    "mcp-map.ts",
    "error-map.ts",
    "security.ts",
    "index.ts",
  ];
  const dir = path.join(process.cwd(), "runtime", "tool-adapter");
  let fsImportFound = false;
  for (const f of files) {
    const content = fs.readFileSync(path.join(dir, f), "utf8");
    if (/from\s+["']node:fs["']|require\(["']node:fs["']\)/.test(content)) {
      fsImportFound = true;
      break;
    }
  }
  check("no node:fs import in adapter modules", fsImportFound === false);

  // 动态：invoke 前 / 后 项目目录文件数不变（Adapter 不写盘）
  const projectDir = "D:/data/code/Agent/MyTeam";
  const countFiles = (d: string): number => {
    let n = 0;
    const walk = (p: string): void => {
      const entries = fs.readdirSync(p, { withFileTypes: true });
      for (const e of entries) {
        const fp = path.join(p, e.name);
        if (e.isDirectory()) walk(fp);
        else n++;
      }
    };
    walk(d);
    return n;
  };
  const before = countFiles(projectDir);
  const ctx = makeContext();
  const port = new MockHostPort();
  const adapter = new ToolAdapter(ctx, { hostPort: port, now: nowFn });
  await adapter.invoke(makeRequest({ tool: "read" }));
  const after = countFiles(projectDir);
  check("invoke() adds no files to project dir", before === after, `before=${before} after=${after}`);
}

// ---------------------------------------------------------------------------
// 7. no host config write
// ---------------------------------------------------------------------------

function testNoHostConfigWrite() {
  // 黑名单判定
  check("host config write blocked: opencode.json", isHostConfigWrite("C:/Users/Administrator/.config/opencode/opencode.json") === true);
  check("host config write blocked: opencode dir", isHostConfigWrite("C:/Users/Administrator/.config/opencode/") === true);
  check("host config NOT blocked: project path", isHostConfigWrite("D:/data/code/Agent/MyTeam/bridge.ts") === false);

  // checkSecurityDomain 命中黑名单
  const reqDeny = makeRequest({
    tool: "write",
    source: "host",
    arguments: { filePath: "C:/Users/Administrator/.config/opencode/opencode.json" },
    allowed: true,
  });
  const denyResult = checkSecurityDomain(reqDeny);
  check("checkSecurityDomain: host config write rejected", denyResult !== null && /host config write blocked/i.test(denyResult));

  // 合法路径通过
  const reqOk = makeRequest({
    tool: "write",
    source: "host",
    arguments: { filePath: "D:/data/code/Agent/MyTeam/.team/x.json" },
    allowed: true,
  });
  const okResult = checkSecurityDomain(reqOk);
  check("checkSecurityDomain: in-domain path passes", okResult === null);
}

// ---------------------------------------------------------------------------
// 主
// ---------------------------------------------------------------------------

async function main() {
  console.log("===== Tool Adapter Core (v1.7.3) =====\n");
  console.log("[1] allowed tool");
  await testAllowedTool();
  console.log("\n[2] denied tool");
  await testDeniedTool();
  console.log("\n[3] security deny");
  await testSecurityDeny();
  console.log("\n[4] mcp missing");
  await testMcpMissing();
  console.log("\n[5] error mapping");
  await testErrorMapping();
  await new Promise((r) => setTimeout(r, 20));
  console.log("\n[6] no fs");
  await testNoFilesystem();
  console.log("\n[7] no host config write");
  testNoHostConfigWrite();

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
