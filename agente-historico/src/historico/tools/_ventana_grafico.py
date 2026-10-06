"""La ventana de un grafico del asistente: cerrada en el ultimo dia y bajo el tope.

Dos diferencias con la ventana de los endpoints, y las dos son por el dibujo:

  * Sin `hasta`, `ventana.crear` abre hasta el 2100. Para un numero da igual (no hay
    filas), pero un grafico mensual dibujaria 900 buckets vacios. Aca el extremo
    abierto se cierra en el dia de HOY EN EL SITIO (hora de Costa Rica, nunca el reloj
    de la maquina sin zona: ver `resumen.hoy_en_sitio`).
  * Si la granularidad pedida pasa del tope de puntos, se agrega a la siguiente mas
    gruesa en vez de fallar, y el subtitulo lo dice (contrato §1).
"""
from __future__ import annotations

from dataclasses import replace
from datetime import timedelta

from historico.analitica import fuente, ventana
from historico.analitica.resumen import hoy_en_sitio
from historico.analitica.ventana import DIA, GRANULARIDADES, HORA, MES, SEMANA, Ventana
from historico.tools._chartspec import TOPE_PUNTOS

POR = {HORA: "por hora", DIA: "por día", SEMANA: "por semana", MES: "por mes"}
# El tope efectivo es el menor entre el del contrato y el que ya impone `fuente`.
_TOPE = min(TOPE_PUNTOS, fuente.MAXIMO_PUNTOS)


def crear(desde: str | None, hasta: str | None, granularidad: str | None) -> Ventana:
    """`ventana.crear` con el extremo derecho abierto cerrado en hoy (incluido)."""
    if hasta is None:
        hasta = (hoy_en_sitio() + timedelta(days=1)).isoformat()
    return ventana.crear(desde, hasta, granularidad)


def ajustar_al_tope(v: Ventana, minima: str | None = None) -> Ventana:
    """La granularidad mas fina, desde la de `v` (o `minima`), que no pasa el tope.

    `MES` siempre entra: la ventana ya viene cerrada en hoy, asi que son decenas de
    buckets, no miles.
    """
    desde = GRANULARIDADES.index(v.granularidad)
    if minima is not None:
        desde = max(desde, GRANULARIDADES.index(minima))
    for granularidad in GRANULARIDADES[desde:]:
        candidata = replace(v, granularidad=granularidad)
        try:
            fuente.validar_tamano(candidata, _TOPE)
        except ventana.VentanaInvalida:
            continue
        return candidata
    return replace(v, granularidad=MES)


def subtitulo(v: Ventana, descripcion: str, pedida: str | None = None) -> str:
    """'2026-08-01 a 2026-08-31 · media por día'. El ultimo dia es INCLUSIVO aca porque
    es texto para leer; la ventana sigue siendo exclusiva."""
    ultimo = (v.hasta - timedelta(days=1)).isoformat()
    texto = f"{v.desde.isoformat()} a {ultimo} · {descripcion}"
    if pedida and pedida != v.granularidad:
        texto += f" (agregado: {POR[pedida]} pasaba de {_TOPE} puntos)"
    return texto
