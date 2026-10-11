# Plano de sábado, 11/10

Dois trabalhos em paralelo. O **bloco A** tem hora marcada e não pode escorregar —
é o que faz a equipe trabalhar na segunda. O **bloco B** é a migração dos dados
históricos, que pode levar o fim de semana inteiro sem atrapalhar ninguém.

---

## Bloco A — virar a chave (prioridade)

Está detalhado em `../../LIV/material/lancamento/sabado-11-10.md`. Resumo da
ordem, que importa:

1. Configurar as 4 variáveis da Meta no Railway
2. Testar: formulário do Facebook e mensagem de WhatsApp caindo no sistema
3. Só depois disso desligar o Kommo — **o WhatsApp da Legal Way está conectado
   através do Kommo**; desligar antes derruba o canal
4. Importar os leads novos que entraram no Kommo desde a exportação
5. Briefing da equipe
6. Deixar o Kommo ligado até o fim de segunda, como rede de segurança

---

## Bloco B — migração dos dados

### B0. Três cliques que só a Tati pode dar

Isso destrava o resto; fazer primeiro.

1. **Liberar o download no Kommo.** Na aba do Kommo tem um ícone de bloqueio na
   barra de endereço. Clicar e permitir downloads de `legalway.kommo.com`.
2. **Compartilhar a pasta de contratos do Drive** da conta `legalwayeua@gmail.com`
   com `gsantos.mtl@gmail.com`. Só a pasta dos contratos assinados.
3. **Abrir o Trello no Chrome**, no board da documentação.

### B1. Terminar a extração

| Fonte | Situação |
|---|---|
| Bling — contas a receber e a pagar (3.343) | ✅ `planilhas/bling/bling-financeiro.json` |
| Bling — pedidos de venda (233) | ✅ `planilhas/bling/pedidos-de-venda.csv` |
| Bling — contatos (303) | ✅ `planilhas/bling/contatos.csv` |
| Bling — catálogo de serviços (14 com preço) | ⬜ falta exportar |
| Bling — extrato das 6 contas bancárias | ⬜ falta; dá o saldo de abertura |
| Kommo — 2.201 leads + 2.374 contatos + notas | ⬜ pronto para rodar, travado no B0.1 |
| Drive — lista de contratos assinados | ⬜ travado no B0.2 |
| Trello — cards de documentação | ⬜ travado no B0.3 |

### B2. Montar a planilha única

Uma linha por pessoa, colunas de cada origem lado a lado. Mesmo procedimento dos
1.178 leads do Kommo: **a Tati revisa antes de qualquer coisa subir**.

Chaves de junção, nessa ordem:

1. **e-mail** em minúsculas — é a única chave que o Bling tem de verdade
   (238 de 303 contatos; telefone só 13)
2. **telefone**, últimos 8 dígitos — serve para o Kommo (1.135 de 1.178) e para
   costurar os 78 ganhos com o Bling
3. **nome normalizado** — só como conferência manual, nunca para juntar sozinho

Para ligar parcela ao contrato: o número em `"Ref. ao pedido de venda nº N"`.

O que a planilha precisa responder, pessoa por pessoa:
de onde veio (Kommo), o que comprou e por quanto (pedido do Bling), o que já pagou
e o que falta (contas a receber), onde está o contrato assinado (Drive) e em que
pé está a documentação (Trello).

### B3. Decisões que precisam da Tati

Levar prontas para a revisão:

- **204 parcelas sem pedido de origem** — de onde vieram? Entram como avulsas?
- **155 clientes do Bling sem ganho correspondente no Kommo** (233 pedidos, 78
  ganhos) — fecharam antes do Kommo, ou o vendedor não marcou?
- **533 contas a pagar sem categoria** — categorizar ao menos os quatro maiores:
  USPS Correio (78), Tradução – Camila (67), Taxas WISE (34), Psicóloga (25).
  Esses três últimos são custo de processo e deveriam entrar como
  `categoriaPrestadores`, amarrados ao cliente.
- **"Tradução de Documentos" e "Tradução dos documentos"** são o mesmo serviço
  duplicado — unificar qual nome fica.
- **635 leads perdidos do Kommo** — vão todos para a fila do SDR? Isso quase dobra
  a fila atual (793).
- **Repasse - Renato (7 leads)** — pendência antiga: o que "repasse" significa.

### B4. Importar

Na ordem, porque cada etapa depende da anterior:

1. Contatos → clientes
2. Pedidos → contratos, **com a geração automática de parcelas desligada**
   (as parcelas reais vêm do Bling, com o histórico de quem pagou; se a automação
   rodar, duplica tudo)
3. Contas a receber → parcelas, ligadas pelo nº do pedido
4. Contas a pagar
5. Os 78 ganhos do Kommo, costurados nos clientes que já entraram
6. Os 635 perdidos → fila do SDR

Backup do sistema antes de cada etapa.

### B5. Ajustes de configuração

Rápidos, e fazem diferença no dia a dia:

- **Serviços:** hoje são 3 no funil ('EB-2 NIW', 'Visto T', 'Green Card familiar'),
  com um comentário no código dizendo que a lista é provisória. Trocar pelos 21
  reais, com preço de tabela. E inverter a ordem: **Visto T é 83% dos pedidos**,
  EB-2 NIW são 2 no ano.
- **Vendedores:** são 5 (Renato, Adriano, Vitoria, Peterson, Parceria Luzia), não 2.
- **Contas bancárias:** faltam C6 PIX BR, Nubank, INVESTIMENTO TRUIST e Caixa.
- **Formas de pagamento:** incluir Square e Pix.

### B6. Taxa de gateway — isso é correção, não melhoria

O Stripe cobra 2,9% + US$ 0,30 por parcela. O Bling guarda em `aliquotaTaxa` e
`valorTaxa`; o nosso sistema não tem o campo e lança o valor cheio como recebido.
São cerca de **US$ 25 mil** que o DRE está contando como lucro e não existem.

Precisa entrar **junto com a importação**, senão os números nascem errados e
depois ninguém confia neles. Campos novos em cada conta a receber: `taxaPercentual`,
`taxaFixa`, `valorLiquido`.

---

## Depois (não é de sábado)

Melhorias de financeiro que o Bling tem e nós não:

- transferência entre contas (Truist → Wise), que hoje viraria despesa falsa
- lançamento direto no extrato (tarifa bancária, material), sem criar conta a pagar
- conciliação bancária
