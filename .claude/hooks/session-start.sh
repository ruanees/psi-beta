#!/bin/bash
# Prepara a sessão na nuvem para validar aqui o mesmo que a CI valida:
# dependências do back e do front, o pre-push e o Supabase local.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "$CLAUDE_PROJECT_DIR"

# A saída deste hook vira contexto da sessão: o detalhe vai para o log.
log=/tmp/session-start.log
(cd back && npm install --no-audit --no-fund) >>"$log" 2>&1
(cd front && npm install --no-audit --no-fund) >>"$log" 2>&1
echo "dependências do back e do front instaladas"

git config core.hooksPath .githooks
echo "pre-push ligado: scripts/validar.sh --alterado roda antes de cada push"

# Se o Docker Hub estiver limitando downloads, a sessão abre assim mesmo
# e scripts/validar.sh banco tenta de novo.
if scripts/validar.sh --preparar >>"$log" 2>&1; then
  echo "Supabase local no ar (banco + auth)"
else
  echo "aviso: Supabase local não subiu agora (ver $log); scripts/validar.sh banco tenta de novo"
fi
