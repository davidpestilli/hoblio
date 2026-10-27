# Mede rebuild do binário Tauri (hoblio-studio). Rode na raiz do repo.
# Uso: .\scripts\measure-build.ps1 [-Label "descricao"]

param([string]$Label = "build")

Set-Location $PSScriptRoot\..

Write-Host "`n=== $Label ===" -ForegroundColor Cyan
Write-Host (Get-Date -Format "yyyy-MM-dd HH:mm:ss")

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$previousEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    & cargo build -p hoblio-studio 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) {
        throw "cargo build -p hoblio-studio falhou (exit code $LASTEXITCODE)"
    }
} finally {
    $ErrorActionPreference = $previousEap
}
$sw.Stop()

Write-Host "`nElapsed: $([math]::Round($sw.Elapsed.TotalSeconds, 1)) s ($Label)" -ForegroundColor Green
