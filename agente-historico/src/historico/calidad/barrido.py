"""Puntos 1 y 2: calidad de los datos por dia y por sensor, y los hallazgos.

Contesta tres preguntas por cada dia y cada fuente:
  * ¿estan TODOS los datos del dia?  -> cobertura y densidad
  * ¿son VALIDOS?                    -> nulos, fuera de rango, saturacion, sensor plano
  * ¿hay DUPLICADOS?                 -> timestamps repetidos

Dos metricas de completitud, no una, porque son fallas distintas:
  * `cobertura` = cuanto de las horas de sol alcanzo a grabar el logger.
    Baja = arranco tarde, paro temprano, o se cayo medio dia.
  * `densidad`  = cuantas de las lecturas esperadas hay DENTRO de lo que si grabo.
    Baja = huecos internos aunque el dia se vea "largo".
Un dia puede tener cobertura 1,0 y densidad 0,4: grabo de punta a punta pero
perdiendo la mitad de las muestras. Con una sola metrica eso no se ve.

La cadencia esperada se INFIERE del propio dia (el hueco mas frecuente) y no de una
constante: el historico tiene 33 cadencias distintas (2 s en dic-2024, 1 min en
may-2025, ~5 min desde nov-2025), asi que cualquier numero fijo mentiria.

La deteccion es determinista y sin LLM: los numeros salen de aca, el lenguaje viene
despues (docs/memoria/proyecto/capa-agentes.md).

## El segundo paso: las cinco familias de `calidad.pruebas`

Lo de arriba mira DOS tablas columna por columna con SQL agregado. `calidad.pruebas`
mira el CATALOGO ENTERO de variables lectura por lectura, con los umbrales exactos
del documento (cuatro familias que juzgan el DATO) mas la disponibilidad del
EQUIPO, que juzga si la planta estaba funcionando. Los dos pasos escriben en
`hallazgos_calidad` y ninguno pisa al otro: sus tipos son disjuntos y cada uno
borra los suyos antes de reinsertar.

Este modulo sigue siendo el UNICO que escribe en la base (`db.ejecutar` y
`db.ejecutar_muchos`, el pool con escritura), y sigue corriendo por cron y jamas
desde una pregunta: recorrer 274 dias es caro y el resultado no depende de quien
pregunte.
"""
from __future__ import annotations

from datetime import date, timedelta

from historico import config, db
from historico.analitica import catalogo
from historico.calidad import pruebas
from historico.calidad.pruebas import consultas

FUENTES = ("radiacion_sc_15s", "monitoreo_sc_electrico")

_UPSERT = """
    INSERT INTO hallazgos_calidad
        (fecha, fuente, variable, tipo, severidad, n_afectadas, detalle, detectado_en)
    VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, now())
    ON CONFLICT (fecha, fuente, variable, tipo) DO UPDATE
       SET severidad = EXCLUDED.severidad,
           n_afectadas = EXCLUDED.n_afectadas,
           detalle = EXCLUDED.detalle,
           detectado_en = EXCLUDED.detectado_en
"""

# Los tipos que produce ESTE modulo. La lista existe para acotar el borrado de
# abajo: `cielo.py` escribe `kt_imposible` sobre la misma fuente, y un DELETE por
# fuente se lo llevaba puesto en cada barrido (lo hacia en silencio, ademas: el
# resumen de la corrida seguia dando los mismos numeros).
TIPOS_PROPIOS = (
    "dia_incompleto", "hueco", "duplicado_timestamp", "cambio_de_cadencia",
    "columna_ausente", "nulos", "fuera_de_rango", "saturado_85",
    "constante_en_cero", "sensor_plano", "offset_nocturno",
)

# Los tipos de las cinco familias de `calidad.pruebas`. Van APARTE de
# `TIPOS_PROPIOS` y no fundidos con ellos: la garantia de que ningun tipo se
# repite entre los dos detectores se comprueba comparando las dos listas, y en una
# sola no habria nada que comparar. Dos detectores con el mismo tipo se pisarian
# en el ON CONFLICT sin dar error, que es el modo de fallo que ninguna de las dos
# listas puede permitir.
TIPOS_DE_PRUEBAS = pruebas.TIPOS

# El barrido REEMPLAZA lo suyo en el rango analizado: si un hallazgo dejo de
# existir (porque se corrigio el dato), tiene que desaparecer del store y no
# quedar de fantasma. Por eso se borra antes de reinsertar, pero SOLO lo propio.
_LIMPIAR_RANGO = """
    DELETE FROM hallazgos_calidad
     WHERE fuente = %s AND fecha >= %s AND fecha < %s AND tipo = ANY(%s)
"""

# El de las pruebas NO filtra por fuente, y no es un olvido. `_LIMPIAR_RANGO` va
# por fuente porque el barrido de arriba recorre `FUENTES`, y los hallazgos de las
# pruebas llevan fuentes que no estan en esa lista: `radiacion_sc_clearsky`
# (cs_ghi), `radiacion_sc_poa` (las dos POA), `v_sc_radiacion_calibrada` (kt*, que
# no tiene tabla cruda) y el literal `sin_fuente` de las cuatro variables que el
# documento pide y la base no tiene. Recorriendo `FUENTES` esas filas no se
# alcanzan nunca y quedarian de fantasma en cada re-corrida.
#
# Acotar por tipo alcanza y sobra: `TIPOS_DE_PRUEBAS` es exclusivo de este paso
# (lo verifica `test_calidad_pruebas`), el paso corre sobre el catalogo entero de
# una sola vez, y asi el borrado no puede quedarse corto cuando alguien registre
# una variable sobre una relacion nueva.
_LIMPIAR_PRUEBAS = """
    DELETE FROM hallazgos_calidad
     WHERE fecha >= %s AND fecha < %s AND tipo = ANY(%s)
"""


def _sql_por_dia(fuente: str) -> str:
    """Estadistica base por dia: cuantas, cuando, con que cadencia y con que huecos."""
    return f"""
        WITH g AS (
            SELECT "timestamp"::date AS fecha,
                   "timestamp" AS ts,
                   EXTRACT(epoch FROM ("timestamp" - lag("timestamp")
                       OVER (PARTITION BY "timestamp"::date ORDER BY "timestamp"))) AS hueco
              FROM {fuente}
             WHERE "timestamp" >= %s AND "timestamp" < %s
        ),
        base AS (
            SELECT fecha,
                   count(*)                              AS filas,
                   count(DISTINCT ts)                    AS ts_distintos,
                   min(ts)                               AS primera,
                   max(ts)                               AS ultima,
                   mode() WITHIN GROUP (ORDER BY hueco)  AS cadencia
              FROM g
             GROUP BY fecha
        ),
        huecos AS (
            SELECT g.fecha, count(*) AS n_huecos, max(g.hueco) AS hueco_max
              FROM g JOIN base b USING (fecha)
             WHERE b.cadencia IS NOT NULL AND g.hueco > b.cadencia * %s
             GROUP BY g.fecha
        )
        SELECT b.fecha, b.filas, b.ts_distintos, b.primera, b.ultima, b.cadencia,
               COALESCE(h.n_huecos, 0) AS n_huecos,
               COALESCE(h.hueco_max, 0) AS hueco_max,
               v.horas_sol,
               EXTRACT(epoch FROM (b.ultima - b.primera)) / 3600.0 AS horas_cubiertas
          FROM base b
          LEFT JOIN huecos h USING (fecha)
          LEFT JOIN ventana_solar v ON v.fecha = b.fecha
         ORDER BY b.fecha
    """


def _sql_por_columna(fuente: str) -> str:
    """Nulos, fuera de rango, saturacion y dispersion, columna por columna.

    Las columnas salen de `config.RANGOS`, un diccionario del propio codigo, no de
    entrada de usuario: no hay superficie de inyeccion. Aun asi se valida abajo.
    """
    rangos = config.RANGOS[fuente]
    piezas = []
    for col, (lo, hi) in rangos.items():
        if not col.isidentifier():
            raise ValueError(f"nombre de columna sospechoso: {col!r}")
        piezas.append(f"""
               count(*) FILTER (WHERE {col} IS NULL)                        AS "{col}__nulos",
               count(*) FILTER (WHERE {col} < {lo} OR {col} > {hi})         AS "{col}__rango",
               count({col})                                                 AS "{col}__n",
               stddev_samp({col})                                           AS "{col}__sd",
               min({col})                                                   AS "{col}__min\"""")
        if col in config.COLUMNAS_TEMPERATURA:
            piezas.append(f"""
               count(*) FILTER (WHERE {col} = {config.VALOR_SATURACION_DS18B20}) AS "{col}__sat\"""")
        if col.startswith("irradiancia_"):
            piezas.append(f"""
               count(*) FILTER (WHERE abs({col} - ({config.OFFSET_NOCTURNO})) < 0.001) AS "{col}__offset\"""")
    return f"""
        SELECT "timestamp"::date AS fecha, {','.join(piezas)}
          FROM {fuente}
         WHERE "timestamp" >= %s AND "timestamp" < %s
         GROUP BY 1 ORDER BY 1
    """


def _hallazgos_del_dia(fuente: str, dia: dict, cols: dict, cadencia_previa) -> list[tuple]:
    """Traduce la estadistica de un dia a hallazgos. Aca vive la POLITICA."""
    import json

    out: list[tuple] = []
    fecha = dia["fecha"]

    def add(variable, tipo, severidad, n, detalle):
        out.append((fecha, fuente, variable, tipo, severidad, n, json.dumps(detalle)))

    filas, distintos = dia["filas"], dia["ts_distintos"]

    # ── Duplicados ────────────────────────────────────────────────────────────
    if filas > distintos:
        add("*", "duplicado_timestamp", "grave", filas - distintos,
            {"filas": filas, "timestamps_distintos": distintos})

    # ── Dia demasiado corto para juzgarlo ─────────────────────────────────────
    if filas < config.MIN_MUESTRAS_DIA:
        add("*", "dia_incompleto", "grave", filas,
            {"motivo": "muy pocas muestras", "filas": filas,
             "minimo": config.MIN_MUESTRAS_DIA})
        return out                      # sin cadencia fiable no tiene sentido seguir

    # ── Cobertura: ¿grabo todas las horas de sol? ─────────────────────────────
    horas_sol, horas_cub = dia.get("horas_sol"), dia.get("horas_cubiertas")
    if horas_sol and horas_cub is not None:
        cobertura = horas_cub / horas_sol
        if cobertura < config.COBERTURA_MINIMA:
            add("*", "dia_incompleto", "aviso" if cobertura > 0.5 else "grave", filas,
                {"motivo": "cobertura solar baja", "cobertura": round(cobertura, 3),
                 "horas_cubiertas": round(horas_cub, 2), "horas_sol": round(horas_sol, 2),
                 "primera": dia["primera"], "ultima": dia["ultima"]})

    # ── Densidad: ¿faltan muestras DENTRO de lo que grabo? ────────────────────
    cadencia = dia.get("cadencia")
    if cadencia and horas_cub:
        esperadas = (horas_cub * 3600.0) / cadencia + 1
        densidad = filas / esperadas
        if densidad < config.DENSIDAD_MINIMA:
            add("*", "hueco", "aviso", int(round(esperadas - filas)),
                {"motivo": "faltan muestras dentro de la ventana grabada",
                 "densidad": round(densidad, 3), "presentes": filas,
                 "esperadas": int(round(esperadas)), "cadencia_seg": cadencia,
                 "huecos_grandes": dia["n_huecos"],
                 "hueco_max_seg": int(dia["hueco_max"] or 0)})

    # ── Cambio de cadencia respecto al dia anterior ───────────────────────────
    if cadencia and cadencia_previa and cadencia != cadencia_previa:
        add("*", "cambio_de_cadencia", "info", None,
            {"cadencia_seg": cadencia, "cadencia_previa_seg": cadencia_previa})

    # ── Por columna: validez ──────────────────────────────────────────────────
    for col in config.RANGOS[fuente]:
        n = cols.get(f"{col}__n") or 0
        nulos = cols.get(f"{col}__nulos") or 0
        fuera = cols.get(f"{col}__rango") or 0
        sd = cols.get(f"{col}__sd")
        lo, hi = config.RANGOS[fuente][col]

        # Todos los valores del dia en NULL no es "faltan datos": es que la columna
        # no vino en el CSV de ese dia. Es el problema de los 13 esquemas, y merece
        # su propio nombre porque se arregla en otro lado (en el mapeo del ETL).
        if nulos and nulos >= filas:
            add(col, "columna_ausente", "grave", nulos,
                {"filas": filas,
                 "nota": "la columna no vino en la fuente ese dia (variacion de esquema)"})
        elif nulos:
            add(col, "nulos", "info", nulos, {"nulos": nulos, "filas": filas})

        if fuera:
            add(col, "fuera_de_rango", "grave", fuera,
                {"fuera": fuera, "de": filas, "rango": [lo, hi]})

        sat = cols.get(f"{col}__sat") or 0
        if sat:
            add(col, "saturado_85", "grave", sat,
                {"lecturas_en_85": sat, "de": filas,
                 "nota": "valor tipico de DS18B20 desconectado"})

        # Una serie sin variacion puede ser TRES cosas distintas, y llamarlas a
        # todas "sensor plano" fue el primer falso positivo de este detector:
        #   * clavada en 85      -> el DS18B20 desconectado, ya reportado arriba
        #   * clavada en 0       -> el inversor no genero en todo el dia; es un
        #                           hecho operativo real, no un sensor roto
        #   * clavada en otro valor -> ahora si, sensor trabado
        if n >= config.MIN_MUESTRAS_DIA and sd is not None and sd == 0:
            valor = cols.get(f"{col}__min")
            if sat and valor == config.VALOR_SATURACION_DS18B20:
                pass                       # ya lo dice `saturado_85`, mejor y con nombre
            elif valor == 0:
                add(col, "constante_en_cero", "aviso", n,
                    {"lecturas": n,
                     "nota": "sin variacion en todo el dia; en las variables "
                             "electricas significa que el inversor no genero"})
            else:
                add(col, "sensor_plano", "grave", n,
                    {"lecturas": n, "valor_constante": valor})

        off = cols.get(f"{col}__offset") or 0
        if off:
            add(col, "offset_nocturno", "info", off,
                {"lecturas_en_el_offset": off, "de": filas,
                 "valor": config.OFFSET_NOCTURNO,
                 "nota": "piranometro sin calibrar; la capa de correccion lo lleva a 0"})

    return out


def _ventana_de(clave: str, desde: date, hasta: date) -> tuple[date, date] | None:
    """El tramo de [desde, hasta) en que la variable EXISTE. None si no se cruzan.

    Recortar por `catalogo.cobertura` no es una optimizacion, evita un falso
    positivo del peor tipo. Fuera de su tramo el dato no FALTA: el sensor no
    estaba puesto, y las dos cosas se ven igual en el conteo. Medido: el SP722
    tiene lecturas en 4 de los 274 dias con datos, asi que barrerlo sobre el rango
    entero dejaria `parametro_faltante` GRAVE en los otros 270, por tres variables.
    Y como ese hallazgo toca el 100 % de las lecturas del dia, `calidad.contexto`
    lo cuenta como material: el calendario entero en rojo por un sensor que
    todavia no existia.
    """
    inicio, fin = catalogo.cobertura(clave)
    # `dato_hasta` es el ultimo dia CON dato (inclusive) y `hasta` es exclusivo.
    primero = max(desde, inicio) if inicio else desde
    ultimo = min(hasta, fin + timedelta(days=1)) if fin else hasta
    return (primero, ultimo) if primero < ultimo else None


def _series_del_rango(desde: date,
                      hasta: date) -> tuple[list[pruebas.Serie], list[str]]:
    """Una `Serie` por variable del catalogo, con las consultas agrupadas.

    Las claves se agrupan por (relacion cruda, tramo) y cada grupo es UN viaje al
    pooler: sobre el historico completo son 7 consultas para 22 variables, no 22.
    Devuelve tambien las variables que el rango no alcanza, porque un catalogo que
    se barre a medias sin decirlo se lee como un catalogo limpio.

    Se lee siempre el CRUDO. La familia de validez fisica se declara `no_aplica`
    sobre una vista corregida (la vista ya anulo lo que cae fuera de rango, asi que
    la prueba saldria vacia por construccion y eso se leeria como un aprobado), y
    las otras tres tambien miden mejor sobre el crudo: lo que interesa es que
    entrego el logger, no lo que quedo despues de corregirlo.
    """
    grupos: dict[tuple[str, date, date], list[str]] = {}
    sin_fuente: list[str] = []
    fuera_de_cobertura: list[str] = []

    for variable in catalogo.CATALOGO.values():
        if not variable.disponible:
            sin_fuente.append(variable.clave)
            continue
        ventana = _ventana_de(variable.clave, desde, hasta)
        if ventana is None:
            fuera_de_cobertura.append(variable.clave)
            continue
        crudo = variable.origen_crudo
        relacion = crudo[0] if crudo else variable.relacion
        grupos.setdefault((relacion, *ventana), []).append(variable.clave)

    # Las que no tienen fuente no cuestan consulta: `serie()` devuelve la serie
    # vacia sin tocar la base, y el corredor la marca `sin_fuente` con su motivo.
    series = [consultas.serie(clave, desde, hasta, crudo=True) for clave in sin_fuente]
    for (relacion, primero, ultimo), claves in grupos.items():
        series += consultas.series_de(relacion, claves, primero, ultimo, crudo=True)
    return series, fuera_de_cobertura


def _barrer_pruebas(desde: date, hasta: date) -> dict:
    """Corre las cinco familias sobre el catalogo entero y persiste sus hallazgos.

    El contexto es un `ContextoDisponibilidad` y no un `Contexto` pelado porque la
    quinta familia gradua la severidad del inversor caido con la radiacion
    concurrente. Sin ese mapa la prueba NO se calla (eso seria peor), pero saca
    todos sus hallazgos con motivo `sin_irradiancia` y se pierde la separacion
    entre los 69 dias con sol pleno, donde el equipo estuvo averiado sin excusa, y
    los dias nublados, donde "se desconecto por poca luz" es una explicacion
    admisible. Es un fallo que no se ve mirando la salida: los hallazgos aparecen
    igual, con la severidad equivocada. Las otras cuatro familias no se enteran de
    que el contexto trae un campo mas.
    """
    series, fuera_de_cobertura = _series_del_rango(desde, hasta)
    contexto = pruebas.ContextoDisponibilidad(
        ventanas_solares=consultas.ventanas_solares(desde, hasta),
        irradiancia_por_bin=consultas.radiacion_por_bin(desde, hasta))
    corrida = pruebas.correr(series, contexto)

    db.ejecutar(_LIMPIAR_PRUEBAS, (desde, hasta, list(TIPOS_DE_PRUEBAS)))
    db.ejecutar_muchos(_UPSERT, corrida.filas())

    return {**corrida.resumen, "variables_barridas": len(series),
            "fuera_de_cobertura": sorted(fuera_de_cobertura)}


def barrer(desde: date, hasta: date, fuentes=FUENTES) -> dict:
    """Barre [desde, hasta) y deja los hallazgos en el store. Idempotente.

    Devuelve el resumen de la corrida (cuantos dias y cuantos hallazgos por fuente,
    mas el de las cinco familias de `calidad.pruebas` bajo la clave `pruebas`).
    """
    resumen = {}
    for fuente in fuentes:
        if fuente not in config.RANGOS:
            raise ValueError(f"fuente desconocida: {fuente!r}")

        dias = db.query(_sql_por_dia(fuente), (desde, hasta, config.FACTOR_HUECO))
        cols = {c["fecha"]: c for c in db.query(_sql_por_columna(fuente), (desde, hasta))}

        hallazgos: list[tuple] = []
        cadencia_previa = None
        for dia in dias:
            hallazgos += _hallazgos_del_dia(
                fuente, dia, cols.get(dia["fecha"], {}), cadencia_previa)
            cadencia_previa = dia.get("cadencia") or cadencia_previa

        db.ejecutar(_LIMPIAR_RANGO, (fuente, desde, hasta, list(TIPOS_PROPIOS)))
        db.ejecutar_muchos(_UPSERT, hallazgos)

        graves = sum(1 for h in hallazgos if h[4] == "grave")
        resumen[fuente] = {
            "dias_analizados": len(dias),
            "hallazgos": len(hallazgos),
            "graves": graves,
            "dias_sin_hallazgos": len(dias) - len({h[0] for h in hallazgos}),
        }
    # Va despues del recorrido por fuente y no antes: si `fuentes` trae una que no
    # existe, la corrida tiene que morir sin haber escrito nada.
    resumen["pruebas"] = _barrer_pruebas(desde, hasta)
    return resumen
