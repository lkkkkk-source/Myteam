# =====================================================================
# MyTeam Controlled Execution Engine Test — v1.2 (Case1~8)
# =====================================================================
$ErrorActionPreference = 'Stop'
$root = "D:\data\code\Agent\MyTeam"
$eng = Join-Path $root "platform\execution-engine"
$ctx = Join-Path $root ".ai\context\execution-engine"
$cli = Join-Path $root "tools\myteam-cli\bin\myteam.mjs"
$hostCfg = "C:\Users\Administrator\.config\opencode"
$env:MYTEAM_WORKSPACE = $root

$pass = 0; $fail = 0
function Pass($m){ Write-Host "  [PASS] $m"; $script:pass++ }
function Fail($m){ Write-Host "  [FAIL] $m"; $script:fail++ }
function Snapshot($b){ $m=@{}; if(Test-Path $b){ Get-ChildItem $b -Recurse -File -Force -EA SilentlyContinue | ForEach-Object { $m[$_.FullName]="$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" } }; return $m }
function DiffH($x,$y){ $c=@(); foreach($k in $y.Keys){ if(-not $x.ContainsKey($k)){$c+="ADD:$k"}elseif($x[$k]-ne$y[$k]){$c+="MOD:$k"} }; foreach($k in $x.Keys){ if(-not $y.ContainsKey($k)){$c+="DEL:$k"} }; return $c }

Write-Host "=== v1.2 MyTeam Controlled Execution Engine Tests ==="

# ---------- scaffold ----------
Write-Host "`n[0] Engine scaffold"
$assets = @("engine-schema.yaml","execution-policy.yaml","executor-registry.yaml","permission\execution-permission.yaml","sandbox\sandbox-policy.yaml","queue\execution-queue.yaml","result\execution-result-schema.yaml")
foreach($a in $assets){ if(Test-Path (Join-Path $eng $a)){ Pass "asset: $a" } else { Fail "missing: $a" } }
foreach($x in @("code-executor","shell-executor","mcp-executor","test-executor","browser-executor")){ if(Test-Path (Join-Path $eng "executors\$x.yaml")){ Pass "executor: $x" } else { Fail "missing executor: $x" } }

# ---------- schema invariants + forbidden ----------
Write-Host "`n[Schema]"
$sch = Get-Content -Raw -Encoding UTF8 (Join-Path $eng "engine-schema.yaml")
$inv = ([regex]::Matches($sch, 'ee-\d:')).Count
if($inv -ge 6){ Pass "engine-schema has $inv invariants (ee-1..)" } else { Fail "invariants < 6: $inv" }
$states = @("prepared","authorized","queued","running","completed","failed","cancelled","rolled_back")
$sok=$true; foreach($s in $states){ if($sch -notmatch "`"$s`""){ $sok=$false } }
if($sok){ Pass "state machine complete (8 states)" } else { Fail "state machine incomplete" }
if($sch -match 'auto_execute' -and $sch -match 'bypass_permission' -and $sch -match 'skip_quality'){ Pass "schema declares forbidden_fields" } else { Fail "forbidden_fields missing" }

# forbidden fields must NOT appear as real keys in engine-state
$state = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "engine-state.yaml")
$hasForbidden = [regex]::IsMatch($state, '(?m)^\s*(auto_execute|auto_approve|bypass_permission|skip_quality)\s*:')
if(-not $hasForbidden){ Pass "engine-state free of forbidden fields" } else { Fail "engine-state contains forbidden field" }

# ---------- executor registry (5) subset of actions ----------
Write-Host "`n[Executor Registry]"
$reg = Get-Content -Raw -Encoding UTF8 (Join-Path $eng "executor-registry.yaml")
$execs = [regex]::Matches($reg, 'id: "([a-z-]+executor)"') | ForEach-Object { $_.Groups[1].Value }
if($execs.Count -eq 5){ Pass "5 executors registered ($($execs -join ','))" } else { Fail "executor count=$($execs.Count)" }

# ---------- three-layer separation (Context/Action/Execution) ----------
Write-Host "`n[Three-layer separation]"
$ctxOk = Test-Path (Join-Path $root ".ai\context\runtime\runtime-context.yaml")
$actOk = Test-Path (Join-Path $root ".ai\context\runtime-action\action-ledger.yaml")
$exeOk = Test-Path (Join-Path $ctx "engine-state.yaml")
if($ctxOk -and $actOk -and $exeOk){ Pass "Context + Action + Execution layers all present & separate" } else { Fail "three-layer separation broken" }
# Agent must not call executor directly: engine-schema documents ee-3
if($sch -match 'Agent 不得直接调用 Executor' -or $sch -match 'ee-3'){ Pass "ee-3: Agent must not call Executor directly (documented)" } else { Fail "ee-3 missing" }

# ---------- Case1: low-risk doc generation -> completed ----------
Write-Host "`n[Case1] low-risk document generation"
if(($state -match '(?s)EE-0001[\s\S]*?executor:\s*"code-executor"[\s\S]*?status:\s*"completed"')){ Pass "Case1: EE-0001 approved -> executor -> completed" } else { Fail "Case1 chain broken" }

# ---------- Case2: code change -> quality gate ----------
Write-Host "`n[Case2] code change -> quality gate"
$results = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "execution-results.yaml")
if(($state -match '(?s)EE-0002[\s\S]*?status:\s*"completed"') -and ($results -match '(?s)EE-0002[\s\S]*?quality_ref:')){ Pass "Case2: EE-0002 code change completed + quality_ref" } else { Fail "Case2 quality link missing" }

# ---------- Case3: unapproved action -> blocked ----------
Write-Host "`n[Case3] unapproved execution blocked"
$ap2 = Get-Content -Raw -Encoding UTF8 (Join-Path $root "platform\runtime-action\records\AP-0002-run-regression.yaml")
if(($ap2 -match 'status: "pending"') -and ($state -match '(?s)EE-0003[\s\S]*?status:\s*"cancelled"')){ Pass "Case3: AP-0002 pending -> EE-0003 blocked (cancelled)" } else { Fail "Case3 block failed" }

# ---------- Case4: permission denied ----------
Write-Host "`n[Case4] permission denied"
$perm = Get-Content -Raw -Encoding UTF8 (Join-Path $eng "permission\execution-permission.yaml")
if(($state -match '(?s)EE-0004[\s\S]*?permission_granted:\s*false[\s\S]*?status:\s*"failed"')){ Pass "Case4: EE-0004 permission denied -> failed" } else { Fail "Case4 permission-denied path missing" }
if($perm -match 'permission 与 action approval 独立' -or $perm -match 'independent'){ Pass "Case4: permission != action approval (independent states, ee-2)" } else { Fail "Case4 independence rule missing" }

# ---------- Case5: execution failed -> Recovery ----------
Write-Host "`n[Case5] execution failed -> Recovery"
if(($state -match '(?s)EE-0005[\s\S]*?status:\s*"failed"[\s\S]*?recovery_ref:') -and ($results -match '(?s)EE-0005[\s\S]*?recovery_ref:')){ Pass "Case5: EE-0005 failed -> recovery_ref (connects Recovery)" } else { Fail "Case5 recovery link missing" }

# ---------- Case6: MCP execution ----------
Write-Host "`n[Case6] MCP execution (playwright)"
if(($state -match '(?s)EE-0006[\s\S]*?executor:\s*"mcp-executor"[\s\S]*?status:\s*"completed"') -and ($state -match 'mcp:\s*"playwright"')){ Pass "Case6: EE-0006 mcp-executor -> playwright -> completed" } else { Fail "Case6 mcp execution missing" }
$mcpEx = Get-Content -Raw -Encoding UTF8 (Join-Path $eng "executors\mcp-executor.yaml")
if($mcpEx -match 'playwright' -and $mcpEx -match 'allowed_mcp'){ Pass "Case6: mcp-executor allows only registered MCP (incl playwright)" } else { Fail "Case6 mcp-executor allowlist missing" }

# ---------- Case7: full chain ----------
Write-Host "`n[Case7] full chain Router->Agent->Action->Approval->Execution->Quality->Observability"
$fullChain = ($state -match 'action_ref:\s*"AP-0001"') -and ($results -match 'quality_ref:') -and ($results -match 'observability_ref:')
if($fullChain){ Pass "Case7: full governed chain linked (action->approval->execution->quality->observability)" } else { Fail "Case7 chain incomplete" }

# ---------- Case8: plugin isolation (no host mutation) ----------
Write-Host "`n[Case8] plugin isolation (Execution Engine -> OpenCode, no host change)"
$before = Snapshot $hostCfg
$null = & node $cli execution status 2>&1
$null = & node $cli execution validate 2>&1
Start-Sleep -Milliseconds 50
$after = Snapshot $hostCfg
$d = DiffH $before $after
if($d.Count -eq 0){ Pass "Case8: execution CLI leaves ~/.config/opencode unchanged (0 mutations)" } else { Fail ("Case8 host mutated: " + ($d -join '; ')) }
$eb = Join-Path $root "plugin\opencode\execution-bridge.ts"
if(Test-Path $eb){
  $ebTxt = Get-Content -Raw -Encoding UTF8 $eb
  if(($ebTxt -match 'refuseActionGeneration') -and ($ebTxt -match 'admitExecution') -and ($ebTxt -match 'guardHostWrite')){ Pass "Case8: execution-bridge admits governed-only + refuses action-generation + host guard" } else { Fail "Case8 execution-bridge guards missing" }
} else { Fail "Case8 execution-bridge.ts missing" }

# ---------- CLI execution commands ----------
Write-Host "`n[CLI execution]"
$r1 = (& node $cli execution status 2>&1) -join "`n"
if($r1 -match "execution status" -and $r1 -match "EE-0001"){ Pass "CLI: myteam execution status" } else { Fail "CLI execution status failed" }
$r2 = (& node $cli execution trace refund-feature 2>&1) -join "`n"
if($r2 -match "Action -> Approval -> Execution -> Result"){ Pass "CLI: myteam execution trace TASK_ID" } else { Fail "CLI execution trace failed" }
$r3 = (& node $cli execution validate 2>&1) -join "`n"
if($r3 -match "execution validate: PASS"){ Pass "CLI: myteam execution validate PASS" } else { Fail "CLI execution validate failed" }

# ---------- execution-policy critical proposal-only ----------
Write-Host "`n[Policy]"
$pol = Get-Content -Raw -Encoding UTF8 (Join-Path $eng "execution-policy.yaml")
if($pol -match '(?s)critical[\s\S]*?proposal' -and $pol -match 'execute: false'){ Pass "policy: critical = proposal-only (no auto execution)" } else { Fail "policy critical rule missing" }
if($pol -match '禁止自动提升权限' -or $pol -match 'no.*escalation'){ Pass "policy: no auto permission escalation" } else { Fail "policy escalation guard missing" }

# ---------- prompts + metadata ----------
Write-Host "`n[Prompts + Metadata]"
$health = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\engops\project-health-agent.md")
if($health -match 'Execution Engine' -and $health -match '\b20\.'){ Pass "project-health-agent Execution Engine check (item 20)" } else { Fail "health engine check missing" }
$engops = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\leads\engops-lead.md")
if($engops -match 'Execution Engine 生命周期'){ Pass "engops-lead Execution Engine lifecycle present" } else { Fail "engops engine lifecycle missing" }
$pm = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\pm\project-manager-agent.md")
if($pm -match 'execution status' -or $pm -match 'Execution 状态'){ Pass "project-manager reads execution status" } else { Fail "pm execution status missing" }
$mfest = Get-Content -Raw -Encoding UTF8 (Join-Path $root "manifest\platform-manifest.yaml")
if($mfest -match 'Controlled Execution Engine' -or $mfest -match 'execution_engine:'){ Pass "manifest lists v1.2 engine" } else { Fail "manifest v1.2 missing" }
$ml = Get-Content -Raw -Encoding UTF8 (Join-Path $root "migration\migration-log.yaml")
if($ml -match 'm-016'){ Pass "migration-log m-016 added" } else { Fail "migration-log m-016 missing" }

# ---------- baseline ----------
Write-Host "`n[Baseline]"
$srcPrompts = (Get-ChildItem (Join-Path $root "source\prompts") -Recurse -Filter *.md).Count
if($srcPrompts -eq 30){ Pass "baseline agent=30" } else { Fail "baseline agent=$srcPrompts" }

Write-Host ""
Write-Host "=== RESULT: $pass pass, $fail fail ==="
if($fail -eq 0){ Write-Host "ALL CHECKS PASSED" } else { Write-Host "SOME CHECKS FAILED"; exit 1 }
