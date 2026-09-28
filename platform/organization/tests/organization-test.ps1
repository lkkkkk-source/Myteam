# =====================================================================
# MyTeam Team Organization Model Test — v1.4.3 (Case1~8)
# =====================================================================
$ErrorActionPreference = 'Stop'
$root = "D:\data\code\Agent\MyTeam"
$org = Join-Path $root "platform\organization"
$ctx = Join-Path $root ".ai\context\organization"
$cli = Join-Path $root "tools\myteam-cli\bin\myteam.mjs"
$hostCfg = "C:\Users\Administrator\.config\opencode"
$env:MYTEAM_WORKSPACE = $root

$pass = 0; $fail = 0
function Pass($m){ Write-Host "  [PASS] $m"; $script:pass++ }
function Fail($m){ Write-Host "  [FAIL] $m"; $script:fail++ }
function Snapshot($b){ $m=@{}; if(Test-Path $b){ Get-ChildItem $b -Recurse -File -Force -EA SilentlyContinue | ForEach-Object { $m[$_.FullName]="$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" } }; return $m }
function DiffH($x,$y){ $c=@(); foreach($k in $y.Keys){ if(-not $x.ContainsKey($k)){$c+="ADD:$k"}elseif($x[$k]-ne$y[$k]){$c+="MOD:$k"} }; foreach($k in $x.Keys){ if(-not $y.ContainsKey($k)){$c+="DEL:$k"} }; return $c }

Write-Host "=== v1.4.3 MyTeam Team Organization Model Tests ==="

# ---------- scaffold ----------
Write-Host "`n[0] Organization scaffold"
$assets = @("organization-schema.yaml","team-schema.yaml","role-schema.yaml","agent-role-binding.yaml",
  "teams\software-engineering.yaml","teams\research.yaml","teams\creative.yaml","teams\engops.yaml","teams\advisory.yaml","teams\pm.yaml",
  "roles\architect.yaml","roles\developer.yaml","roles\tester.yaml","roles\reviewer.yaml","roles\analyst.yaml",
  "roles\lead.yaml","roles\planner.yaml","roles\writer.yaml","roles\ops.yaml","roles\manager.yaml",
  "integrations\router-integration.yaml","integrations\capability-integration.yaml","integrations\collaboration-integration.yaml","integrations\trace-integration.yaml")
foreach($a in $assets){ if(Test-Path (Join-Path $org $a)){ Pass "asset: $a" } else { Fail "missing: $a" } }

# ---------- schema invariants ----------
Write-Host "`n[Schema]"
$sch = Get-Content -Raw -Encoding UTF8 (Join-Path $org "organization-schema.yaml")
$inv = ([regex]::Matches($sch, 'org-\d:')).Count
if($inv -ge 7){ Pass "organization-schema has $inv invariants (org-1..)" } else { Fail "invariants < 7: $inv" }
if($sch -match 'Team -> Role -> Agent'){ Pass "model hierarchy Team -> Role -> Agent" } else { Fail "model hierarchy missing" }
if($sch -match 'auto-select-agent' -and $sch -match 'auto-add-team' -and $sch -match 'not_implemented'){ Pass "schema declares forbidden (not_implemented)" } else { Fail "forbidden missing" }

# parse bindings
$bind = Get-Content -Raw -Encoding UTF8 (Join-Path $org "agent-role-binding.yaml")
$rows = [regex]::Matches($bind, 'agent:\s*"([^"]+)",\s*role:\s*"([^"]+)",\s*team:\s*"([^"]+)"')

# ---------- Case1: 30 Agent Binding ----------
Write-Host "`n[Case1] 30 Agent Binding"
$agents = @($rows | ForEach-Object { $_.Groups[1].Value })
$uniq = $agents | Sort-Object -Unique
$srcAgents = (Get-ChildItem (Join-Path $root "source\prompts") -Recurse -Filter *.md).Count
if($rows.Count -eq 30 -and $uniq.Count -eq 30){ Pass "Case1: 30/30 agents bound (team+role), unique" } else { Fail "Case1: bound=$($rows.Count) uniq=$($uniq.Count)" }
$allHaveRoleTeam = $true; foreach($m in $rows){ if(-not $m.Groups[2].Value -or -not $m.Groups[3].Value){ $allHaveRoleTeam=$false } }
if($allHaveRoleTeam){ Pass "Case1: every binding has role + team" } else { Fail "Case1: binding missing role/team" }
if($srcAgents -eq 30){ Pass "Case1: source prompts = 30 (matches binding)" } else { Fail "Case1: source prompts=$srcAgents" }

# ---------- Case2: Team Lookup ----------
Write-Host "`n[Case2] Team Lookup (java-developer)"
$jd = $rows | Where-Object { $_.Groups[1].Value -eq "java-developer" } | Select-Object -First 1
if($jd -and $jd.Groups[2].Value -eq "developer" -and $jd.Groups[3].Value -eq "software-engineering"){ Pass "Case2: java-developer -> software-engineering / developer" } else { Fail "Case2: lookup mismatch" }
$cliTrace = (& node $cli organization trace java-developer 2>&1) -join "`n"
if($cliTrace -match "software-engineering -> developer -> java-developer"){ Pass "Case2: CLI trace chain correct" } else { Fail "Case2: CLI trace failed" }

# ---------- Case3: Router Integration ----------
Write-Host "`n[Case3] Router Integration (team + role candidates)"
$ri = Get-Content -Raw -Encoding UTF8 (Join-Path $org "integrations\router-integration.yaml")
if($ri -match 'team_candidate' -and $ri -match 'role_candidate' -and $ri -match 'agent_candidates'){ Pass "Case3: router-integration declares team/role/agent candidates" } else { Fail "Case3: router candidates missing" }
$state = Get-Content -Raw -Encoding UTF8 (Join-Path $ctx "organization-state.yaml")
if($state -match '(?s)team_candidate: "software-engineering"[\s\S]*?role_candidate:[\s\S]*?agent_candidates:'){ Pass "Case3: state has task->team+role+agent candidates" } else { Fail "Case3: state candidates missing" }
if($ri -match 'PM \+ Approval' -or $ri -match 'org-6'){ Pass "Case3: final decision -> PM + Approval (no auto-select)" } else { Fail "Case3: no-auto-select guard missing" }

# ---------- Case4: Collaboration Handoff ----------
Write-Host "`n[Case4] Collaboration Handoff (architect -> developer, role ref)"
$ci = Get-Content -Raw -Encoding UTF8 (Join-Path $org "integrations\collaboration-integration.yaml")
if($ci -match 'from_role' -and $ci -match 'to_role' -and $ci -match 'from_team' -and $ci -match 'to_team'){ Pass "Case4: handoff extension adds from/to role + team" } else { Fail "Case4: handoff role/team fields missing" }
if($ci -match 'from_agent' -and $ci -match 'to_agent'){ Pass "Case4: handoff retains from_agent/to_agent (v1.4)" } else { Fail "Case4: agent fields dropped" }
if($state -match '(?s)from_role: "architect"[\s\S]*?to_role: "developer"'){ Pass "Case4: state handoff architect -> developer (role reference)" } else { Fail "Case4: state handoff role ref missing" }

# ---------- Case5: Trace Integration ----------
Write-Host "`n[Case5] Trace Integration (team -> role -> agent)"
$ti = Get-Content -Raw -Encoding UTF8 (Join-Path $org "integrations\trace-integration.yaml")
if($ti -match 'team_ref' -and $ti -match 'role_ref' -and $ti -match 'Team -> Role -> Agent -> Trace'){ Pass "Case5: trace-integration declares team_ref/role_ref + chain" } else { Fail "Case5: trace refs/chain missing" }
if($ti -match 'metadata' -and $ti -match 'not.*modify|不.*trace schema|不改 trace'){ Pass "Case5: uses trace metadata (does not modify trace schema)" } else { Fail "Case5: trace schema safety note missing" }
# resolve a real trace source agent through binding => proves team->role->agent
$ev = Get-Content -Raw -Encoding UTF8 (Join-Path $root ".ai\context\debug-trace\events\TR-0001-events.yaml")
$srcMatch = [regex]::Match($ev, 'layer: "agent"[\s\S]*?source: "([^"]+)"')
$srcAgent = if($srcMatch.Success){ $srcMatch.Groups[1].Value } else { "" }
$resolved = $rows | Where-Object { $_.Groups[1].Value -eq $srcAgent } | Select-Object -First 1
if($resolved){ Pass "Case5: trace source '$srcAgent' resolves -> $($resolved.Groups[3].Value) -> $($resolved.Groups[2].Value) -> $srcAgent" } else { Fail "Case5: trace source not resolvable via binding" }
if($state -match '(?s)trace_links:[\s\S]*?team_ref: "software-engineering"'){ Pass "Case5: state trace_links show team->role->agent->trace" } else { Fail "Case5: state trace_links missing" }

# ---------- Case6: CLI validate ----------
Write-Host "`n[Case6] CLI validate"
$v = (& node $cli organization validate 2>&1) -join "`n"
if($v -match "organization validate: PASS"){ Pass "Case6: myteam organization validate PASS" } else { Fail "Case6: organization validate did not PASS" }
$st = (& node $cli organization status 2>&1) -join "`n"
if($st -match "Agents: 30/30 bound" -and $st -match "Teams \(6\)"){ Pass "Case6: CLI organization status (6 teams, 30/30)" } else { Fail "Case6: organization status failed" }

# ---------- Case7: Plugin Isolation ----------
Write-Host "`n[Case7] Plugin Isolation"
$before = Snapshot $hostCfg
$null = & node $cli organization status 2>&1
$null = & node $cli organization trace java-lead 2>&1
$null = & node $cli organization validate 2>&1
Start-Sleep -Milliseconds 50
$after = Snapshot $hostCfg
$d = DiffH $before $after
if($d.Count -eq 0){ Pass "Case7: organization CLI leaves ~/.config/opencode unchanged (0 mutations)" } else { Fail ("Case7 host mutated: " + ($d -join '; ')) }

# ---------- Case8: Baseline Check ----------
Write-Host "`n[Case8] Baseline Check"
$srcPrompts = (Get-ChildItem (Join-Path $root "source\prompts") -Recurse -Filter *.md).Count
$mfest = Get-Content -Raw -Encoding UTF8 (Join-Path $root "manifest\platform-manifest.yaml")
$bAgent = [regex]::Match($mfest, '(?m)^\s*agent:\s*(\d+)').Groups[1].Value
$bMcp   = [regex]::Match($mfest, '(?m)^\s*mcp:\s*(\d+)').Groups[1].Value
$bSkill = [regex]::Match($mfest, '(?m)^\s*skill:\s*(\d+)').Groups[1].Value
$bWf    = [regex]::Match($mfest, '(?m)^\s*workflow:\s*(\d+)').Groups[1].Value
if($srcPrompts -eq 30){ Pass "Case8: source agents = 30" } else { Fail "Case8: agents=$srcPrompts" }
if($bAgent -eq "30" -and $bMcp -eq "5" -and $bSkill -eq "26" -and $bWf -eq "8"){ Pass "Case8: manifest baseline agent=30 mcp=5 skill=26 workflow=8" } else { Fail "Case8: manifest baseline agent=$bAgent mcp=$bMcp skill=$bSkill workflow=$bWf" }

# ---------- boundary + registry ----------
Write-Host "`n[Boundary]"
$reg = Get-Content -Raw -Encoding UTF8 (Join-Path $root ".ai\context\team-registry.yaml")
if($reg -match 'organization_ref' -and $reg -match 'Team Runtime Registry'){ Pass "team-registry kept as Runtime Registry (organization_ref added, not replaced)" } else { Fail "registry reference missing/replaced" }
if($state -notmatch '(?m)^\s*(auto_add_team|auto_add_role|auto_replace_agent|auto_select_agent|auto_restructure)\s*:'){ Pass "organization-state free of forbidden fields" } else { Fail "organization-state contains forbidden field" }

# ---------- Agent modification scope ----------
Write-Host "`n[Agent scope]"
$modified = 0; $unexpected = @()
Get-ChildItem (Join-Path $root "source\prompts") -Recurse -Filter *.md | ForEach-Object {
  $c = Get-Content -Raw -Encoding UTF8 $_.FullName
  if($c -match 'v1\.4\.3' -or $c -match 'Organization Model' -or $c -match 'Organization Registry' -or $c -match 'Organization 一致性'){
    $script:modified++
    if($_.Name -notin @("project-manager-agent.md","engops-lead.md","project-health-agent.md")){ $script:unexpected += $_.Name }
  }
}
if($modified -eq 3 -and $unexpected.Count -eq 0){ Pass "only 3 agents modified (pm / engops-lead / project-health)" } else { Fail ("agent scope: modified=$modified unexpected=[" + ($unexpected -join ',') + "]") }

# ---------- docs + metadata ----------
Write-Host "`n[Docs + Metadata]"
if(Test-Path (Join-Path $root "source\docs\team-organization-model-spec.md")){ Pass "doc: team-organization-model-spec.md" } else { Fail "doc org-model spec missing" }
if(Test-Path (Join-Path $root "source\docs\role-agent-binding-spec.md")){ Pass "doc: role-agent-binding-spec.md" } else { Fail "doc role-binding spec missing" }
if($mfest -match 'organization:' -and $mfest -match 'Team -> Role -> Agent'){ Pass "manifest lists v1.4.3 organization" } else { Fail "manifest organization missing" }
$ml = Get-Content -Raw -Encoding UTF8 (Join-Path $root "migration\migration-log.yaml")
if($ml -match 'm-021'){ Pass "migration-log m-021 added" } else { Fail "migration-log m-021 missing" }

Write-Host ""
Write-Host "=== RESULT: $pass pass, $fail fail ==="
if($fail -eq 0){ Write-Host "ALL CHECKS PASSED" } else { Write-Host "SOME CHECKS FAILED"; exit 1 }
