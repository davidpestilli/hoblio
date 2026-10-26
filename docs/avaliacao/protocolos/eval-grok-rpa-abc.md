# Esquema de avaliação — entregas A/B/C (Grok bot)

Protocolo para validar **slice 6 (variáveis + loops)**, **slice 7 (arquivos + listas)** e **slice 8 (browser + resiliência)** via CLI, testes Rust e checks opcionais no Studio.

**Repositório:** `E:\Projetos\hoblio` (ajuste se o clone for outro).

**Critério de sucesso global:** `scripts/eval-rpa-abc.ps1` termina com **exit code 0** e `GROK_EVAL: SUMMARY fail=0`.

Complementa (não substitui) [eval-grok-flow-control.md](eval-grok-flow-control.md) — rodar **ambos** antes de release.

---

## 1. Pré-requisitos

| ID | Verificação | Esperado |
|----|-------------|----------|
| P1 | `rustc --version` | exit 0 |
| P2 | `cargo --version` | exit 0 |
| P3 | `examples/variables-loops-demo/flow.json` | existe |
| P4 | `examples/files-lists-demo/flow.json` | existe |
| P5 | `examples/resilience-demo/flow.json` | existe |

Se P1–P2 falharem → suite **BLOCKED**.

---

## 2. Execução automatizada (obrigatória)

```powershell
cd E:\Projetos\hoblio
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\eval-rpa-abc.ps1
```

Formato de saída:

```text
GROK_EVAL: <TEST_ID> PASS|<FAIL> [<detalhe>]
GROK_EVAL: SUMMARY pass=<n> fail=<n>
```

**CLI `run`:** cada ação imprime uma linha de resumo no stdout (ex.: `failed (continued): …`). Com `--jsonl`, o mesmo aparece em `.hoblio/run.jsonl` como evento `action_executed` (campo `detail`).

---

## 3. Matriz de testes (script)

### 3.1 Rust

| ID | Comando / escopo | Valida |
|----|------------------|--------|
| T-R01 | `cargo test -p hoblio-model --lib` | Model + validate |
| T-R02 | `variables_loops_demo_runs`, `files_lists_demo_runs`, `resilience_demo_runs`, `eval_if_lt_numeric` | Integração demos A/B/C |
| T-R03 | `lists::tests::` | list_append / list_clear |
| T-R04 | `adjust_var::tests::` | increase/decrease |

### 3.2 Validate

| ID | Projeto |
|----|---------|
| T-V-variables-loops-demo | Schema While/Repeat/Increase |
| T-V-files-lists-demo | file_* + list_* |
| T-V-resilience-demo | delay + error_handling |

### 3.3 Entrega A — loops e variáveis

| ID | Assertiva |
|----|-----------|
| T-A01 | `run variables-loops-demo` → `last_node=end` |
| T-A02–A03 | stdout contém `while body counter=0` e `counter=3` |
| T-A04 | `done counter=4` |
| T-A05–A06 | `repeat index=0` e `repeat index=3` |

### 3.4 Entrega B — arquivos e listas

| ID | Assertiva |
|----|-----------|
| T-B01 | `run files-lists-demo` → sucesso |
| T-B02 | `output/report.txt` contém `report`, `item=alpha`, `item=beta` |
| T-B03 | `flow.json` sem listas em `variables` (lista só no run) |

### 3.5 Entrega C — resiliência

| ID | Assertiva |
|----|-----------|
| T-C01 | `run resilience-demo` → `last_node=end` |
| T-C02 | stdout contém `failed (continued)` (resumo `ActionExecuted` impresso pelo CLI) |
| T-C03 | stdout contém `continued after read failure` |
| T-C04 | Cópia temp com `on_failure: stop` → **run exit ≠ 0** |

### 3.6 Regressão e Studio

| ID | Assertiva |
|----|-----------|
| T-REG01 | `flow-control-demo` ainda roda (`item=beta`) |
| T-F01 | `npm run build` no Studio (tipos das ações novas) |

---

## 4. Cenários manuais — Studio (Grok bot com UI)

Executar com `npm run tauri dev` em `crates/hoblio-studio`. Marcar **PASS/FAIL** por cenário.

### 4.1 Entrega A

| ID | Passos | Resultado esperado |
|----|--------|-------------------|
| S-A01 | Abrir `examples/variables-loops-demo` → Run | Log com while + repeat; termina em End |
| S-A02 | Inserir nó **While**; conectar body→volta e after→End; Run com `counter` seed 0 | Loop até condição falsa |
| S-A03 | Inserir **Increase variable** no corpo; If/While com operador **&lt;** | Condição numérica funciona |
| S-A04 | Inserir **Repeat N times** (`times: 4`); log `{LoopIndex}` | Índices 0..3 |
| S-A05 | **Next loop** / **Exit loop** dentro de For each ou While | Comportamento igual slice 5, agora em While/Repeat |

### 4.2 Entrega B

| ID | Passos | Resultado esperado |
|----|--------|-------------------|
| S-B01 | Paleta: **List clear** → **List append** (2 itens) → **For each** em `items` | Iteração sem lista no Project variables |
| S-B02 | **File write** `output/test.txt` → **File append** → **File read** → Log `{variável}` | Conteúdo completo no log |
| S-B03 | Validate/Save projeto com For each em `items` só preenchida por list_append | Validate **PASS** (não exige seed list) |

### 4.3 Entrega C

| ID | Passos | Resultado esperado |
|----|--------|-------------------|
| S-C01 | Ação **Delay** 500 ms entre dois Logs; Run | Pausa perceptível; ordem correta |
| S-C02 | **BrowserClick** com **Wait for navigation** (requer Chrome + site real) | Após clique, navegação completa antes do próximo passo |
| S-C03 | **BrowserWaitNavigation** após navigate manual no fluxo | Run não falha por timeout em site estável (ex. example.com) |
| S-C04 | Nó **File read** caminho inválido; Error handling: retry 1, delay 100, **continue** | Run continua; log contém `failed (continued)` |
| S-C05 | Mesmo nó com **on failure: stop** | Run **falha**; status de erro no Studio |

### 4.4 Regressão cruzada

| ID | Passos | Resultado esperado |
|----|--------|-------------------|
| S-X01 | `eval-flow-control.ps1` + `eval-rpa-abc.ps1` | Ambos `fail=0` |
| S-X02 | Open `browser-demo-flow` → Run (Chrome instalado) | `output/heading.txt` ou log com texto da página |

---

## 5. Browser opcional (rede + Chrome)

Não fazem parte do harness CLI (evita flakiness). Executar manualmente ou:

```powershell
cargo test -p hoblio-runtime -- --ignored browser_example_com
```

Validar **S-C02** / **S-C03** com `examples/browser-demo-flow` estendido no canvas (click + wait navigation).

---

## 6. Referências

- [slice 6 — variáveis + loops](../../mvp/fase-mvp-slice6-variables-loops.md)
- [slice 7 — arquivos + listas](../../mvp/fase-mvp-slice7-files-lists.md)
- [slice 8 — browser + resiliência](../../mvp/fase-mvp-slice8-browser-resilience.md)
- [Guia de construção §4.3–4.7](../../guia-construcao.md)
