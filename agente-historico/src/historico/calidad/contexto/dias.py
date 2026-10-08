"""El veredicto de cada dia de calendario, con sus dos columnas de disponibilidad."""
from __future__ import annotations

from historico import db
from historico.calidad.contexto.criterios import (
    FRACCION_MATERIAL,
    TIPOS_DE_DISPONIBILIDAD,
    TIPOS_QUE_INVALIDAN,
)

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
