#!/usr/bin/env bash
# Cria a "cozinha" de um escritório novo: projeto no Railway + banco Postgres +
# o sistema rodando + endereço na internet.
#
#   ./ferramentas/novo-escritorio.sh "Silva Imigração"            # mostra o que faria
#   ./ferramentas/novo-escritorio.sh "Silva Imigração" --executar # faz de verdade
#
# Sem --executar ele NÃO cria nada: só imprime cada comando. Use isso na
# primeira vez para conferir antes de gastar.
set -euo pipefail

REPO="gsantosmtl-ai/legalway-sistema"
BRANCH="master"
PREFIXO="liv"                       # todo projeto da LIV começa assim — é como o
                                    # atualizar-todos.sh sabe quais são seus

NOME="${1:-}"
EXECUTAR="${2:-}"
[ -z "$NOME" ] && { echo "Uso: $0 \"Nome do Escritório\" [--executar]"; exit 1; }

# nome -> apelido sem acento, só letras, números e hífen.
# O iconv//TRANSLIT do macOS erra acento ("Imigração" vira "imigrac~ao"),
# por isso a conversão é feita em Python, que acerta.
APELIDO=$(python3 -c '
import sys, unicodedata, re
t = unicodedata.normalize("NFKD", sys.argv[1]).encode("ascii", "ignore").decode()
print(re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", t.lower())).strip("-")[:30])
' "$NOME")
PROJETO="${PREFIXO}-${APELIDO}"

azul(){ printf '\033[1;34m%s\033[0m\n' "$*"; }
cinza(){ printf '\033[0;90m%s\033[0m\n' "$*"; }
ok(){ printf '\033[0;32m✓\033[0m %s\n' "$*"; }
erro(){ printf '\033[0;31m✗ %s\033[0m\n' "$*"; exit 1; }

command -v railway >/dev/null || erro "A CLI do Railway não está instalada. Rode: brew install railway"
railway whoami >/dev/null 2>&1 || erro "Você não está logada no Railway. Rode: railway login"

SIMULANDO=1
[ "$EXECUTAR" = "--executar" ] && SIMULANDO=0

rodar(){                             # imprime sempre; executa só com --executar
  cinza "   $*"
  [ $SIMULANDO -eq 1 ] && return 0
  "$@"
}

echo
azul "Escritório:  $NOME"
azul "Projeto:     $PROJETO"
[ $SIMULANDO -eq 1 ] && azul "Modo:        SIMULAÇÃO (nada será criado)" \
                     || azul "Modo:        EXECUTANDO de verdade"
echo

# As configurações que valem para todos os escritórios ficam num arquivo só,
# fora do git. Copie ferramentas/config.exemplo para ferramentas/config e preencha.
CFG="$(dirname "$0")/config"
if [ -f "$CFG" ]; then
  # shellcheck disable=SC1090
  . "$CFG"; ok "Configurações comuns carregadas de ferramentas/config"
else
  cinza "   (sem ferramentas/config — SMTP e USCIS ficarão vazios; dá pra preencher depois no painel)"
fi

azul "1. Criar o projeto"
rodar railway init --name "$PROJETO" --json

azul "2. Adicionar o banco de dados"
rodar railway add --database postgres

azul "3. Colocar o sistema para rodar (a partir do GitHub)"
rodar railway add --service "$APELIDO" --repo "$REPO" --branch "$BRANCH"

azul "4. Configurar o sistema"
# DATABASE_URL é uma referência ao banco criado no passo 2 — o Railway resolve sozinho.
rodar railway variables --service "$APELIDO" --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}'
for VAR in \
  "SMTP_HOST=${SMTP_HOST:-}" "SMTP_PORT=${SMTP_PORT:-587}" \
  "SMTP_USER=${SMTP_USER:-}" "SMTP_PASS=${SMTP_PASS:-}" \
  "EMAIL_DE=${EMAIL_DE:-}" "EMAIL_SEGURANCA=${EMAIL_SEGURANCA:-}" \
  "USCIS_CLIENT_ID=${USCIS_CLIENT_ID:-}" "USCIS_CLIENT_SECRET=${USCIS_CLIENT_SECRET:-}" \
  "USCIS_AMBIENTE=${USCIS_AMBIENTE:-sandbox}"
do
  [ "${VAR#*=}" = "" ] && continue      # não cria variável vazia
  rodar railway variables --service "$APELIDO" --set "$VAR"
done

azul "5. Criar o endereço na internet"
rodar railway domain

echo
if [ $SIMULANDO -eq 1 ]; then
  ok "Simulação concluída. Para fazer de verdade:"
  echo "   $0 \"$NOME\" --executar"
else
  ok "Pronto. Agora, na ordem:"
  echo "   1. Abra o endereço que apareceu acima"
  echo "   2. A tela de primeiro acesso pede nome do escritório, admin e tipos de visto"
  echo "   3. Depois de instalado, essa tela se fecha sozinha"
  echo
  cinza "   Confira no painel se DATABASE_URL apontou para o banco. Se não,"
  cinza "   é um clique: Variables → DATABASE_URL → referenciar o Postgres."
fi
echo
