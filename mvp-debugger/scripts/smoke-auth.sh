#!/usr/bin/env bash
#
# Smoke del gate de acceso: levanta la app YA BUILDEADA y verifica el contrato
# de auth con HTTP real. Sin runner de tests ni dependencias nuevas — el
# debugger no tiene jest/vitest y no se le impone uno solo para esto.
#
#   npm run build && scripts/smoke-auth.sh
#
# Falla con exit != 0 en el primer caso que no cumpla (lo usa el CI).
set -euo pipefail

PUERTO="${SMOKE_PORT:-3199}"
BASE="http://127.0.0.1:$PUERTO"
PASSWORD="smoke-$$"
COOKIES="$(mktemp)"
ESPERA_MAX_SEG=60

fallos=0

limpiar() {
    [[ -n "${APP_PID:-}" ]] && kill "$APP_PID" 2>/dev/null || true
    rm -f "$COOKIES"
}
trap limpiar EXIT

codigo() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

verificar() {
    local descripcion="$1" esperado="$2" obtenido="$3"
    if [[ "$obtenido" == "$esperado" ]]; then
        printf '  ok   %-42s %s\n' "$descripcion" "$obtenido"
    else
        printf '  FALLA %-42s esperado %s, obtenido %s\n' \
            "$descripcion" "$esperado" "$obtenido"
        fallos=$((fallos + 1))
    fi
}

echo ">> levantando la app en :$PUERTO"
DEBUGGER_PASSWORD="$PASSWORD" DEBUGGER_SESSION_SECRET="secreto-$$" \
    npx next start -p "$PUERTO" > /dev/null 2>&1 &
APP_PID=$!

intento=0
until curl -s -o /dev/null "$BASE/login" 2>/dev/null; do
    intento=$((intento + 1))
    [[ $intento -ge $ESPERA_MAX_SEG ]] && { echo "la app no arranco"; exit 1; }
    sleep 1
done

echo ">> gate de acceso"
verificar "pagina sin sesion redirige"      "307" "$(codigo "$BASE/")"
verificar "/api/* sin sesion rechaza"        "401" "$(codigo "$BASE/api/pronostico/health")"
verificar "/login siempre accesible"         "200" "$(codigo "$BASE/login")"
verificar "password incorrecta rechaza"      "401" "$(codigo -X POST "$BASE/api/login" \
    -H 'content-type: application/json' -d '{"password":"incorrecta"}')"
verificar "cookie con firma invalida rechaza" "401" "$(codigo \
    -H 'Cookie: agrovoltaic_sesion=99999999999.deadbeef' "$BASE/api/pronostico/health")"

echo ">> con sesion valida"
verificar "login correcto emite sesion"      "200" "$(codigo -c "$COOKIES" -X POST "$BASE/api/login" \
    -H 'content-type: application/json' -d "{\"password\":\"$PASSWORD\"}")"
verificar "pagina con sesion pasa"           "200" "$(codigo -b "$COOKIES" "$BASE/")"

if grep -q "agrovoltaic_sesion" "$COOKIES"; then
    echo "  ok   cookie emitida"
else
    echo "  FALLA no se emitio la cookie de sesion"
    fallos=$((fallos + 1))
fi

# Va AL FINAL a propósito: bloquea la IP por 15 min, así que cualquier prueba
# posterior de login válido fallaría.
echo ">> límite de intentos"
for _ in $(seq 1 8); do
    codigo -X POST "$BASE/api/login" -H 'content-type: application/json' \
        -d '{"password":"fuerza-bruta"}' > /dev/null
done
verificar "9.º intento fallido se bloquea" "429" "$(codigo -X POST "$BASE/api/login" \
    -H 'content-type: application/json' -d '{"password":"fuerza-bruta"}')"

if [[ $fallos -gt 0 ]]; then
    echo ">> $fallos caso(s) fallaron"
    exit 1
fi
echo ">> todo ok"
