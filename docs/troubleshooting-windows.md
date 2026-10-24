# Hoblio — Troubleshooting (Windows)

## `setup-dev.bat` aborta por falta de espaco no C:

O script mede o **C:** **antes** de instalar dependencias ou compilar.

| Situação | Minimo no C: |
|----------|----------------|
| Build Tools C++ **ja** instaladas | ~**4 GB** |
| Ainda falta instalar MSVC / carga C++ | ~**7 GB** |

Se nao houver espaco, o script **encerra** — libere espaco no C: (Lixeira, Downloads, caches) e rode `setup-dev.bat` de novo. `HOBLIO_VS_INSTALL_PATH` e `HOBLIO_CARGO_TARGET_DIR` ajudam, mas **nao** eliminam a necessidade de espaco no C: para SDK e `%TEMP%`.

---

## `link.exe` not found / `cargo build` falha

**Causa:** Rust (target MSVC) precisa do linker da Microsoft. Cursor/VS Code **não** instalam isso.

**Solução:**

1. O `winget` sem `--override` instala só o casco das Build Tools (MSBuild), **sem** `link.exe`. Use:

```powershell
winget install -e --id Microsoft.VisualStudio.2022.BuildTools --disable-interactivity --accept-package-agreements --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Isso marca a carga **Desenvolvimento para desktop com C++** (Desktop development with C++).

2. O instalador precisa de **~3,5–7 GB livres no C:** (Windows SDK e cache), mesmo se o destino for outro disco. Código `1` / `0x80070070` = disco cheio. Libere espaço ou instale em outro drive:

```powershell
winget install -e --id Microsoft.VisualStudio.2022.BuildTools --disable-interactivity --accept-package-agreements --override "--wait --passive --installPath E:\VS\BuildTools --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

3. **Novo** terminal → na pasta do clone:

```powershell
.\setup-dev.bat
```

Manual: https://visualstudio.microsoft.com/visual-cpp-build-tools/

Verificar: `where link` e `cargo build` na raiz do repo.

O script `scripts\setup-dev.bat` verifica `link.exe` / `cl` no PATH ou instalação via `vswhere` **antes** de `cargo build`. VS Code / Cursor **não** substituem as Build Tools.

---

## `no space on device` / os error 112 no `cargo build`

**Causa:** disco **C:** cheio. Cache do Cargo, incremental e artefatos podem ir para `%TEMP%` ou `target\` no C:.

**Solução:**

```powershell
set HOBLIO_CARGO_TARGET_DIR=E:\cargo-target\hoblio
.\setup-dev.bat
```

Com **menos de ~5 GB livres no C:**, o `setup-dev.bat` define automaticamente `CARGO_TARGET_DIR` para `target\` na pasta do repo (útil se o clone estiver em `E:` ou `D:`).

---

## Variáveis opcionais (`setup-dev.bat`)

| Variável | Uso |
|----------|-----|
| `HOBLIO_VS_INSTALL_PATH` | Ex.: `E:\VS\BuildTools` — destino das Build Tools quando o C: está cheio |
| `HOBLIO_CARGO_TARGET_DIR` | Pasta de `target` do Cargo fora do C: |
| `HOBLIO_CHROME_PATH` | Chrome/Edge para demos browser |

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
