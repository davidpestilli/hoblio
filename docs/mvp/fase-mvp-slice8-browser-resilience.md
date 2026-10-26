# Fase MVP — slice 8 (entrega C: browser + resiliência)

**Estado:** espera pós-clique/navegação, `delay`, retry e continue-on-error por nó de ação.

## Browser

| Ação / campo | Comportamento |
|--------------|---------------|
| **browser_click** `wait_for_navigation` | Após o clique, espera evento de navegação (timeout = `timeout_ms`) |
| **browser_click** `wait_selector_after` | Depois do clique (e navegação opcional), espera seletor CSS |
| **browser_wait_navigation** | Espera navegação na aba atual (`timeout_ms?`, default 10s) |

`browser_navigate` já aguardava navegação em gotos subsequentes; o lançamento inicial abre a URL via CDP.

## Resiliência

Campo opcional no nó (`error_handling`):

```json
"error_handling": {
  "retry_count": 2,
  "retry_delay_ms": 500,
  "on_failure": "continue"
}
```

| Campo | Significado |
|-------|-------------|
| `retry_count` | Tentativas **extras** após a primeira falha |
| `retry_delay_ms` | Pausa entre tentativas (default 500) |
| `on_failure` | `stop` (default) encerra o fluxo; `continue` segue pela aresta main |

Ação **delay** — `{ "type": "delay", "milliseconds": 1000 }`.

## Exemplo

`examples/resilience-demo` — delay → `file_read` inexistente com retry + continue → log.

```powershell
cargo run -p hoblio-cli -- run examples/resilience-demo
cargo test -p hoblio-runtime --lib resilience_demo_runs
```

## Limitações

- Sem ramo **On error** separado no grafo (só continue ou stop).
- `wait_for_navigation` após clique que **não** navega espera até o timeout.
- Anexar ao browser do usuário continua fora de escopo.

## Studio

Paleta: **Delay**, **Wait navigation**; em **BrowserClick** — checkboxes/campos de wait; painel **Error handling** em nós de ação. Resumos de ação no stdout do CLI e em `--jsonl` (`action_executed`).
