/**
 * MyTeam OpenCode Plugin — Runtime Composition (index.ts) — v1.8.3
 * ---------------------------------------------------------------------------
 * 组装层出口：createRuntime + Engine/Runner Facade + 类型契约。
 *
 * 约束：
 *   - 组装层是唯一 new 运行时对象之处（I-1）。
 *   - 不 resolveWorkspace / 不 ensureTeamRoot / 不 activateAgent（Entry 职责）。
 *   - 不写宿主（~/.config/opencode）与 myteam_home。
 */

export {
  createRuntime,
} from "./create-runtime";
export { createEngineFacade, bindEngineDeps } from "./engine-facade";
export { createRunnerFacade, isToolPortInert } from "./runner-facade";
export {
  CompositionError,
  type CreateRuntimeInput,
  type EngineFacade,
  type MyTeamRuntime,
  type RunnerFacade,
  type RuntimeDescriptor,
  type RunStepInput,
  type RunStepResult,
} from "./types";
