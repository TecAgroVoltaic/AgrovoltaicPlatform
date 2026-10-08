"""La decision del bloque `confianza`, sin base de datos: cuantos dias son utilizables."""
from __future__ import annotations

from historico.calidad.contexto.criterios import (
    FRACCION_MATERIAL,
    TIPOS_DE_DISPONIBILIDAD,
    TIPOS_QUE_INVALIDAN,
)
from historico.calidad.contexto.disponibilidad import _bloque_disponibilidad, _parada_por_dia

_COBERTURA_NO_REPRESENTA = 0.25
_COBERTURA_PARCIAL = 0.6
_FUENTES_POR_DEFECTO = {"monitoreo_sc_electrico", "radiacion_sc_15s"}


def _dias_malos(hallazgos: list, filas: dict, variables: list[str],
                fuente: str | None) -> dict[str, set]:
    """Por variable, los dias que un hallazgo grave MATERIAL deja inutilizables.

    Se lleva la cuenta por variable y no en bolsa, porque una misma respuesta puede
    tener partes fiables y partes no: en enero 2026 la energia DC de PV1 y PV2 esta
    impecable y la AC no existe (la columna no vino). Un solo veredicto para las tres
    miente en las dos direcciones: o descarta datos buenos o avala uno inexistente.
    """
    malos: dict[str, set] = {v: set() for v in variables}
    for h in hallazgos:
        # La disponibilidad del equipo NO invalida el dato, ni como tipo que
        # invalida ni por fraccion: ya se conto en su propio canal. Sin este
        # `continue`, un apagon de dia entero (n_afectadas = todas las
        # lecturas) superaria el 20 % y condenaria un dia cuya energia es exacta.
        if h["tipo"] in TIPOS_DE_DISPONIBILIDAD:
            continue
        if h["severidad"] != "grave":
            continue
        if fuente and h["fuente"] != fuente:
            continue
        n_dia = filas.get((h["fecha"], h["fuente"]), 0)
        # El `n_dia > 0` no es defensivo por costumbre: sin el, un dia del que no
        # contamos lecturas da `n_afectadas >= 0` y CUALQUIER hallazgo lo invalida.
        # Ver la nota larga junto a FRACCION_MATERIAL.
        material = (h["tipo"] in TIPOS_QUE_INVALIDAN
                    or (n_dia > 0
                        and (h["n_afectadas"] or 0) >= FRACCION_MATERIAL * n_dia))
        if not material:
            continue
        # `variable = '*'` es un hallazgo de dia entero: afecta a todas.
        for v in (variables if h["variable"] == "*" else [h["variable"]]):
            if v in malos:
                malos[v].add(h["fecha"])
    return malos


def _bloque(utiles: set, calendario: list, con_datos: set) -> dict:
    cobertura = len(utiles) / len(calendario)
    if not con_datos:
        aviso = "el periodo no tiene datos: cualquier numero de arriba es de un rango vacio"
    elif cobertura < _COBERTURA_NO_REPRESENTA:
        aviso = (f"solo {len(utiles)} de {len(calendario)} dias del periodo son "
                 f"utilizables: los agregados de arriba NO representan el periodo")
    elif cobertura < _COBERTURA_PARCIAL:
        aviso = (f"{len(utiles)} de {len(calendario)} dias utilizables: leer los "
                 f"agregados como parciales, no como el total del periodo")
    else:
        aviso = None
    return {
        "dias_en_rango": len(calendario),
        "dias_con_datos": len(con_datos),
        "dias_utilizables": len(utiles),
        "cobertura": round(cobertura, 3),
        "advertencia": aviso,
    }


def reducir(calendario: list, filas: dict, hallazgos: list,
            variables: list[str], fuente: str | None = None) -> dict:
    """La decision, sin base de datos: dado el calendario, cuantas lecturas tuvo
    cada dia y que hallazgos hay, decidir cuantos dias son utilizables.

    Esta separada de las consultas a proposito: es donde vive el criterio, es la
    que se puede probar sin DB, y es donde aparecieron los dos defectos que solo
    se vieron corriendolo (condenar el periodo por una columna ajena, y dar un
    solo veredicto para variables que no van juntas).
    """
    if not calendario:
        return {"dias_en_rango": 0, "dias_con_datos": 0, "dias_utilizables": 0,
                "cobertura": 0.0, "medido_sobre": variables or "sin acotar",
                "advertencia": "no hay ni un dia de calendario en el rango pedido"}

    # Canal aparte y PRIMERO, para que se lea como lo que es: una cuenta sobre el
    # equipo que no se mezcla con ninguna de las cuentas sobre el dato.
    parada = _parada_por_dia(hallazgos, fuente)

    # Un dia tiene datos si la fuente que importa grabo algo ese dia.
    fuentes = ({fuente} if fuente else {k[1] for k in filas} or _FUENTES_POR_DEFECTO)
    con_datos = {d for d in calendario
                 if any(filas.get((d, s), 0) for s in fuentes)}
    malos = _dias_malos(hallazgos, filas, variables, fuente)

    por_variable = {v: _bloque(con_datos - malos[v], calendario, con_datos) for v in variables}
    # El global es el PEOR caso: sirve como titular conservador. El desglose de
    # abajo es el que dice la verdad cuando las partes no van juntas.
    union = set().union(*malos.values()) if malos else set()
    salida = _bloque(con_datos - union, calendario, con_datos)
    salida["medido_sobre"] = variables or "sin acotar"
    salida["disponibilidad"] = _bloque_disponibilidad(parada, con_datos)

    # La advertencia de la planta parada vive DENTRO de su bloque y no pisa
    # `salida["advertencia"]`, que habla de la calidad del dato. Son dos
    # advertencias sobre dos cosas distintas: fundirlas en un campo devolveria la
    # confusion que este canal existe para deshacer.
    if len({b["dias_utilizables"] for b in por_variable.values()}) > 1:
        salida["por_variable"] = {
            v: {"dias_utilizables": b["dias_utilizables"], "cobertura": b["cobertura"]}
            for v, b in por_variable.items()
        }
        mejores = max(por_variable.values(), key=lambda b: b["dias_utilizables"])
        salida["advertencia"] = (
            f"las variables NO van juntas: la peor tiene {salida['dias_utilizables']} dias "
            f"utilizables y la mejor {mejores['dias_utilizables']} de {len(calendario)}. "
            f"Mira `por_variable` antes de leer cada numero"
        )
    return salida
