# Prompt para auditoria externa da migração

Copiar daqui para baixo e colar inteiro no ChatGPT (ou em qualquer outro
assistente). É autossuficiente: não depende de arquivo anexo nem de contexto.

**Não contém dado de cliente** — só números agregados. Se a auditoria pedir
amostra real, exportar à parte e avisar que é dado pessoal.

---

Você vai me ajudar a auditar a migração de dados de um escritório de imigração
que está trocando quatro sistemas antigos por um sistema próprio. A virada é
hoje. Quero que você procure buracos, não que me elogie.

## 1. A empresa

Legal Way Group — escritório de imigração nos Estados Unidos (Flórida), atende
brasileiros. Fuso America/New_York, moeda **USD**. Dois sócios, dois
vendedores principais (Renato e Adriano) mais três eventuais (Vitoria, Peterson
e uma parceria), um SDR e uma pessoa de documentação.

O serviço que domina é o **Visto T** (83% dos pedidos, 91% do faturamento).
Também vendem EB2-NIW, Asilo, Green Card por casamento, petição familiar,
cidadania, DS-160, FOIA, VAWA, SIJS, work permit, traduções e serviços avulsos.
São 21 serviços distintos, de US$ 100 a US$ 14.990.

## 2. O sistema novo

Feito sob medida. Stack deliberadamente simples:

- **Servidor**: Node 20+, Express 5, PostgreSQL. Dependências: `express`, `pg`,
  `bcryptjs`, `cookie-parser`, `nodemailer`, `ws`, `pdf-lib`. Só isso.
- **Telas**: HTML autocontido em `docs/`, uma página por módulo, sem build, sem
  framework. O JavaScript vive dentro do próprio arquivo.
- **Hospedagem**: Railway. Um banco e um serviço por escritório (arquitetura
  single-tenant — cada escritório é uma instalação separada).

### Como os dados são guardados

Quase tudo vive numa tabela `armazenamento`, modelo chave → bloco JSON, com
versão para controle de concorrência. Uma chave guarda uma lista inteira.

Principais chaves:

| Chave | O que é |
|---|---|
| `legalway-leads-v1` | entrada de leads (todo mundo que chegou) |
| `legalway-funil-v1` | funil comercial |
| `legalway-sdr-v1` | fila de recuperação do SDR |
| `legalway-clientes-v1` | clientes |
| `legalway-contratos-v1` | contratos |
| `legalway-financeiro-v1` | **contas a receber** (nome enganoso) |
| `legalway-contas-pagar-v1` | contas a pagar |
| `legalway-processos-documentacao-v1` | processos migratórios |
| `legalway-regras-v1` | configuração do escritório |
| `legalway-servicos-v1`, `legalway-tarefas-v1`, `legalway-agenda-v1`, `legalway-uscis-v1`, `legalway-marketing-*` | demais módulos |

Usuários, arquivos e mensagens de chat ficam em tabelas próprias.

### Backup e restauração

Formato `legalway-backup-v1`, um JSON com `{ formato, gerado, observacao,
armazenamento: [ { chave, valor } ] }`.

**Ponto crítico:** a restauração percorre `armazenamento` e grava cada bloco
**substituindo o conteúdo inteiro** da chave. Blocos ausentes do arquivo não são
tocados. Ou seja: importar em partes exige reemitir o acumulado, senão a etapa
seguinte apaga a anterior.

### Formatos dos registros

Contrato:
```
{ id, cliente, telefone, email, endereco, servico, vendedor,
  valor, sinal, entrada, numParcelas, dataPrimeiraParcela, recorrencia,
  pagamento, observacoes, etapa, dataEnvio, dataAssinatura, historico[] }
```
Etapas: `A gerar` → `Enviado` → `Assinado` | `Cancelado`.

Conta a receber:
```
{ id, contratoId, clienteNome, servico, vendedor, descricao, valor,
  vencimento, status, valorRecebido, dataRecebimento, formaPagamento,
  conta, observacao }
```
Status: `A vencer` | `Atrasado` | `Pago parcialmente` | `Pago`.

Conta a pagar: status `A vencer` | `Vencida` | `Pago`.

Funil: `Lead assumido · Tentativa de contato · Contato realizado ·
Qualificação · Reunião agendada · Reunião realizada · Proposta · Negociação ·
Ganho`.

Processos migratórios: `Protocolado · RFE recebido · Entrevista agendada ·
Concluído`.

### Automação que importa para a auditoria

Em `server/src/automacoes.js`, quando um contrato é confirmado como assinado o
servidor cria o cliente e **gera as parcelas automaticamente**. Ela só roda em
contrato cuja etapa ainda **não** é `Assinado` nem `Cancelado`, e só se existir
um registro de confirmação de assinatura. Contratos importados já marcados como
assinados ou cancelados, portanto, não disparam a geração.

### Integrações já ligadas

- **Meta/WhatsApp Cloud API**: um webhook recebe tanto `leadgen` (formulário do
  Facebook) quanto `messages` (WhatsApp). Assinatura conferida por HMAC
  `X-Hub-Signature-256` sobre o corpo bruto. O objeto `referral` identifica o
  anúncio de origem.
- **Caixa de entrada de WhatsApp** dentro do sistema, com o relógio da janela de
  24 horas do WhatsApp Business, resposta automática e mensagem de apresentação
  quando um vendedor assume o lead.

## 3. Os quatro sistemas antigos

| Sistema | O que guardava | Situação |
|---|---|---|
| **Kommo** (CRM) | funil de prospecção, conversas de WhatsApp | migrado; desliga hoje |
| **Bling** (ERP) | clientes que assinaram, contratos, financeiro | migrado hoje |
| **Jotform** | formulários e contratos | praticamente vazio |
| **Trello** | documentação dos processos | **ainda não migrado** |
| **Google Drive** | contratos assinados em PDF | **ainda não migrado** |

### Kommo

2.211 leads num único funil de 16 etapas. O WhatsApp da empresa está conectado
**através** do Kommo — desligar o Kommo antes de a integração Meta estar
testada derruba o canal.

### Bling

Fonte da verdade de quem assinou: o pedido de venda só é criado lá **depois**
que o cliente assina. Contém 233 pedidos, 2.810 parcelas a receber (até março
de 2029), 533 contas a pagar, 303 contatos, 6 contas bancárias (Truist EUA,
Wise USD, Investimento Truist, Nubank, C6 PIX BR, Caixa) e 13 formas de
pagamento (a principal é Stripe).

**Os valores no Bling aparecem com símbolo R$, mas são dólares.** Na migração
vão 1:1, sem conversão.

### Jotform

13 formulários (modelos de contrato e questionários de coleta), mas **só 1
submissão na conta inteira**. Os contratos assinados estão no Google Drive.

### Trello e Drive

Trello guarda o andamento da documentação de cada cliente. O Drive guarda os
contratos assinados, numa conta diferente da que temos acesso hoje. Nenhum dos
dois foi migrado ainda.

## 4. O que já foi feito

### Kommo → sistema (feito ontem)
1.178 pessoas no bloco de leads, 375 no funil, 793 na fila do SDR, depois de
juntar 318 telefones repetidos. Nenhuma das 1.918 anotações dos vendedores se
perdeu.

### Bling → sistema (arquivo pronto, ainda não subiu)
- 237 clientes (215 com telefone, 228 com e-mail)
- 233 contratos: **188 assinados e 45 cancelados**
- 2.810 contas a receber: 1.893 a vencer (US$ 645.277,67), 28 atrasadas
  (US$ 12.007,14), 889 pagas (US$ 311.322,72)
- 533 contas a pagar: 65 a vencer (US$ 148.606,08), 468 pagas (US$ 255.934,65)
- Receita contratada real: **US$ 953.876,60** (US$ 1.203.126,60 menos os
  cancelados)

Os totais foram conferidos centavo a centavo contra as telas do Bling.

## 5. As armadilhas já encontradas (e o tipo de coisa que quero que você cace)

Cada uma destas teria corrompido a migração em silêncio:

1. **O CSV de pedidos do Bling não tem a coluna "Situação".** Sem ela, 45
   pedidos cancelados (US$ 249.250) entravam como contrato assinado. A situação
   teve que ser buscada por outro caminho e conferida contra o filtro da tela.

2. **O Bling mistura dois formatos numéricos no mesmo registro**: o campo
   `valor` vem `"224,58"` (vírgula decimal) e o `valorPago` vem `"216.57"`
   (ponto decimal). Ler o segundo com a regra do primeiro fazia a soma dos
   recebidos dar 30 milhões.

3. **O `valorPago` é líquido**, já com a taxa do Stripe descontada. Usá-lo como
   valor recebido faria o sistema marcar tudo como "pago parcialmente".

4. **O telefone do cliente não está no campo "Celular" nem "Fone"** (13 e 0
   preenchidos de 303): está numa coluna chamada "Contatos", com 217. Sem isso
   o escritório estrearia o sistema sem conseguir ligar para o próprio cliente.

5. **Recortar telefone com expressão regular partia números pelo meio** —
   "(+61) 493-308256" virava "61) 493-3082".

6. **O Kommo guarda a mesma pessoa em dois cards**: um com e-mail e outro sem,
   mesmo telefone, nome levemente diferente, e normalmente é o card sem e-mail
   que está marcado como ganho. Eram 458 duplicados em 2.374.

7. **O exportador do Kommo ignora o filtro aplicado**: filtrando "ganhos" (78 na
   tela) o CSV saía com os 1.498 ativos, nenhum ganho.

8. **O filtro padrão do Kommo esconde os fechados** — 78 ganhos e 635 perdidos
   não apareciam e quase ficaram de fora.

9. **Cliente que já assinou continuava no funil e na fila do SDR** — 22 pessoas.
   Sem corrigir, a equipe estrearia o sistema ligando para quem já pagou.

10. **Quem tem só contrato cancelado não pode sair do funil**: é lead legítimo e
    voltar para o comercial é o certo.

11. **O cadastro do Bling junta cliente e fornecedor na mesma lista**; 67
    contatos sem contrato nem parcela ficaram de fora dos clientes.

## 6. Buracos conhecidos que ainda não têm resposta

- **Taxa de gateway**: o Stripe cobra 2,9% + US$ 0,30 por parcela, cerca de
  **US$ 25 mil** no total. O sistema ainda não tem campo de taxa e lança o valor
  cheio como recebido — o DRE está inflando o lucro nesse valor. Os dados vão
  guardados em `taxaPercentual`, `taxaFixa` e `valorLiquido`, mas nenhuma tela
  os usa ainda.
- **204 parcelas sem pedido de origem** (de 2.810): entram como avulsas.
- **Só 43 dos 225 clientes do Bling existem no Kommo.** 75% da carteira fechou
  fora do CRM. A chave de cruzamento que funciona é o e-mail; telefone não serve
  porque o Bling quase não tem.
- **36 leads marcados "ganho" no Kommo nunca viraram contrato assinado** — aceite
  verbal que não fechou. Dois com anotação explícita de valor fechado, parados
  há mais de 45 dias. Hoje não estão em lugar nenhum: saíram do funil e nunca
  chegaram ao financeiro.
- **Trello e Drive não migrados.**
- Funcionalidades que o ERP antigo tinha e o sistema não: transferência entre
  contas bancárias, lançamento direto no extrato, conciliação bancária.

## 7. O que eu quero de você

Audite o plano de virada de hoje e me diga **o que pode dar errado**. Em
particular:

1. **Ordem das operações.** O WhatsApp passa por dentro do Kommo. Que
   sequência garante que nenhuma mensagem de cliente se perca na troca?

2. **Integridade da importação.** Que conferências eu deveria rodar além de
   bater os totais? Que tipo de erro passa por uma conferência de somatório?

3. **Reversibilidade.** Se a importação sair errada depois que a equipe já
   trabalhou algumas horas no sistema, como volto sem perder o trabalho do dia?
   Lembre que a restauração substitui blocos inteiros.

4. **O primeiro dia da equipe.** Que situações constrangedoras ou perigosas
   podem acontecer na segunda-feira? Já achei uma (ligar para quem já é
   cliente). O que mais?

5. **O que eu não estou vendo.** Olhe a lista de armadilhas da seção 5 e me diga
   que categorias parecidas eu provavelmente ainda não investiguei.

6. **Trello e Drive.** Que riscos existem em deixá-los para depois, e qual a
   ordem certa de trazê-los.

Seja específico e direto. Se achar que alguma decisão descrita aqui está errada,
diga qual e por quê. Prefiro uma crítica dura hoje a uma surpresa na segunda.
