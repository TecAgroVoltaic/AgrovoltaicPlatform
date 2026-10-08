"""El PR y su marca de imposible, agregado por arreglo, variante y matriz."""
from __future__ import annotations

from historico.analitica import resultado
from historico.analitica.rendimiento.constantes import (
    _CAMPO_ENERGIA,
    _CAMPO_IRRADIACION,
    FUENTES_ENERGIA,
    INCLINADO,
    INSUMOS,
    INSUMOS_PROVISIONALES,
    KWP_POR_ARREGLO,
    PR_MAXIMO_FISICO,
    VERTICAL,
    WH_POR_KWH,
)


def _r(valor: float | None, decimales: int) -> float | None:
    return None if valor is None else round(valor, decimales)


def performance_ratio(energia_kwh: float | None, irradiacion_kwh_m2: float | None,
                      n: int, motivo: str = resultado.SIN_LECTURAS) -> dict:
    """PR = (E/P0) / (H/1 kW/m2), en el sobre de `resultado.metrica`.

    Con n = 0 devuelve None con motivo, jamas cero: un PR de 0 es un dia con el
    inversor caido, que es un HECHO, y no puede confundirse con "no se midio".

    **Un PR > 1 sale MARCADO.** Es fisicamente imposible y significa que el insumo de
    irradiancia de ese arreglo esta mal: con POA frontal sola el vertical da 1,217.
    Devolverlo callado es lo unico que este modulo no puede hacer.
    """
    if n <= 0 or energia_kwh is None or not irradiacion_kwh_m2:
        return resultado.metrica(None, 0, "adimensional", motivo)
    pr = (energia_kwh / KWP_POR_ARREGLO) / irradiacion_kwh_m2
    sobre = resultado.metrica(round(pr, 3), n, "adimensional")
    if pr > PR_MAXIMO_FISICO:
        sobre["supera_limite_fisico"] = True
        sobre["aviso"] = (
            f"PR {round(pr, 3)} > {PR_MAXIMO_FISICO}: fisicamente imposible. No es un "
            f"buen rendimiento, es que la irradiancia con que se juzga este arreglo "
            f"esta subestimada (le falta el aporte de la cara trasera, o el modelo de "
            f"transposicion no corresponde)")
    return sobre


def _acumular(dias: list[dict], campo_energia: str, factor: float,
              campo_irradiacion: str) -> dict:
    """Suma E y H de un arreglo sobre los dias en que EXISTEN LOS DOS.

    El dia entra o no entra entero: sumar la irradiacion de un dia cuya energia falta
    engorda el denominador sin numerador y baja el PR del periodo por un hueco de
    registro. Es la misma razon por la que las dos fuentes de energia no se pueden
    mezclar en un mismo agregado.
    """
    energia = irradiacion = 0.0
    n = supera_uno = 0
    maximo = None
    for dia in dias:
        valor, h = dia.get(campo_energia), dia.get(campo_irradiacion)
        if valor is None or not h:
            continue
        kwh, kwh_m2 = valor * factor, h / WH_POR_KWH
        energia, irradiacion, n = energia + kwh, irradiacion + kwh_m2, n + 1
        pr_dia = (kwh / KWP_POR_ARREGLO) / kwh_m2
        supera_uno += pr_dia > PR_MAXIMO_FISICO
        maximo = pr_dia if maximo is None else max(maximo, pr_dia)
    return {"energia_kwh": energia, "irradiacion_kwh_m2": irradiacion, "dias": n,
            "dias_pr_mayor_a_uno": supera_uno, "pr_diario_maximo": _r(maximo, 3)}


def variante(dias: list[dict], insumo: str, fuente: str,
             motivo: str = resultado.SIN_LECTURAS) -> dict:
    """El PR de los dos arreglos para UNA combinacion insumo + fuente de energia."""
    campo_e1, campo_e2, factor = _CAMPO_ENERGIA[fuente]
    campo_h1, campo_h2 = _CAMPO_IRRADIACION[insumo]
    salida = {"insumo": insumo, "fuente_energia": fuente}
    for arreglo, campo_e, campo_h in ((INCLINADO, campo_e1, campo_h1),
                                      (VERTICAL, campo_e2, campo_h2)):
        a = _acumular(dias, campo_e, factor, campo_h)
        salida[arreglo] = {
            "pr": performance_ratio(a["energia_kwh"] if a["dias"] else None,
                                    a["irradiacion_kwh_m2"], a["dias"], motivo),
            "energia_kwh": resultado.metrica(_r(a["energia_kwh"], 2), a["dias"],
                                             "kWh", motivo),
            "irradiacion_kwh_m2": resultado.metrica(_r(a["irradiacion_kwh_m2"], 2),
                                                    a["dias"], "kWh/m2", motivo),
            "dias": a["dias"],
            # El titular que hace imposible ignorar el PR > 1 aunque el agregado del
            # periodo se quede por debajo: cuantos dias lo superan y cual fue el peor.
            "dias_pr_mayor_a_uno": a["dias_pr_mayor_a_uno"],
            "pr_diario_maximo": a["pr_diario_maximo"],
        }
    return salida


def matriz(dias: list[dict], motivo_poa: str = resultado.SIN_LECTURAS) -> dict:
    """Las seis combinaciones (3 insumos x 2 fuentes de energia). PURA.

    Van las seis y no la "mejor" porque el veredicto DEPENDE del insumo, y de forma
    asimetrica: entre POA bifacial y frontal el PR del inclinado se mueve un 14% y el
    del vertical un 99%. Elegir una sola por dentro seria elegir el veredicto.
    """
    return {fuente: {insumo: variante(dias, insumo, fuente,
                                      motivo_poa if insumo in INSUMOS_PROVISIONALES
                                      else resultado.SIN_LECTURAS)
                     for insumo in INSUMOS}
            for fuente in FUENTES_ENERGIA}


def resumen_pr(matriz_: dict) -> dict:
    """La matriz reducida al PR pelado, con la marca del imposible aparte. PURA.

    Existe para que `comparativa.py` pueda mostrar el PR de los dos arreglos sin
    arrastrar el respaldo entero (energia, irradiacion y dias por cada una de las
    seis variantes son sesenta y pico de campos, y ese detalle ya viaja completo en
    la tool `performance_ratio`). Lo unico que NO se recorta es
    `supera_limite_fisico`: sin esa marca, un 1,217 se leeria como el mejor
    resultado de la serie en vez de como la prueba de que su irradiancia esta mal.
    """
    imposibles = [f"{fuente}/{insumo}/{arreglo}"
                  for fuente in FUENTES_ENERGIA for insumo in INSUMOS
                  for arreglo in (INCLINADO, VERTICAL)
                  if matriz_[fuente][insumo][arreglo]["pr"].get("supera_limite_fisico")]
    return {
        "pr": {fuente: {insumo: {arreglo: matriz_[fuente][insumo][arreglo]["pr"]["valor"]
                                 for arreglo in (INCLINADO, VERTICAL)}
                        for insumo in INSUMOS}
               for fuente in FUENTES_ENERGIA},
        "dias_por_variante": {fuente: {insumo: matriz_[fuente][insumo][INCLINADO]["dias"]
                                       for insumo in INSUMOS}
                              for fuente in FUENTES_ENERGIA},
        "supera_limite_fisico": imposibles or None,
    }
