// Sanity harness: verify the MyTeam plugin module imports and runs (returns hooks)
// WITHOUT OpenCode. Uses a mock client so we can confirm the entry/tool registration.
// Note: index.ts uses a real external project dir (Workspace Binding) as ctx.directory.
import { MyTeamPlugin, default as Def } from "../index.ts";

const log = [];
const mockClient = {
  app: { log: async (x) => { log.push(x?.body?.message ?? x?.message); return; } },
  server: { tool: { create: async () => ({
    on: async () => {},
  }) } },
};

// v1.6.0: project root comes from OpenCode ctx.directory (NOT the MyTeam Home).
const PROJ = "C:/Users/ADMINI~1/AppData/Local/Temp/opencode/myteam-tests/projectA";
const ctx = { client: mockClient, directory: PROJ };

const hooks = await MyTeamPlugin(ctx);

console.log("== entry function type ==", typeof MyTeamPlugin);
console.log("== named === default ?", MyTeamPlugin === Def);
console.log("== tools registered by plugin ==", Object.keys(hooks.tool || {}).join(", "));
console.log("== hooks keys ==", Object.keys(hooks).join(", "));
console.log("== calls to ctx.app.log ==", JSON.stringify(log, null, 2));

// exercise the single entry tool to prove it executes (routes to PM, carries binding)
if (hooks.tool?.["myteam"]) {
  const r = await hooks.tool["myteam"].execute({ request: "hello" }, {});
  console.log("== myteam entry result (trim) ==", String(r).slice(0, 220));
}
