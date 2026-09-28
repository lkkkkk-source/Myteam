# =====================================================================
# MyTeam Organization Intelligence Test — v1.5 (Case1~11)
# =====================================================================
$ErrorActionPreference = 'Stop'
$root = "D:\data\code\Agent\MyTeam"
$oi = Join-Path $root "platform\organization-intelligence"
$ctx = Join-Path $root ".ai\context\organization-intelligence"
$cli = Join-Path $root "tools\myteam-cli\bin\myteam.mjs"
$hostCfg = "C:\Users\Administrator\.config\opencode"
$env:MYTEAM_WORKSPACE = $root

$pass = 0; $fail = 0
function Pass($m){ Write-Host "  [PASS] $m"; $script:pass++ }
function Fail($m){ Write-Host "  [FAIL] $m"; $script:fail++ }
function Snapshot($b){ $m=@{}; if(Test-Path $b){ Get-ChildItem $b -Recurse -File -Force -EA SilentlyContinue | ForEach-Object { $m[$_.FullName]="$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" } }; return $m }
function DiffH($x,$y){ $c=@(); foreach($k in $y.Keys){ if(-not $x.ContainsKey($k)){$c+="ADD:$k"}elseif($x[$k]-ne$y[$k]){$c+="MOD:$k"} }; foreach($k in $x.Keys){ if(-not $y.ContainsKey($k)){$c+="DEL:$k"} }; return $c }

Write-Host "=== v1.5 MyTeam Organization Intelligence Tests ==="

# ---------- scaffold ----------
Write-Host "`n[0] Intelligence scaffold"
$assets = @("intelligence-schema.yaml",
  "metrics\team-performance.yaml","metrics\role-performance.yaml","metrics\agent-performance.yaml","metrics\collaboration-metrics.yaml","metrics\workflow-metrics.yaml",
  "analysis\bottleneck-analysis.yaml","analysis\failure-patterns.yaml","analysis\success-patterns.yaml","analysis\workload-analysis.yaml",
  "recommendations\recommendation-schema.yaml","recommendations\recommendation-records.yaml",
  "reports\organization-intelligence-report.yaml")
foreach($a in $assets){ if(Test-Path (Join-Path $oi $a)){ Pass "asset: $a" } else { Fail "missing: $a" } }
if(Test-Path (Join-Path $ctx "intelligence-state.yaml")){ Pass "asset: intelligence-state.yaml" } else { Fail "missing intelligence-state" }

# ---------- schema invariants ----------
Write-Host "`n[Schema]"
$sch = Get-Content -Raw -Encoding UTF8 (Join-Path $oi "intelligence-schema.yaml")
$inv = ([regex]::Matches($sch, 'oi-\d:')).Count
if($inv -ge 7){ Pass "intelligence-schema has $inv invariants (oi-1..)" } else { Fail "invariants < 7: $inv" }
if($sch -match 'analyze-report-recommend-only'){ Pass "principle analyze-report-recommend-only" } else { Fail "principle missing" }
if($sch -match 'auto_apply' -and $sch -match 'auto_modify' -and $sch -match 'auto_execute' -and $sch -match 'forbidden_fields'){ Pass "schema declares forbidden_fields" } else { Fail "forbidden_fields missing" }
$scopeOk = $true; foreach($s in @("team","role","agent","workflow","collaboration")){ if($sch -notmatch "`"$s`""){ $scopeOk=$false } }
if($scopeOk){ Pass "scope enum complete (team/role/agent/workflow/collaboration)" } else { Fail "scope enum incomplete" }

# ---------- Case1: read Organization data ----------
Write-Host "`n[Case1] Read Organization data"
$tp = Get-Content -Raw -Encoding UTF8 (Join-Path $oi "metrics\team-performance.yaml")
if($tp -match 'organization/agent-role-binding.yaml' -or $tp -match 'organization-state.yaml'){ Pass "Case1: intelligence source_refs include organization data (read-only)" } else { Fail "Case1: organization source ref missing" }
$bindAgents = ([regex]::Matches((Get-Content -Raw -Encoding UTF8 (Join-Path $root "platform\organization\agent-role-binding.yaml")), 'agent:\s*"([^"]+)",\s*role:')).Count
if($bindAgents -eq 30){ Pass "Case1: organization binding readable (30 agents)" } else { Fail "Case1: binding agents=$bindAgents" }

# ---------- Case2: Team Metrics aggregation ----------
Write-Host "`n[Case2] Team Metrics aggregation"
$teamCount = ([regex]::Matches($tp, '- team_id:')).Count
$fieldsOk = ($tp -match 'tasks_count' -and $tp -match 'success_rate' -and $tp -match 'first_pass_rate' -and $tp -match 'handoff_success_rate' -and $tp -match 'conflict_rate' -and $tp -match 'average_cycle_time')
if($teamCount -eq 6 -and $fieldsOk){ Pass "Case2: team-performance aggregates 6 teams with required metrics" } else { Fail "Case2: teams=$teamCount fields=$fieldsOk" }
if($tp -match '(?s)team_id: "software-engineering"[\s\S]*?success_rate: 0.92'){ Pass "Case2: software-engineering success_rate 0.92 present" } else { Fail "Case2: sample metric missing" }

# ---------- Case3: Role Metrics aggregation ----------
Write-Host "`n[Case3] Role Metrics aggregation"
$rp = Get-Content -Raw -Encoding UTF8 (Join-Path $oi "metrics\role-performance.yaml")
$roleCount = ([regex]::Matches($rp, '- role:')).Count
$roleFields = ($rp -match 'handoff_quality' -and $rp -match 'rework_rate' -and $rp -match 'quality_pass_rate' -and $rp -match 'cycle_time')
if($roleCount -ge 5 -and $roleFields){ Pass "Case3: role-performance aggregates $roleCount roles with required metrics" } else { Fail "Case3: roles=$roleCount fields=$roleFields" }

# ---------- Case4: Agent Usage analysis (NO ranking) ----------
Write-Host "`n[Case4] Agent Usage analysis"
$ap = Get-Content -Raw -Encoding UTF8 (Join-Path $oi "metrics\agent-performance.yaml")
$agFields = ($ap -match 'usage_count' -and $ap -match 'task_types' -and $ap -match 'failure_patterns' -and $ap -match 'capability_usage')
if($agFields){ Pass "Case4: agent-performance has usage/task_types/failure_patterns/capability_usage" } else { Fail "Case4: agent usage fields missing" }
if($ap -notmatch 'best_agent\s*:' -and $ap -notmatch 'worst_agent\s*:' -and $ap -match 'ranking_generated: false'){ Pass "Case4: NO agent ranking (no best_agent/worst_agent, oi-4)" } else { Fail "Case4: agent ranking present" }

# ---------- Case5: Collaboration Analysis ----------
Write-Host "`n[Case5] Collaboration Analysis"
$cm = Get-Content -Raw -Encoding UTF8 (Join-Path $oi "metrics\collaboration-metrics.yaml")
if($cm -match 'from_role' -and $cm -match 'to_role' -and $cm -match 'success_rate' -and $cm -match 'conflict' -and $cm -match 'resolution_time' -and $cm -match 'decision'){ Pass "Case5: collaboration-metrics covers handoff/conflict/decision" } else { Fail "Case5: collaboration analysis incomplete" }

# ---------- Case6: Bottleneck Detection ----------
Write-Host "`n[Case6] Bottleneck Detection"
$ba = Get-Content -Raw -Encoding UTF8 (Join-Path $oi "analysis\bottleneck-analysis.yaml")
if($ba -match 'review_delay' -and $ba -match 'evidence_refs'){ Pass "Case6: bottleneck-analysis finds review_delay with evidence_refs" } else { Fail "Case6: bottleneck/evidence missing" }
$cliB = (& node $cli intelligence bottlenecks 2>&1) -join "`n"
if($cliB -match 'review_delay'){ Pass "Case6: CLI intelligence bottlenecks shows review_delay" } else { Fail "Case6: CLI bottlenecks failed" }

# ---------- Case7: Failure Pattern ----------
Write-Host "`n[Case7] Failure Pattern"
$fp = Get-Content -Raw -Encoding UTF8 (Join-Path $oi "analysis\failure-patterns.yaml")
$fpOk = ($fp -match 'pattern:' -and $fp -match 'frequency:' -and $fp -match 'evidence_refs')
$fpCats = ($fp -match 'repeated-failure' -and $fp -match 'safety-escalation')
if($fpOk -and $fpCats){ Pass "Case7: failure-patterns has pattern/frequency/evidence (repeated-failure + safety-escalation)" } else { Fail "Case7: failure pattern incomplete" }

# ---------- Case8: Recommendation Generation ----------
Write-Host "`n[Case8] Recommendation Generation"
$rr = Get-Content -Raw -Encoding UTF8 (Join-Path $oi "recommendations\recommendation-records.yaml")
$recoCount = ([regex]::Matches($rr, '- id: "RECO-')).Count
$recoFields = ($rr -match 'source_metrics' -and $rr -match 'evidence_refs' -and $rr -match 'suggestion' -and $rr -match 'risk' -and $rr -match 'status')
if($recoCount -ge 1 -and $recoFields){ Pass "Case8: $recoCount recommendations generated with schema fields" } else { Fail "Case8: recommendations=$recoCount fields=$recoFields" }
$rs = Get-Content -Raw -Encoding UTF8 (Join-Path $oi "recommendations\recommendation-schema.yaml")
if($rs -match 'draft' -and $rs -match 'review' -and $rs -match 'approved' -and $rs -match 'rejected'){ Pass "Case8: recommendation-schema state machine (draft/review/approved/rejected)" } else { Fail "Case8: reco state machine missing" }

# ---------- Case9: Recommendation NOT auto-applied ----------
Write-Host "`n[Case9] Recommendation not auto-applied"
$allDraft = ($recoCount -eq ([regex]::Matches($rr, 'status: "draft"')).Count)
$noAutoApplied = ($rr -match 'auto_applied: 0')
if($allDraft -and $noAutoApplied){ Pass "Case9: all recommendations draft, auto_applied=0 (oi-3)" } else { Fail "Case9: allDraft=$allDraft noAutoApplied=$noAutoApplied" }
$noForbidden = ($rr -notmatch 'auto_apply:\s*true' -and $rr -notmatch 'auto_execute' -and $rr -notmatch 'auto_modify')
if($noForbidden){ Pass "Case9: no auto_apply/auto_modify/auto_execute in records" } else { Fail "Case9: forbidden field present" }
$cliV = (& node $cli intelligence validate 2>&1) -join "`n"
if($cliV -match 'intelligence validate: PASS'){ Pass "Case9: CLI intelligence validate PASS (governance ok)" } else { Fail "Case9: intelligence validate not PASS" }

# ---------- Case10: Plugin Isolation ----------
Write-Host "`n[Case10] Plugin Isolation"
$before = Snapshot $hostCfg
$null = & node $cli intelligence status 2>&1
$null = & node $cli intelligence report 2>&1
$null = & node $cli intelligence recommendations 2>&1
$null = & node $cli intelligence validate 2>&1
Start-Sleep -Milliseconds 50
$after = Snapshot $hostCfg
$d = DiffH $before $after
if($d.Count -eq 0){ Pass "Case10: intelligence CLI leaves ~/.config/opencode unchanged (0 mutations)" } else { Fail ("Case10 host mutated: " + ($d -join '; ')) }

# ---------- Case11: Baseline Check ----------
Write-Host "`n[Case11] Baseline Check"
$srcPrompts = (Get-ChildItem (Join-Path $root "source\prompts") -Recurse -Filter *.md).Count
$mfest = Get-Content -Raw -Encoding UTF8 (Join-Path $root "manifest\platform-manifest.yaml")
$bAgent = [regex]::Match($mfest, '(?m)^\s*agent:\s*(\d+)').Groups[1].Value
$bMcp   = [regex]::Match($mfest, '(?m)^\s*mcp:\s*(\d+)').Groups[1].Value
$bSkill = [regex]::Match($mfest, '(?m)^\s*skill:\s*(\d+)').Groups[1].Value
$bWf    = [regex]::Match($mfest, '(?m)^\s*workflow:\s*(\d+)').Groups[1].Value
if($srcPrompts -eq 30){ Pass "Case11: source agents = 30" } else { Fail "Case11: agents=$srcPrompts" }
if($bAgent -eq "30" -and $bMcp -eq "5" -and $bSkill -eq "26" -and $bWf -eq "8"){ Pass "Case11: manifest baseline 30/5/26/8" } else { Fail "Case11: baseline agent=$bAgent mcp=$bMcp skill=$bSkill workflow=$bWf" }

# ---------- Boundary: read-only + no source mutation ----------
Write-Host "`n[Boundary]"
$st = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "intelligence-state.yaml")
if($st -match 'read_only: true' -and $st -match 'mutates_sources: false'){ Pass "read-only (mutates_sources=false, oi-1)" } else { Fail "not read-only" }
$scan = $sch + $rr + $st + (Get-Content -Raw -Encoding UTF8 (Join-Path $oi "reports\organization-intelligence-report.yaml")) + $ap
if($scan -notmatch '(?m)^\s*(auto_apply|auto_modify|auto_execute)\s*:\s*(true|[^f\n])'){ Pass "no forbidden fields set true (auto_apply/auto_modify/auto_execute)" } else { Fail "forbidden field set" }
if($scan -notmatch 'best_agent\s*:' -and $scan -notmatch 'worst_agent\s*:' -and $scan -notmatch 'agent_ranking:\s*true' -and $scan -notmatch 'ranking_generated:\s*true'){ Pass "no agent ranking anywhere (oi-4)" } else { Fail "agent ranking present" }

# ---------- Agent modification scope ----------
Write-Host "`n[Agent scope]"
$modified = 0; $unexpected = @()
Get-ChildItem (Join-Path $root "source\prompts") -Recurse -Filter *.md | ForEach-Object {
  $c = Get-Content -Raw -Encoding UTF8 $_.FullName
  if($c -match 'Organization Intelligence' -or $c -match 'intelligence lifecycle' -or $c -match 'Organization Intelligence 一致性' -or $c -match 'oi-1'){
    $script:modified++
    if($_.Name -notin @("project-manager-agent.md","engops-lead.md","project-health-agent.md")){ $script:unexpected += $_.Name }
  }
}
if($modified -eq 3 -and $unexpected.Count -eq 0){ Pass "only 3 agents modified (pm / engops-lead / project-health)" } else { Fail ("agent scope: modified=$modified unexpected=[" + ($unexpected -join ',') + "]") }

# ---------- CLI status/report ----------
Write-Host "`n[CLI]"
$s = (& node $cli intelligence status 2>&1) -join "`n"
if($s -match 'active' -and $s -match 'read-only=true'){ Pass "CLI: intelligence status (active, read-only)" } else { Fail "CLI intelligence status failed" }
$rep = (& node $cli intelligence report 2>&1) -join "`n"
if($rep -match 'OI-0001' -and $rep -match 'recommendations'){ Pass "CLI: intelligence report (OI-0001)" } else { Fail "CLI intelligence report failed" }
$rc = (& node $cli intelligence recommendations 2>&1) -join "`n"
if($rc -match 'RECO-0001' -and $rc -match 'auto-applied=0'){ Pass "CLI: intelligence recommendations (draft, 0 auto-applied)" } else { Fail "CLI intelligence recommendations failed" }

# ---------- Docs + metadata ----------
Write-Host "`n[Docs + Metadata]"
if(Test-Path (Join-Path $root "source\docs\organization-intelligence-spec.md")){ Pass "doc: organization-intelligence-spec.md" } else { Fail "doc intelligence spec missing" }
if(Test-Path (Join-Path $root "source\docs\organization-insight-spec.md")){ Pass "doc: organization-insight-spec.md" } else { Fail "doc insight spec missing" }
if($mfest -match 'organization_intelligence:' -and $mfest -match 'analyze/report/recommend only'){ Pass "manifest lists v1.5 organization_intelligence" } else { Fail "manifest intelligence missing" }
$ml = Get-Content -Raw -Encoding UTF8 (Join-Path $root "migration\migration-log.yaml")
if($ml -match 'm-022'){ Pass "migration-log m-022 added" } else { Fail "migration-log m-022 missing" }

Write-Host ""
Write-Host "=== RESULT: $pass pass, $fail fail ==="
if($fail -eq 0){ Write-Host "ALL CHECKS PASSED" } else { Write-Host "SOME CHECKS FAILED"; exit 1 }
