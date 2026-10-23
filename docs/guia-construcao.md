# Hoblio — Guia de construção e desenvolvimento

Documento consolidado para **montar, compilar e estender** o sistema. Estado reflete o repo em `master` após slice 3 (browser).

Para histórico por entrega, veja também: [Fase 0](fase-0.md), [Slice 1](fase-mvp-slice1.md), [Slice 2](fase-mvp-slice2.md), [Slice 3 browser](fase-mvp-slice3-browser.md).

---

## 1. Visão da arquitetura

```
Hoblio/
├── crates/
│   ├── hoblio-model/      # Grafo, nós, ActionKind, validação
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
- **Persistência** — pasta de projeto com `manifest.json` + `flow.json` (JSON, grafo DAG).

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

Instalação rápida:

```powershell
winget install Rustlang.Rustup
winget install OpenJS.NodeJS.LTS
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

O script tenta instalar **Rust**, **Node.js LTS** e validar **Build Tools MSVC** via `winget`, compila o workspace, roda `npm install` + `npm run build` no Studio, `cargo test` e `validate` nos quatro exemplos em `examples/`.

- **`scripts\setup-dev.bat --full`** — além do acima, executa `run` em `demo-flow`, `web-demo-flow` e `browser-demo-flow` (browser só se Chrome/Edge ou `HOBLIO_CHROME_PATH` estiver definido).
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
```

Teste de browser com rede + Chrome (ignorado por padrão):

```powershell
cargo test -- --ignored browser_example_com
```

Regressão manual recomendada antes de release local:

```powershell
cargo run -p hoblio-cli -- run examples/demo-flow
cargo run -p hoblio-cli -- run examples/web-demo-flow
cargo run -p hoblio-cli -- run examples/message-timer-demo
cargo run -p hoblio-cli -- run examples/browser-demo-flow
```

---

## 7. Variáveis de ambiente

| Variável | Efeito |
|----------|--------|
| `HOBLIO_CHROME_PATH` | Caminho para `chrome.exe` / `msedge.exe` se a detecção automática falhar |

Logs JSONL por execução (CLI `--jsonl`): arquivos sob `.hoblio/` conforme `hoblio-log`.

---

## 8. Como adicionar uma nova ação

1. **`hoblio-model`** — variant em `ActionKind` + struct de parâmetros + validação.
2. **`hoblio-serde`** — garantir serialização JSON (serde).
3. **`hoblio-runtime`** — executor em `actions.rs` (ou módulo); emitir eventos `action_executed`.
4. **`hoblio-studio`** — entrada na paleta, formulário de propriedades, mapeamento para JSON ao salvar.
5. **`examples/`** — fluxo demo mínimo.
6. **Teste** — unit em model/runtime; doc em `docs/fase-mvp-sliceN-….md` ou atualizar este guia.

Ações **Windows-only** (ex.: `show_message`) devem falhar com erro claro em outros SOs.

---

## 9. Formato do projeto (disco)

Pasta exemplo:

```
meu-fluxo/
├── manifest.json    # id, nome, versão do schema
└── flow.json        # nodes[], edges[], start
```

Edição manual possível; o Studio é o editor visual preferido. Condicionais (If) e subfluxos ainda em evolução — ver [decisoes-produto.md](decisoes-produto.md).

---

## 10. Git e branches

Desenvolvimento local em `master`. Commits feature + mensagens descritivas. Remoto: `https://github.com/davidpestilli/hoblio.git`.

---

## 11. Limitações conhecidas (dev)

- Grafo **linear ou DAG simples**; **If/condicionais** ainda não no produto (próximo sprint).
- Browser: instância **controlada pelo runtime**, não attach à aba manual do usuário.
- Variáveis: suporte parcial no runtime; UI de variáveis limitada no Studio.
- Excel, e-mail, HTTP avançado: fora ou adiados — ver decisões de produto.

---

## 12. Referências

- [Estudo de viabilidade](estudo-viabilidade.md)
- [Guia de utilização](guia-utilizacao.md)
