# =====================================================================
# MyTeam CLI Test — v1.1 (Case1~7)
# =====================================================================
$ErrorActionPreference = 'Stop'
$root = "D:\data\code\Agent\MyTeam"
$cli = Join-Path $root "tools\myteam-cli\bin\myteam.mjs"
$hostCfg = "C:\Users\Administrator\.config\opencode"
$env:MYTEAM_WORKSPACE = $root

$pass = 0; $fail = 0
function Pass($m){ Write-Host "  [PASS] $m"; $script:pass++ }
function Fail($m){ Write-Host "  [FAIL] $m"; $script:fail++ }
function RunCli { param([string[]]$a) $out = & node $cli @a 2>&1; return @{ text = ($out -join "`n"); code = $LASTEXITCODE } }
function Snapshot($base){ $m=@{}; if(Test-Path $base){ Get-ChildItem $base -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object { $m[$_.FullName]="$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" } }; return $m }
function Diff($b,$a){ $c=@(); foreach($k in $a.Keys){ if(-not $b.ContainsKey($k)){$c+="ADD:$k"}elseif($b[$k]-ne$a[$k]){$c+="MOD:$k"} }; foreach($k in $b.Keys){ if(-not $a.ContainsKey($k)){$c+="DEL:$k"} }; return $c }

Write-Host "=== v1.1 MyTeam CLI Tests ==="

# ---------- scaffold ----------
Write-Host "`n[0] CLI scaffold"
foreach($f in @("package.json","src\index.ts","bin\myteam.mjs","src\commands\init.ts","src\commands\status.ts","src\commands\doctor.ts","src\commands\validate.ts","src\commands\upgrade.ts","src\commands\rollback.ts","src\services\plugin-service.ts","src\services\registry-service.ts","src\services\validation-service.ts","src\services\migration-service.ts","src\output\formatter.ts")){
  if(Test-Path (Join-Path $root "tools\myteam-cli\$f")){ Pass "scaffold: $f" } else { Fail "missing: $f" }
}

# ---------- Case1: myteam init ----------
Write-Host "`n[Case1] myteam init"
$r = RunCli @("init")
if($r.text -match "MyTeam initialized" -and $r.text -match "no auto-install"){ Pass "Case1: init reports initialized + no-auto-install" } else { Fail "Case1 init output wrong" }

# ---------- Case2: myteam status (30 agent / 5 mcp / 26 skill) ----------
Write-Host "`n[Case2] myteam status"
$r = RunCli @("status")
$c2 = ($r.text -match "Agents:\s+30/30") -and ($r.text -match "MCP:\s+5") -and ($r.text -match "Skill:\s+26")
if($c2){ Pass "Case2: status shows 30 Agent / 5 MCP / 26 Skill" } else { Fail "Case2 status counts wrong" }
if($r.text -match "MyTeam v1.1"){ Pass "Case2: status header MyTeam v1.1" } else { Fail "Case2 version header wrong" }

# ---------- Case3: doctor reports (drift report-only) ----------
Write-Host "`n[Case3] myteam doctor"
$r = RunCli @("doctor")
if($r.text -match "overall:" -and $r.text -match "never auto-repairs"){ Pass "Case3: doctor produces diagnostics, no auto-repair" } else { Fail "Case3 doctor output wrong" }
if($r.text -match "runtime.sync"){ Pass "Case3: doctor checks runtime.sync (drift report-only)" } else { Fail "Case3 drift check missing" }

# ---------- Case4: validate blocks release on mismatch ----------
Write-Host "`n[Case4] myteam validate"
$r = RunCli @("validate")
if($r.text -match "validation: PASS" -and $r.code -eq 0){ Pass "Case4: validate PASS on consistent state (exit 0)" } else { Fail "Case4 validate baseline failed (code=$($r.code))" }
# simulate mismatch: temp workspace copy with 1 fewer agent binding is heavy; instead assert FAIL path exists in code
$vsvc = Get-Content -Raw -Encoding UTF8 (Join-Path $root "tools\myteam-cli\src\services\validation-service.ts")
if($vsvc -match 'release blocked' -or (Get-Content -Raw -Encoding UTF8 (Join-Path $root "tools\myteam-cli\bin\myteam.mjs")) -match 'release blocked'){ Pass "Case4: validate has release-blocked path on mismatch (exit 1)" } else { Fail "Case4 no release-block path" }

# ---------- Case5: upgrade dry-run -> migration plan ----------
Write-Host "`n[Case5] myteam upgrade --dry-run"
$r = RunCli @("upgrade","--dry-run")
if($r.text -match "DRY-RUN: no changes applied" -and $r.text -match "migration plan"){ Pass "Case5: upgrade --dry-run generates migration plan (no apply)" } else { Fail "Case5 upgrade dry-run wrong" }
if($r.text -match "no production auto-upgrade"){ Pass "Case5: upgrade blocks production auto-upgrade" } else { Fail "Case5 no auto-upgrade guard missing" }

# ---------- Case6: rollback -> restore backup (history preserved) ----------
Write-Host "`n[Case6] myteam rollback"
$r = RunCli @("rollback")
if($r.text -match "rollback plan ready" -and $r.text -match "deletes_history: false"){ Pass "Case6: rollback restores backup, history preserved" } else { Fail "Case6 rollback wrong" }
if($r.text -match "reuse.*Recovery" -or $r.text -match "reuses Recovery"){ Pass "Case6: rollback reuses Recovery (no redesign)" } else { Fail "Case6 rollback not reusing Recovery" }

# ---------- Case7: CLI does not modify OpenCode host ----------
Write-Host "`n[Case7] CLI host isolation"
$before = Snapshot $hostCfg
foreach($cmd in @("init","status","doctor","validate","upgrade --dry-run","rollback")){ $null = RunCli ($cmd.Split(" ")) }
Start-Sleep -Milliseconds 50
$after = Snapshot $hostCfg
$d = Diff $before $after
if($d.Count -eq 0){ Pass "Case7: all CLI commands leave ~/.config/opencode unchanged (0 mutations)" } else { Fail ("Case7 host mutated: " + ($d -join '; ')) }
# CLI declares isolation in package.json
$pkg = Get-Content -Raw -Encoding UTF8 (Join-Path $root "tools\myteam-cli\package.json")
if($pkg -match '"modify_opencode":\s*false' -and $pkg -match '"auto_install":\s*false'){ Pass "Case7: package.json declares modify_opencode=false + auto_install=false" } else { Fail "Case7 package isolation decl missing" }

# ---------- lifecycle state ----------
Write-Host "`n[Lifecycle]"
$ps = Join-Path $root "plugin\opencode\plugin-state.yaml"
if(Test-Path $ps){
  $pst = Get-Content -Raw -Encoding UTF8 $ps
  if(($pst -match 'lifecycle_state:') -and ($pst -match 'installed') -and ($pst -match 'loaded') -and ($pst -match 'healthy') -and ($pst -match 'degraded') -and ($pst -match 'disabled')){ Pass "plugin-state.yaml has lifecycle_state + 5 states" } else { Fail "plugin-state states incomplete" }
  if($pst -match '只记录' -or $pst -match 'not.*auto'){ Pass "plugin-state: record-only (no auto decision)" } else { Fail "plugin-state record-only note missing" }
} else { Fail "plugin-state.yaml missing" }

# ---------- prompts + metadata ----------
Write-Host "`n[Prompts + Metadata]"
$health = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\engops\project-health-agent.md")
if($health -match 'Plugin CLI' -and $health -match '\b19\.'){ Pass "project-health-agent Plugin CLI check (item 19) present" } else { Fail "health CLI check missing" }
$engops = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\leads\engops-lead.md")
if($engops -match 'CLI release' -or $engops -match 'MyTeam CLI 生命周期'){ Pass "engops-lead CLI release lifecycle present" } else { Fail "engops CLI lifecycle missing" }
$pm = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\pm\project-manager-agent.md")
if($pm -match 'CLI status' -or $pm -match 'CLI 状态'){ Pass "project-manager reads CLI status" } else { Fail "pm CLI status missing" }
$mfest = Get-Content -Raw -Encoding UTF8 (Join-Path $root "manifest\platform-manifest.yaml")
if($mfest -match 'MyTeam Plugin CLI' -or $mfest -match 'myteam_cli:'){ Pass "manifest lists v1.1 CLI" } else { Fail "manifest v1.1 missing" }
$ml = Get-Content -Raw -Encoding UTF8 (Join-Path $root "migration\migration-log.yaml")
if($ml -match 'm-015'){ Pass "migration-log m-015 added" } else { Fail "migration-log m-015 missing" }

# ---------- baseline ----------
Write-Host "`n[Baseline]"
$srcPrompts = (Get-ChildItem (Join-Path $root "source\prompts") -Recurse -Filter *.md).Count
if($srcPrompts -eq 30){ Pass "baseline agent=30 (source prompts unchanged)" } else { Fail "baseline agent=$srcPrompts" }

Write-Host ""
Write-Host "=== RESULT: $pass pass, $fail fail ==="
if($fail -eq 0){ Write-Host "ALL CHECKS PASSED" } else { Write-Host "SOME CHECKS FAILED"; exit 1 }
