"""PR diario prestado de `rendimiento` y emparejamiento punto a punto a 5 min."""
from __future__ import annotations

from historico.analitica import catalogo, rendimiento, resultado
from historico.analitica.comparativa.constantes import CLAVES_POA, HORAS_POR_LECTURA, WH_POR_KWH


def _emparejado_arreglo(fila: dict, sufijo: str, motivo: str) -> dict:
    """Energia, insolacion y su cociente sobre las ventanas de 5 min EMPAREJADAS.

    **Aca no hay ningun Performance Ratio y es deliberado.** Hasta el 2026-08-31
    esta funcion devolvia un `pr` calculado a 5 minutos, mientras `tools/performance`
    calculaba el PR diario de R1: dos numeros distintos con el mismo nombre. El PR
    se fue entero a `analitica.rendimiento`; lo que queda es el emparejamiento fino,
    que R1 avala para analisis punto a punto y que responde otra pregunta.

    `kwh_por_kwh_m2` es cuanta energia entrega el arreglo por cada kWh/m2 que recibe
    en su plano. Es dimensional (kWp x adimensional), no un PR, y por eso se puede
    seguir reportando sin ambiguedad.
    """
    potencia, poa = fila.get(f"potencia_{sufijo}"), fila.get(f"poa_{sufijo}")
    n = fila.get(f"n_{sufijo}") or 0
    hay_par = poa and potencia is not None
    insolacion = poa / WH_POR_KWH * HORAS_POR_LECTURA if hay_par else None
    energia_kwh = potencia * HORAS_POR_LECTURA / WH_POR_KWH if hay_par else None
    por_irradiancia = None if not insolacion else energia_kwh / insolacion
    return {
        "insolacion_kwh_m2": resultado.metrica(
            insolacion and round(insolacion, 3), n, "kWh/m2", motivo),
        "energia_emparejada_kwh": resultado.metrica(
            energia_kwh and round(energia_kwh, 3), n, "kWh", motivo),
        "kwh_por_kwh_m2": resultado.metrica(
            por_irradiancia and round(por_irradiancia, 3), n, "kWh por kWh/m2", motivo),
        "lecturas": n,
    }


def pr_diario(dias_pr: list[dict], motivo_poa: str,
              cobertura_poa: str | None = None) -> dict:
    """El PR de los dos arreglos por el metodo DIARIO de R1. PURA, y prestada.

    No calcula nada por su cuenta: evalua los dias con el criterio de
    `analitica.rendimiento` y agrega con su matriz. Es la unica forma de garantizar
    que el comparativo y la tool `performance_ratio` no puedan divergir; cualquier
    reimplementacion, por fiel que naciera, se separa en el primer arreglo que se le
    haga a una sola de las dos.

    Van las seis variantes (3 insumos x 2 fuentes de energia) y no la "mejor",
    porque el veredicto DEPENDE del insumo y de forma asimetrica: entre POA bifacial
    y frontal el PR del inclinado se mueve un 14 % y el del vertical un 99 %. Elegir
    una por dentro seria elegir quien gana la comparacion, que es justo la pregunta
    que este modulo tiene que dejar abierta.
    """
    evaluados = [rendimiento.evaluar_dia(fila) for fila in dias_pr]
    validos = [dia for dia in evaluados if dia["valido"]]
    desde_poa, hasta_poa = catalogo.cobertura(*CLAVES_POA)
    return {
        "metodo": "diario_y_mensual",
        **rendimiento.resumen_pr(rendimiento.matriz(validos, motivo_poa)),
        "dias": {"con_dato": len(evaluados), "validos": len(validos),
                 "descartados": len(evaluados) - len(validos)},
        "cobertura": {"desde": desde_poa and desde_poa.isoformat(),
                      "hasta": hasta_poa and hasta_poa.isoformat(),
                      "fuera_de_cobertura": cobertura_poa,
                      # El codigo de motivo solo cuando de verdad apaga algo: un
                      # motivo puesto siempre se lee como que siempre pasa algo.
                      "motivo": motivo_poa if cobertura_poa else None,
                      "insumos_afectados": list(rendimiento.INSUMOS_PROVISIONALES)},
        "nota": ("PR por DIA y por MES (R1 de Leo Cardinale, 2026-08-30), la misma "
                 "cuenta y las mismas filas que la tool `performance_ratio`: energia "
                 "del dia contra irradiacion integrada del dia, agregada al periodo "
                 "ponderando por energia. NO es una metrica de 5 minutos. El detalle "
                 "por dia, por mes y el respaldo de cada variante se piden con esa "
                 "tool. Las variantes contra POA son PROVISIONALES (R2 espera a Hugo) "
                 "y un PR > 1 es fisicamente imposible: viaja marcado."),
    }
