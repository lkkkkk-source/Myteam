# Model Routing Recommendation Layer v0.6.8 — Test Runner
# -----------------------------------------------------------------------------
# 本阶段为纯设计/配置（YAML），测试方式：
#   1. 校验所有 YAML 可解析
#   2. 一致性校验（registry / policy / schema / history 引用关系）
#   3. 输出 5 个测试场景（tests/rm-scenario-*.yaml）的汇总结果
#
# 只推荐、不执行：本脚本仅校验配置与引用的【一致性】，不触发模型调用 / 切换。
# -----------------------------------------------------------------------------

$ErrorActionPreference = "Stop"
$root = "D:\data\code\Agent\MyTeam"

$registryFile   = "$root\platform\registry\models\model-registry.yaml"
$policyFile     = "$root\platform\model-routing\routing-policy.yaml"
$schemaFile     = "$root\platform\model-routing\recommendation-schema.yaml"
$historyFile    = "$root\platform\model-routing\history\model-routing-history.yaml"
$profileSchema  = "$root\platform\registry\models\model-profile-schema.yaml"
$testsDir       = "$root\platform\model-routing\tests"

$pass = 0
$fail = 0
$results = @()

function Assert {
    param([bool]$cond, [string]$msg)
    if ($cond) { $script:pass++; Write-Host "  [PASS] $msg" -ForegroundColor Green }
    else       { $script:fail++; Write-Host "  [FAIL] $msg" -ForegroundColor Red }
}

Write-Host "=== v0.6.8 Model Routing Tests ===" -ForegroundColor Cyan

# ---------- 1. YAML files exist & non-empty (light weight, no external module) ----------
Write-Host "`n[1] YAML files exist & non-empty" -ForegroundColor Yellow
foreach ($f in @($registryFile,$policyFile,$schemaFile,$historyFile,$profileSchema)) {
    if (Test-Path $f) {
        $size = (Get-Item $f).Length
        Assert ($size -gt 0) "exists & non-empty: $([IO.Path]::GetFileName($f)) ($size bytes)"
    } else {
        Assert $false "missing: $f"
    }
}

# ---------- 2. Registry self-consistency ----------
Write-Host "`n[2] Registry self-consistency" -ForegroundColor Yellow
$regTxt = Get-Content -Raw $registryFile
$classes = ([regex]::Matches($regTxt, 'model_id:\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
Assert ($classes.Count -ge 4) "registry has >= 4 model classes (got $($classes.Count))"
Assert ($classes -contains "high-reasoning") "has high-reasoning"
Assert ($classes -contains "fast-coding")   "has fast-coding"
Assert ($classes -contains "long-context")  "has long-context"
Assert ($classes -contains "general")       "has general"
# No concrete model names bound (v0.6.8 only abstract)
$concrete = [regex]::IsMatch($regTxt, '(?i)(claude|gpt-|deepseek|gemini|llama)')
Assert (-not $concrete) "registry does NOT bind any concrete model name"

# ---------- 3. Policy references registry ----------
Write-Host "`n[3] Policy references registry" -ForegroundColor Yellow
$polTxt = Get-Content -Raw $policyFile
$recommended = ([regex]::Matches($polTxt, 'recommend:\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value } |
                Where-Object { $_ -ne "" })
$recommended = $recommended | Sort-Object -Unique
foreach ($rc in $recommended) {
    Assert ($classes -contains $rc) "policy recommend '$rc' exists in registry"
}
# policy does not decide/replace agents (bidirectional guard): it may use agent as an
# input condition (agent_role / agent), but must not recommend adding/replacing an agent.
Assert (-not ([regex]::IsMatch($polTxt, '(?i)recommend\s*(new|replace|create|add)\s*agent'))) "policy never recommends adding/replacing an agent"

# ---------- 4. Schema example references registry ----------
Write-Host "`n[4] Schema example references registry" -ForegroundColor Yellow
$schTxt = Get-Content -Raw $schemaFile
$exClass = ([regex]::Match($schTxt, 'model_class:\s*"([^"]+)"')).Groups[1].Value
Assert ($classes -contains $exClass) "schema example.model_class '$exClass' exists in registry"

# ---------- 5. History references registry ----------
Write-Host "`n[5] History references registry" -ForegroundColor Yellow
$hisTxt = Get-Content -Raw $historyFile
$hisClasses = ([regex]::Matches($hisTxt, 'recommended_class:\s*"([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
foreach ($hc in ($hisClasses | Sort-Object -Unique)) {
    Assert ($classes -contains $hc) "history recommended_class '$hc' exists in registry"
}
# history has no auto_learn = true
Assert (-not ([regex]::IsMatch($hisTxt, 'auto_learn:\s*true'))) "history auto_learn is false (record only)"
Assert ([regex]::IsMatch($hisTxt, 'auto_learn:\s*false')) "history declares auto_learn=false"

# ---------- 6. Human-confirm invariant (MR-1 release) ----------
Write-Host "`n[6] Human-confirm invariant (high-risk)" -ForegroundColor Yellow
Assert ([regex]::IsMatch($hisTxt, 'human_confirm:\s*true')) "history has human_confirm=true for high-risk"
Assert ([regex]::IsMatch($hisTxt, 'pending-user-confirmation')) "history flags pending-user-confirmation for high-risk"

# ---------- 7. Test scenarios present & PASS ----------
Write-Host "`n[7] Test scenarios" -ForegroundColor Yellow
$scenarios = Get-ChildItem "$testsDir\rm-scenario-*.yaml" -ErrorAction SilentlyContinue
Assert ($scenarios.Count -ge 5) "found >= 5 scenario files (got $($scenarios.Count))"
foreach ($sc in $scenarios) {
    $txt = Get-Content -Raw $sc.FullName
    if ($txt -match 'result:\s*"PASS"') { Assert $true "$($sc.BaseName) = PASS" }
    else { Assert $false "$($sc.BaseName) not PASS" }
}

Write-Host "`n=== RESULT: $pass pass, $fail fail ===" -ForegroundColor Cyan
if ($fail -gt 0) { exit 1 } else { Write-Host "ALL CHECKS PASSED" -ForegroundColor Green }
