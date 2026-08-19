"""Tools de DIAGNOSTICO: la evidencia previa al momento a pronosticar.

Dos herramientas hermanas, separadas a proposito (una tool = una pregunta):

  diagnosticar_condiciones -> como viene el cielo en los minutos previos.
  contexto_historico       -> que es normal para esta hora, segun dias anteriores.

Ninguna de las dos puede devolver el valor del instante objetivo. Esa garantia no
esta en la descripcion sino en `diagnostico.py`, que corta los datos en
`instante - horizonte` y solo agrega astronomia.
"""
from __future__ import annotations

from pronostico import diagnostico
from pronostico.domain import Variable

_VARIABLES = [Variable.IRRADIANCIA.value, Variable.HUMEDAD_SUELO.value]

SCHEMA_CONDICIONES = {
    "name": "diagnosticar_condiciones",
    "description": (
        "Describe COMO VENIA el cielo en los minutos previos a un momento, y cuanto se mueve "
        "el techo de cielo despejado en el horizonte. Es tu evidencia para decidir con que "
        "configuracion pronosticar: llamala SIEMPRE antes de predecir un instante historico. "
        "Devuelve claridad reciente (mediana, dispersion, tendencia, saltos bruscos, regimen), "
        "el techo en el corte y en el objetivo, y la TEORIA de que hace cada perilla. NO "
        "devuelve el valor medido del instante objetivo: ese no lo vas a tener antes de predecir."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "variable": {"type": "string", "enum": _VARIABLES},
            "instante": {"type": "string",
                         "description": "Momento a pronosticar, ISO ('2026-07-22T08:00')."},
            "horizonte_seg": {
                "type": "integer", "minimum": 60, "maximum": 21600,
                "description": ("Con cuanta anticipacion se pronosticaria. Define el CORTE: "
                                "solo se ven datos anteriores a instante - horizonte."),
            },
            "ventana_min": {
                "type": "number", "minimum": 15, "maximum": 720,
                "description": "Cuanto pasado describir, en minutos. Por defecto 120.",
            },
        },
        "required": ["variable", "instante", "horizonte_seg"],
        "additionalProperties": False,
    },
}

SCHEMA_HISTORICO = {
    "name": "contexto_historico",
    "description": (
        "Que paso a ESTA MISMA HORA en los dias anteriores, y en que regimen viene el sitio. "
        "Sirve para ubicar lo de hoy: si esta hora suele dar 38 % del techo y hoy venis con "
        "12 %, es un dia atipicamente cerrado, y eso cambia que configuracion conviene. "
        "Todas las ventanas caen en dias ANTERIORES al corte, asi que no hay forma de que "
        "veas el resultado. Usala junto con diagnosticar_condiciones cuando quieras una "
        "hipotesis mejor fundada que 'lo de recien se mantiene'."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "variable": {"type": "string", "enum": _VARIABLES},
            "instante": {"type": "string", "description": "Momento a pronosticar, ISO."},
            "horizonte_seg": {"type": "integer", "minimum": 60, "maximum": 21600,
                              "description": "Define el corte, igual que en el diagnostico."},
            "dias": {"type": "integer", "minimum": 1, "maximum": 30,
                     "description": "Cuantos dias anteriores mirar. Por defecto 7."},
            "ventana_min": {"type": "number", "minimum": 15, "maximum": 240,
                            "description": "Ancho de la ventana centrada en esa hora. Por defecto 60."},
        },
        "required": ["variable", "instante", "horizonte_seg"],
        "additionalProperties": False,
    },
}


def run_condiciones(variable: str, instante: str, horizonte_seg: int,
                    ventana_min: float = 120) -> dict:
    return diagnostico.condiciones(variable, instante=instante,
                                   ventana_min=ventana_min, horizonte_seg=horizonte_seg)


def run_historico(variable: str, instante: str, horizonte_seg: int,
                  dias: int = 7, ventana_min: float = 60) -> dict:
    return diagnostico.contexto_historico(variable, instante=instante, dias=dias,
                                          ventana_min=ventana_min,
                                          horizonte_seg=horizonte_seg)
