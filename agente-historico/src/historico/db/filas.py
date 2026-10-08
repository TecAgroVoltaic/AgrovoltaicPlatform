"""Filas de un cursor como dicts JSON-serializables (Decimal->float, fecha->ISO)."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal


def _limpiar(v):
    """Valor JSON-serializable: Decimal->float, datetime/date->ISO, resto igual."""
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


def _filas(cur) -> list[dict]:
    """Lo que devolvio el ultimo `execute`, como dicts limpios. [] si no devuelve filas."""
    if cur.description is None:
        return []
    cols = [d.name for d in cur.description]
    return [{c: _limpiar(v) for c, v in zip(cols, row)} for row in cur.fetchall()]
