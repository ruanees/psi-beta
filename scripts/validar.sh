#!/usr/bin/env bash
# Roda aqui o mesmo que a CI roda (.github/workflows/back.yml e front.yml), para
# que um push só saia com o que vai passar lá.
#
#   scripts/validar.sh               tudo: back, banco e front
#   scripts/validar.sh banco front   só as partes pedidas
#   scripts/validar.sh --alterado    só as partes que os commits fora da main tocam (pre-push)
#   scripts/validar.sh --preparar    só sobe Docker e Supabase local (início de sessão)
set -euo pipefail

raiz=$(cd "$(dirname "$0")/.." && pwd)

# Na sessão da nuvem, ECR e GHCR são bloqueados pela rede; o Docker Hub responde.
export SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io
export NEXT_TELEMETRY_DISABLED=1

# Só os serviços que a prova usa: o banco e o de login, que cria o schema auth (igual à CI).
SEM_SERVICOS=realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor

# Mostra a saída só quando falha.
rodar() {
  local nome=$1 log
  shift
  log=$(mktemp)
  printf '%-44s' "$nome"
  if "$@" >"$log" 2>&1; then
    echo ok
    rm -f "$log"
  else
    echo FALHOU
    cat "$log"
    rm -f "$log"
    return 1
  fi
}

# O Docker Hub limita download anônimo (429). Cada imagem que desce fica no cache,
# então tentar de novo avança. Ao retomar a sessão, os containers voltam sozinhos
# e o banco passa alguns segundos "starting": aí basta esperar.
com_novas_tentativas() {
  local log t
  log=$(mktemp)
  for t in 1 2 3 4 5; do
    if "$@" >"$log" 2>&1; then
      cat "$log"
      rm -f "$log"
      return 0
    fi
    grep -qE 'Too Many Requests|ImagePrepullError|failed to pull|StatusDbNotReadyError' "$log" || break
    echo "imagem limitada ou banco ainda subindo, nova tentativa em $((t * 15))s"
    sleep $((t * 15))
  done
  cat "$log"
  rm -f "$log"
  return 1
}

garantir_docker() {
  docker info >/dev/null 2>&1 && return 0
  command -v dockerd >/dev/null || { echo "Docker não está instalado"; return 1; }
  setsid nohup dockerd >/tmp/dockerd.log 2>&1 </dev/null &
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "dockerd não subiu; ver /tmp/dockerd.log"
  return 1
}

garantir_dependencias() {
  [ -d "$raiz/$1/node_modules" ] || rodar "$1: npm ci" npm --prefix "$raiz/$1" ci --no-audit --no-fund
}

preparar_banco() {
  cd "$raiz/back"
  rodar "banco: docker" garantir_docker
  rodar "banco: supabase local" com_novas_tentativas npx supabase start -x "$SEM_SERVICOS"
}

validar_banco() {
  garantir_dependencias back
  preparar_banco
  rodar "banco: migrations do zero" npx supabase db reset
  rodar "banco: provas de RLS (pgTAP)" com_novas_tentativas npx supabase test db
}

openapi_confere() {
  npm run openapi
  git diff --exit-code -- openapi.json || {
    echo "back/openapi.json desatualizado. Rode 'npm run openapi' em back/ e faça commit."
    return 1
  }
}

validar_back() {
  garantir_dependencias back
  cd "$raiz/back"
  rodar "back: tipos" npm run typecheck
  rodar "back: testes" npm test
  rodar "back: openapi.json confere com o código" openapi_confere
  rodar "back: bundle do Worker" npm run bundle
}

validar_front() {
  garantir_dependencias front
  cd "$raiz/front"
  rodar "front: tipos" npm run typecheck
  rodar "front: provas" npm run prova
  # Endereço qualquer, o mesmo da CI: a trava do build exige a variável.
  rodar "front: build" env NEXT_PUBLIC_API_URL=https://psi-back-homolog.exemplo.workers.dev \
    NEXT_PUBLIC_BACKOFFICE_URL=https://senda-backoffice-homolog.exemplo.workers.dev npm run build
}

# Partes tocadas pelos commits fora da main e pelo que ainda não foi commitado.
partes_alteradas() {
  local base arquivos
  base=$(git -C "$raiz" merge-base HEAD origin/main 2>/dev/null || true)
  arquivos=$({
    [ -n "$base" ] && git -C "$raiz" diff --name-only "$base" HEAD
    git -C "$raiz" diff --name-only HEAD
  } | sort -u)
  # Fora de back/ e front/, só a CI e este script mudam o que a validação faz.
  if grep -qE '^(\.github/workflows/|scripts/validar\.sh)' <<<"$arquivos"; then
    echo back banco front
    return
  fi
  local partes=()
  grep -q '^back/supabase/' <<<"$arquivos" && partes+=(banco)
  # A lógica da função admin-contas é provada pelos testes do back.
  grep -q '^back/supabase/functions/' <<<"$arquivos" && partes+=(back)
  # O front gera os tipos de back/openapi.json, então mudança no back também prova o front.
  grep -v '^back/supabase/' <<<"$arquivos" | grep -q '^back/' && partes+=(back front)
  grep -q '^front/' <<<"$arquivos" && partes+=(front)
  printf '%s\n' "${partes[@]}" | sort -u | tr '\n' ' '
}

case "${1:-}" in
  --preparar)
    preparar_banco
    exit
    ;;
  --alterado)
    read -ra partes <<<"$(partes_alteradas)"
    if [ ${#partes[@]} -eq 0 ]; then
      echo "validar: nada em back/ ou front/ mudou"
      exit 0
    fi
    ;;
  "") partes=(back banco front) ;;
  *) partes=("$@") ;;
esac

for parte in "${partes[@]}"; do
  case "$parte" in
    back) validar_back ;;
    banco) validar_banco ;;
    front) validar_front ;;
    *) echo "parte desconhecida: $parte (use back, banco ou front)"; exit 2 ;;
  esac
done
echo "validar: ${partes[*]} ok"
