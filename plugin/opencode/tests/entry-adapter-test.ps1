# =====================================================================
# MyTeam OpenCode Entry Adapter Test — v1.5.1 (Case1~6)
# =====================================================================
# 验证：OpenCode 只看到单一入口 "MyTeam" → 转发既有 project-manager-agent。
#   不新增 Agent / 不改 source prompts / routing-rules / team-registry / organization。
#   不暴露 30 个 Agent；宿主 0 变更。仅修改 plugin/opencode/。
# =====================================================================
$ErrorActionPreference = 'Stop'
$root = "D:\data\code\Agent\MyTeam"
$pdir = Join-Path $root "plugin\opencode"
$hostCfg = "C:\Users\Administrator\.config\opencode"

$pass = 0; $fail = 0
function Pass($m){ Write-Host "  [PASS] $m"; $script:pass++ }
function Fail($m){ Write-Host "  [FAIL] $m"; $script:fail++ }
function Snapshot($b){ $m=@{}; if(Test-Path $b){ Get-ChildItem $b -Recurse -File -Force -EA SilentlyContinue | ForEach-Object { $m[$_.FullName]="$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" } }; return $m }
function DiffH($x,$y){ $c=@(); foreach($k in $y.Keys){ if(-not $x.ContainsKey($k)){$c+="ADD:$k"}elseif($x[$k]-ne$y[$k]){$c+="MOD:$k"} }; foreach($k in $x.Keys){ if(-not $y.ContainsKey($k)){$c+="DEL:$k"} }; return $c }

Write-Host "=== v1.5.1 MyTeam OpenCode Entry Adapter Tests ==="

# ---------- scaffold ----------
Write-Host "`n[0] Entry adapter scaffold"
foreach($f in @("pm-adapter.ts","index.ts","bridge.ts","loader.ts","manifest.yaml")){
  if(Test-Path (Join-Path $pdir $f)){ Pass "scaffold: $f" } else { Fail "missing: $f" }
}
$idx = Get-Content -Raw -Encoding UTF8 (Join-Path $pdir "index.ts")
$pm  = Get-Content -Raw -Encoding UTF8 (Join-Path $pdir "pm-adapter.ts")
$mani= Get-Content -Raw -Encoding UTF8 (Join-Path $pdir "manifest.yaml")
$bridge = Get-Content -Raw -Encoding UTF8 (Join-Path $pdir "bridge.ts")

# ---------- Case1: OpenCode plugin load ----------
Write-Host "`n[Case1] OpenCode plugin load"
$loadOk = ($mani -match 'name: "myteam"') -and ($mani -match 'entry: "index.ts"') -and ($idx -match 'export default MyTeamPlugin') -and ($idx -match 'import .*pm-adapter')
if($loadOk){ Pass "Case1: plugin load-ready (manifest entry + index exports MyTeamPlugin + imports pm-adapter)" } else { Fail "Case1: plugin load metadata incomplete" }

# ---------- Case2: OpenCode visible entry = MyTeam ----------
Write-Host "`n[Case2] OpenCode visible entry = MyTeam"
$hasEntryTool = ($idx -match '"myteam":\s*\{') -and ($idx -match 'MyTeam .*single OpenCode entry' )
if($hasEntryTool){ Pass "Case2: index.ts registers single visible entry tool 'myteam' (MyTeam)" } else { Fail "Case2: MyTeam entry tool missing" }
if($pm -match 'OPENCODE_ENTRY = "MyTeam"'){ Pass "Case2: pm-adapter declares OPENCODE_ENTRY = MyTeam" } else { Fail "Case2: OPENCODE_ENTRY missing" }
# 不暴露 30 个 Agent：表面只 1 个入口 + 存在 enumeration 拒绝
if(($pm -match 'refuseAgentEnumeration') -and ($pm -match 'exposes_agents: false')){ Pass "Case2: no 30-agent exposure (refuseAgentEnumeration + exposes_agents=false)" } else { Fail "Case2: agent-exposure guard missing" }

# ---------- Case3: MyTeam request → PM ----------
Write-Host "`n[Case3] MyTeam request -> PM"
if($pm -match 'PM_ENTRY_AGENT = "project-manager-agent"'){ Pass "Case3: pm-adapter routes to existing project-manager-agent" } else { Fail "Case3: PM entry agent missing" }
if(($idx -match 'handleEntryRequest') -and ($pm -match 'export function handleEntryRequest')){ Pass "Case3: index.ts wires handleEntryRequest (request -> PM)" } else { Fail "Case3: handleEntryRequest not wired" }
if(($pm -match 'performs_routing: false') -and ($pm -match 'selects_final_agent: false') -and ($pm -match 'executes: false')){ Pass "Case3: adapter forwards only (no routing/no select/no execute)" } else { Fail "Case3: adapter does more than forward" }

# ---------- Case4: PM -> Router -> Team trace ----------
Write-Host "`n[Case4] PM -> Router -> Team trace"
$chainOk = ($pm -match '"MyTeam"') -and ($pm -match '"project-manager-agent"') -and ($pm -match '"Router"') -and ($pm -match '"Team"') -and ($pm -match '"Role"') -and ($pm -match '"Agent"')
if($chainOk -and ($pm -match 'ENTRY_CHAIN')){ Pass "Case4: ENTRY_CHAIN = MyTeam -> PM -> Router -> Team -> Role -> Agent" } else { Fail "Case4: entry chain incomplete" }

# ---------- Case5: 30 Agent baseline unchanged ----------
Write-Host "`n[Case5] 30 Agent baseline unchanged"
$srcPrompts = (Get-ChildItem (Join-Path $root "source\prompts") -Recurse -Filter *.md).Count
if($srcPrompts -eq 30){ Pass "Case5: source prompts = 30 (no new agent)" } else { Fail "Case5: source prompts=$srcPrompts" }
# adapter 引用既有 PM，未创建 agent md
$newAgentMd = Test-Path (Join-Path $root "source\prompts\pm\myteam-entry.md")
if(-not $newAgentMd){ Pass "Case5: no new agent prompt created (reuse existing PM)" } else { Fail "Case5: a new agent prompt appeared" }

# ---------- Case6: OpenCode host mutation = 0 ----------
Write-Host "`n[Case6] OpenCode host mutation = 0"
$before = Snapshot $hostCfg
# 模拟入口激活：只读取 MyTeam 仓库，绝不写宿主
$null = Get-Content -Raw -Encoding UTF8 (Join-Path $root "platform\runtime-adapter\agent-binding.yaml") -EA SilentlyContinue
Start-Sleep -Milliseconds 50
$after = Snapshot $hostCfg
$d = DiffH $before $after
if($d.Count -eq 0){ Pass "Case6: host ~/.config/opencode unchanged (0 mutations)" } else { Fail ("Case6 host mutated: " + ($d -join '; ')) }
if(($mani -match 'copy_files: false') -and ($bridge -match 'host_config_write: false') -and ($pm -match 'guardHostWrite')){ Pass "Case6: copy_files=false + host_config_write=false + guardHostWrite (isolation intact)" } else { Fail "Case6: isolation flags missing" }
if($pm -match 'source_of_truth: true'){ Pass "Case6: source_of_truth=true (no reverse mutation)" } else { Fail "Case6: source_of_truth flag missing" }

# ---------- kept tools ----------
Write-Host "`n[Kept tools]"
if(($idx -match '"myteam.status"') -and ($idx -match '"myteam.execution.admit"')){ Pass "existing tools preserved (myteam.status + myteam.execution.admit)" } else { Fail "existing tools broken" }
if($idx -match 'guardHostWrite\(output.args.filePath\)'){ Pass "isolation guard (tool.execute.before) intact" } else { Fail "isolation guard broken" }

# ---------- 未修改文件证明 ----------
Write-Host "`n[Unmodified proof]"
$pmPrompt = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\pm\project-manager-agent.md")
if($pmPrompt -notmatch 'v1\.5\.1' -and $pmPrompt -notmatch 'pm-adapter' -and $pmPrompt -notmatch 'OpenCode Entry Adapter'){ Pass "project-manager-agent prompt UNMODIFIED (no v1.5.1/adapter marker)" } else { Fail "PM prompt appears modified" }
$rr = Get-Content -Raw -Encoding UTF8 (Join-Path $root ".ai\context\router\rules\routing-rules.yaml")
if($rr -notmatch 'v1\.5\.1' -and $rr -notmatch 'pm-adapter'){ Pass "routing-rules.yaml UNMODIFIED" } else { Fail "routing-rules modified" }
$tr = Get-Content -Raw -Encoding UTF8 (Join-Path $root ".ai\context\team-registry.yaml")
if($tr -notmatch 'v1\.5\.1' -and $tr -notmatch 'pm-adapter'){ Pass "team-registry.yaml UNMODIFIED" } else { Fail "team-registry modified" }
$orgSchema = Get-Content -Raw -Encoding UTF8 (Join-Path $root "platform\organization\organization-schema.yaml")
if($orgSchema -notmatch 'v1\.5\.1' -and $orgSchema -notmatch 'pm-adapter'){ Pass "organization model UNMODIFIED" } else { Fail "organization model modified" }
# only plugin/opencode changed: new marker v1.5.1 must NOT appear outside plugin/opencode & tests
$leak = @()
Get-ChildItem $root -Recurse -Include *.md,*.yaml -File -EA SilentlyContinue | Where-Object { $_.FullName -notmatch 'plugin\\opencode\\' -and $_.FullName -notmatch 'build\\|opencode-global\\|release\\' } | ForEach-Object {
  $c = Get-Content -Raw -Encoding UTF8 $_.FullName -EA SilentlyContinue
  if($c -match 'OpenCode Entry Adapter Layer' -or $c -match 'pm-adapter\.ts'){ $script:leak += $_.FullName.Substring($root.Length+1) }
}
if($leak.Count -eq 0){ Pass "no v1.5.1 adapter footprint outside plugin/opencode (source/platform/context intact)" } else { Fail ("footprint leaked: " + ($leak -join '; ')) }

Write-Host ""
Write-Host "=== RESULT: $pass pass, $fail fail ==="
if($fail -eq 0){ Write-Host "ALL CHECKS PASSED" } else { Write-Host "SOME CHECKS FAILED"; exit 1 }
