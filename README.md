# Hoblio

*English:* Local flowchart automation designer for personal use — PAD-*inspired* UX, **not** Microsoft Power Automate and not compatible with Robin/PAD files.

Hoblio é um **designer de fluxos local** (estilo RPA desktop leve): você monta automações em um canvas flowchart, valida, executa com logs e evolui passo a passo. Inspira-se na *experiência* do Power Automate Desktop, **sem vínculo com a Microsoft**.

**Para quê:** automação no seu PC — **navegador** (Chrome/Edge via CDP), **arquivos**, **HTTP**, **mensagens** e diagnóstico por logs; pensado para **uso local e pessoal**.

**Stack:** Rust (runtime + CLI) · Tauri 2 + React + React Flow (Studio).

**Estado:** MVP em progresso (Studio com editor de fluxo completo, browser CDP, arquivos, HTTP) — slices em `docs/fase-mvp-slice*.md` (último: [slice 4 — flow editor](docs/fase-mvp-slice4-flow-editor.md)).

## Documentação

- [Guia de utilização](docs/guia-utilizacao.md) — Studio, CLI, exemplos e ações
- [Guia de construção](docs/guia-construcao.md) — compilar, testes, `scripts/setup-dev.bat` e estender o sistema
- [Decisões de produto](docs/decisoes-produto.md)

Outros: [estudo de viabilidade](docs/estudo-viabilidade.md) · [fase 0](docs/fase-0.md) · slices MVP em `docs/fase-mvp-slice*.md`

## Início rápido (Windows)

```powershell
git clone https://github.com/davidpestilli/hoblio.git
cd Hoblio
scripts\setup-dev.bat
```

Atalho na raiz: `setup-dev.bat` (delega para `scripts\`).

O script **verifica espaço livre no C:** (~4 ou ~7 GB) **antes** de instalar ou compilar, tenta instalar **Rust** e **Node.js LTS** via `winget`, instala **Build Tools MSVC** com carga C++ (`link.exe` — **não** é o VS Code), instala o frontend do Studio, roda `cargo test` e `validate` nos exemplos, e **informa Chrome/Edge detectado** para demos browser. Opção **`scripts\setup-dev.bat --full`** também executa fluxos de demo (browser se houver Chromium). Runtime: **detecção automática** de Chrome/Edge e variáveis `{nome}` em fluxos. Pré-requisitos: [guia de construção](docs/guia-construcao.md) · troubleshooting: [Windows](docs/troubleshooting-windows.md).

Depois do setup:

```powershell
cd crates\hoblio-studio
npm run tauri dev
```

## Build manual (sem setup-dev)

```powershell
cargo build
cargo run -p hoblio-cli -- validate examples/demo-flow
cargo run -p hoblio-cli -- run examples/demo-flow
```

Logs JSONL opcionais: `cargo run -p hoblio-cli -- run examples/demo-flow --jsonl`

## Layout do workspace

```
Hoblio/
  Cargo.toml
  crates/
    hoblio-model/ hoblio-serde/ hoblio-log/ hoblio-runtime/
    hoblio-cli/          # binário `hoblio`
    hoblio-studio/       # Tauri + React Flow
  examples/              # pastas de projeto (manifest.json + flow.json)
  docs/
  scripts/setup-dev.bat
```

**Autor:** David Souza · fuso `America/Sao_Paulo`

## Licença

Uso **pessoal**; não há arquivo `LICENSE` no repositório neste momento.
