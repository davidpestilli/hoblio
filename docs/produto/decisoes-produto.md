# Decisões de produto — Hoblio

Registro para retomada futura. **Atualizado:** 23 de outubro de 2026 (America/Sao_Paulo).

---

## Escopo e distribuição (já definidos)

- Uso **local** na máquina do David; sem instalador/assinatura no curto prazo.
- Famílias no roadmap: desktop (via navegador primeiro), arquivos, Excel, HTTP.

---

## Decisões de 23/10/2026

| # | Tema | Decisão |
|---|------|---------|
| 1 | **Excel** | **Ambos:** manipulação **sem** abrir o Excel (`.xlsx` via crates) **e** com **Excel aberto** (automação COM/Office quando necessário). |
| 2 | **E-mail** | **Fora do escopo por enquanto** — não implementar SMTP/IMAP/OAuth até nova decisão. |
| 3 | **HTTP avançado** | **Adiar:** proxy corporativo, certificado cliente, OAuth e auth complexa **não** entram agora. **Registrar** aqui para revisitar quando houver necessidade real. MVP: GET/POST simples (`reqwest`, TLS padrão). |
| 4 | **Automação de UI (desktop)** | Suportar **coordenadas** e **UI Automation** a longo prazo; **prioridade de implementação: UIA**. |
| 5 | **Formato de fluxo** | O que for **mais simples de manipular** → **JSON** (legível, diff-friendly, ecossistema Rust maduro). |
| 6 | **Projeto em disco** | **Pasta de projeto** (não um único arquivo monolítico). Exemplo conceitual: `MeuFluxo/` com manifesto + fluxo + assets. |
| 7 | **Foco inicial “desktop”** | **Navegadores primeiro:** automatizar navegadores já abertos **ou** abrir navegador e executar passos (preferir **CDP / WebDriver** para robustez; UIA na janela do browser como complemento se fizer sentido). Automação genérica de apps Win32 fica **depois** do núcleo browser. |

---

## Implicações no roadmap

| Fase | Ajuste |
|------|--------|
| **MVP** | **Designer flowchart** (nós + arestas) + browser + arquivos + HTTP simples + execução + logs; **authoring manual** (sem recorder). |
| **v1** | Excel (dual: xlsx + COM), UIA apps além do browser, subflows, políticas de erro. |
| **Adiado** | E-mail; HTTP proxy/OAuth/client-cert. |

---

## Decisões de designer (23/10/2026, tarde)

| # | Tema | Decisão |
|---|------|---------|
| 8 | **Canvas MVP** | **Flowchart** desde o dia 1 (não só lista sequencial). |
| 9 | **Recorder** | **Não** — montagem manual de ações apenas. |
| 10 | **Caso de referência PAD** | **Nenhum** fluxo de referência por enquanto. |
