## Reteste Hoblio - prioridades alta + baixa

> **Atualização pós-reteste:** correções aplicadas no repo (T-N02 no harness, paths `output/...` nos exemplos, `onConnectEnd`, splitter do log, undo por campo, cancelamento neutro, confirmação Open, `write_json_if_changed` semântico). Revalidar com `eval-flow-control.ps1` e checklist §3 de [eval-grok-retest-priorities.md](eval-grok-retest-priorities.md).

- Data/ambiente: 24/10/2026, 11:20 a 11:50 (horário de Brasília). Harness e CLI rodaram no Windows do David (`E:\Projetos\hoblio`). Studio rodou numa cópia do repositório num desktop Linux (Debian 13, Xvfb, `npm run tauri dev`), sem nenhuma alteração no código desta vez: o `icon.png` já veio RGBA e compilou.
- Commit/branch: alterações não commitadas sobre `d6d3494` (feat(studio): full flowchart editor with 4-side connections)
- Harness: eval-flow-control.ps1, exit 0; GROK_EVAL SUMMARY pass=21 fail=0 (+ WARN T-V-eproc SKIP)

### Automatizado
| TEST_ID | PASS/FAIL | Nota |
|---------|-----------|------|
| P1-P4 | PASS | |
| T-R01, T-R02, T-R03 | PASS | T-R02 agora usa `--lib` (sem testes de browser) |
| T-V-browser-demo-flow, demo-flow, flow-control-demo, message-timer-demo, web-demo-flow | PASS | validate agora roda de fato (sem `$using:`) |
| T-V-eproc | WARN SKIP | sem manifest.json |
| T-E01-T-E05, T-E07 | PASS | T-E01 agora confere `last_node=end` |
| T-N01 | PASS | roda 1 teste de fato |
| **T-N02** | PASS **falso positivo** | O `-replace` gera JSON inválido (vírgula antes do primeiro item de `edges`); o validate falha com `json decode ... expected value at line 37`, não por porta duplicada. Com JSON válido o validate acusa corretamente `duplicate outgoing port main`. Corrigir o teste (ex.: ConvertFrom-Json, adicionar a aresta, ConvertTo-Json) e exigir `duplicate outgoing port` na saída. |
| T-F01 | PASS | build inclui `tsc --noEmit` |

Verificações CLI extras (§4):
| Caso | Resultado |
|------|-----------|
| next_loop fora do corpo do ForEach | PASS: `node nx must be inside the body of a for_each loop` |
| ForEach com variável de lista inexistente | PASS: `references unknown list variable items` |
| Ciclo fora de ForEach (run) | PASS: para em ~1 s com `execution exceeded 10000 node visits`; mas o validate ainda aceita o ciclo (melhoria opcional) |
| `cargo test -p hoblio-model validate::` | PASS (2 testes) |

### Studio (manual)
| TEST_ID | PASS/FAIL/SKIP | Observação |
|---------|----------------|------------|
| T-S01 | PASS | `Opened /workspace/hoblio/examples/flow-control-demo` |
| T-S-open | PASS | Grafo encaixado ao abrir, sem nó selecionado (painel mostra Project variables) |
| T-S02 | PASS | `Run finished at end` |
| T-S-stop | PASS c/ ressalva | Fluxo com 300 GETs lentos: `Running...` -> Stop -> `Cancel requested...` -> `Run failed: run cancelled by user` em ~3 s, Run reabilita. Sugestão: status neutro ("Run cancelled") em vez de erro vermelho |
| T-S03 | PASS | Save mantém `port` e `ui.sourceHandle` em then/else/body/after; arestas sem `label`/`id` redundantes |
| T-S-vars | PASS | Editar `flag` para `no` no painel -> Run com `branch else`; persiste após Ctrl+S e reabrir |
| T-S-keys | PASS | Ctrl+S salva (`Saved ...`); Ctrl+Z / Ctrl+Shift+Z desfazem/refazem exclusão de aresta e movimento de nó |
| **T-S-reject** | **FAIL** | Self-loop, entrada em Start e saída de End são bloqueados, mas **sem mensagem**. Causa: o `isValidConnection` passado ao React Flow (`FlowCanvas.tsx:159-178`) barra a conexão durante o arrasto, então `onConnect` nunca é chamado e o `rejectConnection("Connection not allowed")` (`useFlowEditor.ts:236-237`) nunca dispara. Sugestão: emitir a mensagem em `onConnectEnd` quando a conexão for inválida |
| **T-S-log** | **FAIL** | `resize: vertical` em `.log-panel` (`styles.css:~310`) põe a alça no canto inferior direito; como o painel é ancorado embaixo, arrastar para cima só diminui (chegou a ~2 linhas) e não há alça na borda superior. Precisa de um splitter na borda de cima (JS) |
| C1 | PASS | `Validation failed: node check_flag is missing required outgoing port else` (vermelho) |
| C2 | PASS | `Run failed: ... missing required outgoing port else`, Run reabilita |
| C3 | PASS | via variável `flag=no`: `branch else`, fim em end |
| C4 | não refeito | já PASS no baseline; código do If não mudou de comportamento |
| C5 | PASS | Validate: `for_each node each_item references unknown list variable nope` (vermelho) |
| B4 | PASS (substituição) | A saída `main` nova substitui a anterior. Validate depois: `each_item is unreachable from start`. Ressalva: substituição silenciosa; avaliar aviso no status |
| B5 | PASS c/ ressalva | Conexões inválidas rejeitadas, sem feedback (ver T-S-reject) |
| B7 | PASS c/ ressalva | Desfazer habilitado e volta o Label, mas **por caractere**: `XYZ` precisou de 3 cliques. Sugestão: agrupar a edição de um campo num passo (commit no blur) |
| B8 | PASS | Exibição: arrastar, Delete, Label (read-only), Action type (desabilitado) e "Delete node" (oculto) bloqueados |
| B10 | PASS | `Open failed: missing manifest.json in /workspace/hoblio/examples` |
| B11 | PASS | demo-flow: `Run finished at end` |
| B12 | SKIP | Linux (show_message só Windows) |
| **B13** | **FAIL (dados do exemplo)** | O runtime agora resolve pela pasta do projeto, mas os exemplos ainda usam caminho relativo à raiz do repo. Resultado no Studio e na CLI: `examples/web-demo-flow/examples/web-demo-flow/output/example-fetch.txt`. Corrigir `path` para `output/example-fetch.txt` em `examples/web-demo-flow/flow.json` e `output/heading.txt` em `examples/browser-demo-flow/flow.json`. Também apagar as sobras em `crates/hoblio-studio/src-tauri/examples/` |

### Outros achados
- `write_json_if_changed` compara bytes: o manifest original sem `\n` final é reescrito no primeiro Save (depois estabiliza). Comparar o JSON parseado evitaria o diff.
- Reabrir com alterações não salvas não pede confirmação (perda silenciosa de edições).
- No diálogo GTK do Linux, digitar o caminho com Ctrl+L não habilita o botão Open (limitação do diálogo, não do app); vale considerar lista de projetos recentes.

### Regressões em relação aos relatórios 24/10
- Itens que eram FAIL e agora passam: C1, B4 (substitui), B7, B8, B10, falsos positivos T-V-* e T-N01 do harness, ciclo infinito (limite + Stop), next/exit_loop e lista inexistente no validate, fitView, editor de variáveis, atalhos, build com tsc, ícone RGBA.
- Itens ainda FAIL: B13 (caminho dos exemplos), T-S-reject (sem feedback), T-S-log (redimensionar), T-N02 (falso positivo no harness).
- Nenhuma regressão encontrada em itens que já passavam.

### Veredito
- Runtime + CLI + build (T-* harness): **APROVADO**, com correção pendente no teste T-N02 (o comportamento real foi verificado à parte e está correto).
- Studio (checklist §3): **APROVADO COM RESSALVAS**. Alta prioridade C1, B4, B7, B8, B10 PASS; B13 falha só pelos caminhos nos JSON de exemplo (correção de 2 linhas). Baixa prioridade: T-F01 + fitView, variáveis, atalhos e Stop PASS; T-S-reject e T-S-log FAIL.
- **Global:** APROVADO COM RESSALVAS. Antes do commit: corrigir os paths dos exemplos (B13) e o T-N02; T-S-reject e T-S-log podem ir para a próxima iteração.
