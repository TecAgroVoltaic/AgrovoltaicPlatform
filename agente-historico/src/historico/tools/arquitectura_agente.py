"""Tool `arquitectura_agente` — como esta hecho el agente, para que pueda explicarse.

Sin esta tool, "¿que herramientas tenes?" o "¿que umbral usas para decir que un dia
esta incompleto?" se contestaban de memoria, que en un modelo de lenguaje es un
sinonimo educado de inventar. Y son preguntas legitimas: quien evalua el agente
necesita poder auditarlo hablando con el.

Devuelve el MISMO mapa que dibuja la consola (`historico.arquitectura`), que se
deriva del codigo real. O sea que el agente no puede describirse distinto de como
esta construido, ni quedarse desactualizado cuando alguien agrega una herramienta.

Lo que se PODA respecto del mapa completo son los `input_schema`. No por tamaño:
el modelo ya los tiene delante, son la definicion de sus propias herramientas.
Repetirlos dentro de una respuesta seria pagar dos veces por el mismo dato.
"""
from __future__ import annotations


SCHEMA = {
    "name": "arquitectura_agente",
    "description": (
        "Como esta construido ESTE agente: que herramientas tiene y para que sirve cada "
        "una, las dos familias en que se dividen, los umbrales que deciden si un dato "
        "sirve (con que decide cada numero), los tipos de hallazgo que detecta, como corre "
        "la deteccion y que garantias da. Usala cuando pregunten por el agente en si: sus "
        "capacidades, sus limites, sus criterios, como funciona o por que decide lo que "
        "decide. NO la uses para datos del sistema fotovoltaico."
    ),
    "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
}


def run() -> dict:
    # Import perezoso: `historico.arquitectura` importa el registro de tools, y el
    # registro importa este modulo. Al nivel superior seria una importacion circular.
    from historico.arquitectura import mapa

    m = mapa()
    return {
        "nombre": m["nombre"],
        "objetivo": m["objetivo"],
        "modelo": m["modelo"],
        "familias": {
            k: {"objetivo": v["objetivo"], "herramientas": v["herramientas"]}
            for k, v in m["familias"].items()
        },
        "herramientas": [
            {"nombre": h["nombre"], "familia": h["familia"],
             "para_que": h["descripcion"],
             "incrusta_confianza": h["incrusta_confianza"]}
            for h in m["herramientas"]
        ],
        "umbrales": m["umbrales"],
        "hallazgos": m["hallazgos"],
        "deteccion": m["deteccion"],
        "garantias": m["garantias"],
        "limites": m["limites"],
        "nota": (
            "Todo esto sale derivado del codigo, no de una descripcion escrita a mano: "
            "si una herramienta no aparece aca, el agente no la tiene. Los umbrales son "
            "POLITICA, no fisica: se eligieron y se pueden discutir."
        ),
    }
