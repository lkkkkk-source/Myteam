# Tool Adapter Core — v1.7.3 实现报告

> 范围：`plugin/opencode/runtime/tool-adapter/`（新增）+ Runner 最小补丁。
> 设计基准：`D:\data\code\Agent\MyTeam\evolution\v1.7.3\docs\02-Tool-Adapter-Core.md` §1–§6。
> 验证：`bun runtime/tool-adapter/test/adapter.test.ts` = 39/39；Runner 回归 49/49；Tool Bridge 回归 22/22；U+FFFD 扫描 0 命中。

## 1. 交付物

| 文件 | 职责（对应设计章节） | 行数 |
|---|---|---|
| `tool-adapter/permission-check.ts` | §3 二次验证：agent permission / tool capability / security domain / mcp binding 四项断言 | 183 |
| `tool-adapter/mcp-map.ts` | §4 MCP 映射：`mcp:<server>:<method>` → `{ server, method, args }` | 79 |
| `tool-adapter/error-map.ts` | §5 宿主错误 → RunnerErrorKind 归一（含 retryable 语义） | 113 |
| `tool-adapter/security.ts` | §6 安全域 + 宿主配置黑名单（home / opencode 配置） | 89 |
| `tool-adapter/adapter.ts` | §2 ToolAdapter：invoke() 编排 = 二次校验 → 安全域 → MCP 映射 → 宿主下发(mock) → 错误归一 | 162 |
| `tool-adapter/index.ts` | 模块出口（汇总 5 个文件 + 类型） | 46 |
| `tool-adapter/test/adapter.test.ts` | 7 项验收（allowed / denied / security deny / mcp missing / error mapping / no fs / no host config write） | ~380 |
| `runner/types.ts`（最小补丁） | `ToolInvocationResult` 增可选字段 `error_kind?: RunnerErrorKind`、`error_code?: string` | +5 |
| `runner/runner.ts`（最小补丁） | `invokeTool` 重试循环尊重 `error_kind`：`assertion_error` 立即抛、不重试 | ~+3 |

## 2. 设计 → 实现映射

### §1 定位（无新代码，仅约束）
- Adapter 即 Runner 的 `ToolInvocationPort` 真实实现：`adapter.ts` 的 `ToolAdapter.invoke()` 签名与 `ToolInvocationPort.invoke(request: ToolInvocationRequest): Promise<ToolInvocationResult>` 完全一致，Runner 可直接注入替换 v1.7.1 的 mock。
- `HostToolPort` 接口由调用方注入；本阶段 mock（`adapter.test.ts` 的 `MockHostPort`），未来接真实宿主工具 / MCP client。

### §2 ToolAdapter 接口
- `adapterInvoke(req, ctx, deps)` 与 `ToolAdapter` 类：Runner → ToolAdapter → hostPort（本阶段 mock）→ 宿主工具/MCP。
- 单向边界：Adapter 只读 `AgentExecutionContext`，不修改 Tool Bridge 产物；`invoke()` 不向宿主回写状态。

### §3 Permission Enforcement 二次验证
- `checkPermission(req, ctx)` 实现 4 项：
  1. **tool capability** — `ctx.tools` 中存在 `tool+source` 匹配项且 `allowed=true`；未声明或 denied → `assertion_error`（不下发）。
  2. **agent permission** — 由 `TOOL_ACTION_MAP` 把工具名映射到 `read/edit/execute`，与 `ctx.permissions` 比对；`permissions.read=false` 时 read 工具被拒。
  3. **security domain** — 路径类参数（`/read|write|edit|path/i` 命中的字符串参数）须 ∈ `allowed_paths` 且 ∉ `deny_paths`；越域 → `assertion_error`。
  4. **mcp binding** — `source=mcp` 时 `ctx.mcp` 须含匹配 server；缺失 → `tool_error`（§4 映射失败语义）。
- 任一失败：`PermissionVerdict{ok:false, kind, reason}` → `adapterInvoke` 立即返回带 `error_kind` 的失败结果，**不发起宿主调用**。

### §4 MCP Mapping
- `mapMcpInvocation(req, mcp[])`：
  - `mcpServerOf("mcp:context7:query")` → `"context7"`；`mcpMethodOf(...)` → `"query"`。
  - 命中 `ctx.mcp` → `{ mcp:true, invocation:{ server, method, args } }`。
  - 未命中 → `{ mcp:false, reason:"mcp binding: server \"X\" not found in ctx.mcp" }` → `tool_error`（不下发）。
  - 不启动 / 不管理 MCP 进程（生命周期归宿主）；`hostPort.invoke(req, { mcp })` 把载荷传给宿主 mock。

### §5 OpenCode error → RunnerError 归一
- `mapHostError(HostError)` 按设计分类表输出 `{ kind, retryable, detail }`：

| 宿主 / 工具错误 | RunnerErrorKind | retryable |
|---|---|---|
| `EHOSTUNREACH` / `ECONNREFUSED` / `ENOTFOUND` | tool_error | true |
| `ENOENT` / `EACCES` / `EISDIR` / `EEXIST` | tool_error | true |
| 参数 schema 拒绝（`EINVALID_ARG` / 文本匹配） | tool_error | false |
| 宿主拒绝写（`hostRejectWrite`） | assertion_error | false |
| 路径越域（二次校验命中） | assertion_error | false |
| 宿主超时（`timeout`） | timeout | false |
| 取消（`cancelled`） | cancel | false |
| 非标准宿主异常 | agent_error | false |

- Runner 侧 `invokeTool` 已识别 `error_kind`：`assertion_error` → 立即抛、不重试；`tool_error` 按原 TOOL_MAX_RETRIES 指数退避。
- `ToolInvocationResult` 增可选 `error_kind` / `error_code` 字段：Adapter 回填，Runner 消费；v1.7.1 既有调用方（mock 无 error_kind）不受影响。

### §6 Security Boundary 确认
- `security.ts` 三类黑名单：
  1. **MyTeam Home 写** — `SecurityContext.deny_paths` 含 Home；`checkSecurityDomain` 命中即拒。
  2. **`~/.config/opencode` 写** — `FORBIDDEN_HOST_DOMAINS` 硬编码两条（`opencode.json` + `opencode/`），`isHostConfigWrite()` 命中即拒；高于 allowed_paths 判定。
  3. **越出安全域** — 路径 ∉ `allowed_paths` 或 ∈ `deny_paths` → 拒。
- 顺序：host-config 黑名单（最严）→ allowed_paths → deny_paths。
- 卸载插件后宿主无残留：Adapter 只读 `AgentExecutionContext.security`（由 Tool Bridge 生成），不修改宿主配置。

## 3. 测试覆盖（7 项验收）

| 测试项 | 断言 | 结果 |
|---|---|---|
| 1. allowed tool | host 工具 `allowed=true` + 权限覆盖 → `ok=true` + hostPort 恰调 1 次 + value 透传；`permissions.read=false` → `assertion_error` + 宿主 0 次 | PASS × 6 |
| 2. denied tool | `allowed=false` → `assertion_error` + 宿主 0 次；未声明工具 → `assertion_error`（capability 缺失） | PASS × 5 |
| 3. security deny | 路径 ∉ allowed / 命中 deny → `assertion_error` + 宿主 0 次 | PASS × 4 |
| 4. mcp missing | `ctx.mcp=[]` → `tool_error` + 宿主 0 次 + reason 含 "not found in ctx.mcp"；绑定成功 → `ok=true` + `mcpOpts.server/method/args` 正确；`mapMcpInvocation` 直接断言 | PASS × 8 |
| 5. error mapping | 7 类宿主错误归一断言 + adapter 端 `hostPort.ok=false` 携带 `error_code` → `tool_error` kind | PASS × 8 |
| 6. no fs | 静态：5 个 adapter 模块无 `node:fs` import；动态：invoke 前后项目目录文件数不变（4834） | PASS × 2 |
| 7. no host config write | `isHostConfigWrite` 命中 opencode.json/opencode 目录、合法项目路径通过；`checkSecurityDomain` 命中黑名单、合法路径通过 | PASS × 6 |

**合计 39/39 PASS。**

## 4. 回归与一致性

- **Runner** `runtime/runner/test/runner.test.ts`：49/49 PASS（最小补丁 `error_kind` 字段向后兼容，既有 mock 不填则 undefined，Runner 原重试逻辑不变）。
- **Tool Bridge** `runtime/tool-bridge/test/tool-bridge.test.ts`：22/22 PASS（未改 tool-bridge 任何文件）。
- **U+FFFD 扫描**：`runtime/tool-adapter/**` 0 命中（中文注释为 UTF-8 正常编码）。
- **Home 树隔离**：测试脚本验证 MyTeam Home 文件集不变（无新/改文件）。

## 5. 约束遵守清单

| 禁则 | 遵守 |
|---|---|
| 不接真实宿主工具 | hostPort 由调用方注入；本阶段 mock（`MockHostPort`） |
| 不启动 MCP | 生命周期归宿主；`mapMcpInvocation` 只做静态映射 |
| 不修改 OpenCode 配置 | Adapter 只读 `ctx.security`，不写 `opencode.json` |
| 不绕过 Tool Bridge | 只读 `AgentExecutionContext`，不修改其字段 |
| 不实现 Trace | 无 trace_hint 代码 |
| 不触碰既有实现文件（除 Runner 最小补丁） | 仅 `runner/types.ts` +5 行、`runner/runner.ts` +3 行，向后兼容 |

## 6. 后续阶段（v1.7.4+）依赖本阶段产物

- `hostPort` 真实实现：由宿主接入层提供（替换 mock），Adapter 代码无需改动。
- `AgentExecutor` 真实实现：`AgentExecutor.execute()` 内部可调用 `toolPort.invoke()`（Runner 已支持），或经 `TaskInput.tool_invocations` 走 Runner `invokeTool`（已支持）。
- Trace（v1.7.4）：消费本阶段 `adapterInvoke` 返回的 `error_kind` / `duration` 作为诊断字段（非事件）。
