# Hoblio — Troubleshooting (Windows)

## `link.exe` not found / `cargo build` falha

**Causa:** Rust (target MSVC) precisa do linker da Microsoft. Cursor/VS Code **não** instalam isso.

**Solução:**

1. PowerShell (admin recomendado):

```powershell
winget install -e --id Microsoft.VisualStudio.2022.BuildTools
```

2. No instalador: carga **Desenvolvimento para desktop com C++** (Desktop development with C++).

3. **Novo** terminal → na pasta do clone:

```powershell
.\setup-dev.bat
```

Manual: https://visualstudio.microsoft.com/visual-cpp-build-tools/

Verificar: `where link` e `cargo build` na raiz do repo.

O script `scripts\setup-dev.bat` verifica `link.exe` / `cl` no PATH ou instalação via `vswhere` **antes** de `cargo build`.

---

## Browser / `browser_*` falha

- Instale Chrome ou Edge (Chromium).
- Ou: `$env:HOBLIO_CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"`

Detalhes de detecção automática: [guia de construção](guia-construcao.md) (variáveis de ambiente).

---

## Studio não abre (Tauri)

- WebView2 Runtime (geralmente já no Windows 11): https://developer.microsoft.com/microsoft-edge/webview2/

---

## Mais

- [Guia de construção](guia-construcao.md)
- [Guia de utilização](guia-utilizacao.md)
