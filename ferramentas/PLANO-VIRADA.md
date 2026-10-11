# Plano de virada — Legal Way

Escrito em 11/10/2026. A equipe começa a usar o sistema na segunda, 13/10.

Quem faz o quê está marcado: **[Tati]** precisa de você, **[Claude]** eu faço.

---

## A regra que manda em tudo

**O WhatsApp da empresa está conectado através do Kommo.** Desligar o Kommo
antes de a integração com a Meta estar funcionando derruba o canal de entrada
de clientes.

Ordem obrigatória: **configurar a Meta → testar → só então desligar o Kommo.**
E o Kommo fica ligado até o fim de segunda, como rede de segurança.

---

## Estado de hoje, conferido

| | |
|---|---|
| Sistema no ar | ✅ Railway, com os leads do Kommo dentro |
| Kommo importado | ✅ 1.178 leads · 375 funil · 793 SDR |
| Bling extraído e conferido | ✅ arquivo pronto, **ainda não subiu** |
| **Integração Meta** | ❌ **nenhuma das 5 variáveis configurada** |
| Trello | ❌ não migrado |
| Drive (contratos assinados) | ❌ não migrado |

O sistema hoje tem o funil, mas **nenhum cliente pagante** — eles estão todos no
arquivo do Bling esperando subir.

---

## BLOCO 1 — Subir o Bling  ·  ~20 min  ·  pode ser agora

Independente de tudo. Nada aqui afeta WhatsApp nem Kommo.

1. **[Tati]** Configurações → **Backup** → gerar e guardar. É a volta se der errado.
2. **[Tati]** Configurações → **Restaurar de um backup** → `importar-bling-completo.json`.
3. **[Tati]** Conferir as três telas e comparar com o quadro abaixo.

| Tela | O que tem que aparecer |
|---|---|
| Clientes | **237** |
| Contratos | **233** — sendo 188 assinados e 45 cancelados |
| Financeiro → a receber | **2.810** parcelas · US$ 645.277,67 a vencer · US$ 311.322,72 recebido |
| Financeiro → a pagar | **533** · US$ 148.606,08 em aberto |

**Se algum número destoar:** não mexa em nada, me diga qual. Conserto e geramos
de novo. Se já tiver virado bagunça, restaure o backup do passo 1.

**O que muda no funil:** 22 pessoas saem da entrada de leads, do funil e da fila
do SDR porque já são clientes. Isso é proposital — sem isso a equipe liga na
segunda oferecendo serviço para quem já pagou.

---

## BLOCO 2 — Ligar a Meta  ·  ~1 h  ·  o mais importante do dia

Sem isso, na segunda nenhum lead novo entra sozinho.

### 2.1 As cinco variáveis **[Tati]**

No Railway → serviço do sistema → **Variables**. Nunca por chat, nunca em
arquivo do projeto.

| Variável | Onde encontrar |
|---|---|
| `META_VERIFY_TOKEN` | você inventa uma senha qualquer; vai repetir no painel da Meta |
| `META_APP_SECRET` | Meta for Developers → seu app → Configurações → Básico |
| `META_PAGE_TOKEN` | token de acesso da página do Facebook, com permissão de leads e mensagens |
| `META_FORMULARIOS` | os ids dos formulários de lead que vocês usam |
| `WHATSAPP_PHONE_ID` | o Phone Number ID do WhatsApp Business |

Depois de salvar, o Railway reinicia sozinho.

### 2.2 Conferir que entrou **[Claude]**

Abro `/api/publico/meta/estado` e confirmo que os cinco viraram `true`. Esse
endereço só diz sim/não — não mostra nenhuma chave.

Hoje está assim:
```
verificacao: false · assinatura: false · tokenPagina: false
formularios: 0 · whatsapp: false
```

### 2.3 Apontar o webhook na Meta **[Tati]**

No painel do app → Webhooks:

- URL: `https://legalway-sistema-production.up.railway.app/api/publico/meta/leads`
- Token de verificação: o mesmo `META_VERIFY_TOKEN`
- Assinar os campos **`leadgen`** e **`messages`**

### 2.4 Testar de verdade **[Tati + Claude]**

Dois testes, com dado real:

1. Preencher um formulário de teste no Facebook → tem que aparecer na entrada
   de leads em segundos.
2. Mandar uma mensagem de WhatsApp de um número que não é da equipe → tem que
   aparecer na caixa de entrada, e a resposta automática tem que chegar.

**Enquanto esses dois testes não passarem, o Kommo não desliga.**

---

## BLOCO 3 — Pegar os leads novos do Kommo  ·  ~15 min  ·  depois do bloco 2

Entre a exportação de ontem e agora, entraram leads novos no Kommo.

1. **[Claude]** Puxo do Kommo o que entrou depois do último lead importado.
2. **[Claude]** Gero o arquivo só com os novos.
3. **[Tati]** Backup → restaurar.

Fazer **por último**, logo antes de desligar o Kommo, para não precisar repetir.

---

## BLOCO 4 — Configuração do escritório  ·  ~30 min

Coisas pequenas que fazem diferença no primeiro dia.

**[Claude]** — eu preparo e você aprova:
- **Serviços**: hoje o funil lista 3 ('EB-2 NIW', 'Visto T', 'Green Card
  familiar'), com um comentário no código dizendo que a lista é provisória. Vão
  virar os **21 reais com preço de tabela**, com o Visto T em primeiro — é 83%
  dos pedidos.
- **Vendedores**: incluir Vitoria, Peterson e a Parceria Luzia. Hoje só há dois.
- **Contas bancárias**: incluir C6 PIX BR, Nubank, Investimento Truist e Caixa.
- **Formas de pagamento**: incluir Square e Pix.

**[Tati]**:
- Subir a **logo** da empresa (hoje está vazia).
- Conferir se o endereço e o telefone nas Regras estão certos.
- Conferir se cada pessoa da equipe tem usuário e a permissão certa.

---

## BLOCO 5 — Desligar o Kommo  ·  só depois de 2, 3 e 4

1. **[Tati]** Confirmar que os dois testes do bloco 2.4 passaram.
2. **[Tati]** Desconectar o WhatsApp do Kommo e conectar na Meta.
3. **[Tati]** Mandar uma mensagem de teste pelo WhatsApp e ver cair no sistema.
4. **[Tati]** Deixar a conta do Kommo **ativa e paga** até o fim de segunda.
   Não cancelar ainda.

---

## SEGUNDA, 13/10 — o primeiro dia

### Antes de a equipe chegar **[Tati]**
Briefing de 15 minutos. Três frases que importam:
- O Kommo não é mais usado. Tudo acontece no sistema.
- Se um lead não aparecer, avisa na hora — não volta pro Kommo escondido.
- Cliente que já assinou está em **Clientes**, não no funil.

### O que vigiar no primeiro dia
- Lead novo chegando sozinho na entrada.
- Mensagem de WhatsApp caindo na caixa de entrada.
- O vendedor consegue assumir o lead e a mensagem de apresentação sai.
- Ninguém reclamando de cliente que já pagou aparecendo como lead.

### Se der errado
O Kommo ainda está ligado. Volta para ele, me avisa, e a gente conserta sem
pressa. Não é vergonha nenhuma — é para isso que ele ficou ligado.

---

## DEPOIS DA VIRADA

Em ordem de urgência.

### 1. A taxa do Stripe — é correção, não melhoria
O Stripe cobra 2,9% + US$ 0,30 por parcela: cerca de **US$ 25 mil**. O sistema
lança o valor cheio como recebido, então **o DRE está mostrando US$ 25 mil de
lucro que não existe**. Os dados já vão guardados em cada parcela
(`taxaPercentual`, `taxaFixa`, `valorLiquido`) — falta a tela usar.

### 2. Trello → documentação
É o andamento de cada processo. Enquanto não vier, a pessoa de documentação
trabalha em dois lugares. **[Tati]** abre o board no Chrome e eu levanto.

### 3. Drive → contratos assinados
Não precisa mover os PDFs: basta a lista de nome + link, e cada ficha ganha o
botão "ver contrato assinado". **[Tati]** compartilha a pasta da conta
`legalwayeua@gmail.com` com o seu e-mail principal.

### 4. Os 36 "ganhos" que sumiram no vão
Leads que o vendedor marcou como ganho e nunca assinaram contrato. Saíram do
funil e nunca chegaram ao financeiro — hoje não estão em lugar nenhum. Dois têm
anotação de valor fechado e estão parados há mais de 45 dias. Lugar certo no
sistema: contrato na etapa **"A gerar"**.

### 5. As 204 parcelas sem pedido de origem
De 2.810. Entram como avulsas. Decidir caso a caso o que são.

### 6. Buracos do financeiro
Transferência entre contas (hoje viraria despesa falsa), lançamento direto no
extrato, conciliação bancária.

---

## O que pode dar errado, e o que fazer

| Risco | Como evitar | Se acontecer |
|---|---|---|
| Desligar o Kommo antes da Meta funcionar | ordem dos blocos | reconectar o WhatsApp no Kommo |
| Importação com número errado | conferir o quadro do bloco 1 | restaurar o backup |
| Perder o trabalho do dia ao restaurar | **a restauração substitui o bloco inteiro** | backup antes de cada restauração, sempre |
| Vendedor ligar para quem já é cliente | as 22 saídas do funil no bloco 1 | tirar na mão e me avisar |
| Lead sumir na troca | Kommo ligado até o fim de segunda | conferir no Kommo e importar o que faltou |
| Equipe voltar escondido pro Kommo | combinar no briefing que avisa na hora | — |

---

## Resumo do dia

```
agora      BLOCO 1   subir o Bling              [Tati]   20 min
depois     BLOCO 2   ligar e testar a Meta      [Tati]    1 h     ← o crítico
depois     BLOCO 4   configuração do escritório [os dois] 30 min
por último BLOCO 3   leads novos do Kommo       [Claude]  15 min
fim        BLOCO 5   desligar o Kommo           [Tati]    15 min
```

Se o dia apertar, o que **não pode** ficar para depois é o **bloco 2**. Sem ele,
na segunda ninguém recebe lead.

O bloco 1 pode ir para domingo. O bloco 4 pode ir para segunda de manhã.
