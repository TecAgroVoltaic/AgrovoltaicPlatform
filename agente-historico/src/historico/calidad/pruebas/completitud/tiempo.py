"""Lo que falta en el TIEMPO: muestras dentro de la ventana grabada y minutos de sol."""
from __future__ import annotations

from math import ceil

from historico.calidad.pruebas import cadencia
from historico.calidad.pruebas.contrato import (
    Contexto,
    Hallazgo,
    NoAplica,
    Serie,
    indices_por_dia,
    severidad_por_fraccion,
)

_SEGUNDOS_POR_MINUTO = 60


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
