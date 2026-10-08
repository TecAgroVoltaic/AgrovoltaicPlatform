"""Adaptadores de la salida de `analitica/*` al `ChartSpec` del contrato. PUROS.

Ver `docs/referencia/contratos-asistente-alertas.md` §1. `datos` lleva EXACTAMENTE
las claves del tipo de la primitiva del frontend (en ingles, como las exporta
`mvp-debugger/app/components/charts/options/*.ts`): el frontend valida con zod y
pinta sin transformar. Por eso aca no se calcula nada nuevo: se renombra y se
reordena lo que el algoritmo ya calculo, con el mismo criterio que los adaptadores
de las vistas (`seriesChart.ts`, `BoxesFigure.tsx`, `RidgesFigure.tsx`...).

Regla que atraviesa todos: un hueco viaja como `None`, nunca como 0.

Aca: el sobre, las series y las barras. Las figuras de distribucion (cajas, carpeta,
dispersion, crestas) viven en `_chartspec_figuras` y se reexportan desde aca.
"""
from __future__ import annotations

from datetime import date, timedelta

from historico.analitica.ventana import DIA, HORA, MES, SEMANA
from historico.tools._chartspec_figuras import (  # noqa: F401
    _CAJA_VACIA, DECIMALES_DENSIDAD, _caja, cajas, carpeta, crestas, dispersion,
)

VERSION = 1
# Tope de puntos por serie del contrato. Quien grafica agrega a una granularidad
# mas gruesa antes de pasarlo.
TOPE_PUNTOS = 2000

SERIE, BARRAS, CAJAS, CARPETA, DISPERSION, CRESTAS = (
    "serie", "barras", "cajas", "carpeta", "dispersion", "crestas")
TIPOS = (SERIE, BARRAS, CAJAS, CARPETA, DISPERSION, CRESTAS)

# Largo de la etiqueta de categoria segun la granularidad del bucket "aaaa-mm-ddThh:mm".
_LARGO_ETIQUETA = {HORA: 16, DIA: 10, SEMANA: 10, MES: 7}


def spec(tipo: str, titulo: str, unidad: str, datos: dict,
         subtitulo: str | None = None) -> dict:
    """El sobre del contrato alrededor de los datos de una primitiva."""
    sobre = {"version": VERSION, "tipo": tipo, "titulo": titulo, "unidad": unidad,
             "datos": datos}
    if subtitulo:
        sobre["subtitulo"] = subtitulo
    return sobre


def estadisticas(valores: list[float | None]) -> dict:
    """n, min, max y media de los valores con dato. Es lo que lee el LLM del grafico."""
    con_dato = [v for v in valores if v is not None]
    if not con_dato:
        return {"n": 0, "min": None, "max": None, "media": None}
    return {"n": len(con_dato), "min": round(min(con_dato), 3),
            "max": round(max(con_dato), 3),
            "media": round(sum(con_dato) / len(con_dato), 3)}


def _capa(puntos: list[dict], campo: str) -> list[dict] | None:
    """Una capa de la serie, o None si no trae ni un valor (no se dibuja vacia)."""
    if all(p.get(campo) is None for p in puntos):
        return None
    return [{"timestamp": p["t"], "value": p.get(campo)} for p in puntos]


def linea(serie: dict) -> dict:
    """Una serie de `analitica.series` como `TimeSeriesLine`."""
    puntos = serie["puntos"]
    salida = {"id": serie["clave"], "label": serie["etiqueta"],
              "points": [{"timestamp": p["t"], "value": p["valor"]} for p in puntos]}
    tendencia, movil = _capa(puntos, "tendencia"), _capa(puntos, "media_movil")
    if tendencia:
        salida["trend"] = tendencia
    if movil:
        salida["movingAverage"] = movil
    if any(p.get("banda_inferior") is not None for p in puntos):
        salida["deviationBand"] = [{"timestamp": p["t"], "lower": p.get("banda_inferior"),
                                    "upper": p.get("banda_superior")} for p in puntos]
    return salida


def serie(payload: dict, unidad: str) -> dict:
    """`TimeSeriesData` desde la salida de `series.serie_temporal`."""
    return {"lines": [linea(s) for s in payload["series"]], "unit": unidad}


def etiqueta_bucket(bucket: str, granularidad: str) -> str:
    """'2026-08-01T00:00' -> '2026-08-01' (dia), '2026-08' (mes)..."""
    return bucket[:_LARGO_ETIQUETA[granularidad]]


def barras(categorias: list[str], series: list[tuple[str, str, list]], unidad: str) -> dict:
    """`BarsData`. `series` = [(id, etiqueta, valores alineados con categorias)]."""
    return {"categories": categorias,
            "series": [{"id": i, "label": e, "values": v} for i, e, v in series],
            "unit": unidad}


def inicio_de_bucket(dia: date, granularidad: str) -> date:
    """El primer dia del bucket que contiene `dia` (semana = lunes, como date_trunc)."""
    if granularidad == SEMANA:
        return dia - timedelta(days=dia.weekday())
    if granularidad == MES:
        return dia.replace(day=1)
    return dia


def sumar_por_bucket(por_dia: dict[str, float], buckets: list[date],
                     granularidad: str) -> list[float | None]:
    """Suma valores diarios por bucket. Un bucket sin ningun dia con dato es None."""
    sumas: dict[date, float] = {}
    for dia, valor in por_dia.items():
        clave = inicio_de_bucket(date.fromisoformat(dia), granularidad)
        sumas[clave] = sumas.get(clave, 0.0) + valor
    return [round(sumas[b], 3) if b in sumas else None for b in buckets]
