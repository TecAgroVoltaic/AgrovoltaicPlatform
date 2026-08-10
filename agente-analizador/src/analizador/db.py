"""Acceso a la DB — responsabilidad unica: consulta parametrizada de SOLO LECTURA.

Ninguna tool abre conexiones ni arma SQL con f-strings de valores: todas pasan por
`query()`/`uno()`, que fuerzan la transaccion read-only y usan parametros (%s) -> sin
inyeccion. Devuelve filas ya JSON-serializables (Decimal->float, fecha->ISO) para que
las tools no se preocupen por tipos.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

import psycopg

from analizador import config


def _limpiar(v):
    """Valor JSON-serializable: Decimal->float, datetime/date->ISO, resto igual."""
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


def query(sql: str, params: tuple = ()) -> list[dict]:
    """Ejecuta una consulta de SOLO LECTURA y devuelve filas como lista de dicts."""
    with psycopg.connect(config.database_url(), autocommit=True) as conn:
        conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
        with conn.cursor() as cur:
            cur.execute(sql, params)
            cols = [d.name for d in cur.description]
            return [{c: _limpiar(v) for c, v in zip(cols, row)} for row in cur.fetchall()]


def uno(sql: str, params: tuple = ()) -> dict:
    """Como query() pero para consultas de UNA fila (agregados). {} si vacio."""
    filas = query(sql, params)
    return filas[0] if filas else {}
