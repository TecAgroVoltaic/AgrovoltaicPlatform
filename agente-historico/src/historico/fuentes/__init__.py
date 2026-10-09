"""Inventario vivo de DONDE vive cada dato: cuatro fuentes con su cobertura real.

* `supabase_pv`: las relaciones de la allowlist (`datos.RELACIONES`) con variables,
  primer/ultimo dia y filas.
* `supabase_ambiental`: el store `lecturas_ambientales_sc`, por caja y variable.
* `agrodash_sc` / `agrodash_cartago`: las cajas de la API publica de AgroDash,
  partidas por el sufijo " SC" del nombre.

Contar filas de tablas de un millon de lecturas tarda segundos, y la cobertura solo
cambia con la carga diaria: cada pieza se cachea diez minutos. AgroDash es ajeno: si
no responde, sus dos fuentes salen con `cajas: []` y `motivo`, sin tumbar el resto, y
el fallo no se cachea (la proxima peticion lo reintenta).

Fachada del paquete: `catalogo` (lo fijo), `supabase` (cobertura de la base propia)
y `agrodash` (cajas por region).
"""
from __future__ import annotations

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from historico import agrodash_api, cache, config, db
from historico.fuentes import agrodash, supabase
from historico.fuentes.catalogo import (  # noqa: F401
    AGRODASH_CARTAGO, AGRODASH_SC, METADATOS, SUPABASE_AMBIENTAL, SUPABASE_PV,
)

_log = logging.getLogger(__name__)

TTL_INVENTARIO_SEG = 600.0
_CACHE = cache.registrar(cache.CacheBreve(ttl_seg=TTL_INVENTARIO_SEG))
AGRODASH_NO_DISPONIBLE = "agrodash_no_disponible"


def _cajas_agrodash() -> dict[str, list[dict]] | None:
    try:
        return _CACHE.obtener("agrodash", agrodash.cajas_por_region)
    except (agrodash_api.AgroDashNoDisponible, ValueError) as exc:
        _log.warning("inventario de fuentes sin AgroDash: %s", exc)
        return None


def _fuente_agrodash(id_fuente: str, region: str, cajas: dict[str, list[dict]] | None) -> dict:
    if cajas is None:
        return {**METADATOS[id_fuente], "cajas": [], "motivo": AGRODASH_NO_DISPONIBLE}
    return {**METADATOS[id_fuente], "cajas": cajas[region], "motivo": None}


def inventario() -> dict:
    """Las cuatro fuentes con su cobertura, mas la hora local en que se armo."""
    tablas, series, cajas = db.en_paralelo(
        lambda: _CACHE.obtener("tablas_pv", supabase.tablas_pv),
        lambda: _CACHE.obtener("series_ambientales", supabase.series_ambientales),
        _cajas_agrodash,
    )
    return {
        "generado_en": datetime.now(ZoneInfo(config.TZ)).isoformat(timespec="seconds"),
        "fuentes": [
            {**METADATOS[SUPABASE_PV], "tablas": tablas},
            {**METADATOS[SUPABASE_AMBIENTAL], "series": series},
            _fuente_agrodash(AGRODASH_SC, agrodash_api.SAN_CARLOS, cajas),
            _fuente_agrodash(AGRODASH_CARTAGO, agrodash_api.CARTAGO, cajas),
        ],
    }
