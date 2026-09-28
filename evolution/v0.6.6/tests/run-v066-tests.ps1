[CmdletBinding()]
param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$results = @()

function Assert-Test([string]$name, [bool]$cond, [string]$detail) {
    $script:results += [pscustomobject]@{ Case = $name; Pass = $cond; Detail = $detail }
}

$agents = @("java-architect", "java-reviewer", "java-tester")

# =========================================================
# Case1: Proposal 生成（3 个 batch 提案）
# =========================================================
$propOk = $true
foreach ($a in $agents) {
    $p = Join-Path $Root "evolution\v0.6.6\proposals\$a-v2.yaml"
    if ($a -eq "java-architect") { $pk = "P-066-01" } elseif ($a -eq "java-reviewer") { $pk = "P-066-02" } else { $pk = "P-066-03" }
    $raw = if (Test-Path $p) { Get-Content $p -Raw -Encoding UTF8 } else { "" }
    if (-not ((Test-Path $p) -and ($raw -match "to_version: v2") -and ($raw -match "type: additive") -and ($raw -match $pk))) { $propOk = $false }
}
Assert-Test "Case1" $propOk "v0.6.6 batch proposals (P-066-01..03) generated for 3 agents, additive"

# =========================================================
# Case2: approved 后生成 v2
# =========================================================
$v2Ok = $true
foreach ($a in $agents) {
    $applied = Join-Path $Root "evolution\v0.6.6\applied\$a-v2.md"
    $v2 = if (Test-Path $applied) { Get-Content $applied -Raw -Encoding UTF8 } else { "" }
    if (-not ((Test-Path $applied) -and ($v2 -match "version: v2") -and ($v2 -match "v0.6.6"))) { $v2Ok = $false }
}
Assert-Test "Case2" $v2Ok "approved -> applied/{agent}-v2.md generated for all 3 agents"

# =========================================================
# Case3: benchmark 执行（multi-agent BM-066-01）
# =========================================================
$bmAgg = Join-Path $Root "evolution\v0.6.6\benchmarks\BM-066-01-multi-agent-result.yaml"
$bmRaw = if (Test-Path $bmAgg) { Get-Content $bmAgg -Raw -Encoding UTF8 } else { "" }
$bmOk = (Test-Path $bmAgg) -and ($bmRaw -match "decision: accept") -and
        ($bmRaw -match "java-architect") -and ($bmRaw -match "java-reviewer") -and ($bmRaw -match "java-tester")
Assert-Test "Case3" $bmOk "multi-agent benchmark BM-066-01 covers 4 agents, decision accept"

# =========================================================
# Case4: reject 不会覆盖 source
# =========================================================
$rejectDemo = Join-Path $Root "evolution\v0.6.6\history\reject-demo-066.yaml"
$rejectRaw = if (Test-Path $rejectDemo) { Get-Content $rejectDemo -Raw -Encoding UTF8 } else { "" }
$isRejected = $rejectRaw -match "(?m)^status: rejected"
$leak = $false
foreach ($a in $agents) {
    $s = Join-Path $Root "source\prompts\java\$a.md"
    $raw = if (Test-Path $s) { Get-Content $s -Raw -Encoding UTF8 } else { "" }
    if ($raw -match "REJECT_DEMO_066_NEVER_IN_SOURCE") { $leak = $true }
}
Assert-Test "Case4" ($isRejected -and -not $leak) "reject path does not overwrite source prompt"

# =========================================================
# Case5: accept 后 build 正常（batch 全量 released）
# =========================================================
$srcCount = (Get-ChildItem (Join-Path $Root "source\prompts") -Recurse -Filter *.md).Count
$manifest = Get-Content (Join-Path $Root "manifest\platform-manifest.yaml") -Raw -Encoding UTF8
$baseOk = ($manifest -match "agent: 30") -and ($manifest -match "mcp: 5") -and
          ($manifest -match "skill: 26") -and ($manifest -match "workflow: 8")
$srcApplied = $true
foreach ($a in $agents) {
    $s = Join-Path $Root "source\prompts\java\$a.md"
    if (-not ((Test-Path $s) -and ((Get-Content $s -Raw -Encoding UTF8) -match "version: v2"))) { $srcApplied = $false }
}
Assert-Test "Case5" ($baseOk -and $srcCount -eq 30 -and $srcApplied) "batch v2 applied to source, baseline intact (agent=30 prompt=$srcCount)"

# =========================================================
# Case6: registry <-> source <-> agents 三方一致 + state 一致
# =========================================================
$reg = Join-Path $Root "evolution\version-registry.yaml"
$regRaw = if (Test-Path $reg) { Get-Content $reg -Raw -Encoding UTF8 } else { "" }
$state = Join-Path $Root "evolution\evolution-state.yaml"
$stateRaw = if (Test-Path $state) { Get-Content $state -Raw -Encoding UTF8 } else { "" }
$regOk = (Test-Path $reg) -and ($regRaw -match "total_agents: 30") -and
         ($regRaw -match "java-architect") -and ($regRaw -match "java-reviewer") -and ($regRaw -match "java-tester")
$stateOk = (Test-Path $state) -and ($stateRaw -match "released: 4")
$syncOk = $true
foreach ($a in $agents) {
    $s = Join-Path $Root "source\prompts\java\$a.md"
    $g = Join-Path $Root "agents\java\$a.md"
    if (-not ((Test-Path $s) -and (Test-Path $g) -and
        ((Get-FileHash $s).Hash -eq (Get-FileHash $g).Hash))) { $syncOk = $false }
}
Assert-Test "Case6" ($regOk -and $stateOk -and $syncOk) "version-registry(30) + evolution-state(released=4) + source<->agents sync all consistent"

$passCount = ($results | Where-Object Pass).Count
$results | ForEach-Object { "{0} {1,-5} {2}" -f $_.Case, $(if($_.Pass){'PASS'}else{'FAIL'}), $_.Detail }
Write-Host "TOTAL: $passCount / $($results.Count) passed"
if ($passCount -ne $results.Count) { exit 1 }
