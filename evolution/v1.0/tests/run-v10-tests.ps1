# v1.0 OpenCode Runtime Adapter & Deployment Governance Layer 测试
$ErrorActionPreference = 'Stop'
$root = "D:\data\code\Agent\MyTeam"
$adDir = Join-Path $root "platform\runtime-adapter"
$spec1 = Join-Path $root "source\docs\runtime-adapter-spec.md"
$spec2 = Join-Path $root "source\docs\deployment-governance-spec.md"

$pass = 0; $fail = 0
function Pass($m){ Write-Host "  [PASS] $m"; $script:pass++ }
function Fail($m){ Write-Host "  [FAIL] $m"; $script:fail++ }
function HasForbiddenField($text){
  return [regex]::IsMatch($text, '(?m)^\s*(auto_install|auto_overwrite|reverse_sync|auto_upgrade)\s*:')
}

Write-Host "=== v1.0 OpenCode Runtime Adapter & Deployment Governance Tests ==="

# ---------- 1. adapter assets exist ----------
$assets = @("adapter-schema.yaml","opencode-adapter.yaml","agent-binding.yaml","mcp-binding.yaml","skill-binding.yaml","deployment-manifest.yaml","migration-plan.yaml","rollback-plan.yaml","sync-state.yaml")
foreach($a in $assets){ if(Test-Path (Join-Path $adDir $a)){ Pass "asset exists: $a" } else { Fail "asset missing: $a" } }

# ---------- 2. adapter-schema structure ----------
$sch = Get-Content -Raw -Encoding UTF8 (Join-Path $adDir "adapter-schema.yaml")
if($sch -match 'stage: "v1.0"' -and $sch -match 'source_of_truth' -and $sch -match 'runtime_target'){ Pass "adapter-schema stage v1.0 + SoT/runtime defined" } else { Fail "adapter-schema header missing" }
$inv = ([regex]::Matches($sch, 'ra-\d:')).Count
if($inv -ge 5){ Pass "adapter-schema has $inv invariants (ra-1..ra-$inv)" } else { Fail "invariants < 5: $inv" }
if($sch -match 'auto-install' -and $sch -match 'runtime-reverse-mutation' -and $sch -match 'auto-drift-repair'){ Pass "adapter-schema not_implemented boundaries present" } else { Fail "not_implemented boundaries missing" }
if($sch -match 'forbidden_fields'){ Pass "adapter-schema declares forbidden_fields" } else { Fail "forbidden_fields missing" }

# ---------- Case1: Source Build (package flow) ----------
Write-Host "`n[Case1] Source Build"
$mig = Get-Content -Raw -Encoding UTF8 (Join-Path $adDir "migration-plan.yaml")
if($mig -match 'Build Package' -and $mig -match 'Backup Runtime' -and $mig -match 'Verify' -and $mig -match 'Commit'){ Pass "Case1: migration-plan defines Build->Backup->Apply->Verify->Commit" } else { Fail "Case1 migration flow incomplete" }
if($mig -match '(?s)M3-backup.*?M4-apply'){ Pass "Case1: backup precedes apply (safety)" } else { Fail "Case1 backup not before apply" }

# ---------- Case2: Agent sync (30 agents, source exists, hash present) ----------
Write-Host "`n[Case2] Agent sync (source prompt -> runtime mirror)"
$ab = Get-Content -Raw -Encoding UTF8 (Join-Path $adDir "agent-binding.yaml")
$bindings = [regex]::Matches($ab, 'platform_agent: "([a-z-]+)"') | ForEach-Object { $_.Groups[1].Value }
if($bindings.Count -eq 30){ Pass "Case2: agent-binding has 30 agents" } else { Fail "Case2 agent count=$($bindings.Count) (expect 30)" }
# every source_prompt exists
$srcPaths = [regex]::Matches($ab, 'source_prompt: "([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$missing = @($srcPaths | Where-Object { -not (Test-Path (Join-Path $root $_)) })
if($missing.Count -eq 0){ Pass "Case2: all 30 source_prompt files exist" } else { Fail "Case2 missing source: $($missing -join ',')" }
# checksums present
$chk = ([regex]::Matches($ab, 'checksum: "sha256:[0-9a-f]+"')).Count
if($chk -eq 30){ Pass "Case2: all 30 bindings have sha256 checksum" } else { Fail "Case2 checksum count=$chk" }
# version alignment for known v2 agents
$v2ok = ($ab -match '(?s)platform_agent: "java-developer".*?version: "v2"') -and ($ab -match '(?s)platform_agent: "research-analyst".*?version: "v2"')
if($v2ok){ Pass "Case2: version aligned with version-registry (java-developer/research-analyst=v2)" } else { Fail "Case2 version misaligned" }

# ---------- Case3: MCP mapping (registry -> runtime declaration) ----------
Write-Host "`n[Case3] MCP mapping"
$mb = Get-Content -Raw -Encoding UTF8 (Join-Path $adDir "mcp-binding.yaml")
$mcpIds = [regex]::Matches($mb, 'platform_mcp: "([a-z0-9-]+)"') | ForEach-Object { $_.Groups[1].Value }
$expectedMcp = @("context7","fetch","memory","playwright","sequential-thinking")
$mcpOk = ($mcpIds.Count -eq 5) -and (@($expectedMcp | Where-Object { $mcpIds -notcontains $_ }).Count -eq 0)
if($mcpOk){ Pass "Case3: 5 MCP mapped (declaration-only)" } else { Fail "Case3 MCP mapping incomplete: $($mcpIds -join ',')" }
if($mb -match '不自动新增 MCP' -or $mb -match 'declaration-only'){ Pass "Case3: MCP sync is declaration-only (no auto-add)" } else { Fail "Case3 MCP declaration-only rule missing" }
# skill binding 26
$skb = Get-Content -Raw -Encoding UTF8 (Join-Path $adDir "skill-binding.yaml")
$skIds = ([regex]::Matches($skb, 'skill: "([a-z0-9-]+)"')).Count
if($skIds -eq 26){ Pass "Case3b: 26 Skill mapped (reference-only)" } else { Fail "Case3b skill count=$skIds" }

# ---------- Case4: Migration rejected -> runtime unchanged ----------
Write-Host "`n[Case4] Migration rejected"
$dm = Get-Content -Raw -Encoding UTF8 (Join-Path $adDir "deployment-manifest.yaml")
if(($dm -match 'approved: false') -and ($dm -match 'status: "draft"')){ Pass "Case4: DEP-0001 approval=false + status=draft (runtime unchanged)" } else { Fail "Case4 approval/draft state wrong" }
$ss = Get-Content -Raw -Encoding UTF8 (Join-Path $adDir "sync-state.yaml")
if($ss -match 'runtime_version: "not-installed"'){ Pass "Case4: sync-state runtime not-installed (approval-false => no runtime change)" } else { Fail "Case4 runtime unexpectedly installed" }

# ---------- Case5: Rollback (install failed -> restore backup) ----------
Write-Host "`n[Case5] Rollback"
$rb = Get-Content -Raw -Encoding UTF8 (Join-Path $adDir "rollback-plan.yaml")
if(($rb -match 'backup_ref') -and ($rb -match 'restore_steps') -and ($rb -match 'verification')){ Pass "Case5: rollback-plan has backup_ref/restore_steps/verification" } else { Fail "Case5 rollback fields missing" }
if($rb -match 'reuse' -and $rb -match 'recovery'){ Pass "Case5: rollback reuses Recovery (no redesign)" } else { Fail "Case5 rollback does not reuse Recovery" }
if($mig -match '(?s)M5-verify.*?rollback' -or $mig -match 'on_fail: "rollback'){ Pass "Case5: migration verify-fail -> rollback" } else { Fail "Case5 verify-fail rollback missing" }

# ---------- Case6: Drift detection (report only) ----------
Write-Host "`n[Case6] Drift detection"
if(($ss -match 'drift_detected:') -and ($ss -match 'report only' -or $ss -match '只报告')){ Pass "Case6: sync-state drift detection = report-only (no auto-repair)" } else { Fail "Case6 drift detection missing" }

# ---------- Case7: full chain (Source -> Adapter -> Migration -> Runtime) ----------
Write-Host "`n[Case7] Full chain"
$oa = Get-Content -Raw -Encoding UTF8 (Join-Path $adDir "opencode-adapter.yaml")
$chainOk = ($oa -match 'allowed_sync') -and ($oa -match 'forbidden_targets') -and ($dm -match 'DEP-0001') -and ($mig -match 'deployment_ref')
if($chainOk){ Pass "Case7: Source->Adapter(binding)->Manifest->Migration chain linked" } else { Fail "Case7 chain broken" }
# boundary: forbidden targets protect user data
if(($oa -match 'provider') -and ($oa -match 'skills/' ) -and ($oa -match 'memory' -or $oa -match 'Memory')){ Pass "Case7: opencode-adapter protects provider/skills/Memory (boundary)" } else { Fail "Case7 boundary protection incomplete" }

# ---------- forbidden field scan across adapter assets ----------
Write-Host "`n[Invariant] no forbidden auto-* fields"
$anyForbidden = $false
foreach($a in $assets){ $t = Get-Content -Raw -Encoding UTF8 (Join-Path $adDir $a); if(HasForbiddenField $t){ $anyForbidden = $true; Write-Host "    forbidden field in $a" } }
if(-not $anyForbidden){ Pass "no forbidden auto_install/auto_overwrite/reverse_sync/auto_upgrade fields" } else { Fail "forbidden field present" }

# ---------- docs + context-system + mirrors ----------
Write-Host "`n[Docs]"
if(Test-Path $spec1){ Pass "runtime-adapter-spec.md exists" } else { Fail "spec1 missing" }
if(Test-Path $spec2){ Pass "deployment-governance-spec.md exists" } else { Fail "spec2 missing" }
$cs = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\docs\context-system.md")
if($cs -match 'v1\.0' -and $cs -match 'Runtime Adapter'){ Pass "context-system.md lists v1.0" } else { Fail "context-system v1.0 missing" }
foreach($mir in @("opencode-global\docs\runtime-adapter-spec.md","opencode-global\docs\deployment-governance-spec.md","opencode-global\docs\context-system.md")){
  if(Test-Path (Join-Path $root $mir)){ Pass "mirror OK: $mir" } else { Fail "mirror missing: $mir" }
}

# ---------- prompts v1.0 directives ----------
Write-Host "`n[Prompts]"
$engops = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\leads\engops-lead.md")
if($engops -match 'Runtime Adapter & Deployment Governance 生命周期' -and $engops -match 'runtime 反向改 source'){ Pass "engops-lead Adapter lifecycle present" } else { Fail "engops-lead v1.0 missing" }
$health = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\engops\project-health-agent.md")
if($health -match 'Deployment Governance / Adapter 一致性' -and $health -match '\b17\.'){ Pass "project-health-agent Adapter check (item 17) present" } else { Fail "project-health v1.0 missing" }
$pm = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\pm\project-manager-agent.md")
if($pm -match 'Deployment 状态读取' -and $pm -match 'deployment-manifest'){ Pass "project-manager Deployment status read present" } else { Fail "pm v1.0 missing" }

# ---------- version-registry + manifest + migration + README + analytics ----------
Write-Host "`n[Metadata]"
$vr = Get-Content -Raw -Encoding UTF8 (Join-Path $root "evolution\version-registry.yaml")
if(($vr -match 'Runtime Adapter & Deployment Governance 生命周期') -and ($vr -match 'Deployment Governance / Adapter 一致性')){ Pass "version-registry notes updated (v1.0)" } else { Fail "version-registry v1.0 missing" }
$mfest = Get-Content -Raw -Encoding UTF8 (Join-Path $root "manifest\platform-manifest.yaml")
if(($mfest -match 'OpenCode Runtime Adapter & Deployment Governance Layer') -and ($mfest -match 'runtime_adapter:') -and ($mfest -match 'runtime-reverse-mutation')){ Pass "manifest lists v1.0 + adapter block + not_implemented" } else { Fail "manifest v1.0 missing" }
$ml = Get-Content -Raw -Encoding UTF8 (Join-Path $root "migration\migration-log.yaml")
if($ml -match 'm-013' -and $ml -match 'OpenCode Runtime Adapter & Deployment Governance Layer'){ Pass "migration-log m-013 added" } else { Fail "migration-log m-013 missing" }
$rd = Get-Content -Raw -Encoding UTF8 (Join-Path $root "platform\README.md")
if($rd -match 'OpenCode Runtime Adapter & Deployment Governance'){ Pass "platform README lists v1.0" } else { Fail "platform README v1.0 missing" }
$ar = Get-Content -Raw -Encoding UTF8 (Join-Path $root ".ai\context\analytics\reports\analytics-report.yaml")
if(($ar -match 'adapter_agent_bindings: 30') -and ($ar -match 'auto_install: false')){ Pass "analytics-report v1.0 metrics present" } else { Fail "analytics-report v1.0 metrics missing" }

# ---------- baseline ----------
Write-Host "`n[Baseline]"
$srcPrompts = (Get-ChildItem (Join-Path $root "source\prompts") -Recurse -Filter *.md).Count
if($srcPrompts -eq 30){ Pass "baseline agent=30 (source prompts)" } else { Fail "baseline agent=$srcPrompts" }

Write-Host ""
Write-Host "=== RESULT: $pass pass, $fail fail ==="
if($fail -eq 0){ Write-Host "ALL CHECKS PASSED" } else { Write-Host "SOME CHECKS FAILED"; exit 1 }
