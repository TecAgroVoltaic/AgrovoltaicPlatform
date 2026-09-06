"""Familia 1: completitud. ¿Esta todo lo que tenia que estar?

Las seis pruebas del documento: NaN, NULL, timestamps faltantes, minutos
faltantes, parametros faltantes y dispositivos faltantes.

NaN y NULL van SEPARADOS aunque los dos signifiquen "no hay numero", porque no se
arreglan en el mismo lado. Un NULL es una columna que no vino en el CSV de ese
dia (el problema de los trece esquemas, se arregla en el mapeo del ETL); un NaN
es una lectura que llego rota o una division que salio mal, y ademas envenena
cualquier promedio que la toque. Contarlos juntos borra esa diferencia.
"""
from __future__ import annotations

from math import ceil

from historico.calidad.pruebas import cadencia
from historico.calidad.pruebas.contrato import (
    GRAVE, Contexto, Hallazgo, NoAplica, Serie, es_nan, es_valor,
    hallazgos_por_dia, indices_por_dia, severidad_por_fraccion,
)

_SEGUNDOS_POR_MINUTO = 60


def valores_nan(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """NaN o infinito entre las lecturas."""
    afectados = [i for i, v in enumerate(serie.valores) if es_nan(v)]
    return hallazgos_por_dia(
        serie, afectados, "valor_nan",
        nota="un NaN no es un cero: contamina todo promedio que lo incluya")


def valores_nulos(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """NULL entre las lecturas. Un dia entero en NULL es `parametro_faltante`."""
    afectados = [i for i, v in enumerate(serie.valores) if v is None]
    return hallazgos_por_dia(
        serie, afectados, "valor_nulo",
        nota="lecturas sin valor; si es el dia entero mirar `parametro_faltante`")


def timestamps_faltantes(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Muestras que faltan DENTRO de lo que el logger si grabo.

    Se cuenta contra la ventana efectivamente grabada (primera a ultima marca del
    dia) y no contra el dia entero: que el logger arranque tarde es otra falla y
    tiene su propio nombre en el barrido (`dia_incompleto`). Aca se busca el
    hueco interno, que es el que se disfraza de dia sano.
    """
    salida: list[Hallazgo] = []
    for dia, indices in sorted(indices_por_dia(serie).items()):
        if len(indices) < 2:
            continue
        referencia = cadencia.dominante(serie, indices)
        ventana = (serie.marcas[indices[-1]] - serie.marcas[indices[0]]).total_seconds()
        esperadas = int(round(ventana / referencia.segundos)) + 1
        faltantes = esperadas - len(indices)
        if faltantes <= 0:
            continue
        salida.append(Hallazgo(
            fecha=dia, fuente=serie.fuente, variable=serie.variable.clave,
            tipo="timestamp_faltante",
            severidad=severidad_por_fraccion(faltantes, esperadas),
            n_afectadas=faltantes,
            detalle={"presentes": len(indices), "esperadas": esperadas,
                     "cadencia_seg": referencia.segundos,
                     "cadencia_origen": referencia.origen,
                     "nota": "medido dentro de la ventana grabada, no contra el dia"}))
    return salida


def minutos_faltantes(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Minutos de la ventana solar que no tienen ninguna lectura detras.

    El documento pide "minutos faltantes" sin decir contra que. Contarlos contra
    las 24 h daria la mitad del dia siempre (el logger solo graba de dia) y
    contra la cadencia de 5 min daria cuatro de cada cinco minutos siempre. Se
    cuentan contra la VENTANA SOLAR y cada lectura cubre los minutos de su propia
    cadencia: asi un dia sano da cero a 15 s y a 5 min, y lo que sobresale es el
    hueco de verdad. Es la unica lectura de la prueba que mide algo.
    """
    if not contexto.ventanas_solares:
        raise NoAplica("sin `ventana_solar` no hay contra que contar los minutos")

    salida, evaluados = [], 0
    for dia, indices in sorted(indices_por_dia(serie).items()):
        ventana = contexto.ventanas_solares.get(dia)
        if ventana is None:
            continue
        evaluados += 1
        del_amanecer = int((ventana.atardecer - ventana.amanecer).total_seconds()
                           // _SEGUNDOS_POR_MINUTO)
        cubre = max(1, ceil(cadencia.dominante(serie, indices).segundos
                            / _SEGUNDOS_POR_MINUTO))
        cubiertos: set[int] = set()
        for i in indices:
            desfase = int((serie.marcas[i] - ventana.amanecer).total_seconds()
                          // _SEGUNDOS_POR_MINUTO)
            cubiertos.update(range(desfase, desfase + cubre))
        faltantes = del_amanecer - len({m for m in cubiertos if 0 <= m < del_amanecer})
        if faltantes <= 0:
            continue
        salida.append(Hallazgo(
            fecha=dia, fuente=serie.fuente, variable=serie.variable.clave,
            tipo="minuto_faltante",
            severidad=severidad_por_fraccion(faltantes, del_amanecer),
            n_afectadas=faltantes,
            detalle={"minutos_de_sol": del_amanecer, "minutos_por_lectura": cubre,
                     "amanecer": ventana.amanecer, "atardecer": ventana.atardecer}))
    if not evaluados:
        raise NoAplica("ningun dia de la serie tiene ventana solar calculada")
    return salida


def parametro_faltante(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Dias en que la variable no trae NI UN valor utilizable.

    Es el problema de los trece esquemas: la columna no vino en el CSV de ese
    dia. Se separa de `valor_nulo` porque no se arregla contando, se arregla en
    el mapeo del ETL, y porque un cero calculado sobre esto seria una mentira.
    """
    salida = []
    for dia, indices in sorted(indices_por_dia(serie).items()):
        if any(es_valor(serie.valores[i]) for i in indices):
            continue
        salida.append(Hallazgo(
            fecha=dia, fuente=serie.fuente, variable=serie.variable.clave,
            tipo="parametro_faltante", severidad=GRAVE, n_afectadas=len(indices),
            detalle={"lecturas": len(indices),
                     "nota": "la columna existe pero no trajo un solo valor ese dia"}))
    return salida


def dispositivos_faltantes(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Dispositivos que se esperaban ese dia y no reportaron ni una lectura."""
    if not contexto.dispositivos_esperados:
        raise NoAplica("nadie declaro que dispositivos debian reportar")
    if not serie.dispositivos:
        raise NoAplica("la fuente no etiqueta el dispositivo de cada lectura")

    salida = []
    for dia, indices in sorted(indices_por_dia(serie).items()):
        presentes = {serie.dispositivos[i] for i in indices}
        ausentes = [d for d in contexto.dispositivos_esperados if d not in presentes]
        if not ausentes:
            continue
        salida.append(Hallazgo(
            fecha=dia, fuente=serie.fuente, variable=serie.variable.clave,
            tipo="dispositivo_faltante",
            severidad=severidad_por_fraccion(
                len(ausentes), len(contexto.dispositivos_esperados)),
            n_afectadas=len(ausentes),
            detalle={"faltantes": ausentes, "presentes": sorted(presentes),
                     "esperados": list(contexto.dispositivos_esperados)}))
    return salida
