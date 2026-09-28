/**
 * MyTeam OpenCode Plugin — Execution Store · Types (types.ts) — v1.6.5
 * ---------------------------------------------------------------------------
 * Phase 5 — Execution Persistence Layer（模型存储）。
 *
 * 这里只定义 Execution / AgentRun / HumanCheckpoint / Result Artifact 的
 * 持久化模型。只做数据形态；不做推进（状态机）、不做执行、不做 Trace。
 *
 * 分层契约（v1.6.4 Scheduler Boundary）：
 *   Router 只选 → Runtime 只实例化 → Execution Engine 管生命周期。
 *   本层（Store）只负责内存模型 <-> .team/runtime/execution/ 的读写。
 * ---------------------------------------------------------------------------
 */

/** 一次用户任务（v1.6.2 设计 §2）。 */
export interface Execution {
  /** 形如 EX-001；逐项目递增。 */
  execution_id: string;
  /** 项目绝对路径（= Resolution.project_root）。 */
  project: string;
  /** 创建时间（ISO-8601）。 */
  created: string;
  /** create() 时固定为 received；save() 不推进状态。 */
  status: ExecutionStatus;
  /** 当前阶段（空串 = 尚未进入阶段）。 */
  current_stage: string;
  /** 若已确定，为当前 / 采的 agent 名称（引用，不复制定义）。 */
  current_agent: string;
  /** 最终输出位置（= resultDir 完整路径，由 Store 填）。 */
  result: string;
  /** 人类计划/阶段意图（引用 plan.yaml）。 */
  plan_id?: string;
}

/** Execution 状态（v1.6.2 定义；持久化层仅存储，不负责迁移）。 */
export type ExecutionStatus =
  | "received"
  | "planning"
  | "awaiting_confirmation"
  | "ready"
  | "running"
  | "paused"
  | "completed"
  | "failed";

/** 一次 Agent 调用（v1.6.2 设计 §2；引用 agent_instance，不复制）。 */
export interface AgentRun {
  /** 所属 execution（EX-xxx）。 */
  execution_id: string;
  /** 引用 AgentRuntimeInstance.id（EX-xxx:<agent>）。只引用，不复制实例内容。 */
  agent_instance_id: string;
  /** received/planning/… 沿用 ExecutionStatus（不实现推进）。 */
  status: string;
  /** 本轮输入（任务提示摘要或指令）。 */
  input: string;
  /** 本轮输出（结果摘要；最终产物体在 result/）。 */
  output: string;
  /** 开始时间（ISO-8601）。 */
  started: string;
  /** 结束时间（ISO-8601；未完成留空）。 */
  completed?: string;
}

/** Human Checkpoint（v1.6.2 设计 §4）。 */
export interface HumanCheckpoint {
  /** 形如 cp-0001，逐 execution 递增。 */
  checkpoint_id: string;
  /** "continue" | "modify" | "reject"。 */
  type: CheckpointType;
  /** 触发该检查点时的阶段（空 = 未指定）。 */
  stage?: string;
  /** 给人类的说明。 */
  message: string;
  /** 需要人类做的动作（动词短语）。 */
  required_action: string;
  /** 用户可选的响应选项。 */
  options: string[];
  /** 人类已响应：选择（continue/modify/reject）。 */
  resolution?: string;
  /** 人类已响应：附带修改意图（可选）。 */
  resolved?: string;
  /** 是否已响应（*机不自动通过*）。 */
  resolved_at?: string;
  /** 标注已响应（谁发起的、何时）；仅存储不推进。 */
  acknowledged?: boolean;
}

export type CheckpointType = "continue" | "modify" | "reject";

/** Result Artifact 元数据（文件本体在 result/ 下，这里存描述）。 */
export interface ResultArtifact {
  /** 文件名（相对 result 目录）。 */
  name: string;
  /** Result Artifact 的绝对路径。 */
  path: string;
  /** 字节数。 */
  size: number;
  /** 最后修改时间。 */
  modified: string;
}

/** list() 摘要。 */
export interface ExecutionSummary {
  execution_id: string;
  project: string;
  status: ExecutionStatus;
  created: string;
  current_stage: string;
}