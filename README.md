# Legal Way Group — Sistema Integrado

Sistema operacional próprio da Legal Way Group, construído módulo a módulo seguindo o fluxo:

MARKETING → WHATSAPP OFICIAL → LEAD → COMERCIAL → SDR → AGENDA → REUNIÃO → PROPOSTA → CONTRATO → CLIENTE → FINANCEIRO + DOCUMENTAÇÃO/PROCESSOS → PROTOCOLO → ACOMPANHAMENTO

## Primeiro contato automático

`server/src/primeiro-contato.js` (roda nas automações; gatilho ao gravar `legalway-leads-v1`): lead sem `responsavel` e sem `primeiroContato` → regra por origem em `regras.leads.primeiroContato` (`atribuir`, `agendarLigacao`, `mensagemAutomatica`, valores "sim"/"nao"). Com `regras.leads.distribuicao` ≠ `manual`, escolhe entre os vendedores de `regras.agenda.disponibilidade` (linhas `{vendedor, dias:'seg,...,dom', inicio, fim}`, só usuários ativos) o primeiro horário livre (a partir de agora + `leads.antecedenciaMin`, no fuso `agenda.fusoHorario`, passo/duração `agenda.duracaoLigacaoMin`, sem conflito com a agenda) — empate no mesmo dia: menor carga do dia, ou rodízio. Cria evento na agenda (`origem:'Primeiro contato automático'`, `leadId`), entrada no funil com `proximaAcao`, tarefa da janela de 24h (`origem:'primeiro-contato'`) enquanto o WhatsApp oficial não está conectado, e DM ao vendedor. Marca `lead.primeiroContato = {status, vendedor, data, hora}`.

## Portal do cliente

`server/src/portal-cliente.js` + `docs/portal-cliente.html` (página pública). Tabelas `portal_clientes` (um acesso por processo: e-mail único, bcrypt, `trocar_senha`, `ativo`) e `sessoes_portal` (cookie `lw_cliente`, httpOnly, 30 dias) — migração `007_portal_cliente.sql`. Rotas do cliente: `POST /api/portal/login|logout|senha`, `GET /api/portal/eu`, `POST /api/portal/documento` (data URI → `arquivos`, marca o item como Recebido, histórico + aviso no chat). Rotas da equipe (exigem editar em Documentação): `GET/POST /api/portal-acessos/:processoId`, `POST /api/portal-acessos/:processoId/ativo` — a senha temporária só aparece uma vez, na resposta do POST. O que o cliente vê sai de `regras.portal` (`ativo`, `permitirEnvio`, `mostrarUscis`, `mostrarFinanceiro`, `aviso`, `mensagemConvite`). Cada documento do checklist tem `dica` (orientação mostrada ao cliente), editável em Configurações e pré-preenchida pela biblioteca (`DICAS_DOCUMENTOS` em `biblioteca-vistos.js`, foco nos vistos EB). Status do USCIS é traduzido pro português na própria página.

## Modelos de contrato editáveis

`regras.contratos.modelos[]` = `{chave, nome, titulo, clausulas:[{titulo, texto}]}`, editável em Configurações → Modelos de contrato. `docs/contratos-templates/modelo.html` monta o contrato com essas cláusulas (busca em `GET /api/publico/regras`, que agora devolve `contratos.modelos`), trocando `{cliente} {servico} {valor} {entrada} {parcelas} {empresa} {endereco} {email} {telefone} {data}`; linha iniciada por "- " vira `<li>`. Mesmo fluxo de assinatura/certificado dos outros modelos (sem EmailJS). O serviço aponta para `modelo.html?modelo=<chave>` na lista de modelos de Configurações → Serviços.

## Avisos para o cliente

`server/src/avisos-cliente.js`: guarda o aviso em `processo.avisosCliente[]` (aparece no Portal do Cliente) e manda por e-mail quando `SMTP_*` está configurado (`URL_PUBLICA` entra no link do portal). Disparos: documento aprovado/recusado (`POST /api/avisos-cliente/:processoId`, chamado pela tela de Documentação), mudança de status no USCIS (`avisarClienteUscis`, via uscis.js) e parcela chegando (`avisosDeParcela`, nas automações, com `regras.portal.avisarCliente.diasAntesParcela`). Cada tipo liga/desliga em `regras.portal.avisarCliente`.

## Prazos do caso

`server/src/prazos.js`: cada processo tem `prazos: [{id, tipo, data, obs, concluidoEm, avisadoEm}]`. Tipos, prazo padrão em dias e antecedência do aviso ficam em `regras.documentos.prazos`. `conferirPrazos` (nas automações, 1×/dia por prazo) avisa no canal `documentacao` + DM do responsável e cria tarefa (`origem:'prazo'`, `prazoId`) quando entra na janela ou vence. `novoPrazo()` é chamado por `uscis.js` quando o status vira RFE/NOID (data = carta + dias do tipo). Tela: aba "⏰ Prazos" no processo; cartão do kanban mostra o mais próximo; Dashboard tem o bloco "Prazos dos casos" (visão geral e documentação).

## Acompanhamento no USCIS

`server/src/uscis.js`: consulta a **Case Status API** oficial (developer.uscis.gov) para cada processo com `protocolo.recibo` (13 chars, `^[A-Z]{3}\d{10}$`), uma vez por dia (`varrerUscis`, dentro das automações) e sob demanda (`POST /api/uscis/consultar/:processoId`, exige editar em Documentação). Resultado fica em `processo.uscis` (`status`, `descricao`, `atualizadoEm`, `historico[]`, `consultadoEm`, `mudouEm`, `erro`); mudança de status → histórico do processo, aviso no canal `documentacao` + DM do responsável, e tarefa (`origem:'uscis'`) para RFE/NOID/biometria/entrevista/negativa. Estado da varredura em `legalway-uscis-v1`. `GET /api/uscis/estado` diz se está configurado.

Variáveis: `USCIS_CLIENT_ID`, `USCIS_CLIENT_SECRET`, `USCIS_AMBIENTE` (`sandbox` padrão → `api-int.uscis.gov`; `producao` → `api.uscis.gov`). Sem as chaves, a tela avisa e nada quebra. Não usa login/senha do cliente: só o recibo.

## Padrão do projeto

Segue o mesmo padrão dos outros sistemas (Vitrine Orlando / Repasse, legalway-contratos):
- Cada tela é um arquivo HTML autocontido dentro de `docs/` (HTML + CSS + JS no mesmo arquivo, sem build step)
- Persistência de dados: durante a fase de testes, usando storage do próprio ambiente de protótipo; na fase 2 (produção), conecta em backend real
- Sem necessidade de terminal/código no dia a dia — cada tela tem os controles necessários na própria interface

**Fase atual: fase 2 concluída** — sistema inteiro rodando no servidor (Railway + Postgres), dados e arquivos compartilhados entre computadores. Ver seção "Fase 2" abaixo.
Quando o fluxo completo estiver validado internamente, sobe para um **servidor rodando 24/7** (não dá pra ser só GitHub Pages/hospedagem estática, porque o sistema vai precisar receber webhooks do Meta em tempo real — Lead Ads e WhatsApp Cloud API). Decisão de qual servidor/hospedagem fica pra quando chegar essa fase.

## Fase 2 — servidor real (em andamento)

A partir do piloto da fase 2, o sistema roda em um **servidor Node.js com banco Postgres**, hospedado no Railway: **https://legalway-sistema-production.up.railway.app** (deploy automático a cada push na branch `master`). O servidor fica em `server/` e serve as telas de `docs/` como arquivos estáticos — as telas continuam sendo HTML autocontido, sem build step.

**Tudo migrado pro servidor (2026-09-17):**
- `login.html`, `chat.html`, `usuarios.html` — tabelas próprias (`usuarios`, `sessoes`, `chat_*`); ver piloto acima
- **Todos os outros módulos** (Leads, Funil, SDR, Agenda, Contratos, Clientes, Financeiro, Documentação, Processos, Tarefas, Marketing, Relatórios, Automações, Configurações) — continuam com o mesmo código, mas o `window.storage` que eles usam agora é o `docs/assets/storage.js`, que grava na tabela `armazenamento` (uma chave → um bloco JSON, com versão). Chaves privadas (`shared=false`: sessão, "lidas", preferências) seguem no localStorage.
- **Arquivos** (documentos, comprovantes, traduções, laudos, PDF assinado): o servidor extrai qualquer base64 grande (>2 KB) do JSON pra tabela `arquivos` e deixa no lugar um link `/api/arquivos/<id>` (id aleatório de 32 hex — o link é a chave de acesso; servido com `Content-Security-Policy: sandbox` e `nosniff`).
- **Edição simultânea**: cada salvamento manda a versão que a tela leu; se outra pessoa salvou antes, o servidor mescla em 3 vias por `id` (o que eu mudei vence; o que eu não toquei fica como o outro deixou). Histórico das últimas 30 versões por chave em `armazenamento_hist`.
- **Tempo real**: quando alguém salva, as telas abertas dos outros recebem aviso por WebSocket e recarregam (`loadAll()` + `render()`), a menos que haja um modal aberto.
- **Páginas públicas** (contrato que o cliente assina, Portal do Prestador): o link leva um token `t=` emitido por `POST /api/publico/token` (idempotente por contrato/processo, 90 dias). O mesmo `storage.js` detecta o token e usa `/api/publico/storage/...`, que só enxerga a fatia daquele contrato/processo. O token de assinatura morre depois de usado.
- **Backup**: Configurações → "Baixar backup completo" (`GET /api/backup`, só acesso total) gera um .json com dados, arquivos, usuários e chat; "Restaurar de um backup" (`POST /api/backup/restaurar`) coloca de volta sem apagar o que existe. Além disso, `armazenamento_hist` guarda as últimas 30 versões de cada bloco.
- **Assinatura eletrônica com pacote de prova** (E-SIGN Act / UETA), nos 3 modelos de contrato: nome completo digitado + aceite dos termos + consentimento explícito de assinatura eletrônica + assinatura desenhada. O modelo manda tudo pra `POST /api/publico/assinatura?t=` (`storage.registrarAssinatura`), o servidor registra IP, navegador e hora do servidor, calcula SHA-256 do PDF e dos termos, anexa uma **página de certificado** ao PDF (pdf-lib), guarda tudo na tabela `assinaturas` (gatilho impede UPDATE/DELETE), grava a confirmação que o painel de Contratos já lia, avisa no #vendas e, se o SMTP estiver configurado, manda o PDF pro cliente. `verificar.html` (pública) confere um PDF pelo hash (`GET /api/publico/verificar?hash=`). Bug antigo corrigido junto: os modelos usavam `html2pdf` sem carregar a biblioteca — nenhum PDF era gerado.
- **E-mail pelo servidor**: `server/src/email.js` (nodemailer). Variáveis no Railway: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_DE`. Sem elas, os envios só aparecem no log.
- **Permissões no servidor** (`server/src/permissoes.js`): cada chave de dados pertence a módulos; ler exige `visualizar`, gravar exige `editar` (acesso total passa; chave desconhecida só acesso total). **Sanitização** (`sanitizar.js`): tags HTML, `javascript:` e `on*=` são removidos de todo texto que entra (storage, importação, portal, assinatura, chat).
- **Automações no servidor** (`server/src/automacoes.js`): confirmação de assinatura → contrato Assinado + cliente + contas a receber; contrato assinado → processo de Documentação; autorização financeira → "Liberado para protocolo"; comissão do SDR; contas vencidas → "Atrasado". Rodam na inicialização, a cada minuto e 1,5 s depois de gravações relevantes. As versões nas telas continuam (são idempotentes).
- **Auditoria por registro** (`server/src/auditoria.js`, tabela `auditoria`): cada gravação é comparada com a anterior item a item (criado/alterado/removido, campos e valores). `auditoria.html` (link em Configurações) mostra, filtrado pelas permissões de quem vê.
## Produto: uma instalação por escritório

O mesmo código serve qualquer escritório de imigração. Pra criar um novo: projeto no Railway apontando pra este repositório + plugin Postgres + `DATABASE_URL` + domínio. Na primeira abertura, o sistema detecta que não há usuários e leva pra **`primeiro-acesso.html`** (escritório, administrador, serviços da biblioteca). Nada da Legal Way entra por padrão: os 7 usuários iniciais só são criados com `SEED_LEGALWAY=1`, e as telas não criam mais dados de exemplo em módulos vazios (os botões "+ de teste" continuam pra demonstração).

- **Regras do escritório** (`server/src/regras.js`, `REGRAS_PADRAO` = Legal Way; overrides na chave `legalway-regras-v1`; tela Configurações → ⚙ Regras). Telas leem `LW.regras()`, automações leem `obterRegras()`. Inclui marca (nome, sigla, frase, endereço, contatos, logo) aplicada em menu, login, títulos, modelos de contrato e certificado de assinatura.
- **Biblioteca de vistos** (`server/src/biblioteca-vistos.js`, 20 serviços com checklist) — usada no primeiro acesso e em Configurações → Serviços → "Adicionar da biblioteca".
- **Blocos personalizáveis por usuário** (`data-bloco`, botão ⚙ no cabeçalho, preferência em `legalway-pref-<usuario>-v1`).
- Ainda fixo (próximos passos do produto): fluxos de tradutor/psicóloga na Documentação (tipos de prestador extras ainda não têm fluxo próprio); aba "Dados da empresa" antiga coexiste com Regras → Empresa.

- **Código comum** (`assets/comum.js`): ICONS, svgIcon, renderSidebar, renderTopbarUser, aplicarSomenteLeitura, badge do chat, fmtTime, hoje, toast (6 s, fecha ao clicar), menu ☰ do celular, barra de carregando, confirmação com senha, visão kanban/lista (`LW.visao`, `LW.toggleVisao`, `LW.tabelaLista`). As telas não têm mais cópias dessas funções.
- **Pré-carga** (`storage.js`): cada tela pede numa chamada só (`GET /api/storage-lote?chaves=`) todas as chaves que vai ler ao abrir; o mapa tela→chaves está no próprio `storage.js` (atualize se uma tela passar a ler uma chave nova).
- **Avisos diários no chat** (automações): resumo do Financeiro em #financeiro (vence hoje / 3 dias / atrasadas) e mensagem direta pra cada vendedor (follow-ups atrasados, leads sem contato há N dias — `diasLeadParado` em Automações).
- **Manual dentro do sistema**: `ajuda.html` (link "Como usar" no fim do menu de todas as telas, injetado pelo `comum.js`), com busca. **Confirmação por senha** (`LW.confirmarComSenha`, `POST /api/confirmar-senha`) em toda ação sem volta, registrada na auditoria. **Tarefas recorrentes** e lembrete do dia por mensagem direta do "Sistema" no chat.
- **Chat com anexos**: imagem, PDF, Word/Excel ou ZIP até 25 MB (`arquivo: {nome, conteudo}` no `POST /api/chat/mensagens`; colunas `arquivo_*` em `chat_mensagens`). Imagem aparece na conversa; o resto vira link.
- **Portal do Prestador — tradução**: a tradutora sobe **um arquivo com todas as traduções** (pode mais de um, até 40 MB cada); a Documentação lista os arquivos recebidos.
- **Avisos automáticos**: quando um contrato é assinado pelo link, o usuário "Sistema" posta no canal #vendas do chat. A Jotform foi removida dos modelos de contrato (2026-09-17); o e-mail pelo EmailJS continua.
- **Arquivos órfãos** (não referenciados por nenhum bloco nem pelo histórico, com mais de 1 dia) são apagados uma vez por dia.
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

Um serviço Node apontando pra raiz do repositório + um plugin Postgres no mesmo projeto. As configurações do serviço ficam no painel do Railway (Settings → Deploy): start command `npm start`, healthcheck `/api/saude`, reinício on-failure com 5 tentativas (o antigo `railway.json` foi descontinuado pelo Railway). O Railway injeta `DATABASE_URL` e `PORT` sozinho. Deploy automático a cada push na branch principal do GitHub. As senhas temporárias iniciais aparecem uma vez nos logs do deploy.

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
