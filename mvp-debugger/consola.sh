#!/usr/bin/env bash
#
# Levanta la consola de evaluación contra los agentes que YA CORREN EN LA EC2,
# usando un túnel SSH. No expone nada: los servicios siguen escuchando solo en
# el loopback del servidor.
#
#   ./consola.sh              # elige puertos libres solo
#   CONSOLA_PORT=3010 ./consola.sh
#
# Ctrl+C baja la consola y cierra el túnel.
#
# Alternativa: ./dev.sh levanta los servicios Python EN LOCAL (necesita venv y
# acceso a las bases). Este script es para mirar producción sin montar nada.
set -euo pipefail

EC2_HOST="${EC2_HOST:-ec2-user@52.1.28.77}"
LLAVE_SSH="${EC2_KEY:-$HOME/aws/visione-key.pem}"
# Puertos REMOTOS de los agentes en la EC2 (fijos, definidos por sus compose).
PUERTO_PRONOSTICO_REMOTO=8000
PUERTO_ANALIZADOR_REMOTO=8010
# Puertos LOCALES del túnel. Altos a propósito: 8000 y 8010 suelen estar
# ocupados por otros servicios de la máquina de desarrollo.
PUERTO_PRONOSTICO_LOCAL="${PRONOSTICO_PORT:-18000}"
PUERTO_ANALIZADOR_LOCAL="${ANALIZADOR_PORT:-18010}"
PUERTO_CONSOLA_PREFERIDO="${CONSOLA_PORT:-3010}"
ESPERA_MAX_SEG=45

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TUNEL_PID=""

log()   { printf '\033[32m>>\033[0m %s\n' "$1"; }
aviso() { printf '\033[33m!!\033[0m %s\n' "$1"; }
fatal() { printf '\033[31mERROR:\033[0m %s\n' "$1" >&2; exit 1; }

limpiar() {
    [[ -n "$TUNEL_PID" ]] && kill "$TUNEL_PID" 2>/dev/null || true
    log "túnel cerrado"
}
trap limpiar EXIT

puerto_libre() {
    local desde="$1" p
    for p in $(seq "$desde" $((desde + 20))); do
        ss -ltn 2>/dev/null | grep -q ":$p " || { printf '%s' "$p"; return 0; }
    done
    fatal "no hay puertos libres a partir de $desde"
}

verificar_requisitos() {
    [[ -f "$LLAVE_SSH" ]] || fatal "no encuentro la llave SSH en $LLAVE_SSH (definí EC2_KEY)"
    [[ -d "$AQUI/node_modules" ]] || fatal "faltan dependencias: corré 'npm ci' en $AQUI"
    if [[ ! -f "$AQUI/.env.local" ]]; then
        fatal ".env.local no existe. Copiá .env.local.example y definí al menos
       DEBUGGER_PASSWORD, o la consola no te va a dejar entrar."
    fi
    grep -qE '^DEBUGGER_PASSWORD=.+' "$AQUI/.env.local" \
        || aviso "DEBUGGER_PASSWORD vacío en .env.local: en desarrollo la consola queda SIN gate."
}

abrir_tunel() {
    log "abriendo túnel a $EC2_HOST"
    ssh -i "$LLAVE_SSH" -o ConnectTimeout=15 -o ExitOnForwardFailure=yes \
        -o ServerAliveInterval=30 -N \
        -L "$PUERTO_PRONOSTICO_LOCAL:127.0.0.1:$PUERTO_PRONOSTICO_REMOTO" \
        -L "$PUERTO_ANALIZADOR_LOCAL:127.0.0.1:$PUERTO_ANALIZADOR_REMOTO" \
        "$EC2_HOST" &
    TUNEL_PID=$!
}

esperar_servicio() {
    local puerto="$1" nombre="$2" intento=0
    until curl -s -o /dev/null "http://127.0.0.1:$puerto/health"; do
        intento=$((intento + 1))
        if [[ $intento -ge $ESPERA_MAX_SEG ]]; then
            fatal "$nombre no respondió en ${ESPERA_MAX_SEG}s.
       Si el puerto $puerto ya estaba ocupado, el túnel no pudo abrirse:
       probá con ${nombre^^}_PORT=<otro puerto>."
        fi
        sleep 1
    done
    log "$nombre alcanzable en :$puerto"
}

sincronizar_env() {
    # Las URLs del .env.local tienen que apuntar a los puertos del túnel de ESTA
    # corrida; si no, la consola pega a un servicio que no es el que se levantó.
    sed -i.bak -E \
        -e "s|^PRONOSTICO_URL=.*|PRONOSTICO_URL=http://127.0.0.1:$PUERTO_PRONOSTICO_LOCAL|" \
        -e "s|^ANALIZADOR_URL=.*|ANALIZADOR_URL=http://127.0.0.1:$PUERTO_ANALIZADOR_LOCAL|" \
        "$AQUI/.env.local"
    rm -f "$AQUI/.env.local.bak"
}

verificar_requisitos
PUERTO_PRONOSTICO_LOCAL=$(puerto_libre "$PUERTO_PRONOSTICO_LOCAL")
PUERTO_ANALIZADOR_LOCAL=$(puerto_libre "$PUERTO_ANALIZADOR_LOCAL")
abrir_tunel
esperar_servicio "$PUERTO_PRONOSTICO_LOCAL" "pronostico"
esperar_servicio "$PUERTO_ANALIZADOR_LOCAL" "analizador"
sincronizar_env

[[ -d "$AQUI/.next" ]] || { log "compilando la consola"; (cd "$AQUI" && npm run build); }

PUERTO_CONSOLA=$(puerto_libre "$PUERTO_CONSOLA_PREFERIDO")
log "consola en http://127.0.0.1:$PUERTO_CONSOLA  (Ctrl+C para bajar todo)"
cd "$AQUI" && exec npx next start -p "$PUERTO_CONSOLA"
