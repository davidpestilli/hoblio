# Fase MVP — slice 5 (controle de fluxo + Studio)

**Estado:** If / ForEach / next_loop / exit_loop no **model**, **runtime**, **CLI** e **Studio**; validação de projeto ampliada; harness `scripts/eval-flow-control.ps1`.

## O que foi entregue

| Área | Detalhe |
|------|---------|
| **Model** | `NodeKind`: `if`, `for_each`, `next_loop`, `exit_loop`; `ControlKind`; arestas com `port` (`then`, `else`, `body`, `after`, `main`); `validate_graph` + **`validate_project`** (listas, loop controls dentro do ForEach) |
| **Runtime** | Interpretador multi-aresta, frames de loop, `expr.rs` (`{var}`), **`MAX_NODE_VISITS` (10k)**, cancelamento cooperativo (`cancel.rs`, Stop no Studio) |
| **CLI** | `run` com diretório do projeto (`run_with_root`); `file_write` relativo à **pasta do projeto** |
| **Studio** | Paleta If / For each / Next loop / Exit loop; handles then→ / else↓ / body→ / after↓; editor JSON de **variáveis**; Validate/Save/Open com erro no status; **Stop**; Ctrl+S / Ctrl+Z; log redimensionável (splitter superior); feedback de conexão inválida (`onConnectEnd`); undo de propriedades por campo (commit no blur) |
| **Exemplo** | `examples/flow-control-demo` |
| **QA** | `docs/eval-grok-flow-control.md`, `scripts/eval-flow-control.ps1` (21× PASS); reteste em `docs/eval-grok-retest-priorities.md` |

## Formato JSON (resumo)

**Nó If:** `kind: "if"`, `control: { type: "if", left, operator, right, ignore_case? }` — arestas de saída com `port: "then"` e `port: "else"`.

**Nó For each:** `control: { type: "for_each", list_variable, item_variable }` — lista em `flow.json` → `variables`; corpo com `port: "body"` (deve voltar ao For each); saída após loop com `port: "after"`.

**Next / Exit loop:** dentro do corpo; manipulam o frame do For each ativo.

**FileWrite:** caminhos relativos à pasta do projeto (ex.: `output/arquivo.txt`), não à raiz do repositório.

## Comandos

```powershell
cargo run -p hoblio-cli -- validate examples/flow-control-demo
cargo run -p hoblio-cli -- run examples/flow-control-demo

powershell -NoProfile -ExecutionPolicy Bypass -File scripts/eval-flow-control.ps1
```

Studio: Open `examples/flow-control-demo`, edite variável `flag` no painel **Project variables** (sem nó selecionado), Run.

## Limitações (slice 5)

- Sem `switch`, `while` numérico ou subfluxos aninhados em JSON.
- Validate ainda aceita alguns ciclos fora de ForEach (run para em 10k visitas).
- `show_message` só Windows; build Linux exige `icon.png` **RGBA** (já no repo).

## Evolução anterior

Editor visual: [slice 4](fase-mvp-slice4-flow-editor.md). Browser/variáveis: [slice 3](fase-mvp-slice3-browser.md).
