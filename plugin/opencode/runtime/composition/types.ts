/**
 * MyTeam OpenCode Plugin — Runtime Composition (types.ts) — v1.8.3
 * ---------------------------------------------------------------------------
 * 组装层类型契约（对齐 v1.8.2 Runtime Composition Design §2）。
 *
 * 组装层是「接线员」而非「决策者」：
 *   - 只装配已解析 / 已投影的只读对象（不 resolveWorkspace / 不 ensureTeamRoot）。
 *   - 不解读结果、不改状态、不写盘（状态推进只能经 Engine → Store）。
 *   - 全仓库唯一可以 new ToolAdapter / createOpenCodeHostPort 的地方（I-1）。
 */

import type { Resolution } from "../../workspace-resolver";
import type { AgentRuntimeInstance } from "../../agent-instance";
import type { AgentExecutionContext } from "../tool-bridge/context";
import type {
  AgentExecutor,
  AgentExecutorResult,
  RunnerDeps,
  RunnerInvocation,
  RunnerResult,
  TaskInput,
  ToolInvocationPort,
} from "../runner/types";
import type {
  AgentRun,
  Execution,
  ExecutionStatus,
  HumanCheckpoint,
} from "../execution/types";
import type { EngineDeps, ResolveOptions } from "../execution/execution-engine";
import type { HostToolPort } from "../tool-adapter";
import type { OpenCodeClientSubset } from "../tool-adapter/host-port/host-port";
import type { RunnerEngineAction } from "../runner/runner-engine-adapter";

// ---------------------------------------------------------------------------
// 组装层错误
// ---------------------------------------------------------------------------

/** 组装层错误：装配缺失 / 使用不当（非 Runner / Engine 领域错误）。 */
export class CompositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompositionError";
  }
}

// ---------------------------------------------------------------------------
// §2.4 Facade：Engine / Runner 门面
// ---------------------------------------------------------------------------

/**
 * Engine 门面：内部持有 EngineDeps（绑定到 Store），对外只暴露用例方法。
 * 所有方法均以本组装层绑定的 `Resolution` 为隐式首参。
 */
export interface EngineFacade {
  /** 已绑定 Store 的 EngineDeps（9 个函数）。 */
  readonly deps: EngineDeps;
  transition(id: string, to: ExecutionStatus): Execution;
  pause(id: string): Execution;
  resume(id: string): Execution;
  complete(id: string): Execution;
  fail(id: string): Execution;
  recover(id: string): Execution;
  resolveCheckpoint(
    id: string,
    checkpointId: string,
    resolution: "continue" | "modify" | "reject",
    opts?: ResolveOptions
  ): { checkpoint: HumanCheckpoint; execution: Execution };
}

/**
 * Runner 门面：内部持有 RunnerDeps（toolPort=adapter, executor）。
 *
 * 若组装时未提供 `instance` / `execContext`，则门面处于「惰性（inert）」状态：
 * `deps` 为 `undefined`，`execute()` 抛出 `CompositionError`。
 * 这样 `createRuntime` 仍可在「仅装配 host/engine 端口」场景下无副作用返回（I-3/T1）。
 */
export interface RunnerFacade {
  /** 已绑定的 RunnerDeps；未提供 instance/execContext 时为 undefined。 */
  readonly deps: RunnerDeps | undefined;
  execute(invocation: RunnerInvocation): Promise<RunnerResult>;
}

// ---------------------------------------------------------------------------
// §2.2 输入
// ---------------------------------------------------------------------------

/** `createRuntime` 输入（全部为已解析 / 已投影的只读对象）。 */
export interface CreateRuntimeInput {
  /** v1.6.0 解析结果：三根（home / project / team）。 */
  resolution: Resolution;
  /** 宿主注入：OpenCode client 子集（供 HostPort 只读路由）。 */
  host: {
    /** @opencode-ai/sdk v1.14.x 子集（只读）。 */
    client: OpenCodeClientSubset;
    /** 缺省 = resolution.project_root。 */
    directory?: string;
  };
  /** 可选：运行实例（若上层已投影好则直接注入）。 */
  instance?: AgentRuntimeInstance;
  /** 可选：能力上下文（Tool Bridge 产物，只读）。 */
  execContext?: AgentExecutionContext;
  /** 可选：执行体适配器（缺省 = AgentExecutorImpl，经 createRunnerDeps 注入）。 */
  executor?: AgentExecutor;
  /** 可选：取消信号。 */
  signal?: AbortSignal;
  /** 可选：测试用时钟。 */
  now?: () => number;
}

// ---------------------------------------------------------------------------
// §2.5 runStep 输入 / 输出
// ---------------------------------------------------------------------------

/** 单步运行输入：缺省使用组装时绑定的 instance / execContext。 */
export interface RunStepInput {
  /** 本轮 AgentRun（其 execution_id 决定状态推进目标）。 */
  run: AgentRun;
  /** 覆盖组装时绑定的 instance（缺省用 runtime.instance）。 */
  instance?: AgentRuntimeInstance;
  /** 覆盖组装时绑定的 execContext（缺省用 runtime.execContext）。 */
  context?: AgentExecutionContext;
  /** 覆盖自动推导的 TaskInput（缺省 prepareTaskInput(invocation)）。 */
  taskInput?: TaskInput;
  /** 超时上限（毫秒；0 / 缺省 = 无超时）。 */
  timeout_ms?: number;
  /** runId 文件标识（缺省取 run.agent_instance_id）。 */
  runId?: string;
}

/** 单步运行结果（Runner 结果 + Engine Action + 推进后的真相投影）。 */
export interface RunStepResult {
  /** Runner 原始结果（不解读）。 */
  result: RunnerResult;
  /** Runner → Engine Action 映射结果（v1.8.1）。 */
  action: RunnerEngineAction;
  /** 推进后的 execution（磁盘最新真相的内存投影）。 */
  execution: Execution;
  /** 推进后的 run（磁盘最新真相的内存投影）。 */
  run: AgentRun;
}

// ---------------------------------------------------------------------------
// §2.3 输出：MyTeamRuntime + 自检描述
// ---------------------------------------------------------------------------

/** 装配自检描述（只读；供测试 / 诊断，不暴露内部可变状态）。 */
export interface RuntimeDescriptor {
  resolution: Resolution;
  /** 默认工作目录（= instance.workspace 或 resolution.project_root）。 */
  workspace: string;
  hasInstance: boolean;
  hasExecContext: boolean;
  hostPortKind: "OpenCodeHostPort";
  toolPortKind: "ToolAdapter" | "InertToolPort";
  /** 执行体类名（诊断用；不暴露内部实现细节）。 */
  executorKind: string;
  /** 组装层恒为只读装配（无宿主写）。 */
  readOnly: true;
}

/** 组装产物：不可变句柄（ports + runStep + describe）。 */
export interface MyTeamRuntime {
  readonly resolution: Resolution;
  /** 组装时绑定的运行实例（若提供）。 */
  readonly instance: AgentRuntimeInstance | undefined;
  /** 组装时绑定的能力上下文（若提供）。 */
  readonly execContext: AgentExecutionContext | undefined;

  /** 装配好的端口（供上层编排，不暴露内部可变状态）。 */
  readonly ports: {
    readonly hostPort: HostToolPort;
    readonly toolPort: ToolInvocationPort;
    readonly engine: EngineFacade;
    readonly runner: RunnerFacade;
  };

  /** 单步运行：Runner.execute → executeRunnerResult → Engine 状态推进。 */
  runStep(input: RunStepInput): Promise<RunStepResult>;

  /** 只读能力：装配自检（供测试 / 诊断）。 */
  describe(): RuntimeDescriptor;
}

// ---------------------------------------------------------------------------
// 重导出（便于组装层消费者单一入口取类型）
// ---------------------------------------------------------------------------

export type {
  AgentExecutor,
  AgentExecutorResult,
  AgentRun,
  Execution,
  ExecutionStatus,
  HumanCheckpoint,
  RunnerDeps,
  RunnerInvocation,
  RunnerResult,
  TaskInput,
  ToolInvocationPort,
  EngineDeps,
  ResolveOptions,
  HostToolPort,
  OpenCodeClientSubset,
  RunnerEngineAction,
};
