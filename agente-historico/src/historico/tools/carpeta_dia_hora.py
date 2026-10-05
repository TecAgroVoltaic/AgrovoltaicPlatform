"""Tool `carpeta_dia_hora` — la forma del dia a lo largo de meses (Fig. 8 bis).

Delgada sobre `analitica.carpeta.diagrama`. La matriz son dias x 24 horas: una
ventana de un mes ya son 720 celdas y el historico entero pasa de trece mil.
Eso es un mapa de calor, y viaja por `GET /analitica/carpeta` para quien lo pinta.

Al modelo se le manda el PERFIL HORARIO: el promedio de cada hora sobre todos los
dias de la ventana, mas la hora del pico. Son 24 numeros, no trece mil, y son los
que contestan la pregunta que se le hace a este grafico ("¿a que hora genera
mas?", "¿a que hora empieza y termina?"). El perfil se promedia sobre la matriz ya
calculada: no es una cuenta nueva ni una segunda definicion de la hora local.
"""
from __future__ import annotations

from historico.analitica import carpeta, ventana
from historico.tools import opciones

DECIMALES = 3

SCHEMA = {
    "name": "carpeta_dia_hora",
    "description": (
        "La forma del DIA TIPICO en un periodo: cuanto vale la variable en cada hora "
        "local, promediada sobre todos los dias, y a que hora esta el pico. Usala "
        "cuando pregunten a que hora genera mas o menos, cuando arranca o termina la "
        "generacion, o como es el perfil horario. Pedi un rango acotado: el historico "
        "entero no entra en un diagrama."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "variable": opciones.variable("Clave de la variable del catalogo."),
            **opciones.ventana(),
            "agregacion": {
                "type": "string", "enum": list(carpeta.AGREGACIONES),
                "description": (f"'{carpeta.PROMEDIO}' = el valor tipico de esa hora; "
                                f"'{carpeta.INTEGRAL}' = cuanta energia entro en esa "
                                f"hora (solo para potencias e irradiancias)."),
            },
        },
        "required": ["variable"],
        "additionalProperties": False,
    },
}


def perfil_horario(matriz: list[list], conteo: list[list], horas: list[int]) -> list[dict]:
    """El promedio de cada hora sobre todos los dias de la ventana. Puro, sin base.

    Una hora sin ninguna celda con dato sale con `media` en None y `dias` en 0: de
    noche el cero es medido y en un dia que el logger no grabo no hay dato, y las
    dos cosas no se pueden pintar iguales.
    """
    salida = []
    for hora in horas:
        valores = [fila[hora] for fila in matriz if fila[hora] is not None]
        salida.append({
            "hora": hora,
            "media": round(sum(valores) / len(valores), DECIMALES) if valores else None,
            "maximo": round(max(valores), DECIMALES) if valores else None,
            "dias": len(valores),
            "lecturas": sum(fila[hora] for fila in conteo),
        })
    return salida


def hora_pico(perfil: list[dict]) -> dict | None:
    """La hora de mayor valor medio. None si la ventana no tiene una sola celda."""
    con_dato = [h for h in perfil if h["media"] is not None]
    return max(con_dato, key=lambda h: h["media"]) if con_dato else None


def run(variable: str, desde: str | None = None, hasta: str | None = None,
        agregacion: str = carpeta.PROMEDIO) -> dict:
    v = ventana.crear(desde, hasta)
    completo = carpeta.diagrama(v, variable, agregacion)
    perfil = perfil_horario(completo["matriz"], completo["conteo"], completo["horas"])
    omitidas = ("matriz", "conteo", "dias", "horas")
    return {
        **{k: valor for k, valor in completo.items() if k not in omitidas},
        "dias": {"total": len(completo["dias"]),
                 "desde": completo["dias"][0] if completo["dias"] else None,
                 "hasta": completo["dias"][-1] if completo["dias"] else None},
        "perfil_horario": perfil,
        "hora_pico": hora_pico(perfil),
        "nota": ("perfil horario promediado sobre los dias del periodo (sin la matriz "
                 "dia por dia). Las horas son LOCALES de Costa Rica. Una hora con "
                 "dias = 0 no es un cero medido: no hay dato en ninguna de sus celdas."),
    }
