"""Tool `graficar` — arma un GRAFICO de una metrica del sistema PV en un periodo.

Para que el agente pueda MOSTRARLE una tendencia al usuario en el chat. Devuelve
datos REALES (reusa datos.serie, solo lectura sobre las vistas limpias) + un
marcador `_grafico` que el widget del chat pinta. El LLM NO recibe los arreglos
grandes (el lazo del chat le pasa solo el `resumen`) -> no quema tokens; el grafico
lo consume el frontend. Cero invencion: el grafico ES la salida de una tool.
"""
from __future__ import annotations

from analizador import datos

# metrica -> (relacion, [(columna, nombre_serie)], unidad, titulo). Todas las
# relaciones/columnas estan en la allowlist de datos.py -> seguras.
_METRICAS = {
    "potencia":     ("electrico_corregido", [("potencia_pv1_w", "PV1"), ("potencia_pv2_w", "PV2")], "W", "Potencia media por arreglo"),
    "irradiancia":  ("radiacion_calibrada", [("irradiancia_incidente_wm2", "GHI")], "W/m2", "Irradiancia global (GHI)"),
    "kt":           ("radiacion_calibrada", [("kt_star", "kt*")], "", "Indice de claridad kt*"),
    "pr":           ("performance", [("pr_pv1", "PR PV1"), ("pr_pv2", "PR PV2")], "", "Performance Ratio por arreglo"),
    "temperatura":  ("electrico_corregido", [("temp_inclinado", "PV1"), ("temp_vertical", "PV2")], "C", "Temperatura media por arreglo"),
}

SCHEMA = {
    "name": "graficar",
    "description": (
        "Genera un GRAFICO de tendencia de una metrica del sistema PV para MOSTRARSELO al usuario. "
        "Usalo cuando el usuario quiera VER la evolucion en el tiempo (no solo un numero). Metricas: "
        "'potencia' (W por arreglo), 'irradiancia' (GHI W/m2), 'kt' (indice de claridad), "
        "'pr' (performance ratio por arreglo), 'temperatura' (C por arreglo). Devuelve los puntos "
        "reales de la base; nunca inventes una serie."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "metrica": {"type": "string", "enum": list(_METRICAS),
                        "description": "Que graficar."},
            "desde": {"type": "string", "description": "Inicio ISO (opcional; omitir = todo)."},
            "hasta": {"type": "string", "description": "Fin ISO exclusivo (opcional)."},
            "bucket": {"type": "string", "enum": ["day", "week", "month"],
                       "description": "Granularidad temporal. Default 'day'."},
        },
        "required": ["metrica"],
        "additionalProperties": False,
    },
}


def run(metrica: str, desde: str | None = None, hasta: str | None = None,
        bucket: str = "day") -> dict:
    if metrica not in _METRICAS:
        raise ValueError(f"metrica desconocida: {metrica!r} ({', '.join(_METRICAS)})")
    if bucket not in ("day", "week", "month"):
        raise ValueError(f"bucket invalido: {bucket!r} (day|week|month)")

    rel, cols, unidad, titulo = _METRICAS[metrica]
    series, resumen = [], []
    x: list[str] = []
    for col, nombre in cols:
        s = datos.serie(rel, col, bucket, "avg", desde, hasta)
        pts = s["puntos"]
        if not x:
            x = [p["t"][:10] for p in pts]
        valores = [p["v"] for p in pts]
        series.append({"nombre": nombre, "valores": valores})
        limpios = [v for v in valores if v is not None]
        resumen.append({
            "serie": nombre, "n": len(limpios),
            "min": round(min(limpios), 3) if limpios else None,
            "max": round(max(limpios), 3) if limpios else None,
            "media": round(sum(limpios) / len(limpios), 3) if limpios else None,
        })
        periodo = s["periodo"]

    return {
        "metrica": metrica, "bucket": bucket, "periodo": periodo, "unidad": unidad,
        "resumen": resumen,
        "_grafico": {"tipo": "linea", "titulo": titulo, "unidad": unidad, "x": x, "series": series},
        "nota": "Grafico de datos reales de la base. Mostraselo al usuario y comenta la tendencia; "
                "no repitas todos los numeros.",
    }
