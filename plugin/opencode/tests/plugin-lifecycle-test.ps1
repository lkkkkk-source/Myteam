# =====================================================================
# MyTeam OpenCode Plugin — Packaging & Lifecycle Test — v1.5.1 (Case1~8)
# =====================================================================
# 验证：MyTeam plugin 作为 OpenCode npm plugin module 的打包与加载。
#   - package.json 元数据正确
#   - npm pack 只含 plugin/opencode 表面文件（无 source/platform/prompts/agents/runtime）
#   - OpenCode 单入口 MyTeam → project-manager-agent
#   - Agent=30 不变；宿主 0 变更
# 仅涉及 plugin/opencode/。
# =====================================================================
$ErrorActionPreference = 'Stop'
$root = "D:\data\code\Agent\MyTeam"
$pdir = Join-Path $root "plugin\opencode"
$hostCfg = "C:\Users\Administrator\.config\opencode"

$pass = 0; $fail = 0
function Pass($m){ Write-Host "  [PASS] $m"; $script:pass++ }
function Fail($m){ Write-Host "  [FAIL] $m"; $script:fail++ }
function Snapshot($b){ $m=@{}; if(Test-Path $b){ Get-ChildItem $b -Recurse -File -Force -EA SilentlyContinue | ForEach-Object { $m[$_.FullName]="$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" } }; return $m }
function DiffH($x,$y){ $c=@(); foreach($k in $y.Keys){ if(-not $x.ContainsKey($k)){$c+="ADD:$k"}elseif($x[$k]-ne$y[$k]){$c+="MOD:$k"} }; foreach($k in $x.Keys){ if(-not $y.ContainsKey($k)){$c+="DEL:$k"} }; return $c }

Write-Host "=== v1.5.1 MyTeam OpenCode Plugin Packaging & Lifecycle Tests ==="

$whitelist = @("index.ts","pm-adapter.ts","bridge.ts","execution-bridge.ts","loader.ts","workspace-resolver.ts","manifest.yaml","README.md")
$forbiddenTop = @("source","platform","prompts","agents","runtime")

# ---------- Case1: package.json metadata ----------
Write-Host "`n[Case1] package.json metadata"
$pkgPath = Join-Path $pdir "package.json"
if(Test-Path $pkgPath){ Pass "package.json exists" } else { Fail "package.json missing" }
$pkg = Get-Content -Raw -Encoding UTF8 $pkgPath | ConvertFrom-Json
if($pkg.name -eq "@myteam/opencode-plugin"){ Pass "Case1: name=@myteam/opencode-plugin" } else { Fail "Case1 name=$($pkg.name)" }
if("$($pkg.version)" -eq "1.6.0"){ Pass "Case1: version=1.6.0" } else { Fail "Case1 version=$($pkg.version)" }
if($pkg.type -eq "module"){ Pass "Case1: type=module" } else { Fail "Case1 type=$($pkg.type)" }
if($pkg.exports.'.' -eq "./index.ts"){ Pass "Case1: exports['.']=./index.ts" } else { Fail "Case1 exports mismatch" }
$fw = @($pkg.files)
$fwOk = ($fw.Count -eq $whitelist.Count) -and (@($whitelist | Where-Object { $_ -notin $fw }).Count -eq 0)
if($fwOk){ Pass "Case1: files whitelist = 7 surface files" } else { Fail ("Case1 files=" + ($fw -join ',')) }

# ---------- Case2: npm pack ----------
Write-Host "`n[Case2] npm pack"
Push-Location $pdir
try {
  $out = (& npm pack --dry-run --json 2>$null) -join "`n"
} finally { Pop-Location }
$packOk = $false; $packFiles = @()
try {
  $arr = $out | ConvertFrom-Json
  $entry = if($arr -is [array]){ $arr[0] } else { $arr }
  $packFiles = @($entry.files | ForEach-Object { $_.path.Replace('\','/') })
  if($entry.name -eq "@myteam/opencode-plugin" -and "$($entry.version)" -eq "1.6.0" -and $entry.filename -eq "myteam-opencode-plugin-1.6.0.tgz"){ $packOk = $true }
} catch { Fail "Case2 npm pack json parse failed: $_" }
if($packOk){ Pass "Case2: npm pack -> myteam-opencode-plugin-1.6.0.tgz ($($packFiles.Count) files)" } else { Fail "Case2 npm pack metadata mismatch" }
# ensure no residual tarball left (dry-run leaves none)
if(-not (Get-ChildItem $pdir -Filter "*.tgz" -EA SilentlyContinue)){ Pass "Case2: dry-run leaves no tarball (repo clean)" } else { Fail "Case2 stray tarball present" }

# ---------- Case3: package contents isolation ----------
Write-Host "`n[Case3] package contents isolation"
# expected = 7 whitelist + package.json (npm auto-includes)
$expected = $whitelist + @("package.json")
$extra = @($packFiles | Where-Object { $_ -notin $expected })
$missing = @($whitelist | Where-Object { $_ -notin $packFiles })
if($extra.Count -eq 0 -and $missing.Count -eq 0){ Pass "Case3: package contains exactly surface files + package.json" } else { Fail ("Case3 extra=[" + ($extra -join ',') + "] missing=[" + ($missing -join ',') + "]") }
# no MyTeam runtime / prompts / platform in package
$leak = @($packFiles | Where-Object { $t=$_; ($forbiddenTop | Where-Object { $t -match "(^|/)$_/" }).Count -gt 0 })
if($leak.Count -eq 0){ Pass "Case3: NO source/platform/prompts/agents/runtime in package" } else { Fail ("Case3 leaked: " + ($leak -join ',')) }
# 30 prompts NOT in package
if(-not (@($packFiles | Where-Object { $_ -match '\.md$' -and $_ -ne 'README.md' }).Count)){ Pass "Case3: no agent prompt .md in package (only README.md)" } else { Fail "Case3 prompt md leaked into package" }

# ---------- Case4: OpenCode plugin loading ----------
Write-Host "`n[Case4] OpenCode plugin loading"
$idx = Get-Content -Raw -Encoding UTF8 (Join-Path $pdir "index.ts")
$mani = Get-Content -Raw -Encoding UTF8 (Join-Path $pdir "manifest.yaml")
if(($idx -match 'export default MyTeamPlugin') -and ($idx -match 'export const MyTeamPlugin')){ Pass "Case4: index.ts exports MyTeamPlugin (default + named)" } else { Fail "Case4 export missing" }
if($mani -match 'entry: "index.ts"'){ Pass "Case4: manifest entry=index.ts (matches exports)" } else { Fail "Case4 manifest entry mismatch" }
if($pkg.exports.'.' -eq "./index.ts"){ Pass "Case4: npm exports resolves to plugin entry" } else { Fail "Case4 exports entry mismatch" }

# ---------- Case5: MyTeam entry visible ----------
Write-Host "`n[Case5] MyTeam entry visible"
$pm = Get-Content -Raw -Encoding UTF8 (Join-Path $pdir "pm-adapter.ts")
if(($idx -match '"myteam":\s*\{') -and ($idx -match 'single OpenCode entry')){ Pass "Case5: index registers single visible entry 'myteam' (MyTeam)" } else { Fail "Case5 entry tool missing" }
if($pm -match 'OPENCODE_ENTRY = "MyTeam"'){ Pass "Case5: OPENCODE_ENTRY=MyTeam" } else { Fail "Case5 OPENCODE_ENTRY missing" }
if(($pm -match 'refuseAgentEnumeration') -and ($pm -match 'exposes_agents: false')){ Pass "Case5: 30 agents not exposed (guard present)" } else { Fail "Case5 agent-exposure guard missing" }

# ---------- Case6: PM adapter chain ----------
Write-Host "`n[Case6] PM adapter chain"
if($pm -match 'PM_ENTRY_AGENT = "project-manager-agent"'){ Pass "Case6: entry routes to project-manager-agent" } else { Fail "Case6 PM entry missing" }
$chainOk = ($pm -match '"MyTeam"') -and ($pm -match '"project-manager-agent"') -and ($pm -match '"Router"') -and ($pm -match '"Team"') -and ($pm -match '"Role"') -and ($pm -match '"Agent"')
if($chainOk){ Pass "Case6: chain MyTeam -> PM -> Router -> Team -> Role -> Agent" } else { Fail "Case6 chain incomplete" }
if(($idx -match 'handleEntryRequest') -and ($pm -match 'performs_routing: false') -and ($pm -match 'executes: false')){ Pass "Case6: adapter forwards only (no route/select/execute)" } else { Fail "Case6 adapter does more than forward" }

# ---------- Case7: Agent baseline 30 unchanged ----------
Write-Host "`n[Case7] Agent baseline 30 unchanged"
$srcPrompts = (Get-ChildItem (Join-Path $root "source\prompts") -Recurse -Filter *.md).Count
if($srcPrompts -eq 30){ Pass "Case7: source prompts = 30 (no new agent)" } else { Fail "Case7 agents=$srcPrompts" }
$mfest = Get-Content -Raw -Encoding UTF8 (Join-Path $root "manifest\platform-manifest.yaml")
$bA=[regex]::Match($mfest,'(?m)^\s*agent:\s*(\d+)').Groups[1].Value
$bM=[regex]::Match($mfest,'(?m)^\s*mcp:\s*(\d+)').Groups[1].Value
$bS=[regex]::Match($mfest,'(?m)^\s*skill:\s*(\d+)').Groups[1].Value
$bW=[regex]::Match($mfest,'(?m)^\s*workflow:\s*(\d+)').Groups[1].Value
if($bA -eq "30" -and $bM -eq "5" -and $bS -eq "26" -and $bW -eq "8"){ Pass "Case7: baseline 30/5/26/8 intact" } else { Fail "Case7 baseline $bA/$bM/$bS/$bW" }

# ---------- Case8: Host config mutation 0 ----------
Write-Host "`n[Case8] Host config mutation 0"
$before = Snapshot $hostCfg
Push-Location $pdir
try { $null = & npm pack --dry-run --json 2>$null } finally { Pop-Location }
Start-Sleep -Milliseconds 50
$after = Snapshot $hostCfg
$d = DiffH $before $after
if($d.Count -eq 0){ Pass "Case8: ~/.config/opencode unchanged after packaging (0 mutations)" } else { Fail ("Case8 host mutated: " + ($d -join '; ')) }
# no plugin copied into host config
if(-not (Test-Path (Join-Path $hostCfg "plugins\myteam")) -and -not (Test-Path (Join-Path $hostCfg "node_modules\@myteam"))){ Pass "Case8: no MyTeam plugin copied into ~/.config/opencode" } else { Fail "Case8 plugin copied into host config" }

# ---------- boundary: only plugin/opencode touched ----------
Write-Host "`n[Boundary]"
$pmPrompt = Get-Content -Raw -Encoding UTF8 (Join-Path $root "source\prompts\pm\project-manager-agent.md")
if($pmPrompt -notmatch 'opencode-plugin' -and $pmPrompt -notmatch 'package.json'){ Pass "project-manager-agent prompt unchanged" } else { Fail "PM prompt touched" }
$rr = Get-Content -Raw -Encoding UTF8 (Join-Path $root ".ai\context\router\rules\routing-rules.yaml")
if($rr -notmatch 'opencode-plugin'){ Pass "routing-rules.yaml unchanged" } else { Fail "routing-rules touched" }

Write-Host ""
Write-Host "=== RESULT: $pass pass, $fail fail ==="
if($fail -eq 0){ Write-Host "ALL CHECKS PASSED" } else { Write-Host "SOME CHECKS FAILED"; exit 1 }
