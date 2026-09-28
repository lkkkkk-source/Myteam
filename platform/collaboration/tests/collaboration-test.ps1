# =====================================================================
# MyTeam Agent Collaboration Protocol Test — v1.4 (Case1~9)
# =====================================================================
$ErrorActionPreference = 'Stop'
$root = "D:\data\code\Agent\MyTeam"
$cb = Join-Path $root "platform\collaboration"
$ctx = Join-Path $root ".ai\context\collaboration"
$cli = Join-Path $root "tools\myteam-cli\bin\myteam.mjs"
$hostCfg = "C:\Users\Administrator\.config\opencode"
$env:MYTEAM_WORKSPACE = $root

$pass = 0; $fail = 0
function Pass($m){ Write-Host "  [PASS] $m"; $script:pass++ }
function Fail($m){ Write-Host "  [FAIL] $m"; $script:fail++ }
function Snapshot($b){ $m=@{}; if(Test-Path $b){ Get-ChildItem $b -Recurse -File -Force -EA SilentlyContinue | ForEach-Object { $m[$_.FullName]="$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" } }; return $m }
function DiffH($x,$y){ $c=@(); foreach($k in $y.Keys){ if(-not $x.ContainsKey($k)){$c+="ADD:$k"}elseif($x[$k]-ne$y[$k]){$c+="MOD:$k"} }; foreach($k in $x.Keys){ if(-not $y.ContainsKey($k)){$c+="DEL:$k"} }; return $c }

Write-Host "=== v1.4 MyTeam Agent Collaboration Protocol Tests ==="

# ---------- scaffold ----------
Write-Host "`n[0] Collaboration scaffold"
$assets = @("collaboration-schema.yaml","message-schema.yaml","handoff-schema.yaml","decision-schema.yaml","conflict-schema.yaml","policies\collaboration-policy.yaml")
foreach($a in $assets){ if(Test-Path (Join-Path $cb $a)){ Pass "asset: $a" } else { Fail "missing: $a" } }

# ---------- schema invariants + forbidden ----------
Write-Host "`n[Schema]"
$sch = Get-Content -Raw -Encoding UTF8 (Join-Path $cb "collaboration-schema.yaml")
$inv = ([regex]::Matches($sch, 'cl-\d:')).Count
if($inv -ge 7){ Pass "collaboration-schema has $inv invariants (cl-1..)" } else { Fail "invariants < 7: $inv" }
$states = @("created","active","waiting","resolved","archived")
$sok=$true; foreach($s in $states){ if($sch -notmatch "`"$s`""){ $sok=$false } }
if($sok){ Pass "state machine complete (5 states)" } else { Fail "state machine incomplete" }
if($sch -match 'auto_resolve' -and $sch -match 'auto_execute' -and $sch -match 'forbidden_fields'){ Pass "schema declares forbidden_fields" } else { Fail "forbidden_fields missing" }
if($sch -match 'Collaboration ≠ Memory ≠ Workspace ≠ Execution' -or $sch -match 'cl-4'){ Pass "four-layer boundary documented (cl-4)" } else { Fail "four-layer boundary missing" }

# ---------- Case1: agent message ----------
Write-Host "`n[Case1] agent message (developer -> tester)"
$msg = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "messages\message-history.yaml")
if($msg -match '(?s)MSG-0001[\s\S]*?from_agent: "java-developer"[\s\S]*?to_agent: "java-tester"'){ Pass "Case1: MSG-0001 developer -> tester" } else { Fail "Case1 message missing" }
# content is conclusion only (no full code fence)
if($msg -notmatch '```'){ Pass "Case1: messages store conclusions only (no full code, cl-3)" } else { Fail "Case1 message contains code block" }

# ---------- Case2: handoff ----------
Write-Host "`n[Case2] handoff (architect -> developer)"
$ho = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "handoffs\handoff-history.yaml")
if($ho -match '(?s)HO-0001[\s\S]*?from: "java-architect"[\s\S]*?to: "java-developer"' -and $ho -match 'constraints:' -and $ho -match 'acceptance:'){ Pass "Case2: HO-0001 architect -> developer with constraints + acceptance" } else { Fail "Case2 handoff incomplete" }
if($ho -match '禁止修改数据库结构'){ Pass "Case2: handoff constraint (no DB structure change)" } else { Fail "Case2 constraint missing" }

# ---------- Case3: decision record ----------
Write-Host "`n[Case3] decision record (multi-option)"
$de = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "decisions\decision-records.yaml")
if($de -match '(?s)DE-0001[\s\S]*?options:[\s\S]*?selected_option:[\s\S]*?reason:'){ Pass "Case3: DE-0001 options + selected + reason" } else { Fail "Case3 decision incomplete" }

# ---------- Case4: conflict resolution ----------
Write-Host "`n[Case4] conflict (reviewer reject developer change)"
$cf = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "conflicts\conflict-records.yaml")
if($cf -match '(?s)CF-0001[\s\S]*?participants:[\s\S]*?java-reviewer[\s\S]*?resolution:[\s\S]*?resolver:'){ Pass "Case4: CF-0001 reviewer reject -> resolution + resolver recorded" } else { Fail "Case4 conflict resolution missing" }
if($cf -match 'resolver: "java-lead"' -or $cf -match 'never auto-resolved'){ Pass "Case4: conflict resolved by human/lead (not auto, cl-5)" } else { Fail "Case4 resolver not human" }

# ---------- Case5: workspace reference ----------
Write-Host "`n[Case5] message references workspace"
if($msg -match 'evidence_ref:.*workspace'){ Pass "Case5: message references workspace_ref (evidence_ref)" } else { Fail "Case5 workspace reference missing" }

# ---------- Case6: execution reference (handoff -> action proposal) ----------
Write-Host "`n[Case6] handoff -> action proposal (not direct execution)"
if($ho -match 'downstream_action_proposal: "AP-'){ Pass "Case6: handoff -> action proposal (AP-*), not direct execution (cl-1)" } else { Fail "Case6 action proposal link missing" }

# ---------- Case7: memory compression (pointer only) ----------
Write-Host "`n[Case7] memory stores decision pointer only"
$mem = Get-Content -Raw -Encoding UTF8 (Join-Path $root ".ai\context\memory\task-memory.yaml")
if($mem -match 'collaboration_ref:' -and $mem -match 'key_decisions:'){ Pass "Case7: memory stores collaboration pointer + key decisions" } else { Fail "Case7 memory integration missing" }
# memory must NOT contain full message history
if($mem -notmatch 'MSG-0001'){ Pass "Case7: memory does NOT store full message history (cl-3/cl-4)" } else { Fail "Case7 memory contains full messages" }

# ---------- Case8: full chain ----------
Write-Host "`n[Case8] full chain Router->Team->Agent->Collaboration->Workspace->Action->Execution->Quality"
$state = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "collaboration-state.yaml")
$chainOk = ($state -match 'CO-0001') -and ($msg -match 'evidence_ref:.*workspace') -and ($ho -match 'AP-0002') -and (Test-Path (Join-Path $root ".ai\context\execution-engine\engine-state.yaml"))
if($chainOk){ Pass "Case8: collaboration->workspace->action(AP-0002)->execution chain linked" } else { Fail "Case8 chain incomplete" }

# ---------- Case9: plugin isolation ----------
Write-Host "`n[Case9] plugin isolation (collaboration ops, OpenCode host 0 change)"
$before = Snapshot $hostCfg
$null = & node $cli collaboration status 2>&1
$null = & node $cli collaboration validate 2>&1
Start-Sleep -Milliseconds 50
$after = Snapshot $hostCfg
$d = DiffH $before $after
if($d.Count -eq 0){ Pass "Case9: collaboration CLI leaves ~/.config/opencode unchanged (0 mutations)" } else { Fail ("Case9 host mutated: " + ($d -join '; ')) }

# ---------- CLI collaboration commands ----------
Write-Host "`n[CLI collaboration]"
$r1 = (& node $cli collaboration status 2>&1) -join "`n"
if($r1 -match "collaboration status" -and $r1 -match "CO-0001"){ Pass "CLI: myteam collaboration status" } else { Fail "CLI collaboration status failed" }
$r2 = (& node $cli collaboration trace refund-feature 2>&1) -join "`n"
if($r2 -match "Agent -> Message -> Handoff -> Decision -> Action"){ Pass "CLI: myteam collaboration trace TASK_ID" } else { Fail "CLI collaboration trace failed" }
$r3 = (& node $cli collaboration conflicts 2>&1) -join "`n"
if($r3 -match "CF-0001"){ Pass "CLI: myteam collaboration conflicts" } else { Fail "CLI collaboration conflicts failed" }
$r4 = (& node $cli collaboration validate 2>&1) -join "`n"
if($r4 -match "collaboration validate: PASS"){ Pass "CLI: myteam collaboration validate PASS" } else { Fail "CLI collaboration validate failed" }

# ---------- policy compliance ----------
Write-Host "`n[Policy]"
$pol = Get-Content -Raw -Encoding UTF8 (Join-Path $cb "policies\collaboration-policy.yaml")
if($pol -match 'Agent 自动调用其他 Agent' -and $pol -match 'forbidden'){ Pass "policy: forbids agent auto-call-agent" } else { Fail "policy agent-auto-call guard missing" }
if($pol -match 'Collaboration 直接触发 Execution' -or $pol -match '只产生 request'){ Pass "policy: collaboration cannot directly execute (cl-1)" } else { Fail "policy direct-execution guard missing" }

# ---------- prompts + metadata ----------
Write-Host "`n[Prompts + Metadata]"
$health = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\engops\project-health-agent.md")
if($health -match 'Collaboration 一致性' -and $health -match '\b22\.'){ Pass "project-health-agent Collaboration check (item 22)" } else { Fail "health collaboration check missing" }
$engops = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\leads\engops-lead.md")
if($engops -match 'Collaboration Protocol 生命周期'){ Pass "engops-lead Collaboration protocol lifecycle present" } else { Fail "engops collaboration missing" }
$pm = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\pm\project-manager-agent.md")
if($pm -match 'Collaboration 状态读取' -or $pm -match 'collaboration 状态'){ Pass "project-manager reads collaboration status" } else { Fail "pm collaboration missing" }
$mfest = Get-Content -Raw -Encoding UTF8 (Join-Path $root "manifest\platform-manifest.yaml")
if($mfest -match 'Agent Collaboration Protocol' -or $mfest -match '^collaboration:'){ Pass "manifest lists v1.4 collaboration" } else { Fail "manifest v1.4 missing" }
$ml = Get-Content -Raw -Encoding UTF8 (Join-Path $root "migration\migration-log.yaml")
if($ml -match 'm-018'){ Pass "migration-log m-018 added" } else { Fail "migration-log m-018 missing" }

# ---------- baseline ----------
Write-Host "`n[Baseline]"
$srcPrompts = (Get-ChildItem (Join-Path $root "source\prompts") -Recurse -Filter *.md).Count
if($srcPrompts -eq 30){ Pass "baseline agent=30" } else { Fail "baseline agent=$srcPrompts" }

Write-Host ""
Write-Host "=== RESULT: $pass pass, $fail fail ==="
if($fail -eq 0){ Write-Host "ALL CHECKS PASSED" } else { Write-Host "SOME CHECKS FAILED"; exit 1 }
