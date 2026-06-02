"""Schema canonico + taxonomia de columnas.

Los NOMBRES de columna no viven aca: se generan en normalize.py (slugify + leyenda
minima de conceptos). Este modulo solo:
  - re-exporta el schema canonico derivado (CANONICAL_COLUMNS)
  - infiere etiquetas semanticas de cada columna (infer_tags) para que los modulos
    pidan columnas por tag (cols_with_tag) en vez de listas quemadas
  - decide el metodo de resampleo por columna (agg_method)
"""

from __future__ import annotations

import logging

from .normalize import CANONICAL_COLUMNS, canonical_for, is_dropped

logger = logging.getLogger(__name__)

__all__ = [
    "CANONICAL_COLUMNS", "GENERATED_COLUMNS",
    "canonical_name", "cols_with_tag", "agg_method", "infer_tags",
]


# --- Taxonomia de columnas (DERIVADA del nombre, no quemada) -----------------
# Etiquetas resultantes:
#   inversor / piranometro / ds18b20 / sp722 : fuente fisica
#   pv1 / pv2 / ac / energia                  : subsistema
#   instantanea : medida puntual -> resamplea mean
#   acumulador  : contador monotono (energia) -> resamplea last
#   categorica  : estado no numerico -> resamplea first
#   temperatura : limpieza 85->NULL + rango (clean_temperatures)
#   potencia    : clip negativo->0 (clean_inverter)
#   irradiancia_flux : offset->0 y negativo->0 (clean_irradiance)
# Una fila SENSOR no tiene ninguna columna 'inversor' -> eso la distingue.
def infer_tags(col: str) -> set[str]:
    """Deriva las etiquetas de una columna canonica a partir de su nombre."""
    name = col.lower()
    if name == "timestamp":
        return {"time"}

    tags: set[str] = set()

    # Fuente fisica
    if "sp722" in name:
        tags.add("sp722")
    elif name in {"temp_vertical", "temp_inclinado"}:
        tags.add("ds18b20")
    elif name.startswith(("irradiancia", "albedo", "detector")):
        tags.add("piranometro")
    else:
        tags.add("inversor")

    # Naturaleza de la medida (define resampleo)
    if name.startswith("energia"):
        tags.update({"energia", "acumulador"})
    elif name == "codigo_error":
        tags.add("categorica")
    else:
        tags.add("instantanea")

    # Subsistema
    if "pv1" in name:
        tags.add("pv1")
    if "pv2" in name:
        tags.add("pv2")
    if name in {"voltaje_vac", "corriente_aac", "potencia_total_wac", "frecuencia_hz"}:
        tags.add("ac")

    # Magnitud (define que limpieza aplica)
    if name.startswith("potencia"):
        tags.add("potencia")
    if "temp" in name:
        tags.add("temperatura")
    if name.startswith("irradiancia"):
        tags.add("irradiancia_flux")

    return tags


# Columnas de metadata generadas por el pipeline (no vienen del CSV crudo).
# tipo_fila/fuente_archivo se agregan en extract; n_muestras/intervalo en transform.
GENERATED_COLUMNS: dict[str, set[str]] = {
    "tipo_fila": {"meta", "categorica"},
    "fuente_archivo": {"meta", "categorica"},
    "n_muestras": {"meta"},
    "intervalo_original_seg": {"meta"},
}

# Tags precomputados (canonicas inferidas + generadas explicitas).
_ALL_TAGS: dict[str, set[str]] = {
    **{col: infer_tags(col) for col in CANONICAL_COLUMNS},
    **GENERATED_COLUMNS,
}


def cols_with_tag(tag: str) -> list[str]:
    """Columnas que llevan una etiqueta, en orden canonico. Reemplaza listas quemadas."""
    order = CANONICAL_COLUMNS + list(GENERATED_COLUMNS)
    return [c for c in order if tag in _ALL_TAGS.get(c, set())]


def agg_method(col: str) -> str:
    """Metodo de resampleo segun etiquetas. Default mean (medida instantanea)."""
    tags = _ALL_TAGS.get(col, set())
    if "acumulador" in tags:
        return "last"
    if "categorica" in tags:
        return "first"
    return "mean"


def canonical_name(raw: str) -> str | None:
    """Nombre canonico de una columna cruda, o None. Registra desconocidos."""
    canon = canonical_for(raw)
    if canon is None and not is_dropped(raw):
        logger.warning("Columna desconocida ignorada: %r", raw)
    return canon
