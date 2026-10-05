"""
ETL AgroDash (Cartago, SOLO LECTURA) -> Supabase store `lecturas_ambientales`.

Arquitectura A: trae la data ambiental de San Carlos (que hoy vive en AgroDash)
al store propio del agente, para que el forecaster la lea local y quede historia.

  SOURCE : config.conninfo()        -> AgroDash (read-only). El ESQUEMA de la URL
                                       elige el camino: postgresql:// = DB directa
                                       o replica; https:// = API publica de Cartago.
                                       Ver `ingesta/`.
  STORE  : os.environ['STORE_URL']  -> Supabase de AgroVoltaic (Session pooler).

Propiedades:
  * IDEMPOTENTE: PK del store = (serie_id, ts). Se hace COPY a una tabla temporal
    y luego INSERT ... SELECT ... ON CONFLICT (serie_id, ts) DO NOTHING.
    Re-correr nunca duplica, aunque haya lecturas con el mismo created_at: el
    canal (serie_id) desambigua las que comparten timestamp por venir del mismo
    lote. readings.id se conserva en `origen_id` para trazabilidad, sin indice
    (NULL cuando la fuente es la API publica, que no lo expone).
  * INCREMENTAL: arranca desde max(ts) del store (menos un solape). Con --full
    re-escanea desde BACKFILL_SINCE (el conflicto igual protege de duplicar).
  * ESCALABLE EN MEMORIA: la fuente streamea (cursor SERVER-SIDE en Postgres,
    paginado por ventanas en HTTP) y se vuelca por COPY -> nunca carga 1.6M
    filas en RAM.
  * SIN FUGA DE TZ: created_at/timestamp_real de AgroDash son NAIVE hora LOCAL
    (UTC-6); se etiquetan explicitamente America/Costa_Rica antes de insertar.
  * OBSERVABLE: cada corrida deja filas en `agente_log` (componente 'etl').

Uso (en la EC2, unico nodo con acceso a ambas DBs):
    STORE_URL=... python -m predictivo.etl            # incremental, todos los targets
    STORE_URL=... python -m predictivo.etl --full      # backfill desde BACKFILL_SINCE
    STORE_URL=... python -m predictivo.etl --full --variable irradiancia
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import psycopg

from predictivo import config, ingesta

CR = ZoneInfo("America/Costa_Rica")

# Que traer: cada target = una (variable normalizada) <- (caja, type crudo de AgroDash).
# Trae TODOS los canales (sensor_id) que casen box+type; el store los desambigua.
TARGETS = [
    dict(variable="irradiancia",   caja="Caja Irradiancia SC", tipo="irradiancia", unidad="crudo"),
    dict(variable="humedad_suelo", caja="Caja Hum_Suelo SC",   tipo="humedad",     unidad="adc"),
]

# Al reanudar, re-mira un poco antes del watermark por si un lote entro tarde.
OVERLAP = timedelta(hours=2)
# Piso del backfill --full (configurable). ~2.7 meses hasta el congelamiento del
# 2026-07-23: de sobra para persistencia + climatologia, y liviano en storage.
BACKFILL_SINCE = os.environ.get("BACKFILL_SINCE", "2026-05-01")
# Tamaño de lote de escritura: COPY+upsert+commit por bloque. Chico para no chocar
# con el statement_timeout de Supabase ni retener locks/temp grandes.
BATCH = 50000
# Corte rapido si la fuente no responde (fuente caida). El timer corre cada 15
# min: colgarse dos minutos por corrida no aporta nada.
CONNECT_TIMEOUT_SEG = int(os.environ.get("SOURCE_CONNECT_TIMEOUT", "15"))

_TMP_DDL = """
    CREATE TEMP TABLE _stage (
        origen_id   text, caja text, variable text, sensor_type text, sensor_id text,
        ts timestamptz, ts_medicion timestamptz, valor double precision, unidad text
    ) ON COMMIT DROP
"""
_COPY_SQL = (
    "COPY _stage (origen_id, caja, variable, sensor_type, sensor_id, "
    "ts, ts_medicion, valor, unidad) FROM STDIN"
)
# El store esta normalizado (migracion 002): dimension aparte de los hechos. Por
# eso el volcado son DOS sentencias en vez de una.
#
# La primera da de alta los canales que traiga el lote. Va siempre, no solo la
# primera vez: si AgroDash estrena un sensor, el ETL lo ingiere en vez de
# reventar con un FK violation.
_INSERT_SERIES = """
    INSERT INTO series_ambientales
        (fuente, caja, variable, sensor_type, sensor_id, unidad)
    SELECT DISTINCT 'agrodash', caja, variable, sensor_type, sensor_id::uuid, unidad
    FROM _stage
    ON CONFLICT ON CONSTRAINT series_ambientales_natural_key DO NOTHING
"""
# La segunda mete los hechos. La idempotencia paso de `origen_id` a
# `(serie_id, ts)`: se verifico que el par es unico en las 885.606 filas
# historicas, y asi nos ahorramos un indice de 66 MB sobre un uuid en texto.
# `origen_id` se guarda igual (uuid, sin indice) para no perder la trazabilidad
# hacia readings.id de AgroDash.
_INSERT_SELECT = """
    INSERT INTO lecturas_ambientales
        (serie_id, ts, ts_medicion, valor, origen_id)
    SELECT s.serie_id, g.ts, g.ts_medicion, g.valor, g.origen_id::uuid
    FROM _stage g
    JOIN series_ambientales s
      ON  s.fuente      = 'agrodash'
      AND s.caja        = g.caja
      AND s.variable    = g.variable
      AND s.sensor_type = g.sensor_type
      AND s.sensor_id   = g.sensor_id::uuid
      AND s.unidad IS NOT DISTINCT FROM g.unidad
    ON CONFLICT (serie_id, ts) DO NOTHING
"""


def _localizar(dt: datetime | None) -> datetime | None:
    """Etiqueta un timestamp NAIVE de AgroDash como hora local CR (no lo mueve)."""
    return dt.replace(tzinfo=CR) if dt is not None else None


def _watermark(store: psycopg.Connection, variable: str) -> datetime | None:
    row = store.execute(
        "SELECT max(l.ts) FROM lecturas_ambientales l "
        "JOIN series_ambientales s USING (serie_id) WHERE s.variable = %s",
        (variable,),
    ).fetchone()
    return row[0] if row else None


def _count(store: psycopg.Connection, variable: str) -> int:
    return store.execute(
        "SELECT count(*) FROM lecturas_ambientales l "
        "JOIN series_ambientales s USING (serie_id) WHERE s.variable = %s",
        (variable,),
    ).fetchone()[0]


def _log(store: psycopg.Connection, nivel: str, evento: str, detalle: dict) -> None:
    store.execute(
        "INSERT INTO agente_log (componente, nivel, evento, detalle) "
        "VALUES ('etl', %s, %s, %s)",
        (nivel, evento, json.dumps(detalle, default=str)),
    )


def _flush(store: psycopg.Connection, rows: list[tuple]) -> None:
    """Vuelca un lote: COPY a tabla temporal + INSERT ... ON CONFLICT + commit.
    Cada lote es una transaccion corta -> no choca con el statement_timeout."""
    if not rows:
        return
    with store.cursor() as scur:
        scur.execute(_TMP_DDL)
        with scur.copy(_COPY_SQL) as cp:
            for r in rows:
                cp.write_row(r)
        scur.execute(_INSERT_SERIES)          # canales nuevos, si los hay
        scur.execute(_INSERT_SELECT)          # ON CONFLICT DO NOTHING (idempotente)
    store.commit()                             # dispara ON COMMIT DROP de _stage


def _ingest(src: ingesta.FuenteLecturas, store: psycopg.Connection,
            tgt: dict, desde: datetime) -> dict:
    """Vuelca (streaming + COPY por lotes) las lecturas de un target, idempotente.

    `src` puede ser Postgres o la API publica: el ETL no distingue. Lo unico que
    le pide es el iterable de `lecturas()`, y lo que llegue con `ts_medicion` u
    `origen_id` en None se guarda asi (la API no expone ninguno de los dos).
    """
    var = tgt["variable"]
    before = _count(store, var)
    leidas = 0
    buf: list[tuple] = []
    # La fuente STREAMEA (cursor server-side o paginado por ventanas): nunca se
    # carga todo en RAM. Cual de las dos es, lo decidio `ingesta.abrir` por la URL.
    for rid, box, sid, styp, creado, medido, valor in src.lecturas(
            tgt["caja"], tgt["tipo"], desde):
        buf.append((
            rid, box, var, styp, sid,
            _localizar(creado), _localizar(medido),
            float(valor) if valor is not None else None, tgt["unidad"],
        ))
        leidas += 1
        if len(buf) >= BATCH:
            _flush(store, buf)
            buf.clear()
    _flush(store, buf)                         # ultimo lote parcial
    after = _count(store, var)
    return {
        "leidas": leidas,
        "insertadas": after - before,
        "desde": str(desde),
        "ult_ts_store": str(_watermark(store, var)),
    }


def _targets(variables: list[str] | None) -> list[dict]:
    """TARGETS filtrados por nombre de variable. Sin filtro, todos.

    Acotar importa en backfills: `--full` sobre todos los targets puede traer
    cientos de miles de filas de una variable que no interesa (y el store tiene
    cuota). Falla explicito si el nombre no existe, en vez de no hacer nada.
    """
    if not variables:
        return TARGETS
    conocidas = {t["variable"] for t in TARGETS}
    desconocidas = set(variables) - conocidas
    if desconocidas:
        raise SystemExit(
            f"variable(s) desconocida(s): {sorted(desconocidas)}. "
            f"Disponibles: {sorted(conocidas)}"
        )
    return [t for t in TARGETS if t["variable"] in variables]


def _ingestar_targets(src: ingesta.FuenteLecturas, store: psycopg.Connection,
                      full: bool, variables: list[str] | None = None) -> dict:
    """Corre cada target. Un fallo de UN target no aborta los demas: se loguea
    y se sigue (el corte total lo maneja run(), que cubre la conexion)."""
    resumen: dict = {}
    for tgt in _targets(variables):
        var = tgt["variable"]
        try:
            wm = None if full else _watermark(store, var)
            if wm is None:
                desde = datetime.fromisoformat(BACKFILL_SINCE)   # piso del backfill
            else:
                desde = (wm - OVERLAP).astimezone(CR).replace(tzinfo=None)
            resumen[var] = _ingest(src, store, tgt, desde)
            _log(store, "info", f"ingesta:{var}", resumen[var])
            store.commit()
        except Exception as exc:                             # noqa: BLE001
            store.rollback()
            _log(store, "error", f"fallo:{var}", {"error": str(exc)})
            store.commit()
            resumen[var] = {"error": str(exc)}
    return resumen


def run(full: bool = False, variables: list[str] | None = None) -> dict:
    """Corre el ETL para los TARGETS (todos, o los de `variables`).

    El STORE se conecta PRIMERO y la fuente DENTRO del try: si la fuente esta
    caida (Cartago apagado -> ConnectionTimeout), el fallo queda registrado en
    `agente_log` en vez de morir en silencio. Antes la conexion a la fuente
    ocurria fuera de todo try/except y el ETL fallo 9 dias sin dejar rastro.
    """
    src_dsn = config.conninfo()                              # AgroDash (read-only)
    store_dsn = os.environ.get("STORE_URL") or getattr(config, "STORE_URL", None)
    if not store_dsn:
        raise SystemExit("STORE_URL no definida (Supabase de AgroVoltaic).")

    t0 = time.time()
    with psycopg.connect(store_dsn) as store:
        # Cinturon extra: aunque los lotes son chicos, evita que un lote quede
        # colgado indefinidamente si la red se degrada.
        store.execute("SET statement_timeout = '120s'")
        store.commit()

        try:
            # El esquema de la URL elige Postgres o la API publica. El timeout
            # explicito vale para las dos: si la fuente no responde hay que cortar
            # rapido, no colgarse hasta el default del sistema (el timer corre cada
            # 15 min; esperar mas no aporta nada).
            with ingesta.abrir(src_dsn, timeout_seg=CONNECT_TIMEOUT_SEG) as src:
                resumen = _ingestar_targets(src, store, full, variables)
        except Exception as exc:                             # noqa: BLE001
            store.rollback()
            _log(store, "error", "fallo:fuente", {
                "error": str(exc), "tipo": type(exc).__name__,
            })
            store.commit()
            raise                                            # el timer lo marca failed

        _log(store, "info", "corrida", {
            "seg": round(time.time() - t0, 1), "full": full,
            "variables": variables, "backfill_since": BACKFILL_SINCE,
            "resumen": resumen,
        })
        store.commit()
    return resumen


def _variables_de_argv(argv: list[str]) -> list[str] | None:
    """Lee `--variable X` (repetible) o `--variable=X,Y`. Sin flag -> None."""
    variables: list[str] = []
    for i, arg in enumerate(argv):
        if arg.startswith("--variable="):
            variables += arg.split("=", 1)[1].split(",")
        elif arg == "--variable" and i + 1 < len(argv):
            variables += argv[i + 1].split(",")
    return [v.strip() for v in variables if v.strip()] or None


def main() -> None:
    argv = sys.argv[1:]
    resumen = run(full="--full" in argv, variables=_variables_de_argv(argv))
    print(json.dumps(resumen, indent=2, default=str, ensure_ascii=False))


if __name__ == "__main__":
    main()
