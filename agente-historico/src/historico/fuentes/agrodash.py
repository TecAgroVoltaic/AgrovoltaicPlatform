"""Cajas de AgroDash partidas por region, con los tipos de sensor de cada una."""
from __future__ import annotations

from historico import agrodash_api


def cajas_por_region() -> dict[str, list[dict]]:
    """`{SAN_CARLOS: [...], CARTAGO: [...]}`; cada caja con sus tipos de sensor.

    Levanta `AgroDashNoDisponible` si la API no responde.
    """
    regiones: dict[str, list[dict]] = {agrodash_api.SAN_CARLOS: [], agrodash_api.CARTAGO: []}
    for caja in agrodash_api.cajas():
        nombre = caja.get("name")
        tipos = sorted({s.get("type") for s in caja.get("sensors") or [] if s.get("type")})
        regiones[agrodash_api.region_de(nombre)].append({"nombre": nombre, "sensores": tipos})
    for cajas in regiones.values():
        cajas.sort(key=lambda c: str(c["nombre"]))
    return regiones
