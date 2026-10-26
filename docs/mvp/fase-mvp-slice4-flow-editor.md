# Fase MVP — slice 4 (editor de fluxo completo)

**Estado:** Studio com edição visual de grafo no estilo do painel Nape (`central_nape`): nós, conexões nos quatro lados, tracado e histórico local.

## O que foi entregue

| Área | Detalhe |
|------|---------|
| **Canvas** | `crates/hoblio-studio/src/flow/` — `FlowCanvas`, `FlowToolbar`, `WaypointEdge`, alinhamento ao arrastar, `@xyflow/react` 12 |
| **Modos** | **Exibição** / **Edição**; desfazer/refazer (40 níveis); Delete/Backspace em seleção; **Limpar fluxo** (reset do canvas + variáveis, ver `App.tsx` / `FlowToolbar`) |
| **Nós** | Paleta de ações + **End node**; handles de entrada/saída em **topo, direita, baixo, esquerda** (Start só saída; End só entrada) |
| **Conexões** | Criar, religar extremos, apagar, rótulo na toolbar; pontos de passagem (+) no tracado |
| **Persistência** | `flow.json` — arestas com `id`, `label`, `ui.waypoints`, `ui.sourceHandle`, `ui.targetHandle` (`hoblio-model`) |
| **Runtime (na época do slice 4)** | Cadeia linear; validação `validate_graph` no Save/Validate/Run — **supersedido pelo [slice 5](fase-mvp-slice5-flow-control.md)** (If/ForEach, multi-porta) |

## Estrutura no frontend

```
crates/hoblio-studio/src/flow/
  useFlowEditor.ts      # estado, histórico, connect/reconnect/delete
  FlowCanvas.tsx        # React Flow + guias de alinhamento
  FlowToolbar.tsx       # modo edição, undo, barra da conexão selecionada
  WaypointEdge.tsx      # tracado customizado
  flowAlignment.ts      # snap entre nós
  flowConvert.ts        # (pai) grafo JSON ↔ React Flow
```

## Comandos

```powershell
cd crates/hoblio-studio
npm run build
npm run tauri dev
```

Abra `examples/demo-flow`, use **Edição**, ligue nós pelos conectores azuis/cinza, **Save**, reabra para confirmar posição e tracado.

## Limitações (slice 4, histórico)

- Grafo de execução **linear** na entrega do slice 4.
- Ramificações e loops: ver **[slice 5](fase-mvp-slice5-flow-control.md)**.
- Undo/redo só na sessão do Studio (não versiona git).
- Inspiração de UX: fluxo do Nape; sem mapa de fases/sentinelas (domínio diferente).
