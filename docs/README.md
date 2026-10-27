# Documentação Hoblio

Índice da pasta `docs/`. Comece pelos **guias**; use **mvp/** para histórico por entrega; **avaliacao/** para protocolos Grok, harnesses e relatórios de teste.

## Guias (dia a dia)

| Documento | Conteúdo |
|-----------|----------|
| [guia-construcao.md](guia-construcao.md) | Arquitetura, build, testes, Studio, entregas A/B/C, QA pós-Grok |
| [guia-utilizacao.md](guia-utilizacao.md) | Studio, CLI, exemplos, ações disponíveis |
| [troubleshooting-windows.md](troubleshooting-windows.md) | MSVC, WebView2, browser, disco C: |

## Produto e histórico

| Pasta | Conteúdo |
|-------|----------|
| [produto/](produto/) | [decisoes-produto.md](produto/decisoes-produto.md) — escopo MVP/v1 |
| [historico/](historico/) | [fase-0.md](historico/fase-0.md), [estudo-viabilidade.md](historico/estudo-viabilidade.md) |

## MVP por slice

Entregas incrementais em [mvp/](mvp/):

| Slice | Documento |
|-------|-----------|
| 1 | [fase-mvp-slice1.md](mvp/fase-mvp-slice1.md) |
| 2 | [fase-mvp-slice2.md](mvp/fase-mvp-slice2.md) |
| 3 | [fase-mvp-slice3-browser.md](mvp/fase-mvp-slice3-browser.md) |
| 4 | [fase-mvp-slice4-flow-editor.md](mvp/fase-mvp-slice4-flow-editor.md) |
| 5 | [fase-mvp-slice5-flow-control.md](mvp/fase-mvp-slice5-flow-control.md) |
| 6 | [fase-mvp-slice6-variables-loops.md](mvp/fase-mvp-slice6-variables-loops.md) |
| 7 | [fase-mvp-slice7-files-lists.md](mvp/fase-mvp-slice7-files-lists.md) |
| 8 | [fase-mvp-slice8-browser-resilience.md](mvp/fase-mvp-slice8-browser-resilience.md) |
| 9 | [fase-mvp-slice9-flow-compose.md](mvp/fase-mvp-slice9-flow-compose.md) — `run_flow`, subfluxos, Studio |

## Avaliação e relatórios

Ver [avaliacao/README.md](avaliacao/README.md) — protocolos para o Grok bot, scripts em `scripts/eval-*.ps1`, relatórios datados em `avaliacao/relatorios/`.

Harnesses na raiz do repo:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/eval-flow-control.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/eval-rpa-abc.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/eval-flow-compose.ps1
```
