# Relatório de Testes – Hoblio RPA (Entregas A/B/C – slices 6–8)

**Data:** 26/10/2026 (execução entre 06:46 e 07:00, horário de Brasília – BRT)
**Executor:** Grok Bot (a pedido de David Souza)
**Máquina:** PC do David (Windows) – `E:\Projetos\hoblio`
**Commit avaliado:** `a4ccd55` – *feat(rpa): entregas A/B/C com loops, arquivos/listas e resiliencia* (HEAD confirmado, árvore limpa, igual a `origin/master`)
**Protocolo:** `docs/eval-grok-rpa-abc.md` + `scripts/eval-flow-control.ps1` (slice 5)

## Veredito

**APROVADO COM RESSALVAS**

Os dois harnesses passaram integralmente (**flow-control: 24 PASS / 0 FAIL**; **rpa-abc: 27 PASS / 0 FAIL**), todos os cenários S-* foram reproduzidos com sucesso via fluxos JSON equivalentes no CLI, e o teste opcional de browser (`--ignored`) passou. As ressalvas: 1 bug Médio (coerção silenciosa em increase/decrease), divergências de documentação (Baixo), detalhes cosméticos na UI e o fato de a execução **dentro da janela desktop do Studio (Tauri)** não ter sido verificável de forma automatizada.

---

## 1. Ambiente e pré-checagens

| Item | Resultado |
|------|-----------|
| Git HEAD | `a4ccd55a99ed…` – confere com a mensagem esperada; `git status` limpo antes do teste |
| Toolchain | rustc 1.99.1, cargo 1.99.1, node v22.15.1, npm 10.9.2 |
| Sistema já rodando | `hoblio-studio.exe` (PID 25032, `target\debug`) + Vite dev server em `http://localhost:1420` (node PID 24780) – modo `npm run tauri dev`. **Nenhum processo foi encerrado.** |
| `.env` | Nenhum arquivo `.env`/`.env.*` no repositório (fora de `node_modules`/`target`) – não houve hash a comparar |
| Chrome | `C:\Program Files\Google\Chrome\Application\chrome.exe` presente (necessário para browser) |

### Pré-requisitos P1–P5

| ID | Verificação | Resultado |
|----|-------------|-----------|
| P1 | `rustc --version` | PASS (1.99.1) |
| P2 | `cargo --version` | PASS (1.99.1) |
| P3 | `examples/variables-loops-demo/flow.json` | PASS (existe) |
| P4 | `examples/files-lists-demo/flow.json` | PASS (existe) |
| P5 | `examples/resilience-demo/flow.json` | PASS (existe) |

---

## 2. Roteiro executado

1. Confirmação do commit, árvore limpa, processos/portas ativos (sem matar nada).
2. Leitura de `eval-grok-rpa-abc.md`, `guia-construcao.md` (§4.1–4.6, §6, §9, §11), `guia-utilizacao.md`, `fase-mvp-slice6/7/8`.
3. Execução dos harnesses (logs completos em `eval-flow-control.log` e `eval-rpa-abc.log`).
4. Cenários S-* reproduzidos como **projetos de fluxo JSON** em pasta temporária de teste (`%TEMP%\hoblio-grok-eval-2026-10-26\cenarios\*`), cada um com `validate` + `run` via `target\debug\hoblio.exe` (logs em `evidencias/cenario-*.log`). Arquivos gravados pelos fluxos ficaram **só** nessa pasta temporária.
5. Cenários negativos extras (loop infinito, next fora de loop, repeat sem `after`, retry acima do limite, `times` inválido, increase em valor não numérico).
6. Smoke de UI do Studio com Playwright (Chromium headless) contra o Vite dev server `localhost:1420`: paleta, inserção de nós e painel Properties de cada ação nova (screenshots `evidencias/studio-ui-*.png`, logs `studio-ui-paleta.log` / `studio-ui-propriedades.log`).
7. Browser opcional: `cargo test -p hoblio-runtime -- --ignored browser_example_com` + `browser-demo-flow` (cópia temporária) + cenários S-C02/S-C03 contra example.com.
8. Revisão de código do commit (`git show --stat a4ccd55`) x documentação.

---

## 3. Harnesses automatizados

### 3.1 `scripts/eval-flow-control.ps1` (slice 5) – **24 PASS / 0 FAIL** (exit 0)

`GROK_EVAL: SUMMARY pass=24 fail=0` – duração ≈ 2 min 13 s (inclui compilação).

| ID | Resultado |
|----|-----------|
| P1, P2, P3, P4 | PASS |
| T-R01 (model), T-R02 (runtime lib), T-R03 (variables) | PASS |
| T-V-browser-demo-flow, T-V-demo-flow, T-V-files-lists-demo, T-V-flow-control-demo, T-V-message-timer-demo, T-V-resilience-demo, T-V-variables-loops-demo, T-V-web-demo-flow | PASS (8) |
| T-V-eproc, T-V-reliability-demo | WARN/SKIP – sem `manifest.json` (não contam como FAIL) |
| T-E01, T-E02, T-E03, T-E04, T-E05, T-E07 | PASS |
| T-N01, T-N02 | PASS |
| T-F01 (build Studio) | PASS |

> Obs.: `guia-construcao.md` §4.1/§4.5 ainda cita "**21 PASS** esperado". O aumento para 24 é coerente: os 3 novos exemplos (com manifest) geram 3 T-V extras. Ver bug B3.

### 3.2 `scripts/eval-rpa-abc.ps1` (slices 6–8) – **27 PASS / 0 FAIL** (exit 0)

`GROK_EVAL: SUMMARY pass=27 fail=0` – igual à referência do dev (27/0).

| ID | Resultado | Detalhe |
|----|-----------|---------|
| P1–P5 | PASS (5) | |
| T-R01 | PASS | `cargo test -p hoblio-model --lib` |
| T-R02 | PASS | testes de integração das demos |
| T-R03 | PASS | `lists::tests::` |
| T-R04 | PASS | `adjust_var::tests::` |
| T-V-variables-loops-demo / T-V-files-lists-demo / T-V-resilience-demo | PASS (3) | |
| T-A01 … T-A06 | PASS (6) | while 0..3, `done counter=4`, repeat 0..3 |
| T-B01, T-B02, T-B03 | PASS (3) | report.txt com `report`, `item=alpha`, `item=beta`; sem lista em `variables` |
| T-C01, T-C02, T-C03, T-C04 | PASS (4) | T-C02 verifica `action_retry` (ver B2) |
| T-REG01 | PASS | flow-control-demo ainda roda |
| T-F01 | PASS | `npm run build` do Studio |

---

## 4. Cenários manuais do Studio (S-*)

Legenda: **PASS (CLI)** = o comportamento de runtime/validação foi verificado executando um fluxo JSON equivalente pelo CLI (mesmo motor `hoblio-runtime` usado pelo Studio). **UI** = smoke de interface no Vite dev server com Playwright. **Não testável (GUI desktop)** = a parte "clicar Run/Validate na janela do Studio e observar o Run log" não pôde ser automatizada: a janela é um WebView2 do Tauri sem porta de depuração; abrir `localhost:1420` fora do Tauri não tem o IPC (`window.__TAURI_INTERNALS__` ausente → erro `transformCallback`), então Open/Validate/Run da UI não funcionam fora da janela; reiniciar o Studio com depuração exigiria matar o processo em execução (proibido).

| ID | Resultado runtime/validação | Parte GUI (Studio) | Evidência |
|----|-----------------------------|--------------------|-----------|
| S-A01 | **PASS (CLI)** – while 0..3, repeat 0..3, `done counter=4`, `last_node=end` | Não testável (GUI desktop) | `demo-variables-loops-demo.log` |
| S-A02 | **PASS (CLI)** – While `counter<3`, seed 0: corpo 0,1,2; `done counter=3` | UI: nó While inserido; painel com Left/Operator/Right (eq…lte) – OK | `cenario-sa02-while.log`, `studio-ui-props-While.png` |
| S-A03 | **PASS (CLI)** – `9 < 10` numérico → then; While `n<10` a partir de 8 (comparação lexicográfica falharia) roda 8,9; decrease 3 → 7; increase 0.5 → 7.5 | UI: painel Increase/Decrease (Variable, Amount) – OK | `cenario-sa03-numeric.log` |
| S-A04 | **PASS (CLI)** – Repeat `times={n}`=4 → índices 0..3; Repeat `times=0` pula o corpo | UI: Times=4, Index variable=LoopIndex – OK | `cenario-sa04-repeat.log` |
| S-A05 | **PASS (CLI)** – While: next em counter=2, exit em 4 → `w=1`, `w=3`, `while out counter=4`. Repeat: next em 1, exit em 3 → `r=0`, `r=2`, `repeat out` | UI: nós Next loop / Exit loop inseridos – OK | `cenario-sa05-*.log` |
| S-B01 | **PASS (CLI)** – list_clear → list_append ×2 (com interpolação `{prefix}-um`) → For each: `item=px-um`, `item=dois`; sem lista em Project variables | UI: List clear/append – OK | `cenario-sb01-lists.log` |
| S-B02 | **PASS (CLI)** – file_write → file_append (com acentuação) → file_read → log: conteúdo completo `linha1\nlinha2 acentuação` | UI: FileRead (Path, Output variable), FileAppend – OK | `cenario-sb02-files.log` |
| S-B03 | **PASS (CLI)** – `validate` aceita For each em lista só criada por list_append (sb01 e files-lists-demo) | Não testável (GUI desktop) – botão Validate depende do IPC Tauri | `cenario-sb01-lists.log` |
| S-C01 | **PASS (CLI)** – Delay 500 ms: timestamps 09:53:29.2996Z → 29.7999Z (≈500 ms), ordem correta | Não testável (GUI desktop) – percepção visual | `cenario-sc01-delay.log` |
| S-C02 | **PASS (CLI)** – example.com → BrowserClick `a` com `wait_for_navigation=true` → h1 da página seguinte = "Example Domains" (navegação concluída antes do próximo passo) | UI: checkbox "Wait for navigation after click" – OK | `cenario-sc02-click-nav.log`, `studio-ui-props-BrowserClick.png` |
| S-C03 | **PASS (CLI)** – navigate example.com → BrowserWaitNavigation (8000 ms) retorna ok sem timeout | UI: Timeout (ms) – OK | `cenario-sc03-wait-nav.log` |
| S-C04 | **PASS (CLI)** – file_read inválido, retry 1/delay 100/continue: `action_retry attempt 1/2`, segue e loga "continuou apos falha", exit 0. *O texto `failed (continued)` não aparece no stdout do CLI nem no `run.jsonl` (ver B2).* | Não testável (GUI desktop) – conferir `failed (continued)` no Run log | `cenario-sc04-continue*.log` |
| S-C05 | **PASS (CLI)** – mesmo nó com `on_failure: stop`: exit 1, erro "read file … (os error 3)", log seguinte não executa | Não testável (GUI desktop) – status de erro na UI | `cenario-sc05-stop.log` |
| S-X01 | **PASS** – ambos harnesses `fail=0` (24/0 e 27/0) | – | `eval-*.log` |
| S-X02 | **PASS (CLI)** – browser-demo-flow (cópia temporária): `output/heading.txt` = "This domain is for use in documentation examples…" | Não testável (GUI desktop) | `cenario-sx02-browser-demo-flow.log` |

### 4.1 Smoke de UI (Playwright em `localhost:1420`)

| Verificação | Resultado |
|-------------|-----------|
| Paleta contém Delay, FileAppend, FileRead, BrowserWaitNavigation, Increase/Decrease variable, List clear/append, While, Repeat N times, Next loop, Exit loop | PASS |
| Inserção de cada nó novo no canvas, com rótulo humanizado (`increase variable`, `browser wait navigation`… → confirma a correção `replace(/_/g, " ")`) | PASS |
| Painel Properties de cada ação com campos esperados + bloco **ON ERROR** (Retry count, Retry delay, "If still failing: Stop flow / Continue") | PASS |
| Erros de página | Apenas `transformCallback` (esperado fora do Tauri) |

### 4.2 Cenários negativos extras

| Cenário | Resultado | Avaliação |
|---------|-----------|-----------|
| While sem incremento (infinito) | Run aborta: `execution exceeded 10000 node visits` (exit 1, ~1,5 s) | OK (documentado em §11) |
| Next loop fora de loop | validate falha: "must be inside the body of a loop" | OK |
| Repeat sem porta `after` | validate falha: "missing required outgoing port `after`" | OK |
| `retry_count: 1000` | validate falha: "exceeds maximum allowed" (máx. 50) | OK |
| Repeat `times: "abc"` | validate passa; run falha "expected a number, got `abc`" (exit 1) | Aceitável (erro claro em runtime) |
| Increase em variável com valor `"abc"` | **run passa e grava `v=1`** sem erro | **Bug B1** |

### 4.3 Browser opcional (`--ignored`)

`cargo test -p hoblio-runtime -- --ignored browser_example_com` → **PASS** (`browser_example_com_navigate_and_get_text ... ok`, 1 passed, 0.74 s). Log: `evidencias/browser-ignored-test.log`.

---

## 5. Revisão do commit a4ccd55 x documentação

36 arquivos, +2416/−158. Conferido:

| Item documentado | No código | Situação |
|------------------|-----------|----------|
| `while_loop`, `repeat` (NodeKind + ControlKind While/Repeat) | `hoblio-model/src/action.rs`, `control.rs`; frames While/Repeat em `hoblio-runtime/src/exec.rs` | Confere |
| `increase_variable` / `decrease_variable` | `ActionKind::IncreaseVariable/DecreaseVariable`, `runtime/src/adjust_var.rs` | Confere |
| `file_read`, `file_append` | `ActionKind::FileRead/FileAppend`, `runtime/src/files.rs` | Confere |
| `list_append`, `list_clear` | `runtime/src/lists.rs` | Confere |
| `delay`, `browser_wait_navigation`, `browser_click.wait_for_navigation / wait_selector_after / wait_after_timeout_ms` | `action.rs`, `runtime/src/browser.rs` | Confere |
| `error_handling` (`retry_count`, `retry_delay_ms` default 500, `on_failure` stop/continue) | `model/src/error_handling.rs`, `execute_action_with_policy` em `exec.rs`, limite `MAX_ACTION_RETRIES = 50` em `validate.rs` | Confere |
| Next/Exit loop válidos dentro de While/Repeat | `validate_loop_controls` + `NodeKind::NextLoop/ExitLoop` em `exec.rs` | Confere |
| Correção `replaceAll` → `replace(/_/g, " ")` | `crates/hoblio-studio/src/flow/useFlowEditor.ts` linhas 495 e 524; nenhum `replaceAll` restante em `src/` | Confere |
| Studio: paleta + Properties + Error handling | `PropertiesPanel.tsx` (+433), `model.ts`, `flowVariables.ts` | Confere (smoke UI) |
| Docs slices 6–8, `eval-grok-rpa-abc.md`, `eval-rpa-abc.ps1` | presentes | Confere, com divergências B2/B3 |

---

## 6. Bugs e divergências

| ID | Severidade | Descrição |
|----|-----------|-----------|
| B1 | **Médio** | `increase_variable`/`decrease_variable` tratam valor **não numérico** existente como 0 silenciosamente |
| B2 | Baixo (doc/observabilidade) | `failed (continued)` não aparece no stdout do CLI nem no `run.jsonl`; doc (T-C02, S-C04) diz que aparece |
| B3 | Baixo (doc) | `guia-construcao.md` §4.1 e §4.5: "21 PASS esperado" para eval-flow-control; real = 24 |
| B4 | Baixo (cosmético UI) | Rótulo "BrowserWaitNavigation" estoura a largura do botão da paleta; nós novos são inseridos sobrepostos (o Repeat caiu sobre o rótulo "after ↓" do While, interceptando cliques) |
| B5 | Baixo (ruído de log) | Runs com browser emitem vários `WARN WS Invalid message: data did not match any variant of untagged enum Message` e `Browser was not closed manually` |

### B1 – Coerção silenciosa em increase/decrease (Médio)
- **Onde:** `crates/hoblio-runtime/src/adjust_var.rs` – `parse_number(current).unwrap_or(0.0)`.
- **Reprodução:** projeto com `"variables": {"v": "abc"}`; nó `{"type":"increase_variable","variable":"v"}`; log `v={v}`; `hoblio run <pasta>` → exit 0, imprime `v=1`.
- **Esperado:** erro (como acontece com `amount` inválido ou Repeat `times:"abc"`), ou ao menos documentar. A doc do slice 6 só menciona variável **inexistente** contar como 0. Em RPA isso mascara dado corrompido (ex.: texto lido do browser usado como contador).
- **Evidência:** `evidencias/cenario-neg-increase-nonnumeric.log`.

### B2 – `failed (continued)` não visível no CLI (Baixo)
- O resumo da ação (`RunEvent::ActionExecuted`) só é entregue ao listener (Studio); o CLI (`hoblio-cli/src/main.rs`) não imprime resumos e o `--jsonl` só grava eventos `run_started/node_enter/action_retry/run_finished`.
- O harness contorna verificando `action_retry` (T-C02), mas a tabela §3.5 do `eval-grok-rpa-abc.md` ainda diz "stdout contém `failed (continued)`". O teste unitário (`exec.rs` l.599) confirma que o evento existe.
- **Reprodução:** `hoblio run examples/resilience-demo --jsonl` → nenhuma linha com `failed (continued)` no stdout/stderr nem em `.hoblio/run.jsonl`.

### B3 – Contagem desatualizada no guia (Baixo)
- `guia-construcao.md` linhas ~197 e ~254: "21 PASS". Resultado real: 24 (3 T-V novos).

### B4 – Cosmético na paleta/canvas (Baixo)
- Ver `evidencias/studio-ui-props-BrowserClick.png` (rótulo da paleta cortado/estourado). A sobreposição de nós foi observada no Playwright (viewport 1600×1000) ao inserir While e Repeat em sequência; confirmar na janela real.

### B5 – Ruído de WARN no browser (Baixo)
- Ver `evidencias/cenario-sc02-click-nav.log`. Não afeta o resultado; polui o log do usuário.

---

## 7. Itens não testáveis e motivo

| Item | Motivo |
|------|--------|
| Execução Open/Validate/Save/Run **dentro da janela desktop** do Studio (S-A01…S-X02, parte GUI) | Janela Tauri/WebView2 sem porta de depuração; fora do Tauri a página não tem IPC. Reiniciar o Studio com depuração exigiria encerrar o processo em execução (proibido). Comportamento de runtime coberto pelos equivalentes CLI; UI coberta por smoke de paleta/propriedades. |
| Conferir `failed (continued)` e status de erro no **Run log** do Studio (S-C04/S-C05) | Mesmo motivo; o CLI não expõe esse texto (B2). |
| Pausa "perceptível" de Delay na UI (S-C01) | Percepção visual; tempo medido no CLI (≈500 ms). |

---

## 8. Recomendações

1. **B1:** fazer increase/decrease falhar (ou aplicar `error_handling`) quando o valor atual não é numérico; documentar no slice 6.
2. **B2:** imprimir os resumos `ActionExecuted` no CLI (ao menos em `--jsonl`/verbose) e alinhar o texto de T-C02/S-C04 em `eval-grok-rpa-abc.md` com o que o harness verifica.
3. **B3:** atualizar "21 PASS" → "24 PASS" (ou "N PASS conforme exemplos com manifest").
4. Validar estaticamente `repeat.times` literal não numérico no `validate` (hoje só falha no run).
5. Para permitir automação futura do Studio: suportar `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=…` num modo de teste, ou um mock de IPC para rodar Validate/Run via Playwright.
6. Harnesses: os `Remove-Item -Recurse` usam `Join-Path $env:TEMP …` (seguro na prática); considerar uma guarda explícita (`if (-not $env:TEMP) { exit 2 }`) dado o histórico de incidente com caminhos vazios.
7. Silenciar/filtrar os `WARN WS Invalid message` do chromiumoxide e fechar o browser explicitamente ao fim do run.

---

## 9. Integridade (nada alterado)

- Nenhum commit, push, edição de código ou config. `git status` após os testes: apenas a pasta nova não rastreada `reports/eval-rpa-abc-2026-10-26/`; `git diff` vazio (o `npm run build` dos harnesses regenerou `crates/hoblio-studio/dist/index.html` idêntico ao versionado).
- Nenhum `.env` existente.
- Nenhum processo pré-existente foi encerrado (Studio, Vite, cargo continuam rodando).
- Saídas temporárias: `examples/files-lists-demo/output/report.txt` é criado e removido pelo próprio harness (pasta `output/` é gitignored); o `%TEMP%\hoblio-eval-*` é do harness. Meus fluxos de teste e o Playwright (`playwright-core` instalado localmente) ficaram em `C:\Users\david\AppData\Local\Temp\hoblio-grok-eval-2026-10-26\` – pode ser apagada quando quiser.

## 10. Artefatos

- PC: `E:\Projetos\hoblio\reports\eval-rpa-abc-2026-10-26\`
  - `RELATORIO_TESTES_HOBLIO_RPA_ABC.md` / `.docx`
  - `eval-flow-control.log`, `eval-rpa-abc.log`
  - `evidencias\` – `cenario-*.log`, `demo-*.log`, `browser-ignored-test.log`, `studio-ui-*.png`, `studio-ui-*.log`
  - `cenarios\` – flow.json/manifest.json de cada cenário S-*/negativo
- Box (espelho): `/workspace/hoblio-eval-2026-10-26/`
