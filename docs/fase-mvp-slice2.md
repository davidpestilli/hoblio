# Fase MVP — slice 2 (logs + show_message)

**Estado:** painel de log legível no Studio, ação `show_message` no Windows, exemplo `message-timer-demo`.

## Novidades

| Área | Detalhe |
|------|---------|
| **Studio — log** | Uma linha por evento de runtime (corrige listener duplicado com StrictMode); formato humano + toggle JSON; botão **Copy logs** (clipboard Tauri) |
| **Runtime** | Ação `show_message` — janela nativa Win32 em thread separada (não bloqueia o fluxo) |
| **Exemplo** | `examples/message-timer-demo` — mensagem PT com `timeout_seconds: 2` |

### Parâmetros `show_message`

- `title` (string) — título da janela
- `text` (string) — corpo
- `timeout_seconds` (opcional) — se > 0, fecha sozinha após N segundos; se omitido, fica aberta até **Fechar** (o fluxo pode terminar antes)

## Comandos

```powershell
cd C:\Users\david\projetos\Hoblio
$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path

cargo build

# Regressão
cargo run -p hoblio-cli -- validate examples/demo-flow
cargo run -p hoblio-cli -- run examples/demo-flow

# Demo da janela (Windows)
cargo run -p hoblio-cli -- validate examples/message-timer-demo
cargo run -p hoblio-cli -- run examples/message-timer-demo

# Studio
cd crates/hoblio-studio
npm install
npm run tauri dev
```

No Studio: abra a pasta `examples/message-timer-demo`, **Run** — veja log sem duplicatas e a janela nativa.

## Limitações

- `show_message` só no **Windows**; em outros SO o runtime retorna erro na ação.
- Janela Win32 simples (texto estático + Fechar); sem ícone customizado.
- CLI e Studio usam o mesmo runtime; a janela aparece nos dois modos no Windows.
