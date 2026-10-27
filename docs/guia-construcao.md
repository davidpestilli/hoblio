# Hoblio — Guia de construção e desenvolvimento

Documento consolidado para **montar, compilar e estender** o sistema. Estado reflete o repo após **slices 5–8**: controle de fluxo (If/ForEach/While/Repeat), variáveis PAD-style, **entregas A/B/C** (loops numéricos, arquivos/listas em runtime, browser wait + retry/continue).

Índice geral: [docs/README.md](README.md). Histórico por entrega: [Fase 0](historico/fase-0.md), [1](mvp/fase-mvp-slice1.md) · [2](mvp/fase-mvp-slice2.md) · [3 browser](mvp/fase-mvp-slice3-browser.md) · [4 editor](mvp/fase-mvp-slice4-flow-editor.md) · [5 flow control](mvp/fase-mvp-slice5-flow-control.md) · **[6 loops](mvp/fase-mvp-slice6-variables-loops.md)** · **[7 arquivos/listas](mvp/fase-mvp-slice7-files-lists.md)** · **[8 resiliência](mvp/fase-mvp-slice8-browser-resilience.md)**.

---

## 1. Visão da arquitetura

```
Hoblio/
├── crates/
│   ├── hoblio-model/      # Grafo, nós, ActionKind, ControlKind, validate_graph / validate_project
│   ├── hoblio-serde/      # load/save pasta de projeto
│   ├── hoblio-runtime/    # Executor + ações (HTTP, arquivo, browser CDP, Win32…)
│   ├── hoblio-log/        # tracing + JSONL opcional
│   ├── hoblio-cli/        # hoblio validate | run
│   └── hoblio-studio/     # Tauri 2 + React + React Flow (UI)
├── examples/              # Projetos de fluxo de demonstração
├── scripts/               # setup-dev.bat, dev-studio.ps1, check-rust.ps1, benchmark-build.ps1, eval-*.ps1
├── .cargo/config.toml     # target-dir, linker dev (rust-lld)
└── docs/                  # Ver árvore abaixo
```

**Árvore `docs/` (organização atual):**

```
docs/
├── README.md                 # Índice
├── guia-construcao.md        # Este documento
├── guia-utilizacao.md
├── troubleshooting-windows.md
├── produto/decisoes-produto.md
├── historico/                # fase-0, estudo-viabilidade
├── mvp/                      # fase-mvp-slice1 … slice8
└── avaliacao/
    ├── README.md
    ├── protocolos/           # eval-grok-*.md (Grok / CI)
    └── relatorios/           # YYYY-MM-DD/… (evidências Grok)
```

- **Runtime 100% Rust** — compartilhado pelo CLI e pelo Studio (Tauri chama o mesmo código).
- **Studio** — shell WebView2; editor flowchart; não é VS Code/Cursor.
- **Persistência** — pasta de projeto com `manifest.json` + `flow.json` (JSON; If, loops ForEach/While/Repeat, `error_handling` opcional em nós de ação).

Decisões de produto: [produto/decisoes-produto.md](produto/decisoes-produto.md).

---

## 2. Pré-requisitos (Windows)

| Ferramenta | Uso |
|------------|-----|
| **Rust (rustup stable)** | Workspace Cargo |
| **Visual Studio Build Tools** | Linker MSVC (`Desktop development with C++`) |
| **Node.js LTS** | Frontend do `hoblio-studio` |
| **Chrome ou Edge (Chromium)** | Ações `browser_*` (CDP) |
| **WebView2** | Runtime Tauri (geralmente já no Win10/11) |
| **Espaço livre no C:** | ~**4 GB** (MSVC já ok) ou ~**7 GB** (primeira instalação C++) — ver abaixo |

Problemas comuns (MSVC, browser, WebView2, disco C:): [troubleshooting-windows.md](troubleshooting-windows.md).

**Importante:** **VS Code / Cursor não instalam o linker MSVC.** Rust no Windows usa `link.exe` das **Visual Studio Build Tools 2022** com a carga **Desenvolvimento para desktop com C++**. O `winget` sem a carga C++ instala só o “casco” (MSBuild), sem compilar Rust.

### Espaço em disco (C:)

O `setup-dev.bat` **mede o C: antes de começar** e **aborta** se faltar espaço (libere, depois rode de novo).

| Situação | Mínimo no C: |
|----------|----------------|
| Build Tools com carga C++ **já** instaladas | ~**4 GB** |
| Ainda falta instalar / adicionar MSVC C++ | ~**7 GB** |

Parte do SDK e cache do instalador **sempre** usa o C:, mesmo com Build Tools em outro disco (`HOBLIO_VS_INSTALL_PATH`, ex. `E:\VS\BuildTools`). Com C: apertado, use também `HOBLIO_CARGO_TARGET_DIR` para o `target` do Cargo — detalhes no [troubleshooting Windows](troubleshooting-windows.md).

Instalação rápida:

```powershell
winget install Rustlang.Rustup
winget install OpenJS.NodeJS.LTS
winget install -e --id Microsoft.VisualStudio.2022.BuildTools --disable-interactivity --accept-package-agreements --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
rustup default stable
```

### Clone em máquina nova

Após clonar o repositório (GitHub ou cópia local), na **raiz do repo**:

```powershell
git clone <url-do-repo> Hoblio
cd Hoblio
scripts\setup-dev.bat
```

Atalho equivalente: `setup-dev.bat` na raiz (delega para `scripts\`).

O script **verifica espaço livre no C:** (~4 ou ~7 GB, conforme MSVC) **antes** de prosseguir, tenta instalar **Rust** e **Node.js LTS** via `winget`, **verifica Build Tools MSVC** (`link.exe` / `cl`, `vcvars64`, `vswhere`) antes de compilar, roda `npm install` + `npm run build` no Studio (`tsc --noEmit` + Vite), `cargo test` e `validate` nos exemplos em `examples/` (incl. `flow-control-demo`). Se faltar MSVC, exibe instruções (e opcionalmente `winget` com carga **VCTools**) e **não** declara sucesso — ver [troubleshooting-windows.md](troubleshooting-windows.md). Com **C:** apertado: `HOBLIO_VS_INSTALL_PATH`, `HOBLIO_CARGO_TARGET_DIR` (documentadas no troubleshooting).

- **`scripts\setup-dev.bat --full`** — além do acima, executa `run` em `demo-flow`, `web-demo-flow` e `browser-demo-flow` (browser se Chrome/Edge for detectado nos caminhos padrão).
- Após **`git pull`**, rode `setup-dev.bat` de novo (ou `cargo build` + `npm run build` no Studio) para alinhar binários com o código.
- **Códigos de saída:** `0` sucesso; `1` falha em pré-requisito, build ou teste; `2` argumento inválido.

Depois do setup:

```powershell
cd crates\hoblio-studio
npm run tauri dev
```

---

## 3. Compilar o workspace

```powershell
cd C:\Users\david\projetos\Hoblio
$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path

cargo build              # tudo, incluindo studio (Rust side)
cargo build -p hoblio-cli
```

Primeira compilação (ou após `cargo clean`) pode levar **~5 min** no app Tauri. Com cache quente, rebuild incremental costuma ficar em **dezenas de segundos** — veja §3.1.

### 3.1 Perfil dev e medição de rebuild

O workspace usa `[profile.dev]` otimizado para iterar: dependências externas **sem** símbolos de debug (link mais rápido, `target/` menor); crates `hoblio-*` com `debug = 1`. Linker dev: `rust-lld` em `.cargo/config.toml`.

| Comando | Uso |
|---------|-----|
| `.\scripts\dev-studio.ps1` | `tauri dev` a partir da raiz (recomendado) |
| `.\scripts\check-rust.ps1` | `cargo check` em model + runtime + studio (segundos) |
| `.\scripts\benchmark-build.ps1` | Três builds cronometrados → `reports/build-benchmark.txt` |
| `.\scripts\measure-build.ps1` | Um build cronometrado |

**Referência (máquina de dev, pós-`cargo clean` + perfil atual):** build frio ~310 s; noop ~12 s; touch em `hoblio-runtime` ~26 s.

**Boas práticas**

- Não defina `CARGO_TARGET_DIR` no ambiente salvo troubleshooting — cache separado = rebuild “do zero”.
- Feche o `.exe` do Studio antes de `cargo build` completo (evita *Acesso negado* ao sobrescrever `hoblio-studio.exe`).
- Evite `cargo clean` salvo liberar disco ou depurar cache corrompido.
- Só mudou UI (`.tsx`)? O Vite recarrega; Rust só quando mudar backend.

Opcional: `cargo install sccache` e descomente `rustc-wrapper` em `.cargo/config.toml`.

---

## 4. Compilar e rodar o Studio (dev)

```powershell
cd crates\hoblio-studio
npm install              # primeira vez ou após mudar package.json
npm run tauri dev        # ou npm run dev:app
```

Na raiz do repo:

```powershell
.\scripts\dev-studio.ps1
```

Alternativa:

```powershell
cargo tauri dev --manifest-path crates/hoblio-studio/src-tauri/Cargo.toml
```

Build de produção (binário instalável local):

```powershell
cd crates/hoblio-studio
npm run tauri build
```

Artefatos em `crates/hoblio-studio/src-tauri/target/release/` (caminho pode variar conforme Tauri).

### Editor de fluxo (Studio)

Implementação em `crates/hoblio-studio/src/flow/` (React Flow 12), inspirada no editor do projeto **central_nape** (modo Edição, conexões, waypoints, alinhamento):

| Módulo | Função |
|--------|--------|
| `useFlowEditor.ts` | Canvas, undo/redo, multi-port connect, grade de spawn (controles/ações), `onConnectEnd` (feedback), Stop/cancel no run |
| `FlowCanvas.tsx` | React Flow, guias de alinhamento, tecla Delete |
| `FlowToolbar.tsx` | Exibição/Edição, desfazer/refazer, **Limpar fluxo**, apagar seleção, rótulo da aresta selecionada |
| `App.tsx` | **`clearFlow`**: diálogo de confirmação → `projectWithClearedFlow` (grafo mínimo Start–End de `defaultProject()`, `variables: {}`), mantém `manifest`, **zera `projectDir`**; `editor.loadProject`; indisponível durante **Run** |
| `WaypointEdge.tsx` | Tracado com pontos de passagem |
| `flowConvert.ts` | Conversão `flow.json` ↔ nós/arestas do React Flow; arestas de loop não ganham `ui.sourceHandle` redundante quando já existe `port` (digest / dirty state) |

**Inserção na paleta:** `spawnPosition` — grade 4×200 px; contadores **separados** para controles (`y≈240`) e ações (`y≈400`); nó **End** padrão em `(720, 120)` para não colidir com Repeat/While num canvas limpo.

**Grupos da paleta** (`App.tsx`, classe `palette-group` em `styles.css`; separadores `palette-divider` antes de Variables e do **End node**):

| Grupo | Itens |
|-------|--------|
| **Utilitários** | Log, NoOp, Delay, HttpGet, ShowMessage |
| **Arquivos** | FileWrite, FileAppend, FileRead |
| **Browser** | BrowserNavigate, BrowserClick, Wait navigation, BrowserFill, BrowserWaitFor, BrowserGetText |
| **Variables** | Set variable, Increase/Decrease variable, List clear, List append |
| **Condicionais** | If (nó de controle) |
| **Loops** | For each, While, Repeat N times, Next loop, Exit loop |
| *(após divisor)* | **End node** |

Todas as variantes executáveis de `ActionKind` expostas no Studio estão em Utilitários, Arquivos ou Browser; listas e variáveis numéricas ficam em **Variables**.

Detalhes: [slice 4](mvp/fase-mvp-slice4-flow-editor.md) · [slice 5 — If/ForEach](mvp/fase-mvp-slice5-flow-control.md).

### Variáveis no Studio (PAD-style)

Dois papéis, como no Power Automate for desktop:

| Papel | Onde | Disco / run |
|--------|------|-------------|
| **Valores iniciais (seed)** | Painel **Project variables** (canvas sem seleção) | `flow.json` → `variables` |
| **Variáveis produzidas no fluxo** | Campo **Output variable** nos nós; índice **Flow variables** | Campos no nó (`browser_get_text.variable`, `set_variable.variable`, `for_each.item_variable`); valor preenchido na **execução** |

Sem nó selecionado, o painel direito mostra **Flow variables** (índice somente leitura, link para o nó produtor) e **Project variables** abaixo.

| Módulo | Função |
|--------|--------|
| `flowVariables.ts` | `collectFlowVariableProducers`, nomes ocupados, renomear no grafo (`{nome}`), picker unificado |
| `actionOutputDefaults.ts` | Nomes padrão ao inserir ação (`BrowserText1`, `Var1`, …) |
| `FlowVariablesOverview.tsx` | Seção **Flow variables** no painel do canvas |
| `ProjectVariablesPanel.tsx` | **Variables** / **Lists** / **Advanced JSON**; chaves React estáveis por índice (evita perder foco ao digitar) |
| `projectVariables.ts` | `partitionVariables` / `buildVariables` (ordem de inserção no objeto, sem re-sort ao editar) |
| `PropertiesPanel.tsx` | **Output variable** em BrowserGetText e SetVariable; renomear propaga refs; If/Log/FileWrite usam seeds + produtores |
| `useFlowEditor.ts` | `addAction(..., seedVariables)` para defaults únicos; `applyVariableRename` |
| `App.tsx` | Paleta agrupada (Utilitários / Arquivos / Browser / Variables / Condicionais / Loops); estado `variables`; Save / Validate / Run |

**Advanced JSON** ( `<details>` ): colar/importar ou editar valores aninhados que a UI visual não expõe.

**Modelo / runtime (`hoblio-model`, `hoblio-runtime`):**

- Ação **`set_variable`**: `{ "type": "set_variable", "variable": "nome", "value": "texto ou {outra}" }`.
- **`ActionKind::produced_variables()`** — metadado “Variables produced” (`browser_get_text`, `set_variable`).
- **`validate_project`**: nome inválido, `set_variable` sem nome, **produtor duplicado** (inclui `item_variable` do For each).

**Runtime:** `seed_from_project` + `browser_get_text` + `set_variable` + item ForEach → mapa de run; interpolação `{nome}` em `log`, `file_write`, `set_variable.value`, operandos If.

**Ainda fora do escopo:** validação estática de `{refs}` desconhecidas; subfluxos com escopo local; ramo **On error** dedicado no grafo.

Build frontend:

```powershell
cd crates/hoblio-studio
npm run build   # tsc --noEmit && vite build
```

Ícone Tauri (`src-tauri/icons/icon.png`) deve ser **RGBA** (build Linux/macOS).

---

## 4.1 Controle de fluxo (slice 5)

| Peça | Função |
|------|--------|
| **`validate_project`** | Grafo + listas ForEach + produtores de variável (duplicados / nomes inválidos) + next/exit no corpo |
| **`examples/flow-control-demo`** | If + ForEach + variáveis `flag` / `items` |
| **`scripts/eval-flow-control.ps1`** | Harness Grok/CI — esperado **24 PASS, 0 FAIL** (inclui validate de cada `examples/*` com manifest) |
| **Docs de avaliação** | [eval-grok-flow-control.md](avaliacao/protocolos/eval-grok-flow-control.md), [eval-grok-retest-priorities.md](avaliacao/protocolos/eval-grok-retest-priorities.md) |

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/eval-flow-control.ps1
```

Runtime: `cargo test -p hoblio-runtime --lib` (evita testes de browser opcionais no harness).

---

## 4.2 Entrega A — variáveis + loops (slice 6)

| Peça | Função |
|------|--------|
| **Ações** | `increase_variable`, `decrease_variable`, `delay` |
| **Nós** | `while_loop` (`control.type: while`), `repeat` (`times`, `index_variable`) |
| **If/While** | Operadores numéricos `gt`, `gte`, `lt`, `lte` |
| **Runtime** | `crates/hoblio-runtime/src/adjust_var.rs`, frames While/Repeat em `exec.rs` |
| **Exemplo** | `examples/variables-loops-demo` |

```powershell
cargo run -p hoblio-cli -- run examples/variables-loops-demo
```

---

## 4.3 Entrega B — arquivos + listas (slice 7)

| Peça | Função |
|------|--------|
| **Ações** | `file_read`, `file_append`, `list_append`, `list_clear` |
| **Módulos** | `hoblio-runtime/src/files.rs`, `lists.rs` |
| **For each** | `list_variable` válida no **run** (não exige seed em `variables`) |
| **Exemplo** | `examples/files-lists-demo` |

Listas em run são **JSON array** em string (mesmo formato que listas em Project variables).

---

## 4.4 Entrega C — browser + resiliência (slice 8)

| Peça | Função |
|------|--------|
| **browser_click** | `wait_for_navigation`, `wait_selector_after`, `wait_after_timeout_ms` |
| **browser_wait_navigation** | Espera evento de navegação na aba |
| **Nó** | `error_handling`: `retry_count`, `retry_delay_ms`, `on_failure` (`stop` \| `continue`) |
| **Model** | `crates/hoblio-model/src/error_handling.rs` |
| **Runtime** | `execute_action_with_policy` em `exec.rs` |
| **Exemplo** | `examples/resilience-demo` |

---

## 4.5 Avaliação Grok (A/B/C + regressão)

| Script | Escopo |
|--------|--------|
| `scripts/eval-flow-control.ps1` | Slice 5 — If/ForEach (**24 PASS** esperado) |
| `scripts/eval-rpa-abc.ps1` | Slices 6–8 + regressão `flow-control-demo` + build Studio |

Documentação detalhada para o Grok bot: [eval-grok-rpa-abc.md](avaliacao/protocolos/eval-grok-rpa-abc.md) (matriz CLI + cenários manuais Studio). Relatórios: [avaliacao/relatorios/](avaliacao/relatorios/).

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/eval-flow-control.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/eval-rpa-abc.ps1
```

---

## 4.7 Correções QA (Grok, out/2026)

Rodadas documentadas em [avaliacao/relatorios/2026-10-26/](avaliacao/relatorios/2026-10-26/).

| ID | Área | Correção |
|----|------|----------|
| **B1** | Runtime | `increase_variable` / `decrease_variable`: variável ausente = 0; valor existente não numérico → erro (`adjust_var.rs`) |
| **B2** | CLI / runtime | Resumos `ActionExecuted` no stdout; evento `action_executed` no `--jsonl` |
| **B3** | Docs | Harness flow-control documentado como **24 PASS** |
| **B4** | Studio | Paleta “Wait navigation”; grade de spawn; End em `(720,120)`; contadores separados controles/ações |
| **B6** | Studio | Paleta com grupos **Utilitários**, **Arquivos**, **Browser** (antes só Variables / Condicionais / Loops); ver tabela em § Editor de fluxo |
| **B5** | Log / browser | Filtro `chromiumoxide=error`; pausa no shutdown do browser |
| **N1** | Studio | **Limpar fluxo** zera `projectDir` — Save pede pasta de novo |
| **N2** | Studio | `flowToGraph`: não persistir `ui.sourceHandle` quando `port` já descreve a aresta (evita “Unsaved changes” falso) |
| **N3** | CLI | Ação **Log** não chama `println!` — uma linha `log: …` via listener |
| **N4** | Repo | Após `npm run build` (T-F01), commitar `crates/hoblio-studio/dist/index.html` se o hash do bundle mudar |

**CLI `run`:** cada ação imprime **uma** linha de resumo no stdout; com `--jsonl`, espelho em `.hoblio/run.jsonl` (`action_executed`, campo `detail`).

---

## 4.6 Browser (CDP), variáveis e `setup-dev`

| Tópico | Detalhe |
|--------|---------|
| **Biblioteca** | `chromiumoxide` **0.9** (CDP compatível com Chrome/Edge recentes) |
| **Executável** | Detecção automática de `chrome.exe` / `msedge.exe` (`crates/hoblio-runtime/src/chromium_exe.rs`) — caminhos padrão Windows, como RPA desktop (ex. Power Automate). Override: `HOBLIO_CHROME_PATH` |
| **Variáveis** | Seed em `flow.json` → `variables` (**Project variables**). Run: `browser_get_text`, **`set_variable`**, ForEach, `{nome}` em textos. Studio: **Flow variables**, defaults `BrowserText1` / `Var1`, paleta **Set variable** |
| **Caminhos `file_write`** | Relativos à **pasta do projeto** (`run` / Studio passam `projectDir`); ex.: `output/example-fetch.txt` |
| **Demo** | `examples/browser-demo-flow` — `example.com` usa `body p` (o site não expõe mais `<h1>`) |
| **`setup-dev.bat`** | Pré-check de espaço no C:, MSVC com carga C++, `cargo test`, `validate` nos exemplos; informa qual Chromium foi detectado; `--full` roda demos browser se houver Chrome/Edge |

Saída de exemplo do demo: `examples/browser-demo-flow/output/heading.txt` (gitignored) com o texto lido, quando o fluxo usa `{page_heading}` no `file_write`.

---

## 5. CLI (sem UI)

```powershell
cargo run -p hoblio-cli -- validate <pasta-projeto>
cargo run -p hoblio-cli -- run <pasta-projeto>
cargo run -p hoblio-cli -- run <pasta-projeto> --jsonl
```

---

## 6. Testes automatizados

```powershell
cargo test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/eval-flow-control.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/eval-rpa-abc.ps1
```

Teste de browser com rede + Chrome (ignorado por padrão):

```powershell
cargo test -- --ignored browser_example_com
```

Regressão manual recomendada antes de release local:

```powershell
cargo run -p hoblio-cli -- run examples/demo-flow
cargo run -p hoblio-cli -- run examples/flow-control-demo
cargo run -p hoblio-cli -- run examples/variables-loops-demo
cargo run -p hoblio-cli -- run examples/files-lists-demo
cargo run -p hoblio-cli -- run examples/resilience-demo
cargo run -p hoblio-cli -- run examples/web-demo-flow
cargo run -p hoblio-cli -- run examples/message-timer-demo
cargo run -p hoblio-cli -- run examples/browser-demo-flow
```

---

## 7. Variáveis de ambiente

| Variável | Efeito |
|----------|--------|
| `HOBLIO_CHROME_PATH` | Override de `chrome.exe` / `msedge.exe` se a detecção automática falhar |
| `HOBLIO_VS_INSTALL_PATH` | Destino das Build Tools quando o C: está cheio (ver troubleshooting) |
| `HOBLIO_CARGO_TARGET_DIR` | Pasta `target` do Cargo fora do C: |

Logs JSONL por execução (CLI `--jsonl`): arquivos sob `.hoblio/` conforme `hoblio-log`.

Interpolação `{variavel}`: seeds em **`flow.json` → `variables`**, valores escritos por **`browser_get_text`**, **`set_variable`**, e **item de ForEach** durante o run.

---

## 8. Como adicionar uma nova ação

1. **`hoblio-model`** — variant em `ActionKind` + `produced_variables()` se a ação escreve run vars + validação em `validate_project`.
2. **`hoblio-serde`** — garantir serialização JSON (serde).
3. **`hoblio-runtime`** — executor em `actions.rs` (ou módulo); emitir eventos `action_executed`.
4. **`hoblio-studio`** — paleta, **Output variable** (se produz valor), defaults em `actionOutputDefaults.ts`, registro em `flowVariables.ts`, `flowConvert.ts` + `useFlowEditor`.
5. **`examples/`** — fluxo demo mínimo.
6. **Teste** — unit em model/runtime; doc em `docs/mvp/fase-mvp-sliceN-….md` ou atualizar este guia.

Ações **Windows-only** (ex.: `show_message`) devem falhar com erro claro em outros SOs.

---

## 9. Formato do projeto (disco)

Pasta exemplo:

```
meu-fluxo/
├── manifest.json    # id, nome, versão do schema
└── flow.json        # nodes[], edges[], start, variables (opcional)
```

**Nó (`nodes[]`):** `id`, `kind` (`start` | `action` | `end` | `if` | `for_each` | `while_loop` | `repeat` | `next_loop` | `exit_loop`), `label`, `action` (se action), `control` (If/ForEach/While/Repeat), `error_handling` (opcional, nós action), `ui: { x, y }`.

**Aresta (`edges[]`):** `from`, `to`, `port` (opcional: `main`, `then`, `else`, `body`, `after`), `ui` (opcional):

- `waypoints`: pontos do tracado no canvas
- `sourceHandle` / `targetHandle`: lados do conector ou nome da porta (`then`, `body`, …)

**Variáveis (seed):** objeto `variables` — **array** = lista (For each); **string / number / boolean** = escalar. **Variáveis de run:** outputs de ações, `set_variable`, `list_append`, item/index de loops, `file_read.variable`.

Edição manual do `flow.json` continua possível; o **Studio** é o editor visual preferido. Controle de fluxo: [slice 5–8](mvp/fase-mvp-slice5-flow-control.md); variáveis PAD-style: §4 **Variáveis no Studio**.

**Exemplos por entrega:** `flow-control-demo` · `variables-loops-demo` · `files-lists-demo` · `resilience-demo` · `browser-demo-flow`.

---

## 10. Git e branches

Desenvolvimento local em `master`. Commits feature + mensagens descritivas. Remoto: `https://github.com/davidpestilli/hoblio.git`.

---

## 11. Limitações conhecidas (dev)

- **If / ForEach / While / Repeat / next / exit** (slices 5–6); sem `switch` ou subfluxos aninhados.
- **Retry/continue** por nó (slice 8); sem aresta **On error** separada no grafo.
- Ciclos inválidos fora de cabeça de loop: run aborta em **10k visitas**; validate nem sempre detecta.
- Browser: instância **controlada pelo runtime**; `wait_for_navigation` após clique sem navegação espera até timeout.
- `file_read` UTF-8; sem `list_length` / `list_remove` dedicados.
- Excel, e-mail, HTTP avançado: fora ou adiados — [decisoes-produto.md](produto/decisoes-produto.md).
- Diálogos nativos empilhados no Studio (Open enquanto outro modal aberto): UX a melhorar.

---

## 12. Referências

- [Índice da documentação](README.md)
- [Avaliação — índice](avaliacao/README.md)
- [Avaliação Grok — entregas A/B/C](avaliacao/protocolos/eval-grok-rpa-abc.md)
- [Avaliação Grok — flow control (slice 5)](avaliacao/protocolos/eval-grok-flow-control.md)
- [Troubleshooting Windows](troubleshooting-windows.md)
- [Estudo de viabilidade](historico/estudo-viabilidade.md)
- [Guia de utilização](guia-utilizacao.md)
