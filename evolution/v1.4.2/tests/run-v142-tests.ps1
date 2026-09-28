# =====================================================================
# MyTeam Runtime Safety & Production Guard Test — v1.4.2 (Case1~10)
# =====================================================================
$ErrorActionPreference = 'Stop'
$root = "D:\data\code\Agent\MyTeam"
$sf = Join-Path $root "platform\runtime-safety"
$ctx = Join-Path $root ".ai\context\runtime-safety"
$cli = Join-Path $root "tools\myteam-cli\bin\myteam.mjs"
$hostCfg = "C:\Users\Administrator\.config\opencode"
$env:MYTEAM_WORKSPACE = $root

$pass = 0; $fail = 0
function Pass($m){ Write-Host "  [PASS] $m"; $script:pass++ }
function Fail($m){ Write-Host "  [FAIL] $m"; $script:fail++ }
function Snapshot($b){ $m=@{}; if(Test-Path $b){ Get-ChildItem $b -Recurse -File -Force -EA SilentlyContinue | ForEach-Object { $m[$_.FullName]="$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" } }; return $m }
function DiffH($x,$y){ $c=@(); foreach($k in $y.Keys){ if(-not $x.ContainsKey($k)){$c+="ADD:$k"}elseif($x[$k]-ne$y[$k]){$c+="MOD:$k"} }; foreach($k in $x.Keys){ if(-not $y.ContainsKey($k)){$c+="DEL:$k"} }; return $c }

Write-Host "=== v1.4.2 MyTeam Runtime Safety & Production Guard Tests ==="

# ---------- scaffold ----------
Write-Host "`n[0] Safety scaffold"
$assets = @("safety-policy.yaml","risk-schema.yaml","budget\token-budget-schema.yaml","budget\cost-budget-schema.yaml","budget\budget-policy.yaml","limits\execution-limit.yaml","limits\retry-limit.yaml","limits\loop-detection.yaml","limits\concurrency-limit.yaml","timeout\timeout-policy.yaml","escalation\human-escalation-policy.yaml","integrations\trace-integration.yaml","integrations\execution-integration.yaml","integrations\action-integration.yaml")
foreach($a in $assets){ if(Test-Path (Join-Path $sf $a)){ Pass "asset: $a" } else { Fail "missing: $a" } }

# ---------- schema invariants + forbidden ----------
Write-Host "`n[Schema]"
$pol = Get-Content -Raw -Encoding UTF8 (Join-Path $sf "safety-policy.yaml")
$inv = ([regex]::Matches($pol, 'sf-\d:')).Count
if($inv -ge 6){ Pass "safety-policy has $inv invariants (sf-1..)" } else { Fail "invariants < 6: $inv" }
if($pol -match 'safe-by-default'){ Pass "safe-by-default principle" } else { Fail "safe-by-default missing" }
$states = @("normal","warning","blocked","waiting-human")
$sok=$true; foreach($s in $states){ if($pol -notmatch "`"$s`""){ $sok=$false } }
if($sok){ Pass "safety state machine complete (4 states)" } else { Fail "state machine incomplete" }
if($pol -match 'auto_override' -and $pol -match 'auto_expand_budget' -and $pol -match 'forbidden_fields'){ Pass "schema declares forbidden_fields" } else { Fail "forbidden_fields missing" }

$state = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "safety-state.yaml")

# ---------- Case1: budget check normal ----------
Write-Host "`n[Case1] Budget Check (normal)"
if($state -match '(?s)SF-0001[\s\S]*?check_type: "budget"[\s\S]*?status: "normal"'){ Pass "Case1: SF-0001 budget check normal (pass)" } else { Fail "Case1 budget normal missing" }

# ---------- Case2: budget exceeded -> waiting-human ----------
Write-Host "`n[Case2] Budget Exceeded"
if($state -match '(?s)SF-0002[\s\S]*?check_type: "budget"[\s\S]*?status: "waiting-human"'){ Pass "Case2: SF-0002 budget exceeded -> waiting-human" } else { Fail "Case2 budget exceeded missing" }
if($state -match '禁止自动扩预算' -or (Get-Content -Raw -Encoding UTF8 (Join-Path $sf "budget\budget-policy.yaml")) -match 'auto_expand_budget'){ Pass "Case2: no auto-expand-budget (sf-3)" } else { Fail "Case2 auto-expand guard missing" }

# ---------- Case3: retry limit -> blocked ----------
Write-Host "`n[Case3] Retry Limit"
if($state -match '(?s)SF-0003[\s\S]*?check_type: "limit"[\s\S]*?status: "blocked"'){ Pass "Case3: SF-0003 retry limit reached -> blocked" } else { Fail "Case3 retry limit missing" }
$rl = Get-Content -Raw -Encoding UTF8 (Join-Path $sf "limits\retry-limit.yaml")
if($rl -match 'max_retry: 3' -and $rl -match 'auto_retry_forever'){ Pass "Case3: max_retry=3, no infinite retry" } else { Fail "Case3 retry policy incomplete" }

# ---------- Case4: loop detection ----------
Write-Host "`n[Case4] Loop Detection"
if($state -match '(?s)SF-0004[\s\S]*?check_type: "loop"[\s\S]*?status: "blocked"'){ Pass "Case4: SF-0004 loop detected -> blocked" } else { Fail "Case4 loop detection missing" }
$ld = Get-Content -Raw -Encoding UTF8 (Join-Path $sf "limits\loop-detection.yaml")
if($ld -match 'suspected-loop' -and $ld -match 'auto-change-task-goal'){ Pass "Case4: suspected-loop state + no auto-change-task-goal" } else { Fail "Case4 loop policy incomplete" }

# ---------- Case5: timeout -> Recovery ----------
Write-Host "`n[Case5] Timeout"
if($state -match '(?s)SF-0005[\s\S]*?check_type: "timeout"'){ Pass "Case5: SF-0005 timeout check present" } else { Fail "Case5 timeout missing" }
$tp = Get-Content -Raw -Encoding UTF8 (Join-Path $sf "timeout\timeout-policy.yaml")
if($tp -match 'Recovery' -and $tp -match '30m'){ Pass "Case5: timeout -> Recovery (30m)" } else { Fail "Case5 timeout-recovery missing" }

# ---------- Case6: human escalation (critical) ----------
Write-Host "`n[Case6] Human Escalation"
if($state -match '(?s)SF-0006[\s\S]*?risk_level: "critical"[\s\S]*?status: "waiting-human"'){ Pass "Case6: SF-0006 critical -> human_required (waiting-human)" } else { Fail "Case6 escalation missing" }
$esc = Get-Content -Raw -Encoding UTF8 (Join-Path $sf "escalation\human-escalation-policy.yaml")
if($esc -match 'production deployment' -and $esc -match 'auto-skip-human-confirmation'){ Pass "Case6: critical scenarios + no auto-skip-human-confirmation" } else { Fail "Case6 escalation policy incomplete" }
$escR = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "escalations.yaml")
if($escR -match 'ESC-0001' -and $escR -match 'status: "pending"'){ Pass "Case6: ESC-0001 pending (await human confirmation)" } else { Fail "Case6 escalation record missing" }

# ---------- Case7: execution integration (allowed) ----------
Write-Host "`n[Case7] Execution Integration (allowed)"
if($state -match '(?s)action_ref: "AP-0001"[\s\S]*?safety_status: "allowed"'){ Pass "Case7: safety normal -> execution gate allowed (AP-0001)" } else { Fail "Case7 allowed gate missing" }
$ei = Get-Content -Raw -Encoding UTF8 (Join-Path $sf "integrations\execution-integration.yaml")
if($ei -match 'read_before_execution: true' -and $ei -match 'human_required'){ Pass "Case7: execution engine reads safety status before exec (sf-5)" } else { Fail "Case7 execution integration missing" }

# ---------- Case8: execution block ----------
Write-Host "`n[Case8] Execution Block"
if($state -match '(?s)action_ref: "AP-0002"[\s\S]*?safety_status: "blocked"'){ Pass "Case8: safety blocked -> execution engine rejects (AP-0002)" } else { Fail "Case8 blocked gate missing" }
if($ei -match 'blocked.*拒绝' -or $ei -match 'blocked.*reject'){ Pass "Case8: execution-integration documents blocked->reject" } else { Fail "Case8 blocked reject rule missing" }

# ---------- Case9: trace integration ----------
Write-Host "`n[Case9] Trace Integration"
$ti = Get-Content -Raw -Encoding UTF8 (Join-Path $sf "integrations\trace-integration.yaml")
if($ti -match 'trace_layer: "safety"' -and $ti -match 'budget_checked'){ Pass "Case9: safety events emit trace (layer=safety)" } else { Fail "Case9 trace integration missing" }
$ev = Get-Content -Raw -Encoding UTF8 (Join-Path $root ".ai\context\debug-trace\events\TR-0001-events.yaml")
if($ev -match 'layer: "safety"'){ Pass "Case9: trace TR-0001 includes safety layer event (13 layers)" } else { Fail "Case9 trace safety event missing" }
if($state -match 'trace_ref:'){ Pass "Case9: safety-state has trace_ref" } else { Fail "Case9 trace_ref missing" }

# ---------- Case10: plugin isolation ----------
Write-Host "`n[Case10] Plugin Isolation"
$before = Snapshot $hostCfg
$null = & node $cli safety status 2>&1
$null = & node $cli safety validate 2>&1
$null = & node $cli safety budget refund-feature 2>&1
Start-Sleep -Milliseconds 50
$after = Snapshot $hostCfg
$d = DiffH $before $after
if($d.Count -eq 0){ Pass "Case10: safety CLI leaves ~/.config/opencode unchanged (0 mutations)" } else { Fail ("Case10 host mutated: " + ($d -join '; ')) }

# ---------- CLI safety commands ----------
Write-Host "`n[CLI safety]"
$r1 = (& node $cli safety status 2>&1) -join "`n"
if($r1 -match "safety status" -and $r1 -match "SF-0001"){ Pass "CLI: myteam safety status" } else { Fail "CLI safety status failed" }
$r2 = (& node $cli safety check refund-feature 2>&1) -join "`n"
if($r2 -match "overall:"){ Pass "CLI: myteam safety check TASK_ID" } else { Fail "CLI safety check failed" }
$r3 = (& node $cli safety budget refund-feature 2>&1) -join "`n"
if($r3 -match "token:" -and $r3 -match "cost:"){ Pass "CLI: myteam safety budget TASK_ID" } else { Fail "CLI safety budget failed" }
$r4 = (& node $cli safety violations 2>&1) -join "`n"
if($r4 -match "ESC-0001" -or $r4 -match "SF-0003"){ Pass "CLI: myteam safety violations" } else { Fail "CLI safety violations failed" }
$r5 = (& node $cli safety validate 2>&1) -join "`n"
if($r5 -match "safety validate: PASS"){ Pass "CLI: myteam safety validate PASS" } else { Fail "CLI safety validate failed" }

# ---------- boundary: safety != approval != execution ----------
Write-Host "`n[Boundary]"
if($pol -match 'Safety ≠ Approval ≠ Execution Engine' -or $pol -match 'sf-4'){ Pass "boundary: Safety != Approval != Execution Engine (sf-4)" } else { Fail "boundary sf-4 missing" }
if($state -notmatch '(?m)^\s*(auto_override|auto_expand_budget|auto_escalate_permission)\s*:'){ Pass "safety-state free of forbidden fields" } else { Fail "safety-state contains forbidden field" }

# ---------- prompts + metadata ----------
Write-Host "`n[Prompts + Metadata]"
$health = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\engops\project-health-agent.md")
if($health -match 'Safety 一致性' -and $health -match '\b24\.'){ Pass "project-health-agent Safety check (item 24)" } else { Fail "health safety check missing" }
$engops = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\leads\engops-lead.md")
if($engops -match 'Runtime Safety Policy 生命周期'){ Pass "engops-lead Safety lifecycle present" } else { Fail "engops safety missing" }
$pm = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\pm\project-manager-agent.md")
if($pm -match 'Safety 状态读取'){ Pass "project-manager reads safety status" } else { Fail "pm safety missing" }
$mfest = Get-Content -Raw -Encoding UTF8 (Join-Path $root "manifest\platform-manifest.yaml")
if($mfest -match 'Runtime Safety & Production Guard' -or $mfest -match 'runtime_safety:'){ Pass "manifest lists v1.4.2 safety" } else { Fail "manifest v1.4.2 missing" }
$ml = Get-Content -Raw -Encoding UTF8 (Join-Path $root "migration\migration-log.yaml")
if($ml -match 'm-020'){ Pass "migration-log m-020 added" } else { Fail "migration-log m-020 missing" }

# ---------- baseline ----------
Write-Host "`n[Baseline]"
$srcPrompts = (Get-ChildItem (Join-Path $root "source\prompts") -Recurse -Filter *.md).Count
if($srcPrompts -eq 30){ Pass "baseline agent=30" } else { Fail "baseline agent=$srcPrompts" }

Write-Host ""
Write-Host "=== RESULT: $pass pass, $fail fail ==="
if($fail -eq 0){ Write-Host "ALL CHECKS PASSED" } else { Write-Host "SOME CHECKS FAILED"; exit 1 }
