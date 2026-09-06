"""Tool `calidad_periodo` — ¿me puedo fiar de los datos de este periodo?

Es la primera pregunta que hay que hacerse antes de mirar cualquier numero del
historico, y hasta ahora no habia forma de hacerla. Devuelve el veredicto agregado
(cuantos dias sirven, cuantos estan degradados, cuantos no tienen datos) y los
problemas mas frecuentes, que es lo que dice POR QUE no sirven.

## Por que la lista de variables sale del catalogo y no se omite

`contexto.confianza(desde, hasta, variables, fuente)` acota el veredicto a las
columnas de las que depende la respuesta. Esta tool no depende de ninguna en
particular: pregunta por el periodo entero. La tentacion es no pasar ninguna, y es
justo lo que NO hay que hacer: con `variables` vacio, `reducir()` no tiene sobre
que llevar la cuenta de dias malos y devuelve que TODOS los dias con datos son
utilizables. La lista vacia no significa "todas": significa "ninguna".

Por eso se piden todas las que el barrido REALMENTE vigila en esa fuente, sacadas
de `catalogo.para_confianza`, que ademas traduce la clave del catalogo al nombre
con que la tabla de hallazgos guarda la variable (`irradiancia_incidente_wm2` ->
`irradiancia_incidente`). Sin esa traduccion el filtro no encontraria nada, y cero
hallazgos se lee como dato impecable.
"""
from __future__ import annotations

from historico import db
from historico.analitica import catalogo
from historico.calidad import contexto
from historico.periodo import rango

SCHEMA = {
    "name": "calidad_periodo",
    "description": (
        "Veredicto de calidad de los datos en un periodo: cuantos dias son utilizables, "
        "cuantos estan degradados y cuantos no tienen datos, mas los problemas mas "
        "frecuentes. Usala ANTES de reportar cualquier agregado del historico, y siempre "
        "que pregunten si los datos sirven o que tan confiable es un periodo. "
        "Omiti desde/hasta para todo el historico."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "desde": {"type": "string", "description": "Inicio ISO, hora local CR. Omitir = todo."},
            "hasta": {"type": "string", "description": "Fin ISO EXCLUSIVO. Omitir = todo."},
            "fuente": {
                "type": "string",
                "enum": ["radiacion_sc_15s", "monitoreo_sc_electrico"],
                "description": (
                    "Acota el veredicto a una fuente. Omitir = las dos, y el dia se juzga "
                    "por la peor. Las dos NO estan igual de sanas: conviene acotar."
                ),
            },
        },
        "additionalProperties": False,
    },
}


def variables_vigiladas(fuente: str | None = None) -> list[str]:
    """Las columnas que el barrido vigila en esa fuente, con el nombre del store.

    Se DERIVA del catalogo en vez de escribirse a mano: cada variable que alguien
    registre y el barrido empiece a vigilar entra sola en el veredicto. Una lista
    fija se quedaria corta en silencio, que es la unica forma de fallo que esta
    tool no puede permitirse (un veredicto que no mira una columna rota dice que
    el periodo esta sano).
    """
    claves = [v.clave for v in catalogo.disponibles()
              if v.clave_calidad and (fuente is None or v.fuente_calidad == fuente)]
    vigiladas, _ = catalogo.para_confianza(*claves)
    return vigiladas


# ── Las dos consultas, sueltas, para que el llamador las pueda subir de nivel ──
# `/calidad/resumen` es lo UNICO que bloquea la primera pintura de la vista de
# calidad, y esta tool es su bloque mas caro. Sus dos consultas no se deben nada,
# pero si esta funcion las paraleliza por dentro Y el endpoint la paraleliza por
# fuera, el nivel de adentro corre en fila (ver la nota de `db.en_paralelo` sobre
# el anidamiento): el endpoint acababa esperando dos viajes en serie sin que se
# notara desde aca.
#
# Por eso las dos consultas se exponen como TAREAS y la respuesta se arma en una
# funcion PURA. Asi el endpoint las mete en su propia tanda, todo sale de un solo
# viaje, y la tool sigue devolviendo exactamente el mismo cuerpo que antes.
def tareas(d: str, h: str, fuente: str | None = None):
    """Las dos consultas de esta tool, sin correr. Devuelve dos callables."""
    # `fuente` va por su NOMBRE. Pasarla como tercer posicional la metia en
    # `variables`, que es una lista de columnas: la cadena se consumia letra por
    # letra, ninguna columna se llama `m` ni `o` ni `n`, y el veredicto salia
    # limpio siempre. Es el modo de fallo que esta tool existe para evitar,
    # cometido por la tool misma.
    cond = ["fecha >= %s", "fecha < %s"]
    params: list = [d, h]
    if fuente:
        cond.append("fuente = %s")
        params.append(fuente)
    sql = (f"""SELECT tipo, severidad,
                      count(DISTINCT fecha)    AS dias,
                      count(DISTINCT variable) AS variables,
                      sum(n_afectadas)         AS lecturas
                 FROM hallazgos_calidad
                WHERE {' AND '.join(cond)}
                GROUP BY tipo, severidad
                ORDER BY (severidad = 'grave') DESC, dias DESC
                LIMIT 5""")
    return (lambda: contexto.confianza(d, h, variables_vigiladas(fuente), fuente),
            lambda: db.query(sql, tuple(params)))


def componer(d: str, h: str, veredicto: dict, frecuentes: list[dict]) -> dict:
    """El cuerpo de la tool a partir de sus dos insumos. PURA: no toca la base.

    Una sola composicion para los dos llamadores (la tool y `/calidad/resumen`):
    dos armados del mismo cuerpo son dos cuerpos que se separan sin que nadie mire.
    """
    return {
        "periodo": {"desde": d, "hasta": h},
        "veredicto": veredicto,
        "problemas_mas_frecuentes": frecuentes,
        "nota": ("un dia es 'no utilizable' cuando un problema grave toca al menos la "
                 "quinta parte de sus lecturas, o cuando le falta media jornada"),
    }


def run(desde: str | None = None, hasta: str | None = None,
        fuente: str | None = None) -> dict:
    d, h = rango(desde, hasta)
    veredicto, frecuentes = db.en_paralelo(*tareas(d, h, fuente))
    return componer(d, h, veredicto, frecuentes)
