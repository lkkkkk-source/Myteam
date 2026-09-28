# v0.9 Runtime Controlled Execution Interface Layer 测试
$ErrorActionPreference = 'Stop'
$root = "D:\data\code\Agent\MyTeam"
$exDir = Join-Path $root "platform\runtime-execution"
$recordDir = Join-Path $exDir "records"
$ctxDir = Join-Path $root ".ai\context\runtime-execution"
$spec = Join-Path $root "source\docs\runtime-controlled-execution-spec.md"

$pass = 0; $fail = 0
function Pass($m){ Write-Host "  [PASS] $m"; $script:pass++ }
function Fail($m){ Write-Host "  [FAIL] $m"; $script:fail++ }
function HasForbiddenField($text){
  return [regex]::IsMatch($text, '(?m)^\s*(auto_exec|auto_advance|bypass_approval|auto_generated_action)\s*:')
}

Write-Host "=== v0.9 Runtime Controlled Execution Interface Tests ==="

# ---------- 1. execution assets exist ----------
$assets = @("execution-schema.yaml","executor-registry.yaml","permission-policy.yaml","execution-ledger-schema.yaml","sandbox\sandbox-schema.yaml","rollback\rollback-schema.yaml")
foreach($a in $assets){ if(Test-Path (Join-Path $exDir $a)){ Pass "asset exists: $a" } else { Fail "asset missing: $a" } }

# ---------- 2. execution-schema structure ----------
$sch = Get-Content -Raw -Encoding UTF8 (Join-Path $exDir "execution-schema.yaml")
if($sch -match 'stage: "v0.9"' -and $sch -match 'layer: "runtime-controlled-execution"'){ Pass "execution-schema stage v0.9" } else { Fail "execution-schema stage missing" }
$invCount = ([regex]::Matches($sch, 'ex-\d:')).Count
if($invCount -ge 6){ Pass "execution-schema has $invCount invariants (ex-1..ex-$invCount)" } else { Fail "invariants < 6: $invCount" }
$states = @('prepared','approved','running','completed','failed','rolled_back','cancelled')
$sok=$true; foreach($s in $states){ if($sch -notmatch "`"$s`""){ $sok=$false; Write-Host "    missing state: $s" } }
if($sok){ Pass "execution states complete (7)" } else { Fail "execution states incomplete" }
if($sch -match 'real-execution-engine' -and $sch -match 'approval-bypass' -and $sch -match 'auto-agent-selection'){ Pass "execution-schema not_implemented boundaries present" } else { Fail "not_implemented boundaries missing" }
if($sch -match 'forbidden_fields'){ Pass "execution-schema declares forbidden_fields" } else { Fail "execution-schema forbidden_fields missing" }

# ---------- 3. executor-registry: supported_actions subset of action-policy ----------
$reg = Get-Content -Raw -Encoding UTF8 (Join-Path $exDir "executor-registry.yaml")
$pol = Get-Content -Raw -Encoding UTF8 (Join-Path $root "platform\runtime-action\action-policy.yaml")
$actionTypes = [regex]::Matches($pol, '(?m)^\s{2}- id: "([a-z-]+)"') | ForEach-Object { $_.Groups[1].Value }
$supported = [regex]::Matches($reg, 'supported_actions: \[ ([^\]]*) \]') | ForEach-Object { $_.Groups[1].Value } 
$allSup = @()
foreach($grp in $supported){ $grp -split ',' | ForEach-Object { $v=$_.Trim().Trim('"'); if($v){ $allSup += $v } } }
$badSup = @($allSup | Select-Object -Unique | Where-Object { $actionTypes -notcontains $_ })
if($badSup.Count -eq 0){ Pass "executor supported_actions all in action-policy ($($allSup.Count) refs)" } else { Fail "unknown supported_actions: $($badSup -join ',')" }
$execIds = [regex]::Matches($reg, 'executor_id: "([a-z-]+)"') | ForEach-Object { $_.Groups[1].Value }
if($execIds.Count -ge 6){ Pass "executor-registry has $($execIds.Count) executors" } else { Fail "executors < 6: $($execIds.Count)" }

# ---------- 4. permission-policy: has critical + human ----------
$perm = Get-Content -Raw -Encoding UTF8 (Join-Path $exDir "permission-policy.yaml")
if($perm -match 'risk: "critical"' -and $perm -match 'explicit_user_confirmation'){ Pass "permission-policy has critical→explicit_user_confirmation" } else { Fail "critical mapping missing" }
if($perm -match 'risk: "high"' -and $perm -match 'human_approval'){ Pass "permission-policy has high→human_approval" } else { Fail "high mapping missing" }
if($perm -match 'risk: "low"' -and $perm -match 'workspace_write'){ Pass "permission-policy has low→workspace_write" } else { Fail "low mapping missing" }

# ---------- 5. Case1 low-risk documentation prepared ----------
# permission-policy documentation_update = low + workspace_write
if($perm -match 'action_class: "documentation_update"' -and $perm -match '(?s)documentation_update.*?risk: "low"'){ Pass "Case1: documentation_update low-risk mapping (execution-ready)" } else { Fail "Case1 documentation_update mapping missing" }

# ---------- 6. Case2 code change: EX-0001 approved action -> completed ----------
$ex1 = Get-Content -Raw -Encoding UTF8 (Join-Path $recordDir "EX-0001-refund-calc.yaml")
$ap1 = Get-Content -Raw -Encoding UTF8 (Join-Path $root "platform\runtime-action\records\AP-0001-refund-calc-edit.yaml")
$ex1okExecutor = $ex1 -match 'executor_id: "code-workspace-executor"'
$ex1okApproved = ($ap1 -match 'status: "approved"')
$ex1status = ($ex1 -match 'status: "completed"')
if($ex1okExecutor -and $ex1okApproved -and $ex1status){ Pass "Case2: EX-0001 approved(AP-0001)->executor matched->completed" } else { Fail "Case2 EX-0001 chain broken" }
if(HasForbiddenField $ex1){ Fail "EX-0001 contains forbidden field" } else { Pass "EX-0001 free of forbidden fields" }

# ---------- 7. Case3 unapproved -> execution rejected (cancelled) ----------
$ex2 = Get-Content -Raw -Encoding UTF8 (Join-Path $recordDir "EX-0002-rejected-unapproved.yaml")
$ap2 = Get-Content -Raw -Encoding UTF8 (Join-Path $root "platform\runtime-action\records\AP-0002-run-regression.yaml")
if(($ap2 -match 'status: "pending"') -and ($ex2 -match 'status: "cancelled"') -and ($ex2 -match 'reject_reason')){ Pass "Case3: AP-0002 pending -> EX-0002 cancelled (rejected)" } else { Fail "Case3 unapproved-reject chain broken" }

# ---------- 8. Case4 failed -> rollback ----------
$ex3 = Get-Content -Raw -Encoding UTF8 (Join-Path $recordDir "EX-0003-failed-rollback.yaml")
if(($ex3 -match 'status: "rolled_back"') -and ($ex3 -match 'rollback_ref:')){ Pass "Case4: EX-0003 failed -> rolled_back + rollback_ref" } else { Fail "Case4 rollback chain broken" }
$rb = Join-Path $ctxDir "rollback\RB-0001.yaml"
if(Test-Path $rb){
  $rbTxt = Get-Content -Raw -Encoding UTF8 $rb
  if(($rbTxt -match 'execution_ref: "EX-0003"') -and ($rbTxt -match 'checkpoint_ref:') -and ($rbTxt -match 'recovery/checkpoints')){ Pass "Case4: RB-0001 references EX-0003 + reuses Recovery checkpoint" } else { Fail "RB-0001 refs broken" }
} else { Fail "RB-0001 missing" }

# ---------- 9. Case5 high-risk release -> human approval required ----------
if($perm -match '(?s)action_class: "release".*?risk: "high".*?permission: "human_approval"'){ Pass "Case5: release high-risk -> human_approval required" } else { Fail "Case5 release mapping missing" }
$relExecutor = $reg -match '(?s)executor_id: "release-executor".*?human_approval'
if($relExecutor){ Pass "Case5: release-executor requires human_approval" } else { Fail "Case5 release-executor permission missing" }

# ---------- 10. Case6 full chain: ledger consistency ----------
$ledger = Get-Content -Raw -Encoding UTF8 (Join-Path $ctxDir "execution-ledger.yaml")
if($ledger -match 'task_id: "refund-feature"' -and $ledger -match 'execution_context_id:'){ Pass "execution-ledger root fields present" } else { Fail "execution-ledger root missing" }
$ledgerEx = [regex]::Matches($ledger, 'execution_id: "(EX-\d+)"') | ForEach-Object { $_.Groups[1].Value }
foreach($e in @("EX-0001","EX-0002","EX-0003")){ if($ledgerEx -contains $e){ Pass "ledger references $e" } else { Fail "ledger missing $e" } }
if($ledger -match 'quality_ref:' -and $ledger -match 'artifact_ref:'){ Pass "Case6: ledger connects Quality + Artifact (full chain)" } else { Fail "Case6 quality/artifact refs missing" }
if(HasForbiddenField $ledger){ Fail "execution-ledger contains forbidden field" } else { Pass "execution-ledger free of forbidden fields" }

# ---------- 11. execution task_id aligned with runtime-context ----------
$rctx = Get-Content -Raw -Encoding UTF8 (Join-Path $root ".ai\context\runtime\runtime-context.yaml")
if($rctx -match 'task_id: "refund-feature"'){ Pass "execution task_id aligned with runtime-context (three-way separation)" } else { Fail "task_id not aligned" }

# ---------- 12. history + execution metrics ----------
$hist = @(Get-ChildItem (Join-Path $ctxDir "history") -Filter "EX-*-history.yaml" -ErrorAction SilentlyContinue)
if($hist.Count -ge 1){
  $ht = Get-Content -Raw -Encoding UTF8 $hist[0].FullName
  if(($ht -match 'execution_metrics:') -and ($ht -match 'rollback_count:') -and ($ht -match 'approved_before_execution_rate:')){ Pass "history has execution_metrics (duration/failure/rollback)" } else { Fail "history metrics missing" }
} else { Fail "no execution history" }

# ---------- 13. sandbox instances ----------
$sb = @(Get-ChildItem (Join-Path $ctxDir "sandbox") -Filter "SB-*.yaml" -ErrorAction SilentlyContinue)
if($sb.Count -ge 2){ Pass "sandbox instances present ($($sb.Count))" } else { Fail "sandbox instances < 2" }

# ---------- 14. rollback reuses Recovery (not redesigned) ----------
$rbSchema = Get-Content -Raw -Encoding UTF8 (Join-Path $exDir "rollback\rollback-schema.yaml")
if($rbSchema -match 'reuse_recovery' -and $rbSchema -match 'recovery/checkpoints'){ Pass "rollback-schema reuses Recovery (no redesign)" } else { Fail "rollback-schema does not reuse Recovery" }

# ---------- 15. spec + context-system docs + mirrors ----------
if(Test-Path $spec){ Pass "runtime-controlled-execution-spec.md exists" } else { Fail "spec doc missing" }
$cs = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\docs\context-system.md")
if($cs -match 'v0\.9' -and $cs -match 'Controlled Execution'){ Pass "context-system.md lists v0.9" } else { Fail "context-system.md v0.9 missing" }
foreach($mir in @("opencode-global\docs\runtime-controlled-execution-spec.md","opencode-global\docs\context-system.md")){
  $m = Get-Content -Raw -Encoding UTF8 (Join-Path $root $mir)
  if($m -match 'v0\.9' -and $m -match 'Execution'){ Pass "mirror OK: $mir" } else { Fail "mirror missing v0.9: $mir" }
}

# ---------- 16. prompts v0.9 directives ----------
$engops = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\leads\engops-lead.md")
if($engops -match 'Runtime Controlled Execution 生命周期' -and $engops -match '不实现真实执行引擎'){ Pass "engops-lead Execution Governance lifecycle present" } else { Fail "engops-lead v0.9 missing" }
$health = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\engops\project-health-agent.md")
if($health -match 'Execution Contract 一致性' -and $health -match '\b16\.'){ Pass "project-health-agent Execution Contract check present" } else { Fail "project-health v0.9 missing" }
$pm = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\pm\project-manager-agent.md")
if($pm -match 'Execution 状态读取' -and $pm -match 'execution-ledger'){ Pass "project-manager-agent Execution status read present" } else { Fail "pm v0.9 missing" }

# ---------- 17. version-registry + manifest + migration + README ----------
$vr = Get-Content -Raw -Encoding UTF8 (Join-Path $root "evolution\version-registry.yaml")
if(($vr -match 'Runtime Controlled Execution 生命周期') -and ($vr -match 'Execution Contract 一致性')){ Pass "version-registry notes updated (v0.9)" } else { Fail "version-registry v0.9 missing" }
$mfest = Get-Content -Raw -Encoding UTF8 (Join-Path $root "manifest\platform-manifest.yaml")
if($mfest -match 'Runtime Controlled Execution Interface Layer' -and $mfest -match 'real-execution-engine'){ Pass "manifest lists v0.9 + not_implemented" } else { Fail "manifest v0.9 missing" }
$ml = Get-Content -Raw -Encoding UTF8 (Join-Path $root "migration\migration-log.yaml")
if($ml -match 'm-012' -and $ml -match 'Runtime Controlled Execution Interface Layer'){ Pass "migration-log m-012 added" } else { Fail "migration-log m-012 missing" }
$rd = Get-Content -Raw -Encoding UTF8 (Join-Path $root "platform\README.md")
if($rd -match 'Runtime Controlled Execution Interface'){ Pass "platform README lists v0.9" } else { Fail "platform README v0.9 missing" }
$ar = Get-Content -Raw -Encoding UTF8 (Join-Path $root ".ai\context\analytics\reports\analytics-report.yaml")
if(($ar -match 'execution_records: 3') -and ($ar -match 'real_execution_engine: false')){ Pass "analytics-report v0.9 metrics present" } else { Fail "analytics-report v0.9 metrics missing" }

Write-Host ""
Write-Host "=== RESULT: $pass pass, $fail fail ==="
if($fail -eq 0){ Write-Host "ALL CHECKS PASSED" } else { Write-Host "SOME CHECKS FAILED"; exit 1 }
