# Legal Way Group — Sistema Integrado

Sistema operacional próprio da Legal Way Group, construído módulo a módulo seguindo o fluxo:

MARKETING → WHATSAPP OFICIAL → LEAD → COMERCIAL → SDR → AGENDA → REUNIÃO → PROPOSTA → CONTRATO → CLIENTE → FINANCEIRO + DOCUMENTAÇÃO/PROCESSOS → PROTOCOLO → ACOMPANHAMENTO

## Padrão do projeto

Segue o mesmo padrão dos outros sistemas (Vitrine Orlando / Repasse, legalway-contratos):
- Cada tela é um arquivo HTML autocontido dentro de `docs/` (HTML + CSS + JS no mesmo arquivo, sem build step)
- Persistência de dados: durante a fase de testes, usando storage do próprio ambiente de protótipo; na fase 2 (produção), conecta em backend real
- Sem necessidade de terminal/código no dia a dia — cada tela tem os controles necessários na própria interface

**Fase atual: fase 2 concluída** — sistema inteiro rodando no servidor (Railway + Postgres), dados e arquivos compartilhados entre computadores. Ver seção "Fase 2" abaixo.
Quando o fluxo completo estiver validado internamente, sobe para um **servidor rodando 24/7** (não dá pra ser só GitHub Pages/hospedagem estática, porque o sistema vai precisar receber webhooks do Meta em tempo real — Lead Ads e WhatsApp Cloud API). Decisão de qual servidor/hospedagem fica pra quando chegar essa fase.

## Fase 2 — servidor real (em andamento)

A partir do piloto da fase 2, o sistema roda em um **servidor Node.js com banco Postgres**, hospedado no Railway: **https://legalway-sistema-production.up.railway.app** (deploy automático a cada push na branch `fase2-piloto`). O servidor fica em `server/` e serve as telas de `docs/` como arquivos estáticos — as telas continuam sendo HTML autocontido, sem build step.

**Tudo migrado pro servidor (2026-09-17):**
- `login.html`, `chat.html`, `usuarios.html` — tabelas próprias (`usuarios`, `sessoes`, `chat_*`); ver piloto acima
- **Todos os outros módulos** (Leads, Funil, SDR, Agenda, Contratos, Clientes, Financeiro, Documentação, Processos, Tarefas, Marketing, Relatórios, Automações, Configurações) — continuam com o mesmo código, mas o `window.storage` que eles usam agora é o `docs/assets/storage.js`, que grava na tabela `armazenamento` (uma chave → um bloco JSON, com versão). Chaves privadas (`shared=false`: sessão, "lidas", preferências) seguem no localStorage.
- **Arquivos** (documentos, comprovantes, traduções, laudos, PDF assinado): o servidor extrai qualquer base64 grande (>2 KB) do JSON pra tabela `arquivos` e deixa no lugar um link `/api/arquivos/<id>` (id aleatório de 32 hex — o link é a chave de acesso; servido com `Content-Security-Policy: sandbox` e `nosniff`).
- **Edição simultânea**: cada salvamento manda a versão que a tela leu; se outra pessoa salvou antes, o servidor mescla em 3 vias por `id` (o que eu mudei vence; o que eu não toquei fica como o outro deixou). Histórico das últimas 30 versões por chave em `armazenamento_hist`.
- **Tempo real**: quando alguém salva, as telas abertas dos outros recebem aviso por WebSocket e recarregam (`loadAll()` + `render()`), a menos que haja um modal aberto.
- **Páginas públicas** (contrato que o cliente assina, Portal do Prestador): o link leva um token `t=` emitido por `POST /api/publico/token` (idempotente por contrato/processo, 90 dias). O mesmo `storage.js` detecta o token e usa `/api/publico/storage/...`, que só enxerga a fatia daquele contrato/processo. O token de assinatura morre depois de usado.
- **Importação**: `importar.html` (link em Configurações) envia o que ficou no localStorage de um navegador pro servidor — une por `id`, sem sobrescrever o que já existe.

Chaves de API principais: `GET/PUT/DELETE /api/storage/:chave`, `GET /api/storage?prefixo=`, `POST /api/storage/importar`, `GET /api/arquivos/:id`, `POST /api/publico/token(s)`, `GET/PUT /api/publico/storage/:chave?t=`.

### Como rodar local

Precisa de Node 20+ e Docker (pro Postgres de teste).

```
cp server/.env.example server/.env   # só na primeira vez
npm install                           # só na primeira vez (instala as dependências do server/)
npm run db:local                      # sobe o Postgres local na porta 5434 (Docker)
npm run dev
```

Abra `http://localhost:3020/login.html`. Na primeira inicialização com o banco vazio, o servidor cria os 7 usuários com senhas temporárias e **imprime a lista no terminal** — cada pessoa é obrigada a trocar no primeiro login.

### Como fica em produção (Railway)

Um serviço Node apontando pra raiz do repositório (o `railway.json` define `npm start` e o healthcheck em `/api/saude`) + um plugin Postgres no mesmo projeto. O Railway injeta `DATABASE_URL` e `PORT` sozinho. Deploy automático a cada push na branch principal do GitHub. As senhas temporárias iniciais aparecem uma vez nos logs do deploy.

## Armazenamento de dados (como as telas foram escritas)

Todas as telas usam `window.storage` (API de protótipo do Claude) quando disponível, com **fallback automático para `localStorage`** quando os arquivos são abertos fora do ambiente do Claude (ou seja, no uso real no Mac). Isso é o que permite telas diferentes conversarem entre si — por exemplo, o contrato que o cliente assina numa aba consegue avisar automaticamente o painel de Contratos aberto em outra aba.

**Importante para isso funcionar direito:** `localStorage` só é compartilhado de verdade entre páginas quando elas rodam no mesmo "endereço" (origem). Abrindo os arquivos direto (`file://`, com duplo clique) pode não compartilhar os dados de forma confiável entre abas, dependendo do navegador. Pra testar o fluxo de assinatura automática, rode um servidor local simples antes de abrir:

Com o servidor da fase 2 rodando (`npm run dev` em `server/`), isso já está resolvido: todas as telas são servidas no mesmo endereço (`http://localhost:3020`). Isso é só para o ambiente de teste — quando o sistema subir pra produção (fase 2), esse mesmo mecanismo vira chamadas a um servidor de verdade, sem precisar do `localStorage`.

## Estrutura

```
server/                  — backend Node.js (fase 2): Express + Postgres + WebSocket. Ver seção "Fase 2"
docs/
  assets/api.js          — ponte das telas com o servidor (LW.api, LW.sessao, LW.sair, LW.tempoReal)
  index.html            — página inicial, lista os módulos
  entrada-leads.html     — Fase 1: Caixa de Entrada + Novos Leads (entrada/distribuição/deduplicação)
  funil-comercial.html   — Fase 2: kanban por etapa, ficha do lead (resumo/histórico/comunicação/agenda/follow-up/comercial/arquivos), saídas com motivo, alertas
  sdr.html                — Fase 3: fila de recuperação de leads sem retorno, tentativas, follow-up futuro, devolução ao vendedor original
  agenda.html            — Fase 4: agenda compartilhada (visão Dia e Lista 14 dias, filtro por vendedor, agendar reunião, conflito de horário, status e resultado pós-reunião)
  contratos.html         — Fase 5: kanban por etapa, ficha do contrato, cálculo automático de parcelas, catálogo de serviços cadastrados (cada um associado a um modelo de contrato), gerador de link do contrato, automação que cria/atualiza o Cliente ao assinar
  contratos-templates/eb2niw.html — modelo oficial do contrato EB-2 NIW (recuperado do sistema anterior contratos.legalway.group, corrigido um bug de HTML duplicado no final do arquivo original), pré-preenchido via parâmetros de URL, com assinatura digital
  contratos-templates/visto-t.html — modelo genérico "Service Agreement" (Visto T e demais serviços fora do EB-2 NIW), recuperado do Jotform (form 262437135425152) e adaptado pro mesmo padrão visual/funcional do EB-2 NIW — sem depender do Jotform pra gerar
  clientes.html           — Fase 5: lista de clientes + ficha 360° (Resumo/Comercial/Contratos/Financeiro/Documentos/Processos/Tarefas/Comunicação/Timeline)
  financeiro.html         — Fase 6: contas a receber (geradas automaticamente pelos contratos assinados), contas a pagar, inadimplência, fluxo de caixa, autorizações de protocolo
  documentos.html         — Fase 7: checklist por serviço, criado automaticamente ao assinar contrato, boas-vindas, follow-up de documentos, visibilidade financeira (valor contrato/pago/%), autorização financeira pra protocolar, acompanhamento pós-protocolo
  relatorios.html         — Fase 8: relatorios detalhados por area (Contas a Receber, Contas a Pagar, Fluxo de Caixa, Leads, Comercial, SDR, Documentos), mes ou acumulado, conversao de leads por vendedor, total por categoria/servico, exportar PDF
  marketing.html          — Fase 9: Meta Ads (via Windsor.ai) cruzado com Leads e Contratos - CPL, CAC, ROAS, visao diaria e mensal, exportar PDF. Dados reais importados em 14/09/2026 (snapshot, nao atualiza sozinho)
  assets/logo.png         — logo original enviado
  assets/logo-small.png   — versão 160x160 usada nas telas
  assets/favicon.png      — versão 64x64 usada como favicon
```

## Identidade visual

Cores extraídas do logo oficial (Legal Way Group):
- Navy: `#16204F`
- Magenta/roxo (acento): `#86285F`
- Papel/fundo: `#FAFAF8`
Tipografia: Fraunces (títulos) + IBM Plex Sans (interface).

## Status por módulo

| Módulo | Status |
|---|---|
| Entrada de Leads (Caixa de Entrada, Novos Leads, Assumir Lead, deduplicação, cadastro manual — Google Ads/Indicação/Outro) | 🟡 Em teste interno, dados simulados |
| Funil Comercial (kanban por etapa, ficha do lead, follow-up, saídas com motivo, alertas) | 🟡 Em teste interno, dados simulados |
| SDR (fila de recuperação, tentativas, follow-up, devolução ao vendedor, agendamento de reunião com fuso horário) | 🟡 Em teste interno, dados simulados |
| Agenda (visão Dia/Lista, filtro por vendedor, conflito de horário, status, resultado pós-reunião) | 🟡 Em teste interno, dados simulados |
| Contratos (kanban por etapa, cria Cliente automaticamente ao assinar) | 🟡 Em teste interno, dados simulados |
| Clientes (ficha 360°, criada automaticamente pelo Contratos) | 🟡 Em teste interno, dados simulados |
| Financeiro (contas a receber automáticas, contas a pagar, inadimplência, fluxo de caixa) | 🟡 Em teste interno, dados simulados |
| Documentação / Processos (checklist por serviço, boas-vindas, visibilidade financeira, gate de autorização, acompanhamento) | 🟡 Em teste interno, dados simulados |
| Relatórios (por área, mês ou acumulado, conversão por vendedor, categorias, exportar PDF) | 🟡 Em teste interno, dados simulados |
| Marketing (Meta Ads via Windsor.ai, CPL, CAC, ROAS) | 🟡 Em teste, dados reais importados em snapshot (não atualiza sozinho) |

## Fase de conexões reais (depois da validação interna)

Quando o fluxo de entrada estiver validado:
- Lead Ads (formulário nativo do Meta) → webhook de leadgen
- WhatsApp oficial → WhatsApp Cloud API (Meta) — já conectado, só falta ligar ao sistema
- Precisa de um backend rodando 24h para receber os webhooks (não dá com GitHub Pages sozinho) — decidir onde hospedar antes de subir
- Importante: a conexão nova roda **em paralelo** ao Kommo, sem desligar o que já está funcionando, até validação completa
