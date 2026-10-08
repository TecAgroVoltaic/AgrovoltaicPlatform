"""TODOS los umbrales de las seis familias de pruebas, en un solo modulo.

Existe para que el resto del paquete no tenga ni un numero suelto. Un umbral en
medio de un `if` es indiscutible: nadie sabe de donde salio, nadie se atreve a
moverlo y nadie puede auditarlo contra el documento. Aca cada constante lleva su
ORIGEN anotado, y el origen es de una de tres clases:

  * DOCUMENTO   el valor esta escrito en el PDF de evaluacion de datos.
  * DATO        salio de medir esta serie (y hay que volver a medirlo si cambia).
  * POLITICA    el documento pide la prueba pero no fija el corte; lo fijamos aca
                y queda a la vista para discutirlo con el equipo.

## Los limites por variable NO se escriben aca, y es a proposito

"Irradiancia < 0", "irradiancia > 1500", "RH > 100", "temperatura ambiente < -5"
y compañia son limites POR VARIABLE, y su fuente de verdad es
`analitica.catalogo` (campos `minimo` y `maximo`), que ademas es la allowlist de
SQL. Copiarlos aca crearia una segunda verdad que se desincroniza en la primera
correccion. Lo que si vive aca es `LIMITES_DEL_DOCUMENTO`: la trazabilidad de que
prueba del PDF corresponde a que entrada del catalogo, que la prueba de
regresion usa para verificar que ninguna se perdio por el camino.

Las constantes viven agrupadas por familia en los submodulos (`validez`,
`temporal`, `anomalias`, `disponibilidad`, `entre_sensores`) y este paquete las
reexporta todas: se siguen leyendo como `umbrales.<CONSTANTE>`.
"""
from __future__ import annotations

from historico.calidad.pruebas.umbrales.anomalias import (  # noqa: F401
    CADENCIA_REFERENCIA_DE_SALTO_POR_FUENTE, CADENCIA_REFERENCIA_DE_SALTO_SEG,
    DESVIACION_MAD, DESVIACION_MAXIMA, FACTOR_DESVIACION_DE_RUIDO, FACTOR_IQR,
    FLATLINE_MEDICIONES_CONSECUTIVAS, MINIMO_MUESTRAS_PARA_ESTADISTICA,
    SALTO_MAXIMO_HUMEDAD_RELATIVA_PCT, SALTO_MAXIMO_IRRADIANCIA_WM2,
    SALTO_MAXIMO_POR_VARIABLE, SALTO_MAXIMO_TEMPERATURA_C,
)
from historico.calidad.pruebas.umbrales.disponibilidad import (  # noqa: F401
    BIN_DE_EMPAREJAMIENTO_SEG, IRRADIANCIA_QUE_EXIGE_GENERACION_WM2,
    IRRADIANCIA_UTIL_DESDE, MOTIVO_BAJO_SOL, MOTIVO_IRRADIANCIA_BAJA,
    MOTIVO_SIN_IRRADIANCIA, RAMPA_DE_ARRANQUE_POR_VARIABLE, VARIABLES_DE_ACOPLE_AC,
    VENTANA_OPERATIVA_DESDE, VENTANA_OPERATIVA_HASTA,
)
from historico.calidad.pruebas.umbrales.entre_sensores import (  # noqa: F401
    CORRELACION_MINIMA_TEMP_GHI, GHI_DE_DIA_EVALUABLE_WM2, GHI_DE_SOL_PLENO_WM2,
    GHI_SIN_SOL_WM2, MINUTOS_CALIENTE_SIN_SOL, MINUTOS_CON_SOL_PARA_EVALUAR,
    MOTIVO_CALIENTE_SIN_SOL, MOTIVO_FRIO_A_PLENO_SOL, MOTIVO_NO_SIGUE_AL_SOL,
    MOTIVO_SIN_VENTANA_SOLAR, TEMP_DE_MODULO_CALIENTE_C,
    TEMP_MAXIMA_DE_MODULO_FRIO_C, VARIABLES_DE_TEMPERATURA_DE_MODULO,
)
from historico.calidad.pruebas.umbrales.temporal import (  # noqa: F401
    CADENCIAS_HISTORICAS_SEG, CADENCIA_NOMINAL_POR_DEFECTO,
    CADENCIA_NOMINAL_POR_FUENTE, FACTOR_INTERVALO_EXCESIVO, TOLERANCIA_FLUCTUACION,
)
from historico.calidad.pruebas.umbrales.validez import (  # noqa: F401
    FRACCION_AFECTADA_PARA_AVISO, FRACCION_AFECTADA_PARA_GRAVE,
    IRRADIANCIA_NOCTURNA_TOLERADA_WM2, LADO_MAXIMO, LADO_MINIMO,
    LIMITES_DEL_DOCUMENTO, MARGEN_CREPUSCULO_MINUTOS,
)
