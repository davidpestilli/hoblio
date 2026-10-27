# Hoblio — evaluation harness for flow composition (run_flow / subflows / Grok bot)
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/eval-flow-compose.ps1
$ErrorActionPreference = "Continue"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

$Pass = 0
$Fail = 0

function Write-Eval {
    param(
        [string]$Id,
        [bool]$Ok,
        [string]$Detail = ""
    )
    if ($Ok) {
        $script:Pass++
        if ($Detail) {
            Write-Output "GROK_EVAL: $Id PASS $Detail"
        } else {
            Write-Output "GROK_EVAL: $Id PASS"
        }
    } else {
        $script:Fail++
        if ($Detail) {
            Write-Output "GROK_EVAL: $Id FAIL $Detail"
        } else {
            Write-Output "GROK_EVAL: $Id FAIL"
        }
    }
}

function Invoke-External {
    param([Parameter(Mandatory = $true)][scriptblock]$Command)
    $global:LASTEXITCODE = $null
    $null = & $Command 2>&1
    $code = $global:LASTEXITCODE
    if ($null -eq $code) { return -1 }
    return [int]$code
}

function Test-CommandExists {
    param([string]$Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

Write-Eval "P1" (Test-CommandExists "rustc")
Write-Eval "P2" (Test-CommandExists "cargo")

$composeDemo = Join-Path $RepoRoot "examples\flow-compose-demo"
$isolatedDemo = Join-Path $RepoRoot "examples\flow-compose-isolated"
$subflowDemo = Join-Path $RepoRoot "examples\flow-compose-subflow"
Write-Eval "P3" (Test-Path (Join-Path $composeDemo "flow.json"))
Write-Eval "P4" (Test-Path (Join-Path $isolatedDemo "flow.json"))
Write-Eval "P5" (Test-Path (Join-Path $subflowDemo "flow.json"))

if ($Fail -gt 0) {
    Write-Output "GROK_EVAL: SUMMARY pass=$Pass fail=$Fail blocked=prerequisites"
    exit 2
}

$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path

# --- Rust unit / integration (runtime composition tests) ---
$code = Invoke-External { cargo test -p hoblio-model run_flow_roundtrip -- --exact }
Write-Eval "T-R01" ($code -eq 0) $(if ($code -ne 0) { "exit $code" })

$code = Invoke-External { cargo test -p hoblio-runtime flow_compose_demo_runs -- --exact }
Write-Eval "T-R02" ($code -eq 0) $(if ($code -ne 0) { "exit $code" })

$code = Invoke-External { cargo test -p hoblio-runtime flow_compose_isolated_demo_runs -- --exact }
Write-Eval "T-R03" ($code -eq 0) $(if ($code -ne 0) { "exit $code" })

$code = Invoke-External { cargo test -p hoblio-runtime flow_compose_subflow_demo_runs -- --exact }
Write-Eval "T-R04" ($code -eq 0) $(if ($code -ne 0) { "exit $code" })

$code = Invoke-External { cargo test -p hoblio-serde flow_compose_demo_validates -- --exact }
Write-Eval "T-R05" ($code -eq 0) $(if ($code -ne 0) { "exit $code" })

# --- CLI validate (composition graph) ---
foreach ($pair in @(
        @("T-V-compose", $composeDemo),
        @("T-V-isolated", $isolatedDemo),
        @("T-V-subflow", $subflowDemo)
    )) {
    $id = $pair[0]
    $path = $pair[1]
    $global:LASTEXITCODE = $null
    $null = cargo run -q -p hoblio-cli -- validate $path 2>&1
    $code = $global:LASTEXITCODE
    if ($null -eq $code) { $code = -1 }
    Write-Eval $id ($code -eq 0) $(if ($code -ne 0) { "validate exit $code" })
}

# --- CLI run demos ---
function Test-RunDemo {
    param([string]$Id, [string]$Path, [string[]]$MustMatch, [string[]]$MustNotMatch)
    $global:LASTEXITCODE = $null
    $out = & cargo run -q -p hoblio-cli -- run $Path 2>&1 | Out-String
    $code = $global:LASTEXITCODE
    if ($null -eq $code) { $code = -1 }
    $ok = ($code -eq 0) -and ($out -match "last_node=end")
    foreach ($m in $MustMatch) {
        if ($out -notmatch [regex]::Escape($m)) { $ok = $false }
    }
    foreach ($n in $MustNotMatch) {
        if ($out -match [regex]::Escape($n)) { $ok = $false }
    }
    Write-Eval $Id $ok $(if (-not $ok) { "run exit $code or output mismatch" })
}

Test-RunDemo "T-E01" $composeDemo @("From child: Hello, Hoblio!", "Done flag: yes") @()
$global:LASTEXITCODE = $null
$isoOut = & cargo run -q -p hoblio-cli -- run $isolatedDemo 2>&1 | Out-String
$isoCode = $global:LASTEXITCODE
if ($null -eq $isoCode) { $isoCode = -1 }
$isoOk = ($isoCode -eq 0) -and ($isoOut -match "last_node=end") -and ($isoOut -match "log: parent_marker=visible result=ok-from-parent") -and ($isoOut -match "result=ok-from-parent")
Write-Eval "T-E02" $isoOk $(if (-not $isoOk) { "isolated scope output mismatch" })
Test-RunDemo "T-E03" $subflowDemo @("Message: Hi Embedded (inline)") @()

# --- Negative: run_flow cycle (temp project) ---
$cycleDir = Join-Path $env:TEMP "hoblio-eval-compose-cycle"
if (Test-Path $cycleDir) { Remove-Item -Recurse -Force $cycleDir }
New-Item -ItemType Directory -Path $cycleDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $cycleDir "flows") | Out-Null
Write-Utf8NoBom (Join-Path $cycleDir "manifest.json") '{"name":"cycle","version":"0.1.0","flows":{"a":{"path":"flows/a.json"},"b":{"path":"flows/b.json"}}}'
Write-Utf8NoBom (Join-Path $cycleDir "flow.json") '{"start":"start","nodes":[{"id":"start","kind":"start"},{"id":"run","kind":"action","action":{"type":"run_flow","flow_id":"a"}},{"id":"end","kind":"end"}],"edges":[{"from":"start","to":"run"},{"from":"run","to":"end"}]}'
Write-Utf8NoBom (Join-Path $cycleDir "flows\a.json") '{"start":"start","nodes":[{"id":"start","kind":"start"},{"id":"run","kind":"action","action":{"type":"run_flow","flow_id":"b"}},{"id":"end","kind":"end"}],"edges":[{"from":"start","to":"run"},{"from":"run","to":"end"}]}'
Write-Utf8NoBom (Join-Path $cycleDir "flows\b.json") '{"start":"start","nodes":[{"id":"start","kind":"start"},{"id":"run","kind":"action","action":{"type":"run_flow","flow_id":"a"}},{"id":"end","kind":"end"}],"edges":[{"from":"start","to":"run"},{"from":"run","to":"end"}]}'
$global:LASTEXITCODE = $null
$cycleOut = & cargo run -q -p hoblio-cli -- validate $cycleDir 2>&1 | Out-String
$cycleCode = $global:LASTEXITCODE
Write-Eval "T-N01" (($cycleCode -ne 0) -and ($cycleOut -match "RunFlowCycle|run_flow composition cycle")) $(if ($cycleCode -eq 0) { "expected cycle rejection" })

$global:LASTEXITCODE = $null
$cycleRunOut = & cargo run -q -p hoblio-cli -- run $cycleDir 2>&1 | Out-String
$cycleRunCode = $global:LASTEXITCODE
Write-Eval "T-N02" (($cycleRunCode -ne 0) -and ($cycleRunOut -match "RunFlowCycle|run_flow composition cycle")) $(if ($cycleRunCode -eq 0) { "run should reject cycle before execution" })

# --- Studio build ---
$studioDir = Join-Path $RepoRoot "crates\hoblio-studio"
if (Test-Path $studioDir) {
    Push-Location $studioDir
    if (-not (Test-Path "node_modules")) {
        $null = npm install --silent 2>&1
    }
    $code = Invoke-External { npm run build }
    $distOk = ($code -eq 0) -and (Test-Path "dist\index.html")
    Write-Eval "T-F01" $distOk $(if (-not $distOk) { "build exit $code" })
    Pop-Location
} else {
    Write-Eval "T-F01" $false "studio dir missing"
}

Write-Output "GROK_EVAL: SUMMARY pass=$Pass fail=$Fail"
if ($Fail -gt 0) {
    exit 1
}
exit 0
