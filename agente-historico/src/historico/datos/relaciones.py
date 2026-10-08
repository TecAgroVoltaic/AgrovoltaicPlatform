"""La allowlist de relaciones inspeccionables y sus columnas reales."""
from __future__ import annotations

from historico import db

# clave_amigable -> (relacion_sql, columna_de_tiempo | None). Unica fuente de
# verdad de "que se puede inspeccionar". Agregar una vista = una linea aca.
RELACIONES: dict[str, tuple[str, str | None]] = {
    "electrico_crudo":       ("monitoreo_sc_electrico",   "timestamp"),
    "electrico_corregido":   ("v_sc_electrico_corregido", "timestamp"),
    "radiacion_15s_cruda":   ("radiacion_sc_15s",         "timestamp"),
    "radiacion_corregida":   ("v_sc_radiacion_corregida", "timestamp"),
    "radiacion_calibrada":   ("v_sc_radiacion_calibrada", "timestamp"),
    "radiacion_clearsky":    ("radiacion_sc_clearsky",    "timestamp"),
    "radiacion_poa":         ("radiacion_sc_poa",         "timestamp"),
    "performance":           ("v_sc_performance",         "timestamp"),
    "diccionario":           ("diccionario_variables",    None),
}


def _rel(tabla: str) -> tuple[str, str | None]:
    """Resuelve la clave amigable a (relacion, columna_tiempo). ValueError si no esta."""
    par = RELACIONES.get(tabla)
    if par is None:
        raise ValueError(
            f"relacion desconocida: {tabla!r} (validas: {', '.join(RELACIONES)})"
        )
    return par


def _columnas(rel: str) -> list[dict]:
    """Columnas reales de la relacion (nombre + tipo), en orden. Desde el catalogo."""
    return db.query(
        """
        SELECT column_name AS nombre, data_type AS tipo
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
        """,
        (rel,),
    )
