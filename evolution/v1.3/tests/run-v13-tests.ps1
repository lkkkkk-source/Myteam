# =====================================================================
# MyTeam Project Workspace & Collaboration Test — v1.3 (Case1~9)
# =====================================================================
$ErrorActionPreference = 'Stop'
$root = "D:\data\code\Agent\MyTeam"
$ws = Join-Path $root "platform\workspace"
$ctx = Join-Path $root ".ai\context\workspace"
$cli = Join-Path $root "tools\myteam-cli\bin\myteam.mjs"
$hostCfg = "C:\Users\Administrator\.config\opencode"
$env:MYTEAM_WORKSPACE = $root

$pass = 0; $fail = 0
function Pass($m){ Write-Host "  [PASS] $m"; $script:pass++ }
function Fail($m){ Write-Host "  [FAIL] $m"; $script:fail++ }
function Snapshot($b){ $m=@{}; if(Test-Path $b){ Get-ChildItem $b -Recurse -File -Force -EA SilentlyContinue | ForEach-Object { $m[$_.FullName]="$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" } }; return $m }
function DiffH($x,$y){ $c=@(); foreach($k in $y.Keys){ if(-not $x.ContainsKey($k)){$c+="ADD:$k"}elseif($x[$k]-ne$y[$k]){$c+="MOD:$k"} }; foreach($k in $x.Keys){ if(-not $y.ContainsKey($k)){$c+="DEL:$k"} }; return $c }

Write-Host "=== v1.3 MyTeam Project Workspace & Collaboration Tests ==="

# ---------- scaffold ----------
Write-Host "`n[0] Workspace scaffold"
$assets = @("workspace-schema.yaml","workspace-policy.yaml","workspace-manager.yaml","agents\agent-workspace-schema.yaml","snapshots\checkpoint-schema.yaml","changes\change-record-schema.yaml","merge\merge-policy.yaml","artifacts\artifact-link-schema.yaml")
foreach($a in $assets){ if(Test-Path (Join-Path $ws $a)){ Pass "asset: $a" } else { Fail "missing: $a" } }

# ---------- schema invariants + forbidden ----------
Write-Host "`n[Schema]"
$sch = Get-Content -Raw -Encoding UTF8 (Join-Path $ws "workspace-schema.yaml")
$inv = ([regex]::Matches($sch, 'ws-\d:')).Count
if($inv -ge 7){ Pass "workspace-schema has $inv invariants (ws-1..)" } else { Fail "invariants < 7: $inv" }
$states = @("created","initialized","active","checkpointed","reviewing","merged","archived")
$sok=$true; foreach($s in $states){ if($sch -notmatch "`"$s`""){ $sok=$false } }
if($sok){ Pass "workspace state machine complete (7 states)" } else { Fail "state machine incomplete" }
if($sch -match 'auto_merge' -and $sch -match 'auto_delete_checkpoint' -and $sch -match 'forbidden_fields'){ Pass "schema declares forbidden_fields" } else { Fail "forbidden_fields missing" }
# four-layer separation
if($sch -match 'Workspace ≠ Execution ≠ Memory ≠ Artifact' -or $sch -match 'ws-5'){ Pass "four-layer separation documented (ws-5)" } else { Fail "four-layer separation missing" }

# ---------- Case1: create workspace ----------
Write-Host "`n[Case1] create workspace"
$state = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "workspace-state.yaml")
if($state -match 'workspace_id: "WS-0001"' -and $state -match 'task_id: "refund-feature"'){ Pass "Case1: task start -> WS-0001 created" } else { Fail "Case1 workspace not created" }

# ---------- Case2: parallel agents isolated ----------
Write-Host "`n[Case2] parallel agents isolated"
$devWs = $state -match '(?s)WS-0001[\s\S]*?agent: "java-developer"'
$testWs = $state -match '(?s)WS-0002[\s\S]*?agent: "java-tester"'
$branches = [regex]::Matches($state, 'branch: "([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$uniqBranch = ($branches | Select-Object -Unique).Count -eq $branches.Count
if($devWs -and $testWs -and $uniqBranch){ Pass "Case2: developer + tester separate workspaces, unique branches (no cross-pollution)" } else { Fail "Case2 isolation broken" }
# no cross-agent write: each change's agent matches its workspace binding
$changes = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "changes\change-records.yaml")
$ch1ok = $changes -match '(?s)CH-0001[\s\S]*?workspace_id: "WS-0001"[\s\S]*?agent: "java-developer"'
$ch2ok = $changes -match '(?s)CH-0002[\s\S]*?workspace_id: "WS-0002"[\s\S]*?agent: "java-tester"'
if($ch1ok -and $ch2ok){ Pass "Case2: changes bound to owning agent workspace (ws-2)" } else { Fail "Case2 change-workspace binding wrong" }

# ---------- Case3: checkpoint ----------
Write-Host "`n[Case3] checkpoint"
$cp1 = Test-Path (Join-Path $ctx "snapshots\CP-0001.yaml")
$cp2 = Test-Path (Join-Path $ctx "snapshots\CP-0002.yaml")
if($cp1 -and $cp2){ Pass "Case3: modify -> checkpoint (CP-0001/CP-0002)" } else { Fail "Case3 checkpoint missing" }
$cpTxt = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "snapshots\CP-0001.yaml")
if($cpTxt -match 'state_hash:' -and $cpTxt -match 'files_snapshot:'){ Pass "Case3: checkpoint has state_hash + files_snapshot" } else { Fail "Case3 checkpoint fields missing" }

# ---------- Case4: failure recovery ----------
Write-Host "`n[Case4] failure recovery (restore checkpoint)"
if($cpTxt -match 'recovery_ref:.*recovery/checkpoints'){ Pass "Case4: checkpoint connects Recovery (restore on failure, reuse Recovery)" } else { Fail "Case4 recovery link missing" }
$cpSchema = Get-Content -Raw -Encoding UTF8 (Join-Path $ws "snapshots\checkpoint-schema.yaml")
if($cpSchema -match '只增不删' -or $cpSchema -match 'append'){ Pass "Case4: checkpoint append-only (no auto-delete, ws-4)" } else { Fail "Case4 append-only rule missing" }

# ---------- Case5: review rejected -> merge blocked ----------
Write-Host "`n[Case5] review rejected -> merge blocked"
$merges = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "merge\merge-requests.yaml")
if($merges -match '(?s)MG-0001[\s\S]*?status: "rejected"'){ Pass "Case5: MG-0001 review rejected -> merge blocked" } else { Fail "Case5 reject path missing" }
if($merges -match 'automatic_merge: false'){ Pass "Case5: automatic_merge=false (no auto merge, ws-3)" } else { Fail "Case5 automatic_merge guard missing" }

# ---------- Case6: quality passed -> approved merge ----------
Write-Host "`n[Case6] quality passed -> approved merge"
if($merges -match '(?s)MG-0002[\s\S]*?status: "merged"' -and $merges -match '(?s)MG-0002[\s\S]*?quality_ref:'){ Pass "Case6: MG-0002 quality passed + approved -> merged" } else { Fail "Case6 approved merge missing" }

# ---------- Case7: artifact link ----------
Write-Host "`n[Case7] artifact link"
$links = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "artifact-links.yaml")
if($links -match '(?s)workspace_id: "WS-0002"[\s\S]*?changes:[\s\S]*?CH-0002' -and $links -match 'quality_ref:'){ Pass "Case7: workspace change -> artifact (WS-0002/CH-0002, with quality_ref)" } else { Fail "Case7 artifact link missing" }

# ---------- Case8: full chain ----------
Write-Host "`n[Case8] full chain Router->Agent->Workspace->Execution->Quality->Merge->Artifact"
$chainOk = ($state -match 'WS-0002') -and ($changes -match 'execution_ref: "EE-0006"') -and ($merges -match '(?s)MG-0002[\s\S]*?merged') -and ($links -match 'CH-0002')
if($chainOk){ Pass "Case8: full chain linked (workspace->change[exec EE-0006]->quality->merge->artifact)" } else { Fail "Case8 chain incomplete" }
# execution request must carry workspace_ref concept (ws-6): change has execution_ref
if($changes -match 'execution_ref: "EE-'){ Pass "Case8: change carries execution_ref (ws-6 executor operates governed workspace)" } else { Fail "Case8 execution_ref missing" }

# ---------- Case9: plugin isolation ----------
Write-Host "`n[Case9] plugin isolation (workspace ops, OpenCode host 0 change)"
$before = Snapshot $hostCfg
$null = & node $cli workspace status 2>&1
$null = & node $cli workspace validate 2>&1
Start-Sleep -Milliseconds 50
$after = Snapshot $hostCfg
$d = DiffH $before $after
if($d.Count -eq 0){ Pass "Case9: workspace CLI leaves ~/.config/opencode unchanged (0 mutations)" } else { Fail ("Case9 host mutated: " + ($d -join '; ')) }

# ---------- CLI workspace commands ----------
Write-Host "`n[CLI workspace]"
$r1 = (& node $cli workspace status 2>&1) -join "`n"
if($r1 -match "workspace status" -and $r1 -match "WS-0001"){ Pass "CLI: myteam workspace status" } else { Fail "CLI workspace status failed" }
$r2 = (& node $cli workspace list 2>&1) -join "`n"
if($r2 -match "WS-0001" -and $r2 -match "WS-0002"){ Pass "CLI: myteam workspace list" } else { Fail "CLI workspace list failed" }
$r3 = (& node $cli workspace trace WS-0002 2>&1) -join "`n"
if($r3 -match "Agent -> Change -> Checkpoint -> Review -> Merge"){ Pass "CLI: myteam workspace trace ID" } else { Fail "CLI workspace trace failed" }
$r4 = (& node $cli workspace validate 2>&1) -join "`n"
if($r4 -match "workspace validate: PASS"){ Pass "CLI: myteam workspace validate PASS" } else { Fail "CLI workspace validate failed" }

# ---------- reviewer permission ----------
Write-Host "`n[Permission]"
$aw = Get-Content -Raw -Encoding UTF8 (Join-Path $ws "agents\agent-workspace-schema.yaml")
if($aw -match '(?s)java-reviewer[\s\S]*?changes_allowed: \[ "none" \]'){ Pass "reviewer changes_allowed=none (cannot modify code)" } else { Fail "reviewer permission wrong" }
$bindings = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "agents\agent-bindings.yaml")
if($changes -notmatch 'agent: "java-reviewer"'){ Pass "no change record from reviewer (permission enforced)" } else { Fail "reviewer produced a change (violation)" }

# ---------- execution engine integration (workspace_ref) ----------
Write-Host "`n[Execution integration]"
$mgr = Get-Content -Raw -Encoding UTF8 (Join-Path $ws "workspace-manager.yaml")
if($mgr -match 'workspace_ref' -and $mgr -match 'execution-engine'){ Pass "workspace-manager integrates execution-engine (workspace_ref)" } else { Fail "execution integration missing" }

# ---------- memory integration (pointer only) ----------
Write-Host "`n[Memory integration]"
if($mgr -match '(?s)memory[\s\S]*?pointer' -or $mgr -match '只存 workspace pointer'){ Pass "memory stores workspace/checkpoint pointer only (not full content, ws-5)" } else { Fail "memory integration rule missing" }

# ---------- prompts + metadata ----------
Write-Host "`n[Prompts + Metadata]"
$health = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\engops\project-health-agent.md")
if($health -match 'Workspace' -and $health -match '\b21\.'){ Pass "project-health-agent Workspace check (item 21)" } else { Fail "health workspace check missing" }
$engops = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\leads\engops-lead.md")
if($engops -match 'Workspace' -and $engops -match 'infrastructure'){ Pass "engops-lead workspace infrastructure present" } else { Fail "engops workspace missing" }
$pm = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\pm\project-manager-agent.md")
if($pm -match 'workspace' -and $pm -match 'lifecycle'){ Pass "project-manager reads workspace lifecycle" } else { Fail "pm workspace missing" }
$mfest = Get-Content -Raw -Encoding UTF8 (Join-Path $root "manifest\platform-manifest.yaml")
if($mfest -match 'Workspace & Collaboration' -or $mfest -match 'workspace:'){ Pass "manifest lists v1.3 workspace" } else { Fail "manifest v1.3 missing" }
$ml = Get-Content -Raw -Encoding UTF8 (Join-Path $root "migration\migration-log.yaml")
if($ml -match 'm-017'){ Pass "migration-log m-017 added" } else { Fail "migration-log m-017 missing" }

# ---------- baseline ----------
Write-Host "`n[Baseline]"
$srcPrompts = (Get-ChildItem (Join-Path $root "source\prompts") -Recurse -Filter *.md).Count
if($srcPrompts -eq 30){ Pass "baseline agent=30" } else { Fail "baseline agent=$srcPrompts" }

Write-Host ""
Write-Host "=== RESULT: $pass pass, $fail fail ==="
if($fail -eq 0){ Write-Host "ALL CHECKS PASSED" } else { Write-Host "SOME CHECKS FAILED"; exit 1 }
