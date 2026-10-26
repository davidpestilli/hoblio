# Hoblio — Guia de construção e desenvolvimento

Documento consolidado para **montar, compilar e estender** o sistema. Estado reflete o repo em `master` após **slice 5** (If/ForEach + Studio), o editor **Project variables**, e o modelo de variáveis **estilo PAD** (`set_variable`, outputs de ações, índice **Flow variables**, validação de produtores).

Para histórico por entrega, veja também: [Fase 0](fase-0.md), [Slice 1](fase-mvp-slice1.md) · [2](fase-mvp-slice2.md) · [3 browser](fase-mvp-slice3-browser.md) · [4 flow editor](fase-mvp-slice4-flow-editor.md) · **[5 flow control](fase-mvp-slice5-flow-control.md)**.

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
└── docs/
```

- **Runtime 100% Rust** — compartilhado pelo CLI e pelo Studio (Tauri chama o mesmo código).
- **Studio** — shell WebView2; editor flowchart; não é VS Code/Cursor.
- **Persistência** — pasta de projeto com `manifest.json` + `flow.json` (JSON; grafo com ramificações If e loops ForEach).

Decisões de produto: [decisoes-produto.md](decisoes-produto.md).

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

Primeira compilação pode levar vários minutos.

---

## 4. Compilar e rodar o Studio (dev)

```powershell
cd C:\Users\david\projetos\Hoblio\crates\hoblio-studio
npm install              # primeira vez ou após mudar package.json
npm run tauri dev
```

Alternativa na raiz:

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
| `useFlowEditor.ts` | Canvas, undo/redo, multi-port connect, `onConnectEnd` (feedback), Stop/cancel no run |
| `FlowCanvas.tsx` | React Flow, guias de alinhamento, tecla Delete |
| `FlowToolbar.tsx` | Exibição/Edição, desfazer/refazer, **Limpar fluxo**, apagar seleção, rótulo da aresta selecionada |
| `App.tsx` | **`clearFlow`**: diálogo de confirmação → `projectWithClearedFlow` (grafo mínimo Start–End de `defaultProject()`, `variables: {}`), mantém `manifest` e `projectDir`; `editor.loadProject`; indisponível durante **Run** |
| `WaypointEdge.tsx` | Tracado com pontos de passagem |
| `flowConvert.ts` | Conversão `flow.json` ↔ nós/arestas do React Flow |

Detalhes: [slice 4](fase-mvp-slice4-flow-editor.md) · [slice 5 — If/ForEach](fase-mvp-slice5-flow-control.md).

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
| `App.tsx` | Paleta **Variables → Set variable**; estado `variables`; Save / Validate / Run |

**Advanced JSON** ( `<details>` ): colar/importar ou editar valores aninhados que a UI visual não expõe.

**Modelo / runtime (`hoblio-model`, `hoblio-runtime`):**

- Ação **`set_variable`**: `{ "type": "set_variable", "variable": "nome", "value": "texto ou {outra}" }`.
- **`ActionKind::produced_variables()`** — metadado “Variables produced” (`browser_get_text`, `set_variable`).
- **`validate_project`**: nome inválido, `set_variable` sem nome, **produtor duplicado** (inclui `item_variable` do For each).

**Runtime:** `seed_from_project` + `browser_get_text` + `set_variable` + item ForEach → mapa de run; interpolação `{nome}` em `log`, `file_write`, `set_variable.value`, operandos If.

**Ainda fora do escopo:** validação estática de `{refs}` desconhecidas; listas criadas só por ações (For each continua exigindo lista em `variables`); increment/decrease, subflows com escopo local.

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
| **`scripts/eval-flow-control.ps1`** | Harness Grok/CI — esperado **21 PASS, 0 FAIL** |
| **Docs de avaliação** | [eval-grok-flow-control.md](eval-grok-flow-control.md), [eval-grok-retest-priorities.md](eval-grok-retest-priorities.md) |

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/eval-flow-control.ps1
```

Runtime: `cargo test -p hoblio-runtime --lib` (evita testes de browser opcionais no harness).

---

## 4.2 Browser (CDP), variáveis e `setup-dev`

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
```

Teste de browser com rede + Chrome (ignorado por padrão):

```powershell
cargo test -- --ignored browser_example_com
```

Regressão manual recomendada antes de release local:

```powershell
cargo run -p hoblio-cli -- run examples/demo-flow
cargo run -p hoblio-cli -- run examples/flow-control-demo
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
6. **Teste** — unit em model/runtime; doc em `docs/fase-mvp-sliceN-….md` ou atualizar este guia.

Ações **Windows-only** (ex.: `show_message`) devem falhar com erro claro em outros SOs.

---

## 9. Formato do projeto (disco)

Pasta exemplo:

```
meu-fluxo/
├── manifest.json    # id, nome, versão do schema
└── flow.json        # nodes[], edges[], start, variables (opcional)
```

**Nó (`nodes[]`):** `id`, `kind` (`start` | `action` | `end` | `if` | `for_each` | `next_loop` | `exit_loop`), `label`, `action` (se action), `control` (se If/ForEach), `ui: { x, y }`.

**Aresta (`edges[]`):** `from`, `to`, `port` (opcional: `main`, `then`, `else`, `body`, `after`), `ui` (opcional):

- `waypoints`: pontos do tracado no canvas
- `sourceHandle` / `targetHandle`: lados do conector ou nome da porta (`then`, `body`, …)

**Variáveis (seed):** objeto `variables` — **array** = lista (For each); **string / number / boolean** = escalar. **Variáveis de run** no grafo: `browser_get_text.variable`, `set_variable` (`variable` + `value`), `for_each.item_variable`.

Edição manual do `flow.json` continua possível; o **Studio** é o editor visual preferido. If/ForEach: [slice 5](fase-mvp-slice5-flow-control.md); variáveis PAD-style: §4 **Variáveis no Studio**.

---

## 10. Git e branches

Desenvolvimento local em `master`. Commits feature + mensagens descritivas. Remoto: `https://github.com/davidpestilli/hoblio.git`.

---

## 11. Limitações conhecidas (dev)

- **If / ForEach / next / exit** entregues (slice 5); sem `switch`, `while` genérico ou subfluxos aninhados.
- Ciclos inválidos fora de ForEach: run aborta em **10k visitas**; validate nem sempre detecta.
- Browser: instância **controlada pelo runtime**, não attach à aba manual do usuário.
- Excel, e-mail, HTTP avançado: fora ou adiados — ver [decisoes-produto.md](decisoes-produto.md).

---

## 12. Referências

- [Troubleshooting Windows](troubleshooting-windows.md)
- [Estudo de viabilidade](estudo-viabilidade.md)
- [Guia de utilização](guia-utilizacao.md)
