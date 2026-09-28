# v0.8 Runtime Action Proposal & Approval Layer 测试
$ErrorActionPreference = 'Stop'
$root = "D:\data\code\Agent\MyTeam"
$actionDir = Join-Path $root "platform\runtime-action"
$recordDir = Join-Path $actionDir "records"
$ledgerDir = Join-Path $root ".ai\context\runtime-action"
$snapDir = Join-Path $ledgerDir "snapshots"
$spec = Join-Path $root "source\docs\runtime-action-proposal-spec.md"

$pass = 0; $fail = 0
function Pass($m){ Write-Host "  [PASS] $m"; $script:pass++ }
function Fail($m){ Write-Host "  [FAIL] $m"; $script:fail++ }
function HasForbiddenField($text){
  return [regex]::IsMatch($text, '(?m)^\s*(auto_exec|auto_approve|auto_bypass|executed|result)\s*:')
}

Write-Host "=== v0.8 Runtime Action Proposal & Approval Tests ==="

# ---------- 1. runtime-action assets exist ----------
if(Test-Path (Join-Path $actionDir "action-policy.yaml")){ Pass "action-policy.yaml exists" } else { Fail "action-policy.yaml missing" }
if(Test-Path (Join-Path $actionDir "action-proposal-schema.yaml")){ Pass "action-proposal-schema.yaml exists" } else { Fail "action-proposal-schema missing" }
if(Test-Path (Join-Path $actionDir "action-ledger-schema.yaml")){ Pass "action-ledger-schema.yaml exists" } else { Fail "action-ledger-schema missing" }
if(Test-Path (Join-Path $actionDir "action-template.yaml")){ Pass "action-template.yaml exists" } else { Fail "action-template missing" }
if(Test-Path (Join-Path $actionDir "snapshot-schema.yaml")){ Pass "snapshot-schema.yaml exists" } else { Fail "snapshot-schema missing" }

# ---------- 2. action-policy structure ----------
$pol = Get-Content -Raw -Encoding UTF8 (Join-Path $actionDir "action-policy.yaml")
if($pol -match 'stage: "v0.8"' -and $pol -match 'layer: "runtime-action-proposal-approval"'){ Pass "action-policy stage v0.8" } else { Fail "action-policy stage missing" }
if($pol -match 'owner: "engops-lead"'){ Pass "action-policy owner=engops-lead" } else { Fail "action-policy owner missing" }

$invCount = ([regex]::Matches($pol, 'ap-\d:')).Count
if($invCount -ge 4){ Pass "action-policy has $invCount invariants (ap-1..ap-$invCount)" } else { Fail "invariants < 4: got $invCount" }

$at = [regex]::Matches($pol, '(?m)^\s{2}- id: "(run-command|trigger-workflow|write-file|deploy-artifact|release-publish|config-change)"') | ForEach-Object { $_.Groups[1].Value }
if($at.Count -eq 6){ Pass "action_types = 6 ($($at -join ','))" } else { Fail "action_types=$($at.Count) (expect 6)" }

if(($pol -match 'approval_model: "auto-approve"') -and ($pol -match 'approval_model: "agent-approval"') -and ($pol -match 'approval_model: "human-approval"')){ Pass "approval_model mapping low/medium/high present" } else { Fail "approval_model mapping missing" }

$states = @('draft','pending','approved','rejected','cancelled')
$allStates = $true
foreach($s in $states){ if($pol -notmatch "`"$s`""){ $allStates = $false; Write-Host "    missing approval_state: $s" } }
if($allStates){ Pass "approval_states = draft/pending/approved/rejected/cancelled" } else { Fail "approval_states incomplete" }

# ---------- 3. not_implemented / execution_interface boundary ----------
if($pol -match 'status: "not-implemented"' -and $pol -match 'gate: "approved-action-only"'){ Pass "execution_interface not-implemented + approved-action-only gate" } else { Fail "execution_interface boundary missing" }
if(($pol -match 'auto-approval') -and ($pol -match 'auto-bypass') -and ($pol -match 'auto-action-mutation')){ Pass "not_implemented lists auto-approval/auto-bypass/auto-action-mutation" } else { Fail "not_implemented boundaries missing" }

# ---------- 4. proposal schema: required fields + forbidden ----------
$psch = Get-Content -Raw -Encoding UTF8 (Join-Path $actionDir "action-proposal-schema.yaml")
$reqFields = @('proposal_id','title','task_id','stage','layer','owner','created_at')
$reqOk = $true
foreach($f in $reqFields){ if($psch -notmatch "field: `"$f`""){ $reqOk = $false; Write-Host "    missing proposal field: $f" } }
if($reqOk){ Pass "proposal schema has required root fields" } else { Fail "proposal schema fields missing" }
if($psch -match 'forbidden_fields'){ Pass "proposal schema declares forbidden_fields" } else { Fail "forbidden_fields missing in proposal schema" }

# ---------- 5. ledger schema: root + proposal_ref + forbidden ----------
$lsch = Get-Content -Raw -Encoding UTF8 (Join-Path $actionDir "action-ledger-schema.yaml")
$ledFields = @('version','action_context_id','task_id','owner','policy_version','proposals')
$ledOk = $true
foreach($f in $ledFields){ if($lsch -notmatch "field: `"$f`""){ $ledOk = $false; Write-Host "    missing ledger field: $f" } }
if($ledOk){ Pass "ledger schema has root fields" } else { Fail "ledger schema root fields missing" }
if($lsch -match 'proposal_ref' -and $lsch -match 'contract_ok'){ Pass "ledger schema has proposal_ref + contract_ok" } else { Fail "ledger schema proposal_ref missing" }

# ---------- 6. records AP-0001/0002/0003 ----------
$expectedRecords = @(
  @{ file="AP-0001-refund-calc-edit.yaml"; id="AP-0001"; type="write-file"; risk="medium"; model="agent-approval"; status="approved" },
  @{ file="AP-0002-run-regression.yaml"; id="AP-0002"; type="run-command"; risk="high"; model="human-approval"; status="pending" },
  @{ file="AP-0003-deploy-staging.yaml"; id="AP-0003"; type="deploy-artifact"; risk="high"; model="human-approval"; status="draft" }
)
foreach($r in $expectedRecords){
  $fp = Join-Path $recordDir $r.file
  if(-not (Test-Path $fp)){ Fail "record missing: $($r.file)"; continue }
  $txt = Get-Content -Raw -Encoding UTF8 $fp
  if(($txt -match "proposal_id: `"$($r.id)`"") -and ($txt -match "action_type: `"$($r.type)`"") -and ($txt -match "level: `"$($r.risk)`"") -and ($txt -match "approval_model: `"$($r.model)`"") -and ($txt -match "status: `"$($r.status)`"")){ Pass "record OK: $($r.file)" } else { Fail "record content mismatch: $($r.file)" }
  if(HasForbiddenField $txt){ Fail "record contains forbidden field: $($r.file)" } else { Pass "record free of auto/exec fields: $($r.file)" }
}

# ---------- 7. record task_id aligned with runtime-context ----------
$rctx = Get-Content -Raw -Encoding UTF8 (Join-Path $root ".ai\context\runtime\runtime-context.yaml")
foreach($r in $expectedRecords){
  $fp = Join-Path $recordDir $r.file
  $txt = Get-Content -Raw -Encoding UTF8 $fp
  if($txt -match 'task_id: "([^"]+)"'){
    $tid = $Matches[1]
    if($rctx -match "task_id: `"$tid`""){ Pass "record $($r.id) task_id '$tid' aligned with runtime-context" } else { Fail "record $($r.id) task_id '$tid' NOT in runtime-context" }
  } else { Fail "record $($r.id) missing task_id" }
}

# ---------- 8. action ledger exists + consistent ----------
$ledger = Get-Content -Raw -Encoding UTF8 (Join-Path $ledgerDir "action-ledger.yaml")
if($ledger -match 'version: 1' -and $ledger -match 'task_id: "refund-feature"' -and $ledger -match 'owner: "engops-lead"'){ Pass "action-ledger root fields present" } else { Fail "action-ledger root fields missing" }
$ledgerIds = [regex]::Matches($ledger, 'proposal_id: "(AP-\d+)"') | ForEach-Object { $_.Groups[1].Value }
foreach($r in $expectedRecords){
  if($ledgerIds -contains $r.id){ Pass "ledger references $($r.id)" } else { Fail "ledger missing reference: $($r.id)" }
}
if($ledger -match 'snapshot_refs:'){ Pass "ledger has snapshot_refs" } else { Fail "ledger snapshot_refs missing" }
if(HasForbiddenField $ledger){ Fail "ledger contains forbidden field" } else { Pass "ledger free of auto/exec fields" }

# ---------- 9. snapshot exists + read-only + no exec fields ----------
$snaps = @(Get-ChildItem $snapDir -Filter "AS-*.yaml" -ErrorAction SilentlyContinue)
if($snaps.Count -ge 1){
  $snap = Get-Content -Raw -Encoding UTF8 $snaps[0].FullName
  if($snap -match 'snapshot_id: "AS-'){ Pass "snapshot AS-* exists with snapshot_id" } else { Fail "snapshot snapshot_id missing" }
  if($snap -match 'ledger_ref:'){ Pass "snapshot has ledger_ref (read-only back-reference)" } else { Fail "snapshot ledger_ref missing" }
  if(HasForbiddenField $snap){ Fail "snapshot contains forbidden exec field" } else { Pass "snapshot free of auto/exec fields" }
} else { Fail "no snapshot present" }

# ---------- 10. spec + context-system docs ----------
if(Test-Path $spec){ Pass "runtime-action-proposal-spec.md exists" } else { Fail "spec doc missing" }
$cs = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\docs\context-system.md")
if($cs -match 'v0\.8' -and $cs -match 'Action'){ Pass "context-system.md lists v0.8" } else { Fail "context-system.md v0.8 missing" }

# ---------- 11. opencode-global mirrors ----------
foreach($mir in @("opencode-global\docs\runtime-action-proposal-spec.md","opencode-global\docs\context-system.md")){
  $m = Get-Content -Raw -Encoding UTF8 (Join-Path $root $mir)
  if($m -match 'Action' -and $m -match 'v0\.8'){ Pass "mirror OK: $mir" } else { Fail "mirror missing v0.8: $mir" }
}

# ---------- 12. prompts v0.8 directives ----------
$a = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\leads\engops-lead.md")
if($a -match 'Runtime Action Proposal & Approval' -and $a -match 'Action Governance' -and $a -match '禁止自动行为'){ Pass "engops-lead Action Governance lifecycle present" } else { Fail "engops-lead v0.8 missing" }

$h = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\engops\project-health-agent.md")
if($h -match 'Action Contract 一致性' -and $h -match '\b15\.'){ Pass "project-health-agent Action Contract consistency check present" } else { Fail "project-health v0.8 missing" }

$p = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\pm\project-manager-agent.md")
if($p -match 'Action 审查职责' -and $p -match 'agent-approval' -and $p -match 'human-approval'){ Pass "project-manager-agent Action approval role present" } else { Fail "pm v0.8 missing" }

# ---------- 13. version-registry + manifest + migration-log ----------
$vr = Get-Content -Raw -Encoding UTF8 (Join-Path $root "evolution\version-registry.yaml")
if(($vr -match 'Runtime Action Proposal & Approval') -and ($vr -match 'Action Contract 一致性')){ Pass "version-registry notes updated for agents" } else { Fail "version-registry notes missing" }

$mfest = Get-Content -Raw -Encoding UTF8 (Join-Path $root "manifest\platform-manifest.yaml")
if($mfest -match 'Runtime Action Proposal & Approval Layer' -and $mfest -match 'auto-action-execution'){ Pass "manifest lists v0.8 + not_implemented" } else { Fail "manifest v0.8 missing" }

$ml = Get-Content -Raw -Encoding UTF8 (Join-Path $root "migration\migration-log.yaml")
if($ml -match 'm-011' -and $ml -match 'Runtime Action Proposal & Approval Layer'){ Pass "migration-log m-011 added" } else { Fail "migration-log m-011 missing" }

# ---------- 14. platform README ----------
$rd = Get-Content -Raw -Encoding UTF8 (Join-Path $root "platform\README.md")
if($rd -match 'Runtime Action Proposal & Approval'){ Pass "platform README lists v0.8" } else { Fail "platform README v0.8 missing" }

# ---------- 15. analytics-report metrics ----------
$ar = Get-Content -Raw -Encoding UTF8 (Join-Path $root ".ai\context\analytics\reports\analytics-report.yaml")
if(($ar -match 'action_records: 3') -and ($ar -match 'action_approved_high: 0') -and ($ar -match 'execution_not_implemented: true')){ Pass "analytics-report v0.8 metrics present" } else { Fail "analytics-report v0.8 metrics missing" }

Write-Host ""
Write-Host "=== RESULT: $pass pass, $fail fail ==="
if($fail -eq 0){ Write-Host "ALL CHECKS PASSED" } else { Write-Host "SOME CHECKS FAILED"; exit 1 }
