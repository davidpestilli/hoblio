## Avaliação Hoblio Studio - testes em tela (UI)

- Data: 24/10/2026, 10:20 a 11:05 (horário de Brasília)
- Ambiente: cópia do repositório num desktop Linux (Debian 13, Xvfb 1920x1200), `npm run tauri dev`, Node 20.19, Rust 1.99.1, `HOBLIO_CHROME_PATH=/usr/bin/google-chrome`
- Alteração necessária para compilar no Linux: `crates/hoblio-studio/src-tauri/icons/icon.png` é RGB e o Tauri exige RGBA (convertido só na cópia de teste). Nenhum código-fonte foi alterado.
- O `examples/` foi restaurado do backup após os testes que salvaram.

### Resultado por teste

| ID | Teste | Resultado | Observado |
|----|-------|-----------|-----------|
| T-S01 | Abrir flow-control-demo | PASS | Todos os nós e arestas desenhados |
| T-S02 | Run no Studio | PASS | `Run finished at end`; log com branch then, item=beta/gamma, loop finished, sem branch else (item=alpha não visível por causa do painel pequeno) |
| T-S03 | Portas then/else e port no JSON após Save | PASS | Save grava `port` nas arestas de If/ForEach |
| T-S04 | Cores e paleta | PASS | If roxo, For each teal, Next/Exit loop âmbar; rótulos then/else e body/after dentro do nó |
| C3 | Right = `no` | PASS | Log `branch else`, termina em end |
| C4 | Ignore case | PASS | `YES` + ignore case: then; sem ignore case: else |
| C5 | List variable inexistente | PASS | `Run failed: list variable nope is not set`, Run reabilita |
| C1 | Validate com If sem else | **FAIL** | Nenhuma mensagem; status anterior permanece |
| C2 | Run com If sem else | PASS | `Run failed: node check_flag is missing required outgoing port else` |
| C-undo | Desfazer exclusão de aresta | PASS | Aresta volta, Validation OK |
| B1 | Exit loop pela paleta | PASS | Só item=alpha, depois loop finished |
| B2/B3 | Next loop pela paleta + Save + reabrir | PASS | JSON salvo valida e roda pela CLI (alpha, beta, gamma) |
| B4 | Duas saídas main numa ação | **FAIL (UX)** | UI permite; Validate não mostra nada; só o Run acusa `duplicate outgoing port main` |
| B5 | Conexões proibidas | PASS c/ ressalva | Self-loop e entrada em Start rejeitados (sem mensagem). Arrastar a partir do handle de End criou `Else branch -> End` (inverte a direção), o que é confuso |
| B6 | Arrastar then para outro nó | PASS | Substitui a aresta then (continua uma só); Run acusa nó inalcançável |
| B7 | Desfazer edição de propriedade | **FAIL** | Desfazer fica desabilitado após mudar Label |
| B8 | Modo Exibição bloqueia edição | **FAIL** | Arrastar e Delete bloqueados, mas Label e "Delete node" do painel funcionam |
| B10 | Abrir pasta sem manifest.json | **FAIL** | Nenhuma mensagem; canvas e status continuam do projeto anterior |
| B11 | demo-flow | PASS | Roda até o fim |
| B12 | message-timer-demo | Esperado | `show_message is only supported on Windows` (no Linux) |
| B13 | web-demo-flow | PASS c/ bug | Roda, mas o FileWrite gravou em `crates/hoblio-studio/src-tauri/examples/web-demo-flow/output/example-fetch.txt` |

Resumo: 21 testes, 15 PASS, 5 FAIL, 1 falha esperada (Windows-only).

### Bugs para corrigir (por prioridade)

1. **Erros de Validate, Save e Open não aparecem na UI** (`App.tsx:80-109`, sem try/catch). Afeta C1, B4 e B10. Corrigir com try/catch e mostrar o erro no status, de preferência em vermelho.
2. **FileWrite resolve caminho relativo pelo diretório de trabalho do app**, não pela pasta do projeto (`hoblio-runtime` `actions.rs` file_write, por volta da linha 66). Já existe lixo de execuções anteriores em `src-tauri/examples/`.
3. **Modo Exibição não bloqueia o painel de propriedades** nem o botão "Delete node" (`App.tsx:206-217`, `PropertiesPanel.tsx`).
4. **Edições no painel de propriedades não entram no histórico de Desfazer** (`useFlowEditor.ts:446-455`, `updateFlowNode`).
5. **Ação aceita várias saídas main na UI** (`useFlowEditor.ts:222-228`, `HoblioNode.tsx:27`). Bloquear na conexão (isValidConnection) ou substituir a saída anterior, como já acontece com then/else.
6. **Sem limite de passos nem botão de parar a execução**, e o validate não detecta ciclos fora de ForEach (`exec.rs` por volta da linha 84). Um ciclo simples trava o Run para sempre (identificado no código, não executado de propósito).
7. **Next loop / Exit loop fora de ForEach passam no validate** (`validate.rs:75`) e só falham em runtime.

### UX e qualidade

- O painel Run log mostra uns 6 linhas e não redimensiona; dá auto-scroll pro fim e esconde linhas como item=alpha.
- Arestas sem handle salvo usam a primeira saída (topo) (`flowConvert.ts:26`, `HoblioNode.tsx:5-10`), então passam por cima dos nós.
- Nós novos da paleta caem sempre na mesma posição e se sobrepõem; IDs usam `Date.now()` (`useFlowEditor.ts:385,408`).
- Abrir projeto não reaplica o fitView nem limpa a seleção (`App.tsx:80-89`).
- O Save reescreve o `manifest.json` sem mudanças (quebra de linha final) e adiciona `id`, `label` (= nome da porta) e `ui.sourceHandle` em todas as arestas: o diff fica com muito ruído (`flowConvert.ts:28,67`).
- Não há editor de variáveis do projeto (flag, items só no flow.json), nem atalhos Ctrl+Z/Ctrl+S.
- Erros de conexão rejeitada não dão feedback visual.
- `npx tsc --noEmit` acusa 12 erros de tipo que o `npm run build` não pega (`HoblioNode.tsx`, `PropertiesPanel.tsx`, `FlowCanvas.tsx:178`, `flowRegistry.ts:6`, `useFlowEditor.ts`). Sugestão: `"build": "tsc --noEmit && vite build"`.
- Portabilidade: `icon.png` RGB quebra o build no Linux e no macOS; `chromium_exe.rs` só procura caminhos do Windows; `show_message` é só Windows.

### Veredito
Runtime de controle de fluxo: **APROVADO** (If, ForEach, Next loop e Exit loop corretos também pela UI).
Studio: **APROVADO COM RESSALVAS**: corrigir antes de liberar os itens 1 a 5 da lista de bugs.
