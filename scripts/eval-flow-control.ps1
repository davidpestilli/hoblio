# Hoblio — evaluation harness for flow-control slice (Grok bot / CI)
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/eval-flow-control.ps1
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
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$Command
    )
    $global:LASTEXITCODE = $null
    $null = & $Command 2>&1
    $code = $global:LASTEXITCODE
    if ($null -eq $code) {
        return -1
    }
    return [int]$code
}

function Test-CommandExists {
    param([string]$Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

# --- Prerequisites ---
Write-Eval "P1" (Test-CommandExists "rustc")
Write-Eval "P2" (Test-CommandExists "cargo")
Write-Eval "P3" (Test-CommandExists "node")
Write-Eval "P4" (Test-Path (Join-Path $RepoRoot "examples\flow-control-demo\flow.json"))

if ($Fail -gt 0) {
    Write-Output "GROK_EVAL: SUMMARY pass=$Pass fail=$Fail blocked=prerequisites"
    exit 2
}

$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path

# --- T-R01 model tests ---
$code = Invoke-External { cargo test -p hoblio-model }
Write-Eval "T-R01" ($code -eq 0) $(if ($code -ne 0) { "exit $code" })

# --- T-R02 runtime lib tests (skip browser integration tests) ---
$code = Invoke-External { cargo test -p hoblio-runtime --lib }
Write-Eval "T-R02" ($code -eq 0) $(if ($code -ne 0) { "exit $code" })

# --- T-R03 variables tests ---
$code = Invoke-External { cargo test -p hoblio-runtime variables:: }
Write-Eval "T-R03" ($code -eq 0) $(if ($code -ne 0) { "exit $code" })

# --- T-V*: validate example projects with manifest ---
$exampleRoot = Join-Path $RepoRoot "examples"
$exampleDirs = Get-ChildItem $exampleRoot -Directory
foreach ($dir in $exampleDirs) {
    $manifest = Join-Path $dir.FullName "manifest.json"
    if (-not (Test-Path $manifest)) {
        Write-Output "GROK_EVAL: WARN T-V-$($dir.Name) SKIP no manifest.json"
        continue
    }
    $id = "T-V-" + $dir.Name
    $path = $dir.FullName
    $global:LASTEXITCODE = $null
    $null = cargo run -q -p hoblio-cli -- validate $path 2>&1
    $code = $global:LASTEXITCODE
    if ($null -eq $code) { $code = -1 }
    Write-Eval $id ($code -eq 0) $(if ($code -ne 0) { "validate exit $code" })
}

# --- T-E01..E05 CLI run flow-control-demo ---
$demoPath = Join-Path $RepoRoot "examples\flow-control-demo"
$global:LASTEXITCODE = $null
$runOut = & cargo run -q -p hoblio-cli -- run $demoPath 2>&1 | Out-String
$runCode = $global:LASTEXITCODE
if ($null -eq $runCode) { $runCode = -1 }
Write-Eval "T-E01" (($runCode -eq 0) -and ($runOut -match "last_node=end")) $(if ($runCode -ne 0) { "run exit $runCode" })
Write-Eval "T-E02" ($runOut -match "branch then")
Write-Eval "T-E03" (
    ($runOut -match "item=alpha") -and
    ($runOut -match "item=beta") -and
    ($runOut -match "item=gamma")
)
Write-Eval "T-E04" ($runOut -match "loop finished")
Write-Eval "T-E05" (-not ($runOut -match "branch else"))

# --- T-E07 flag=no (branch else) ---
$flagNoDir = Join-Path $env:TEMP "hoblio-eval-flag-no"
if (Test-Path $flagNoDir) { Remove-Item -Recurse -Force $flagNoDir }
Copy-Item $demoPath $flagNoDir -Recurse
$flowPath = Join-Path $flagNoDir "flow.json"
$flagText = (Get-Content $flowPath -Raw -Encoding UTF8).Replace('"flag": "yes"', '"flag": "no"')
Write-Utf8NoBom $flowPath $flagText
$global:LASTEXITCODE = $null
$runNo = & cargo run -q -p hoblio-cli -- run $flagNoDir 2>&1 | Out-String
$runNoCode = $global:LASTEXITCODE
Write-Eval "T-E07" (
    ($runNoCode -eq 0) -and
    ($runNo -match "branch else") -and
    (-not ($runNo -match "branch then"))
)

# --- T-N01 negative: If missing else (unit test must run 1 test) ---
$global:LASTEXITCODE = $null
$n01Out = & cargo test -p hoblio-model validate::tests::if_requires_then_and_else -- --exact 2>&1 | Out-String
$n01Code = $global:LASTEXITCODE
$n01Ran = $n01Out -match "1 passed"
Write-Eval "T-N01" (($n01Code -eq 0) -and $n01Ran) $(if (-not $n01Ran) { "0 tests executed" })

# --- T-N02 duplicate main via CLI validate on temp graph ---
$n02Dir = Join-Path $env:TEMP "hoblio-eval-dup-main"
if (Test-Path $n02Dir) { Remove-Item -Recurse -Force $n02Dir }
Copy-Item (Join-Path $RepoRoot "examples\demo-flow") $n02Dir -Recurse
$n02FlowPath = Join-Path $n02Dir "flow.json"
$n02Flow = Get-Content $n02FlowPath -Raw -Encoding UTF8 | ConvertFrom-Json
$n02Flow.edges += [PSCustomObject]@{ from = "log_hello"; to = "end"; port = "main" }
$n02Json = ($n02Flow | ConvertTo-Json -Depth 32 -Compress:$false)
Write-Utf8NoBom $n02FlowPath $n02Json
$global:LASTEXITCODE = $null
$n02Out = & cargo run -q -p hoblio-cli -- validate $n02Dir 2>&1 | Out-String
$n02Code = $global:LASTEXITCODE
$n02Dup = $n02Out -match "duplicate outgoing port"
Write-Eval "T-N02" (($n02Code -ne 0) -and $n02Dup) $(if (-not $n02Dup) { "expected duplicate outgoing port error" })

# --- T-F01 Studio production build ---
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
