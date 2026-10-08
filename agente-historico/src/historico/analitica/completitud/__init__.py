"""Fig. 4: cuantos puntos hay en el servidor por periodo, y cuantos deberia haber.

Tres decisiones que definen el modulo:

1. **La serie sale del CALENDARIO (`ventana_solar`), no de las tablas de datos.**
   Los dias con CERO filas son justamente lo que hay que ver, y una consulta a la
   tabla de datos solo puede mostrar lo que existe: los 295 dias sin dato de los
   569 del calendario simplemente no aparecerian. Mismo criterio que
   `calidad.contexto.dias()`.
2. **Electrico y radiacion van por separado.** Fundirlos esconde que se muestrean
   a escalas distintas, y una serie unica quedaria dominada por la radiacion.
3. **La cadencia de referencia se MIDE de los saltos entre filas consecutivas**, y
   no sale ni de una constante ni de `intervalo_original_seg`. `radiacion_sc_15s`
   es el nombre del objetivo del resampleo y no lo que la tabla contiene: los
   saltos reales de la radiacion van 15, 30, 45, 60, 75, 300, 315 y 330 s, y solo
   octubre 2025 estuvo de verdad a 15 s. Medir todo contra los 15 s nominales daba
   ~4% de completitud en casi todo el historico, que se lee como perdida
   catastrofica de datos que en realidad nunca se tomaron.
   `intervalo_original_seg` tampoco sirve: guarda la cadencia del CSV de ORIGEN,
   asi que en lo electrico dice 2 a 330 s mientras las filas guardadas estan
   remuestreadas a 5 min uniformes (35.101 de 36.468 saltos son exactamente 300 s).
   Queda como trazabilidad del origen, no como referencia. La constante nominal es
   el ultimo recurso y, cuando se usa, el punto sale marcado.

Lo esperado se mide contra las HORAS DE SOL del dia y no contra 24 h: el logger de
San Carlos solo graba de dia (11,5 a 12,7 h segun la fecha).


El SQL vive en `calculo` y el criterio en funciones puras (`medida.cadencia`,
`medida.esperadas`, `series.serie`, `series.tramos_sin_datos`, `composicion.resumir`
y `composicion.componer`), que se prueban sin base de datos. Este `__init__` es la
fachada del paquete.
"""
from __future__ import annotations

from historico.analitica.completitud.calculo import _SQL_DIAS, _consultar_dias, calcular  # noqa: F401
from historico.analitica.completitud.composicion import componer, resumir  # noqa: F401
from historico.analitica.completitud.constantes import (  # noqa: F401
    _CAMPO_CADENCIA, _CAMPO_FILAS, _NOTA, _SEGUNDOS_POR_HORA, CADENCIA_NOMINAL_SEG, COLUMNAS,
    ELECTRICO, FUENTES, MEDIDA, NOMINAL, RADIACION,
)
from historico.analitica.completitud.medida import _fecha, _fraccion, cadencia, esperadas  # noqa: F401
from historico.analitica.completitud.series import (  # noqa: F401
    _cubo, _punto, granularidad_efectiva, serie, tramos_sin_datos,
)
