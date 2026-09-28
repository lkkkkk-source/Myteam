[CmdletBinding()]
param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$results = @()

function Assert-Test([string]$name, [bool]$cond, [string]$detail) {
    $script:results += [pscustomobject]@{ Case = $name; Pass = $cond; Detail = $detail }
}

# ---- C1: Baseline 冻结 ----
$manifest = Get-Content (Join-Path $Root "manifest\platform-manifest.yaml") -Raw -Encoding UTF8
Assert-Test "C1" ($manifest -match "agent: 30" -and $manifest -match "mcp: 5" -and $manifest -match "skill: 26" -and $manifest -match "workflow: 8") "manifest baseline frozen"

# ---- C2: Source Layer 完整性 ----
$p = (Get-ChildItem (Join-Path $Root "source\prompts") -Recurse -File -Filter *.md).Count
$d = (Get-ChildItem (Join-Path $Root "source\docs") -Recurse -File).Count
$w = (Get-ChildItem (Join-Path $Root "source\workflows") -Recurse -File).Count
$cfgSrc = Join-Path $Root "source\opencode_source.json"
$cfg = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($cfgSrc)) | ConvertFrom-Json
$agent = $cfg.agent.PSObject.Properties.Name.Count
$mcp = if ($cfg.mcp) { $cfg.mcp.PSObject.Properties.Name.Count } else { 0 }
Assert-Test "C2" ($p -eq 30 -and $d -eq 22 -and $w -eq 8 -and $agent -eq 30 -and $mcp -eq 5) "prompts=$p docs=$d workflows=$w agents=$agent mcp=$mcp"

# ---- C3: Runtime 不被开发触碰 ----
$runtimeReadme = Get-Content (Join-Path $Root "runtime\README.md") -Raw -Encoding UTF8
Assert-Test "C3" ($runtimeReadme -match "never modified during development") "runtime declared read-only in development; installer plan is the only write path"

# ---- C4: Migration 可追踪 ----
$mig = Get-Content (Join-Path $Root "migration\migration-log.yaml") -Raw -Encoding UTF8
Assert-Test "C4" ($mig -match "v0.6.2" -and $mig -match "build") "migration log tracked v0.6.2"

# ---- C5: Rollback 信息完整 ----
$rb = Get-Content (Join-Path $Root "rollback\rollback-manifest.yaml") -Raw -Encoding UTF8
Assert-Test "C5" ($rb -match "restore-config" -and (Test-Path (Join-Path $Root "rollback\backups"))) "rollback manifest + backups dir present"

$passCount = ($results | Where-Object Pass).Count
$results | ForEach-Object { "{0} {1,-5} {2}" -f $_.Case, $(if($_.Pass){'PASS'}else{'FAIL'}), $_.Detail }
Write-Host "TOTAL: $passCount / $($results.Count) passed"
if ($passCount -ne $results.Count) { exit 1 }