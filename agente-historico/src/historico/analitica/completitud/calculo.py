"""La consulta del calendario con su cadencia medida y el calculo con confianza."""
from __future__ import annotations

from historico import db
from historico.analitica import resultado
from historico.analitica.completitud.composicion import componer
from historico.analitica.completitud.constantes import COLUMNAS
from historico.analitica.ventana import Ventana
from historico.calidad import contexto

# La cadencia sale del ESPACIADO REAL entre filas consecutivas y NO de
# `intervalo_original_seg`: esa columna guarda la cadencia del CSV de origen y miente
# sobre lo almacenado (35.101 de 36.468 saltos electricos son exactamente 300 s
# mientras la columna va de 2 a 330 s). `lag` va particionado por dia para que el
# salto nocturno, que no es una cadencia, no entre en la moda.
_SQL_DIAS = """
    WITH ele_salto AS (
        SELECT "timestamp"::date AS f,
               EXTRACT(epoch FROM "timestamp" - lag("timestamp")
                       OVER (PARTITION BY "timestamp"::date ORDER BY "timestamp")) AS salto
          FROM v_sc_electrico_corregido
         WHERE "timestamp" >= %s AND "timestamp" < %s),
         rad_salto AS (
        SELECT "timestamp"::date AS f,
               EXTRACT(epoch FROM "timestamp" - lag("timestamp")
                       OVER (PARTITION BY "timestamp"::date ORDER BY "timestamp")) AS salto
          FROM v_sc_radiacion_calibrada
         WHERE "timestamp" >= %s AND "timestamp" < %s),
         ele AS (SELECT f, count(*) n,
                        mode() WITHIN GROUP (ORDER BY salto)
                            FILTER (WHERE salto > 0) AS cadencia
                   FROM ele_salto GROUP BY f),
         rad AS (SELECT f, count(*) n,
                        mode() WITHIN GROUP (ORDER BY salto)
                            FILTER (WHERE salto > 0) AS cadencia
                   FROM rad_salto GROUP BY f)
    SELECT v.fecha, v.horas_sol,
           COALESCE(ele.n, 0) AS filas_electrico, ele.cadencia AS cadencia_electrico,
           COALESCE(rad.n, 0) AS filas_radiacion, rad.cadencia AS cadencia_radiacion
      FROM ventana_solar v
      LEFT JOIN ele ON ele.f = v.fecha
      LEFT JOIN rad ON rad.f = v.fecha
     WHERE v.fecha >= %s AND v.fecha < %s
     ORDER BY v.fecha
"""


def _consultar_dias(ventana: Ventana) -> list[dict]:
    desde, hasta = ventana.sql
    return db.query(_SQL_DIAS, (desde, hasta, desde, hasta, desde, hasta))


def calcular(ventana: Ventana) -> dict:
    """Completitud del periodo por fuente, con su bloque de confianza."""
    desde, hasta = ventana.sql
    # Las dos consultas son independientes: en fila costaban dos viajes al pooler
    # (~450 ms) sin que ninguna necesitara nada de la otra. Ver `db.en_paralelo`.
    confianza, dias = db.en_paralelo(
        lambda: contexto.confianza(desde, hasta, COLUMNAS, None),
        lambda: _consultar_dias(ventana),
    )
    return resultado.sobre(
        ventana, confianza, **componer(dias, ventana.granularidad),
    )
