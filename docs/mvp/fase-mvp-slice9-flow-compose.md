# Slice 9 — Composição de fluxos (`run_flow`)

Entrega: fluxos encadeados (orquestrador + filhos), subfluxos embutidos, escopo isolado, Studio multi-arquivo e editor visual de subfluxos.

**Avaliação Grok:** [eval-grok-flow-compose.md](../avaliacao/protocolos/eval-grok-flow-compose.md) · `scripts/eval-flow-compose.ps1` (**19 PASS**, 0 FAIL).

---

## Runtime / modelo

| Recurso | Descrição |
|---------|-----------|
| **`run_flow`** | Ação que executa outro grafo **in-process** (mesma run, browser compartilhado por padrão). |
| **`manifest.flows`** | Registro `flow_id` → `path`, `inputs` / `outputs` declarados. |
| **`flow.json` → `subflows`** | Subfluxos embutidos; `flow_id` resolve irmãos no mesmo arquivo → manifest → `path`. Caminhos de arquivo ficam **dentro** da pasta do projeto. |
| **`variable_scope`** | `inherit` (padrão) ou **`isolated`** — só nomes em **`outputs`** voltam (lista vazia ou ausente = nenhuma). |
| **`share_browser: false`** | Sessão Chromium separada no filho (encerrada ao retornar). |
| **Validação** | Ciclos entre `run_flow`, profundidade máx. 16. |

Eventos de run: `flow_started`, `flow_finished`, `flow_ref` em `node_enter` / `node_exit`.

---

## Studio

| Recurso | Descrição |
|---------|-----------|
| **Abas de arquivo** | `manifest.flows` + entry (`flow.json`). |
| **Abas ⎇ subfluxo** | Editor visual por `subflows.{id}` no arquivo owner. |
| **New subflow** | Cria bundle Start/End + aba. |
| **Rename / Delete** | Painel (main lista; subfluxo detalhe); rename atualiza `run_flow.flow_id` no main. |
| **Variáveis** | **Project variables** (arquivo) vs **Subflow variables** (bundle). |
| **Run** | Salva owner, recarrega **entry** do disco, executa orquestrador. |

---

## Exemplos

| Pasta | Demonstra |
|-------|-----------|
| `examples/flow-compose-demo` | Manifest + `flows/greet.json` + `flows/finish.json` |
| `examples/flow-compose-isolated` | `variable_scope: isolated` |
| `examples/flow-compose-subflow` | `subflows.greet_inline` |

---

## CLI

```powershell
cargo run -p hoblio-cli -- validate examples/flow-compose-demo
cargo run -p hoblio-cli -- run examples/flow-compose-demo
```

`validate` inclui composição (ciclos, arquivos filhos).

---

## CLI `run`

`hoblio run` valida composição (ciclos, profundidade, paths) antes de executar, como o Studio.

## Ainda não coberto

- Validação estática global de `{refs}` desconhecidas
- Ramo **On error** dedicado no grafo
- Editor de `inputs` como grid (hoje linhas `var=template` ou JSON)
- `share_browser: false` em harness automatizado (só manual / browser)
