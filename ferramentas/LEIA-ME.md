# As duas ferramentas

Pense em cada escritório cliente como uma **cozinha própria**: os dados de um
nunca encostam nos do outro. É isso que a LIV vende, e é verdade.

O problema é que montar cozinha na mão demora, e trocar a receita em todas,
uma por uma, é o que trava o crescimento. Estas duas ferramentas resolvem isso.

---

## 1. Abrir a cozinha de um escritório novo

Primeiro **veja o que vai acontecer**, sem criar nada:

```bash
cd ~/Documents/CLAUD-Projetos/legalway-sistema
./ferramentas/novo-escritorio.sh "Silva Imigração"
```

Ele imprime cada passo e não cria nada. Quando estiver confiante:

```bash
./ferramentas/novo-escritorio.sh "Silva Imigração" --executar
```

Aí ele cria, de uma vez: o projeto, o banco de dados, o sistema rodando e o
endereço na internet. No fim mostra o link.

**Você abre o link e a tela de primeiro acesso cuida do resto** — pede o nome do
escritório, o administrador e quais tipos de visto aquele escritório atende.
Depois de instalado, essa tela se fecha sozinha.

> **Sempre rode sem `--executar` primeiro.** É de graça e evita criar projeto
> errado, que depois dá trabalho para apagar.

---

## 2. Trocar a receita em todas as cozinhas

```bash
./ferramentas/atualizar-todos.sh              # mostra quem seria atualizado
./ferramentas/atualizar-todos.sh --executar   # atualiza de verdade
```

Na prática você quase não vai precisar: o Railway já republica sozinho quando
você envia uma mudança. Isto serve para quando um escritório ficou para trás.

---

## Antes da primeira vez

Preencha uma vez só o que é igual para todos os escritórios — e-mail de envio e
as chaves do USCIS:

```bash
cp ferramentas/config.exemplo ferramentas/config
```

Abra `ferramentas/config` e preencha. **Esse arquivo tem senha dentro e não vai
para o GitHub** — já está bloqueado.

Se você pular esta parte, tudo funciona igual; só dá para preencher depois no
painel do Railway, escritório por escritório. Fazer uma vez aqui é mais fácil.

---

## O que ainda é feito na mão

- **Domínio próprio do cliente** (ex.: `sistema.silvaimigracao.com`) —
  `railway domain nome.com` cria, mas quem aponta o DNS é o dono do domínio.
- **Apagar um escritório** que cancelou. De propósito: apagar banco de cliente
  não é coisa que um script deva fazer sozinho.

---

## Uma coisa honesta

Eu escrevi e testei estas ferramentas **no modo simulação**, que imprime cada
comando sem executar. Não testei criando um projeto de verdade, porque isso
custa dinheiro e cria cobrança na sua conta — não é decisão minha.

Então, na primeira vez que rodar com `--executar`, **acompanhe a tela** e confira
no painel do Railway se o `DATABASE_URL` apontou certo para o banco. É o único
passo que eu não consegui verificar sozinha. Se estiver errado, é um clique:
Variables → DATABASE_URL → referenciar o Postgres.

Da segunda vez em diante, é só rodar.
