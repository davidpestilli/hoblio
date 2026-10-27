# Hoblio — Guia de utilização

Como **usar** o Hoblio hoje: editor visual, terminal, exemplos e ações disponíveis. Inspirado em fluxos estilo Power Automate Desktop, **sem compatibilidade** com arquivos Robin/PAD.

---

## 1. O que é o quê

| Peça | Função |
|------|--------|
| **Hoblio Studio** | Aplicativo com flowchart — montar fluxo, validar, executar, ver logs |
| **Hoblio CLI** | Rodar fluxos pelo terminal (automação, testes, agendador futuro) |
| **Pasta de projeto** | Onde ficam `manifest.json` + `flow.json` (seu fluxo salvo) |
| **Cursor / VS Code** | Editar **código-fonte** do Hoblio, não substitui o Studio |

---

## 2. Subir o sistema (uso diário)

### Studio (recomendado para criar/editar fluxos)

```powershell
cd C:\Users\david\projetos\Hoblio\crates\hoblio-studio
npm run tauri dev
```

1. **Open** — selecione uma **pasta** de projeto (ex.: `examples\flow-control-demo`). Se houver alterações não salvas, o app pede confirmação antes de trocar de projeto.
2. No canvas, use **Edição** (barra acima do diagrama):
   - **Paleta** (esquerda): ações, **If**, **For each**, **Next loop**, **Exit loop**, nó **End**.
   - **Conexões:** arraste de conector de saída para entrada; nós If/ForEach usam portas **then/else** ou **body/after** (rótulos no nó).
   - Conexões inválidas (self-loop, ligar em Start, sair de End) mostram mensagem na barra de status.
   - **Selecionar** nó ou aresta; **Delete** / **Backspace** remove (Start não apaga).
   - **Religar** aresta no modo Edição.
   - **Tracado:** aresta selecionada → **+** no segmento; waypoints.
   - **Desfazer / Refazer** (toolbar ou **Ctrl+Z** / **Ctrl+Shift+Z**).
   - **Limpar fluxo** — repõe o diagrama a Start + End (uma ligação), zera **Project variables**; pede confirmação; **desassocia a pasta aberta** (o próximo **Save** pede destino de novo, para não sobrescrever o projeto anterior por engano).
3. **Painel Properties** (direita): parâmetros do nó selecionado; **Delete node** no modo Edição.
4. **Sem nó selecionado:** **Project variables** — seções **Variables** e **Lists** (ou **Advanced JSON**); listas para For each, escalares (ex. `flag`) para If.
5. **Validate** — `validate_project` (grafo + variáveis); erros em vermelho na barra.
6. **Save** (**Ctrl+S**) — grava `flow.json` e `manifest.json`.
7. **Run** / **Stop** — executa ou pede cancelamento; cancelamento mostra **Run cancelled** (não erro).

**Exibição** bloqueia canvas e propriedades (somente leitura).

**Run log:** arraste a **barra fina no topo** do painel para aumentar a altura; **Copy logs**; toggle **JSON**.

### CLI (executar sem abrir o editor)

```powershell
cd C:\Users\david\projetos\Hoblio
cargo run -p hoblio-cli -- run examples\flow-control-demo
```

---

## 3. Exemplos incluídos

| Pasta | O que demonstra |
|-------|------------------|
| `examples/demo-flow` | Logs simples (Hello + segundo passo) |
| `examples/flow-control-demo` | **If** + **ForEach** + variáveis `flag` / `items` |
| `examples/web-demo-flow` | HTTP GET → grava `output/example-fetch.txt` → log |
| `examples/message-timer-demo` | Janela **`show_message`** com timer 2s (Windows) |
| `examples/browser-demo-flow` | Browser CDP → texto → `output/heading.txt` |

Validar antes de rodar:

```powershell
cargo run -p hoblio-cli -- validate examples\<nome>
```

Regressão automatizada (dev):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\eval-flow-control.ps1
```

---

## 4. Ações e controle de fluxo

### Controle de fluxo (nós)

| Nó | Uso |
|----|-----|
| **If** | Compara `left` / `right` (`eq`, `ne`, `contains`); saídas **then** (→) e **else** (↓) |
| **For each** | Lista em `variables[list_variable]`; corpo **body** (volta ao For each); saída **after** após o loop |
| **Next loop** | Próximo item dentro do corpo |
| **Exit loop** | Sai do loop (porta **after**) |

### Ações (`kind: action`)

| Ação | Descrição |
|------|-----------|
| `log` | Mensagem no log (suporta `{variavel}`) |
| `no_op` | Nada |
| `file_write` / `file_append` / `file_read` | Escrever, acrescentar ou ler UTF-8 → variável |
| `list_append` / `list_clear` | Lista JSON em variável de run (For each) |
| `delay` | Pausa fixa (ms) |
| `set_variable` / `increase_variable` / `decrease_variable` | Variáveis de run |
| `http_get` | URL |
| `show_message` | Janela nativa (Windows) |
| `browser_*` | Navegação e DOM via Chrome/Edge (CDP) |

### Janela (Windows)

| Ação | Parâmetros |
|------|------------|
| `show_message` | `title`, `text`, `timeout_seconds` (opcional) |

### Navegador (Chrome/Edge via CDP)

Ordem típica: **`browser_navigate`** primeiro; depois passos DOM na **mesma execução**.

| Ação | Uso |
|------|-----|
| `browser_navigate` | Abrir URL; `wait_ms?`; `show_on_screen?` (padrão visível); `start_maximized?` (padrão maximizar janela) |
| `browser_wait_for` | Esperar seletor CSS |
| `browser_click` | Clique; opcional `wait_for_navigation`, `wait_selector_after` |
| `browser_wait_navigation` | Esperar navegação da aba |
| `browser_fill` | Digitar em campo; **`text` aceita `{variavel}`** |
| `browser_get_text` | Ler texto → variável (`variable`); use `{nome}` depois |
| `show_get_user_input` | Diálogo nativo (Windows); grava variáveis de saída configuradas |

Nós de ação podem ter **`error_handling`**: `retry_count`, `retry_delay_ms`, `on_failure` (`stop` \| `continue`). Ver [slice 8](mvp/fase-mvp-slice8-browser-resilience.md).

**Variáveis:** objeto `variables` no `flow.json` ou painel do Studio; `{nome}` em `log`, `file_write`, `file_append`, `browser_fill`, `show_message`, `set_variable`, etc.

Após **Run**, nós que **produzem** variáveis (`show_get_user_input`, `browser_get_text`, …) exibem **Last run values** no painel Properties (antes de *On error*).

**Chrome / Edge:** detecção automática no Windows; override: `HOBLIO_CHROME_PATH`.

---

## 5. Salvar seu fluxo

No Studio: **Save** na pasta do projeto.

- `manifest.json` — metadados
- `flow.json` — nós, arestas (`port` quando If/ForEach), `variables`

Detalhes: [guia de construção §9](guia-construcao.md) · [slice 5](mvp/fase-mvp-slice5-flow-control.md).

---

## 6. O que ainda não está pronto

- **Switch**, subfluxos aninhados, ramo **On error** dedicado no grafo
- **Excel**, **e-mail**, HTTP com proxy/OAuth
- UIA Windows além do pacote browser
- Importar fluxos Power Automate Desktop

Roadmap: [decisoes-produto.md](produto/decisoes-produto.md).

---

## 7. Problemas comuns

| Sintoma | O que tentar |
|---------|----------------|
| `setup-dev` para no início (disco C:) | Liberar ~4–7 GB no C:; [troubleshooting Windows](troubleshooting-windows.md) |
| `cargo` não encontrado | rustup; reiniciar terminal |
| Erro de linker / `link.exe` | VS Build Tools 2022 + carga C++ |
| Validate falha em ForEach | Confira **Lists** em Project variables (ou `variables` no JSON) e o **List variable** no nó For each |
| FileWrite no lugar errado | Caminho relativo à **pasta do projeto** (`output/...`), não `examples/.../examples/...` |
| Browser falha | `HOBLIO_CHROME_PATH` |
| Run trava em loop | **Stop** ou limite 10k passos; corrija o grafo |
| Build Linux: ícone | `icon.png` deve ser RGBA (já no repo atual) |

---

## 8. Mais detalhe técnico

- [Guia de construção](guia-construcao.md) — compilar, testes, harness, estender ações
- [Índice docs](README.md) · Slices: [1](mvp/fase-mvp-slice1.md) … [8](mvp/fase-mvp-slice8-browser-resilience.md)
- Avaliação Grok: [avaliacao/README.md](avaliacao/README.md)
