# Hoblio

Hoblio é um projeto de RPA desktop leve, inspirado na experiência do **Power Automate Desktop (PAD)**, com foco em uso **local e pessoal**: desenhar fluxos em um canvas flowchart, executar com logs e evoluir para automação de navegador, arquivos e HTTP.

**MVP em progresso:** Studio Tauri + runtime com browser CDP (navigate, click, fill, wait, get_text), arquivos, HTTP e logs — ver `docs/fase-mvp-slice3-browser.md`.

Documentação de produto: [`docs/decisoes-produto.md`](docs/decisoes-produto.md) (cópia local) · estudo: [`docs/estudo-viabilidade.md`](docs/estudo-viabilidade.md) · [`docs/fase-0.md`](docs/fase-0.md).

## Pré-requisitos

- [Rust](https://rustup.rs/) (edition 2021): `rustup` + toolchain stable.

## Build e demo

```powershell
cd C:\Users\david\projetos\Hoblio
cargo build
cargo run -p hoblio-cli -- validate examples/demo-flow
cargo run -p hoblio-cli -- run examples/demo-flow
```

Saída esperada do `run`: duas linhas de log no stdout e mensagem de conclusão no stderr.

Logs estruturados opcionais: `cargo run -p hoblio-cli -- run examples/demo-flow --jsonl` → `examples/demo-flow/.hoblio/run.jsonl`.

## Layout do workspace

```
hoblio/
  Cargo.toml
  crates/
    hoblio-model/
    hoblio-serde/
    hoblio-log/
    hoblio-runtime/
    hoblio-cli/      # binário `hoblio`
  examples/
    demo-flow/       # manifest.json + flow.json
  docs/
```

Formato de projeto em disco: pasta com `manifest.json` (metadados) e `flow.json` (grafo: `start`, `nodes`, `edges`, `variables` opcional).

**Autor:** David Souza · fuso `America/Sao_Paulo`
