#!/usr/bin/env bash
# Levanta el MVP completo en local: los 2 servicios Python (Historico :8010,
# Predictivo :8000) + el Next dev (:3000). Ctrl-C cierra todo.
#
# La ANTHROPIC_API_KEY se toma de agente-predictivo/.env (no se imprime). Los
# servicios leen las DBs en SOLO LECTURA. Uso:  ./dev.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
VENV="$REPO/agente-predictivo/.venv/bin/python"
VENV_HIST="$REPO/agente-historico/.venv/bin/python"
LOGS="$HERE/.logs"; mkdir -p "$LOGS"

for v in "$VENV" "$VENV_HIST"; do
  [ -x "$v" ] || { echo "No encuentro el venv en $v — creálo primero." >&2; exit 1; }
done

# .env.local del Next (URLs de los servicios). Se crea del ejemplo si falta.
[ -f "$HERE/.env.local" ] || cp "$HERE/.env.local.example" "$HERE/.env.local"

# ANTHROPIC_API_KEY (y model) desde el .env del pronostico. set -a => exportar.
set -a; . "$REPO/agente-predictivo/.env"; set +a

pids=()
cleanup() { echo; echo "cerrando servicios…"; for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

echo "→ Agente Histórico en http://127.0.0.1:8010"
( cd "$REPO/agente-historico" && "$VENV_HIST" -m uvicorn historico.api:app \
    --host 127.0.0.1 --port 8010 ) > "$LOGS/historico.log" 2>&1 &
pids+=($!)

echo "→ Agente Predictivo en http://127.0.0.1:8000"
( cd "$REPO/agente-predictivo" && "$VENV" -m uvicorn predictivo.api:app \
    --host 127.0.0.1 --port 8000 ) > "$LOGS/predictivo.log" 2>&1 &
pids+=($!)

echo -n "esperando health"
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8010/health >/dev/null 2>&1 \
     && curl -sf http://127.0.0.1:8000/health >/dev/null 2>&1; then echo " ok"; break; fi
  echo -n "."; sleep 1
done

cd "$HERE"
[ -d node_modules ] || { echo "→ npm install"; npm install; }
echo "→ Next en http://localhost:3000"
npm run dev
