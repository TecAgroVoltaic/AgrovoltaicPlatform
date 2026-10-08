"""El renglon diario: criterio de dia valido y PR pelado del dia."""
from __future__ import annotations

from historico.analitica.rendimiento.constantes import (
    _CAMPO_ENERGIA,
    _CAMPO_IRRADIACION,
    COBERTURA_INSUFICIENTE,
    COBERTURA_MINIMA,
    DESFASE_EXCESIVO,
    DESFASE_MAXIMO_H,
    FUENTES_ENERGIA,
    INCLINADO,
    KWP_POR_ARREGLO,
    PR_MAXIMO_FISICO,
    SIN_ELECTRICO,
    SIN_RADIACION,
    SIN_VENTANA_SOLAR,
    VERTICAL,
    WH_POR_KWH,
)
from historico.analitica.rendimiento.pr import _r


def evaluar_dia(fila: dict) -> dict:
    """Marca un dia como valido o descartado DICIENDO por que. PURA, sin DB.

    La razon viaja pegada al dia y no en una lista aparte: un dia descartado sin su
    motivo obliga a reconstruirlo mirando los insumos, que es justo lo que nadie
    hace antes de leer el PR.
    """
    horas_sol, horas_rad, horas_ele = (fila.get("horas_sol"), fila.get("horas_rad"),
                                       fila.get("horas_ele"))
    motivos: list[str] = []
    if not horas_rad:
        motivos.append(SIN_RADIACION)
    if not horas_ele:
        motivos.append(SIN_ELECTRICO)
    if not horas_sol:
        motivos.append(SIN_VENTANA_SOLAR)

    cobertura_rad = cobertura_ele = desfase = None
    if horas_sol and horas_rad and horas_ele:
        cobertura_rad, cobertura_ele = horas_rad / horas_sol, horas_ele / horas_sol
        desfase = abs(horas_rad - horas_ele)
        if cobertura_rad < COBERTURA_MINIMA or cobertura_ele < COBERTURA_MINIMA:
            motivos.append(COBERTURA_INSUFICIENTE)
        if desfase > DESFASE_MAXIMO_H:
            motivos.append(DESFASE_EXCESIVO)
    return {**fila,
            "cobertura_radiacion": _r(cobertura_rad, 3),
            "cobertura_electrico": _r(cobertura_ele, 3),
            "desfase_h": _r(desfase, 3),
            "valido": not motivos,
            "motivos_descarte": motivos}


def pr_del_dia(dia: dict, insumo: str) -> dict:
    """El PR de un dia por fuente y arreglo, en numero pelado. PURA.

    En el renglon diario el PR va como float y no como sobre de `metrica` porque el
    dia ya trae `valido` y `motivos_descarte`: repetir el motivo cuatro veces por dia
    engorda la respuesta sin decir nada nuevo. Lo que SI se conserva es la marca del
    imposible.
    """
    campo_h1, campo_h2 = _CAMPO_IRRADIACION[insumo]
    por_fuente: dict = {}
    imposibles: list[str] = []
    for fuente in FUENTES_ENERGIA:
        campo_e1, campo_e2, factor = _CAMPO_ENERGIA[fuente]
        por_arreglo = {}
        for arreglo, campo_e, campo_h in ((INCLINADO, campo_e1, campo_h1),
                                          (VERTICAL, campo_e2, campo_h2)):
            valor, h = dia.get(campo_e), dia.get(campo_h)
            pr = (None if valor is None or not h
                  else (valor * factor / KWP_POR_ARREGLO) / (h / WH_POR_KWH))
            por_arreglo[arreglo] = _r(pr, 3)
            if pr is not None and pr > PR_MAXIMO_FISICO:
                imposibles.append(f"{fuente}/{arreglo}")
        por_fuente[fuente] = por_arreglo
    return {"insumo": insumo, "por_fuente": por_fuente,
            "supera_limite_fisico": imposibles or None}
