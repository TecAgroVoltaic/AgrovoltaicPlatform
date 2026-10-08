"""La ventana de los ultimos 7 dias y el recorte en memoria de los renglones diarios."""
from __future__ import annotations

from datetime import timedelta

from historico.analitica.resumen.constantes import DIAS_VENTANA_RECIENTE
from historico.analitica.resumen.frescura import _dia
from historico.analitica.ventana import DIA, Ventana, crear, ultimos_dias


def ventana_reciente(ventana: Ventana, ultimo: str | None) -> Ventana | None:
    """Los ultimos `DIAS_VENTANA_RECIENTE` dias contra el ULTIMO DIA CON DATOS.

    `ultimo` es el ultimo dato DE LA VENTANA (no el global): estos KPIs describen el
    periodo pedido, asi que su tramo tiene que caer dentro de el. Con el global, una
    ventana historica daria siete dias de hoy que no tocan el periodo y los tres KPIs
    saldrian vacios.

    El fin es exclusivo, asi que va un dia despues del ultimo con dato para
    incluirlo. Nunca se sale por la izquierda de la ventana pedida.
    """
    if not ultimo:
        return None
    fin = _dia(ultimo) + timedelta(days=1)
    reciente = ultimos_dias(DIAS_VENTANA_RECIENTE, fin)
    return reciente if reciente.desde >= ventana.desde else crear(ventana.desde, fin, DIA)


def tramo(dias: list[dict], ventana: Ventana | None) -> list[dict]:
    """Los renglones diarios que caen en la ventana. Recorte en memoria, sin ir a la DB.

    La ventana reciente siempre es un subconjunto de la pedida, asi que las dos
    salen de la MISMA consulta: dos viajes con dos filtros son dos oportunidades
    de que el total del periodo y el de los ultimos 7 dias dejen de ser
    comparables. `d["dia"]` es una fecha ISO y su orden alfabetico es el
    cronologico, asi que el recorte es una comparacion de textos y nada mas.
    """
    if ventana is None:
        return []
    desde, hasta = ventana.sql
    return [d for d in dias if desde <= d["dia"] < hasta]
