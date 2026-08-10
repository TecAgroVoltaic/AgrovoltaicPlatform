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
    "is_radiacion", "cols_electrico", "cols_radiacion", "DESCRIPTIONS",
    "electrico_table_columns", "radiacion_table_columns",
]

# Fuentes que van a la tabla de RADIACION (15 s, aparte). El resto (inversor +
# DS18B20) va a la tabla ELECTRICA (5 min). Decision Leo 2026-08-10.
RADIACION_TAGS = {"piranometro", "sp722"}


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
# Se agregan en transform (n_muestras/intervalo) y se sella fuente_archivo. La
# particion electrico/radiacion ya distingue la fuente, asi que tipo_fila no se guarda.
GENERATED_COLUMNS: dict[str, set[str]] = {
    "n_muestras": {"meta"},
    "intervalo_original_seg": {"meta"},
    "fuente_archivo": {"meta", "categorica"},
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


# --- Particion electrico / radiacion (define a que tabla va cada columna) ----
def is_radiacion(col: str) -> bool:
    """True si la columna es de radiacion (piranometro o SP722) -> tabla 15 s."""
    return bool(_ALL_TAGS.get(col, set()) & RADIACION_TAGS)


def cols_radiacion() -> list[str]:
    """Columnas de medida de radiacion, en orden canonico (sin timestamp/meta)."""
    return [c for c in CANONICAL_COLUMNS if c != "timestamp" and is_radiacion(c)]


def cols_electrico() -> list[str]:
    """Columnas de medida electricas (inversor + DS18B20), sin timestamp/meta."""
    return [c for c in CANONICAL_COLUMNS if c != "timestamp" and not is_radiacion(c)]


def electrico_table_columns() -> list[str]:
    """Columnas completas de la tabla electrica: timestamp + medidas + meta."""
    return ["timestamp"] + cols_electrico() + list(GENERATED_COLUMNS)


def radiacion_table_columns() -> list[str]:
    """Columnas completas de la tabla de radiacion: timestamp + medidas + meta."""
    return ["timestamp"] + cols_radiacion() + list(GENERATED_COLUMNS)


# --- Descripciones para el diccionario_variables (Leo P1: documentar) --------
# Abreviacion/columna -> descripcion legible. Fuente unica del contenido de la
# tabla diccionario_variables. Solo columnas canonicas de medida.
DESCRIPTIONS: dict[str, str] = {
    "voltaje_pv1_v": "Voltaje del string PV1 (arreglo 1 = inclinado) [V]",
    "corriente_pv1_a": "Corriente del string PV1 (arreglo 1 = inclinado) [A]",
    "potencia_pv1_w": "Potencia del string PV1 (arreglo 1 = inclinado) [W]",
    "energia_pv1_wh": "Energia del dia del arreglo PV1 (inclinado) [Wh]",
    "voltaje_pv2_v": "Voltaje del string PV2 (arreglo 2 = vertical) [V]",
    "corriente_pv2_a": "Corriente del string PV2 (arreglo 2 = vertical) [A]",
    "potencia_pv2_w": "Potencia del string PV2 (arreglo 2 = vertical) [W]",
    "energia_pv2_wh": "Energia del dia del arreglo PV2 (vertical) [Wh]",
    "potencia_total_wac": "Potencia AC total del inversor (VA/Wac unificados) [W]",
    "voltaje_vac": "Voltaje de salida AC del inversor [V]",
    "corriente_aac": "Corriente de salida AC del inversor [A]",
    "frecuencia_hz": "Frecuencia de la red [Hz]",
    "energia_hoy_wh": "Energia AC generada en el dia [Wh]",
    "energia_total_wh": "Energia AC acumulada historica [Wh]",
    "temperatura_inversor_c": "Temperatura interna del inversor [C]",
    "codigo_error": "Codigo de error/estado del inversor",
    "irradiancia_incidente": "Irradiancia incidente, celda calibrada (CRUDA, sin escalar a W/m2)",
    "irradiancia_reflejada": "Irradiancia reflejada, celda calibrada (CRUDA)",
    "albedo": "Albedo = reflejada/incidente (celda calibrada)",
    "temp_vertical": "Temperatura del arreglo vertical (PV2), sensor DS18B20 [C]",
    "temp_inclinado": "Temperatura del arreglo inclinado (PV1), sensor DS18B20 [C]",
    "irradiancia_incidente_sp722": "Irradiancia incidente del piranometro SP722 (operativo desde may-2026)",
    "irradiancia_reflejada_sp722": "Irradiancia reflejada del piranometro SP722",
    "detector_incidente_sp722_mv": "Lectura cruda del detector incidente SP722 [mV]",
    "detector_reflejado_sp722_mv": "Lectura cruda del detector reflejado SP722 [mV]",
    "albedo_sp722": "Albedo del piranometro SP722",
}
