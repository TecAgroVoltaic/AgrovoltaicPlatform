"""Performance Ratio DIARIO Y MENSUAL: el metodo que fijo Leo Cardinale en R1.

El PR deja de ser una metrica de 5 minutos. La energia del dia sale de los
acumuladores del inversor y se divide entre la irradiacion integrada de ese mismo
dia; los dias se agregan a mes y a periodo ponderando por energia (IEC 61724):

    PR = (E_dia_kWh / 1,420 kWp) / (H_dia_kWh_m2 / 1 kW/m2)
    PR_periodo = sum(E) / (P0_kWp * sum(H))

Cinco decisiones que no son de estilo. Todas estan medidas contra la base, con los
numeros en `docs/referencia/medicion-pr-diario.md`:

1. **`Irradiancia*5/60` se generaliza a `Irradiancia*(dt_real/3600)`.** Es lo unico
   en que este modulo se aparta de la letra de R1; el porque, con su numero, esta
   junto a `TECHO_DT_SEG`.
2. **Los acumuladores estan en kWh pese al sufijo `_wh`**, son DIARIOS y se
   reinician a medianoche: el valor del dia es el MAXIMO del dia.
3. **El contador es el camino principal y la integral el RESPALDO DECLARADO.** No se
   mezclan jamas en el mismo numero: cada variante se agrega sobre SU propio conjunto
   de dias y sale etiquetada (`fuente_energia`).
4. **Los dias con cobertura insuficiente se descartan**, y el criterio que de verdad
   filtra es el tercero (`DESFASE_MAXIMO_H`).
5. **El PR contra POA es PROVISIONAL** (R2 lo dejo esperando a Hugo) y un PR > 1 sale
   MARCADO, nunca callado.


Fachada del paquete: reexporta los nombres publicos de siempre. La consulta vive en
`consulta.py` y toda la DECISION en funciones puras (`integracion`, `dia`, `pr`,
`avisos`, `composicion`), que se prueban sin DB.
"""
from __future__ import annotations

from historico.analitica.rendimiento.avisos import (  # noqa: F401
    aval_pendiente, error_formula_literal, fuente_energia,
)
from historico.analitica.rendimiento.composicion import _NOTA, _por_mes, calcular, componer  # noqa: F401
from historico.analitica.rendimiento.constantes import (  # noqa: F401
    _CAMPO_ENERGIA, _CAMPO_IRRADIACION, _CAMPOS_DEL_DIA,
    CADENCIA_NOMINAL_SEG, CLAVES, CLAVES_CONTADOR, CLAVES_POA, COBERTURA_INSUFICIENTE,
    COBERTURA_MINIMA, CONTADOR, DESFASE_EXCESIVO, DESFASE_MAXIMO_H, DT_ULTIMA_FILA_SEG,
    FUENTES_ENERGIA, GHI, HORAS_FORMULA_LITERAL, INCLINADO, INSUMOS, INSUMOS_PROVISIONALES,
    INTEGRAL, KWP_POR_ARREGLO, MAXIMO_CONTADOR_DIARIO_KWH, P0_WP, POA_BIFACIAL, POA_FRONTAL,
    PR_MAXIMO_FISICO, SEGUNDOS_POR_HORA, SIN_ELECTRICO, SIN_RADIACION, SIN_VENTANA_SOLAR,
    TECHO_DT_SEG, VERTICAL, WH_POR_KWH,
)
from historico.analitica.rendimiento.consulta import _SQL_DIARIO, consultar  # noqa: F401
from historico.analitica.rendimiento.dia import evaluar_dia, pr_del_dia  # noqa: F401
from historico.analitica.rendimiento.integracion import cierre_del_contador, integrar  # noqa: F401
from historico.analitica.rendimiento.pr import (  # noqa: F401
    _acumular, _r, matriz, performance_ratio, resumen_pr, variante,
)
