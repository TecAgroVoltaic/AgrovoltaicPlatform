"""Calendario de actividad: que dias grabo cada fuente y donde estan los huecos.

Arma la `CalendarioSpec` v1 (contrato §4.6 de
docs/referencia/contratos-asistente-plataforma.md): una fila por fuente con sus dias
con datos, el nivel de cada dia y los huecos mas largos. Las filas que dependen de
AgroDash se omiten (con aviso) si la API no responde: el resto del calendario sigue
sirviendo.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date

from historico import agrodash_api, cache
from historico.analitica.actividad import agrodash, niveles, supabase

TTL_SEG = 600
_CACHE = cache.registrar(cache.CacheBreve(ttl_seg=TTL_SEG))

# (clave, SourceId, etiqueta). El orden es el de las filas del calendario.
FILAS = (
    ("electrico", "supabase_pv", "Inversor · San Carlos"),
    ("radiacion", "supabase_pv", "Radiación · San Carlos"),
    ("ambiental", "supabase_ambiental", "Store ambiental · San Carlos"),
    ("agrodash_sc", "agrodash_sc", "AgroDash · San Carlos"),
    ("agrodash_cartago", "agrodash_cartago", "AgroDash · Cartago"),
)
CLAVES = tuple(clave for clave, _, _ in FILAS)
_REGION = {"agrodash_sc": agrodash_api.SAN_CARLOS, "agrodash_cartago": agrodash_api.CARTAGO}


def _region(clave: str, desde: date, hasta: date) -> tuple[dict[str, int] | None, list[dict]]:
    try:
        return agrodash.conteos(_REGION[clave], desde, hasta)
    except agrodash_api.AgroDashNoDisponible as exc:
        return None, [{"caja": "todas", "motivo": f"AgroDashNoDisponible: {exc}"[:200]}]


def _conteos(claves: tuple[str, ...], desde: date, hasta: date) -> tuple[dict, dict]:
    """Supabase y cada region de AgroDash en paralelo: son independientes.
    Devuelve `(datos por clave, fallas por clave)`."""
    regiones = [c for c in claves if c in _REGION]
    con_supabase = any(c in supabase.FILAS_SUPABASE for c in claves)
    with ThreadPoolExecutor(max_workers=1 + len(regiones)) as pool:
        f_supa = (pool.submit(_CACHE.obtener, ("supabase", desde, hasta),
                              lambda: supabase.conteos(desde, hasta)) if con_supabase else None)
        f_reg = {c: pool.submit(_region, c, desde, hasta) for c in regiones}
        datos: dict[str, dict[str, int]] = f_supa.result() if f_supa else {}
        fallas: dict[str, list[dict]] = {}
        for clave, futuro in f_reg.items():
            valor, de_la_fila = futuro.result()
            datos[clave] = valor or {}
            if de_la_fila:
                fallas[clave] = de_la_fila
    return datos, fallas


def _fila(clave: str, fuente: str, etiqueta: str, conteos: dict[str, int],
          fallas: list[dict], desde: date, hasta: date) -> dict:
    dias = niveles.dias_con_nivel(conteos)
    return {"clave": clave, "fuente": fuente, "etiqueta": etiqueta, "dias": dias,
            "n_dias": len(dias), "completa": not fallas, "fallas": fallas,
            # Con cajas caidas, un "hueco" puede ser la caja que no contesto: no se informa.
            "huecos": niveles.huecos([d[0] for d in dias], desde, hasta) if not fallas else []}


def calcular(desde: date, hasta: date, claves: tuple[str, ...] = CLAVES) -> dict:
    """La CalendarioSpec del rango (ambos extremos inclusivos). Una fila incompleta lleva
    `completa: false` y en `fallas` que caja fallo y por que."""
    datos, fallas = _conteos(claves, desde, hasta)
    filas = [_fila(clave, fuente, etiqueta, datos[clave], fallas.get(clave, []), desde, hasta)
             for clave, fuente, etiqueta in FILAS if clave in claves and clave in datos]
    return {"version": 1, "titulo": "Días con datos", "desde": desde.isoformat(),
            "hasta": hasta.isoformat(), "filas": filas}
