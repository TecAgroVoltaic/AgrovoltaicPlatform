"""Todo el comparativo desde las filas ya consultadas: aca vive la decision."""
from __future__ import annotations

from historico.analitica import resultado
from historico.analitica.comparativa.constantes import INCLINADO, VERTICAL
from historico.analitica.comparativa.estacional import estacionalidad
from historico.analitica.comparativa.horaria import separacion_horaria
from historico.analitica.comparativa.pr import _emparejado_arreglo, pr_diario
from historico.analitica.comparativa.totales import _arreglo_total, comparar_totales


def reducir(periodos: list[dict], curva: list[dict], dias_pr: list[dict],
            meses: list[dict], granularidad: str, emparejado: dict | None = None,
            cobertura_poa: str | None = None) -> dict:
    """Todo el comparativo, sin base de datos. Aca vive la decision.

    `dias_pr` son los renglones diarios que sirve `rendimiento.consultar`, y de ahi
    sale el PR. `emparejado` es el renglon unico del cruce punto a punto a 5 min.

    `cobertura_poa` es el motivo legible de que la ventana no toque el tramo con
    POA, o None si si lo toca. Ya NO apaga el bloque de PR entero: apaga las cuatro
    variantes que dependen de la POA y deja vivas las dos contra GHI, que no
    necesitan transposicion. Antes del 2025-09-05 el comparativo se quedaba sin
    ningun PR, y era un PR que si se podia calcular.
    """
    totales = {INCLINADO: _arreglo_total(periodos, INCLINADO),
               VERTICAL: _arreglo_total(periodos, VERTICAL)}
    motivo_poa = (resultado.FUERA_DE_COBERTURA if cobertura_poa
                  else resultado.SIN_LECTURAS)
    emparejado = emparejado or {}
    return {
        "granularidad": granularidad,
        "por_periodo": periodos,
        "totales": totales,
        "diferencia": comparar_totales(totales[INCLINADO], totales[VERTICAL]),
        "curva_horaria": curva,
        "separacion_horaria": separacion_horaria(curva),
        "rendimiento": pr_diario(dias_pr, motivo_poa, cobertura_poa),
        "emparejamiento_5min": {
            INCLINADO: _emparejado_arreglo(emparejado, INCLINADO, motivo_poa),
            VERTICAL: _emparejado_arreglo(emparejado, VERTICAL, motivo_poa),
            "nota": ("cruce punto a punto sobre las MISMAS ventanas de 5 min, que es "
                     "el uso que R1 le da al emparejamiento fino. NO es un Performance "
                     "Ratio: el PR va arriba, por dia y por mes"),
        },
        "estacionalidad": estacionalidad(meses),
    }
