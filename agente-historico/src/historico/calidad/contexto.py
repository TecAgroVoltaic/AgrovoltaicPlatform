"""Cuanto se puede confiar en un periodo. El pegamento entre calidad y analisis.

Este modulo existe por UN problema concreto. `energia_por_arreglo` responde
"PV1 genero 47.300 Wh en enero" y el numero es correcto, pero 15 de esos 31 dias
no tienen datos utilizables, asi que la respuesta engaña. El agente no tiene forma
de saberlo salvo que se lo digan.

La solucion no es pedirselo al prompt. Es que **el dato de calidad viaje dentro
de la misma respuesta**: toda herramienta que agregue sobre un periodo incrusta
`confianza(desde, hasta)` en su payload. El modelo no puede reportar el numero sin
ver su fiabilidad, porque vienen juntos.

Es la misma regla de diseño que usan los MODOS del Predictivo, dicha al reves:
alla la garantia es que la herramienta que revela la respuesta NO ESTA en la lista;
aca es que el dato que relativiza el numero SI ESTA en el payload. En los dos casos
la garantia es estructural y no depende de que el modelo obedezca.

Ademas es la fuente UNICA del veredicto de un dia: lo usan la herramienta
`calidad_periodo`, el bloque `confianza` y la vista de la consola. Si cada uno lo
calculara por su cuenta podrian discrepar sobre si un dia sirve, y eso no se nota
hasta que alguien ya decidio algo con el.
"""
from __future__ import annotations

from historico import db

# Un hallazgo es MATERIAL si toca al menos esta fraccion de las lecturas del dia.
# Un dia no deja de servir porque 3 de 144 lecturas de una de trece columnas se
# salieran de rango; sin este matiz los 274 dias daban "grave" y el veredicto no
# distinguia nada.
FRACCION_MATERIAL = 0.20
# Estos invalidan el dia por su naturaleza, sin importar cuantas lecturas toquen.
TIPOS_QUE_INVALIDAN = ("dia_incompleto", "duplicado_timestamp")

_SQL_DIAS = """
    WITH rad AS (SELECT "timestamp"::date f, count(*) n FROM radiacion_sc_15s
                  WHERE "timestamp" >= %s AND "timestamp" < %s GROUP BY 1),
         ele AS (SELECT "timestamp"::date f, count(*) n FROM monitoreo_sc_electrico
                  WHERE "timestamp" >= %s AND "timestamp" < %s GROUP BY 1),
         filas_dia AS (
            SELECT f, 'radiacion_sc_15s' AS fuente, n FROM rad
            UNION ALL
            SELECT f, 'monitoreo_sc_electrico',      n FROM ele),
         hall AS (
            SELECT h.fecha f, h.fuente,
                   count(*) FILTER (WHERE h.severidad = 'grave') AS graves,
                   count(*) FILTER (WHERE h.severidad = 'aviso') AS avisos,
                   count(*) FILTER (
                       WHERE h.severidad = 'grave' AND (
                         h.tipo = ANY(%s)
                         OR h.n_afectadas >= %s * COALESCE(fd.n, 0)
                       )) AS materiales
              FROM hallazgos_calidad h
              LEFT JOIN filas_dia fd ON fd.f = h.fecha AND fd.fuente = h.fuente
             GROUP BY h.fecha, h.fuente)
    SELECT v.fecha,
           COALESCE(rad.n, 0) AS filas_radiacion,
           COALESCE(ele.n, 0) AS filas_electrico,
           COALESCE(hr.graves, 0) AS graves_rad, COALESCE(hr.avisos, 0) AS avisos_rad,
           COALESCE(hr.materiales, 0) AS materiales_rad,
           COALESCE(he.graves, 0) AS graves_ele, COALESCE(he.avisos, 0) AS avisos_ele,
           COALESCE(he.materiales, 0) AS materiales_ele,
           c.clase, c.kt_medio, c.indice_variabilidad
      FROM ventana_solar v
      LEFT JOIN rad ON rad.f = v.fecha
      LEFT JOIN ele ON ele.f = v.fecha
      LEFT JOIN hall hr ON hr.f = v.fecha AND hr.fuente = 'radiacion_sc_15s'
      LEFT JOIN hall he ON he.f = v.fecha AND he.fuente = 'monitoreo_sc_electrico'
      LEFT JOIN cielo_diario c ON c.fecha = v.fecha
     WHERE v.fecha >= %s AND v.fecha < %s
     ORDER BY v.fecha
"""

_ORDEN = ["ok", "aviso", "grave", "sin_datos"]


def _veredicto(filas: int, materiales: int, graves: int, avisos: int) -> str:
    if not filas:
        return "sin_datos"
    if materiales:
        return "grave"
    if graves or avisos:
        return "aviso"
    return "ok"


def dias(desde: str, hasta: str) -> list[dict]:
    """Un renglon por dia de CALENDARIO en [desde, hasta), con su veredicto.

    Salen de `ventana_solar`, que tiene todos los dias, y no de las tablas de
    datos: los dias sin ninguna fila son justamente lo que hay que ver, y una
    consulta a las tablas de datos solo puede mostrar lo que existe.
    """
    filas = db.query(_SQL_DIAS, (
        desde, hasta, desde, hasta,
        list(TIPOS_QUE_INVALIDAN), FRACCION_MATERIAL,
        desde, hasta,
    ))
    for f in filas:
        f["veredicto_radiacion"] = _veredicto(
            f["filas_radiacion"], f["materiales_rad"], f["graves_rad"], f["avisos_rad"])
        f["veredicto_electrico"] = _veredicto(
            f["filas_electrico"], f["materiales_ele"], f["graves_ele"], f["avisos_ele"])
        # El del dia es el PEOR de los dos: si una de las dos fuentes no sirve, el
        # dia no sirve para cruzar irradiancia contra generacion, que es el punto.
        f["veredicto"] = max((f["veredicto_radiacion"], f["veredicto_electrico"]),
                             key=_ORDEN.index)
    return filas


_SQL_FILAS = """
    SELECT "timestamp"::date AS fecha, 'radiacion_sc_15s' AS fuente, count(*) AS n
      FROM radiacion_sc_15s WHERE "timestamp" >= %s AND "timestamp" < %s GROUP BY 1
    UNION ALL
    SELECT "timestamp"::date, 'monitoreo_sc_electrico', count(*)
      FROM monitoreo_sc_electrico WHERE "timestamp" >= %s AND "timestamp" < %s GROUP BY 1
"""

_SQL_HALLAZGOS_DE = """
    SELECT fecha, fuente, variable, tipo, severidad, n_afectadas
      FROM hallazgos_calidad
     WHERE fecha >= %s AND fecha < %s
       AND (variable = ANY(%s) OR variable = '*')
"""

_SQL_DIAS_CALENDARIO = "SELECT fecha FROM ventana_solar WHERE fecha >= %s AND fecha < %s"


def confianza(desde: str, hasta: str, variables: list[str] | None = None,
              fuente: str | None = None) -> dict:
    """El bloque que incrusta toda herramienta que agregue sobre un periodo.

    `variables` son las columnas de las que depende la respuesta, y NO es opcional
    por comodidad: sin ellas el veredicto condena el periodo entero porque OTRA
    columna de la misma tabla esta rota.

    Eso no es teorico, es lo que paso al probarlo. Enero 2026 daba "0 de 31 dias
    utilizables" para la energia DC, cuando `potencia_pv1_w` y `potencia_pv2_w`
    estaban impecables: los graves eran de `frecuencia_hz`, `temperatura_inversor_c`,
    `potencia_total_wac` y los dos DS18B20 muertos. Un veredicto que marca todo en
    rojo no distingue nada, y ademas es falso.

    Los hallazgos de dia entero (`variable = '*'`, como `dia_incompleto` o
    `duplicado_timestamp`) SI cuentan siempre: afectan a todas las columnas.
    """
    variables = list(variables or [])
    calendario = [f["fecha"] for f in db.query(_SQL_DIAS_CALENDARIO, (desde, hasta))]
    if calendario:
        return reducir(
            calendario,
            {(f["fecha"], f["fuente"]): f["n"]
             for f in db.query(_SQL_FILAS, (desde, hasta, desde, hasta))},
            db.query(_SQL_HALLAZGOS_DE, (desde, hasta, variables)),
            variables, fuente,
        )
    return reducir([], {}, [], variables, fuente)


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

    # Un dia tiene datos si la fuente que importa grabo algo ese dia.
    fuentes = ({fuente} if fuente else
               {k[1] for k in filas} or {"monitoreo_sc_electrico", "radiacion_sc_15s"})
    con_datos = {d for d in calendario
                 if any(filas.get((d, s), 0) for s in fuentes)}

    # Un dia queda INUTILIZABLE para una variable si algun hallazgo grave sobre ESA
    # variable toca una parte material de sus lecturas. Se lleva la cuenta por
    # variable y no en bolsa, porque una misma respuesta puede tener partes fiables
    # y partes no: en enero 2026 la energia DC de PV1 y PV2 esta impecable y la AC
    # no existe (la columna no vino). Un solo veredicto para las tres miente en las
    # dos direcciones: o descarta datos buenos o avala uno inexistente.
    malos: dict[str, set] = {v: set() for v in variables}
    for h in hallazgos:
        if h["severidad"] != "grave":
            continue
        if fuente and h["fuente"] != fuente:
            continue
        n_dia = filas.get((h["fecha"], h["fuente"]), 0)
        material = (h["tipo"] in TIPOS_QUE_INVALIDAN
                    or (h["n_afectadas"] or 0) >= FRACCION_MATERIAL * n_dia)
        if not material:
            continue
        # `variable = '*'` es un hallazgo de dia entero: afecta a todas.
        for v in (variables if h["variable"] == "*" else [h["variable"]]):
            if v in malos:
                malos[v].add(h["fecha"])

    def _bloque(utiles: set) -> dict:
        cobertura = len(utiles) / len(calendario)
        if not con_datos:
            aviso = "el periodo no tiene datos: cualquier numero de arriba es de un rango vacio"
        elif cobertura < 0.25:
            aviso = (f"solo {len(utiles)} de {len(calendario)} dias del periodo son "
                     f"utilizables: los agregados de arriba NO representan el periodo")
        elif cobertura < 0.6:
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

    por_variable = {v: _bloque(con_datos - malos[v]) for v in variables}
    # El global es el PEOR caso: sirve como titular conservador. El desglose de
    # abajo es el que dice la verdad cuando las partes no van juntas.
    union = set().union(*malos.values()) if malos else set()
    salida = _bloque(con_datos - union)
    salida["medido_sobre"] = variables or "sin acotar"

    distintas = len({b["dias_utilizables"] for b in por_variable.values()}) > 1
    if distintas:
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
