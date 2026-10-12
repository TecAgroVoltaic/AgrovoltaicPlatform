"""URLs relativas del plan (las unicas que el frontend acepta: `/datos/exportar/plan?`)."""
from __future__ import annotations

RUTA = "/datos/exportar/plan"
RUTA_ESTIMAR = "/datos/exportar/plan/estimar"


def url_archivo(p: str, indice: int) -> str:
    return f"{RUTA}?p={p}&archivo={int(indice)}"


def url_zip(p: str) -> str:
    return f"{RUTA}?p={p}&zip=1"
