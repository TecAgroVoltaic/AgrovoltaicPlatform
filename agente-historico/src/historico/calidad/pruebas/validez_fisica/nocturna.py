"""Irradiancia apreciable fuera de la ventana de sol de su dia."""
from __future__ import annotations

from datetime import timedelta

from historico.analitica.catalogo import RADIACION
from historico.calidad.pruebas import umbrales
from historico.calidad.pruebas.contrato import (
    GRAVE,
    Contexto,
    Hallazgo,
    NoAplica,
    Serie,
    es_valor,
    hallazgos_por_dia,
    indices_por_dia,
)
from historico.calidad.pruebas.validez_fisica.rango import _exigir_dato_sin_corregir

_PREFIJO_IRRADIANCIA = "irradiancia_"


def irradiancia_de_noche(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Irradiancia apreciable fuera de la ventana de sol de ese dia.

    El documento pide contrastar contra la ALTURA SOLAR. La altura solar del
    sitio ya esta resuelta dia por dia en `ventana_solar` (pvlib, via
    `calidad/sol.py`), asi que la prueba compara la marca contra el amanecer y el
    atardecer de SU dia en vez de rehacer la geometria y arriesgarse a que las
    dos capas discrepen.

    ZONA HORARIA: no se convierte nada. Las marcas y la ventana solar estan las
    dos en el reloj de pared local de Costa Rica, que es la convencion del store.
    Meter un `AT TIME ZONE` correria seis horas la comparacion y convertiria
    todas las mañanas del historico en irradiancia nocturna.
    """
    _exigir_dato_sin_corregir(serie)
    if serie.variable.familia != RADIACION or not serie.variable.clave.startswith(
            _PREFIJO_IRRADIANCIA):
        raise NoAplica(f"{serie.variable.clave} no es una irradiancia medida")
    if not contexto.ventanas_solares:
        raise NoAplica("sin `ventana_solar` no hay contra que contrastar la noche")

    margen = timedelta(minutes=umbrales.MARGEN_CREPUSCULO_MINUTOS)
    tolerado = umbrales.IRRADIANCIA_NOCTURNA_TOLERADA_WM2
    afectados, evaluados = [], 0
    for dia, indices in indices_por_dia(serie).items():
        ventana = contexto.ventanas_solares.get(dia)
        if ventana is None:
            continue
        evaluados += 1
        for i in indices:
            valor = serie.valores[i]
            if not es_valor(valor) or valor <= tolerado:
                continue
            if ventana.amanecer - margen <= serie.marcas[i] <= ventana.atardecer + margen:
                continue
            afectados.append(i)
    if not evaluados:
        raise NoAplica("ningun dia de la serie tiene ventana solar calculada")

    return hallazgos_por_dia(
        serie, afectados, "irradiancia_nocturna", severidad=GRAVE,
        tolerado_wm2=tolerado, origen=serie.origen,
        margen_crepusculo_min=umbrales.MARGEN_CREPUSCULO_MINUTOS,
        nota="radiacion apreciable con el sol bajo el horizonte: sensor, reloj o "
             "calibracion, nunca el cielo",
        detalle_del_dia=lambda idx: {
            "peor": max(serie.valores[i] for i in idx),
            "primera": serie.marcas[min(idx)], "ultima": serie.marcas[max(idx)]})
