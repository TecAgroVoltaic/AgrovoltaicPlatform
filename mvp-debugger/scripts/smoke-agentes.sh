#!/usr/bin/env bash
#
# Smoke del BLOQUEO de agentes: verifica con HTTP real que el chat del Agente
# Histórico quede cortado con `AGENTE_HISTORICO=off` y vuelva entero sin el flag
# (el default es ENCENDIDO, ver app/lib/agentes.ts). Mismo enfoque que
# smoke-auth.sh: la app ya buildeada, sin runner de tests nuevo.
#
#   npm run build && scripts/smoke-agentes.sh
#
# Por qué existe: esconder botones no es bloquear. Lo que cuesta plata es la
# conversación (/api/historico/chat y /preguntar gastan tokens del LLM), así que
# lo que hay que probar es la puerta, no la UI. Las lecturas (calidad, datos,
# arquitectura) NO se bloquean: son deterministas y gratis. Y el flag tiene que
# ser reversible: si quitarlo no devuelve el chat, el "bloqueo" fue un borrado.
#
# "Pasa" se verifica como «NO es 503», no como 200: en el CI no corre ningún
# sidecar Python y un request que atraviesa el bloqueo termina en 502 «servicio
# inaccesible»; en una máquina con los servicios arriba, en 200. Las dos cosas
# prueban lo mismo: el request llegó al proxy en vez de morir en el bloqueo.
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
    AGENTE_HISTORICO="$valor_flag" DEBUGGER_PASSWORD="$PASSWORD" \
        DEBUGGER_SESSION_SECRET="secreto-$$" \
        node node_modules/next/dist/bin/next start -p "$PUERTO" > /dev/null 2>&1 &
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

# Se levanta con `node` y no con `npx`: `npx` deja a Next como proceso hijo, el
# kill mata solo al envoltorio y el servidor viejo sigue con el puerto tomado.
# El arranque siguiente no puede bindear y las verificaciones le pegan a la app
# ANTERIOR, con el flag anterior. Por lo mismo se espera a que el puerto quede
# libre de verdad antes de seguir.
bajar() {
    [[ -n "$APP_PID" ]] && kill "$APP_PID" 2>/dev/null || true
    [[ -n "$APP_PID" ]] && wait "$APP_PID" 2>/dev/null || true
    APP_PID=""
    local intento=0
    while curl -s -o /dev/null "$BASE/login" 2>/dev/null; do
        intento=$((intento + 1))
        [[ $intento -ge $ESPERA_MAX_SEG ]] && { echo "la app anterior no bajo"; exit 1; }
        sleep 1
    done
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

pasa() {
    local descripcion="$1" obtenido="$2"
    if [[ "$obtenido" != "503" ]]; then
        printf '  ok   %-46s %s\n' "$descripcion" "$obtenido"
    else
        printf '  FALLA %-46s sigue bloqueado (503)\n' "$descripcion"
        fallos=$((fallos + 1))
    fi
}

chat_historico() {
    "$@" -b "$COOKIES" -X POST "$BASE/api/historico/chat" \
        -H 'content-type: application/json' \
        -d '{"mensajes":[{"rol":"user","texto":"hola"}]}'
}

echo ">> AGENTE_HISTORICO=off — la conversación del histórico debe estar bloqueada"
levantar "off"
verificar "el chat del histórico responde 503"      "503" "$(chat_historico codigo)"
verificar "/preguntar del histórico responde 503"   "503" "$(codigo -b "$COOKIES" -X POST \
    "$BASE/api/historico/preguntar" -H 'content-type: application/json' -d '{"pregunta":"hola"}')"
contiene "el 503 dice cómo revertirlo" "AGENTE_HISTORICO=off" "$(chat_historico curl -s)"
pasa "las lecturas del histórico siguen pasando" "$(codigo -b "$COOKIES" "$BASE/api/historico/health")"
verificar "la página suelta /historico no existe"   "404" "$(codigo -b "$COOKIES" "$BASE/historico")"
pasa "el agente predictivo sigue pasando" "$(codigo -b "$COOKIES" "$BASE/api/predictivo/health")"
bajar

echo ">> sin el flag (default) — el bloqueo tiene que ser reversible"
levantar ""
pasa "el chat del histórico deja pasar" "$(chat_historico codigo)"
verificar "la página suelta /historico vuelve"      "200" "$(codigo -b "$COOKIES" "$BASE/historico")"
bajar

if [[ $fallos -gt 0 ]]; then
    echo ">> $fallos caso(s) fallaron"
    exit 1
fi
echo ">> todo ok"
