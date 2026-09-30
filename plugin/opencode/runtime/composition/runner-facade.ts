/**
 * MyTeam OpenCode Plugin — Runtime Composition · Runner Facade — v1.8.3
 * ---------------------------------------------------------------------------
 * 把 ToolAdapter + AgentExecutor 绑定为 RunnerDeps，并以 RunnerFacade 收敛
 * Runner 执行入口（对齐 v1.8.2 Design §2.4）。
 *
 * 契约：
 *   - `toolPort` 必须 === ToolAdapter（S-1 无旁路）。
 *   - 组装层不解读 RunnerResult；只透传。
 *   - 若未提供 instance / execContext，门面惰性化（deps=undefined，execute 抛错）。
 */

import { execute } from "../runner/runner";
import { createRunnerDeps } from "../runner/runner";
import type {
  AgentExecutor,
  RunnerDeps,
  RunnerInvocation,
  RunnerResult,
  ToolInvocationPort,
} from "../runner/types";
import type { AgentExecutionContext } from "../tool-bridge/context";
import type { AgentRuntimeInstance } from "../../agent-instance";
import { CompositionError, type RunnerFacade } from "./types";

/** 惰性 ToolInvocationPort：任何调用都视为装配缺失（不应被触达）。 */
export const INERT_TOOL_PORT: ToolInvocationPort = {
  async invoke() {
    throw new CompositionError(
      "runner not assembled: createRuntime was called without instance/execContext"
    );
  },
};

/** 判断门面是否已装配（供 describe() 自检）。 */
export function isToolPortInert(port: ToolInvocationPort): boolean {
  return port === INERT_TOOL_PORT;
}
/**
 * 构造 RunnerFacade。
 *
 * @param args.toolPort    ToolAdapter（ToolInvocationPort 实现）
 * @param args.instance    运行实例（可选）
 * @param args.execContext 能力上下文（可选）
 * @param args.executor    执行体（可选；缺省 = AgentExecutorImpl）
 * @param args.signal      取消信号（可选）
 * @param args.now         时钟（可选）
 */
export function createRunnerFacade(args: {
  toolPort?: ToolInvocationPort;
  instance?: AgentRuntimeInstance;
  execContext?: AgentExecutionContext;
  executor?: AgentExecutor;
  signal?: AbortSignal;
  now?: () => number;
}): RunnerFacade {
  const { instance, execContext } = args;

  // 惰性：缺少 instance/execContext 时无法构造 RunnerDeps（I-3/T1：仍可无副作用返回）。
  if (!instance || !execContext) {
    return {
      deps: undefined,
      async execute(): Promise<RunnerResult> {
        throw new CompositionError(
          "runner not assembled: instance and execContext are required to run a step"
        );
      },
    };
  }

  const deps: RunnerDeps = createRunnerDeps({
    toolPort: args.toolPort ?? INERT_TOOL_PORT,
    context: execContext,
    instance,
    executor: args.executor,
    signal: args.signal,
    now: args.now,
  });

  return {
    deps,
    execute: (invocation: RunnerInvocation) => execute(invocation, deps),
  };
}
