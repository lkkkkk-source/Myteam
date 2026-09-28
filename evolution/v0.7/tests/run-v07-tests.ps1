# v0.7 Runtime Integration Contract Layer 测试
$ErrorActionPreference = 'Stop'
$root = "D:\data\code\Agent\MyTeam"
$contractDir = Join-Path $root "platform\runtime"
$ctx = Join-Path $root ".ai\context\runtime\runtime-context.yaml"
$ctxDir = Join-Path $root ".ai\context\runtime"
$snapDir = Join-Path $ctxDir "snapshots"
$spec = Join-Path $root "source\docs\runtime-integration-contract-spec.md"

$pass = 0; $fail = 0
function Pass($m){ Write-Host "  [PASS] $m"; $script:pass++ }
function Fail($m){ Write-Host "  [FAIL] $m"; $script:fail++ }
function HasForbidden($text){
  @('auto_exec','auto_schedule','auto_model_switch','auto_agent_select') | ForEach-Object {
    if($text -match ":\s*$_\s*:"){ return $true }
  }
  return $false
}

Write-Host "=== v0.7 Runtime Integration Contract Tests ==="

# ---------- 1. contract assets exist ----------
if(Test-Path (Join-Path $contractDir "runtime-contract.yaml")){ Pass "runtime-contract.yaml exists" } else { Fail "runtime-contract.yaml missing" }
if(Test-Path (Join-Path $contractDir "runtime-context-schema.yaml")){ Pass "runtime-context-schema.yaml exists" } else { Fail "runtime-context-schema missing" }
if(Test-Path (Join-Path $contractDir "runtime-context-template.yaml")){ Pass "runtime-context-template.yaml exists" } else { Fail "runtime-context-template missing" }
if(Test-Path (Join-Path $contractDir "snapshot\snapshot-schema.yaml")){ Pass "snapshot-schema.yaml exists" } else { Fail "snapshot-schema missing" }

# ---------- 2. contract module count = 10 ----------
$contract = Get-Content -Raw -Encoding UTF8 (Join-Path $contractDir "runtime-contract.yaml")
$cm = [regex]::Matches($contract, '(?m)^\s{2}- id: "([a-z-]+)"') | ForEach-Object { $_.Groups[1].Value }
if($cm.Count -eq 10){ Pass "contract has 10 modules ($($cm -join ','))" } else { Fail "contract modules=$($cm.Count) (expect 10)"; $cm }

# ---------- 3. not_implemented boundaries present ----------
if($contract -match 'auto-execution' -and $contract -match 'auto-schedule' -and $contract -match 'auto-model-switching' -and $contract -match 'auto-agent-selection'){ Pass "contract lists not_implemented boundaries" } else { Fail "not_implemented boundaries missing" }

# ---------- 4. flow sequence correct ----------
if($contract -match 'Router → Team → Agent → Model Recommendation → Scheduler → Execution → Quality → Observability → Evolution'){ Pass "flow sequence correct" } else { Fail "flow sequence incorrect" }

# ---------- 5. ledger exists ----------
if(Test-Path $ctx){ Pass "runtime-context.yaml ledger exists" } else { Fail "ledger missing" }

$ledger = Get-Content -Raw -Encoding UTF8 $ctx

# ---------- 6. module ids in ledger ⊆ contract ----------
$lm = [regex]::Matches($ledger, '(?m)^\s{2}- id: "([a-z-]+)"') | ForEach-Object { $_.Groups[1].Value }
$orphan = $lm | Where-Object { $_ -notin $cm }
if($orphan.Count -eq 0){ Pass "ledger module ids all match contract ($($lm.Count))" } else { Fail "orphan module ids: $($orphan -join ',')" }

# ---------- 7. provides paths exist ----------
$provides = [regex]::Matches($ledger, '(?m)provides: "([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$bad = @()
foreach($p in $provides){
  $full = Join-Path $root ($p.TrimStart('.').TrimStart('\')).Replace('\','/').TrimStart('/')
  # provides 形如 ".ai/context/..." 或 "platform/..."
  $norm = $p.Trim()
  if(-not (Test-Path (Join-Path $root $norm))) { $bad += $norm }
  elseif(Test-Path (Join-Path $root $norm) -PathType Leaf){} # ok
  elseif(-not (Test-Path (Join-Path $root $norm))) { $bad += $norm }
}
if($bad.Count -eq 0){ Pass "all $($provides.Count) provides paths exist" } else { Fail "missing provides: $($bad -join ',')" }

# ---------- 8. no forbidden fields in ledger ----------
if(-not (HasForbidden $ledger)){ Pass "no forbidden auto-* fields in ledger" } else { Fail "forbidden auto-* field present in ledger" }

# ---------- 9. all contract_ok true ----------
$oks = [regex]::Matches($ledger, 'contract_ok:\s*(true|false)') | ForEach-Object { $_.Groups[1].Value }
if($oks.Count -eq 10 -and ($oks -join '') -notmatch 'false'){ Pass "all $($oks.Count) modules contract_ok=true" } else { Fail "contract_ok inconsistency: $($oks -join ',')" }

# ---------- 10. snapshot exists + version matches ----------
$snaps = Get-ChildItem $snapDir -Filter "RC-SNAP-*.yaml" -ErrorAction SilentlyContinue
if($snaps.Count -ge 1){
  Pass "snapshot present: $($snaps[0].Name)"
  $snap = Get-Content -Raw -Encoding UTF8 $snaps[0].FullName
  if($snap -match 'contract_version:\s*1'){ Pass "snapshot contract_version matches (1)" } else { Fail "snapshot contract_version mismatch" }
  if($snap -match 'modules_summary:'){ Pass "snapshot has modules_summary (read-only record)" } else { Fail "snapshot modules_summary missing" }
} else { Fail "no snapshot present" }

# ---------- 11. spec + context-system docs ----------
if(Test-Path $spec){ Pass "runtime-integration-contract-spec.md exists" } else { Fail "spec doc missing" }
$cs = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\docs\context-system.md")
if($cs -match 'v0\.7' -and $cs -match 'Runtime'){ Pass "context-system.md lists v0.7" } else { Fail "context-system.md v0.7 missing" }

# ---------- 12. opencode-global mirrors ----------
foreach($mir in @("opencode-global\docs\runtime-integration-contract-spec.md","opencode-global\docs\context-system.md")){
  $m = Get-Content -Raw -Encoding UTF8 (Join-Path $root $mir)
  if($m -match 'Integration Contract' -and $m -match 'v0\.7'){ Pass "mirror OK: $mir" } else { Fail "mirror missing v0.7: $mir" }
}

# ---------- 13. prompts v0.7 directives ----------
$a = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\leads\engops-lead.md")
if($a -match 'Runtime Contract 生命周期' -and $a -match '禁止自动行为'){ Pass "engops-lead Runtime Contract lifecycle present" } else { Fail "engops-lead v0.7 missing" }

$h = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\engops\project-health-agent.md")
if($h -match 'Runtime Contract 一致性' -and $h -match '\b14\.'){ Pass "project-health-agent Runtime Contract consistency check present" } else { Fail "project-health v0.7 missing" }

$p = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\pm\project-manager-agent.md")
if($p -match 'Runtime Context 读取' -and $p -match '只读'){ Pass "project-manager-agent reads Runtime Context (read-only)" } else { Fail "pm v0.7 missing" }

# ---------- 14. version-registry + manifest + migration-log ----------
$vr = Get-Content -Raw -Encoding UTF8 (Join-Path $root "evolution\version-registry.yaml")
if(($vr -match 'Runtime Contract 生命周期') -and ($vr -match 'Runtime Contract 一致性') -and ($vr -match 'Runtime Context 集成台账')){ Pass "version-registry notes updated for 3 agents" } else { Fail "version-registry notes missing" }

$mfest = Get-Content -Raw -Encoding UTF8 (Join-Path $root "manifest\platform-manifest.yaml")
if($mfest -match 'Runtime Integration Contract Layer' -and $mfest -match 'auto-contract-mutation'){ Pass "manifest lists v0.7 + not_implemented" } else { Fail "manifest v0.7 missing" }

$ml = Get-Content -Raw -Encoding UTF8 (Join-Path $root "migration\migration-log.yaml")
if($ml -match 'm-010' -and $ml -match 'Runtime Integration Contract Layer'){ Pass "migration-log m-010 added" } else { Fail "migration-log m-010 missing" }

Write-Host ""
Write-Host "=== RESULT: $pass pass, $fail fail ==="
if($fail -eq 0){ Write-Host "ALL CHECKS PASSED" } else { Write-Host "SOME CHECKS FAILED"; exit 1 }
