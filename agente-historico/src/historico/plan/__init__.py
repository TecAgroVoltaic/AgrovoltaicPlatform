"""PlanExportacion v1: uno o varios archivos que combinan variables de las cuatro
fuentes, remuestreadas a una rejilla comun (contrato §3).

El plan viaja SIN ESTADO en la URL (`p=`, base64url sin relleno, tope 4 KB). Se
valida entero antes de emitir; despues cada archivo sale en streaming con los
writers de `exportar` (csv / dat / mat), o todos juntos en un zip con `LEEME.txt`.

Fachada del paquete: `modelo` (tipos y topes), `codec`, `validacion` + `columnas`,
`rejilla` (intervalos y pivot), `sql` y `agrodash` (remuestreo por fuente),
`salida` (filas por forma), `estimacion`, `leeme`, `emision` y `urls`.
"""
from __future__ import annotations

from historico.plan.codec import codificar, decodificar  # noqa: F401
from historico.plan.emision import archivo, zip_  # noqa: F401
from historico.plan.estimacion import estimar  # noqa: F401
from historico.plan.modelo import (  # noqa: F401
    AGREGACIONES, FORMAS, FORMATOS, MAX_ARCHIVOS, MAX_COLUMNAS, PASOS_S, TOPE_DURO,
    UMBRAL_CONFIRMACION, VERSION, ArchivoPlan, ColumnaPlan, Plan, PlanInvalido,
)
from historico.plan.salida import columnas_publicas  # noqa: F401
from historico.plan.urls import RUTA, RUTA_ESTIMAR, url_archivo, url_zip  # noqa: F401
from historico.plan.validacion import validar  # noqa: F401


def desde_url(p: str | None) -> Plan:
    """Decodifica y valida el `p=` de la URL."""
    return validar(decodificar(p))
