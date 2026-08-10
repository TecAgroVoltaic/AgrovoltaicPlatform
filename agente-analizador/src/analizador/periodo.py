"""Normaliza el periodo [desde, hasta) de una consulta. Responsabilidad unica.

Los timestamps se guardaron como hora local de Costa Rica; filtrar por fecha ISO
aqui equivale a filtrar por fecha LOCAL. None -> limite abierto (todo el historico).
"""
from __future__ import annotations


def rango(desde: str | None = None, hasta: str | None = None) -> tuple[str, str]:
    """(desde, hasta) como strings ISO; None -> limites abiertos."""
    return (desde or "2000-01-01", hasta or "2100-01-01")
