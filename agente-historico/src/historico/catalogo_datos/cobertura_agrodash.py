"""Ultimo dato REAL por tipo de sensor en las cajas de San Carlos (`/readings/last`).

El `last` global de la API dice "2026-10-12" aunque la temperatura de las cajas SC
dejo de llegar en julio: con ese `hasta` el catalogo ofreceria un rango vacio. San
Carlos tiene unas decenas de sensores, asi que una llamada por sensor (en paralelo,
cacheada diez minutos) es barata. Cartago tiene cientos: ahi se sigue usando el
`last` global y la nota lo dice.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

from historico import agrodash_api

_log = logging.getLogger(__name__)
_PARALELO = 8


def _ultimo(sensor_id: str) -> str | None:
    try:
        r = agrodash_api._get("readings/last", sensor_id=sensor_id)
    except agrodash_api.AgroDashNoDisponible:
        return None
    return r.get("bucket") if isinstance(r, dict) else None


def ultimos_san_carlos() -> dict[str, str]:
    """tipo -> ultimo dia con dato (YYYY-MM-DD) entre los sensores SC de ese tipo."""
    sens = [s for s in agrodash_api.sensores() if agrodash_api.es_san_carlos(s["caja"])]
    with ThreadPoolExecutor(max_workers=_PARALELO) as pool:
        ultimos = list(pool.map(lambda s: _ultimo(s["sensor_id"]), sens))
    out: dict[str, str] = {}
    for s, ultimo in zip(sens, ultimos):
        if ultimo:
            dia = ultimo[:10]
            out[s["sensor_tipo"]] = max(out.get(s["sensor_tipo"], dia), dia)
    _log.debug("ultimo dato por tipo en San Carlos: %s", out)
    return out
