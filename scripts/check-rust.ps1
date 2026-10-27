# Validação rápida após mudanças em crates Rust (sem linkar o Tauri).
Set-Location $PSScriptRoot\..
cargo check -p hoblio-model -p hoblio-runtime -p hoblio-studio
