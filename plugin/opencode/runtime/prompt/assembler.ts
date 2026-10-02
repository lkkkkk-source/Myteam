/**
 * MyTeam OpenCode Plugin — Prompt Assembly (assembler.ts) — v1.8.4
 * ---------------------------------------------------------------------------
 * Phase 1 — PromptAssembler（最终执行 Prompt 装配器）。
 *
 * 职责：把静态 Agent 定义（MyTeam Home 引用）+ 运行投影（TaskInput）
 *       + 可用能力清单（AgentExecutionContext）装配为 `ExecutionPrompt`。
 *
 * 核心命题（设计 §3.3 / 题干强制）：
 *   **Agent prompt 仍来自 MyTeam Home。禁止复制 prompt 到项目 / runtime。**
 *   → prompt_source 恒为「路径引用」；本模块**不读取、不复制、不落盘** prompt 正文。
 *
 * 硬性禁则（本阶段强制）：
 *   - **无 node:fs 写入**（本模块完全不 import fs）。
 *   - **不复制 prompt 文件**（workspace 内不产生任何 prompt 副本）。
 *   - **不写 deny_paths / 安全内部信息** 到最终 prompt。
 *   - **capabilities 只加入 allowed=true 的能力**。
 *   - **无隐藏状态 / 无外部依赖 / 函数式优先**。
 *
 * 设计依据：evolution/v1.8.4/reports/v1.8.4-agent-execution-design.md §3。
 * ---------------------------------------------------------------------------
 */

import type { AgentRuntimeInstance } from "../../agent-instance";
import type { AgentExecutionContext } from "../tool-bridge/context";
import type { TaskInput } from "../runner/types";
import type {
  ExecutionPrompt,
  PromptCapability,
  PromptConstraints,
  PromptMessage,
} from "./types";

// ---------------------------------------------------------------------------
// 装配输入（全部只读）
// ---------------------------------------------------------------------------

/**
 * PromptAssembler 的输入。
 * 全部来自上游只读投影；本层只消费、不修改、不落盘。
 */
export interface PromptAssemblyInput {
  /** TaskInput（Runner 组装；含 goal / workspace / prompt_source 引用等）。 */
  taskInput: TaskInput;
  /** AgentExecutionContext（Tool Bridge 产物；含 tools / permissions / security）。 */
  context: AgentExecutionContext;
  /** AgentRuntimeInstance（Runtime 投影；含 agent / role / prompt_source / workspace）。 */
  instance: AgentRuntimeInstance;
}

// ---------------------------------------------------------------------------
// 装配逻辑（纯函数）
// ---------------------------------------------------------------------------

/** 能力段：只提取 allowed=true 的工具（去掉安全内部字段，仅保留 tool/source/reason）。 */
function pickCapabilities(context: AgentExecutionContext): PromptCapability[] {
  return context.tools
    .filter((t) => t.allowed === true)
    .map((t) => ({ tool: t.tool, source: t.source, reason: t.reason }));
}

/**
 * 约束段：只注入 workspace / memory_ns / permissions。
 * **绝不注入** deny_paths / host_config / myteam_home（安全内部信息）。
 */
function buildConstraints(input: PromptAssemblyInput): PromptConstraints {
  return {
    workspace: input.taskInput.workspace,
    memory_ns: input.taskInput.memory_ns,
    permissions: [...input.taskInput.permissions],
  };
}

/**
 * 消息序列（确定性拼装；不含 prompt 正文副本）。
 *
 * system 段：身份 + 能力 + 约束 + prompt_source 引用（路径，不展开正文）。
 * user 段：本轮 goal。
 */
function buildMessages(
  input: PromptAssemblyInput,
  capabilities: PromptCapability[]
): PromptMessage[] {
  const { taskInput, context, instance } = input;

  const capabilityLine =
    capabilities.length > 0
      ? capabilities
          .map((c) => `- ${c.tool} (${c.source}): ${c.reason}`)
          .join("\n")
      : "- (none)";

  const system = [
    `# Agent`,
    `name: ${instance.agent}`,
    `role: ${instance.role}`,
    ``,
    `# Prompt Source (referenced, not copied)`,
    taskInput.prompt_source,
    ``,
    `# Capabilities (allowed only)`,
    capabilityLine,
    ``,
    `# Constraints`,
    `workspace: ${taskInput.workspace}`,
    `memory_ns: ${taskInput.memory_ns}`,
    `permissions: ${taskInput.permissions.join(", ")}`,
    `mcp: ${context.mcp.length} declared`,
    `skills: ${context.skills.join(", ") || "(none)"}`,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: taskInput.goal },
  ];
}

/**
 * assemble —— 装配最终执行 Prompt。
 *
 * 纯函数：相同输入 → 相同 ExecutionPrompt（无随机、无时钟依赖）。
 * 不读取 prompt 正文、不写盘、不调用工具。
 *
 * @throws 若 taskInput.prompt_source 缺失或非绝对形态 → 抛出 Error（由上层折叠）。
 */
export function assemble(input: PromptAssemblyInput): ExecutionPrompt {
  const { taskInput, instance } = input;

  // P-A1：prompt_source 引用优先，必须非空（正文不在此读取）。
  if (!taskInput.prompt_source || taskInput.prompt_source.trim() === "") {
    throw new Error("prompt_source is required (must reference MyTeam Home prompt)");
  }

  // 引用一致性：TaskInput.prompt_source 必须与 instance.prompt_source 一致。
  if (taskInput.prompt_source !== instance.prompt_source) {
    throw new Error(
      `prompt_source mismatch: taskInput=${taskInput.prompt_source} instance=${instance.prompt_source}`
    );
  }

  const capabilities = pickCapabilities(input.context);
  const constraints = buildConstraints(input);
  const messages = buildMessages(input, capabilities);

  return {
    schema_version: 1,
    prompt_source: taskInput.prompt_source,
    identity: { agent: instance.agent, role: instance.role },
    goal: taskInput.goal,
    capabilities,
    constraints,
    messages,
  };
}

// ---------------------------------------------------------------------------
// PromptAssembler（面向对象包装；无隐藏状态，仅方法委托 assemble）
// ---------------------------------------------------------------------------

/**
 * PromptAssembler —— 无状态装配器。
 * 以类形式提供，便于依赖注入；内部无字段、无副作用。
 */
export class PromptAssembler {
  assemble(input: PromptAssemblyInput): ExecutionPrompt {
    return assemble(input);
  }
}

/** 工厂：创建 PromptAssembler。 */
export function createPromptAssembler(): PromptAssembler {
  return new PromptAssembler();
}
