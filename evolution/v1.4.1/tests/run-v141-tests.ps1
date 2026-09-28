# =====================================================================
# MyTeam Debug & Trace Mode Test — v1.4.1 (Case1~10)
# =====================================================================
$ErrorActionPreference = 'Stop'
$root = "D:\data\code\Agent\MyTeam"
$tr = Join-Path $root "platform\debug-trace"
$ctx = Join-Path $root ".ai\context\debug-trace"
$cli = Join-Path $root "tools\myteam-cli\bin\myteam.mjs"
$hostCfg = "C:\Users\Administrator\.config\opencode"
$env:MYTEAM_WORKSPACE = $root

$pass = 0; $fail = 0
function Pass($m){ Write-Host "  [PASS] $m"; $script:pass++ }
function Fail($m){ Write-Host "  [FAIL] $m"; $script:fail++ }
function Snapshot($b){ $m=@{}; if(Test-Path $b){ Get-ChildItem $b -Recurse -File -Force -EA SilentlyContinue | ForEach-Object { $m[$_.FullName]="$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" } }; return $m }
function DiffH($x,$y){ $c=@(); foreach($k in $y.Keys){ if(-not $x.ContainsKey($k)){$c+="ADD:$k"}elseif($x[$k]-ne$y[$k]){$c+="MOD:$k"} }; foreach($k in $x.Keys){ if(-not $y.ContainsKey($k)){$c+="DEL:$k"} }; return $c }

Write-Host "=== v1.4.1 MyTeam Debug & Trace Mode Tests ==="

# ---------- scaffold ----------
Write-Host "`n[0] Trace scaffold"
$assets = @("trace-schema.yaml","trace-event-schema.yaml","trace-policy.yaml","collectors\router-trace.yaml","collectors\collaboration-trace.yaml","collectors\workspace-trace.yaml","collectors\execution-trace.yaml","collectors\quality-trace.yaml","storage","queries\trace-query-schema.yaml","reports\trace-report-schema.yaml")
foreach($a in $assets){ if(Test-Path (Join-Path $tr $a)){ Pass "asset: $a" } else { Fail "missing: $a" } }

# ---------- schema invariants + forbidden ----------
Write-Host "`n[Schema]"
$sch = Get-Content -Raw -Encoding UTF8 (Join-Path $tr "trace-schema.yaml")
$inv = ([regex]::Matches($sch, 'tr-\d:')).Count
if($inv -ge 6){ Pass "trace-schema has $inv invariants (tr-1..)" } else { Fail "invariants < 6: $inv" }
$states = @("created","running","completed","failed","archived")
$sok=$true; foreach($s in $states){ if($sch -notmatch "`"$s`""){ $sok=$false } }
if($sok){ Pass "trace state machine complete (5 states)" } else { Fail "state machine incomplete" }
if($sch -match 'auto_execute' -and $sch -match 'auto_repair' -and $sch -match 'forbidden_fields'){ Pass "schema declares forbidden_fields" } else { Fail "forbidden_fields missing" }

# ---------- Case1: create task trace ----------
Write-Host "`n[Case1] create task trace"
$idx = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "trace-index.yaml")
if($idx -match 'trace_id: "TR-0001"' -and $idx -match 'task_id: "refund-feature"'){ Pass "Case1: TR-0001 generated for refund-feature" } else { Fail "Case1 trace_id missing" }

# ---------- events ----------
$ev = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "events\TR-0001-events.yaml")

# ---------- Case2: router trace ----------
Write-Host "`n[Case2] router trace"
if($ev -match '(?s)layer: "router"[\s\S]*?event_type: "classification_completed"'){ Pass "Case2: router classification event linked" } else { Fail "Case2 router event missing" }

# ---------- Case3: collaboration trace ----------
Write-Host "`n[Case3] collaboration trace"
if($ev -match '(?s)layer: "collaboration"[\s\S]*?reference: ".*handoff-history.yaml#HO-0001"'){ Pass "Case3: collaboration handoff (HO-0001) linked" } else { Fail "Case3 collaboration event missing" }

# ---------- Case4: workspace trace ----------
Write-Host "`n[Case4] workspace trace"
if($ev -match '(?s)layer: "workspace"[\s\S]*?reference: ".*change-records.yaml#CH-0001"'){ Pass "Case4: workspace change (CH-0001) linked" } else { Fail "Case4 workspace event missing" }

# ---------- Case5: execution trace (action->approval->execution) ----------
Write-Host "`n[Case5] execution trace"
$hasAction = $ev -match 'layer: "action"[\s\S]*?AP-0001'
$hasApproval = $ev -match 'layer: "approval"[\s\S]*?AP-0001'
$hasExec = $ev -match 'layer: "execution"[\s\S]*?EE-0002'
if($hasAction -and $hasApproval -and $hasExec){ Pass "Case5: action -> approval -> execution chain (AP-0001 -> EE-0002)" } else { Fail "Case5 execution chain incomplete" }

# ---------- Case6: quality trace ----------
Write-Host "`n[Case6] quality trace"
if($ev -match '(?s)layer: "quality"[\s\S]*?event_type: "gate_passed"'){ Pass "Case6: quality gate_passed linked" } else { Fail "Case6 quality event missing" }

# ---------- Case7: memory compression (pointer only) ----------
Write-Host "`n[Case7] memory compression (pointer only)"
$mem = Get-Content -Raw -Encoding UTF8 (Join-Path $root ".ai\context\memory\task-memory.yaml")
# memory should reference collaboration/trace pointer, not full trace events
if($mem -notmatch 'EV-0001' -and $mem -notmatch 'TR-0001-events'){ Pass "Case7: memory does NOT store full trace events (tr-6)" } else { Fail "Case7 memory contains full trace" }
if($ev -notmatch '```'){ Pass "Case7: trace events store pointers only (no code blocks, tr-1)" } else { Fail "Case7 trace contains code" }

# ---------- Case8: full chain (12 layers) ----------
Write-Host "`n[Case8] full chain (12 layers)"
$layers = @("router","team","agent","collaboration","workspace","action","approval","execution","quality","artifact","memory","evolution")
$missing = @($layers | Where-Object { $ev -notmatch "layer: `"$_`"" })
if($missing.Count -eq 0){ Pass "Case8: full lifecycle chain covers all 12 layers" } else { Fail ("Case8 missing layers: " + ($missing -join ',')) }

# ---------- Case9: trace query (CLI show) ----------
Write-Host "`n[Case9] trace query"
$r = (& node $cli trace show refund-feature 2>&1) -join "`n"
if($r -match "trace=TR-0001" -and $r -match "layers=13/13"){ Pass "Case9: myteam trace show TASK_ID (12/12 layers)" } else { Fail "Case9 trace show failed" }

# ---------- Case10: plugin isolation ----------
Write-Host "`n[Case10] plugin isolation"
$before = Snapshot $hostCfg
$null = & node $cli trace status 2>&1
$null = & node $cli trace validate 2>&1
$null = & node $cli trace show refund-feature 2>&1
Start-Sleep -Milliseconds 50
$after = Snapshot $hostCfg
$d = DiffH $before $after
if($d.Count -eq 0){ Pass "Case10: trace CLI leaves ~/.config/opencode unchanged (0 mutations)" } else { Fail ("Case10 host mutated: " + ($d -join '; ')) }

# ---------- CLI trace commands ----------
Write-Host "`n[CLI trace]"
$r1 = (& node $cli trace status 2>&1) -join "`n"
if($r1 -match "trace status" -and $r1 -match "TR-0001"){ Pass "CLI: myteam trace status" } else { Fail "CLI trace status failed" }
$r2 = (& node $cli trace timeline refund-feature 2>&1) -join "`n"
if($r2 -match "timeline" -and $r2 -match "\[router\]"){ Pass "CLI: myteam trace timeline TASK_ID" } else { Fail "CLI trace timeline failed" }
$r3 = (& node $cli trace validate 2>&1) -join "`n"
if($r3 -match "trace validate: PASS"){ Pass "CLI: myteam trace validate PASS" } else { Fail "CLI trace validate failed" }

# ---------- reference validity ----------
Write-Host "`n[Reference validity]"
$refs = [regex]::Matches($ev, 'reference: "([^"#]+)') | ForEach-Object { $_.Groups[1].Value }
$badRef = @()
foreach($rf in ($refs | Select-Object -Unique)) { if(-not (Test-Path (Join-Path $root $rf))) { $badRef += $rf } }
if($badRef.Count -eq 0){ Pass "all trace references point to real sources ($($refs.Count) refs)" } else { Fail ("bad refs: " + ($badRef -join ',')) }

# ---------- observability trace metrics ----------
Write-Host "`n[Observability]"
$rep = Get-Content -Raw -Encoding UTF8 (Join-Path $tr "reports\trace-report-schema.yaml")
if($rep -match 'trace_complete_rate' -and $rep -match 'missing_reference_count' -and $rep -match 'avg_task_trace_duration'){ Pass "trace metrics defined (complete_rate/missing_ref/avg_duration)" } else { Fail "trace metrics missing" }

# ---------- prompts + metadata ----------
Write-Host "`n[Prompts + Metadata]"
$health = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\engops\project-health-agent.md")
if($health -match 'Trace 一致性' -and $health -match '\b23\.'){ Pass "project-health-agent Trace check (item 23)" } else { Fail "health trace check missing" }
$engops = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\leads\engops-lead.md")
if($engops -match 'Debug & Trace 生命周期'){ Pass "engops-lead Trace lifecycle present" } else { Fail "engops trace missing" }
$pm = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\pm\project-manager-agent.md")
if($pm -match 'Trace 状态读取'){ Pass "project-manager reads trace status" } else { Fail "pm trace missing" }
$mfest = Get-Content -Raw -Encoding UTF8 (Join-Path $root "manifest\platform-manifest.yaml")
if($mfest -match 'Debug & Trace Mode' -or $mfest -match 'debug_trace:'){ Pass "manifest lists v1.4.1 trace" } else { Fail "manifest v1.4.1 missing" }
$ml = Get-Content -Raw -Encoding UTF8 (Join-Path $root "migration\migration-log.yaml")
if($ml -match 'm-019'){ Pass "migration-log m-019 added" } else { Fail "migration-log m-019 missing" }

# ---------- baseline ----------
Write-Host "`n[Baseline]"
$srcPrompts = (Get-ChildItem (Join-Path $root "source\prompts") -Recurse -Filter *.md).Count
if($srcPrompts -eq 30){ Pass "baseline agent=30" } else { Fail "baseline agent=$srcPrompts" }

Write-Host ""
Write-Host "=== RESULT: $pass pass, $fail fail ==="
if($fail -eq 0){ Write-Host "ALL CHECKS PASSED" } else { Write-Host "SOME CHECKS FAILED"; exit 1 }
