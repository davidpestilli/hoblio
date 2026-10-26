# Relatório de Reteste – Hoblio RPA (correções B1–B5)

**Data:** 26/10/2026, 07:38–08:10 (BRT)  
**Executor:** Grok Bot (a pedido de David Souza)  
**Commits avaliados:** `c0361b9`, `fa3afe8`  
**Protocolo:** [eval-grok-rpa-abc.md](../../../protocolos/eval-grok-rpa-abc.md)  
**Relatório anterior:** [eval-rpa-abc/RELATORIO_TESTES_HOBLIO_RPA_ABC.md](../eval-rpa-abc/RELATORIO_TESTES_HOBLIO_RPA_ABC.md)

## Veredito

**APROVADO COM RESSALVAS** — B1, B2, B3 e B5 corrigidos; B4 parcial; harnesses **27/0** e **24/0**; Studio desktop (Open, Validate, Run, Save, Run log) validado via CDP. Problemas N1–N4 documentados; correções de código pós-reteste em [guia-construcao.md §4.7](../../../../guia-construcao.md).

## Resumo das correções verificadas

| ID | Situação |
|----|----------|
| B1 | increase/decrease rejeitam valor não numérico |
| B2 | CLI/`--jsonl` com `failed (continued)` |
| B3 | Docs 24 PASS flow-control |
| B4 | Parcial — Repeat sobre End em canvas limpo (corrigido depois em §4.7) |
| B5 | Sem ruído WS chromiumoxide |

## Problemas novos (reteste)

| ID | Severidade | Descrição |
|----|------------|-----------|
| N1 | Médio | Limpar fluxo + Save sobrescrevia projeto aberto |
| N2 | Baixo | “Unsaved changes” falso após Open de fluxo com loops |
| N3 | Baixo | Log duplicado no stdout do CLI |
| N4 | Baixo | `dist/index.html` desatualizado após harness build |

Evidências detalhadas (screenshots, logs) ficaram na sessão local do Grok (`%TEMP%\hoblio-grok-eval-*`); este arquivo preserva o veredito e ligações à documentação viva do repo.
