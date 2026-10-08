"""Adaptadores de las figuras de distribucion al `ChartSpec`: cajas, carpeta,
dispersion y crestas. PUROS; ver `_chartspec` (que los reexporta) para el contrato.

Regla que atraviesa todos: un hueco viaja como `None`, nunca como 0.
"""
from __future__ import annotations

# Caja que no se dibuja: el frontend la reconoce por `count = 0` (ver BoxesFigure.tsx).
_CAJA_VACIA = {"min": 0, "q1": 0, "median": 0, "q3": 0, "max": 0, "count": 0}
DECIMALES_DENSIDAD = 4


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
