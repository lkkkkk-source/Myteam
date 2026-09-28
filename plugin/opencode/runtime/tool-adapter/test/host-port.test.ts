/**
 * MyTeam OpenCode Plugin — Tool Adapter · Host Port Test (host-port.test.ts) — v1.7.3
 * ---------------------------------------------------------------------------
 * 验证 OpenCodeHostPort（host-port/host-port.ts）：
 *
 *   1. read tool        -> OpenCode file.read 路由 + 成功响应
 *   2. glob tool        -> OpenCode find.files 路由
 *   3. grep tool        -> OpenCode find.text 路由
 *   4. write tool       -> 只读通道拦截（ok=false, error_kind=assertion_error）
 *   5. mcp tool         -> OpenCode MCP API 路由（client.mcp.invoke）
 *   6. host error       -> 非 2xx 响应归一（mapHostError / RunnerErrorKind）
 *   7. capability missing -> 宿主 API 未注入 -> agent_error
 *   8. unknown tool     -> 未知工具名 -> agent_error
 *   9. no fs / no write -> 静态验证：host-port 不 import node:fs
 *  10. argument error   -> 缺失必需参数 -> tool_error（不可重试）
 *
 * 跑法：bun plugin/opencode/runtime/tool-adapter/test/host-port.test.ts
 * （工作目录 plugin/opencode）
 *
 * 约束：
 *   - 不接真实宿主工具（mock OpenCodeClientSubset）；
 *   - 不启动 MCP；
 *   - 不修改 OpenCode 配置。
 * ---------------------------------------------------------------------------
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type {
  ToolInvocationRequest,
  ToolInvocationResult,
  RunnerErrorKind,
} from "../../runner/types";
import {
  OpenCodeHostPort,
  createOpenCodeHostPort,
  type OpenCodeClientSubset,
  type OpenCodeFileClient,
  type OpenCodeFindClient,
  type OpenCodeMcpClient,
} from "../host-port/host-port";

// ---------------------------------------------------------------------------
// 测试基建
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string): void {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}`);
  }
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
  } as ToolInvocationRequest;
}

// ---------------------------------------------------------------------------
// Mock OpenCodeClientSubset
// ---------------------------------------------------------------------------

/** 可控 mock File client。 */
class MockFileClient implements OpenCodeFileClient {
  lastReadQuery: unknown = null;
  nextResponse: { data?: unknown; response?: unknown } = { data: { type: "file", content: "test" } };
  failNext = false;

  async read(opts: { query: { path: string; directory?: string } }): Promise<{
    data?: { type: string; content: string; diff?: string; patch?: unknown };
    response?: unknown;
  }> {
    this.lastReadQuery = opts.query;
    if (this.failNext) {
      this.failNext = false;
      return { response: { status: 500 } };
    }
    return this.nextResponse as {
      data?: { type: string; content: string; diff?: string; patch?: unknown };
      response?: unknown;
    };
  }

  async list?(opts: {
    query: { path: string; directory?: string };
  }): Promise<{
    data?: Array<{ name: string; path: string; absolute: string; type: string; ignored?: boolean }>;
    response?: unknown;
  }> {
    return { data: [{ name: "test.ts", path: "D:/data/code/test.ts", absolute: "D:/data/code/test.ts", type: "file" }] };
  }
}

/** 可控 mock Find client。 */
class MockFindClient implements OpenCodeFindClient {
  async files?(opts: {
    query: { query: string; directory?: string; dirs?: "true" | "false" };
  }): Promise<{ data?: string[]; response?: unknown }> {
    return { data: ["D:/data/code/Agent/MyTeam/bridge.ts"] };
  }

  async text?(opts: {
    query: { pattern: string; directory?: string };
  }): Promise<{ data?: Array<{ path: string; line?: number; text?: string }>; response?: unknown }> {
    return { data: [{ path: "D:/data/code/Agent/MyTeam/bridge.ts", line: 1, text: "match" }] };
  }

  async symbols?(opts: {
    query: { query: string; directory?: string };
  }): Promise<{ data?: Array<{ name: string; kind?: string; path?: string }>; response?: unknown }> {
    return { data: [{ name: "MyTeamPlugin", kind: "function", path: "D:/data/code/Agent/MyTeam/index.ts" }] };
  }
}

/** 可控 mock MCP client。 */
class MockMcpClient implements OpenCodeMcpClient {
  lastServer = "";
  lastMethod = "";
  lastArgs: Record<string, unknown> = {};
  nextError: Error | null = null;

  async invoke(server: string, method: string, args: Record<string, unknown>): Promise<unknown> {
    this.lastServer = server;
    this.lastMethod = method;
    this.lastArgs = args;
    if (this.nextError) {
      const e = this.nextError;
      this.nextError = null;
      throw e;
    }
    return { mcpResult: true, server, method };
  }

  async status?(server?: string): Promise<unknown> {
    return { status: "connected" };
  }
}

function makeMockClient(over?: {
  fileFailNext?: boolean;
  mcp?: MockMcpClient;
}): OpenCodeClientSubset {
  const fileClient = new MockFileClient();
  if (over?.fileFailNext) fileClient.failNext = true;
  return {
    file: fileClient,
    find: new MockFindClient(),
    path: { get: async () => ({ data: { directory: "D:/data/code/Agent/MyTeam" } }) },
    mcp: over?.mcp ?? new MockMcpClient(),
  };
}

const WORKSPACE = "D:/data/code/Agent/MyTeam";

// ---------------------------------------------------------------------------
// 测试用例
// ---------------------------------------------------------------------------

async function test1_readSuccess(): Promise<void> {
  console.log("\n[1] read tool -> file.read success");
  const client = makeMockClient();
  const port = createOpenCodeHostPort(client, WORKSPACE);
  const req = makeRequest({ tool: "read", source: "host", arguments: { filePath: "D:/data/code/Agent/MyTeam/bridge.ts" } });
  const res: ToolInvocationResult = await port.invoke(req);

  assert(res.ok === true, "ok=true on success");
  assert(res.duration >= 0, "duration is non-negative");
  assert(res.error_kind === undefined, "no error_kind on success");
  assert(res.error === undefined, "no error on success");
  assert(
    typeof res.value === "object" && (res.value as { type?: string })?.type === "file",
    "value is file.read data"
  );
}

async function test2_readHostError(): Promise<void> {
  console.log("\n[2] read tool -> host 500 -> tool_error");
  const client = makeMockClient({ fileFailNext: true });
  const port = createOpenCodeHostPort(client, WORKSPACE);
  const req = makeRequest({ tool: "read", source: "host", arguments: { filePath: "D:/data/code/Agent/MyTeam/bridge.ts" } });
  const res: ToolInvocationResult = await port.invoke(req);

  assert(res.ok === false, "ok=false on host error");
  assert(res.error_kind === "tool_error", "error_kind=tool_error");
  assert(res.error_code === "500", "error_code=500");
}

async function test3_globSuccess(): Promise<void> {
  console.log("\n[3] glob tool -> find.files success");
  const client = makeMockClient();
  const port = createOpenCodeHostPort(client, WORKSPACE);
  const req = makeRequest({ tool: "glob", source: "host", arguments: { pattern: "**/*.ts", directory: WORKSPACE } });
  const res: ToolInvocationResult = await port.invoke(req);

  assert(res.ok === true, "ok=true");
  assert(Array.isArray(res.value), "value is array");
}

async function test4_grepSuccess(): Promise<void> {
  console.log("\n[4] grep tool -> find.text success");
  const client = makeMockClient();
  const port = createOpenCodeHostPort(client, WORKSPACE);
  const req = makeRequest({ tool: "grep", source: "host", arguments: { pattern: "bridge", directory: WORKSPACE } });
  const res: ToolInvocationResult = await port.invoke(req);

  assert(res.ok === true, "ok=true");
  assert(Array.isArray(res.value), "value is array of matches");
}

async function test5_writeBlocked(): Promise<void> {
  console.log("\n[5] write tool -> read-only channel block");
  const client = makeMockClient();
  const port = createOpenCodeHostPort(client, WORKSPACE);
  const req = makeRequest({
    tool: "write",
    source: "host",
    arguments: { filePath: "D:/data/code/Agent/MyTeam/bridge.ts", content: "test" },
  });
  const res: ToolInvocationResult = await port.invoke(req);

  assert(res.ok === false, "ok=false (write not dispatched)");
  assert(res.error_kind === "assertion_error", "error_kind=assertion_error");
  assert(res.error_code === "EREAD_ONLY_CHANNEL", "error_code=EREAD_ONLY_CHANNEL");
  assert(
    typeof res.error === "string" && res.error.includes("read-only channel"),
    "error message mentions read-only channel"
  );
}

async function test6_mcpSuccess(): Promise<void> {
  console.log("\n[6] mcp tool -> client.mcp.invoke success");
  const mcp = new MockMcpClient();
  const client = makeMockClient({ mcp });
  const port = createOpenCodeHostPort(client, WORKSPACE);
  const req = makeRequest({
    tool: "mcp:context7:query",
    source: "mcp",
    arguments: {},
  });
  const opts = { mcp: { server: "context7", method: "query", args: { libraryId: "/opencode", query: "config" } } };
  const res: ToolInvocationResult = await port.invoke(req, opts);

  assert(res.ok === true, "ok=true");
  assert(
    typeof res.value === "object" && (res.value as { mcpResult?: boolean })?.mcpResult === true,
    "value is mcp result"
  );
  assert(mcp.lastServer === "context7", "mcp server passed correctly");
  assert(mcp.lastMethod === "query", "mcp method passed correctly");
}

async function test7_mcpMissing(): Promise<void> {
  console.log("\n[7] mcp tool -> missing mcp payload -> tool_error");
  const client = makeMockClient();
  const port = createOpenCodeHostPort(client, WORKSPACE);
  const req = makeRequest({ tool: "mcp:context7:query", source: "mcp", arguments: {} });
  const res: ToolInvocationResult = await port.invoke(req, {});

  assert(res.ok === false, "ok=false");
  assert(res.error_kind === "tool_error", "error_kind=tool_error");
  assert(
    typeof res.error === "string" && res.error.includes("mcp invocation payload missing"),
    "error mentions missing mcp payload"
  );
}

async function test8_mcpError(): Promise<void> {
  console.log("\n[8] mcp tool -> mcp.invoke throws -> normalized error");
  const mcp = new MockMcpClient();
  const connErr = new Error("mcp server unreachable: ECONNREFUSED");
  (connErr as unknown as { code: string }).code = "ECONNREFUSED";
  mcp.nextError = connErr;
  const client = makeMockClient({ mcp });
  const port = createOpenCodeHostPort(client, WORKSPACE);
  const req = makeRequest({ tool: "mcp:context7:query", source: "mcp", arguments: {} });
  const opts = { mcp: { server: "context7", method: "query", args: {} } };
  const res: ToolInvocationResult = await port.invoke(req, opts);

  assert(res.ok === false, "ok=false");
  assert(res.error_kind === "tool_error", "error_kind=tool_error (ECONNREFUSED)");
  assert(res.error_code === "ECONNREFUSED", "error_code=ECONNREFUSED");
}

async function test9_unknownTool(): Promise<void> {
  console.log("\n[9] unknown tool -> agent_error (capability)");
  const client = makeMockClient();
  const port = createOpenCodeHostPort(client, WORKSPACE);
  const req = makeRequest({ tool: "execute", source: "host", arguments: { command: "echo" } });
  const res: ToolInvocationResult = await port.invoke(req);

  assert(res.ok === false, "ok=false");
  assert(res.error_kind === "agent_error", "error_kind=agent_error");
  assert(
    typeof res.error === "string" && res.error.includes("unknown tool"),
    "error mentions unknown tool"
  );
}

async function test10_capabilityMissing(): Promise<void> {
  console.log("\n[10] missing file client -> agent_error");
  const client: OpenCodeClientSubset = { find: new MockFindClient() };
  const port = createOpenCodeHostPort(client, WORKSPACE);
  const req = makeRequest({ tool: "read", source: "host", arguments: { filePath: "test.ts" } });
  const res: ToolInvocationResult = await port.invoke(req);

  assert(res.ok === false, "ok=false");
  assert(res.error_kind === "agent_error", "error_kind=agent_error (host API unavailable)");
}

async function test11_argumentError(): Promise<void> {
  console.log("\n[11] read tool missing filePath -> tool_error (EINVALID_ARG)");
  const client = makeMockClient();
  const port = createOpenCodeHostPort(client, WORKSPACE);
  const req = makeRequest({ tool: "read", source: "host", arguments: {} });
  const res: ToolInvocationResult = await port.invoke(req);

  assert(res.ok === false, "ok=false");
  assert(res.error_kind === "tool_error", "error_kind=tool_error");
  assert(res.error_code === "EINVALID_ARG", "error_code=EINVALID_ARG");
}

async function test12_pathGet(): Promise<void> {
  console.log("\n[12] path tool -> path.get success");
  const client = makeMockClient();
  const port = createOpenCodeHostPort(client, WORKSPACE);
  const req = makeRequest({ tool: "path", source: "host", arguments: {} });
  const res: ToolInvocationResult = await port.invoke(req);

  assert(res.ok === true, "ok=true");
  assert(
    typeof res.value === "object" && (res.value as { directory?: string })?.directory === WORKSPACE,
    "value is path.get data"
  );
}

async function test13_noFsImport(): Promise<void> {
  console.log("\n[13] static: host-port does not import node:fs");
  const hostPortPath = path.join(
    "D:/data/code/Agent/MyTeam/plugin/opencode/runtime/tool-adapter/host-port/host-port.ts"
  );
  const source = fs.readFileSync(hostPortPath, "utf8");
  assert(!source.includes('from "node:fs"') && !source.includes("from 'node:fs'"), "no node:fs import");
  assert(!source.includes("fs."), "no fs. usage");
}

async function test14_symbolsSuccess(): Promise<void> {
  console.log("\n[14] symbols tool -> find.symbols success");
  const client = makeMockClient();
  const port = createOpenCodeHostPort(client, WORKSPACE);
  const req = makeRequest({ tool: "symbols", source: "host", arguments: { query: "MyTeam", directory: WORKSPACE } });
  const res: ToolInvocationResult = await port.invoke(req);

  assert(res.ok === true, "ok=true");
  assert(Array.isArray(res.value), "value is array");
}

async function test15_listSuccess(): Promise<void> {
  console.log("\n[15] list tool -> file.list success");
  const client = makeMockClient();
  const port = createOpenCodeHostPort(client, WORKSPACE);
  const req = makeRequest({ tool: "list", source: "host", arguments: { path: WORKSPACE } });
  const res: ToolInvocationResult = await port.invoke(req);

  assert(res.ok === true, "ok=true");
  assert(Array.isArray(res.value), "value is array of file nodes");
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== MyTeam Plugin · Tool Adapter · Host Port Test ===");
  console.log("File: runtime/tool-adapter/host-port/host-port.ts");
  console.log("");

  await test1_readSuccess();
  await test2_readHostError();
  await test3_globSuccess();
  await test4_grepSuccess();
  await test5_writeBlocked();
  await test6_mcpSuccess();
  await test7_mcpMissing();
  await test8_mcpError();
  await test9_unknownTool();
  await test10_capabilityMissing();
  await test11_argumentError();
  await test12_pathGet();
  await test13_noFsImport();
  await test14_symbolsSuccess();
  await test15_listSuccess();

  console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Test run error:", e);
  process.exit(1);
});
