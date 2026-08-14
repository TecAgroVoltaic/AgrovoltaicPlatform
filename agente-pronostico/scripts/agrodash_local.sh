#!/usr/bin/env bash
#
# Levanta la copia local de AgroDash (la DB de Cartago) para que el ETL tenga
# fuente aunque el server de Cartago y la replica del rig esten caidos.
#
# Idempotente en tres niveles: si el cluster no existe lo inicializa, si la DB
# no existe la crea, y si la DB esta vacia restaura el dump. Ya restaurada,
# solo levanta el server. Corre en foreground: Ctrl+C baja postgres.
#
# El dump se busca en el DIRECTORIO ACTUAL y, si no hay, en sql/dump/ del repo
# (debe haber exactamente un *.dump en el directorio que se use).
#
#   agente-pronostico/scripts/agrodash_local.sh     # corre desde donde sea
#   # en otra terminal:
#   psql -h 127.0.0.1 -p 5433 -U postgres -d agrodash_control
#
# Documentado en docs/memoria/proyecto/agrodash-local.md
#
set -euo pipefail

PGDATA_DIR="${AGRODASH_PGDATA:-$HOME/pgdata-agrodash}"
PGPORT="${AGRODASH_PGPORT:-5433}"
PGHOST_TCP="127.0.0.1"
PGUSER_NAME="${AGRODASH_USER:-postgres}"
DB_NAME="${AGRODASH_DB:-agrodash_control}"
# El socket unix va DENTRO del data dir: /run/postgresql no existe sin el unit
# de systemd y postgres muere al crear el lock file.
SOCKET_DIR="$PGDATA_DIR"
# Tabla testigo: si tiene filas, el dump ya se restauro.
TABLA_TESTIGO="readings"
RESTORE_JOBS="${AGRODASH_RESTORE_JOBS:-4}"
ESPERA_MAX_SEG=60
# Lugar canonico del dump en el repo (fallback si no hay uno en el dir actual).
# Este script vive en agente-pronostico/scripts/ -> tres niveles arriba = repo.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DUMP_DIR_REPO="$REPO_ROOT/sql/dump"

log() { printf '>> %s\n' "$1"; }
fatal() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }

psql_db() { psql -h "$PGHOST_TCP" -p "$PGPORT" -U "$PGUSER_NAME" -d "$DB_NAME" "$@"; }

buscar_dump_en() {
    local dir="$1" encontrados=()
    [[ -d "$dir" ]] || return 1
    while IFS= read -r -d '' f; do encontrados+=("$f"); done \
        < <(find "$dir" -maxdepth 1 -name '*.dump' -type f -print0)
    case ${#encontrados[@]} in
        0) return 1 ;;
        1) printf '%s' "${encontrados[0]}" ;;
        *) fatal "hay ${#encontrados[@]} archivos *.dump en $dir; dejá solo uno" ;;
    esac
}

buscar_dump() {
    # Primero el directorio actual; si no hay, el lugar canonico del repo.
    buscar_dump_en "." && return 0
    buscar_dump_en "$DUMP_DIR_REPO" && return 0
    fatal "no hay ningun *.dump en $(pwd) ni en $DUMP_DIR_REPO"
}

iniciar_cluster_si_falta() {
    [[ -s "$PGDATA_DIR/PG_VERSION" ]] && return 0
    log "cluster ausente en $PGDATA_DIR — inicializando"
    initdb -D "$PGDATA_DIR" -U "$PGUSER_NAME" --auth-local=trust --auth-host=trust
}

esperar_listo() {
    local intento=0
    until pg_isready -h "$PGHOST_TCP" -p "$PGPORT" -U "$PGUSER_NAME" -q; do
        intento=$((intento + 1))
        [[ $intento -ge $ESPERA_MAX_SEG ]] && fatal "postgres no acepto conexiones en ${ESPERA_MAX_SEG}s"
        sleep 1
    done
}

crear_db_si_falta() {
    local existe
    existe=$(psql -h "$PGHOST_TCP" -p "$PGPORT" -U "$PGUSER_NAME" -d postgres -tAc \
        "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'")
    [[ "$existe" == "1" ]] && return 0
    log "creando DB '$DB_NAME'"
    createdb -h "$PGHOST_TCP" -p "$PGPORT" -U "$PGUSER_NAME" "$DB_NAME"
}

contar_testigo() { psql_db -tAc "SELECT count(*) FROM $TABLA_TESTIGO"; }

ya_restaurada() {
    # to_regclass evita el ERROR en el log del server cuando la tabla no existe
    # todavia (el caso normal en el primer arranque).
    local existe
    existe=$(psql_db -tAc "SELECT to_regclass('$TABLA_TESTIGO') IS NOT NULL")
    [[ "$existe" == "t" ]] && [[ "$(contar_testigo)" -gt 0 ]]
}

restaurar_si_falta() {
    if ya_restaurada; then
        log "DB ya restaurada ($(contar_testigo) filas en $TABLA_TESTIGO) — no se toca"
        return 0
    fi
    local dump; dump=$(buscar_dump)
    log "restaurando $dump — tarda varios minutos"
    pg_restore --no-owner --no-privileges -j "$RESTORE_JOBS" \
        -h "$PGHOST_TCP" -p "$PGPORT" -U "$PGUSER_NAME" -d "$DB_NAME" "$dump"
    log "restore listo: $(contar_testigo) filas en $TABLA_TESTIGO"
    log "tamaño: $(psql_db -tAc "SELECT pg_size_pretty(pg_database_size(current_database()))")"
}

preparar_db() {
    crear_db_si_falta
    restaurar_si_falta
    log "listo. conexion: postgresql://$PGUSER_NAME@$PGHOST_TCP:$PGPORT/$DB_NAME"
}

# Si ya hay un postgres escuchando en el puerto, no se arranca otro (chocaria
# con el lock del data dir): solo se prepara la DB contra el que ya corre.
if pg_isready -h "$PGHOST_TCP" -p "$PGPORT" -U "$PGUSER_NAME" -q; then
    log "ya hay un postgres en $PGHOST_TCP:$PGPORT — no arranco otro, solo preparo la DB"
    preparar_db
    exit 0
fi

# Postgres arranca como hijo en background para poder preparar la DB; despues
# el script se queda esperandolo, asi Ctrl+C lo baja como si fuera foreground.
iniciar_cluster_si_falta
log "PostgreSQL en $PGHOST_TCP:$PGPORT (data: $PGDATA_DIR) — Ctrl+C para bajar"
postgres -D "$PGDATA_DIR" -p "$PGPORT" -k "$SOCKET_DIR" &
PG_PID=$!
trap 'kill -INT "$PG_PID" 2>/dev/null || true' INT TERM

esperar_listo
preparar_db

wait "$PG_PID"
