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
| `HOBLIO_CHROME_PATH` | Override se Chrome/Edge não for detectado automaticamente |

---

## Browser / `browser_*` falha

- Instale **Google Chrome** ou **Microsoft Edge** (Chromium). O Hoblio tenta achar o `.exe` em `Program Files`, `Program Files (x86)` e `%LOCALAPPDATA%` (comportamento parecido com Power Automate Desktop).
- Se a detecção falhar: `$env:HOBLIO_CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"`

Detalhes de detecção automática: [guia de construção](guia-construcao.md) (variáveis de ambiente).

### Janela maximizada mas página numa faixa (resto cinza)

O runtime desliga a emulação de viewport fixa 800×600 do chromiumoxide quando **Abrir o navegador na tela** está ativo. Atualize o binário (`tauri dev` / rebuild) se ainda vir faixa cinza.

---

## Build demora ~5 minutos “sempre”

| Sintoma | Causa comum | O que fazer |
|---------|-------------|-------------|
| ~5 min após `cargo clean` ou clone | Build frio | Normal uma vez; depois use `tauri dev` aberto |
| ~5 min a cada mudança pequena | `target/` diferente (`CARGO_TARGET_DIR`) ou Studio aberto bloqueando link | Use só `target/` do repo; feche o `.exe` antes de build completo |
| Script benchmark para no PowerShell | Cargo escreve progresso em stderr | Use `scripts/benchmark-build.ps1` atualizado (trata stderr) |

Medição: `.\scripts\benchmark-build.ps1` na raiz → `reports/build-benchmark.txt`. Esperado com cache quente: noop ~10–15 s; mudança em `hoblio-runtime` ~25–30 s.

Pasta `target/` grande (dezenas de GB): `cargo clean` libera espaço; próximo build será longo. Perfil dev atual reduz tamanho vs. debug pleno em todas as deps.

---

## `failed to remove hoblio-studio.exe` / Acesso negado (os error 5)

Feche o Studio e qualquer `tauri dev` antes de `cargo build -p hoblio-studio`.

---

## Studio não abre (Tauri)

- WebView2 Runtime (geralmente já no Windows 11): https://developer.microsoft.com/microsoft-edge/webview2/

---

## Mais

- [Guia de construção](guia-construcao.md)
- [Guia de utilização](guia-utilizacao.md)
