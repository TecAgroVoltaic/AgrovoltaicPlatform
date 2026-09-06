"""Tool `hallazgos_calidad` — ¿que esta roto, donde y desde cuando?

El detalle detras del veredicto de `calidad_periodo`. Filtrable por tipo y por
severidad para poder preguntar cosas puntuales ("¿cuando fallo el sensor de
temperatura?") sin traerse los miles de hallazgos del historico entero.

## `QUE_ES` no puede quedarse corto en silencio

Este diccionario hace DOS cosas: traduce el tipo al castellano y es el `enum` con
que el modelo filtra. Un tipo que falte no sale mal traducido, sale INFILTRABLE:
el esquema no lo ofrece y nadie puede preguntar por el. Ya paso, y por eso esta
escrito esto: el diccionario se quedo con los doce tipos del primer detector
mientras las cinco familias de `calidad.pruebas` escribian dieciocho mas, con
`inversor_sin_acoplar` entre ellos, que es el hallazgo operativo mas importante
del historico (41 de 202 dias evaluables con la planta parada bajo sol).

La explicacion en castellano hay que escribirla a mano: ningun registro la puede
inventar. La LISTA de tipos no: `TIPOS_QUE_SE_ESCRIBEN` la deriva de los tres
detectores que llenan la tabla, y `tests/test_tools_calidad_periodo.py` falla en
cuanto uno de ellos produzca un tipo que este diccionario no explique. Es la misma
trampa de cardinalidad que ya mordio en `test_calidad_pruebas`: una lista a mano
al lado de un registro que crece solo se desincroniza sin dar error.
"""
from __future__ import annotations

from historico import db
from historico.calidad import barrido
from historico.periodo import rango

# El tipo que escribe `calidad/cielo.py`. Vive aca como constante porque alla esta
# incrustado en el texto del INSERT y no hay de donde importarlo. Queda anotado
# para quien pueda tocar ese modulo, que no es esta tanda.
TIPO_DEL_CIELO = "kt_imposible"

# Todos los tipos que la tabla `hallazgos_calidad` puede contener hoy, DERIVADOS
# de los tres detectores que escriben en ella: el barrido por dia y por columna,
# las cinco familias de `calidad.pruebas` (incluido el estructural `sin_fuente`) y
# el detector de cielo.
TIPOS_QUE_SE_ESCRIBEN: tuple[str, ...] = tuple(dict.fromkeys(
    tuple(barrido.TIPOS_PROPIOS) + tuple(barrido.TIPOS_DE_PRUEBAS) + (TIPO_DEL_CIELO,)))

# Que significa cada tipo, en una linea. Va en la respuesta y no solo en el
# prompt: el modelo no tiene por que saber que `saturado_85` es un DS18B20
# desconectado, y una tool que devuelve jerga sin traducir obliga a adivinar.
QUE_ES = {
    # ── Barrido por dia y por columna ────────────────────────────────────────
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
    # ── Familia 1: completitud ───────────────────────────────────────────────
    "valor_nan": "lecturas con NaN o infinito: un número que no es un número",
    "valor_nulo": "lecturas sueltas en NULL dentro de un día que sí trajo datos",
    "timestamp_faltante": "faltan muestras dentro de lo que el logger sí grabó",
    "minuto_faltante": "minutos de la ventana solar sin ninguna lectura detrás",
    "parametro_faltante": "el día entero sin un solo valor utilizable de esa variable",
    "dispositivo_faltante": "un dispositivo que se esperaba no reportó nada ese día",
    # ── Familia 2: validez fisica ────────────────────────────────────────────
    "bajo_minimo_fisico": "por debajo del mínimo físico de la variable",
    "sobre_maximo_fisico": "por encima del máximo físico de la variable",
    "irradiancia_nocturna": "irradiancia apreciable fuera de la ventana de sol de ese día",
    # ── Familia 3: consistencia temporal ─────────────────────────────────────
    "timestamp_duplicado": "la misma marca de tiempo repetida dentro del día",
    "intervalo_excesivo": "salto de más del doble de la cadencia del tramo",
    "marca_inestable": "jitter: intervalos que se apartan de su cadencia sin llegar a hueco",
    # ── Familia 4: anomalias estadisticas ────────────────────────────────────
    "salto_excesivo": "cambio entre dos lecturas seguidas por encima del umbral",
    "flatline": "treinta lecturas seguidas idénticas: el sensor dejó de moverse",
    "outlier_iqr": "valor fuera del rango intercuartílico de su propio día",
    "ruido_excesivo": "variación entre lecturas muy por encima de la habitual del día",
    # ── Familia 5: disponibilidad del EQUIPO ─────────────────────────────────
    # El unico que NO habla del dato sino de la planta: el dato es correcto y lo
    # que fallo fue el inversor. Por eso no baja `dias_utilizables` en `confianza`.
    "inversor_sin_acoplar": ("el inversor no se acopló a la red entre las 07:00 y las "
                             "17:00: el DATO es bueno, lo que falló fue el EQUIPO"),
    # ── Estructural: lo que el documento pide y la base no tiene ─────────────
    "sin_fuente": "la variable está en el documento y no en la base: nadie la mide",
    # ── Detector de cielo ────────────────────────────────────────────────────
    TIPO_DEL_CIELO: "más energía que la de cielo despejado: dato inválido, no una nube",
}

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
            "limite": {"type": "integer", "minimum": 1, "maximum": 200, "default": 50,
                       "description": "Cuantos hallazgos traer como maximo (los mas graves primero)."},
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
