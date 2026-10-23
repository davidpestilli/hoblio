# Fase MVP — slice 1 (Studio + ações reais)

**Estado:** Tauri 2 + React Flow, runtime com `file_write`, `http_get`, `browser_navigate` (CDP).

## O que foi entregue

| Área | Detalhe |
|------|---------|
| **Studio** | `crates/hoblio-studio/` — app Tauri 2 + Vite/React, editor flowchart (@xyflow/react), paleta, painel de propriedades, Open/Save pasta de projeto, Validate, Run com eventos na UI |
| **Runtime** | Executores reais em `hoblio-runtime` + `run_project_with_listener` para streaming de eventos |
| **Exemplo** | `examples/web-demo-flow` — GET + gravação de arquivo + log (sem browser obrigatório no CLI) |
| **CLI** | Inalterado na interface: `validate`, `run`, `--jsonl` |

## Requisito de browser (CDP)

A ação `browser_navigate` usa **chromiumoxide** (Chrome DevTools Protocol):

- **Windows:** Google Chrome ou Microsoft Edge (Chromium) instalado; o launcher tenta detectar o executável.
- **Override:** variável de ambiente `HOBLIO_CHROME_PATH` apontando para o `.exe` do Chrome/Edge/Chromium.
- Parâmetro opcional `wait_ms` no JSON após navegar (pausa em ms).

Limitações deste slice: abre URL em instância Chromium controlada pelo runtime (não reutiliza abas já abertas manualmente); sem passos DOM/clique.

## Comandos

```powershell
cd C:\Users\david\projetos\Hoblio
$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path

# Rust (workspace inteiro, inclui studio)
cargo build

# CLI (regressão Fase 0)
cargo run -p hoblio-cli -- validate examples/demo-flow
cargo run -p hoblio-cli -- run examples/demo-flow

# Novo exemplo (rede + arquivo)
cargo run -p hoblio-cli -- validate examples/web-demo-flow
cargo run -p hoblio-cli -- run examples/web-demo-flow

# Studio (primeira vez: instalar deps do frontend)
cd crates/hoblio-studio
npm install
npm run tauri dev
# ou, a partir da raiz:
cargo tauri dev --manifest-path crates/hoblio-studio/src-tauri/Cargo.toml
```

## Limitações conhecidas (slice 1)

- Grafo **linear** (uma aresta de saída por nó), como na Fase 0.
- Sem Excel, e-mail, UIA, arestas condicionais ou subflows.
- Studio não edita `variables` na UI (permanecem no JSON ao salvar).
- `browser_navigate` exige Chromium/Chrome disponível na máquina; falha clara se não houver.

## Próximo passo sugerido

Condicionais no grafo, mais passos browser (CDP), polish do studio (delete nó, undo), empacotamento local.
