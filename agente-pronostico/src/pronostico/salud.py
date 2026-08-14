"""
Salud de la INGESTA: que tan viejo es el ultimo dato del store, por variable.

SRP: solo responde "¿la ingesta esta fresca?" leyendo el store. No corre el ETL,
no pronostica, no decide que hacer con la respuesta. El borde HTTP (api.py) la
expone; un monitor externo la consulta.

Por que existe: el forecaster usa como "ahora" el ultimo dato del store, no el
reloj de pared. Si la ingesta se congela, TODO sigue respondiendo 200 con
numeros viejos y nadie se entera. El 2026-08-14 se descubrio que el ETL llevaba
9 dias fallando cada 15 min sin dejar rastro. Esto es el detector.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

import psycopg

from pronostico import config
from pronostico.domain import Variable

# Umbral de "stale" en horas. La ingesta corre cada 15 min; con la fuente sana,
# la edad del ultimo dato deberia estar muy por debajo de esto.
UMBRAL_STALE_HORAS = float(os.environ.get("INGESTA_STALE_HORAS", "6"))

ESTADO_OK = "ok"
ESTADO_STALE = "stale"
ESTADO_SIN_DATOS = "sin_datos"

_SQL_FRESCURA = """
    SELECT variable, max(ts) AS ultimo, count(*) AS filas
    FROM lecturas_ambientales_sc
    GROUP BY variable
"""
_SQL_ULTIMO_ERROR = """
    SELECT ts, evento, detalle->>'error' AS error
    FROM agente_log
    WHERE componente = 'etl' AND nivel = 'error'
    ORDER BY ts DESC
    LIMIT 1
"""
_SQL_ULTIMA_CORRIDA = """
    SELECT ts
    FROM agente_log
    WHERE componente = 'etl' AND evento = 'corrida'
    ORDER BY ts DESC
    LIMIT 1
"""


def _edad_horas(ts: datetime | None, ahora: datetime) -> float | None:
    return None if ts is None else round((ahora - ts).total_seconds() / 3600, 2)


def _estado(edad_h: float | None, umbral_h: float) -> str:
    if edad_h is None:
        return ESTADO_SIN_DATOS
    return ESTADO_OK if edad_h <= umbral_h else ESTADO_STALE


def _por_variable(conn: psycopg.Connection, ahora: datetime,
                  umbral_h: float) -> dict:
    """Frescura de cada variable esperada (aunque no tenga ninguna fila)."""
    medidas = {v: (None, 0) for v in (m.value for m in Variable)}
    for variable, ultimo, filas in conn.execute(_SQL_FRESCURA):
        medidas[variable] = (ultimo, filas)

    salida = {}
    for variable, (ultimo, filas) in medidas.items():
        edad_h = _edad_horas(ultimo, ahora)
        salida[variable] = {
            "ultimo_dato": ultimo.isoformat() if ultimo else None,
            "edad_horas": edad_h,
            "filas": filas,
            "estado": _estado(edad_h, umbral_h),
        }
    return salida


def _ultimo_error(conn: psycopg.Connection) -> dict | None:
    fila = conn.execute(_SQL_ULTIMO_ERROR).fetchone()
    if fila is None:
        return None
    ts, evento, error = fila
    return {"ts": ts.isoformat(), "evento": evento, "error": error}


def _ultima_corrida(conn: psycopg.Connection, ahora: datetime) -> dict:
    fila = conn.execute(_SQL_ULTIMA_CORRIDA).fetchone()
    ts = fila[0] if fila else None
    return {
        "ts": ts.isoformat() if ts else None,
        "edad_horas": _edad_horas(ts, ahora),
    }


def estado_ingesta(umbral_horas: float | None = None) -> dict:
    """Reporte de salud de la ingesta: frescura por variable + ultimo error.

    `estado` global = el PEOR de las variables (sin_datos > stale > ok), para
    que un monitor pueda alertar mirando un solo campo.
    """
    umbral_h = UMBRAL_STALE_HORAS if umbral_horas is None else umbral_horas
    ahora = datetime.now(timezone.utc)
    with psycopg.connect(config.store_conninfo(), autocommit=True) as conn:
        variables = _por_variable(conn, ahora, umbral_h)
        reporte = {
            "estado": _peor_estado(v["estado"] for v in variables.values()),
            "umbral_stale_horas": umbral_h,
            "consultado_en": ahora.isoformat(),
            "variables": variables,
            "ultima_corrida_etl": _ultima_corrida(conn, ahora),
            "ultimo_error_etl": _ultimo_error(conn),
        }
    return reporte


def _peor_estado(estados) -> str:
    """sin_datos manda sobre stale, y stale sobre ok."""
    orden = {ESTADO_OK: 0, ESTADO_STALE: 1, ESTADO_SIN_DATOS: 2}
    peor = max(estados, key=lambda e: orden[e], default=ESTADO_SIN_DATOS)
    return peor
