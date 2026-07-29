"""
ETL AgroDash (Cartago, SOLO LECTURA) -> Supabase store `lecturas_ambientales_sc`.

Arquitectura A: trae la data ambiental de San Carlos (que hoy vive en AgroDash)
al store propio del agente, para que el forecaster la lea local y quede historia.

  SOURCE : config.conninfo()        -> AgroDash (read-only). Cartago via tailnet.
  STORE  : os.environ['STORE_URL']  -> Supabase de AgroVoltaic (Session pooler).

Propiedades:
  * IDEMPOTENTE: PK del store = readings.id de AgroDash. Se hace COPY a una tabla
    temporal y luego INSERT ... SELECT ... ON CONFLICT (origen_id) DO NOTHING.
    Re-correr nunca duplica, aunque haya lecturas con el mismo created_at.
  * INCREMENTAL: arranca desde max(ts) del store (menos un solape). Con --full
    re-escanea desde BACKFILL_SINCE (el conflicto igual protege de duplicar).
  * ESCALABLE EN MEMORIA: la fuente se lee con cursor SERVER-SIDE (streaming) y
    se vuelca por COPY -> nunca carga 1.6M filas en RAM.
  * SIN FUGA DE TZ: created_at/timestamp_real de AgroDash son NAIVE hora LOCAL
    (UTC-6); se etiquetan explicitamente America/Costa_Rica antes de insertar.
  * OBSERVABLE: cada corrida deja filas en `agente_log` (componente 'etl').

Uso (en la EC2, unico nodo con acceso a ambas DBs):
    STORE_URL=... python -m pronostico.etl            # incremental
    STORE_URL=... python -m pronostico.etl --full      # backfill desde BACKFILL_SINCE
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import psycopg

from pronostico import config

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
# Cuantas filas trae por viaje el cursor server-side (control de memoria).
ITERSIZE = 20000
# Tamaño de lote de escritura: COPY+upsert+commit por bloque. Chico para no chocar
# con el statement_timeout de Supabase ni retener locks/temp grandes.
BATCH = 50000

_SQL_SOURCE = """
    SELECT r.id::text, b.name, s.id::text, s.type,
           r.created_at, r.timestamp_real, r.value
    FROM readings r
    JOIN sensors s ON s.id = r.sensor_id
    JOIN boxes   b ON b.id = s.box_id
    WHERE b.name = %s AND s.type = %s
      AND r.created_at >= %s
    ORDER BY r.created_at
"""

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
_INSERT_SELECT = """
    INSERT INTO lecturas_ambientales_sc
        (origen_id, fuente, caja, variable, sensor_type, sensor_id,
         ts, ts_medicion, valor, unidad)
    SELECT origen_id, 'agrodash', caja, variable, sensor_type, sensor_id,
           ts, ts_medicion, valor, unidad
    FROM _stage
    ON CONFLICT (origen_id) DO NOTHING
"""


def _localizar(dt: datetime | None) -> datetime | None:
    """Etiqueta un timestamp NAIVE de AgroDash como hora local CR (no lo mueve)."""
    return dt.replace(tzinfo=CR) if dt is not None else None


def _watermark(store: psycopg.Connection, variable: str) -> datetime | None:
    row = store.execute(
        "SELECT max(ts) FROM lecturas_ambientales_sc WHERE variable = %s", (variable,)
    ).fetchone()
    return row[0] if row else None


def _count(store: psycopg.Connection, variable: str) -> int:
    return store.execute(
        "SELECT count(*) FROM lecturas_ambientales_sc WHERE variable = %s", (variable,)
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
        scur.execute(_INSERT_SELECT)          # ON CONFLICT DO NOTHING (idempotente)
    store.commit()                             # dispara ON COMMIT DROP de _stage


def _ingest(src: psycopg.Connection, store: psycopg.Connection,
            tgt: dict, desde: datetime) -> dict:
    """Vuelca (streaming + COPY por lotes) las lecturas de un target, idempotente."""
    var = tgt["variable"]
    before = _count(store, var)
    leidas = 0
    buf: list[tuple] = []
    # Cursor SERVER-SIDE en la fuente: streamea de a ITERSIZE, no carga todo en RAM.
    with src.cursor(name=f"src_{var}") as cur:
        cur.itersize = ITERSIZE
        cur.execute(_SQL_SOURCE, (tgt["caja"], tgt["tipo"], desde))
        for rid, box, sid, styp, cat, tsr, val in cur:
            buf.append((
                rid, box, var, styp, sid,
                _localizar(cat), _localizar(tsr),
                float(val) if val is not None else None, tgt["unidad"],
            ))
            leidas += 1
            if len(buf) >= BATCH:
                _flush(store, buf)
                buf.clear()
        _flush(store, buf)                     # ultimo lote parcial
    src.rollback()                             # cierra la txn read-only de la fuente
    after = _count(store, var)
    return {
        "leidas": leidas,
        "insertadas": after - before,
        "desde": str(desde),
        "ult_ts_store": str(_watermark(store, var)),
    }


def run(full: bool = False) -> dict:
    """Corre el ETL para todos los TARGETS. Devuelve el resumen por variable."""
    src_dsn = config.conninfo()                              # AgroDash (read-only)
    store_dsn = os.environ.get("STORE_URL") or getattr(config, "STORE_URL", None)
    if not store_dsn:
        raise SystemExit("STORE_URL no definida (Supabase de AgroVoltaic).")

    t0 = time.time()
    resumen: dict = {}
    with psycopg.connect(src_dsn) as src, \
            psycopg.connect(store_dsn) as store:
        src.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
        src.commit()
        # Cinturon extra: aunque los lotes son chicos, evita que un lote quede
        # colgado indefinidamente si la red se degrada.
        store.execute("SET statement_timeout = '120s'")
        store.commit()

        for tgt in TARGETS:
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

        _log(store, "info", "corrida", {
            "seg": round(time.time() - t0, 1), "full": full,
            "backfill_since": BACKFILL_SINCE, "resumen": resumen,
        })
        store.commit()
    return resumen


def main() -> None:
    full = "--full" in sys.argv[1:]
    resumen = run(full=full)
    print(json.dumps(resumen, indent=2, default=str, ensure_ascii=False))


if __name__ == "__main__":
    main()
