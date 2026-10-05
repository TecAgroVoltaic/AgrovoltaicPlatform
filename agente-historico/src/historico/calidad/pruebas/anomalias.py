"""Familia 4: anomalias estadisticas. ¿El numero es posible pero raro?

Las cuatro pruebas del documento: saltos entre mediciones, flatline de 30
consecutivas, outliers por IQR y ruido excesivo. Aca no se decide si un dato es
invalido (eso es la familia 2), se decide si merece que alguien lo mire.

Las DOS ambigüedades del documento estan resueltas y anotadas donde se usan:
`salto_excesivo` (¿saltos separados por cuanto tiempo?) y `ruido_excesivo`
(¿"desviacion absoluta maxima" es MAD?). Referencia bibliografica del documento:
https://bsrn.awi.de/
"""
from __future__ import annotations

from historico.calidad.pruebas import cadencia, estadistica, umbrales
from historico.calidad.pruebas.contrato import (
    INFO, Contexto, Hallazgo, NoAplica, Serie, es_valor, hallazgos_por_dia,
    indices_por_dia, severidad_por_fraccion,
)


def salto_excesivo(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Cambio entre dos mediciones consecutivas por encima del umbral del PDF.

    AMBIGUEDAD DEL DOCUMENTO (1 de 2), resuelta aca: "salto de temperatura > 3 C
    entre mediciones" no dice entre mediciones separadas por CUANTO, y el numero
    significa cosas opuestas segun la cadencia. A 15 s, 3 C son 720 C/h y ningun
    modulo del planeta hace eso; a 5 min son 36 C/h, que es una tarde con nubes;
    a 1 h es un dia normal. Con el umbral aplicado en crudo, la misma serie
    dispararia en el tramo de 2 s y callaria en el de 5 min.

    Decision: el salto se NORMALIZA al intervalo real entre las dos mediciones y
    se compara contra el umbral a una cadencia de referencia explicita.

        salto_normalizado = |v2 - v1| * (cadencia_referencia / segundos_reales)

    La cadencia de referencia es la nominal de la fuente (5 min lo electrico,
    15 s la radiacion) y se puede pisar por `Contexto.cadencia_de_salto_seg`.
    Viaja dentro del hallazgo: el umbral no significa nada sin ella.
    """
    umbral = umbrales.SALTO_MAXIMO_POR_VARIABLE.get(serie.variable.clave)
    if umbral is None:
        raise NoAplica(f"el documento no fija salto maximo para {serie.variable.clave}")

    referencia = contexto.cadencia_de_salto(serie.fuente)
    saltos = cadencia.pasos(serie)
    normalizados: dict[int, float] = {}
    for i, salto in enumerate(saltos):
        if salto is None or salto.segundos <= 0:
            continue
        actual, previo = serie.valores[i], serie.valores[salto.anterior]
        if not (es_valor(actual) and es_valor(previo)):
            continue
        normalizado = abs(actual - previo) * (referencia / salto.segundos)
        if normalizado > umbral:
            normalizados[i] = normalizado

    return hallazgos_por_dia(
        serie, list(normalizados), "salto_excesivo", umbral=umbral,
        unidad=serie.variable.unidad, cadencia_referencia_seg=referencia,
        nota=f"salto normalizado a {referencia:g} s; el crudo depende de la cadencia "
             f"del tramo y no seria comparable entre epocas",
        detalle_del_dia=lambda idx: {"peor": round(max(normalizados[i] for i in idx), 3)})


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


def ruido_excesivo(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Cambios absolutos por encima de media + 6 * dispersion de los cambios.

    AMBIGUEDAD DEL DOCUMENTO (2 de 2), resuelta aca y ANOTADA para consultarla
    con el autor: el PDF dice "media + 6 * desviacion absoluta MAXIMA". Leido al
    pie de la letra, el umbral seria media + 6 * max(|x - media|), y como ese
    maximo ya es la mayor distancia de la muestra, ningun cambio puede superarlo:
    la prueba no dispararia jamas y estaria en el codigo sin hacer nada, que es
    peor que no tenerla.

    La lectura casi seguramente correcta es MAD (median absolute deviation), que
    es la dispersion robusta que usa la referencia bibliografica del propio
    documento (https://bsrn.awi.de/) para el control de calidad de radiacion.
    Por defecto se usa MAD; la lectura literal queda disponible pasando
    `Contexto(desviacion_de_ruido=umbrales.DESVIACION_MAXIMA)` para poder
    contrastar las dos cuando el equipo confirme cual quiso decir.
    """
    minimo = umbrales.MINIMO_MUESTRAS_PARA_ESTADISTICA
    saltos = cadencia.pasos(serie)
    salida = []
    for dia, indices in sorted(indices_por_dia(serie).items()):
        cambios = {}
        for i in indices:
            salto = saltos[i]
            if salto is None or not es_valor(serie.valores[i]):
                continue
            previo = serie.valores[salto.anterior]
            if es_valor(previo):
                cambios[i] = abs(serie.valores[i] - previo)
        if len(cambios) < minimo:
            continue
        umbral = estadistica.umbral_de_ruido(
            list(cambios.values()), contexto.desviacion_de_ruido)
        afectados = [i for i, cambio in cambios.items() if cambio > umbral]
        if not afectados:
            continue
        salida.append(Hallazgo(
            fecha=dia, fuente=serie.fuente, variable=serie.variable.clave,
            tipo="ruido_excesivo",
            severidad=severidad_por_fraccion(len(afectados), len(cambios)),
            n_afectadas=len(afectados),
            detalle={"umbral": round(umbral, 4), "de": len(cambios),
                     "dispersion": contexto.desviacion_de_ruido,
                     "factor": umbrales.FACTOR_DESVIACION_DE_RUIDO,
                     "peor": round(max(cambios[i] for i in afectados), 4),
                     "unidad": serie.variable.unidad}))
    return salida
