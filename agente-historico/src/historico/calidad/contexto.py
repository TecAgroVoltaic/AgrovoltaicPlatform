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

## DOS ejes, no uno: el dato y el equipo

El veredicto responde "¿me puedo fiar de este numero?". Hay una segunda pregunta
que se le parece y no es la misma: "¿el sistema estaba funcionando?". Un dia con
el inversor caido a mediodia tiene dato BUENO sobre un equipo MALO, y son 41 de
202 dias evaluables (20,3 %). Mezclarlas hunde la confianza de meses cuya energia
es exacta y esconde la averia detras de una advertencia de calidad. Por eso la
disponibilidad viaja por un canal propio (`disponibilidad` en `confianza()`,
`lecturas_sin_acoplar` y `parada_bajo_sol` en `dias()`) y no toca el veredicto.
"""
from __future__ import annotations

from historico import cache, db

# Un hallazgo es MATERIAL si toca al menos esta fraccion de las lecturas del dia.
# Un dia no deja de servir porque 3 de 144 lecturas de una de trece columnas se
# salieran de rango; sin este matiz los 274 dias daban "grave" y el veredicto no
# distinguia nada.
FRACCION_MATERIAL = 0.20
#
# CUIDADO al tocar la comparacion de materialidad: si el dia no tiene lecturas
# contadas, el denominador es cero y `n_afectadas >= 0.20 * 0` se cumple SIEMPRE,
# asi que cualquier hallazgo invalidaria el dia. Por eso las dos implementaciones
# (el SQL y `reducir`) exigen denominador positivo antes de comparar.
#
# No es hipotetico: las pruebas de `calidad.pruebas` escriben hallazgos con fuente
# `radiacion_sc_clearsky`, `radiacion_sc_poa` y `sin_fuente`, y ninguna de las tres
# aparece en el CTE `filas_dia`. Sin la guarda, estrenar esas pruebas habria puesto
# en rojo dias sanos.
#
# Cuando no se puede medir la fraccion, el hallazgo cuenta como NO material. Los
# que de verdad matan un dia ya estan en TIPOS_QUE_INVALIDAN, que no mira el
# denominador; lo unico que se pierde asi es rigor sobre una fuente que no sabemos
# medir, mientras que el error opuesto condena dias sanos sin ninguna evidencia.
#
# Estos invalidan el dia por su naturaleza, sin importar cuantas lecturas toquen.
# `timestamp_duplicado` es el mismo hecho que `duplicado_timestamp` visto por la
# familia de consistencia temporal (`calidad.pruebas`): un dia con marcas
# repetidas no sirve para cruzar irradiancia contra generacion, que es justo para
# lo que existe el veredicto. Van los dos nombres porque los escriben dos
# detectores distintos y ninguno de los dos puede quedar fuera.
#
# `parametro_faltante` NO esta y es deliberado: que falte una columna no invalida
# a las otras, y ese matiz ya lo resuelve el desglose por variable de `reducir()`.
TIPOS_QUE_INVALIDAN = ("dia_incompleto", "duplicado_timestamp", "timestamp_duplicado")

# ── Disponibilidad del EQUIPO: fuera del veredicto, pero a la vista ───────────
# Estos hallazgos NO hablan de la calidad del dato: hablan de la planta. Un dia
# con el inversor caido entre las 07:00 y las 17:00 es un dia con dato BUENO
# sobre un sistema MALO, y son 41 de 202 dias evaluables (20,3 %).
#
# Meterlos en el veredicto seria un error en la direccion PELIGROSA. `confianza()`
# es lo que toda herramienta incrusta para decir "de este periodo se puede fiar":
# con los apagones dentro, un mes con la planta parada la mitad de los dias sale
# con la confianza hundida y el agente concluye "no confies en la energia de este
# mes", cuando la verdad es la contraria: la energia de ese mes es EXACTA, y es
# baja porque la planta estuvo parada. La advertencia de calidad esconderia la
# averia en vez de mostrarla.
#
# Por eso no basta con dejarlos fuera de TIPOS_QUE_INVALIDAN: hay que sacarlos de
# las TRES cuentas del veredicto.
#   * `materiales`, o un apagon de dia entero (n_afectadas = todas las lecturas)
#     supera el 20 % y pone el dia en grave;
#   * `graves` y `avisos`, o `_veredicto` devuelve "aviso" y ningun dia con la
#     planta parada podria salir "ok" aunque su dato sea impecable.
#
# Y en vez de silenciarlos, viajan por un CANAL PROPIO: `disponibilidad` en la
# salida de `confianza()` y las columnas `lecturas_sin_acoplar` / `parada_bajo_sol`
# en la de `dias()`. La alternativa (una severidad `info`) los habria dejado
# indistinguibles del ruido de diagnostico, y el numero que el experto necesita
# es justamente "41 de 202 dias con la planta parada", no un renglon mas al pie.
TIPOS_DE_DISPONIBILIDAD = ("inversor_sin_acoplar",)

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
                         OR (fd.n > 0 AND h.n_afectadas >= %s * fd.n)
                       )) AS materiales
              FROM hallazgos_calidad h
              LEFT JOIN filas_dia fd ON fd.f = h.fecha AND fd.fuente = h.fuente
             WHERE h.tipo <> ALL(%s)
             GROUP BY h.fecha, h.fuente),
         -- La disponibilidad del equipo sale del veredicto de calidad del dato y
         -- se cuenta aparte. Ver la nota larga junto a TIPOS_DE_DISPONIBILIDAD.
         -- `max` y no `sum`: las tres variables AC dejan un hallazgo cada una
         -- sobre el MISMO apagon, y sumarlas contaria el mismo hecho tres veces.
         -- Sin `fuente` en el GROUP BY: que la planta este parada es un hecho del
         -- dia entero, no de una tabla.
         disp AS (
            SELECT fecha f, max(n_afectadas) AS sin_acoplar,
                   bool_or(severidad = 'grave') AS bajo_sol
              FROM hallazgos_calidad
             WHERE tipo = ANY(%s)
             GROUP BY fecha)
    SELECT v.fecha,
           COALESCE(rad.n, 0) AS filas_radiacion,
           COALESCE(ele.n, 0) AS filas_electrico,
           COALESCE(hr.graves, 0) AS graves_rad, COALESCE(hr.avisos, 0) AS avisos_rad,
           COALESCE(hr.materiales, 0) AS materiales_rad,
           COALESCE(he.graves, 0) AS graves_ele, COALESCE(he.avisos, 0) AS avisos_ele,
           COALESCE(he.materiales, 0) AS materiales_ele,
           COALESCE(d.sin_acoplar, 0) AS lecturas_sin_acoplar,
           COALESCE(d.bajo_sol, false) AS parada_bajo_sol,
           c.clase, c.kt_medio, c.indice_variabilidad
      FROM ventana_solar v
      LEFT JOIN rad ON rad.f = v.fecha
      LEFT JOIN ele ON ele.f = v.fecha
      LEFT JOIN hall hr ON hr.f = v.fecha AND hr.fuente = 'radiacion_sc_15s'
      LEFT JOIN hall he ON he.f = v.fecha AND he.fuente = 'monitoreo_sc_electrico'
      LEFT JOIN disp d ON d.f = v.fecha
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

    Cada dia trae ADEMAS del veredicto de calidad dos columnas de disponibilidad
    del equipo (`lecturas_sin_acoplar` y `parada_bajo_sol`), que no lo alteran:
    son ejes distintos y el dia con la planta parada puede tener dato impecable.
    """
    filas = db.query(_SQL_DIAS, (
        desde, hasta, desde, hasta,
        list(TIPOS_QUE_INVALIDAN), FRACCION_MATERIAL,
        list(TIPOS_DE_DISPONIBILIDAD), list(TIPOS_DE_DISPONIBILIDAD),
        desde, hasta,
    ))
    for f in filas:
        f["planta_parada"] = bool(f["lecturas_sin_acoplar"])
        f["veredicto_radiacion"] = _veredicto(
            f["filas_radiacion"], f["materiales_rad"], f["graves_rad"], f["avisos_rad"])
        f["veredicto_electrico"] = _veredicto(
            f["filas_electrico"], f["materiales_ele"], f["graves_ele"], f["avisos_ele"])
        # El del dia es el PEOR de los dos: si una de las dos fuentes no sirve, el
        # dia no sirve para cruzar irradiancia contra generacion, que es el punto.
        f["veredicto"] = max((f["veredicto_radiacion"], f["veredicto_electrico"]),
                             key=_ORDEN.index)
    return filas


# ── Los tres insumos de `confianza`, en UN SOLO viaje ────────────────────────
# Eran tres consultas seguidas (calendario, filas por dia, hallazgos) y ninguna
# depende de las otras. Contra el pooler de Supabase eso costaba tres idas y
# vueltas de ~225 ms para un bloque que viaja DENTRO de casi toda respuesta
# agregada: medido, 0,595 s cada vez que alguien pedia cualquier endpoint de
# analitica. Ver la cabecera de `historico.db`: aca manda la latencia, no el SQL.
#
# Van como subconsultas escalares con `json_agg` y no como tres `UNION ALL` con
# columnas nulas de relleno porque asi cada bloque conserva su FORMA (una lista de
# fechas, una de tripletas, una de objetos) y `reducir` sigue recibiendo lo mismo
# que antes, sin ningun desarmado a mano que se pueda equivocar de columna.
#
# Las fechas salen de `json_agg` como texto ISO ('2026-05-03'), que es exactamente
# lo que devolvia `db.query` (su `_limpiar` convierte date -> isoformat). O sea que
# las claves de `filas` y las fechas de `hallazgos` siguen cruzando igual: si algun
# dia esto devolviera `date`, los diccionarios dejarian de casar EN SILENCIO y
# todos los dias saldrian utilizables.
#
# Los hallazgos se acotan a las variables de las que depende la respuesta, MENOS
# los de disponibilidad, que vienen siempre. Que la planta estuviera parada no es
# un hecho de `voltaje_vac`: es un hecho de la planta, y le importa a cualquier
# pregunta sobre energia aunque las columnas AC no aparezcan en ella. Acotarlos
# por variable los haria invisibles justo en las preguntas donde hacen falta.
_SQL_CONFIANZA = """
    SELECT
      (SELECT coalesce(json_agg(fecha ORDER BY fecha), '[]'::json)
         FROM ventana_solar
        WHERE fecha >= %s AND fecha < %s)                         AS calendario,
      (SELECT coalesce(json_agg(json_build_array(f, fuente, n)), '[]'::json)
         FROM (SELECT "timestamp"::date AS f, 'radiacion_sc_15s' AS fuente,
                      count(*) AS n
                 FROM radiacion_sc_15s
                WHERE "timestamp" >= %s AND "timestamp" < %s GROUP BY 1
               UNION ALL
               SELECT "timestamp"::date, 'monitoreo_sc_electrico', count(*)
                 FROM monitoreo_sc_electrico
                WHERE "timestamp" >= %s AND "timestamp" < %s GROUP BY 1) t) AS filas,
      (SELECT coalesce(json_agg(json_build_object(
                 'fecha', fecha, 'fuente', fuente, 'variable', variable,
                 'tipo', tipo, 'severidad', severidad,
                 'n_afectadas', n_afectadas)), '[]'::json)
         FROM hallazgos_calidad
        WHERE fecha >= %s AND fecha < %s
          AND (variable = ANY(%s) OR variable = '*' OR tipo = ANY(%s)))  AS hallazgos
"""

# El bloque `confianza` se repite en casi toda respuesta agregada, y una sola vista
# de la consola lo pide varias veces con los MISMOS argumentos (`Promise.all` de
# cinco endpoints sobre el mismo rango). El cache no esta tanto por el TTL como por
# la COALESCENCIA: esas cinco peticiones simultaneas terminan haciendo UNA consulta.
# La clave, el TTL y que pasa si el barrido corre con entradas vivas estan
# explicados en `historico.cache`; el resumen es que la ventana en la que se podria
# servir un veredicto viejo nunca supera el TTL, y que si el barrido corre en ESTE
# proceso (el CLI) la invalidacion es inmediata.
_CACHE = cache.registrar(cache.CacheBreve())


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

    La salida trae ademas el bloque `disponibilidad`, que NO entra en el veredicto
    y responde otra pregunta: cuantos dias del periodo tuvo la planta parada. Ver
    la nota de TIPOS_DE_DISPONIBILIDAD.

    Lo que devuelve es SIEMPRE un dict propio del llamador (el cache entrega
    copias): varios le agregan claves encima (`vigilancia`, `sin_vigilancia`, una
    `advertencia` propia), y compartir el objeto guardado haria que la respuesta
    dependiera de quien pregunto antes.
    """
    variables = list(variables or [])
    # El orden de `variables` es parte de la clave y no se normaliza: `reducir` lo
    # usa para el desglose `por_variable`, asi que dos ordenes distintos son dos
    # preguntas distintas aunque casi siempre den lo mismo.
    clave = (desde, hasta, tuple(variables), fuente)
    return _CACHE.obtener(clave, lambda: _consultar(desde, hasta, variables, fuente))


def _consultar(desde: str, hasta: str, variables: list[str],
               fuente: str | None) -> dict:
    """El calculo de verdad, sin cache: UN viaje a la base y la reduccion pura."""
    fila = db.uno(_SQL_CONFIANZA, (
        desde, hasta,                                             # calendario
        desde, hasta, desde, hasta,                               # filas por dia
        desde, hasta, variables, list(TIPOS_DE_DISPONIBILIDAD),   # hallazgos
    ))
    calendario = fila.get("calendario") or []
    if not calendario:
        return reducir([], {}, [], variables, fuente)
    return reducir(
        calendario,
        {(f, fnt): n for f, fnt, n in (fila.get("filas") or [])},
        fila.get("hallazgos") or [],
        variables, fuente,
    )


def _parada_por_dia(hallazgos: list, fuente: str | None) -> dict:
    """Por dia: cuantas lecturas con el inversor sin acoplar y si fue bajo sol.

    `max` y no `sum` entre las tres variables AC: las tres dejan un hallazgo cada
    una sobre el MISMO apagon, y sumarlas contaria el mismo hecho tres veces (es
    el defecto que ya tiene el conteo de `valor_nulo` / `parametro_faltante` /
    `columna_ausente`, donde una sola columna ausente pesa el triple).
    """
    parada: dict = {}
    for h in hallazgos:
        if h["tipo"] not in TIPOS_DE_DISPONIBILIDAD:
            continue
        if fuente and h["fuente"] != fuente:
            continue
        lecturas, bajo_sol = parada.get(h["fecha"], (0, False))
        parada[h["fecha"]] = (max(lecturas, h["n_afectadas"] or 0),
                              bajo_sol or h["severidad"] == "grave")
    return parada


def _bloque_disponibilidad(parada: dict, con_datos: set) -> dict:
    """El eje del EQUIPO, al lado del de la calidad del dato y nunca dentro.

    Su advertencia es propia y no toca la de calidad: decir "la planta estuvo
    parada 12 de 31 dias" y decir "de 12 dias no te podes fiar del dato" son
    afirmaciones opuestas, y meterlas en el mismo campo fue justo el error que
    este canal deshace.
    """
    bajo_sol = sum(1 for _, sol in parada.values() if sol)
    bloque = {
        "dias_con_planta_parada": len(parada),
        "dias_parada_bajo_sol": bajo_sol,
        "de_dias_con_datos": len(con_datos),
        "fraccion": round(len(parada) / len(con_datos), 3) if con_datos else None,
        "advertencia": None,
        "nota": ("dias con el inversor sin acoplar entre las 07:00 y las 17:00. "
                 "NO baja `dias_utilizables`: el DATO de esos dias es correcto, lo "
                 "que fallo es el EQUIPO. La energia de un periodo con la planta "
                 "parada es exacta, y es baja por la parada"),
    }
    if parada:
        bloque["advertencia"] = (
            f"la planta estuvo parada en horario operativo {len(parada)} de "
            f"{len(con_datos)} dias con datos ({bajo_sol} de ellos con sol pleno): "
            f"la generacion del periodo es real pero NO representa la capacidad del "
            f"sistema. Es una averia que revisar, no un problema de calidad de dato")
    return bloque


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
        # La disponibilidad del equipo NO invalida el dato, ni como tipo que
        # invalida ni por fraccion: ya se conto arriba, en su propio canal. Sin
        # este `continue`, un apagon de dia entero (n_afectadas = todas las
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
    disponibilidad = _bloque_disponibilidad(parada, con_datos)
    # El global es el PEOR caso: sirve como titular conservador. El desglose de
    # abajo es el que dice la verdad cuando las partes no van juntas.
    union = set().union(*malos.values()) if malos else set()
    salida = _bloque(con_datos - union)
    salida["medido_sobre"] = variables or "sin acotar"
    salida["disponibilidad"] = disponibilidad

    # La advertencia de la planta parada vive DENTRO de su bloque y no pisa
    # `salida["advertencia"]`, que habla de la calidad del dato. Son dos
    # advertencias sobre dos cosas distintas: fundirlas en un campo devolveria la
    # confusion que este canal existe para deshacer.
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
