#!/usr/bin/env bash
# Atualiza TODOS os escritórios de uma vez — a "troca de receita em todas as cozinhas".
#
#   ./ferramentas/atualizar-todos.sh              # mostra quem seria atualizado
#   ./ferramentas/atualizar-todos.sh --executar   # atualiza de verdade
#
# O Railway já republica sozinho a cada push na master. Este script serve para
# quando um escritório ficou para trás, ou depois de mudar alguma configuração.
set -euo pipefail
PREFIXO="liv"
EXECUTAR="${1:-}"
azul(){ printf '\033[1;34m%s\033[0m\n' "$*"; }
ok(){ printf '\033[0;32m✓\033[0m %s\n' "$*"; }
erro(){ printf '\033[0;31m✗ %s\033[0m\n' "$*"; exit 1; }

command -v railway >/dev/null || erro "CLI do Railway não instalada."
railway whoami >/dev/null 2>&1 || erro "Não está logada. Rode: railway login"

azul "Procurando os projetos que começam com \"$PREFIXO-\"…"
LISTA=$(railway list --json 2>/dev/null || railway list 2>/dev/null)
PROJETOS=$(printf '%s' "$LISTA" | grep -oE "${PREFIXO}-[a-z0-9-]+" | sort -u)
[ -z "$PROJETOS" ] && erro "Nenhum projeto encontrado com o prefixo \"$PREFIXO-\"."

N=$(printf '%s\n' "$PROJETOS" | wc -l | tr -d ' ')
echo; azul "$N escritório(s):"; printf '   %s\n' $PROJETOS; echo

if [ "$EXECUTAR" != "--executar" ]; then
  ok "Simulação. Para atualizar de verdade:  $0 --executar"; exit 0
fi

for P in $PROJETOS; do
  azul "→ $P"
  railway link --project "$P" >/dev/null 2>&1 || { echo "   (não consegui abrir, pulando)"; continue; }
  railway redeploy --yes 2>/dev/null || railway up --detach 2>/dev/null || echo "   (falhou — veja no painel)"
  ok "$P atualizado"
done
echo; ok "Todos processados."
