# Benchmark de rebuild Tauri. Grava resultados em reports/build-benchmark.txt
# Requer: repo na raiz E:\Projetos\hoblio, cargo no PATH.
# Uso: .\scripts\benchmark-build.ps1
#
# Nota: cargo escreve progresso em stderr; no PowerShell isso nao e erro fatal.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

$reportDir = Join-Path $PWD "reports"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$report = Join-Path $reportDir "build-benchmark.txt"

function Invoke-HoblioCargoBuild {
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $logLines = [System.Collections.Generic.List[string]]::new()
    try {
        & cargo build -p hoblio-studio 2>&1 | ForEach-Object {
            $line = "$_"
            $logLines.Add($line)
            Write-Host $line
        }
        if ($LASTEXITCODE -ne 0) {
            throw "cargo build -p hoblio-studio falhou (exit code $LASTEXITCODE)"
        }
    } finally {
        $ErrorActionPreference = $previousEap
    }
    return ($logLines -join "`n")
}

function Measure-Build([string]$Label) {
    Write-Host "`n>> $Label" -ForegroundColor Cyan
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $log = Invoke-HoblioCargoBuild
    $sw.Stop()
    $sec = [math]::Round($sw.Elapsed.TotalSeconds, 1)
    $line = "$(Get-Date -Format o)  $Label  ${sec}s"
    Add-Content -Path $report -Value $line
    Write-Host $line -ForegroundColor Green
    if ($log -match "Finished[^\r\n]*") {
        Add-Content -Path $report -Value "  $($Matches[0])"
    }
    return $sec
}

Add-Content -Path $report -Value "`n=== benchmark $(Get-Date -Format o) ==="

Measure-Build "1 build (incremental se target/ ja existir)" | Out-Null
Measure-Build "2 noop (deve ser ~5-30s se incremental ok)" | Out-Null

$runtimeLib = "crates\hoblio-runtime\src\lib.rs"
$stamp = Get-Content $runtimeLib -Raw
Add-Content -Path $runtimeLib -Value "`n// benchmark touch $(Get-Date -Format o)`n"
Measure-Build "3 apos touch hoblio-runtime" | Out-Null
Set-Content -Path $runtimeLib -Value $stamp -NoNewline

Write-Host "`nRelatorio: $report" -ForegroundColor Yellow
