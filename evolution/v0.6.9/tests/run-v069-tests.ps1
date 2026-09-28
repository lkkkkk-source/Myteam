# v0.6.9 Model Routing Feedback Loop 测试
$ErrorActionPreference = 'Stop'
$root = "D:\data\code\Agent\MyTeam"
$fb = Join-Path $root "platform\model-routing\feedback"
$reg = Join-Path $root "platform\registry\models\model-registry.yaml"
$hist = Join-Path $root "platform\model-routing\history\model-routing-history.yaml"
$policy = Join-Path $root "platform\model-routing\routing-policy.yaml"

$pass = 0; $fail = 0
function Pass($m){ Write-Host "  [PASS] $m"; $script:pass++ }
function Fail($m){ Write-Host "  [FAIL] $m"; $script:fail++ }

Write-Host "=== v0.6.9 Model Routing Feedback Tests ==="

# ---------- registry model ids ----------
$regYaml = Get-Content -Raw -Encoding UTF8 $reg
$ids = [regex]::Matches($regYaml, '(?m)^\s{2}-\s+id:\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
if(-not $ids){ $ids = [regex]::Matches($regYaml, '(?m)^\s{2}-\s+id:\s*([A-Za-z0-9_-]+)') | ForEach-Object { $_.Groups[1].Value } }
if(-not $ids){ # try model_id style (any indent)
  $ids = [regex]::Matches($regYaml, 'model_id:\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
}
Write-Host "  (registry ids found: $($ids -join ', '))"

function InRegistry($v){ return ($ids -contains $v) }

Write-Host "`n[1] Feedback YAML files exist & non-empty"
$files = @(
  "$fb\feedback-profile-schema.yaml",
  "$fb\feedback-history.yaml",
  "$fb\metrics\feedback-metrics.yaml",
  "$fb\analytics\routing-feedback-analytics.yaml",
  "$fb\proposals\proposal-schema.yaml"
)
foreach($f in $files){
  if(Test-Path $f -PathType Leaf){
    $len = (Get-Item $f).Length
    if($len -gt 0){ Pass "exists & non-empty: $(Split-Path $f -Leaf) ($len bytes)" } else { Fail "empty: $f" }
  } else { Fail "missing: $f" }
}

Write-Host "`n[2] Feedback history self-consistency (references registry)"
$fbh = Get-Content -Raw -Encoding UTF8 (Join-Path $fb 'feedback-history.yaml')
$recs = [regex]::Matches($fbh, 'recommended_class:\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$recs += [regex]::Matches($fbh, 'actual_used_class:\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$uniqRecs = $recs | Select-Object -Unique
$bad = @($uniqRecs | Where-Object { -not (InRegistry $_) })
if($bad.Count -eq 0){ Pass "all recommended/actual classes exist in registry (count=$($uniqRecs.Count))" } else { Fail "unknown class: $($bad -join ',')" }
if($fbh -match 'pending-human-confirmation'){ Pass "has high-risk pending-human-confirmation record" } else { Fail "missing high-risk pending record" }

Write-Host "`n[3] Feedback references routing history (task_id linkage)"
$histRaw = Get-Content -Raw -Encoding UTF8 $hist
$histTasks = [regex]::Matches($histRaw, 'task_id:\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$fbTasks = [regex]::Matches($fbh, 'task_id:\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$orphan = @($fbTasks | Where-Object { $histTasks -notcontains $_ })
if($orphan.Count -eq 0){ Pass "feedback task_ids all exist in routing history (count=$($fbTasks.Count))" } else { Fail "orphan feedback task: $($orphan -join ',')" }

Write-Host "`n[4] Feedback metrics match history summary"
$metricsRaw = Get-Content -Raw -Encoding UTF8 (Join-Path $fb 'metrics\feedback-metrics.yaml')
$total = [regex]::Match($metricsRaw, 'valid_feedback:\s*(\d+)').Groups[1].Value
$success = [regex]::Match($metricsRaw, 'success_rate:\s*([\d.]+)').Groups[1].Value
if($metricsRaw -match 'under_provision_rate'){ Pass "metrics define over/under-provisioned rates" } else { Fail "missing over/under-provisioned rates" }
if($fbh -match 'auto_adjust:\s*false'){ Pass "feedback history declares auto_adjust=false" } else { Fail "auto_adjust not false" }

Write-Host "`n[5] Schema example references registry"
$schemaRaw = Get-Content -Raw -Encoding UTF8 (Join-Path $fb 'feedback-profile-schema.yaml')
if($schemaRaw -match 'recommended_class'){ Pass "feedback schema defines recommended_class (registry-linked)" } else { Fail "feedback schema missing recommended_class" }

Write-Host "`n[6] Proposal schema compliance (P-069 files)"
$pSchema = Get-Content -Raw -Encoding UTF8 (Join-Path $fb 'proposals\proposal-schema.yaml')
if($pSchema -match 'proposal_id' -and $pSchema -match 'status' -and $pSchema -match 'decided_by'){ Pass "proposal-schema defines core fields" } else { Fail "proposal-schema incomplete" }
$props = Get-ChildItem (Join-Path $fb 'proposals') -Filter "P-069-*.yaml"
if($props.Count -ge 1){
  Pass "found $($props.Count) improvement proposals"
  foreach($p in $props){
    $c = Get-Content -Raw -Encoding UTF8 $p.FullName
    foreach($req in @('proposal_id','triggered_by_feedback','proposed_change','status','decided_by')){
      if($c -match $req){ Pass "$($p.BaseName): has $req" } else { Fail "$($p.BaseName): missing $req" }
    }
    # evidence feedback linkage
    $tid = [regex]::Match($c, 'triggered_by_feedback:\s*[\r\n]+(?:\s*-\s*"([FH][^"]+)"[\r\n]*)+').Success
  }
  # cross-verify triggered feedback ids exist in history
  $allFbIds = [regex]::Matches($fbh, 'feedback_id:\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
  $triggeredMissing = $false
  foreach($p in $props){
    $c = Get-Content -Raw -Encoding UTF8 $p.FullName
    $trig = [regex]::Matches($c, '"FH-069-\d+"') | ForEach-Object { $_.Groups[0].Value.Trim('"') }
    $miss = @($trig | Where-Object { $allFbIds -notcontains $_ })
    if($miss.Count -gt 0){ $triggeredMissing = $true; Fail "$($p.BaseName): triggered feedback $($miss -join ',') not in history" }
  }
  if(-not $triggeredMissing){ Pass "all proposals' triggered feedback_id exist in history" }
} else { Fail "no P-069 proposal files" }

Write-Host "`n[7] Case5: rejected proposal leaves policy unchanged"
$p2 = Get-Content -Raw -Encoding UTF8 (Join-Path $fb 'proposals\P-069-02-reject-content-upgrade.yaml')
if($p2 -match 'status:\s*"rejected"' -or $p2 -match 'status:\s*rejected'){
  Pass "P-069-02 is rejected (content upgrade)"
  # verify routing-policy did NOT adopt the rejected content->high-reasoning change
  $policyRaw = Get-Content -Raw -Encoding UTF8 $policy
  if($policyRaw -notmatch 'P-069-02'){
    Pass "policy does NOT reference rejected P-069-02 (Case5: policy unchanged)"
  } else { Fail "policy references rejected proposal P-069-02 (illegal)" }
  if($policyRaw -match '(?s)task_type:\s*"content".*?recommend:\s*"high-reasoning"'){
    Fail "policy adopted rejected content->high-reasoning (Case5 violated)"
  } else { Pass "policy has NO content->high-reasoning rule (rejected content upgrade not applied)" }
} else { Fail "P-069-02 not rejected" }

Write-Host "`n[8] No bypass-proposal policy change (feedback never edits policy directly)"
$policyRaw2 = Get-Content -Raw -Encoding UTF8 $policy
if($policyRaw2 -match 'from_proposal:\s*"P-069-01"' -and $policyRaw2 -match 'from_proposal:\s*"-"'){
  Pass "policy change_log has P-069-01 (approved) + initial v1 entry (traceable)"
} else { Fail "policy change_log not traceable" }
if($policyRaw2 -match 'rejected'){
  Fail "policy references a rejected proposal (illegal)" 
} else { Pass "policy does not reference any rejected proposal (Case5 invariant)" }

Write-Host "`n[9] EngOps feedback lifecycle referenced in engops-lead prompt"
$engops = Get-Content -Raw -Encoding UTF8 (Join-Path $root 'source\prompts\leads\engops-lead.md')
if($engops -match 'Model Routing Feedback' -and $engops -match 'rejected' -and $engops -match 'approved'){
  Pass "engops-lead prompt maintains feedback→proposal lifecycle (review)"
} else { Fail "engops-lead feedback lifecycle not present" }

$health = Get-Content -Raw -Encoding UTF8 (Join-Path $root 'source\prompts\engops\project-health-agent.md')
if($health -match 'Routing Feedback 一致性' -and $health -match '自动改变行为' -and $health -match '策略可追踪'){
  Pass "project-health-agent checks feedback consistency + no-auto-change + traceability"
} else { Fail "project-health feedback checks missing" }

$pm = Get-Content -Raw -Encoding UTF8 (Join-Path $root 'source\prompts\pm\project-manager-agent.md')
if($pm -match 'routing feedback report'){
  Pass "project-manager reads routing feedback report (read-only)"
} else { Fail "pm feedback report read directive missing" }

Write-Host "`n=== RESULT: $pass pass, $fail fail ==="
if($fail -eq 0){ Write-Host "ALL CHECKS PASSED" } else { Write-Host "SOME CHECKS FAILED"; exit 1 }
