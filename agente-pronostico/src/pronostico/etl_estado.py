"""
Que hizo el ETL, leido de `agente_log`.

SRP: traducir los eventos que deja `pronostico.etl` a un estado legible — cuando
corrio, si termino bien, cuantas filas metio y cual fue su ultimo error. No corre
el ETL ni decide si la ingesta esta fresca (eso es salud.py). Recibe la conexion
al store ya abierta para no multiplicar conexiones por bloque del panel.

Por que existe: "el ETL corrio hace 3 minutos" NO significa que la ingesta este
sana. Desde el 2026-08-14 la fuente es una replica de un dump, asi que cada
corrida termina en verde con 0 filas insertadas. Sin ver las filas de la ultima
corrida, un panel diria "todo bien" mientras hace semanas que no entra un dato.
Y al reves: si la fuente esta caida, el ETL ni siquiera llega a registrar la
corrida (revienta antes) — por eso `fallando` compara el ultimo error contra la
ultima corrida en vez de confiar en que la corrida vieja siga vigente.
"""
from __future__ import annotations

from datetime import datetime

import psycopg

_SQL_ULTIMA_CORRIDA = """
    SELECT ts, detalle
    FROM agente_log
    WHERE componente = 'etl' AND evento = 'corrida'
    ORDER BY ts DESC
    LIMIT 1
"""
_SQL_ULTIMO_ERROR = """
    SELECT ts, evento, detalle->>'error' AS error
    FROM agente_log
    WHERE componente = 'etl' AND nivel = 'error'
    ORDER BY ts DESC
    LIMIT 1
"""


def edad_horas(ts: datetime | None, ahora: datetime) -> float | None:
    """Antiguedad en horas de un instante. None si no hay instante."""
    return None if ts is None else round((ahora - ts).total_seconds() / 3600, 2)


def _por_variable(detalle: dict) -> dict:
    """Lo que hizo la corrida en cada variable (el `resumen` que escribe el ETL).

    Un target que fallo deja `{"error": ...}` en vez de conteos: se conserva tal
    cual para poder distinguir "trajo 0 filas" de "no se pudo ni intentar".
    """
    resumen = (detalle or {}).get("resumen") or {}
    return {
        variable: {
            "leidas": datos.get("leidas"),
            "insertadas": datos.get("insertadas"),
            "error": datos.get("error"),
        }
        for variable, datos in resumen.items()
    }


def _total(por_variable: dict, campo: str) -> int | None:
    """Suma de un conteo entre variables. None si ninguna lo reporto."""
    valores = [v[campo] for v in por_variable.values() if v[campo] is not None]
    return sum(valores) if valores else None


def _formatear_corrida(fila: tuple | None, ahora: datetime) -> dict:
    """Ultima corrida COMPLETA del ETL, con lo que efectivamente ingirio."""
    if fila is None:
        return {"ts": None, "edad_horas": None, "ok": None, "duracion_seg": None,
                "full": None, "backfill_desde": None, "filas_leidas": None,
                "filas_insertadas": None, "por_variable": {}}
    ts, detalle = fila
    por_variable = _por_variable(detalle)
    return {
        "ts": ts.isoformat(),
        "edad_horas": edad_horas(ts, ahora),
        # Corrio entera y ningun target quedo en error. Que haya insertado 0
        # filas no la hace fallida: eso lo dice `filas_insertadas`.
        "ok": all(v["error"] is None for v in por_variable.values()),
        "duracion_seg": (detalle or {}).get("seg"),
        "full": (detalle or {}).get("full"),
        "backfill_desde": (detalle or {}).get("backfill_since"),
        "filas_leidas": _total(por_variable, "leidas"),
        "filas_insertadas": _total(por_variable, "insertadas"),
        "por_variable": por_variable,
    }


def _formatear_error(fila: tuple | None, ahora: datetime) -> dict | None:
    if fila is None:
        return None
    ts, evento, error = fila
    return {"ts": ts.isoformat(), "edad_horas": edad_horas(ts, ahora),
            "evento": evento, "error": error}


def _fallando(fila_corrida: tuple | None, fila_error: tuple | None) -> bool | None:
    """True si el ETL esta fallando AHORA: su ultimo error es POSTERIOR a su
    ultima corrida completa. None si no hay ninguna corrida registrada.

    Se comparan los timestamps crudos (tz-aware) y no su texto ISO: dos
    representaciones validas del mismo instante pueden ordenar distinto como
    cadena si difieren en el huso.
    """
    if fila_corrida is None:
        return None
    if fila_error is None:
        return False
    return fila_error[0] > fila_corrida[0]


def estado(conn: psycopg.Connection, ahora: datetime) -> dict:
    """Ultima corrida + ultimo error + si el ETL esta fallando en este momento."""
    fila_corrida = conn.execute(_SQL_ULTIMA_CORRIDA).fetchone()
    fila_error = conn.execute(_SQL_ULTIMO_ERROR).fetchone()
    return {
        "ultima_corrida": _formatear_corrida(fila_corrida, ahora),
        "ultimo_error": _formatear_error(fila_error, ahora),
        "fallando": _fallando(fila_corrida, fila_error),
    }
