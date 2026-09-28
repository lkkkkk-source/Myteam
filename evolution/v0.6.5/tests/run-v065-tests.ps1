[CmdletBinding()]
param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$results = @()

function Assert-Test([string]$name, [bool]$cond, [string]$detail) {
    $script:results += [pscustomobject]@{ Case = $name; Pass = $cond; Detail = $detail }
}

# =========================================================
# Case1: Proposal 生成
# =========================================================
$prop = Join-Path $Root "evolution\v0.6.5\proposals\java-developer-v2.yaml"
$propRaw = if (Test-Path $prop) { Get-Content $prop -Raw -Encoding UTF8 } else { "" }
$propOk = (Test-Path $prop) -and
          ($propRaw -match "proposal_id: P-065-01") -and
          ($propRaw -match "target_version: v2") -and
          ($propRaw -match "upgrade_type: additive")
Assert-Test "Case1" $propOk "proposal java-developer-v2.yaml generated (P-065-01, additive)"

# =========================================================
# Case2: approved 后生成 v2
# =========================================================
$applied = Join-Path $Root "evolution\v0.6.5\applied\java-developer-v2.md"
$v2Raw = if (Test-Path $applied) { Get-Content $applied -Raw -Encoding UTF8 } else { "" }
$approved = $propRaw -match "(?m)^status: approved"
$v2Generated = (Test-Path $applied) -and ($v2Raw -match "version: v2") -and ($v2Raw -match "Critical Rules")
Assert-Test "Case2" ($approved -and $v2Generated) "approved proposal -> applied/java-developer-v2.md exists"

# =========================================================
# Case3: benchmark 执行
# =========================================================
$bm = Join-Path $Root "evolution\v0.6.5\benchmarks\java-developer-result.yaml"
$bmRaw = if (Test-Path $bm) { Get-Content $bm -Raw -Encoding UTF8 } else { "" }
$bmOk = (Test-Path $bm) -and ($bmRaw -match "decision: accept") -and ($bmRaw -match "BM-065-01")
Assert-Test "Case3" $bmOk "benchmark executed -> decision recorded (accept)"

# =========================================================
# Case4: reject 不会覆盖 source
# =========================================================
# 不变式：status: rejected 的提案，其目标版本内容不得出现在 source
$rejectDemo = Join-Path $Root "evolution\v0.6.5\history\reject-demo-065.yaml"
$rejectRaw = if (Test-Path $rejectDemo) { Get-Content $rejectDemo -Raw -Encoding UTF8 } else { "" }
$isRejected = $rejectRaw -match "(?m)^status: rejected"
# source 中必须不含受 reject 保护标记（此处用 demo 专属符号验证未覆盖）
$sourceDev = Join-Path $Root "source\prompts\java\java-developer.md"
$srcRaw = if (Test-Path $sourceDev) { Get-Content $sourceDev -Raw -Encoding UTF8 } else { "" }
$noRejectLeak = $srcRaw -notmatch "REJECT_DEMO_NEVER_IN_SOURCE"
Assert-Test "Case4" ($isRejected -and $noRejectLeak) "reject path does not overwrite source prompt"

# =========================================================
# Case5: accept 后 build 正常
# =========================================================
# source 已更新为 v2（accept），基线仍为 Agent=30/MCP=5/Skill=26/Workflow=8
$srcCount = (Get-ChildItem (Join-Path $Root "source\prompts") -Recurse -Filter *.md).Count
$manifest = Get-Content (Join-Path $Root "manifest\platform-manifest.yaml") -Raw -Encoding UTF8
$baseOk = ($manifest -match "agent: 30") -and ($manifest -match "mcp: 5") -and
          ($manifest -match "skill: 26") -and ($manifest -match "workflow: 8")
# source 已应用 v2
$srcApplied = $srcRaw -match "version: v2"
Assert-Test "Case5" ($baseOk -and $srcCount -eq 30 -and $srcApplied) "accept applied to source, baseline intact (agent=30 prompt=$srcCount)"

$passCount = ($results | Where-Object Pass).Count
$results | ForEach-Object { "{0} {1,-5} {2}" -f $_.Case, $(if($_.Pass){'PASS'}else{'FAIL'}), $_.Detail }
Write-Host "TOTAL: $passCount / $($results.Count) passed"
if ($passCount -ne $results.Count) { exit 1 }
