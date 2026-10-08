"""Lo que falta de los VALORES o de los APARATOS: NaN, NULL, parametro y dispositivo."""
from __future__ import annotations

from historico.calidad.pruebas.contrato import (
    GRAVE,
    Contexto,
    Hallazgo,
    NoAplica,
    Serie,
    es_nan,
    es_valor,
    hallazgos_por_dia,
    indices_por_dia,
    severidad_por_fraccion,
)


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
