# =====================================================================
# MyTeam Agent Runtime Adapter — v1.6.1 Test Runner
# =====================================================================
# Usage (from repo root):  powershell -File evolution/v1.6.1/tests/run-v161-tests.ps1
# Runs the adapter smoke test (18/18 PASS) under plugin/opencode.
# =====================================================================
$ErrorActionPreference = "Stop"
$plugin = Join-Path $PSScriptRoot "..\..\..\plugin\opencode" | Resolve-Path
Push-Location $plugin
try {
  Write-Host "== v1.6.1 Agent Runtime Adapter tests ==" -ForegroundColor Cyan
  bun test\agent-instance.test.ts
  if ($LASTEXITCODE -ne 0) {
    Write-Host "TESTS FAILED (exit $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
  }
  Write-Host "ALL v1.6.1 TESTS PASSED" -ForegroundColor Green
} finally {
  Pop-Location
}
