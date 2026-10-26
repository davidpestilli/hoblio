# Fase 0 — fundação (Rust)

**Estado:** concluída no repositório `Hoblio` (somente Rust, sem Tauri).

## O que existe

| Crate | Função |
|-------|--------|
| `hoblio-model` | Tipos `FlowProject`, `FlowGraph`, `Node`, `Edge`, `ActionKind`, variáveis mínimas, validação do grafo |
| `hoblio-serde` | Carregar/gravar pasta de projeto: `manifest.json` + `flow.json` (+ `assets/` reservado) |
| `hoblio-log` | `tracing` no stderr; opcional JSONL em `.hoblio/run.jsonl` |
| `hoblio-runtime` | Percorre o fluxo a partir de `start`; executa `log` e `noop`; emite eventos de execução |
| `hoblio-cli` | Binário `hoblio`: `run`, `validate` |

Projeto de exemplo: `examples/demo-flow/` (Start → Log → Log → End).

Ações `browser_navigate`, `file_write` e `http_get` existem no modelo como placeholders; a runtime retorna erro se forem usadas antes do MVP.

## Comandos

```powershell
cd C:\Users\david\projetos\Hoblio
cargo build
cargo run -p hoblio-cli -- validate examples/demo-flow
cargo run -p hoblio-cli -- run examples/demo-flow
cargo run -p hoblio-cli -- run examples/demo-flow --jsonl
```

## Próximo passo

**Fase MVP:** shell Tauri 2 + React Flow (studio flowchart), implementação real de browser/arquivos/HTTP simples, destaque visual na execução.
