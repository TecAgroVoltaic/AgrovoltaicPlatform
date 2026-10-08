"""Resumen por fuente y composicion de la respuesta desde el calendario ya traido."""
from __future__ import annotations

from historico.analitica.completitud.constantes import _CAMPO_FILAS, _NOTA, FUENTES
from historico.analitica.completitud.medida import _fraccion, cadencia
from historico.analitica.completitud.series import granularidad_efectiva, serie, tramos_sin_datos


def resumir(dias: list[dict], fuente: str, puntos: list[dict]) -> dict:
    """Dias de calendario, con datos, sin datos, y los huecos. Puro, sin DB.

    Lo esperado se suma de `puntos` y no se recalcula: si el resumen midiera contra
    una sola cadencia y el grafico contra la de cada periodo, los dos numeros que
    el lector ve juntos no cuadrarian.
    """
    campo = _CAMPO_FILAS[fuente]
    con_datos = sum(1 for dia in dias if dia.get(campo))
    lecturas = sum(dia.get(campo) or 0 for dia in dias)
    objetivo = sum(punto["esperadas"] for punto in puntos)
    objetivo_grabaron = sum(punto["esperadas_dias_con_datos"] for punto in puntos)
    seg, origen = cadencia(dias, fuente)
    return {
        "cadencia_seg": seg,
        "cadencia_origen": origen,
        "cadencias_seg": sorted({punto["cadencia_seg"] for punto in puntos}),
        "dias_calendario": len(dias),
        "dias_con_datos": con_datos,
        "dias_sin_datos": len(dias) - con_datos,
        "lecturas": lecturas,
        "lecturas_esperadas": objetivo,
        "completitud": _fraccion(lecturas, objetivo),
        "lecturas_esperadas_dias_con_datos": objetivo_grabaron,
        "completitud_dias_con_datos": _fraccion(lecturas, objetivo_grabaron),
        "tramos_sin_datos": tramos_sin_datos(dias, fuente),
    }


def componer(dias: list[dict], granularidad: str) -> dict:
    """Series y resumen por fuente a partir del calendario YA traido. Puro."""
    efectiva = granularidad_efectiva(granularidad)
    series = {fuente: serie(dias, efectiva, fuente) for fuente in FUENTES}
    return {
        "granularidad_serie": efectiva,
        "granularidad_degradada": efectiva != granularidad,
        "series": series,
        "resumen": {f: resumir(dias, f, series[f]) for f in FUENTES},
        "nota": _NOTA,
    }
