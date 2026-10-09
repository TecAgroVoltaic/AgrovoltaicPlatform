"""Cobertura viva de lo que esta en la Supabase propia: tablas PV y store ambiental.

SOLO LECTURA. Los nombres de relacion salen de la allowlist `datos.RELACIONES`,
nunca del cliente.
"""
from __future__ import annotations

from historico import config, datos, db

RELACION_AMBIENTAL = "lecturas_ambientales_sc"
_LARGO_FECHA_ISO = len("aaaa-mm-dd")


def _fecha(texto: str | None) -> str | None:
    """'2026-08-31 23:55:00+00' -> '2026-08-31'.

    Las tablas PV guardan hora LOCAL etiquetada +00 (ver `analitica.ventana`), asi
    que la fecha del texto ya es la fecha local: no se convierte.
    """
    return texto[:_LARGO_FECHA_ISO] if texto else None


def _variables_por_relacion() -> dict[str, list[str]]:
    filas = db.query(
        """
        SELECT table_name AS relacion, column_name AS columna
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ANY(%s)
         ORDER BY table_name, ordinal_position
        """,
        ([rel for rel, _ in datos.RELACIONES.values()],),
    )
    por_relacion: dict[str, list[str]] = {}
    for fila in filas:
        por_relacion.setdefault(fila["relacion"], []).append(fila["columna"])
    return por_relacion


def tablas_pv() -> list[dict]:
    """Cada relacion de la allowlist con sus variables, primer y ultimo dia y filas.

    `desde`/`hasta` son el primer y el ULTIMO dia con dato (ambos inclusivos).
    """
    cobertura, variables = db.en_paralelo(datos.tablas, _variables_por_relacion)
    tablas = []
    for relacion in cobertura["relaciones"]:
        columna_tiempo = relacion["columna_tiempo"]
        tablas.append({
            "clave": relacion["clave"], "relacion": relacion["relacion"],
            "variables": [c for c in variables.get(relacion["relacion"], [])
                          if c != columna_tiempo],
            "desde": _fecha(relacion["desde"]), "hasta": _fecha(relacion["hasta"]),
            "filas": relacion["filas"],
        })
    return tablas


def series_ambientales() -> list[dict]:
    """Una fila por (caja, variable, unidad) del store, con su cobertura en fecha LOCAL.

    Este store si guarda UTC real, por eso aca SI se convierte a la zona del sitio.
    """
    return db.query(
        f"""
        SELECT caja, variable, unidad,
               (min(ts) AT TIME ZONE %s)::date::text AS desde,
               (max(ts) AT TIME ZONE %s)::date::text AS hasta,
               count(*) AS n
          FROM {RELACION_AMBIENTAL}
         GROUP BY caja, variable, unidad
         ORDER BY caja, variable, unidad
        """,
        (config.TZ, config.TZ),
    )
