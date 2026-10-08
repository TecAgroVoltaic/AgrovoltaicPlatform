"""Anomalias sobre la FORMA del dia: rachas constantes (flatline) y outliers IQR."""
from __future__ import annotations

from historico.calidad.pruebas import estadistica, umbrales
from historico.calidad.pruebas.contrato import (
    INFO,
    Contexto,
    Hallazgo,
    Serie,
    es_valor,
    indices_por_dia,
    severidad_por_fraccion,
)


def flatline(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Rachas de 30 lecturas consecutivas identicas.

    El cero se reporta como INFO y no como GRAVE, y no es indulgencia: de noche
    la irradiancia corregida es cero durante horas y el inversor que no genera
    da potencia cero todo el dia. Los dos son hechos operativos reales. Una
    racha clavada en un valor que NO es cero si es un sensor trabado.
    """
    minimo = umbrales.FLATLINE_MEDICIONES_CONSECUTIVAS
    salida = []
    for dia, indices in sorted(indices_por_dia(serie).items()):
        rachas = _rachas_constantes(serie, indices, minimo)
        if not rachas:
            continue
        afectadas = sum(len(r) for r in rachas)
        valores = sorted({serie.valores[r[0]] for r in rachas})
        salida.append(Hallazgo(
            fecha=dia, fuente=serie.fuente, variable=serie.variable.clave,
            tipo="flatline",
            severidad=INFO if valores == [0] else severidad_por_fraccion(
                afectadas, len(indices)),
            n_afectadas=afectadas,
            detalle={"rachas": len(rachas), "minimo_consecutivas": minimo,
                     "racha_mas_larga": max(len(r) for r in rachas),
                     "valores_constantes": valores, "de": len(indices),
                     "nota": "una racha en cero es el inversor apagado o la noche, "
                             "no un sensor trabado"}))
    return salida


def _rachas_constantes(serie: Serie, indices, minimo: int) -> list[list[int]]:
    """Las rachas de valores identicos consecutivos que llegan al minimo."""
    rachas, actual = [], []
    for i in indices:
        valor = serie.valores[i]
        if not es_valor(valor):
            actual = []
            continue
        if actual and serie.valores[actual[-1]] == valor:
            actual.append(i)
        else:
            actual = [i]
        if len(actual) == minimo:
            rachas.append(actual)
    return [r for r in rachas if len(r) >= minimo]


def outlier_iqr(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Valores fuera de [Q1 - 1,5*IQR, Q3 + 1,5*IQR], calculado por dia.

    Por DIA y no sobre el periodo entero: la distribucion de una variable solar
    cambia con la estacion, y un cuartil de diecinueve meses marcaria como
    outlier el verano entero. Sale como INFO: en una variable con forma de
    parabola diaria el IQR mide la forma del dia, no la validez del dato. Sirve
    para mirar, no para descartar.
    """
    minimo = umbrales.MINIMO_MUESTRAS_PARA_ESTADISTICA
    salida = []
    for dia, indices in sorted(indices_por_dia(serie).items()):
        utiles = [i for i in indices if es_valor(serie.valores[i])]
        if len(utiles) < minimo:
            continue
        valores = [serie.valores[i] for i in utiles]
        q1 = estadistica.cuantil(valores, 0.25)
        q3 = estadistica.cuantil(valores, 0.75)
        rango = q3 - q1
        piso, techo = q1 - umbrales.FACTOR_IQR * rango, q3 + umbrales.FACTOR_IQR * rango
        afectados = [i for i in utiles if not piso <= serie.valores[i] <= techo]
        if not afectados:
            continue
        salida.append(Hallazgo(
            fecha=dia, fuente=serie.fuente, variable=serie.variable.clave,
            tipo="outlier_iqr", severidad=INFO, n_afectadas=len(afectados),
            detalle={"q1": round(q1, 4), "q3": round(q3, 4), "iqr": round(rango, 4),
                     "limites": [round(piso, 4), round(techo, 4)],
                     "de": len(utiles), "factor": umbrales.FACTOR_IQR}))
    return salida
