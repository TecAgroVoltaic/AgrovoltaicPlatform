"""Tool `hallazgos_calidad` — ¿que esta roto, donde y desde cuando?

El detalle detras del veredicto de `calidad_periodo`. Filtrable por tipo y por
severidad para poder preguntar cosas puntuales ("¿cuando fallo el sensor de
temperatura?") sin traerse los miles de hallazgos del historico entero.

`QUE_ES` (la traduccion de cada tipo y el `enum` del filtro) vive en `_que_es`.
"""
from __future__ import annotations

from historico import db
from historico.periodo import rango
from historico.tools._que_es import QUE_ES, TIPO_DEL_CIELO, TIPOS_QUE_SE_ESCRIBEN  # noqa: F401

LIMITE_POR_DEFECTO, LIMITE_MAXIMO = 50, 200

SCHEMA = {
    "name": "hallazgos_calidad",
    "description": (
        "Detalle de los problemas de calidad detectados: que tipo, en que variable, que "
        "dia y cuantas lecturas afecta. Usala cuando pregunten QUE esta mal (no solo si "
        "los datos sirven), por un sensor concreto o por un problema concreto. "
        "Los tipos posibles estan en el enum de `tipo`, y cada hallazgo vuelve con su "
        "traduccion en `que_es`. `inversor_sin_acoplar` NO es un problema del dato: es "
        "la planta parada en horario operativo, un hecho del EQUIPO."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "desde": {"type": "string", "description": "Inicio ISO, hora local CR. Omitir = todo."},
            "hasta": {"type": "string", "description": "Fin ISO EXCLUSIVO. Omitir = todo."},
            "tipo": {"type": "string", "enum": list(QUE_ES),
                     "description": "Filtra por un tipo de problema."},
            "severidad": {"type": "string", "enum": ["grave", "aviso", "info"],
                          "description": "grave = el dato no sirve; aviso = usable con cuidado."},
            "variable": {"type": "string",
                         "description": "Filtra por columna, p.ej. temp_vertical."},
            "limite": {"type": "integer", "minimum": 1, "maximum": LIMITE_MAXIMO,
                       "default": LIMITE_POR_DEFECTO,
                       "description": "Cuantos hallazgos traer como maximo (los mas graves primero)."},
        },
        "additionalProperties": False,
    },
}


def run(desde: str | None = None, hasta: str | None = None, tipo: str | None = None,
        severidad: str | None = None, variable: str | None = None,
        limite: int = LIMITE_POR_DEFECTO) -> dict:
    d, h = rango(desde, hasta)
    limite = max(1, min(int(limite), LIMITE_MAXIMO))

    cond = ["fecha >= %s", "fecha < %s"]
    params: list = [d, h]
    for campo, valor in (("tipo", tipo), ("severidad", severidad), ("variable", variable)):
        if valor:
            cond.append(f"{campo} = %s")
            params.append(valor)
    donde = " AND ".join(cond)

    total = db.uno(f"SELECT count(*) AS n FROM hallazgos_calidad WHERE {donde}",
                   tuple(params)).get("n", 0)
    filas = db.query(
        f"""SELECT fecha, fuente, variable, tipo, severidad, n_afectadas, detalle
              FROM hallazgos_calidad WHERE {donde}
             ORDER BY (severidad = 'grave') DESC, fecha DESC, tipo, variable
             LIMIT %s""",
        tuple(params) + (limite,),
    )
    for f in filas:
        f["que_es"] = QUE_ES.get(f["tipo"], "")
    return {
        "periodo": {"desde": d, "hasta": h},
        "total": total,
        "devueltos": len(filas),
        "truncado": total > len(filas),
        "hallazgos": filas,
    }
