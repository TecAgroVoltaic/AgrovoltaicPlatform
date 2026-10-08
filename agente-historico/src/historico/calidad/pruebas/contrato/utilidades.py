"""Utilidades compartidas por las familias: valores, agrupacion por dia y severidad."""
from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import date
from math import isfinite

from historico.calidad.pruebas import umbrales
from historico.calidad.pruebas.contrato.constantes import AVISO, GRAVE, INFO
from historico.calidad.pruebas.contrato.tipos import Hallazgo, Serie


def es_nan(valor) -> bool:
    """NaN o infinito: una lectura rota que ademas envenena cualquier promedio."""
    return isinstance(valor, float) and not isfinite(valor)


def es_valor(valor) -> bool:
    """Hay numero utilizable (ni NULL ni NaN)."""
    return valor is not None and not es_nan(valor)


def indices_por_dia(serie: Serie) -> dict[date, list[int]]:
    """Indices de la serie agrupados por dia LOCAL y ordenados por marca.

    Todo se agrupa por dia porque la PK del store es por dia. El orden se impone
    aca y no se supone: una serie desordenada daria intervalos negativos.
    """
    grupos: dict[date, list[int]] = {}
    for i, marca in enumerate(serie.marcas):
        grupos.setdefault(marca.date(), []).append(i)
    for indices in grupos.values():
        indices.sort(key=lambda i: serie.marcas[i])
    return grupos


def severidad_por_fraccion(afectadas: int, total: int, maxima: str = GRAVE) -> str:
    """Gradua un hallazgo por cuanto del dia toca. `maxima` pone el techo."""
    fraccion = afectadas / total if total else 1.0
    if fraccion >= umbrales.FRACCION_AFECTADA_PARA_GRAVE and maxima == GRAVE:
        return GRAVE
    if fraccion >= umbrales.FRACCION_AFECTADA_PARA_AVISO and maxima != INFO:
        return AVISO
    return INFO


def hallazgos_por_dia(serie: Serie, indices: Sequence[int], tipo: str,
                      nota: str | None = None, severidad: str | None = None,
                      severidad_maxima: str = GRAVE,
                      detalle_del_dia: Callable[[list[int]], dict] | None = None,
                      **extra) -> list[Hallazgo]:
    """Parte una lista de indices afectados en un hallazgo por dia.

    Es el molde de casi toda prueba: detectar es elegir indices, y esto los
    convierte en filas del store con su severidad graduada y su contexto.
    """
    del_dia = indices_por_dia(serie)
    afectados_por_dia: dict[date, list[int]] = {}
    for i in indices:
        afectados_por_dia.setdefault(serie.marcas[i].date(), []).append(i)

    salida = []
    for dia, afectados in sorted(afectados_por_dia.items()):
        total = len(del_dia[dia])
        detalle = {"de": total, "fraccion": round(len(afectados) / total, 4), **extra}
        if nota:
            detalle["nota"] = nota
        if detalle_del_dia:
            detalle.update(detalle_del_dia(afectados))
        salida.append(Hallazgo(
            fecha=dia, fuente=serie.fuente, variable=serie.variable.clave, tipo=tipo,
            severidad=severidad or severidad_por_fraccion(
                len(afectados), total, severidad_maxima),
            n_afectadas=len(afectados), detalle=detalle))
    return salida
