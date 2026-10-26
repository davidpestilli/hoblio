# Hoblio — evaluation harness for entregas A/B/C (slices 6–8)
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/eval-rpa-abc.ps1
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

function Run-Cli {
    param([string]$Subcommand, [string]$ProjectPath)
    $global:LASTEXITCODE = $null
    $out = & cargo run -q -p hoblio-cli -- $Subcommand $ProjectPath 2>&1 | Out-String
    $code = $global:LASTEXITCODE
    if ($null -eq $code) { $code = -1 }
    return @{ Out = $out; Code = $code }
}

# --- Prerequisites ---
Write-Eval "P1" (Test-CommandExists "rustc")
Write-Eval "P2" (Test-CommandExists "cargo")
Write-Eval "P3" (Test-Path (Join-Path $RepoRoot "examples\variables-loops-demo\flow.json"))
Write-Eval "P4" (Test-Path (Join-Path $RepoRoot "examples\files-lists-demo\flow.json"))
Write-Eval "P5" (Test-Path (Join-Path $RepoRoot "examples\resilience-demo\flow.json"))

if ($Fail -gt 0) {
    Write-Output "GROK_EVAL: SUMMARY pass=$Pass fail=$Fail blocked=prerequisites"
    exit 2
}

$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path

# --- Rust unit tests (entregas A/B/C) ---
$code = Invoke-External { cargo test -p hoblio-model --lib }
Write-Eval "T-R01" ($code -eq 0) $(if ($code -ne 0) { "exit $code" })

$code = Invoke-External { cargo test -p hoblio-runtime --lib demo_runs }
Write-Eval "T-R02" ($code -eq 0) "demo integration tests"

$code = Invoke-External { cargo test -p hoblio-runtime --lib lists::tests:: }
Write-Eval "T-R03" ($code -eq 0) "lists module tests"
$code = Invoke-External { cargo test -p hoblio-runtime --lib adjust_var::tests:: }
Write-Eval "T-R04" ($code -eq 0) "adjust_var module tests"

# --- Validate new examples ---
foreach ($name in @("variables-loops-demo", "files-lists-demo", "resilience-demo")) {
    $path = Join-Path $RepoRoot "examples\$name"
    $r = Run-Cli "validate" $path
    Write-Eval "T-V-$name" ($r.Code -eq 0) $(if ($r.Code -ne 0) { "exit $($r.Code)" })
}

# --- Entrega A: variables-loops-demo ---
$loopsPath = Join-Path $RepoRoot "examples\variables-loops-demo"
$r = Run-Cli "run" $loopsPath
Write-Eval "T-A01" (($r.Code -eq 0) -and ($r.Out -match "last_node=end"))
Write-Eval "T-A02" ($r.Out -match "while body counter=0")
Write-Eval "T-A03" ($r.Out -match "while body counter=3")
Write-Eval "T-A04" ($r.Out -match "done counter=4")
Write-Eval "T-A05" ($r.Out -match "repeat index=0")
Write-Eval "T-A06" ($r.Out -match "repeat index=3")

# --- Entrega B: files-lists-demo ---
$filesPath = Join-Path $RepoRoot "examples\files-lists-demo"
$r = Run-Cli "run" $filesPath
$reportPath = Join-Path $filesPath "output\report.txt"
$reportOk = $false
if (Test-Path $reportPath) {
    $reportText = Get-Content $reportPath -Raw -Encoding UTF8
    $reportOk = ($reportText -match "report") -and ($reportText -match "item=alpha") -and ($reportText -match "item=beta")
    Remove-Item $reportPath -Force -ErrorAction SilentlyContinue
}
Write-Eval "T-B01" (($r.Code -eq 0) -and ($r.Out -match "last_node=end"))
Write-Eval "T-B02" $reportOk "output/report.txt content"

# For each on runtime list (no seed list in variables)
$flowJson = Get-Content (Join-Path $filesPath "flow.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$varProps = if ($null -eq $flowJson.variables) { @() } else { $flowJson.variables.PSObject.Properties }
$emptyVars = $varProps.Count -eq 0
Write-Eval "T-B03" $emptyVars "project variables empty; list built at run"

# --- Entrega C: resilience-demo ---
$resPath = Join-Path $RepoRoot "examples\resilience-demo"
$r = Run-Cli "run" $resPath
Write-Eval "T-C01" (($r.Code -eq 0) -and ($r.Out -match "last_node=end"))
Write-Eval "T-C02" ($r.Out -match "action_retry") "retry logged before continue"
Write-Eval "T-C03" ($r.Out -match "continued after read failure")

# Stop on error (no continue) must fail run
$stopDir = Join-Path $env:TEMP "hoblio-eval-stop-on-error"
if (Test-Path $stopDir) { Remove-Item -Recurse -Force $stopDir }
Copy-Item $resPath $stopDir -Recurse
$stopFlow = Join-Path $stopDir "flow.json"
$stopText = (Get-Content $stopFlow -Raw -Encoding UTF8).Replace('"on_failure": "continue"', '"on_failure": "stop"')
Write-Utf8NoBom $stopFlow $stopText
$rStop = Run-Cli "run" $stopDir
Write-Eval "T-C04" ($rStop.Code -ne 0) "run must fail when on_failure=stop"

# --- Regression: flow-control-demo still runs ---
$fcPath = Join-Path $RepoRoot "examples\flow-control-demo"
$rFc = Run-Cli "run" $fcPath
Write-Eval "T-REG01" (($rFc.Code -eq 0) -and ($rFc.Out -match "item=beta"))

# --- Studio frontend build (types include new actions) ---
$studioDir = Join-Path $RepoRoot "crates\hoblio-studio"
if (Test-Path $studioDir) {
    Push-Location $studioDir
    if (-not (Test-Path "node_modules")) {
        $null = npm install --silent 2>&1
    }
    $code = Invoke-External { npm run build }
    Write-Eval "T-F01" (($code -eq 0) -and (Test-Path "dist\index.html"))
    Pop-Location
} else {
    Write-Eval "T-F01" $false "studio missing"
}

Write-Output "GROK_EVAL: SUMMARY pass=$Pass fail=$Fail"
if ($Fail -gt 0) { exit 1 }
exit 0
