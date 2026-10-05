"""Los tres estadisticos que pide el documento, en Python puro.

Sin numpy a proposito: la capa de decision no debe arrastrar dependencias de
calculo pesado para sacar una mediana de 144 numeros, y en Python puro la prueba
del criterio corre sin nada instalado. `analitica` si usa numpy, y esta bien:
alla el volumen lo justifica.

`cuantil` interpola linealmente entre los dos vecinos, que es la definicion por
defecto de numpy y de `percentile_cont` de Postgres. Importa que sea la misma:
si la consola calculara Q1 con una convencion y esta prueba con otra, el mismo
dia podria salir outlier en un lado y no en el otro.
"""
from __future__ import annotations

from collections.abc import Sequence

from historico.calidad.pruebas import umbrales


def mediana(valores: Sequence[float]) -> float:
    """El valor central. Con n par, el promedio de los dos del medio."""
    if not valores:
        raise ValueError("no hay mediana de una lista vacia")
    return cuantil(valores, 0.5)


def cuantil(valores: Sequence[float], fraccion: float) -> float:
    """El cuantil por interpolacion lineal (convencion de numpy y de Postgres)."""
    if not valores:
        raise ValueError("no hay cuantil de una lista vacia")
    ordenados = sorted(valores)
    if len(ordenados) == 1:
        return float(ordenados[0])
    posicion = fraccion * (len(ordenados) - 1)
    bajo = int(posicion)
    alto = min(bajo + 1, len(ordenados) - 1)
    peso = posicion - bajo
    return float(ordenados[bajo] * (1 - peso) + ordenados[alto] * peso)


def mad(valores: Sequence[float]) -> float:
    """Median Absolute Deviation: mediana de las distancias a la mediana.

    Es la dispersion robusta: a diferencia de la desviacion estandar, un solo
    pico enorme no la infla, que es exactamente lo que hace falta para medir
    ruido en una serie que ya tiene picos por dato malo.
    """
    centro = mediana(valores)
    return mediana([abs(v - centro) for v in valores])


def desviacion_maxima(valores: Sequence[float]) -> float:
    """La mayor distancia al promedio. La lectura LITERAL del documento."""
    promedio = sum(valores) / len(valores)
    return max(abs(v - promedio) for v in valores)


def umbral_de_ruido(cambios: Sequence[float], desviacion: str) -> float:
    """media + 6 * dispersion, con la dispersion que se elija. Ver `anomalias`."""
    promedio = sum(cambios) / len(cambios)
    dispersion = (mad(cambios) if desviacion == umbrales.DESVIACION_MAD
                  else desviacion_maxima(cambios))
    return promedio + umbrales.FACTOR_DESVIACION_DE_RUIDO * dispersion
