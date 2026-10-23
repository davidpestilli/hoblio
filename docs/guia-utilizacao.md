# Hoblio — Guia de utilização

Como **usar** o Hoblio hoje: editor visual, terminal, exemplos e ações disponíveis. Inspirado em fluxos estilo Power Automate Desktop, **sem compatibilidade** com arquivos Robin/PAD.

---

## 1. O que é o quê

| Peça | Função |
|------|--------|
| **Hoblio Studio** | Aplicativo com flowchart — montar fluxo, validar, executar, ver logs |
| **Hoblio CLI** | Rodar fluxos pelo terminal (automação, testes, agendador futuro) |
| **Pasta de projeto** | Onde ficam `manifest.json` + `flow.json` (seu fluxo salvo) |
| **Cursor / VS Code** | Editar **código-fonte** do Hoblio, não substitui o Studio |

---

## 2. Subir o sistema (uso diário)

### Studio (recomendado para criar/editar fluxos)

```powershell
cd C:\Users\david\projetos\Hoblio\crates\hoblio-studio
npm run tauri dev
```

1. **Open** — selecione uma **pasta** de projeto (ex.: `examples\demo-flow`).
2. Arraste ações da paleta ou edite nós no canvas.
3. **Validate** — checa o grafo.
4. **Run** — executa; nó ativo destacado; painel **Run log** abaixo.

**Run log:** linhas legíveis; botão **Copy logs**; toggle **JSON** se quiser o formato bruto.

### CLI (executar sem abrir o editor)

```powershell
cd C:\Users\david\projetos\Hoblio
cargo run -p hoblio-cli -- run examples\demo-flow
```

---

## 3. Exemplos incluídos

| Pasta | O que demonstra |
|-------|------------------|
| `examples/demo-flow` | Logs simples (Hello + segundo passo) |
| `examples/web-demo-flow` | HTTP GET `example.com` → grava arquivo → log |
| `examples/message-timer-demo` | Janela nativa **`show_message`** com timer 2s |
| `examples/browser-demo-flow` | Navegar → esperar `h1` → ler texto → gravar arquivo |

Validar antes de rodar:

```powershell
cargo run -p hoblio-cli -- validate examples\<nome>
```

---

## 4. Ações disponíveis (até slice 3)

### Controle de fluxo

| Ação | Descrição |
|------|-----------|
| `log` | Mensagem no log de execução |
| `noop` | Nada (útil para testes) |

### Arquivo e rede

| Ação | Parâmetros principais |
|------|------------------------|
| `file_write` | Caminho + conteúdo texto |
| `http_get` | URL; resposta resumida no log |

### Janela (Windows)

| Ação | Parâmetros |
|------|------------|
| `show_message` | `title`, `text`, `timeout_seconds` (opcional) |

- Com **timer** (ex.: 2): fecha sozinha após N segundos.
- **Sem timer**: fica aberta até clicar **Fechar** (o fluxo pode terminar antes).

### Navegador (Chrome/Edge via CDP)

Ordem típica: **`browser_navigate`** primeiro; depois passos DOM na **mesma execução**.

| Ação | Uso |
|------|-----|
| `browser_navigate` | Abrir URL; mantém browser aberto até o fim do run |
| `browser_wait_for` | Esperar seletor CSS aparecer |
| `browser_click` | Clicar em seletor |
| `browser_fill` | Limpar e digitar em campo |
| `browser_get_text` | Ler texto do elemento (aparece no log da ação) |

Se o browser não for encontrado, defina:

```powershell
$env:HOBLIO_CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

**Limitação:** o Hoblio abre um Chromium **controlado por ele**; não automatiza abas que você abriu manualmente no seu browser do dia a dia (por enquanto).

---

## 5. Salvar seu fluxo

No Studio: **Save** na pasta do projeto (mesma que abriu ou nova pasta vazia com `manifest.json` + `flow.json`).

Estrutura mínima:

- `manifest.json` — nome e metadados do projeto
- `flow.json` — nós (ações + posição) e arestas entre eles

Montagem **manual** no canvas (sem gravador de cliques).

---

## 6. O que ainda não está pronto

- **If / condicionais** no flowchart (próximo desenvolvimento)
- **Excel**, **e-mail**, HTTP com proxy/OAuth
- Automatizar apps Windows genéricos (UIA) além do pacote browser
- Importar fluxos Power Automate Desktop

Roadmap e decisões: [decisoes-produto.md](decisoes-produto.md).

---

## 7. Problemas comuns

| Sintoma | O que tentar |
|---------|----------------|
| `cargo` não encontrado | Instalar rustup; reiniciar terminal |
| Erro de linker / `link.exe` | VS Build Tools + C++ |
| Browser falha | `HOBLIO_CHROME_PATH`; Chrome instalado |
| Log duplicado no Studio | Atualize para `master` pós slice 2 (fix StrictMode) |
| Ação browser “sem sessão” | Coloque `browser_navigate` antes dos passos DOM |

---

## 8. Mais detalhe técnico

- [Guia de construção](guia-construcao.md) — compilar, testes, estender ações
- Slices: [1](fase-mvp-slice1.md) · [2](fase-mvp-slice2.md) · [3 browser](fase-mvp-slice3-browser.md)
