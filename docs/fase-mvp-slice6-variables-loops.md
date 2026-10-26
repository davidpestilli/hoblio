# Fase MVP — slice 6 (entrega A: variáveis + loops)

**Estado:** Increase/decrease variable, If numérico, **While**, **Repeat N times** no model, runtime, CLI e Studio.

## O que foi entregue

| Área | Detalhe |
|------|---------|
| **Ações** | `increase_variable`, `decrease_variable` (`variable`, `amount?` — default 1, suporta `{var}`) |
| **If / While** | Operadores `gt`, `gte`, `lt`, `lte` (operandos numéricos após resolve) |
| **Nós** | `while_loop` (`control.type: "while"`, mesmos campos que If) |
| **Nós** | `repeat` (`times`, `index_variable` — índice 0-based a cada iteração) |
| **Loops** | `next_loop` / `exit_loop` válidos dentro de For each, While ou Repeat |
| **Validação** | Ciclos exigem cabeça `for_each`, `while_loop` ou `repeat` |
| **Exemplo** | `examples/variables-loops-demo` |
| **Studio** | Paleta + painel de propriedades para ações e nós acima |

## Formato JSON (resumo)

**Increase / decrease:**

```json
{ "type": "increase_variable", "variable": "counter" }
{ "type": "decrease_variable", "variable": "counter", "amount": "2" }
```

**While:**

```json
{
  "kind": "while_loop",
  "control": {
    "type": "while",
    "left": "{counter}",
    "operator": "lt",
    "right": "4"
  }
}
```

Arestas: `port: "body"` (condição verdadeira) e `port: "after"` (falsa). O corpo deve voltar ao nó While.

**Repeat:**

```json
{
  "kind": "repeat",
  "control": {
    "type": "repeat",
    "times": "4",
    "index_variable": "LoopIndex"
  }
}
```

`times` aceita literal ou `{variavel}` numérica.

## Comandos

```powershell
cargo run -p hoblio-cli -- validate examples/variables-loops-demo
cargo run -p hoblio-cli -- run examples/variables-loops-demo
cargo test -p hoblio-runtime --lib variables_loops_demo_runs
```

## Limitações (pós entrega A)

- Sem `switch`, subfluxos.
- Listas em runtime: [slice 7](fase-mvp-slice7-files-lists.md).
- Variáveis inexistentes em increase/decrease contam como **0**.
- Repeat: `times` fracionário é arredondado; negativo falha na execução.
