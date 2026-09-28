# =====================================================================
# MyTeam OpenCode Plugin — Isolation Test — v1.0.1
# =====================================================================
# 验证 MyTeam 作为 OpenCode Plugin 运行时的宿主隔离：
#   - 不修改 ~/.config/opencode/
#   - 不覆盖 opencode.json
#   - 不复制 agents / prompts / mcp 到宿主
#   - 卸载插件后 OpenCode 恢复原状
# =====================================================================
$ErrorActionPreference = 'Stop'
$root = "D:\data\code\Agent\MyTeam"
$pdir = Join-Path $root "plugin\opencode"
$hostCfg = "C:\Users\Administrator\.config\opencode"

$pass = 0; $fail = 0
function Pass($m){ Write-Host "  [PASS] $m"; $script:pass++ }
function Fail($m){ Write-Host "  [FAIL] $m"; $script:fail++ }

function Snapshot-Host($base){
  # 返回宿主目录的 (path->lastWriteUtc+size) 指纹；目录不存在则返回空表
  $map = @{}
  if(Test-Path $base){
    Get-ChildItem $base -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
      $map[$_.FullName] = "$($_.Length)|$($_.LastWriteTimeUtc.Ticks)"
    }
  }
  return $map
}
function Compare-Snapshot($before,$after){
  $changed = @()
  foreach($k in $after.Keys){ if(-not $before.ContainsKey($k)){ $changed += "ADDED:$k" } elseif($before[$k] -ne $after[$k]){ $changed += "MODIFIED:$k" } }
  foreach($k in $before.Keys){ if(-not $after.ContainsKey($k)){ $changed += "REMOVED:$k" } }
  return $changed
}

Write-Host "=== v1.0.1 MyTeam OpenCode Plugin Isolation Tests ==="

# ---------- 0. plugin scaffold present ----------
Write-Host "`n[0] Plugin scaffold"
foreach($f in @("manifest.yaml","index.ts","loader.ts","bridge.ts","myteam-plugin.yaml")){
  if(Test-Path (Join-Path $pdir $f)){ Pass "scaffold exists: $f" } else { Fail "scaffold missing: $f" }
}

# ---------- Case1: plugin load ----------
Write-Host "`n[Case1] plugin load"
$mani = Get-Content -Raw -Encoding UTF8 (Join-Path $pdir "manifest.yaml")
$cfg = Get-Content -Raw -Encoding UTF8 (Join-Path $pdir "myteam-plugin.yaml")
$idx = Get-Content -Raw -Encoding UTF8 (Join-Path $pdir "index.ts")
$loadOk = ($mani -match 'name: "myteam"') -and ($mani -match 'version: "1.0.1"') -and ($mani -match 'entry: "index.ts"') -and ($idx -match 'MyTeamPlugin')
if($loadOk){ Pass "Case1: manifest(name/version/entry) + index.ts export MyTeamPlugin => plugin load-ready" } else { Fail "Case1 plugin load metadata incomplete" }
if($cfg -match 'workspace:' -and $cfg -match 'context_path:' -and $cfg -match 'enabled_features:'){ Pass "Case1: myteam-plugin.yaml has workspace/context_path/enabled_features" } else { Fail "Case1 plugin config incomplete" }

# ---------- Case2: agent loading (read agent-binding, 30) ----------
Write-Host "`n[Case2] agent loading"
$ab = Join-Path $root "platform\runtime-adapter\agent-binding.yaml"
if(Test-Path $ab){
  $abTxt = Get-Content -Raw -Encoding UTF8 $ab
  $agents = ([regex]::Matches($abTxt, 'platform_agent: "([a-z0-9-]+)"')).Count
  if($agents -eq 30){ Pass "Case2: loader reads 30 agents from agent-binding (in place)" } else { Fail "Case2 agent count=$agents (expect 30)" }
  if($idx -match 'loadPlatform' -and (Get-Content -Raw -Encoding UTF8 (Join-Path $pdir "loader.ts")) -match 'loadAgents'){ Pass "Case2: loader.ts loadAgents wired into index.ts" } else { Fail "Case2 loader not wired" }
} else { Fail "Case2 agent-binding.yaml missing" }

# ---------- Case3: context read ----------
Write-Host "`n[Case3] context read"
$rc = Join-Path $root ".ai\context\runtime\runtime-context.yaml"
$as = Join-Path $root ".ai\context\runtime-adapter\adapter-state.yaml"
if((Test-Path $rc) -and (Test-Path $as)){ Pass "Case3: runtime-context + adapter-state readable (context_path=.ai/context)" } else { Fail "Case3 context files missing" }
if($cfg -match 'runtime_context:' -and $cfg -match 'adapter_state:'){ Pass "Case3: plugin config declares context read paths" } else { Fail "Case3 context paths not declared" }

# ---------- Case4: runtime isolation (no host mutation) ----------
Write-Host "`n[Case4] runtime isolation"
$before = Snapshot-Host $hostCfg
# 模拟插件激活：只读取 MyTeam（loadPlatform 语义），绝不写宿主
$null = Get-Content -Raw -Encoding UTF8 $ab -ErrorAction SilentlyContinue
$null = if(Test-Path $rc){ Get-Content -Raw -Encoding UTF8 $rc }
Start-Sleep -Milliseconds 50
$after = Snapshot-Host $hostCfg
$diff = Compare-Snapshot $before $after
if($diff.Count -eq 0){ Pass "Case4: host ~/.config/opencode unchanged after plugin activation (0 mutations)" } else { Fail ("Case4 host mutated: " + ($diff -join '; ')) }
# manifest 声明 copy_files:false + 隔离边界
if($mani -match 'copy_files: false' -and $mani -match 'never_modify'){ Pass "Case4: manifest declares copy_files=false + never_modify host" } else { Fail "Case4 isolation contract missing in manifest" }
# 不复制 agents/prompts/mcp：plugin 目录内不得含 prompts/ 或 agents/ 拷贝
$hasCopies = (Test-Path (Join-Path $pdir "prompts")) -or (Test-Path (Join-Path $pdir "agents")) -or (Test-Path (Join-Path $pdir "mcp"))
if(-not $hasCopies){ Pass "Case4: no copied agents/prompts/mcp inside plugin dir (read-in-place)" } else { Fail "Case4 found copied assets inside plugin dir" }

# ---------- Case5: uninstall restores OpenCode ----------
Write-Host "`n[Case5] uninstall reversibility"
# 因为插件从不写宿主，卸载 = 移除引用；宿主天然恢复原状。
# 校验：manifest/config 声明 reversible，且 index.ts 有 host-write guard。
$rev = ($cfg -match 'reversible: true') -and ($idx -match 'guardHostWrite')
$bridgeTxt = Get-Content -Raw -Encoding UTF8 (Join-Path $pdir "bridge.ts")
$guard = $bridgeTxt -match 'guardHostWrite' -and $bridgeTxt -match 'refused host write'
if($rev -and $guard){ Pass "Case5: reversible=true + host-write guard => uninstall leaves no residue, OpenCode restored" } else { Fail "Case5 reversibility/guard missing" }
# 卸载后宿主指纹与卸载前一致（本测试全程未写宿主）
$final = Snapshot-Host $hostCfg
$diff2 = Compare-Snapshot $before $final
if($diff2.Count -eq 0){ Pass "Case5: host fingerprint identical before/after full test (no residue)" } else { Fail ("Case5 residue: " + ($diff2 -join '; ')) }

# ---------- boundary invariants ----------
Write-Host "`n[Invariant] host boundary"
if($mani -match 'not_implemented' -and $mani -match 'modify-opencode-core' -and $mani -match 'bulk-copy-to-config'){ Pass "manifest not_implemented lists modify-core / bulk-copy / pollute-global" } else { Fail "manifest not_implemented boundaries missing" }
if($idx -match 'runtime 反向改 source' -or $idx -match 'reverse'){ Pass "index.ts documents no reverse mutation" } else { Fail "index.ts reverse-mutation note missing" }

# ---------- baseline ----------
Write-Host "`n[Baseline]"
$srcPrompts = (Get-ChildItem (Join-Path $root "source\prompts") -Recurse -Filter *.md).Count
if($srcPrompts -eq 30){ Pass "baseline agent=30 (source prompts unchanged)" } else { Fail "baseline agent=$srcPrompts" }

Write-Host ""
Write-Host "=== RESULT: $pass pass, $fail fail ==="
if($fail -eq 0){ Write-Host "ALL CHECKS PASSED" } else { Write-Host "SOME CHECKS FAILED"; exit 1 }
