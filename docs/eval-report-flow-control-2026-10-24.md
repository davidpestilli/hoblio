## Avaliação Hoblio - flow control

- Data/ambiente: 24/10/2026 10:13 (horário de Brasília), Windows, máquina do David, `E:\Projetos\hoblio`
- Script: eval-flow-control.ps1, exit code 0 (duração ~2min19s)
- Resumo: pass 18 / fail 0

### Falhas
| TEST_ID | Detalhe |
|---------|---------|
| (nenhuma) | Todas as 18 linhas GROK_EVAL reportaram PASS |

### Verificação independente (fora do harness)
| TEST_ID | Resultado | Detalhe |
|---------|-----------|---------|
| T-V-* (5 exemplos) | PASS real | `hoblio validate` direto: exit 0 em browser-demo-flow, demo-flow, flow-control-demo, message-timer-demo, web-demo-flow |
| T-E01 | PASS real | `last_node=end` presente no stdout (o script não checa isso, só o exit code) |
| T-N01 | PASS real | `validate::tests::if_requires_then_and_else` roda 1 teste ok; via CLI: `missing required outgoing port else`, exit 1 |
| T-N02 | PASS | Ação com 2 saídas `main`: `duplicate outgoing port main`, exit 1 (não está no script) |
| T-R03 | PASS | 2 testes de `variables` ok (não está no script) |
| T-E07 | PASS | `flag=no` imprime só `branch else`, termina em `end` |
| T-E06 exit_loop | PASS | `exit_loop` no corpo para após `item=alpha` e segue pela porta `after` |
| T-E06 next_loop | PASS | `next_loop` no corpo itera os 3 itens normalmente |
| ForEach lista vazia | PASS | Pula o corpo e vai direto para `loop finished` |
| ForEach sem `after` | PASS | validate falha: `missing required outgoing port after` |
| ForEach com variável inexistente | OK com ressalva | Falha só em runtime (`list variable items is not set`), não no validate |

### Problemas no harness (falsos positivos)
1. **T-V-\* nunca executa o validate.** `$using:path` dentro de `& { ... }` lança "A Using variable cannot be retrieved" (só vale em Invoke-Command/Start-Job). Como `Invoke-External` descarta a saída e lê `$LASTEXITCODE`, o valor que fica é o do comando anterior (`cargo test` = 0), e o teste passa sempre. Correção: trocar `$using:path` por `$path` (ou passar via `-ArgumentList`) e zerar `$global:LASTEXITCODE` antes de cada chamada.
2. **T-N01 roda 0 testes.** `--exact` exige o caminho completo; `if_requires_then_and_else` sozinho filtra tudo e o cargo sai com 0 ("running 0 tests"). Correção: usar `validate::tests::if_requires_then_and_else -- --exact` e falhar se a saída não contiver `1 passed`.
3. **`Invoke-External` é frágil em geral:** se o comando lançar exceção do PowerShell em vez de rodar, o exit code herdado mascara o erro. Sugestão: `$global:LASTEXITCODE = $null` antes, e tratar `$null` como FAIL.
4. **T-E01 não verifica `last_node=end`**, que o protocolo §3.3 exige. Adicionar `$runOut -match "last_node=end"`.
5. **T-R03, T-N02 e T-E07** estão na matriz/extensões mas não no script; já passam manualmente, vale incluir.
6. **`examples/eproc` não tem `manifest.json`** e é ignorado silenciosamente. Se for projeto real, falta manifest; se for lixo, remover.

### Observações (fora do escopo desta fatia)
- Switch / loop numérico / loop_while: não testados (não implementados)
- `exit_loop` fora de for_each: não consegui montar um caso alcançável sem quebrar o grafo; vale um teste unitário de validate dedicado. Hoje `validate.rs` não checa se next/exit_loop estão dentro de um for_each (só o runtime acusa).
- Variável de lista inexistente em ForEach só é pega em runtime; considerar checar em validate quando a variável não estiver em `variables`.
- `cargo test -p hoblio-runtime` inclui `browser_example_com_navigate_and_get_text` e `resolves_chrome_or_edge_on_dev_machine`, que dependem de rede e de Chrome/Edge instalados: podem deixar T-R02 instável em CI.
- Checklist Studio T-S01 a T-S04 não executado (exige UI no seu computador).

### Veredito
APROVADO (implementação), com correções necessárias no harness: T-V-* e T-N01 estavam passando sem testar nada; a verificação manual confirmou que o comportamento real está correto.
