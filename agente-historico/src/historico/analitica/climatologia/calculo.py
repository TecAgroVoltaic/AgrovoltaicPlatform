"""Compone la climatologia mensual: irradiacion e irradiancia (PV) + temperatura y humedad (AgroDash).

Las dos secciones PV reusan `distribucion` tal cual: es el mismo numero que muestra
la figura 6, y una segunda implementacion seria un segundo numero. Las ambientales
salen de AgroDash, que es un servidor ajeno: si no responde, la respuesta sale igual
con esas secciones vacias y `motivo`, nunca con un 500.

Cada pieza se cachea por separado (`_CACHE`) y no la respuesta entera: asi un
AgroDash caido NO queda guardado (el cache no guarda fallos) y la proxima peticion
lo reintenta, mientras las secciones PV siguen servidas desde el cache.
"""
from __future__ import annotations

import logging

from historico import agrodash_api, cache, db
from historico.analitica import distribucion
from historico.analitica.climatologia import cajas
from historico.analitica.climatologia.agrodash import medias_diarias
from historico.analitica.ventana import Ventana

_log = logging.getLogger(__name__)

# Diez minutos y no los segundos del cache de `confianza`: aca no viaja ningun
# veredicto del barrido, solo agregados mensuales que cambian con la carga diaria.
TTL_CLIMATOLOGIA_SEG = 600.0
_CACHE = cache.registrar(cache.CacheBreve(ttl_seg=TTL_CLIMATOLOGIA_SEG))

FUENTE_PV = "supabase_pv"
FUENTE_AGRODASH = "agrodash_sc"
BASE_IRRADIANCIA = "lecturas diurnas"
BASE_AMBIENTAL = "medias diarias"
SIN_DATOS = "sin_datos"
AGRODASH_NO_DISPONIBLE = "agrodash_no_disponible"

# seccion de la respuesta -> (tipo de sensor en AgroDash, unidad)
AMBIENTALES: dict[str, tuple[str, str]] = {
    "temperatura": ("temperatura", "C"),
    "humedad": ("humedadAire", "%"),
}
_TIPOS_AMBIENTALES = tuple(tipo for tipo, _ in AMBIENTALES.values())


def _medias_o_nada(v: Ventana) -> dict[str, dict] | None:
    """Las medias diarias de AgroDash, o None si la API no esta disponible."""
    try:
        return _CACHE.obtener(("agrodash", v.desde, v.hasta),
                              lambda: medias_diarias(v, _TIPOS_AMBIENTALES))
    except (agrodash_api.AgroDashNoDisponible, ValueError) as exc:
        # ValueError cubre una respuesta que no es JSON o trae fechas ilegibles.
        _log.warning("climatologia sin AgroDash para %s..%s: %s", v.desde, v.hasta, exc)
        return None


def _motivo(cajas_mes: list[dict]) -> str | None:
    return None if any(c["n"] for c in cajas_mes) else SIN_DATOS


def _irradiacion(barras: list[dict]) -> dict:
    valores = [b["irradiacion"]["valor"] for b in barras]
    return {"fuente": FUENTE_PV, "variable": distribucion.IRRADIANCIA_POR_DEFECTO,
            "unidad": distribucion.UNIDAD_IRRADIACION, "valores": valores,
            "dias": [b["dias_con_dato"] for b in barras],
            "motivo": None if any(x is not None for x in valores) else SIN_DATOS}


def _irradiancia(cajas_distribucion: list[dict]) -> dict:
    cajas_mes = [cajas.desde_distribucion(c) for c in cajas_distribucion]
    return {"fuente": FUENTE_PV, "variable": distribucion.IRRADIANCIA_POR_DEFECTO,
            "unidad": distribucion.UNIDAD_IRRADIANCIA, "base": BASE_IRRADIANCIA,
            "cajas": cajas_mes, "motivo": _motivo(cajas_mes)}


def _ambiental(seccion: str, meses: list[str], medias: dict[str, dict] | None) -> dict:
    tipo, unidad = AMBIENTALES[seccion]
    base = {"fuente": FUENTE_AGRODASH, "variable": tipo, "unidad": unidad, "base": BASE_AMBIENTAL}
    if medias is None:
        return {**base, "cajas_sensor": [], "cajas": [], "motivo": AGRODASH_NO_DISPONIBLE}
    cajas_mes = cajas.por_mes(meses, medias[tipo]["medias"])
    return {**base, "cajas_sensor": sorted(medias[tipo]["cajas_sensor"]),
            "cajas": cajas_mes, "motivo": _motivo(cajas_mes)}


def calcular(v: Ventana) -> dict:
    """Climatologia por mes calendario de [desde, hasta). Ver el contrato en la ruta."""
    variable = distribucion.IRRADIANCIA_POR_DEFECTO
    # Tres tareas independientes a la vez; las consultas internas de cada una corren
    # en fila (ver `db.en_paralelo`), que es lo barato.
    irradiacion, irradiancia, medias = db.en_paralelo(
        lambda: _CACHE.obtener(("irradiacion", v.desde, v.hasta),
                               lambda: distribucion.irradiacion_mensual(v, variable)),
        lambda: _CACHE.obtener(("irradiancia", v.desde, v.hasta),
                               lambda: distribucion.cajas_mensuales(v, variable)),
        lambda: _medias_o_nada(v),
    )
    meses = [b["mes"] for b in irradiacion["barras"]]
    return {
        "periodo": {"desde": v.desde.isoformat(), "hasta": v.hasta.isoformat()},
        "meses": meses,
        "irradiacion": _irradiacion(irradiacion["barras"]),
        "irradiancia": _irradiancia(irradiancia["cajas"]),
        **{seccion: _ambiental(seccion, meses, medias) for seccion in AMBIENTALES},
    }
