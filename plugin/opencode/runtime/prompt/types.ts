/**
 * MyTeam OpenCode Plugin — Prompt Assembly · Types (types.ts) — v1.8.4
 * ---------------------------------------------------------------------------
 * Phase 1 — Prompt Assembly（最终执行 Prompt 装配）· 类型模型。
 *
 * 核心原则（设计 §3.3）：
 *   **Agent prompt 仍来自 MyTeam Home。禁止复制 prompt 到项目 / runtime。**
 *   本模型只承载「引用」（prompt_source 路径）与「运行投影」，**不含 prompt 正文副本**。
 *
 * 禁则：
 *   - 不复制 prompt 正文到 .team/ 或 runtime/。
 *   - 不写盘、不联网、不做副作用（纯内存装配）。
 *   - 不把 deny_paths / 安全内部信息写入最终 prompt。
 * ---------------------------------------------------------------------------
 */

/** 能力段：只含 allowed=true 的工具声明（供模型知晓可调用项）。 */
export interface PromptCapability {
  /** 工具标识（OpenCode Host Tool / MCP 工具名）。 */
  tool: string;
  /** 能力来源：host（宿主内置）或 mcp。 */
  source: "host" | "mcp";
  /** 可见性理由（静态说明，非执行时动态判定）。 */
  reason: string;
}

/** 约束段：workspace / memory / permissions（声明用；不含安全域内部信息）。 */
export interface PromptConstraints {
  /** workspace 根。 */
  workspace: string;
  /** memory 命名空间。 */
  memory_ns: string;
  /** 权限白名单（静态声明）。 */
  permissions: string[];
}

/** 装配后的消息（供 Model Adapter 消费；schema 由适配器约定）。 */
export interface PromptMessage {
  role: "system" | "user";
  content: string;
}

/**
 * ExecutionPrompt —— Prompt Assembly 的产物。
 *
 * 关键不变量：
 *   - `prompt_source` 恒等于 `instance.prompt_source`（引用，不复制）。
 *   - 不含 `deny_paths` / `host_config` / `myteam_home` 等安全内部信息。
 *   - `capabilities` 只含 allowed=true 的项。
 */
export interface ExecutionPrompt {
  /** 引用（绝不复制）：来自 instance.prompt_source（MyTeam Home 内，只读）。 */
  prompt_source: string;
  /** 身份段：agent / role（来自 instance）。 */
  identity: { agent: string; role: string };
  /** 任务段：goal（来自 TaskInput）。 */
  goal: string;
  /** 能力段：可用工具（来自 context.tools，仅 allowed=true 的项）。 */
  capabilities: PromptCapability[];
  /** 约束段：workspace / memory_ns / permissions（声明用）。 */
  constraints: PromptConstraints;
  /** 装配后的消息序列（供 Model Adapter 消费）。 */
  messages: PromptMessage[];
  /** 装配 schema 版本（YAML 头语义；纯内存标记）。 */
  schema_version: 1;
}
