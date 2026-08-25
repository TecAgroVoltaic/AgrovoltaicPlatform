#!/usr/bin/env bash
#
# Smoke del BLOQUEO de agentes: verifica con HTTP real que el agente histórico
# (Agente Histórico) esté cortado cuando el flag está apagado y vuelva entero
# cuando se enciende. Mismo enfoque que smoke-auth.sh: la app ya buildeada, sin
# runner de tests nuevo.
#
#   npm run build && scripts/smoke-agentes.sh
#
# Por qué existe: esconder botones no es bloquear. Lo que cuesta plata es
# /api/historico/* (consulta la Supabase PV y gasta tokens del LLM), así que lo
# que hay que probar es la puerta, no la UI. Y el flag tiene que ser reversible:
# si encenderlo no devuelve el agente, el "bloqueo" fue en realidad un borrado.
set -euo pipefail

PUERTO="${SMOKE_PORT:-3198}"
BASE="http://127.0.0.1:$PUERTO"
PASSWORD="smoke-$$"
COOKIES="$(mktemp)"
ESPERA_MAX_SEG=60

fallos=0
APP_PID=""

limpiar() {
    [[ -n "$APP_PID" ]] && kill "$APP_PID" 2>/dev/null || true
    rm -f "$COOKIES"
}
trap limpiar EXIT

codigo() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

verificar() {
    local descripcion="$1" esperado="$2" obtenido="$3"
    if [[ "$obtenido" == "$esperado" ]]; then
        printf '  ok   %-46s %s\n' "$descripcion" "$obtenido"
    else
        printf '  FALLA %-46s esperado %s, obtenido %s\n' \
            "$descripcion" "$esperado" "$obtenido"
        fallos=$((fallos + 1))
    fi
}

# Levanta la app con el flag dado y deja una sesión válida en $COOKIES.
levantar() {
    local valor_flag="$1"
    AGENTE_ANALIZADOR="$valor_flag" DEBUGGER_PASSWORD="$PASSWORD" \
        DEBUGGER_SESSION_SECRET="secreto-$$" \
        npx next start -p "$PUERTO" > /dev/null 2>&1 &
    APP_PID=$!
    local intento=0
    until curl -s -o /dev/null "$BASE/login" 2>/dev/null; do
        intento=$((intento + 1))
        [[ $intento -ge $ESPERA_MAX_SEG ]] && { echo "la app no arranco"; exit 1; }
        sleep 1
    done
    : > "$COOKIES"
    curl -s -o /dev/null -c "$COOKIES" -X POST "$BASE/api/login" \
        -H 'content-type: application/json' -d "{\"password\":\"$PASSWORD\"}"
}

bajar() {
    [[ -n "$APP_PID" ]] && kill "$APP_PID" 2>/dev/null || true
    APP_PID=""
    sleep 1
}

# El cuerpo del 503 tiene que explicar cómo revertirlo; un 503 mudo manda a
# alguien a debuggear el sidecar, que está perfectamente sano.
contiene() {
    local descripcion="$1" aguja="$2" texto="$3"
    if [[ "$texto" == *"$aguja"* ]]; then
        printf '  ok   %-46s\n' "$descripcion"
    else
        printf '  FALLA %-46s no aparece «%s»\n' "$descripcion" "$aguja"
        fallos=$((fallos + 1))
    fi
}

echo ">> flag APAGADO — el agente histórico debe estar bloqueado"
levantar ""
verificar "proxy del analizador responde 503"  "503" "$(codigo -b "$COOKIES" "$BASE/api/historico/health")"
verificar "el chat del analizador responde 503" "503" "$(codigo -b "$COOKIES" -X POST \
    "$BASE/api/historico/chat" -H 'content-type: application/json' \
    -d '{"mensajes":[{"rol":"user","texto":"hola"}]}')"
verificar "la página suelta /analizador no existe" "404" "$(codigo -b "$COOKIES" "$BASE/analizador")"
verificar "el agente de pronóstico sigue accesible" "200" "$(codigo -b "$COOKIES" "$BASE/api/predictivo/health")"
contiene "el 503 dice cómo revertirlo" "AGENTE_ANALIZADOR=on" \
    "$(curl -s -b "$COOKIES" "$BASE/api/historico/health")"

consola="$(curl -s -b "$COOKIES" "$BASE/")"
for vista in "Reconciliación" "Rendimiento"; do
    if [[ "$consola" == *"$vista"* ]]; then
        printf '  FALLA %-46s la vista sigue en la navegación\n' "la consola no ofrece «${vista}»"
        fallos=$((fallos + 1))
    else
        printf '  ok   %-46s\n' "la consola no ofrece «${vista}»"
    fi
done
contiene "la consola sí ofrece «Predicción vs Real»" "Predicción vs Real" "$consola"
bajar

echo ">> flag ENCENDIDO — el bloqueo tiene que ser reversible"
levantar "on"
# No se exige 200: acá (y en el CI) no hay ningún sidecar del analizador
# corriendo, así que el proxy contesta 502 «servicio inaccesible». Lo que se
# prueba es que el request LLEGA al proxy en vez de morir en el bloqueo.
respuesta_proxy="$(curl -s -b "$COOKIES" "$BASE/api/historico/health")"
if [[ "$respuesta_proxy" == *"AGENTE_ANALIZADOR=on"* ]]; then
    printf '  FALLA %-46s sigue bloqueado\n' "el proxy del analizador deja pasar"
    fallos=$((fallos + 1))
else
    printf '  ok   %-46s\n' "el proxy del analizador deja pasar"
fi
verificar "la página suelta /analizador vuelve"    "200" "$(codigo -b "$COOKIES" "$BASE/analizador")"
contiene "la consola vuelve a ofrecer «Reconciliación»" "Reconciliación" \
    "$(curl -s -b "$COOKIES" "$BASE/")"
bajar

if [[ $fallos -gt 0 ]]; then
    echo ">> $fallos caso(s) fallaron"
    exit 1
fi
echo ">> todo ok"
