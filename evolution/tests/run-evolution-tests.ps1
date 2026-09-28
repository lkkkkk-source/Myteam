[CmdletBinding()]
param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$results = @()

function Assert-Test([string]$name, [bool]$cond, [string]$detail) {
    $script:results += [pscustomobject]@{ Case = $name; Pass = $cond; Detail = $detail }
}

# ---- C1: external source 记录 ----
$ext = Join-Path $Root "external\agency-agents"
$hasGit = Test-Path (Join-Path $ext ".git")
$meta = Join-Path $Root "evolution\metadata\external-repo.yaml"
$metaOk = Test-Path $meta
$metaRaw = if ($metaOk) { Get-Content $meta -Raw -Encoding UTF8 } else { "" }
$extCount = if ($hasGit) { (Get-ChildItem $ext -Recurse -File -Filter *.md | Where-Object { $_.FullName -notmatch '\\.git\\' }).Count } else { 0 }
Assert-Test "C1" ($hasGit -and $metaOk -and $metaRaw -match "github.com/lkkkkk-source/agency-agents" -and $extCount -ge 250) "extRepo+metadata+agents=$extCount"

# ---- C2: Agent mapping ----
$map = Join-Path $Root "evolution\analysis\agent-mapping.yaml"
$mapOk = Test-Path $map
$mapRaw = if ($mapOk) { Get-Content $map -Raw -Encoding UTF8 } else { "" }
Assert-Test "C2" ($mapOk -and $mapRaw -match "matched" -and $mapRaw -match "partial" -and $mapRaw -match "no-internal") "mapping file with matched/partial/no-internal"

# ---- C3: comparison 生成 ----
$audit = Join-Path $Root "evolution\analysis\prompt-audit.md"
$comp  = Join-Path $Root "evolution\analysis\comparison.md"
Assert-Test "C3" ((Test-Path $audit) -and (Test-Path $comp) -and (Get-Content $comp -Raw -Encoding UTF8) -match "能力覆盖矩阵") "audit+comparison generated"

# ---- C4: proposal 生成（不修改 source prompt）----
$prop = Join-Path $Root "evolution\proposals\upgrade-proposals.yaml"
$propRaw = if (Test-Path $prop) { Get-Content $prop -Raw -Encoding UTF8 } else { "" }
$pOk = (Test-Path $prop) -and ($propRaw -match "P-0[0-9]") -and ($propRaw -match "C-0[0-9]") -and ($propRaw -match "Q-0[0-9]")
$srcCount = (Get-ChildItem (Join-Path $Root "source\prompts") -Recurse -Filter *.md).Count
Assert-Test "C4" ($pOk -and $propRaw -match "proposed" -and -not ($propRaw -match "merged|installed")) "proposals=proposed, no source prompt change (prompts=$srcCount)"

# ---- C5: baseline 检查 ----
$manifest = Get-Content (Join-Path $Root "manifest\platform-manifest.yaml") -Raw -Encoding UTF8
$baseOk = ($manifest -match "agent: 30") -and ($manifest -match "mcp: 5") -and ($manifest -match "skill: 26") -and ($manifest -match "workflow: 8")
$extNotInSource = -not (Test-Path (Join-Path $Root "source\external"))
$runtimeAgent = 0
$rg = "C:\Users\Administrator\.config\opencode\opencode.json"
if (Test-Path $rg) { $rc = Get-Content $rg -Raw -Encoding UTF8 | ConvertFrom-Json; $runtimeAgent = if ($rc.agent) { $rc.agent.PSObject.Properties.Name.Count } else { 0 } }
Assert-Test "C5" ($srcCount -eq 30 -and $baseOk -and $extNotInSource -and $runtimeAgent -eq 0) "baseline agent=30 runtime_agent=$runtimeAgent"

$passCount = ($results | Where-Object Pass).Count
$results | ForEach-Object { "{0} {1,-5} {2}" -f $_.Case, $(if($_.Pass){'PASS'}else{'FAIL'}), $_.Detail }
Write-Host "TOTAL: $passCount / $($results.Count) passed"
if ($passCount -ne $results.Count) { exit 1 }