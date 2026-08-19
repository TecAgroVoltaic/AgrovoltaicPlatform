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
        "NO es una prediccion en vivo, es una evaluacion. Rango disponible: irradiancia desde el "
        "2025-11-28 y humedad_suelo desde el 2026-05-01, ambas hasta el 2026-07-23 (la ingesta "
        "esta congelada desde esa fecha). Si te pasas del rango, la herramienta te devuelve el "
        "rango exacto: citalo, no lo adivines."
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
            "hora": {
                "type": "string",
                "description": (
                    "Hora concreta del dia a mirar, formato 'HH:MM' (p.ej. '12:00'). Si el "
                    "usuario pregunta por un momento puntual, PASALA: el resultado trae el "
                    "valor real y el reconstruido de esa hora exacta. Sin esto solo tenes "
                    "metricas del periodo y NO podes hablar de valores puntuales."
                ),
            },
        },
        "required": ["variable", "desde"],
        "additionalProperties": False,
    },
}


# Con mas puntos que esto, la serie completa deja de ser barata en tokens y se
# manda solo el resumen (extremos + la hora pedida).
_MAX_PUNTOS_AL_LLM = 32


def _punto(pts: list[dict], etiqueta, hora: str | None) -> dict | None:
    """El punto de una hora concreta ('12:00'), o None si esa hora no esta.

    Incluye el TECHO de cielo despejado y el kt* resultante cuando la variable los
    tiene (irradiancia). Sin ellos el agente no puede explicar POR QUE acerto o
    fallo: 33 W/m2 no dice nada si no se sabe que el maximo posible eran 505.
    """
    if not hora:
        return None
    for p in pts:
        if not p["t"].endswith(hora):
            continue
        punto = {"t": etiqueta(p["t"]), "real": p["real"], "reconstruido": p["pred"],
                 "error": round(p["pred"] - p["real"], 2)}
        # OJO: de noche el techo es 0, que es un valor VALIDO, no un campo
        # ausente. Se distingue "no aplica" (humedad, sin cs) de "vale cero"
        # (irradiancia nocturna); el kt* si se omite, porque dividir por 0 no
        # significa nada.
        techo = p.get("cs")
        if techo is not None:
            punto["techo_cielo_despejado"] = round(float(techo), 2)
            if float(techo) > 0:
                punto["kt_estrella"] = round(p["real"] / float(techo), 3)
        return punto
    return None


def run(variable: str, desde: str, hasta: str | None = None, bucket: str = "h",
        hora: str | None = None) -> dict:
    r = bt_mod.backtest(variable, bucket=bucket, desde=desde, hasta=hasta)
    pts = r["puntos"]
    # etiquetas: hora del dia (HH:MM) si es intradia; fecha (MM-DD) si es diario.
    etiqueta = (lambda t: t[5:]) if bucket == "D" else (lambda t: t[-5:])
    unidad = UNIDAD[variable]

    # Sin valores en la salida, el LLM se quedaba SOLO con metricas agregadas y
    # describia la curva de memoria (se le observo inventar picos de 600-700
    # W/m2 en un dia cuyo maximo real fue 358). El grafico no lo ve —se le quita
    # por tokens—, asi que los numeros tienen que viajar aca.
    maximo = max(pts, key=lambda p: p["real"])
    resumen = {
        "maximo_real": {"t": etiqueta(maximo["t"]), "valor": maximo["real"]},
        "promedio_real": round(sum(p["real"] for p in pts) / len(pts), 2),
    }
    punto = _punto(pts, etiqueta, hora)
    if hora and punto is None:
        resumen["aviso_hora"] = (f"no hay dato para las {hora} en ese periodo; "
                                 f"horas disponibles: {etiqueta(pts[0]['t'])}"
                                 f"-{etiqueta(pts[-1]['t'])}")
    def _fila(p: dict) -> dict:
        fila = {"t": etiqueta(p["t"]), "real": p["real"], "reconstruido": p["pred"]}
        if p.get("cs") is not None:            # 0 de noche es un valor, no un hueco
            fila["techo"] = round(float(p["cs"]), 1)
        return fila

    serie = ([_fila(p) for p in pts] if len(pts) <= _MAX_PUNTOS_AL_LLM else None)

    return {
        "variable": variable,
        "unidad": unidad,
        "periodo": {"desde": desde, "hasta": hasta},
        "bucket": bucket,
        "metodo": r["metodo"],
        "n": r["n"],
        "metricas": r["metricas"],
        "resumen": resumen,
        "punto_consultado": punto,
        "serie": serie,
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
                "predicho el metodo (usa las metricas); aclara que es una reconstruccion. "
                "IMPORTANTE: usa SOLO los numeros de esta salida ('serie', 'punto_consultado', "
                "'resumen', 'metricas'). Si 'serie' viene en null no tenes los valores hora a "
                "hora: NO describas la forma de la curva ni des magnitudes aproximadas — "
                "limitate a las metricas, o volve a llamar acotando el periodo.",
    }
