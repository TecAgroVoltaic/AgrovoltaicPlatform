"""Adaptadores de la salida de `analitica/*` al `ChartSpec` del contrato. PUROS.

Ver `docs/referencia/contratos-asistente-alertas.md` §1. `datos` lleva EXACTAMENTE
las claves del tipo de la primitiva del frontend (en ingles, como las exporta
`mvp-debugger/app/components/charts/options/*.ts`): el frontend valida con zod y
pinta sin transformar. Por eso aca no se calcula nada nuevo: se renombra y se
reordena lo que el algoritmo ya calculo, con el mismo criterio que los adaptadores
de las vistas (`seriesChart.ts`, `BoxesFigure.tsx`, `RidgesFigure.tsx`...).

Regla que atraviesa todos: un hueco viaja como `None`, nunca como 0.
"""
from __future__ import annotations

from datetime import date, timedelta

from historico.analitica.ventana import DIA, HORA, MES, SEMANA

VERSION = 1
# Tope de puntos por serie del contrato. Quien grafica agrega a una granularidad
# mas gruesa antes de pasarlo.
TOPE_PUNTOS = 2000

SERIE, BARRAS, CAJAS, CARPETA, DISPERSION, CRESTAS = (
    "serie", "barras", "cajas", "carpeta", "dispersion", "crestas")
TIPOS = (SERIE, BARRAS, CAJAS, CARPETA, DISPERSION, CRESTAS)

# Largo de la etiqueta de categoria segun la granularidad del bucket "aaaa-mm-ddThh:mm".
_LARGO_ETIQUETA = {HORA: 16, DIA: 10, SEMANA: 10, MES: 7}
# Caja que no se dibuja: el frontend la reconoce por `count = 0` (ver BoxesFigure.tsx).
_CAJA_VACIA = {"min": 0, "q1": 0, "median": 0, "q3": 0, "max": 0, "count": 0}
DECIMALES_DENSIDAD = 4


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


def _caja(caja: dict) -> dict:
    """Los extremos son los BIGOTES (dato mas extremo dentro de la valla), no min/max."""
    minimo = caja["bigote_inferior"] if caja["bigote_inferior"] is not None else caja["minimo"]
    maximo = caja["bigote_superior"] if caja["bigote_superior"] is not None else caja["maximo"]
    cinco = (minimo, caja["q1"], caja["mediana"], caja["q3"], maximo)
    if not caja["n"] or any(v is None for v in cinco):
        return {"label": caja["mes"], **_CAJA_VACIA}
    return {"label": caja["mes"], "min": minimo, "q1": caja["q1"], "median": caja["mediana"],
            "q3": caja["q3"], "max": maximo, "count": caja["n"]}


def cajas(payload: dict) -> dict:
    """`BoxPlotData` desde `distribucion.cajas_mensuales`."""
    return {"boxes": [_caja(c) for c in payload["cajas"]],
            "unit": payload["variable"]["unidad"]}


def carpeta(payload: dict) -> dict:
    """`CalendarHeatmapData` desde `carpeta.diagrama`: columnas = dias, filas = horas."""
    datos = {
        "columns": payload["dias"],
        "rows": [f"{h:02d}" for h in payload["horas"]],
        "cells": [{"column": columna, "row": fila, "value": valor}
                  for columna, valores in enumerate(payload["matriz"])
                  for fila, valor in enumerate(valores)],
        "unit": payload["variable"]["unidad"],
    }
    for campo, clave in (("min", "minimo"), ("max", "maximo")):
        valor = payload["rango"][clave]["valor"]
        if valor is not None:
            datos[campo] = valor
    return datos


def dispersion(payload: dict) -> dict:
    """`ScatterFitData` desde `correlacion.dispersion`. Sin recta -> `fit: None`."""
    ajuste = payload["ajuste"]
    coeficientes = [ajuste[k]["valor"] for k in ("pendiente", "intercepto", "r2")]
    return {
        "points": [{"x": x, "y": y} for x, y in payload["puntos"]],
        "fit": (None if any(c is None for c in coeficientes)
                else dict(zip(("slope", "intercept", "r2"), coeficientes))),
        "xUnit": payload["x"]["unidad"], "yUnit": payload["y"]["unidad"],
    }


def crestas(payload: dict) -> dict:
    """`RidgelineData` desde `crestas.densidades`. Densidad normalizada al pico COMUN
    para que las crestas sigan siendo comparables entre si."""
    dibujables = [g for g in payload["grupos"] if g.get("densidad")]
    pico = max((d for g in dibujables for d in g["densidad"]), default=0.0)
    curvas = [{
        "id": g["grupo"], "label": g["etiqueta"], "x": payload["rejilla"],
        "density": [round(d / pico, DECIMALES_DENSIDAD) if pico > 0 else 0.0
                    for d in g["densidad"]],
        "tailProbability": g["prob_sobre_umbral"]["valor"],
    } for g in dibujables]
    datos = {"curves": curvas, "unit": payload["unidad"]}
    if payload.get("umbral") is not None:
        umbral = payload["umbral"]
        datos["threshold"] = {"value": umbral, "label": f"umbral {umbral} {payload['unidad']}"}
    return datos
