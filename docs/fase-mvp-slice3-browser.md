# Fase MVP — slice 3 (browser DOM)

**Estado:** sessão CDP reutilizada por execução + ações DOM além de `browser_navigate`.

## Novas ações

| Ação | Parâmetros | Comportamento |
|------|------------|---------------|
| `browser_navigate` | `url`, `wait_ms?` | Abre Chromium controlado (se ainda não aberto), navega, mantém a aba para passos seguintes |
| `browser_click` | `selector`, `timeout_ms?` | Clique em elemento CSS (padrão timeout 10s) |
| `browser_fill` | `selector`, `text`, `timeout_ms?` | Foca, limpa valor, digita texto |
| `browser_wait_for` | `selector`, `timeout_ms?` | Espera elemento existir no DOM |
| `browser_get_text` | `selector`, `timeout_ms?`, `variable?` | Lê `innerText`; texto aparece no **summary** do log da ação (`variable` reservado para UI futura) |

Todas as ações DOM exigem um `browser_navigate` anterior **na mesma execução** do fluxo.

## Requisito de browser (CDP)

Igual ao slice 1: **chromiumoxide**, Chrome/Edge/Chromium instalado ou `HOBLIO_CHROME_PATH`.

### Limitação (este slice)

- O runtime **lança e controla** uma instância Chromium; **não** anexa a abas que você abriu manualmente no dia a dia.
- Anexar ao browser do usuário fica para sprint futura, salvo se for trivial depois.

## Demo

```powershell
cd C:\Users\david\projetos\Hoblio
$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path

cargo build
cargo run -p hoblio-cli -- validate examples/browser-demo-flow
cargo run -p hoblio-cli -- run examples/browser-demo-flow
```

Fluxo: `example.com` → `browser_wait_for` (`h1`) → `browser_get_text` → `file_write` + logs. Veja no stdout/log do Studio o summary de `browser_get_text` com o heading.

## Testes

```powershell
cargo test
```

- **Sempre:** serde/roundtrip das ações browser em `hoblio-model`; stub em `hoblio-runtime` (DOM sem sessão falha).
- **Opcional (rede + Chrome):** teste ignorado por padrão:

```powershell
cargo test -- --ignored browser_example_com
```

Requer Chrome/Chromium e rede até `https://example.com`.

## Regressão

```powershell
cargo run -p hoblio-cli -- validate examples/demo-flow
cargo run -p hoblio-cli -- run examples/demo-flow
cargo run -p hoblio-cli -- validate examples/message-timer-demo
```
