# Esquema de avaliação — controle de fluxo (Grok bot)

Protocolo para um agente (Grok bot / CI local) validar a fatia **If + ForEach + next/exit loop (runtime)** e integração Studio/CLI.

**Repositório:** `E:\Projetos\hoblio` (ajuste o caminho se o clone for outro).

**Critério de sucesso global:** script `scripts/eval-flow-control.ps1` termina com **exit code 0** e `GROK_EVAL: SUMMARY pass=21 fail=0`.

Reteste Studio + prioridades: [eval-grok-retest-priorities.md](eval-grok-retest-priorities.md).

---

## 1. Pré-requisitos (agente deve verificar)

| ID | Verificação | Comando / ação | Esperado |
|----|-------------|----------------|----------|
| P1 | Rust toolchain | `rustc --version` | exit 0 |
| P2 | Cargo workspace | `cargo --version` | exit 0 |
| P3 | Node (Studio build) | `node --version` | exit 0, v18+ |
| P4 | Pasta do demo | Test-Path `examples/flow-control-demo/flow.json` | True |

Se P1–P3 falharem, marcar suite como **BLOCKED** e não continuar.

---

## 2. Execução automatizada (obrigatória)

Na raiz do repo:

```powershell
cd E:\Projetos\hoblio
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\eval-flow-control.ps1
```

O script emite linhas no formato:

```text
GROK_EVAL: <TEST_ID> PASS|<FAIL> [<detalhe opcional>]
GROK_EVAL: SUMMARY pass=<n> fail=<n>
```

**Interpretação:**

- `fail=0` e exit code **0** → implementação **APROVADA** para esta fatia.
- Qualquer `FAIL` ou exit code **≠ 0** → **REPROVADA**; reportar `TEST_ID` e detalhe.

---

## 3. Matriz de testes (referência do que o script cobre)

### 3.1 Unitários Rust

| ID | Escopo | O que valida |
|----|--------|----------------|
| T-R01 | `cargo test -p hoblio-model` | Validação de grafo linear + If exige `else` |
| T-R02 | `cargo test -p hoblio-runtime` | `expr`, `exec::flow_control_demo_runs` |
| T-R03 | `cargo test -p hoblio-runtime -- variables` | Interpolação `{var}` |

### 3.2 Projetos de exemplo (serde + validate)

| ID | Projeto | O que valida |
|----|---------|----------------|
| T-V01 | `examples/demo-flow` | Compatibilidade fluxos lineares antigos |
| T-V02 | `examples/flow-control-demo` | Schema If/ForEach + portas |
| T-V03 | Demais `examples/*` com `manifest.json` | Não regressão validate |

### 3.3 Execução CLI

| ID | Comando | Assertivas |
|----|---------|------------|
| T-E01 | `hoblio run examples/flow-control-demo` | exit 0 e stdout contém `last_node=end` |
| T-E02 | stdout contém | `branch then` |
| T-E03 | stdout contém | `item=alpha`, `item=beta`, `item=gamma` |
| T-E04 | stdout contém | `loop finished` |
| T-E05 | stdout **não** contém | `branch else` (com `flag=yes`) |
| T-E07 | cópia temp com `flag=no` | só `branch else`, sem `branch then` |
| T-N02 | demo-flow + 2ª aresta main | validate exit ≠ 0 |
| T-R03 | `cargo test -p hoblio-runtime variables::` | 2 testes ok |

### 3.4 Negativos (validate deve falhar)

| ID | Artefato | Esperado |
|----|----------|----------|
| T-N01 | If sem aresta `else` (grafo temporário) | `validate` / `validate_graph` erro `MissingOutgoingPort` |
| T-N02 | Ação com duas saídas `main` (JSON válido via `ConvertFrom-Json`) | stderr contém `duplicate outgoing port`; exit ≠ 0 |

### 3.5 Frontend (build only)

| ID | Comando | Esperado |
|----|---------|----------|
| T-F01 | `npm run build` em `crates/hoblio-studio` | `tsc --noEmit` + Vite; exit 0, `dist/index.html` |

---

## 4. Checklist manual Studio (opcional para o bot com browser/computer)

Se o agente tiver UI automation:

| ID | Passos | Esperado |
|----|--------|----------|
| T-S01 | `npm run tauri dev`, Open `examples/flow-control-demo` | Canvas carrega nós If / ForEach |
| T-S02 | Run no Studio | Painel de log: mesmas mensagens que T-E02–T-E04 |
| T-S03 | Modo Edição: If mostra handles **then** (→) e **else** (↓) | Conectar gera `port` no JSON após Save |
| T-S04 | Paleta: adicionar **If** e **For each** | Nós aparecem com cores distintas (roxo / teal) |

Falhas aqui são **WARN** se T-R* e T-E* passarem (runtime OK, UX quebrada).

---

## 5. Relatório que o Grok bot deve produzir

Template:

```markdown
## Avaliação Hoblio — flow control

- Data/ambiente: ...
- Script: eval-flow-control.ps1 → exit code ?
- Resumo: pass ? / fail ?

### Falhas
| TEST_ID | Detalhe |
|---------|---------|
| ... | ... |

### Observações (fora do escopo desta fatia)
- Switch / loop numérico / loop_while: não testados (não implementados)
- next_loop / exit_loop: runtime presente; demo CLI não cobre — opcional T-E06 futuro

### Veredito
APROVADO | REPROVADO | BLOCKED
```

---

## 6. Extensões futuras (não bloquear MVP)

- T-E06: demo JSON dedicado para `next_loop` / `exit_loop` (parcialmente coberto em testes manuais)
- T-E08: `cargo test` workspace inteiro + `setup-dev.bat` smoke
- Validate detectar ciclos fora de ForEach (hoje: limite no run)

---

## 7. Invocação sugerida para o Grok bot (prompt)

```text
Execute o esquema em docs/eval-grok-flow-control.md:
1) Verifique pré-requisitos P1–P4.
2) Rode scripts/eval-flow-control.ps1 na raiz do repositório Hoblio.
3) Se exit 0 e GROK_EVAL SUMMARY fail=0, veredito APROVADO; senão REPROVADO com tabela de TEST_ID.
4) Opcional: npm run build no hoblio-studio se T-F01 não estiver no script.
5) Preencha o relatório §5 em markdown.
```
