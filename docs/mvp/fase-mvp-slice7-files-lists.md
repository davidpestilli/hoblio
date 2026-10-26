# Fase MVP — slice 7 (entrega B: arquivos + listas em runtime)

**Estado:** `file_read`, `file_append`, `list_append`, `list_clear`; For each aceita listas criadas no run.

## O que foi entregue

| Área | Detalhe |
|------|---------|
| **file_read** | Lê UTF-8 → variável de run (`path`, `variable`) |
| **file_append** | Acrescenta texto (cria arquivo/pastas se faltar) |
| **list_append** | Adiciona item (string/`{var}`) a lista JSON em variável; cria `[]` se ausente |
| **list_clear** | Define lista como `[]` |
| **For each** | `list_variable` não precisa mais existir em Project variables — basta lista válida no run |
| **Exemplo** | `examples/files-lists-demo` |
| **Studio** | Paleta + propriedades |

Caminhos relativos continuam resolvidos pela **pasta do projeto** (como `file_write`).

## Formato JSON

```json
{ "type": "file_read", "path": "output/report.txt", "variable": "report_text" }
{ "type": "file_append", "path": "output/log.txt", "content": "line\n" }
{ "type": "list_clear", "list_variable": "items" }
{ "type": "list_append", "list_variable": "items", "item": "alpha" }
```

Listas em run são **JSON array serializado** (mesmo formato que listas em `flow.json` → `variables`).

## Comandos

```powershell
cargo run -p hoblio-cli -- validate examples/files-lists-demo
cargo run -p hoblio-cli -- run examples/files-lists-demo
cargo test -p hoblio-runtime --lib files_lists_demo_runs
```

## Limitações

- `file_read` só UTF-8; sem ler binário ou linha a linha.
- Sem `list_remove_at`, `list_length` como ações (use For each / contador).
- Validação estática de `{refs}` ainda pendente.

## Próximo

Entrega **C** — [slice 8 (browser + resiliência)](fase-mvp-slice8-browser-resilience.md).
