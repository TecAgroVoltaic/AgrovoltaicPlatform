"""Region de una caja de AgroDash, deducida de su nombre.

AgroDash no guarda la region como dato: la convencion del equipo es que las cajas de
San Carlos terminan en " SC" (`Caja Abioticos 1 SC`, `Caja Hum_Suelo SC`) y el resto
es Cartago. Vive en un solo lugar para que la climatologia y el inventario de
fuentes no puedan discrepar sobre que caja es de que region.
"""
from __future__ import annotations

SUFIJO_SAN_CARLOS = " SC"
SAN_CARLOS = "San Carlos"
CARTAGO = "Cartago"


def es_san_carlos(nombre_caja: str | None) -> bool:
    """True si la caja es de San Carlos segun la convencion de nombre."""
    return bool(nombre_caja) and str(nombre_caja).endswith(SUFIJO_SAN_CARLOS)


def region_de(nombre_caja: str | None) -> str:
    """`SAN_CARLOS` o `CARTAGO`."""
    return SAN_CARLOS if es_san_carlos(nombre_caja) else CARTAGO
