# Esquema de avaliação — composição de fluxos (Grok bot)

Protocolo para validar **run_flow**, **subfluxos embutidos**, **escopo isolado**, **manifest.flows**, abas multi-arquivo no Studio e validação de ciclos.

**Repositório:** ajuste o caminho do clone local.

**Critério de sucesso:** `scripts/eval-flow-compose.ps1` termina com **exit code 0** e `GROK_EVAL: SUMMARY fail=0`.

---

## 1. Pré-requisitos

| ID | Verificação | Esperado |
|----|-------------|----------|
| P1 | `rustc --version` | exit 0 |
| P2 | `cargo --version` | exit 0 |
| P3–P5 | Pastas `examples/flow-compose-demo`, `flow-compose-isolated`, `flow-compose-subflow` | existem |

Se P1–P2 falharem → **BLOCKED**.

---

## 2. Execução automatizada (obrigatória)

```powershell
cd <repo-root>
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\eval-flow-compose.ps1
```

Formato de linha:

```text
GROK_EVAL: <TEST_ID> PASS|FAIL [<detalhe>]
GROK_EVAL: SUMMARY pass=<n> fail=<n>
```

---

## 3. Matriz de testes

### 3.1 Rust

| ID | Comando / foco |
|----|----------------|
| T-R01 | `cargo test -p hoblio-model run_flow_roundtrip -- --exact` |
| T-R02 | `flow_compose_demo_runs` |
| T-R03 | `flow_compose_isolated_demo_runs` (sem vazar `leak-me-not`) |
| T-R04 | `flow_compose_subflow_demo_runs` (subflow embutido) |
| T-R05 | `hoblio-serde` composição válida |

### 3.2 Validate CLI

| ID | Projeto |
|----|---------|
| T-V-compose | `examples/flow-compose-demo` |
| T-V-isolated | `examples/flow-compose-isolated` |
| T-V-subflow | `examples/flow-compose-subflow` |

### 3.3 Run CLI

| ID | Esperado na saída |
|----|-------------------|
| T-E01 | `Hello, Hoblio!`, `Done flag: yes` |
| T-E02 | `result=ok-from-parent`, sem `leak-me-not` |
| T-E03 | `Hi Embedded (inline)` |

### 3.4 Negativo

| ID | Esperado |
|----|----------|
| T-N01 | `validate` rejeita ciclo `run_flow` A↔B |

### 3.5 Front

| ID | `npm run build` em `crates/hoblio-studio` |

---

## 4. Checklist manual (opcional)

1. Abrir `examples/flow-compose-demo` no Studio → abas **Entry**, **greet**, **finish**.
2. Abrir `examples/flow-compose-subflow` → abas **Entry** + **⎇ greet_inline**; **New subflow** cria aba `⎇ subflow_N`.
3. Canvas vazio: **Subflow variables** vs **Project variables**; **Rename** / **Delete** no painel (lista no main, detalhe na aba subfluxo).
4. Nó **Run flow** → **Edit subflow**; renomear subfluxo atualiza `flow_id` nos nós **Run flow** do main.
5. **Save** persiste `subflows` dentro do JSON do arquivo owner; **Run** executa entry flow do disco.

**Nota:** rename/delete de subfluxo e abas multi-arquivo **não** entram no harness automatizado (T-F01 só compila o Studio); itens 2–5 acima são **checklist manual** para o Grok.

---

## 5. Referência de produto

- Child flows em `manifest.json` → `flows`.
- Subfluxo embutido: `flow.json` → `subflows`.
- `variable_scope: isolated` — só `outputs` voltam ao pai.
- `share_browser: false` — sessão Chromium separada no filho (ações browser no filho).
