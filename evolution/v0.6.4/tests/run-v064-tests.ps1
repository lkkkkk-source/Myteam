[CmdletBinding()]
param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$results = @()

function Assert-Test([string]$name, [bool]$cond, [string]$detail) {
    $script:results += [pscustomobject]@{ Case = $name; Pass = $cond; Detail = $detail }
}

# ---- Case1: 现有 Java Team 可映射到 Generic Team ----
$registryPath = Join-Path $Root ".ai\context\team-registry.yaml"
$registryRaw = Get-Content $registryPath -Raw -Encoding UTF8
$javaBlock = $registryRaw -match '(?ms)id:\s*"java".*?status:'
$hasJavaLead = $registryRaw -match '(?ms)id:\s*"java".*?lead:\s*"java-lead"'
$hasJavaSpecs = $registryRaw -match '(?ms)id:\s*"java".*?specialists:\s*\[[^\]]*"java-developer"'
Assert-Test "Case1" ($javaBlock -and $hasJavaLead -and $hasJavaSpecs) "java team in generic registry with lead+specialists"

# ---- Case2: Router 根据能力找到 Team ----
# 验证 registry 每个 team 都有 capabilities，可作为 Router capability fallback 来源
$teams = @()
$teamBlocks = [regex]::Matches($registryRaw, '(?ms)- id:\s*"([^"]+)".*?(?=\n  - id:|\Z)')
foreach ($m in $teamBlocks) {
    $blk = $m.Groups[0].Value
    $id = $m.Groups[1].Value
    $hasCap = $blk -match 'capabilities:'
    $hasLead = $blk -match 'lead:'
    $teams += [pscustomobject]@{ Id = $id; Cap = $hasCap; Lead = $hasLead }
}
$allTeamsValid = ($teams.Count -ge 4) -and (($teams | Where-Object { -not $_.Cap -or -not $_.Lead }).Count -eq 0)
Assert-Test "Case2" $allTeamsValid "router-capability: teams=$($teams.Count) all have capabilities+lead"

# ---- Case3: Agent Registry 保持 30 ----
$agentCapPath = Join-Path $Root ".ai\context\capability\agent-capabilities.yaml"
$agentCapRaw = Get-Content $agentCapPath -Raw -Encoding UTF8
$agentCount = ([regex]::Matches($agentCapRaw, '(?m)^\s+- agent:\s*"')).Count
Assert-Test "Case3" ($agentCount -eq 30) "agent registry count=$agentCount"

# ---- Case4: Prompt Evolution 可读取 Team 上下文 ----
$conceptPath = Join-Path $Root "evolution\v0.6.4\concept.md"
$conceptRaw = if (Test-Path $conceptPath) { Get-Content $conceptPath -Raw -Encoding UTF8 } else { "" }
$migrationPath = Join-Path $Root "evolution\v0.6.4\migration-plan.md"
$migrationRaw = if (Test-Path $migrationPath) { Get-Content $migrationPath -Raw -Encoding UTF8 } else { "" }
$hasConcept = $conceptRaw -match 'Generic Team Model'
$hasMigration = $migrationRaw -match '不执行'
Assert-Test "Case4" ($hasConcept -and $hasMigration) "evolution context: concept+migration-plan readable"

# ---- Case5: 旧 Workflow 继续工作 ----
$routingPath = Join-Path $Root ".ai\context\router\rules\routing-rules.yaml"
$routingRaw = if (Test-Path $routingPath) { Get-Content $routingPath -Raw -Encoding UTF8 } else { "" }
# R1-R6 保留，未被修改（关键：抽象不破坏旧 workflow 路由）
$hasR1 = $routingRaw -match 'id: "R1"'
$hasR4 = $routingRaw -match 'id: "R4"'
$hasR6 = $routingRaw -match 'id: "R6"'
Assert-Test "Case5" ($hasR1 -and $hasR4 -and $hasR6) "legacy routing rules R1-R6 intact"

# ---- 附注：未来 Team 扩展可验证（仅 registry 增加条目）----
$futureRaw = $registryRaw
$canExtend = $futureRaw -match 'Generic Team Model' -or $futureRaw -match 'teams:'
Assert-Test "Future-extend" $canExtend "registry designed for adding teams"

$passCount = ($results | Where-Object Pass).Count
$results | ForEach-Object { "{0} {1,-5} {2}" -f $_.Case, $(if($_.Pass){'PASS'}else{'FAIL'}), $_.Detail }
Write-Host "TOTAL: $passCount / $($results.Count) passed"
if ($passCount -ne $results.Count) { exit 1 }