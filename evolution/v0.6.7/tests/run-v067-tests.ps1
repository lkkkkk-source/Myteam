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
# Case1: Evolution Knowledge Layer 建立
#   pattern-registry.yaml + evolution-knowledge.yaml 存在且结构化
# =========================================================
$pr = Join-Path $Root "evolution\patterns\pattern-registry.yaml"
$ek = Join-Path $Root "evolution\knowledge\evolution-knowledge.yaml"
$prRaw = if (Test-Path $pr) { Get-Content $pr -Raw -Encoding UTF8 } else { "" }
$ekRaw = if (Test-Path $ek) { Get-Content $ek -Raw -Encoding UTF8 } else { "" }
$prOk = (Test-Path $pr) -and ($prRaw -match "PATTERN-001") -and ($prRaw -match "PATTERN-005") -and
        ($prRaw -match "category:\s+effective") -and ($prRaw -match "category:\s+failed")
$ekOk = (Test-Path $ek) -and ($ekRaw -match "pattern_registry") -and ($ekRaw -match "cross_team_reuse") -and
        ($ekRaw -match "PATTERN-001")
Assert-Test "Case1" ($prOk -and $ekOk) "pattern-registry (eff+failed) + evolution-knowledge (reuse) established"

# =========================================================
# Case2: cross-team Proposal 生成（research-analyst v2, 复用 PATTERN-001）
# =========================================================
$prop = Join-Path $Root "evolution\v0.6.7\proposals\research-analyst-v2.yaml"
$propRaw = if (Test-Path $prop) { Get-Content $prop -Raw -Encoding UTF8 } else { "" }
$propOk = (Test-Path $prop) -and ($propRaw -match "P-067-01") -and ($propRaw -match "to_version: v2") -and
          ($propRaw -match "type: additive") -and ($propRaw -match "PATTERN-001") -and
          ($propRaw -match "reused_from") -and ($propRaw -match "origin_team: java")
Assert-Test "Case2" $propOk "cross-team proposal P-067-01 reusing PATTERN-001 (java->research), additive"

# =========================================================
# Case3: approved 后生成 v2 并应用到 source + agents（同步）
# =========================================================
$applied = Join-Path $Root "evolution\v0.6.7\applied\research-analyst-v2.md"
$v2 = if (Test-Path $applied) { Get-Content $applied -Raw -Encoding UTF8 } else { "" }
$v2Ok = (Test-Path $applied) -and ($v2 -match "version: v2") -and ($v2 -match "v0.6.7") -and
        ($v2 -match "P-067-01") -and ($v2 -match "Strong hypothesis")
$src = Join-Path $Root "source\prompts\research\research-analyst.md"
$mir = Join-Path $Root "agents\research\research-analyst.md"
$syncOk = (Test-Path $src) -and (Test-Path $mir) -and
          ((Get-FileHash $src).Hash -eq (Get-FileHash $mir).Hash) -and
          ((Get-Content $src -Raw -Encoding UTF8) -match "version: v2")
Assert-Test "Case3" ($v2Ok -and $syncOk) "research-analyst v2 applied to source + agents, hashes synced"

# =========================================================
# Case4: cross-team Benchmark accept（BM-067-01）
# =========================================================
$bm = Join-Path $Root "evolution\v0.6.7\benchmarks\BM-067-01-cross-team-result.yaml"
$bmRaw = if (Test-Path $bm) { Get-Content $bm -Raw -Encoding UTF8 } else { "" }
$bmOk = (Test-Path $bm) -and ($bmRaw -match "BM-067-01") -and ($bmRaw -match "cross-team") -and
        ($bmRaw -match "decision: accept") -and ($bmRaw -match "delta") -and ($bmRaw -match "PATTERN-001")
Assert-Test "Case4" $bmOk "BM-067-01 cross-team benchmark recorded, decision=accept, delta reported"

# =========================================================
# Case5: reject / advisory 不覆盖 source + baseline intact
#   reject-demo marker 不得出现在 source；候选仅登记不自动应用
# =========================================================
$marker = "REJECT_DEMO_067_NEVER_IN_SOURCE"
$baseOk = (Test-Path (Join-Path $Root "evolution\version-registry.yaml")) -and
          (Test-Path (Join-Path $Root "evolution\evolution-state.yaml")) -and
          (Test-Path (Join-Path $Root "source\prompts"))
$markerInSource = $false
Get-ChildItem (Join-Path $Root "source\prompts") -Recurse -Filter *.md | ForEach-Object {
    if ((Get-Content $_.FullName -Raw -Encoding UTF8) -match $marker) { $script:markerInSource = $true }
}
$srcCount = (Get-ChildItem (Join-Path $Root "source\prompts") -Recurse -Filter *.md).Count
# advisory-only: next_candidates 记录存在，但其候选 id 不应被直接写进 source markdown
$ekRaw5 = Get-Content $ek -Raw -Encoding UTF8
$advisoryOk = ($ekRaw5 -match "next_candidates")
Assert-Test "Case5" ($baseOk -and (-not $markerInSource) -and ($srcCount -eq 10 -or $srcCount -eq 30) -and $advisoryOk) `
    "reject demo never touches source (marker absent), knowledge is advisory-only (next_candidates present), src=$srcCount"

# =========================================================
# Case6: registry / state / analytics 一致（released=5, research=1, pattern-metrics）
# =========================================================
$regRaw = Get-Content (Join-Path $Root "evolution\version-registry.yaml") -Raw -Encoding UTF8
$stateRaw = Get-Content (Join-Path $Root "evolution\evolution-state.yaml") -Raw -Encoding UTF8
$pmRaw = if (Test-Path (Join-Path $Root ".ai\context\analytics\metrics\evolution-pattern-metrics.yaml")) {
    Get-Content (Join-Path $Root ".ai\context\analytics\metrics\evolution-pattern-metrics.yaml") -Raw -Encoding UTF8 } else { "" }
$regOk = ($regRaw -match "total_agents: 30") -and ($regRaw -match "B-067-01") -and
         ($regRaw -match "cross-team-reuse")
$stateOk = ($stateRaw -match "released: 5") -and ($stateRaw -match "research: 1") -and
           ($stateRaw -match "BM-067-01")
$analyticOk = (Test-Path (Join-Path $Root ".ai\context\analytics\metrics\evolution-pattern-metrics.yaml")) -and
              ($pmRaw -match "PATTERN-001") -and ($pmRaw -match "reusable") -and ($pmRaw -match "avoid")
Assert-Test "Case6" ($regOk -and $stateOk -and $analyticOk) "registry(30, B-067-01 cross-team) + state(released=5,research=1) + analytics pattern-metrics consistent"

$passCount = ($results | Where-Object Pass).Count
$results | ForEach-Object { "{0} {1,-5} {2}" -f $_.Case, $(if($_.Pass){'PASS'}else{'FAIL'}), $_.Detail }
Write-Host "TOTAL: $passCount / $($results.Count) passed"
if ($passCount -ne $results.Count) { exit 1 }
