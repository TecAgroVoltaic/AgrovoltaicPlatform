"""Climatologia del sitio por MES CALENDARIO: cuanto sol entro, y que temperatura y humedad hubo.

Cuatro secciones alineadas con la misma rejilla de meses (`meses`), incluidos los que
no tienen ni un dato (valores None, `n = 0`):

* `irradiacion`: kWh/m2 acumulados por mes (Supabase PV, `distribucion`).
* `irradiancia`: caja mensual de las lecturas diurnas calibradas (Supabase PV).
* `temperatura` y `humedad`: caja mensual de las MEDIAS DIARIAS de los sensores de
  las cajas de San Carlos en AgroDash (todos los sensores juntos).

Fachada del paquete: `agrodash` (medias diarias via API), `cajas` (los cinco numeros,
puras) y `calculo` (composicion y cache).
"""
from __future__ import annotations

from historico.analitica.climatologia.agrodash import (  # noqa: F401
    MARCA_CAJA_DE_PRUEBA, PASO_DIARIO_SEG, medias_diarias, sensores_climaticos,
)
from historico.analitica.climatologia.cajas import de_valores, desde_distribucion, por_mes  # noqa: F401
from historico.analitica.climatologia.calculo import (  # noqa: F401
    AGRODASH_NO_DISPONIBLE, AMBIENTALES, SIN_DATOS, TTL_CLIMATOLOGIA_SEG, calcular,
)
