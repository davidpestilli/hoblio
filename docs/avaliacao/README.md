# Avaliação de qualidade (Hoblio)

## Protocolos (Grok / CI local)

| Documento | Harness | Resultado esperado |
|-----------|---------|-------------------|
| [protocolos/eval-grok-flow-control.md](protocolos/eval-grok-flow-control.md) | `scripts/eval-flow-control.ps1` | **24 PASS**, 0 FAIL |
| [protocolos/eval-grok-rpa-abc.md](protocolos/eval-grok-rpa-abc.md) | `scripts/eval-rpa-abc.ps1` | **27 PASS**, 0 FAIL |
| [protocolos/eval-grok-retest-priorities.md](protocolos/eval-grok-retest-priorities.md) | Reteste Studio (slice 5) | Checklist manual |

Rodar **flow-control** e **rpa-abc** antes de release local. Detalhes de build Studio (T-F01): `npm run build` em `crates/hoblio-studio` — commitar `dist/index.html` quando o hash do bundle mudar (ver [guia-construcao.md §4.7](../guia-construcao.md)).

## Relatórios arquivados

| Data | Pasta | Notas |
|------|-------|--------|
| 2026-10-24 | [relatorios/2026-10-24/](relatorios/2026-10-24/) | Baseline flow-control + UI Studio |
| 2026-10-26 | [relatorios/2026-10-26/eval-rpa-abc/](relatorios/2026-10-26/eval-rpa-abc/) | 1ª rodada A/B/C (Grok) + cenários + evidências |
| 2026-10-26 | [relatorios/2026-10-26/eval-rpa-abc-reteste/](relatorios/2026-10-26/eval-rpa-abc-reteste/) | Reteste pós-fixes B1–B5; ver `RELATORIO_RETESTE_HOBLIO.md` |

Correções aplicadas após o reteste (N1–N4, B4 completo) estão documentadas em [guia-construcao.md §4.7](../guia-construcao.md).
