"""Tool `hallazgos_calidad` — ¿que esta roto, donde y desde cuando?

El detalle detras del veredicto de `calidad_periodo`. Filtrable por tipo y por
severidad para poder preguntar cosas puntuales ("¿cuando fallo el sensor de
temperatura?") sin traerse los miles de hallazgos del historico entero.
"""
from __future__ import annotations

from historico import db
from historico.periodo import rango

# Que significa cada tipo, en una linea. Va en la respuesta y no solo en el
# prompt: el modelo no tiene por que saber que `saturado_85` es un DS18B20
# desconectado, y una tool que devuelve jerga sin traducir obliga a adivinar.
QUE_ES = {
    "dia_incompleto": "el logger no grabó todas las horas de sol",
    "hueco": "faltan muestras dentro de la ventana que sí grabó",
    "duplicado_timestamp": "el mismo instante aparece más de una vez",
    "cambio_de_cadencia": "el intervalo de muestreo cambió respecto al día anterior",
    "columna_ausente": "la columna no vino en el CSV de ese día (variación de esquema)",
    "nulos": "faltan valores sueltos en la columna",
    "fuera_de_rango": "valores fuera del rango físico plausible",
    "saturado_85": "85 °C constante: el DS18B20 está desconectado",
    "constante_en_cero": "sin variación en todo el día; en lo eléctrico, no hubo generación",
    "sensor_plano": "clavado en un valor que no es 0 ni 85: sensor trabado",
    "offset_nocturno": "el offset del piranómetro sin calibrar (-38,845)",
    "kt_imposible": "más energía que la de cielo despejado: dato inválido, no una nube",
}

SCHEMA = {
    "name": "hallazgos_calidad",
    "description": (
        "Detalle de los problemas de calidad detectados: que tipo, en que variable, que "
        "dia y cuantas lecturas afecta. Usala cuando pregunten QUE esta mal (no solo si "
        "los datos sirven), por un sensor concreto o por un problema concreto. "
        f"Tipos posibles: {', '.join(QUE_ES)}."
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
            "limite": {"type": "integer", "minimum": 1, "maximum": 200, "default": 50},
        },
        "additionalProperties": False,
    },
}


def run(desde: str | None = None, hasta: str | None = None, tipo: str | None = None,
        severidad: str | None = None, variable: str | None = None,
        limite: int = 50) -> dict:
    d, h = rango(desde, hasta)
    limite = max(1, min(int(limite), 200))

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
