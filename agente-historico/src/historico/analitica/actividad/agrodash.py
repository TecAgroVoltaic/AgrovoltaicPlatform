"""Lecturas por dia de AgroDash, por region, via su API publica. SOLO LECTURA.

Una llamada por CAJA y no por sensor: se toma un sensor representativo de cada caja
(el de mas bajo numero) y se piden buckets de un dia. Una caja que reporta graba
todos sus sensores juntos, asi que su sensor representativo dice si la caja grabo
ese dia, y el costo queda en ~una llamada por caja aunque Cartago tenga cientos de
sensores. Las cajas de prueba no describen el sitio y se excluyen.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, wait
from datetime import date, datetime, time, timedelta

from historico import agrodash_api, cache
from historico.analitica.climatologia.agrodash import MARCA_CAJA_DE_PRUEBA

PASO_DIA_SEG = 86_400
_MEDIO_DIA = timedelta(seconds=PASO_DIA_SEG / 2)
MAX_LLAMADAS_SIMULTANEAS = 4
# Plazo TOTAL por region. La API es ajena y su DNS falla a ratos: sin plazo, los
# reintentos de una caja colgada demoraban la respuesta del chat decenas de minutos.
PLAZO_SEG = 60
# Solo se guarda lo que RESPONDIO, caja por caja: un reintento pide solo las que fallaron
# y un calendario incompleto nunca queda guardado como si fuera bueno.
_CACHE = cache.registrar(cache.CacheBreve(ttl_seg=600))


def _representantes(region: str) -> list[dict]:
    """Un sensor por caja de la region, sin cajas de prueba."""
    por_caja: dict[str, dict] = {}
    for s in agrodash_api.sensores():
        caja = str(s["caja"])
        if agrodash_api.region_de(caja) != region or MARCA_CAJA_DE_PRUEBA in caja:
            continue
        actual = por_caja.get(caja)
        if actual is None or int(s["sensor_numero"] or 0) < int(actual["sensor_numero"] or 0):
            por_caja[caja] = s
    return list(por_caja.values())


def _por_dia(sensor: dict, desde: date, hasta: date) -> dict[str, int]:
    return _CACHE.obtener((sensor["sensor_id"], desde, hasta),
                          lambda: _por_dia_api(sensor, desde, hasta))


def _por_dia_api(sensor: dict, desde: date, hasta: date) -> dict[str, int]:
    ini = datetime.combine(desde, time.min)
    fin = datetime.combine(hasta + timedelta(days=1), time.min)
    out: dict[str, int] = {}
    for b in agrodash_api.lecturas(sensor["sensor_id"], ini, fin, PASO_DIA_SEG):
        n = int(b.get("n") or 0)
        if n:
            # La API etiqueta el bucket en su CENTRO: el dia es la etiqueta menos medio dia.
            dia = (datetime.fromisoformat(b["bucket"]) - _MEDIO_DIA).date().isoformat()
            out[dia] = out.get(dia, 0) + n
    return out


def _motivo(exc: BaseException) -> str:
    return f"{type(exc).__name__}: {str(exc).strip()}"[:200]


def conteos(region: str, desde: date, hasta: date) -> tuple[dict[str, int], list[dict]]:
    """`({fecha: lecturas}, fallas)` sumando las cajas que respondieron dentro del plazo.
    Cada falla es `{caja, motivo}`. Lanza `AgroDashNoDisponible` si no hay sensores."""
    sensores = _representantes(region)
    pool = ThreadPoolExecutor(max_workers=MAX_LLAMADAS_SIMULTANEAS)
    futuros = {pool.submit(_por_dia, s, desde, hasta): str(s["caja"]) for s in sensores}
    listos, pendientes = wait(futuros, timeout=PLAZO_SEG)
    pool.shutdown(wait=False, cancel_futures=True)
    total: dict[str, int] = {}
    fallas = [{"caja": futuros[f], "motivo": f"sin respuesta en {PLAZO_SEG} s"} for f in pendientes]
    for futuro in listos:
        if futuro.exception() is not None:
            fallas.append({"caja": futuros[futuro], "motivo": _motivo(futuro.exception())})
            continue
        for dia, n in futuro.result().items():
            total[dia] = total.get(dia, 0) + n
    return total, fallas
