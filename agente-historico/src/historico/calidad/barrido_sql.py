"""El SQL del barrido por dia y por columna, y los borrados acotados del store.

Las columnas salen de `config.RANGOS` (codigo propio, no entrada del usuario) y las
relaciones de `barrido.FUENTES`; los valores viajan como parametros.
"""
from __future__ import annotations

from historico import config

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
