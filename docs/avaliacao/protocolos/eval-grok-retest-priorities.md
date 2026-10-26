# Reteste Grok — bugs de alta e baixa prioridade (pós-correção)

Documento para o **Grok bot** (ou agente equivalente) **retestar** a fatia de controle de fluxo + correções do Studio apontadas nos relatórios:

- [eval-report-flow-control-2026-10-24.md](../relatorios/2026-10-24/eval-report-flow-control-2026-10-24.md) (runtime + harness)
- [eval-report-studio-ui-2026-10-24.md](../relatorios/2026-10-24/eval-report-studio-ui-2026-10-24.md) (UI manual)

**Repositório:** `E:\Projetos\hoblio` (ajuste o caminho se o clone for outro).

**Baseline esperada (pós-commit slice 5 + reteste):** harness **21× PASS, 0× FAIL**, exit **0**; T-N02 exige mensagem `duplicate outgoing port`; Studio: B13 (`output/...` nos exemplos), T-S-reject, T-S-log, cancelamento neutro, confirmação ao Open com dirty state — ver [eval-report-retest-2026-10-24.md](../relatorios/2026-10-24/eval-report-retest-2026-10-24.md) (itens corrigidos na rodada seguinte).

---

## 1. O que foi corrigido (mapa para o reteste)

### Alta prioridade (Studio / runtime — relatório UI § “Bugs para corrigir” 1–5)

| ID origem | Problema | Correção esperada | Como verificar |
|-----------|----------|-------------------|----------------|
| **C1 / B4 / B10** | Validate, Save e Open não mostravam erro na UI | `try/catch` + status em vermelho (`App.tsx`) | C1, B4, B10 abaixo |
| **B13** | FileWrite relativo ao CWD do app | `run_with_root` + `projectDir` no Tauri/CLI | B13 abaixo |
| **B8** | Modo Exibição não bloqueava propriedades | Campos e Delete desabilitados quando `editing === false` | B8 abaixo |
| **B7** | Desfazer não após editar Label | `updateFlowNode` entra no histórico | B7 abaixo |
| **B4 / B5** | Várias saídas `main` / conexões confusas | `isValidConnection` + uma saída `main` por handle (`sourceHandleKey`); nós lineares com handle **right** | B4, B5 abaixo |

### Alta prioridade (runtime / validate — relatório flow § observações)

| ID origem | Problema | Correção esperada | Como verificar |
|-----------|----------|-------------------|----------------|
| **Ciclo infinito** | Run travava sem limite | `MAX_NODE_VISITS` + cancelamento | T-R02; opcional T-S-cancel |
| **Loop controls** | `next_loop`/`exit_loop` fora de ForEach só em runtime | `validate_project` (corpo do ForEach) | T-N-loop (opcional CLI) |
| **Lista inexistente** | ForEach só falhava no run | `validate_project` → variável de lista desconhecida | C5 + validate com variáveis |

### Baixa prioridade (UX / qualidade — relatório UI § “UX e qualidade”)

| Item | Correção esperada | Como verificar |
|------|-------------------|----------------|
| Log pequeno | Painel de log redimensionável (`resize: vertical`) | T-S-log |
| Arestas sobre nós | Saída default **right** + persistência mais limpa em `flowConvert.ts` | T-S03 / inspeção visual |
| Abrir projeto | `fitView` após Open | T-S-open |
| Save ruidoso | `write_json_if_changed` no manifest | Diff menor após Save (opcional) |
| Variáveis | Editor JSON no painel (sem nó selecionado) | T-S-vars |
| Atalhos | Ctrl+S, Ctrl+Z / Ctrl+Shift+Z | T-S-keys |
| Conexão rejeitada | Mensagem no status | T-S-reject |
| Stop Run | Botão Stop → `cancel_run_cmd` | T-S-stop |
| TypeScript | `npm run build` inclui `tsc --noEmit` | **T-F01** (script) |
| Ícone Linux | `icon.png` RGBA | Build Tauri no Linux sem erro de ícone |

---

## 2. Execução automatizada (obrigatória)

Mesmo protocolo de [eval-grok-flow-control.md](eval-grok-flow-control.md):

```powershell
cd E:\Projetos\hoblio
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\eval-flow-control.ps1
```

**Sucesso:** exit code **0** e linha final:

```text
GROK_EVAL: SUMMARY pass=21 fail=0
```

(Contagem inclui P1–P4, T-R01–R03, T-V-* por exemplo com manifest, T-E01–E05, T-E07, T-N01–N02, T-F01.)

Se **fail > 0** ou exit ≠ 0 → **REPROVADO** na fatia runtime/CLI/build; listar cada `GROK_EVAL: … FAIL`.

**Nota:** `examples/eproc` sem `manifest.json` gera `WARN … SKIP` — não conta como FAIL.

---

## 3. Checklist manual Studio (obrigatório se o agente tiver UI)

Ambiente sugerido: `cd crates/hoblio-studio && npm run tauri dev` (Windows preferível para `show_message`).

Modo **Edição** ativo salvo onde indicado.

| TEST_ID | Passos | Resultado esperado (pós-correção) |
|---------|--------|-----------------------------------|
| **T-S01** | Open → `examples/flow-control-demo` | Canvas com If, ForEach, loops; status “Opened …” |
| **T-S-open** | Após Open | View encaixa o grafo (fitView); seleção limpa |
| **T-S02** | Run | `Run finished at end`; log: `branch then`, itens, `loop finished`, sem `branch else` (flag yes) |
| **T-S-stop** | Run em fluxo longo ou demo; clicar **Stop** durante execução | Run termina ou status “Cancel requested…”; botão Run reabilita |
| **T-S03** | Save após inspecionar If/ForEach | `flow.json` mantém `port` then/else/body/after onde aplicável |
| **T-S-vars** | Desselecionar nós; painel **Project variables** | JSON editável; após Save, `variables` persistem (ex. `items`, `flag`) |
| **T-S-keys** | Ctrl+S salva; Ctrl+Z desfaz movimento/aresta | Comportamento consistente (fora de input/textarea) |
| **T-S-reject** | Tentar self-loop ou ligar em **Start** | Status de erro (ex. “Connection not allowed”), texto em vermelho |
| **T-S-log** | Arrastar borda superior do painel Run log | Altura aumenta; scroll mostra mais linhas |
| **C1** | Remover aresta **else** do If; **Validate** | Status **Validation failed:** … `missing required outgoing port else` (vermelho) |
| **C2** | Mesmo grafo; **Run** | Run failed com mesma mensagem de porta |
| **C3** | Right = `no` (propriedade If ou variável) | Log `branch else`, fim em `end` |
| **C4** | Ignore case | Comportamento then/else conforme checkbox |
| **C5** | ForEach com list variable inexistente | **Validate** falha (variável desconhecida) **ou** Run failed coerente |
| **B4** | Tentar segunda saída **main** na mesma ação | Segunda conexão **rejeitada** ou substituição; **Validate** OK no grafo válido |
| **B5** | Self-loop, target Start, source End | Rejeitado + feedback no status |
| **B7** | Alterar Label; **Undo** | Label volta; Undo habilitado após edição |
| **B8** | Modo **Exibição** | Canvas não edita; painel propriedades **somente leitura**; Delete desabilitado |
| **B10** | Open pasta **sem** `manifest.json` | **Open failed:** … (vermelho); projeto anterior não deve parecer “salvo” silenciosamente |
| **B11** | Open + Run `examples/demo-flow` | Conclui OK |
| **B12** | `message-timer-demo` no Linux | Falha esperada se SO ≠ Windows |
| **B13** | Open + Run `examples/web-demo-flow` com `projectDir` | FileWrite sob pasta do **projeto** (ex. `examples/web-demo-flow/output/…`), **não** under `src-tauri/` |

Falhas em T-S* com T-R* e T-E* verdes → classificar **Studio REPROVADO** mesmo com runtime OK.

---

## 4. Verificações CLI opcionais (`validate_project`)

Se o bot puder rodar comandos extras:

```powershell
# T-N-loop (sugestão): grafo temp com next_loop fora do corpo do for_each → validate exit ≠ 0
cargo test -p hoblio-model validate::  # inclui testes de grafo + project

# Workspace inteiro (mais lento que o harness)
cargo test -q
```

---

## 5. Relatório que o Grok bot deve produzir

```markdown
## Reteste Hoblio — prioridades alta + baixa

- Data/ambiente: …
- Commit/branch (se souber): …
- Harness: eval-flow-control.ps1 → exit ? ; GROK_EVAL SUMMARY pass=? fail=?

### Automatizado
| TEST_ID | PASS/FAIL | Nota |
|---------|-----------|------|

### Studio (manual)
| TEST_ID | PASS/FAIL/SKIP | Observação |
|---------|----------------|------------|

### Regressões em relação aos relatórios 24/10
- Itens que eram FAIL e agora: …
- Itens ainda FAIL: …

### Veredito
- Runtime + CLI + build (T-* harness): APROVADO | REPROVADO | BLOCKED
- Studio (checklist §3): APROVADO | APROVADO COM RESSALVAS | REPROVADO
- **Global:** …
```

---

## 6. Prompt sugerido (copiar para o Grok bot)

```text
Reteste o repositório Hoblio conforme docs/avaliacao/protocolos/eval-grok-retest-priorities.md.

1) Leia os relatórios baseline em docs/avaliacao/relatorios/2026-10-24/ para saber o que era FAIL antes.
2) Rode na raiz: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/eval-flow-control.ps1
   Exija GROK_EVAL SUMMARY pass=21 fail=0 e exit code 0.
3) Se tiver automação de UI, execute a checklist §3 (T-S01, T-S-open, C1, B4, B7, B8, B10, B13, T-S-vars, T-S-keys, T-S-reject, T-S-stop, T-S-log, etc.) e compare com “Resultado esperado”.
4) Preencha o relatório §5 em markdown com tabelas PASS/FAIL e veredito separado (harness vs Studio).
5) Se algo falhar, cite arquivo/comportamento observado; não assuma PASS só porque o código “parece” corrigido.
```

---

## 7. Critério de aprovação global (reteste)

| Camada | Critério |
|--------|----------|
| **Harness** | 24 PASS, 0 FAIL, exit 0 (`eval-flow-control.ps1`) |
| **Alta prioridade Studio** | C1, B4, B7, B8, B10, B13 → PASS |
| **Baixa prioridade** | Pelo menos T-F01 + 4 itens UX (log, fitView, vars, keys ou reject ou stop) → PASS |
| **Global** | Harness **APROVADO** e Studio **APROVADO** ou **APROVADO COM RESSALVAS** (no máximo B12 SKIP por SO) |
