# Estudo de viabilidade — Hoblio

**Projeto:** Hoblio — clone RPA leve estilo Power Automate Desktop (PAD)  
**Autor:** David Souza  
**Data:** 23 de outubro de 2026 (America/Sao_Paulo)  
**Objetivo:** Avaliar viabilidade técnica e de produto para um MVP local, em Rust, com canvas de ações, execução visual e logs.

---

## Sumário executivo

**Veredito: viável, com escopo delimitado** — reimplementar capacidades equivalentes ao PAD para uso pessoal local é **tecnicamente viável**; alcançar **paridade** com o ecossistema Microsoft (400+ ações, conectores cloud, Dataverse, OCR, SAP, etc.) é **inviável** para um projeto solo ou time pequeno.

O Hoblio deve tratar o PAD como **referência de UX**, não como alvo de compatibilidade binária ou de formato Robin. Com as [decisões de produto](../produto/decisoes-produto.md) — **uso local**, **navegadores primeiro** (automação web), arquivos, HTTP simples, Excel na v1 (com e sem Excel aberto), **sem e-mail por enquanto**, HTTP avançado **adiado** — o caminho recomendado é um **MVP** (designer **flowchart** + runtime + logs + **browser** + arquivos + HTTP básico) seguido de **v1** (Excel dual, UIA ampliada, subflows).

**Stack recomendada:** workspace Rust (`hoblio-*` crates) + **Tauri 2** para shell e designer (canvas drag-and-drop via React Flow ou similar) + runtime 100% Rust. Alternativa “mais nativa/leve”: **egui** + grafo customizado, com custo maior de UX no canvas.

**Ordem de grandeza de esforço (1 dev experiente):** MVP ~10–14 semanas-pessoa (flowchart + navegador); v1 (Excel dual + UIA apps) ~+10–18 semanas-pessoa (**e-mail fora** até nova decisão).

---

## Investigação nesta máquina Windows (verificado vs documentação)

### O que foi verificado localmente

| Item | Resultado |
|------|-----------|
| Instalação PAD | **Microsoft Store (Appx)** — `Microsoft.PowerAutomateDesktop` **11.2610.155.0** x64 |
| Caminho de instalação | `C:\Program Files\WindowsApps\Microsoft.PowerAutomateDesktop_11.2610.155.0_x64__8wekyb3d8bbwe` |
| Atalhos | `%LOCALAPPDATA%\Microsoft\WindowsApps\` (`PAD.*.exe`, alias Store) |
| Dados locais PAD | `%LOCALAPPDATA%\Microsoft\Power Automate Desktop\` — `Cache\`, `Console\`, `CommonSettings.json` (apenas preferências de usuário/NPS; **sem segredos relevantes**) |
| Fluxos locais `.robin` | **Nenhum** em `Console\Workspace` (PAD instalado, mas **sem fluxos executados/criados localmente** nesta máquina) |
| Decompilação / engenharia reversa | **Não realizada** (conforme requisito legal) |

### UX do PAD (documentação Microsoft + mapeamento para Hoblio)

Fontes: [Actions pane](https://learn.microsoft.com/en-us/power-automate/desktop-flows/actions-pane), [Flowchart mode (preview)](https://learn.microsoft.com/en-us/power-automate/desktop-flows/flowchart-flow-designer), [Actions reference](https://learn.microsoft.com/en-us/power-automate/desktop-flows/actions-reference), [Schema v2](https://learn.microsoft.com/en-us/power-automate/desktop-flows/schema).

| Área PAD | Comportamento | Implicação Hoblio |
|----------|---------------|-------------------|
| **Designer — lista (padrão)** | Ações numeradas em sequência | Opcional como view secundária; execução highlight em ambas |
| **Designer — flowchart (preview)** | Nós + arestas; arrastar da biblioteca | **MVP:** canvas flowchart (decisão David) |
| **Biblioteca de ações** | Categorias A–Z (UI automation, Excel, HTTP, Email, File, Loops, …); busca ≥2 chars; favoritos por máquina | MVP: categorias reduzidas alinhadas ao roadmap David |
| **Configuração de ação** | Parâmetros, variáveis produzidas, aba “On error” | MVP: parâmetros + variáveis; v1: políticas de erro |
| **Execução / debug** | Run from step, painel de logs (documentado em módulo Logging) | MVP: run + highlight + painel de logs estruturado |
| **Assets library** | Conectores cloud, UI collections, custom actions | **Fora do escopo** inicial (uso local, sem cloud connectors) |

**Nota:** Não foi possível capturar screenshots interativos do PAD nesta sessão (ambiente agente); o mapeamento acima combina **paths verificados** + **docs públicas**.

### Formato em disco PAD (alto nível — para inspirar serializer Hoblio)

Quando um fluxo **roda localmente** pelo console PAD, cópias ficam em:

`%LOCALAPPDATA%\Microsoft\Power Automate Desktop\Console\Workspace\<flow-id>\<hash>\`

Arquivos típicos (literatura + comunidade Microsoft; **não inspecionados nesta máquina** por ausência de workspace):

| Arquivo | Papel |
|---------|--------|
| `script.robin` | Script textual **Robin**: cabeçalho (`@@ConnectionString`, `@@Type`, `@@DisplayName`), `IMPORT` de repositórios, `@SENSITIVE: []`, corpo com chamadas estilo `Module.Action` |
| `controlRepo.appmask` | Repositório de elementos UI (JSON interno) |
| `imageRepo.imgrepo` | Imagens / reconhecimento visual |

Fluxos “só na nuvem” (schema v2 / Dataverse) **não** dependem desses arquivos locais até haver execução local. Hoblio deve usar **formato próprio**: **pasta de projeto** com JSON (ex.: `MeuFluxo/flow.json`, `manifest.json`, `assets/`), versionado e diff-friendly — **sem** import Robin no MVP.

---

## Mapa PAD vs Hoblio MVP / v1

Legenda: ✅ MVP · 🔶 v1 · ⬜ posterior · ❌ fora de escopo inicial

| Família PAD | Exemplos | Hoblio | Fase |
|-------------|----------|--------|------|
| Variables / Flow control | Set variable, If, Loop | ✅ / 🔶 (If + ForEach no MVP; While/switch v1) | MVP→v1 |
| Mouse and keyboard | Click, Send keys | ✅ básico (`enigo` / SendInput) | MVP |
| File / Folder | Read, Write, Copy, List | ✅ | MVP |
| HTTP | GET, POST, headers | ✅ (`reqwest`) | MVP |
| Text / Clipboard | Parse, replace | 🔶 subset | v1 |
| Browser automation | Edge/Chrome — abrir, attach, click, fill, scrape | ✅ | **MVP (prioridade desktop)** |
| UI automation (apps) | Click control, fill field (UIA) | 🔶 | v1 (após núcleo browser) |
| Excel | `.xlsx` sem app + COM com Excel aberto | 🔶 | v1 |
| Email | SMTP/IMAP/OAuth | ⬜ | **adiado** (decisão 23/10/2026) |
| OCR / PDF / SAP / Cloud connectors | — | ❌ / ⬜ | — |
| Logging (PAD module) | Write to log | ✅ painel + arquivo | MVP |
| Subflows / flowchart UI | FUNCTION … END; grafo | ✅ flowchart MVP · 🔶 subflows v1 | MVP→v1 |

**Decisões David:** ver [decisoes-produto.md](../produto/decisoes-produto.md). MVP: **navegador + arquivos + HTTP simples**; v1: **Excel (dual)** + **UIA apps**; e-mail e HTTP avançado **fora por agora**.

---

## Arquitetura proposta (Rust)

```
hoblio/
├── crates/
│   ├── hoblio-model/      # Flow, Action, Variable, Edge, schema + validação
│   ├── hoblio-serde/      # load/save .hoblio.json, migrações de versão
│   ├── hoblio-runtime/    # interpretador, contexto, breakpoints, highlight events
│   ├── hoblio-log/        # tracing subscriber, ring buffer UI, export .log.jsonl
│   ├── hoblio-actions/    # trait ActionExecutor + registro
│   │   ├── actions-file/
│   │   ├── actions-http/
│   │   ├── actions-input/     # mouse/teclado
│   │   ├── actions-desktop/   # UIA (v1)
│   │   ├── actions-excel/     # v1
│   │   └── actions-mail/      # v1
│   └── hoblio-cli/        # `hoblio run flow.hoblio.json` (headless, CI local)
├── apps/
│   └── hoblio-studio/     # Tauri: designer + run + log panel
└── assets/                # ícones SVG por categoria de ação
```

### Distribuição (decisão David)

- **Uso pessoal local:** executável + DLLs na pasta do projeto; config em `%USERPROFILE%\.hoblio\config.toml` ou `./.hoblio/` ao lado do fluxo.
- **Sem** instalador MSI, **sem** code signing, **sem** multi-usuário — simplifica CI ( `cargo tauri build` opcional; dev pode rodar `cargo run -p hoblio-studio`).
- Segredos (SMTP, API keys): arquivo local gitignored ou Windows Credential Manager (v1).

### Dependências Rust sugeridas (Windows)

| Domínio | Crates | Notas |
|---------|--------|-------|
| Core | `serde`, `serde_json`, `schemars`, `thiserror`, `uuid` | Schema documentado |
| Async runtime | `tokio` | HTTP, mail, timeouts |
| HTTP | `reqwest` (rustls) | MVP: GET/POST, JSON |
| Arquivos | `std::fs` + `glob` / `walkdir` | Paths Windows |
| Mouse/teclado | `enigo` ou `windows` + SendInput | Requer sessão interativa |
| UI Automation | `uiautomation` ou `windows` crate (UIA COM) | v1; apps UWP/Win32 variados |
| Excel | `calamine` (ler), `rust_xlsxwriter` ou `umya-spreadsheet` (escrever) | v1; .xlsx; sem Excel instalado vs COM via `xlwings`-style **fora** do escopo Rust puro |
| E-mail | `lettre` (SMTP), `async-imap` + `async-native-tls` (IMAP) | v1; Outlook MAPI nativo é outro projeto |
| Logs | `tracing`, `tracing-subscriber`, `chrono` | Correlação `run_id`, `step_id` |
| UI shell | `tauri` 2.x | WebView2 (presente no Win10/11) |

**Alternativa sem Tauri:** crate único `hoblio-studio` com **egui** + `egui_dock` — menos dependência de Node, canvas drag-drop mais trabalhoso.

---

## Opções de UI (canvas + drag-and-drop)

| Opção | Prós | Contras | Adequação Hoblio |
|-------|------|---------|------------------|
| **Tauri 2 + React + React Flow** | DnD maduro, flowchart, inspeção rica, ícones SVG | Dois stacks, WebView2, build front | **Recomendado** para designer |
| **egui + grafo custom** | Rust puro, binário leve, estilo “Photocraft” | Flowchart/DnD exige muito código | Boa se priorizar peso sobre UX |
| **iced** | Rust nativo, elegante | DnD/canvas imaturo | Secundária |
| **slint** | UI declarativa, performática | Menos exemplos de node editor | Possível v1+ |
| **Tauri + Svelte Flow** | Similar React Flow | Mesmo híbrido | Equivalente |

**Recomendação:** **Tauri 2 + React Flow** no `hoblio-studio`; **runtime e ações 100% Rust** compartilhados com `hoblio-cli`.

---

## Motor de execução

### Modelo de fluxo

- **MVP:** grafo **DAG** (nós + arestas) serializado em JSON; runtime percorre a partir do nó **Start**; condicionais como arestas rotuladas.
- **v1:** subflows, políticas `on_error`, run from step.

### Variáveis

- Escopo: global do fluxo + escopo de loop (frame stack).
- Tipos MVP: `String`, `Number`, `Boolean`, `List<String>`, `Object` (map JSON).
- Interpolação `{{var}}` nos parâmetros; validação estática na abertura do fluxo.

### Execução visual

- Canal `tokio::sync::watch` ou bus de eventos: `StepStarted`, `StepFinished`, `StepFailed`, `VariableChanged` (opcional v1).
- UI subscreve e aplica highlight no nó/linha atual; botões **Run**, **Run from here**, **Stop** (MVP: Run + Stop).

### Erros

- MVP: falha para o fluxo + log; v1: `on_error` continue / retry / goto (como PAD).

---

## Design de logging

| Camada | Comportamento |
|--------|----------------|
| **In-memory** | Ring buffer (ex.: 2000 eventos) para painel ao vivo |
| **Persistência** | `%USERPROFILE%\.hoblio\logs\<run_id>.jsonl` |
| **Campos** | `timestamp`, `level`, `run_id`, `step_id`, `action_type`, `message`, `duration_ms`, `error` |
| **Integração** | `tracing` spans por step; export “Copiar log” / “Abrir pasta” |

Painel estilo PAD: filtro por nível, busca por step, auto-scroll toggle.

---

## Roadmap faseado

### Fase 0 — Fundação (1–2 sem-pessoa)

- Workspace Cargo, `hoblio-model`, formato JSON v1, CLI `run` stub.

### MVP (~8–12 sem-pessoa)

1. **Studio shell:** biblioteca de ações (ícones), **canvas flowchart** (React Flow ou equivalente), propriedades, salvar/abrir **pasta de projeto**.
2. **Runtime:** sequência, variáveis, If/ForEach simples.
3. **Ações:** **navegador** (launch/attach, goto, click/fill, get text — CDP/WebDriver), arquivos (read/write/copy/list), HTTP GET/POST **simples** (sem proxy/OAuth), mouse/teclado básico como fallback.
4. **Execução visual + logs** (highlight + painel + jsonl).
5. **Deploy local:** pasta portable, config local.

### v1 (~12–20 sem-pessoa adicionais)

1. **Excel dual:** `calamine` / `rust_xlsxwriter` **e** COM com Excel aberto (feature `excel-com`).
2. **UI Automation** em apps Windows além do browser (attach, AutomationId/Name, timeouts); coordenadas só fallback.
3. **Subflows** reutilizáveis.
4. **On error** policies; run from step.

### Adiado (decisão registrada)

- **E-mail** (SMTP/IMAP/OAuth).
- **HTTP avançado** (proxy corporativo, certificado cliente, OAuth) — retomar quando necessário; ver [decisoes-produto.md](../produto/decisoes-produto.md).

### Pós-v1 (opcional)

- Agendador; **recorder fora de escopo** (authoring manual); import parcial de conceitos Robin (não binário).

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| **Legal / marca** | Nome e UI próprios; não usar assets MS; não redistribuir PAD; docs “inspirado em” |
| **UIA frágil** | Documentar limitações; selectors robustos; fallback coordenadas (último recurso) |
| **Excel sem Office** | Limitar a .xlsx via crates; documentar que macros/COM não suportados |
| **E-mail vs Outlook PAD** | Escopo SMTP/IMAP; MAPI/Graph fica fora ou módulo futuro |
| **Expectativa de paridade** | README e UI: “Hoblio ≠ PAD”; tabela de cobertura |
| **Manutenção WebView2 + Rust** | Pin versions; testes de integração headless via CLI |
| **Segurança fluxos locais** | Fluxos executam com privilégios do usuário; aviso na primeira execução |

---

## Estimativa de esforço (ordem de magnitude)

| Entrega | Sem-pessoa (1 dev) |
|---------|-------------------|
| MVP descrito | **8–12** |
| v1 (Excel dual + UIA apps + subflows) | **+10–18** |
| Manutenção anual leve | **2–4** |

Números assumem familiaridade com Rust/Windows; UIA e polish de designer dominam a cauda longa.

---

## Decisões registradas (David, 23/10/2026)

Detalhes em [decisoes-produto.md](../produto/decisoes-produto.md): Excel **dual**; **sem e-mail** por enquanto; HTTP avançado **adiado**; **UIA** com foco inicial em **navegadores**; fluxo em **JSON**; projeto em **pasta**.

**Designer (23/10):** flowchart no MVP; montagem manual (sem recorder); sem fluxo PAD de referência — ver [decisoes-produto.md](../produto/decisoes-produto.md).

---

## Conclusão

Hoblio é **viável** como ferramenta pessoal de automação com UX inspirada no PAD, desde que o escopo permaneça **local**, **sem paridade Microsoft**, e **faseado**. Rust é adequado para runtime e integrações Windows; **Tauri + React Flow** equilibra velocidade de entrega do designer com núcleo Rust performático. Próximo passo concreto: monorepo em `C:\Users\david\projetos\Hoblio`, schema **pasta de projeto** + `flow.json` v0.1, fluxo exemplo “**abrir URL → extrair texto → gravar arquivo** + log”.

---

## Referências

- [Power Automate Desktop — Actions reference](https://learn.microsoft.com/en-us/power-automate/desktop-flows/actions-reference)
- [Configure actions and the actions pane](https://learn.microsoft.com/en-us/power-automate/desktop-flows/actions-pane)
- [Flowchart mode (preview)](https://learn.microsoft.com/en-us/power-automate/desktop-flows/flowchart-flow-designer)
- [Desktop flow schema v2](https://learn.microsoft.com/en-us/power-automate/desktop-flows/schema)
- [Restore deleted flow / script.robin layout](https://learn.microsoft.com/en-us/power-automate/desktop-flows/how-to/restore-deleted-desktop-flow)
