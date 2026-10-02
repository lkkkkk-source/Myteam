/**
 * MyTeam OpenCode Plugin — Model Adapter · Null (null-adapter.ts) — v1.8.4
 * ---------------------------------------------------------------------------
 * Phase 1 — NullModelAdapter（空模型适配器）。
 *
 * 用途：
 *   在没有真实模型接入的前提下，为执行体提供**确定性、无副作用**的推理替身，
 *   使 Prompt Assembly / Response Parser / Action Planner 可独立开发与测试。
 *
 * 硬性约束（本阶段强制）：
 *   - **不联网**：绝不发起任何网络请求（无 fetch / http / sdk）。
 *   - **无 Key**：不读环境变量、不读凭据、不落盘。
 *   - **确定性**：相同 ModelRequest → 相同 ModelResponse（无随机、无时钟）。
 *   - **可解释**：响应可被 ResponseParser 直接消费（默认产出 answer=goal）。
 *
 * 设计依据：evolution/v1.8.4/reports/v1.8.4-agent-execution-design.md §4.3。
 * ---------------------------------------------------------------------------
 */

import type { ModelAdapter, ModelRequest, ModelResponse } from "./types";

/**
 * NullModelAdapter —— 无网络、无 Key 的确定性模型替身。
 *
 * 行为：
 *   - 默认把 prompt.goal 作为最终答复文本回显（finish_reason="stop"）。
 *   - 若注入了 `responder`，则以其返回值作为文本（便于测试注入）。
 *   - 若 signal 已取消，返回 ok=false / error_kind="cancel"。
 *   - 若超时上限为 0 / 缺省，不做计时；> 0 时不做真实等待（Null 实现瞬时返回）。
 */
export class NullModelAdapter implements ModelAdapter {
  /** 可选的自定义响应器（仅测试 / 装配使用；不涉及网络）。 */
  private readonly responder?: (req: ModelRequest) => string;

  constructor(responder?: (req: ModelRequest) => string) {
    this.responder = responder;
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    // 取消优先：信号已中止 → cancel（不外泄裸异常）。
    if (req.signal?.aborted) {
      return {
        ok: false,
        text: "",
        finish_reason: "error",
        error_kind: "cancel",
        error_detail: "aborted before model completion (null adapter)",
      };
    }

    // 确定性文本：优先自定义响应器，否则回显 goal。
    const text =
      this.responder?.(req) ??
      (req.expects === "json"
        ? JSON.stringify({
            kind: "answer",
            text: req.prompt.goal,
          })
        : req.prompt.goal);

    return {
      ok: true,
      text,
      finish_reason: "stop",
      usage: {},
    };
  }
}

/** 工厂：创建默认 NullModelAdapter（无自定义响应器）。 */
export function createNullModelAdapter(): ModelAdapter {
  return new NullModelAdapter();
}
