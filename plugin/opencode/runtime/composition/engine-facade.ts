/**
 * MyTeam OpenCode Plugin — Runtime Composition · Engine Facade — v1.8.3
 * ---------------------------------------------------------------------------
 * 把 ExecutionStore 的搬运函数绑定为 EngineDeps（9 函数），并以 EngineFacade
 * 收敛引擎用例方法（对齐 v1.8.2 Design §2.4 / §3.1）。
 *
 * 契约：
 *   - 只绑定，不写盘（写盘发生在 Engine 用例被调用时，经 Store）。
 *   - 组装层不解读状态机；只把 `Resolution` 作为隐式首参透传。
 */

import * as fs from "node:fs";
import * as store from "../execution/execution-store";
import {
  transition,
  pause,
  resume,
  complete,
  fail,
  recover,
  resolveCheckpoint,
  type EngineDeps,
} from "../execution/execution-engine";
import type { Resolution } from "../../workspace-resolver";
import type { EngineFacade } from "./types";

/**
 * 把 Store 函数绑定为 EngineDeps（9 函数）。
 *
 * `listRunIds` 无对应 Store 导出（与 v1.6.7 测试一致）：读 runs/ 目录文件名。
 * 纯绑定，无副作用（不读写任何文件）。
 */
export function bindEngineDeps(res: Resolution): EngineDeps {
  return {
    load: (r, id) => store.load(r, id),
    save: (r, e) => store.save(r, e),
    saveRun: (r, run, runId) => store.saveRun(r, run, runId),
    loadRun: (r, id, runId) => store.loadRun(r, id, runId),
    listRuns: (r, id) => store.listRuns(r, id),
    listRunIds: (r, id) => {
      const dir = store.runsDir(r, id);
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir).sort();
    },
    saveCheckpoint: (r, cp, id) => store.saveCheckpoint(r, cp, id),
    loadCheckpoint: (r, id, cpId) => store.loadCheckpoint(r, id, cpId),
    listCheckpoints: (r, id) => store.listCheckpoints(r, id),
  };
}

/**
 * 构造 EngineFacade：内部持有 EngineDeps（已绑定 Store），对外只暴露用例方法。
 * 所有方法以组装层绑定的 `Resolution` 为隐式首参。
 */
export function createEngineFacade(res: Resolution): EngineFacade {
  const deps = bindEngineDeps(res);
  return {
    deps,
    transition: (id, to) => transition(res, id, to, deps),
    pause: (id) => pause(res, id, deps),
    resume: (id) => resume(res, id, deps),
    complete: (id) => complete(res, id, deps),
    fail: (id) => fail(res, id, deps),
    recover: (id) => recover(res, id, deps),
    resolveCheckpoint: (id, checkpointId, resolution, opts) =>
      resolveCheckpoint(res, id, checkpointId, resolution, deps, opts),
  };
}
