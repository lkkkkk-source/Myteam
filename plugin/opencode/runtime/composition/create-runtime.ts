/**
 * MyTeam OpenCode Plugin — Runtime Composition (create-runtime.ts) — v1.8.3
 * ---------------------------------------------------------------------------
 * 组装层唯一入口 `createRuntime()`（对齐 v1.8.2 Runtime Composition Design）。
 *
 * 职责：把已解析 / 已投影的只读零件装配为不可变句柄 MyTeamRuntime。
 *   Resolution ─┐
 *   host{client}┼─► createOpenCodeHostPort ─► hostPort
 *               ├─► bindEngineDeps(store)   ─► engineDeps → EngineFacade
 *               ├─► new ToolAdapter(ctx)     ─► toolPort
 *               └─► createRunnerDeps(...)    ─► runnerDeps → RunnerFacade
 *
 * 不变量：
 *   I-1 单一装配点：全仓库唯一 new ToolAdapter / createOpenCodeHostPort 之处。
 *   I-2 只读输入  ：不修改 resolution / instance / execContext。
 *   I-3 无副作用  ：createRuntime 本身不写盘（HostPort 只读、Store 未被调用）。
 *   I-4 幂等可重建：相同输入可重复调用得到等价句柄。
 *   I-5 无宿主写  ：不写宿主全局配置目录（用户主目录下的配置区）与 myteam_home。
 *
 * 禁止：本层不解析工作区 / 不创建 team root / 不激活 agent（均为 Entry 职责）。
 */

import { createOpenCodeHostPort } from "../tool-adapter";
import { ToolAdapter } from "../tool-adapter";
import type { HostToolPort } from "../tool-adapter";
import type { ToolInvocationPort } from "../runner/types";
import { mapRunnerResultToEngineAction, executeRunnerResult } from "../runner/runner-engine-adapter";
import { prepareTaskInput } from "../runner/runner";
import type { RunnerInvocation } from "../runner/types";
import { createEngineFacade } from "./engine-facade";
import {
  createRunnerFacade,
  isToolPortInert,
  INERT_TOOL_PORT,
} from "./runner-facade";
import {
  CompositionError,
  type CreateRuntimeInput,
  type MyTeamRuntime,
  type RunStepInput,
  type RunStepResult,
  type RuntimeDescriptor,
} from "./types";

/**
 * 组装运行时句柄。
 *
 * @param input 已解析 / 已投影的只读对象（见 CreateRuntimeInput）。
 * @returns MyTeamRuntime（不可变句柄：ports + runStep + describe）。
 */
export function createRuntime(input: CreateRuntimeInput): MyTeamRuntime {
  const { resolution, host, instance, execContext, executor, signal, now } = input;

  if (!host || !host.client) {
    throw new CompositionError("createRuntime requires host.client");
  }

  // 默认工作目录：优先 instance.workspace，回退 resolution.project_root（I-2 只读）。
  const workspace = instance?.workspace ?? resolution.project_root;
  const directory = host.directory ?? resolution.project_root;

  // 1. HostPort（只读路由；工厂创建，组装层注入）。
  const hostPort: HostToolPort = createOpenCodeHostPort(host.client, directory);

  // 2. ToolAdapter（构造器注入；无 execContext 时惰性占位）。
  const toolPort: ToolInvocationPort = execContext
    ? new ToolAdapter(execContext, { hostPort, now })
    : INERT_TOOL_PORT;

  // 3. EngineFacade（EngineDeps 绑定 Store）。
  const engine = createEngineFacade(resolution);

  // 4. RunnerFacade（toolPort === adapter；executor 缺省 AgentExecutorImpl）。
  const runner = createRunnerFacade({
    toolPort: execContext ? toolPort : undefined,
    instance,
    execContext,
    executor,
    signal,
    now,
  });

  const runtime: MyTeamRuntime = {
    resolution,
    instance,
    execContext,

    ports: { hostPort, toolPort, engine, runner },

    async runStep(step: RunStepInput): Promise<RunStepResult> {
      const effInstance = step.instance ?? instance;
      const effContext = step.context ?? execContext;
      const runId = step.runId ?? step.run.agent_instance_id;

      if (!effInstance || !effContext) {
        throw new CompositionError(
          "runStep requires instance and execContext (pass them to createRuntime or runStep)"
        );
      }

      // 1. 组装 RunnerInvocation（taskInput 缺省由 run+instance 推导）。
      const base = {
        run: step.run,
        instance: effInstance,
        context: effContext,
        timeout_ms: step.timeout_ms,
      } as const;
      const invocation: RunnerInvocation = {
        ...base,
        taskInput: step.taskInput ?? prepareTaskInput(base as RunnerInvocation),
      };

      // 2. Runner 执行（组装层不解读结果）。
      const result = await runner.execute(invocation);

      // 3. RunnerResult → Engine Action（纯函数；assertion_error 在此抛出，不触盘）。
      const action = mapRunnerResultToEngineAction(result, step.run);

      // 4. 状态推进只能经 executeRunnerResult → Engine → Store。
      const advanced = await executeRunnerResult(
        resolution,
        step.run,
        result,
        engine.deps,
        runId
      );

      return {
        result,
        action,
        execution: advanced.execution,
        run: advanced.run,
      };
    },

    describe(): RuntimeDescriptor {
      return {
        resolution,
        workspace,
        hasInstance: Boolean(instance),
        hasExecContext: Boolean(execContext),
        hostPortKind: "OpenCodeHostPort",
        toolPortKind: isToolPortInert(toolPort) ? "InertToolPort" : "ToolAdapter",
        executorKind:
          runner.deps?.executor?.constructor?.name ?? "none",
        readOnly: true,
      };
    },
  };

  return runtime;
}
