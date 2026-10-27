# Hoblio

*English:* Local flowchart automation designer for personal use — PAD-*inspired* UX, **not** Microsoft Power Automate and not compatible with Robin/PAD files.

Hoblio é um **designer de fluxos local** (estilo RPA desktop leve): você monta automações em um canvas flowchart, valida, executa com logs e evolui passo a passo. Inspira-se na *experiência* do Power Automate Desktop, **sem vínculo com a Microsoft**.

**Para quê:** automação no seu PC — **navegador** (Chrome/Edge via CDP), **arquivos**, **HTTP**, **mensagens** e diagnóstico por logs; pensado para **uso local e pessoal**.

**Stack:** Rust (runtime + CLI) · Tauri 2 + React + React Flow (Studio).

**Estado:** MVP em progresso — slices 1–8 (editor, If/ForEach/While/Repeat, browser, arquivos/listas, resiliência). Últimas entregas: [slice 8](docs/mvp/fase-mvp-slice8-browser-resilience.md) · [slice 5 — flow control](docs/mvp/fase-mvp-slice5-flow-control.md).

## Documentação

Índice completo: **[docs/README.md](docs/README.md)**

- [Guia de utilização](docs/guia-utilizacao.md) — Studio, CLI, exemplos e ações
- [Guia de construção](docs/guia-construcao.md) — compilar, testes, QA Grok, estender o sistema
- [Decisões de produto](docs/produto/decisoes-produto.md)
- [Avaliação / relatórios Grok](docs/avaliacao/README.md)

Regressão: `scripts/eval-flow-control.ps1` (24 PASS) · `scripts/eval-rpa-abc.ps1` (27 PASS)

## Início rápido (Windows)

```powershell
git clone https://github.com/davidpestilli/hoblio.git
cd Hoblio
scripts\setup-dev.bat
```

Atalho na raiz: `setup-dev.bat` (delega para `scripts\`).

O script **verifica espaço livre no C:** (~4 ou ~7 GB) **antes** de instalar ou compilar, tenta instalar **Rust** e **Node.js LTS** via `winget`, instala **Build Tools MSVC** com carga C++ (`link.exe` — **não** é o VS Code), instala o frontend do Studio, roda `cargo test` e `validate` nos exemplos, e **informa Chrome/Edge detectado** para demos browser. Opção **`scripts\setup-dev.bat --full`** também executa fluxos de demo (browser se houver Chromium). Runtime: **detecção automática** de Chrome/Edge e variáveis `{nome}` em fluxos. Pré-requisitos: [guia de construção](docs/guia-construcao.md) · troubleshooting: [Windows](docs/troubleshooting-windows.md).

Depois do setup, suba o Studio (deixe o terminal aberto enquanto desenvolve):

```powershell
cd E:\Projetos\hoblio
.\scripts\dev-studio.ps1
```

Equivalente manual: `cd crates\hoblio-studio` → `npm run tauri dev` (ou `npm run dev:app`).

### Tempo de build (Rust / Tauri)

| Situação | Tempo típico (referência) |
|----------|---------------------------|
| Build **frio** (`cargo clean`, primeiro build) | ~**5 min** |
| Rebuild **sem mudança** (incremental) | ~**10–15 s** |
| Mudança pequena em `hoblio-runtime` | ~**25–30 s** |

Evite `cargo clean` no dia a dia; o cache fica em `target/` na raiz do repo. Valide Rust sem linkar o Tauri: `.\scripts\check-rust.ps1`. Benchmark local: `.\scripts\benchmark-build.ps1` → `reports/build-benchmark.txt`.

Detalhes: [guia de construção §3–4](docs/guia-construcao.md) · [troubleshooting Windows](docs/troubleshooting-windows.md).

## Build manual (sem setup-dev)

```powershell
cargo build
cargo run -p hoblio-cli -- validate examples/demo-flow
cargo run -p hoblio-cli -- run examples/flow-control-demo
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/eval-flow-control.ps1
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
  docs/                  # guias, mvp/, avaliacao/relatorios/
  scripts/setup-dev.bat
  scripts/dev-studio.ps1      # tauri dev
  scripts/check-rust.ps1      # cargo check (rápido)
  scripts/benchmark-build.ps1 # medir rebuild incremental
  .cargo/config.toml          # target/ + rust-lld (dev)
```

**Autor:** David Souza · fuso `America/Sao_Paulo`

## Licença

Uso **pessoal**; não há arquivo `LICENSE` no repositório neste momento.
