"""Fig. 6: como se DISTRIBUYE una variable mes a mes, y cuanta radiacion entro.

Dos paneles distintos que responden a la misma pregunta con distinta forma:

* **Box plot por mes.** Minimo, Q1, mediana, Q3, maximo y los outliers por el
  criterio IQR. Los cuartiles se calculan con `percentile_cont` EN LA BASE: agregar
  ahi cuesta una consulta, y traer las 94.868 filas de radiacion al proceso para
  ordenarlas en Python cuesta la red, la memoria y el tiempo de las tres.
* **Barras de irradiacion mensual acumulada (kWh/m2).** Integral de la irradiancia,
  no promedio: lo que interesa de un mes es cuanta energia entro.

**La integral no es una suma, porque la cadencia cambia.** Cada lectura pesa el
salto real hasta la siguiente, acotado (ver `fuente.TECHO_SALTO_SEG`): la tabla de
radiacion convive con saltos de 15, 30, 45, 60, 75, 300, 315 y 330 s segun la
epoca, y pesarlos todos igual subestimaria marzo 2026 veinte veces. Verificado: con
este peso los meses dan 2,4 a 4,5 kWh/m2/dia, que es el orden fisico de San Carlos.

Los meses SIN datos se emiten igual, con `n = 0` y todo en `None`. Un box plot que
salta de febrero a abril hace creer que marzo no existio, cuando lo que paso es que
el sistema no reporto.

Fachada del paquete: `comun` (constantes y rejilla de meses), `cajas` (box plot) e
`irradiacion` (barras de kWh/m2).
"""
from __future__ import annotations

from historico.analitica.distribucion.cajas import (  # noqa: F401
    _cuartiles, _extremos, cajas_mensuales, reducir, vallas,
)
from historico.analitica.distribucion.comun import (  # noqa: F401
    _FORMATO_MES_SQL, FACTOR_IQR, FORMATO_MES, IRRADIANCIA_POR_DEFECTO, JULIOS_POR_KWH,
    MAXIMO_MESES, MINIMO_LECTURAS_INTEGRAL, UNIDAD_IRRADIACION, UNIDAD_IRRADIANCIA, _meses,
)
from historico.analitica.distribucion.irradiacion import irradiacion_mensual, reducir_irradiacion  # noqa: F401
