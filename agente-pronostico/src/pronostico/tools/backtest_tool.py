"""Tool `backtest` — evalua el metodo del pronostico sobre datos que YA pasaron.

La segunda modalidad del agente (la otra es `forecast`, hacia el futuro). Reconstruye
como se HABRIA predicho una fecha/periodo historico y lo compara con lo que REALMENTE
midio el sensor. Reusa `backtest.backtest` (misma logica que la vista "Prediccion vs
Real"). Devuelve un resumen chico para el LLM + un `_grafico` (real vs reconstruido)
que el widget del chat pinta inline. Es una RECONSTRUCCION, no una prediccion en vivo.
"""
from __future__ import annotations

from pronostico import backtest as bt_mod
from pronostico.domain import UNIDAD, Variable

SCHEMA = {
    "name": "backtest",
    "description": (
        "Evalua el metodo del pronostico sobre datos que YA PASARON: reconstruye como se habria "
        "predicho una fecha o periodo historico y lo compara con lo que REALMENTE midio el sensor. "
        "Usalo cuando el usuario pregunte por una fecha PASADA (p.ej. 'cuanta irradiancia hizo el 21 "
        "de julio') o quiera PROBAR/EVALUAR el modelo contra el historico. Variables: 'irradiancia' "
        "y 'humedad_suelo'. Devuelve el valor real medido + la reconstruccion + metricas de error. "
        "NO es una prediccion en vivo, es una evaluacion. Los datos van del 2026-05-01 al 2026-07-23."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "variable": {
                "type": "string",
                "enum": [Variable.IRRADIANCIA.value, Variable.HUMEDAD_SUELO.value],
                "description": "Que evaluar: 'irradiancia' (GHI W/m2) o 'humedad_suelo'.",
            },
            "desde": {
                "type": "string",
                "description": "Fecha ISO de inicio del periodo a evaluar, p.ej. '2026-07-21'. Año 2026.",
            },
            "hasta": {
                "type": "string",
                "description": "Fecha ISO de fin EXCLUSIVO. Para un solo dia, omitir (se toma el dia siguiente).",
            },
            "bucket": {
                "type": "string",
                "enum": ["15min", "30min", "h", "D"],
                "description": "Cadencia de la evaluacion. Default 'h' (por hora), ideal para un dia.",
            },
        },
        "required": ["variable", "desde"],
        "additionalProperties": False,
    },
}


def run(variable: str, desde: str, hasta: str | None = None, bucket: str = "h") -> dict:
    r = bt_mod.backtest(variable, bucket=bucket, desde=desde, hasta=hasta)
    pts = r["puntos"]
    # etiquetas: hora del dia (HH:MM) si es intradia; fecha (MM-DD) si es diario.
    etiqueta = (lambda t: t[5:]) if bucket == "D" else (lambda t: t[-5:])
    unidad = UNIDAD[variable]
    return {
        "variable": variable,
        "periodo": {"desde": desde, "hasta": hasta},
        "bucket": bucket,
        "metodo": r["metodo"],
        "n": r["n"],
        "metricas": r["metricas"],
        "_grafico": {
            "tipo": "linea",
            "titulo": f"Backtest {variable} · real vs reconstruido",
            "unidad": unidad,
            "x": [etiqueta(p["t"]) for p in pts],
            "series": [
                {"nombre": "Real (medido)", "valores": [p["real"] for p in pts]},
                {"nombre": "Reconstruccion", "valores": [p["pred"] for p in pts]},
            ],
        },
        "nota": r["nota"] + " Reporta el valor REAL medido y que tan bien lo habria "
                "predicho el metodo (usa las metricas); aclara que es una reconstruccion.",
    }
