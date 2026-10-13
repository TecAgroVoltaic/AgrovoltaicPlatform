"""Arma el catalogo de las cuatro fuentes, con cache, y resuelve un id a su variable.

Reusa el cache de diez minutos del inventario de fuentes (`fuentes._CACHE`): la
cobertura de las tablas PV y del store cuesta segundos y solo cambia con la carga
diaria. AgroDash caido no tumba el catalogo: sus dos fuentes salen vacias y el fallo
no se cachea (la proxima peticion lo reintenta).
"""
from __future__ import annotations

import logging
import unicodedata

from historico import agrodash_api, cache, fuentes
from historico.catalogo_datos import agrodash, ambiental, pv
from historico.catalogo_datos.cobertura_agrodash import ultimos_san_carlos
from historico.catalogo_datos.modelo import FUENTES, VERSION, VariableDatos, VariableNoCatalogada
from historico.fuentes import supabase
from historico.fuentes.catalogo import AGRODASH_CARTAGO, AGRODASH_SC

_log = logging.getLogger(__name__)
_CACHE_ULTIMO = cache.registrar(cache.CacheBreve(ttl_seg=fuentes.TTL_INVENTARIO_SEG))


def _cacheado(clave: str, calcular):
    try:
        return _CACHE_ULTIMO.obtener(clave, calcular)
    except agrodash_api.AgroDashNoDisponible as exc:
        _log.warning("catalogo sin %s de AgroDash: %s", clave, exc)
        return None


def variables() -> list[VariableDatos]:
    """Todas las variables disponibles, en el orden de las fuentes del contrato."""
    tablas = fuentes._CACHE.obtener("tablas_pv", supabase.tablas_pv)
    series = fuentes._CACHE.obtener("series_ambientales", supabase.series_ambientales)
    cobertura = {t["relacion"]: (t["desde"], t["hasta"]) for t in tablas}
    out = pv.variables(cobertura) + ambiental.variables(series)
    cajas = fuentes._cajas_agrodash()
    if cajas is not None:
        ultimo = _cacheado("ultimo", lambda: agrodash_api.rango_disponible().get("last"))
        ultimos_sc = _cacheado("ultimos_sc", ultimos_san_carlos)
        for id_fuente in (AGRODASH_SC, AGRODASH_CARTAGO):
            region = agrodash.REGION_DE_FUENTE[id_fuente]
            out += agrodash.variables(id_fuente, cajas[region], ultimo,
                                      ultimos_sc if id_fuente == AGRODASH_SC else None)
    return out


def resolver(id_variable: str, catalogo: list[VariableDatos] | None = None) -> VariableDatos:
    """La variable de un id `"<SourceId>:<clave>"`, o `VariableNoCatalogada` (400)."""
    fuente, _, clave = str(id_variable or "").partition(":")
    if fuente not in FUENTES or not clave:
        raise VariableNoCatalogada(
            f"id de variable invalido: {id_variable!r} (esperaba '<fuente>:<clave>', "
            f"fuentes: {', '.join(FUENTES)})")
    for v in catalogo if catalogo is not None else variables():
        if v.fuente == fuente and v.clave == clave:
            return v
    raise VariableNoCatalogada(f"variable {id_variable!r} no esta en el catalogo (o su fuente no responde)")


def _plano(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return sin_tildes.lower()


def filtrar(vs: list[VariableDatos], consulta: str | None = None,
            fuentes_: list[str] | None = None) -> list[VariableDatos]:
    """Subconjunto por fuente y por texto (etiqueta, clave o grupo; sin tildes)."""
    if fuentes_:
        vs = [v for v in vs if v.fuente in set(fuentes_)]
    if consulta and consulta.strip():
        palabras = _plano(consulta).split()
        vs = [v for v in vs
              if all(p in _plano(f"{v.etiqueta} {v.clave} {v.grupo_etiqueta}") for p in palabras)]
    return vs


def grupos(vs: list[VariableDatos]) -> list[dict]:
    """Agrupa por (fuente, grupo) respetando el orden de aparicion (contrato §2)."""
    out: dict[tuple[str, str], dict] = {}
    for v in vs:
        g = out.setdefault((v.fuente, v.grupo), {"fuente": v.fuente, "grupo": v.grupo,
                                                 "etiqueta": v.grupo_etiqueta, "variables": []})
        g["variables"].append(v.publica())
    return list(out.values())


def catalogo(consulta: str | None = None, fuentes_: list[str] | None = None) -> dict:
    """El cuerpo de `GET /datos/catalogo`."""
    return {"version": VERSION, "grupos": grupos(filtrar(variables(), consulta, fuentes_))}
