# Migração do Bling — levantamento feito na conta real

Levantado em 10/10/2026, direto na conta LEGALWAY do Bling. Os arquivos extraídos
estão em `ferramentas/planilhas/bling/` (pasta no `.gitignore` — é dado de cliente).

## A descoberta que muda o plano

O Bling e o Kommo são **duas bases quase sem interseção**.

| | Kommo (já importado) | Bling |
|---|---|---|
| O que é | funil de prospecção | carteira de clientes fechados |
| Pessoas | 1.178 leads | 303 contatos / 222 clientes com parcela |
| Telefone | 1.135 de 1.178 | **13 de 303** |
| E-mail | 726 de 1.178 | 238 de 303 |

Cruzando as duas bases: **17 pessoas em comum, de 303** — todas por e-mail, nenhuma
por telefone (o Bling quase não tem telefone cadastrado).

A razão fica clara olhando as etapas que vieram do Kommo: Tentativa de contato,
Contato realizado, Qualificação, Proposta, Negociação. **Nenhuma etapa de ganho.**
Quem fechou saiu do funil e foi para o Bling; nunca esteve na exportação que
importamos.

**Consequência prática:** hoje o sistema tem o funil, mas não tem *nenhum cliente
pagante*. A migração do Bling não é um "merge" — é a entrada da carteira inteira.
Cerca de 225 pessoas novas, mais 17 que já existem e precisam ser costuradas.

## O que existe no Bling

### Pedidos de venda = os contratos vendidos
233 pedidos, **US$ 1.203.126,60**, de 02/12/2025 a 07/10/2026.

Por serviço:

| Qtd | Total | Serviço |
|---:|---:|---|
| 193 | 1.097.276,62 | **Visto T** |
| 8 | 6.500,00 | MOTION |
| 7 | 4.130,00 | WORK PERMIT E SOCIAL |
| 6 | 3.980,00 | F1 - Estudante |
| 5 | 4.170,00 | Extensão de Turista |
| 4 | 15.250,00 | GreenCard Casamento |
| 4 | 12.000,00 | Asilo |
| 3 | 750,00 | Renovação de Passaporte |
| 2 | 32.999,98 | EB2-NIW |
| 2 | 7.500,00 | Petição Familiar |
| 2 | 5.800,00 | SIJS |
| 2 | 1.800,00 | Suplemento B |
| 2 | 1.000,00 | Mudança de Endereço |
| 2 | 790,00 | Mudança de Corte |
| 1 | 4.000,00 | VAWA |
| 1 | 2.490,00 | FOIA |
| 1 | 1.200,00 | Cidadania Americana |
| 1 | 1.000,00 | DS-160 |
| 1 | 250,00 | Tradução de Documentos |
| 1 | 140,00 | Tradução dos documentos |
| 1 | 100,00 | 2ª Via Título de Eleitor |

**O Visto T é 83% dos pedidos e 91% do faturamento.** O sistema hoje trata EB-2 NIW
como o carro-chefe (`SERVICOS_CONHECIDOS` em `docs/funil-comercial.html` lista
só 'EB-2 NIW', 'Visto T', 'Green Card familiar', com o comentário "lista provisória").
Isso precisa inverter.

Por vendedor: Renato 139, Adriano 91, Vitoria 16, Parceria Luzia 1, Peterson 1.
São **cinco**, não dois.

Repare também: "Tradução de Documentos" e "Tradução dos documentos" são o mesmo
serviço cadastrado duas vezes. Normalizar na importação.

### Contas a receber
2.810 parcelas — 1.921 em aberto (657.284,81) e 889 recebidas (305.603,63).
Vencimentos de 02/12/2025 até **10/03/2029**.

2.606 parcelas carregam `"Ref. ao pedido de venda nº N"` nas observações, ligando a
218 pedidos. **204 parcelas são avulsas**, sem pedido de origem — precisam de uma
decisão caso a caso.

### Contas a pagar
533 lançamentos — 65 em aberto (148.606,08) e 468 pagos (255.934,65).
60 fornecedores. Os mais frequentes: USPS Correio (78), Tradução de Documentos –
Camila (67), Taxas WISE (34), Leticia B E Silva Psicóloga BR (25), Sousa & Morin LLC
(20), Reinehr LLC (20), Vika Services LLC (20), Stripe – Taxa Extra (18).

**Todos os 533 estão sem categoria.** Boa parte é custo atribuível a um processo
específico (correio, tradução, avaliação psicológica) — no nosso sistema isso tem
lugar: `regras.financeiro.categoriaPrestadores`.

### Catálogo e configuração
14 serviços com preço de tabela, 6 contas financeiras (Caixa, C6 PIX BR,
INVESTIMENTO TRUIST, Nubank, TRUIST - EUA, WISE USD) e 13 formas de pagamento
(Stripe Recebimentos, Zelle, Pix, Cheque, Cartão de Débito, Boleto, Boleto Nubank,
Depósito Nubank, Dinheiro, Cobrança automática Square, Crediário, Transferências
entre Contas, Vale-Troca).

Nossas regras hoje têm 5 contas (Truist, Stripe, Zelle, Wise, Dinheiro) — faltam
quatro.

## Como os dados saíram

Contatos, pedidos e produtos: botão nativo "Exportar para planilha".

Contas a receber e a pagar **não têm export na interface**, e os relatórios
financeiros só cobrem o que já foi pago — justamente a parte menos importante.
Saíram pela sessão autenticada do próprio navegador:

- receber: `GET /Api/v3/contas/receber/list` com o cabeçalho `x-api-revision: 3.1.0`,
  paginado de 100 em 100, `tipoPeriodo` em `emAberto` e `pagamento`.
- pagar: `POST /services/contas.pagar.server.php?f=listarContasPagar` (xajax legado),
  mesmos parâmetros dentro de um objeto XML em `xajaxargs[]`.

Tentei mandar direto para o disco com um receptor HTTP local, mas o Chrome bloqueia
requisição de site público para a máquina do usuário (Private Network Access) e não
há contorno que não seja mexer na segurança do navegador. O caminho foi download.

## Mapeamento para o sistema

| Bling | Sistema |
|---|---|
| Pedido de venda | `legalway-contratos-v1` |
| Conta a receber | `legalway-financeiro-v1` |
| Conta a pagar | `legalway-contas-pagar-v1` |
| Contato | `legalway-clientes-v1` |
| Portador | `regras.financeiro.contas` |
| Produto | lista de serviços + tabela de preço |

A estrutura bate quase campo a campo. O pedido tem cliente, vendedor, serviço, preço
de lista, desconto e condição de pagamento (`0 32 62 93 124 152` = 6 parcelas);
o contrato no sistema tem `cliente, vendedor, servico, valor, entrada, numParcelas,
recorrencia`. As parcelas nascem em `contasDoContrato` (server/src/automacoes.js).

**Atenção na importação:** o contrato importado não pode disparar a geração
automática de parcelas, senão duplica — as parcelas reais vêm do Bling, com o
histórico de quem já pagou.

### A chave de junção
Para os 17 que existem nas duas bases: **e-mail**, normalizado em minúsculas.
Telefone não serve aqui (o Bling tem 13 de 303).

Para ligar parcela → contrato: o número em `"Ref. ao pedido de venda nº N"`.

Os valores estão em dólar, mesmo o Bling rotulando com R$. Vão 1:1, sem conversão.

## O que falta no nosso financeiro

1. **Taxa de gateway.** O Stripe cobra 2,9% + US$ 0,30 por parcela; o Bling guarda
   isso em `aliquotaTaxa` e `valorTaxa`. São ~19.285 nas parcelas em aberto e 5.718
   nas recebidas — cerca de **US$ 25 mil**. Nosso sistema não tem campo de taxa e
   lança o valor cheio como recebido: o DRE está inflando o lucro nesse valor.
2. **Transferência entre contas** (Truist → Wise). Hoje viraria despesa falsa.
3. **Lançamento direto no extrato** (tarifa bancária, material de escritório), sem
   ter que criar uma conta a pagar formal.
4. **Conciliação** — marcar o que já bateu com o extrato do banco.

## Ordem da migração

1. Contatos (traz a pessoa e o e-mail)
2. Pedidos de venda → contratos, com a geração automática de parcelas desligada
3. Contas a receber → parcelas, ligadas pelo nº do pedido
4. Contas a pagar
5. Costurar os 17 que já existem vindos do Kommo
6. Atualizar as regras: 4 contas bancárias, 5 vendedores, catálogo de serviços

Nada sobe antes da planilha unificada ser revisada — mesmo procedimento dos 1.178
leads do Kommo.

---

# Adendo — o Kommo tem 713 leads que não importamos

Levantado na madrugada de 10→11/10, direto na conta.

A suspeita da Tati estava certa: quando o vendedor marca ganho, o lead sai do
quadro. O filtro padrão do Kommo é "Leads ativos", e ele esconde os fechados.

| Conjunto | Leads | Valor | Importado? |
|---|---:|---:|---|
| Ativos (14 etapas) | 1.488 | $34.240 | sim (1.178 após juntar duplicados) |
| **Closed - won** | **78** | **$16.470** | **não** |
| **Closed - lost** | **635** | **$33.960** | **não** |
| Não classificados (entrada) | 10 | — | não |
| Total | 2.211 | | |

É **um único funil** ("Pipeline") com 16 etapas — não existe funil separado para
os ganhos. "Lost Renato" (442) e "Lost adriano" (182) são etapas comuns dentro do
funil ativo, coisa diferente do status `Closed - lost`.

Etapas e ids:

| id | etapa | leads |
|---|---|---:|
| 100478099 | Lead Novo | 1 |
| 100478103 | Sem Contato | 61 |
| 110911015 | ENVIADOS SDR | 390 |
| 100478107 | Adriano | 4 |
| 102470479 | Adriano - Sem Contato | 17 |
| 106141287 | Adriano - EB1 - EB2 | 5 |
| 100510055 | Adriano Proposta | 9 |
| 106751127 | Lost adriano | 182 |
| 102470483 | Sem Contato - Renato | 135 |
| 100478111 | Contato ok - Renato | 144 |
| 100510059 | Proposta - Renato | 39 |
| 107189947 | EB - Renato | 52 |
| 107187739 | Repasse - Renato | 7 |
| 106750971 | Lost Renato | 442 |
| **142** | **Closed - won** | **78** |
| **143** | **Closed - lost** | **635** |

## Por que os 78 ganhos importam

São a **ponte** entre as duas bases. O Bling tem o cliente e o contrato mas quase
não tem telefone (13 de 303); o Kommo tem telefone em 1.135 de 1.178. Os 78
ganhos têm as duas coisas e o histórico da negociação.

Com 233 pedidos no Bling e só 78 ganhos marcados no Kommo, a maior parte dos
clientes fechou sem passar pela marcação — ou fechou antes do Kommo. Dá para
conferir cruzando e-mail e telefone depois que os dois arquivos estiverem na mesa.

## Como extrair (o exportador não serve)

O exportador do Kommo **ignora o filtro aplicado** e devolve sempre os 1.498
ativos — testado: filtrei "Leads ganhos" (78 na tela) e o CSV saiu com 1.498
linhas, nenhuma `Closed - won`.

O caminho é a API v4 pela própria sessão do navegador, que aceita o cookie:

- `GET /api/v4/leads?limit=250&with=contacts&page=N` → 2.201 leads (todos os
  status; filtrar por `status_id` no cliente, porque o filtro por querystring
  não pegou)
- `GET /api/v4/contacts?limit=250&page=N` → 2.374 contatos com telefone e e-mail
  em `custom_fields_values` (`field_code` `PHONE` e `EMAIL`)
- `GET /api/v4/leads/{id}/notes?limit=250` → histórico
- `GET /api/v4/leads/pipelines` → nomes das etapas

**Pendência:** o Chrome está bloqueando download nesse domínio. Aparece um ícone
de bloqueio na barra de endereço; precisa de um clique da Tati para liberar.
Depois disso a coleta leva uns dois minutos e sai em um JSON de 3,4 MB.

## Correção no que já está no sistema

Os 1.178 importados estão certos, mas são só o funil ativo. Faltam:

- **78 ganhos** → viram cliente + contrato, e costuram com o Bling
- **635 perdidos** → lista de recuperação do SDR (hoje o SDR tem 793; isso quase dobra)
- **10 não classificados** → entrada de leads
