"""Familia 3: consistencia temporal. ¿Las marcas de tiempo se sostienen?

Las tres pruebas del documento: timestamps duplicados, intervalos mayores a 2x la
tasa de muestreo esperada, y fluctuaciones en las marcas.

LA TRAMPA, y esta familia es donde muerde: "la tasa de muestreo esperada" no es
un numero. El historico tiene tramos a 2 s, 1 min y 5 min, y `intervalo_original_seg`
la declara fila por fila. Con una cadencia fija, diciembre 2024 entero (una
muestra cada 2 s) saldria como base rota. La cadencia de referencia se decide por
tramo en `cadencia.py`, que documenta el orden declarada > inferida > nominal, y
el origen viaja dentro del hallazgo para que se pueda auditar.

El hueco de la noche no cuenta: `cadencia.pasos()` corta por dia porque el logger
solo graba de dia (ver su docstring).
"""
from __future__ import annotations

from collections import Counter

from historico.calidad.pruebas import cadencia, umbrales
from historico.calidad.pruebas.contrato import (
    AVISO, GRAVE, Contexto, Hallazgo, Serie, hallazgos_por_dia, indices_por_dia,
)


def timestamps_duplicados(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Marcas repetidas dentro del mismo dia.

    Grave sin graduar: una marca repetida rompe la premisa de serie temporal, y
    cualquier agregado sobre el dia cuenta esa lectura dos veces. Es el mismo
    criterio que ya aplica `barrido.py`, para que las dos capas no discrepen.
    """
    salida = []
    for dia, indices in sorted(indices_por_dia(serie).items()):
        repeticiones = Counter(serie.marcas[i] for i in indices)
        repetidas = {marca: veces for marca, veces in repeticiones.items() if veces > 1}
        if not repetidas:
            continue
        sobrantes = sum(veces - 1 for veces in repetidas.values())
        salida.append(Hallazgo(
            fecha=dia, fuente=serie.fuente, variable=serie.variable.clave,
            tipo="timestamp_duplicado", severidad=GRAVE, n_afectadas=sobrantes,
            detalle={"filas": len(indices), "marcas_distintas": len(repeticiones),
                     "marcas_repetidas": len(repetidas),
                     "peor": max(repetidas.values())}))
    return salida


def intervalo_excesivo(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Saltos de mas de 2x la cadencia de referencia del tramo."""
    saltos = cadencia.pasos(serie)
    referencias = cadencia.esperada(serie)
    factor = umbrales.FACTOR_INTERVALO_EXCESIVO
    afectados = [i for i, salto in enumerate(saltos)
                 if salto and salto.segundos > factor * referencias[i].segundos]
    return hallazgos_por_dia(
        serie, afectados, "intervalo_excesivo", factor=factor,
        nota="hueco medido contra la cadencia declarada del tramo, no contra una fija",
        detalle_del_dia=lambda idx: {
            "hueco_max_seg": max(saltos[i].segundos for i in idx),
            "cadencia_seg": referencias[idx[0]].segundos,
            "cadencia_origen": referencias[idx[0]].origen})


def marcas_inestables(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Jitter: intervalos que se apartan de su cadencia sin llegar a ser hueco.

    Los huecos ya los cuenta `intervalo_excesivo`; si tambien entraran aca, un
    dia con una caida larga saldria reportado dos veces por el mismo hecho y
    quien lea el store creeria que son dos problemas. Por eso el corte de arriba
    es el mismo 2x, en exclusion.

    Se queda en AVISO como techo: una marca que se corre un 15 % no invalida el
    dato, complica el resampleo. Distinto es que se corra el doble, y eso ya
    tiene su prueba.
    """
    saltos = cadencia.pasos(serie)
    referencias = cadencia.esperada(serie)
    tolerancia = umbrales.TOLERANCIA_FLUCTUACION
    techo = umbrales.FACTOR_INTERVALO_EXCESIVO

    afectados = []
    for i, salto in enumerate(saltos):
        if salto is None:
            continue
        esperado = referencias[i].segundos
        desvio = abs(salto.segundos - esperado) / esperado
        if tolerancia < desvio and salto.segundos <= techo * esperado:
            afectados.append(i)

    return hallazgos_por_dia(
        serie, afectados, "marca_inestable", severidad_maxima=AVISO,
        tolerancia=tolerancia,
        nota="jitter del logger; los huecos van aparte en `intervalo_excesivo`",
        detalle_del_dia=lambda idx: {
            "cadencia_seg": referencias[idx[0]].segundos,
            "cadencia_origen": referencias[idx[0]].origen,
            "desvio_max": round(max(
                abs(saltos[i].segundos - referencias[i].segundos)
                / referencias[i].segundos for i in idx), 4)})
