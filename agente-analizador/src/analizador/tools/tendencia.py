"""Tool `tendencia` — resumen de la evolucion de una metrica (SIN la serie completa).

Version 'lean' de `graficar` pensada para agentes de TEXTO (p.ej. VisioneFlow),
donde no hay donde pintar un grafico y devolver toda la serie punto a punto solo
quema tokens. En vez de los arrays, devuelve el RESUMEN por serie (n, min, max,
media) + el periodo cubierto. Reusa el mismo mapa de metricas y `datos.serie`
que `graficar`, asi que los numeros son identicos: agregados de datos REALES de la
base (solo lectura sobre las vistas limpias). Cero invencion.
"""
from __future__ import annotations

from analizador import datos
from analizador.tools.graficar import _METRICAS  # unica fuente de verdad metrica->cols

SCHEMA = {
    "name": "tendencia",
    "description": (
        "Resumen de la EVOLUCION en el tiempo de una metrica del sistema PV, por "
        "arreglo, SIN la serie completa (ideal para responder en texto). Metricas: "
        "'potencia' (W por arreglo), 'irradiancia' (GHI W/m2), 'kt' (indice de "
        "claridad 0-1), 'pr' (performance ratio por arreglo), 'temperatura' (C por "
        "arreglo). Devuelve n, minimo, maximo y media por serie en el periodo. Usala "
        "cuando pregunten como evoluciono / la tendencia / el comportamiento de algo "
        "a lo largo del tiempo. Son agregados de datos reales; nunca inventes."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "metrica": {"type": "string", "enum": list(_METRICAS),
                        "description": "Que metrica resumir."},
            "desde": {"type": "string",
                      "description": "Inicio ISO, hora local CR (opcional; omitir = todo el historico)."},
            "hasta": {"type": "string",
                      "description": "Fin ISO EXCLUSIVO (opcional)."},
            "bucket": {"type": "string", "enum": ["day", "week", "month"],
                       "description": "Granularidad temporal del agregado. Default 'day'."},
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
    resumen: list[dict] = []
    periodo = {"desde": None, "hasta": None, "n_buckets": 0}
    for col, nombre in cols:
        s = datos.serie(rel, col, bucket, "avg", desde, hasta)
        pts = s["puntos"]
        if pts:  # el periodo es el mismo para todas las series (misma relacion/bucket)
            periodo = {"desde": pts[0]["t"][:10], "hasta": pts[-1]["t"][:10],
                       "n_buckets": len(pts)}
        limpios = [p["v"] for p in pts if p["v"] is not None]
        resumen.append({
            "serie": nombre, "n": len(limpios),
            "min": round(min(limpios), 3) if limpios else None,
            "max": round(max(limpios), 3) if limpios else None,
            "media": round(sum(limpios) / len(limpios), 3) if limpios else None,
        })

    return {
        "metrica": metrica, "unidad": unidad, "titulo": titulo,
        "bucket": bucket, "periodo": periodo, "resumen": resumen,
        "nota": ("Agregados de datos reales de la base (sin la serie completa). "
                 "Comenta la tendencia con estos numeros; no inventes puntos intermedios."),
    }
