"""Lecturas por dia de lo que vive en la Supabase propia. SOLO LECTURA.

Cuenta en el servidor (`GROUP BY` dia): viaja una fila por dia, no las lecturas, asi
que el egress es minimo aunque la tabla de radiacion tenga millones de filas.

Las tablas PV guardan la hora local etiquetada +00: la fecha se toma SIN convertir
(mismo criterio que `analitica.cobertura_dias`). El store ambiental guarda UTC real:
ahi SI se convierte a la zona del sitio.
"""
from __future__ import annotations

from datetime import date, timedelta

from historico import config, db
from historico.fuentes.supabase import RELACION_AMBIENTAL

_SQL_PV = """
    SELECT "timestamp"::date::text AS fecha, count(*) AS n
      FROM {tabla}
     WHERE "timestamp" >= %s AND "timestamp" < %s
     GROUP BY 1
"""
_SQL_AMBIENTAL = f"""
    SELECT (ts AT TIME ZONE %s)::date::text AS fecha, count(*) AS n
      FROM {RELACION_AMBIENTAL}
     WHERE ts >= (%s::timestamp AT TIME ZONE %s) AND ts < (%s::timestamp AT TIME ZONE %s)
     GROUP BY 1
"""
# Tablas crudas: un dia con lecturas que la correccion anula sigue siendo un dia grabado.
TABLA_ELECTRICO = "monitoreo_sc_electrico"
TABLA_RADIACION = "radiacion_sc_15s"
FILAS_SUPABASE = ("electrico", "radiacion", "ambiental")


def _a_dict(filas: list[dict]) -> dict[str, int]:
    return {str(f["fecha"])[:10]: int(f["n"]) for f in filas}


def conteos(desde: date, hasta: date) -> dict[str, dict[str, int]]:
    """`{"electrico"|"radiacion"|"ambiental": {fecha: lecturas}}` en [desde, hasta]."""
    ini, fin = desde.isoformat(), (hasta + timedelta(days=1)).isoformat()
    electrico, radiacion, ambiental = db.en_paralelo(
        lambda: db.query(_SQL_PV.format(tabla=TABLA_ELECTRICO), (ini, fin)),
        lambda: db.query(_SQL_PV.format(tabla=TABLA_RADIACION), (ini, fin)),
        lambda: db.query(_SQL_AMBIENTAL, (config.TZ, ini, config.TZ, fin, config.TZ)),
    )
    return {"electrico": _a_dict(electrico), "radiacion": _a_dict(radiacion),
            "ambiental": _a_dict(ambiental)}
