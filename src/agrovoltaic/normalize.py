"""Normalizacion de nombres de columna: generar el mapeo en vez de quemarlo.

Estrategia en 2 partes:

1. slugify(raw) — ANALIZA y normaliza algorithmicamente cualquier variante de
   escritura: quita acentos (Energìa/Energía -> energia), unidades ([V],[Wh],[°C]),
   mayusculas y espacios/puntuacion. Asi, las ~70 variantes crudas colapsan solas a
   una forma canonica sin enumerarlas. Un CSV nuevo con otra ortografia del MISMO
   concepto se reconoce sin tocar codigo.

2. CONCEPT_MAP — leyenda MINIMA de conceptos (slug -> nombre canonico). Es la unica
   parte irreducible: el dataset no trae diccionario, asi que el significado de una
   abreviatura ("vpv1" = voltaje del string PV1) hay que declararlo UNA vez. Una
   entrada por concepto, no por variante.

build_alias_map() recorre el dataset y GENERA el dict {crudo: canonico} completo,
reportando cualquier header que no clasifique (para detectar variantes nuevas).
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

# --- Leyenda de conceptos (irreducible: 1 entrada por concepto) -------------
# Clave = slug (salida de slugify). Valor = nombre canonico final (con unidad).
# El orden define el orden de columnas del schema (ver schemas.CANONICAL_COLUMNS).
CONCEPT_MAP: dict[str, str] = {
    "timestamp": "timestamp",
    # PV1  (v=voltaje, i=corriente, _watt=potencia)
    "vpv1": "voltaje_pv1_v", "voltaje_pv1": "voltaje_pv1_v",
    "ipv1": "corriente_pv1_a", "corriente_pv1": "corriente_pv1_a",
    "pv1_watt": "potencia_pv1_w", "potencia_pv1": "potencia_pv1_w",
    # PV2
    "vpv2": "voltaje_pv2_v", "voltaje_pv2": "voltaje_pv2_v",
    "ipv2": "corriente_pv2_a", "corriente_pv2": "corriente_pv2_a",
    "pv2_watt": "potencia_pv2_w", "potencia_pv2": "potencia_pv2_w",
    # AC / total  (ver DUDA 8: [VA] se trata como Wac)
    "pac_total": "potencia_total_wac", "potencia_total": "potencia_total_wac",
    "potencia_total_va": "potencia_total_wac",  # forma snake (slugify no quita _va)
    "freq": "frecuencia_hz", "frecuencia": "frecuencia_hz",
    "vac1": "voltaje_vac", "voltaje": "voltaje_vac",      # "Voltaje [Vac]" -> AC
    "iac1": "corriente_aac", "corriente": "corriente_aac",
    # Energia (acumuladores)
    "energia_hoy": "energia_hoy_wh",
    "energia_total": "energia_total_wh",
    "energia_pv1": "energia_pv1_wh",
    "energia_pv2": "energia_pv2_wh",
    # Estado inversor
    "temp_inversor": "temperatura_inversor_c", "temperatura_inversor": "temperatura_inversor_c",
    "codigo_error": "codigo_error",
    # Piranometro original  ("irradiancia" sola -> incidente, convencion del sitio)
    "irradiancia": "irradiancia_incidente", "irradiancia_incidente": "irradiancia_incidente",
    "irradiancia_reflejada": "irradiancia_reflejada",
    "albedo": "albedo",
    # Temperaturas DS18B20  (temp1=sensor vertical, temp2=inclinado: convencion)
    "temp1": "temp_vertical", "temp_vertical": "temp_vertical",
    "temp2": "temp_inclinado", "temp_inclinado": "temp_inclinado",
    # Piranometro SP722
    "irradiancia_incidente_sp722": "irradiancia_incidente_sp722",
    "irradiancia_reflejada_sp722": "irradiancia_reflejada_sp722",
    "detector_incidente_sp722": "detector_incidente_sp722_mv",
    "detector_reflejado_sp722": "detector_reflejado_sp722_mv",
    "albedo_sp722": "albedo_sp722",
}

# Slugs de columnas que existen pero se descartan (duplicadas y vacias).
DROP_SLUGS: set[str] = {
    "corriente_pv2_a_1",   # Schema 8: duplicada vacia de corriente_pv2_a
}

# Schema canonico DERIVADO: nombres canonicos unicos en orden de CONCEPT_MAP.
CANONICAL_COLUMNS: list[str] = list(dict.fromkeys(CONCEPT_MAP.values()))

# Identidad automatica: cada canonico es su propio slug. Cubre CSVs ya en
# snake_case sin declarar cada identidad a mano.
for _canon in CANONICAL_COLUMNS:
    CONCEPT_MAP.setdefault(_canon, _canon)


def slugify(raw: str) -> str:
    """Normaliza un nombre crudo: sin acentos, sin unidades [..], minuscula, snake.

    Ej: 'Energìa PV1 [Wh]' -> 'energia_pv1'; 'Corriente PV2[A]' -> 'corriente_pv2'.
    """
    s = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode()
    s = s.lower().strip()
    s = re.sub(r"\[.*?\]", "", s)        # quitar unidad entre corchetes
    s = re.sub(r"[^a-z0-9]+", "_", s)    # no-alfanumerico -> _
    return s.strip("_")


def canonical_for(raw: str) -> str | None:
    """Nombre canonico de una columna cruda, o None si es desconocida/descartada.

    None no distingue 'descartada' de 'desconocida'; usar is_dropped() para eso.
    """
    slug = slugify(raw)
    if slug in DROP_SLUGS:
        return None
    return CONCEPT_MAP.get(slug)


def is_dropped(raw: str) -> bool:
    """True si la columna se descarta a proposito (no es un desconocido a reportar)."""
    return slugify(raw) in DROP_SLUGS


# --- Generacion/validacion del mapeo a partir del dataset -------------------
def build_alias_map(headers: set[str]) -> dict[str, str]:
    """Genera {crudo: canonico} para un conjunto de headers crudos observados."""
    out: dict[str, str] = {}
    for raw in headers:
        canon = canonical_for(raw)
        if canon is not None:
            out[raw] = canon
    return out


def discover_headers(dataset_dir: Path) -> set[str]:
    """Recorre los CSV y junta todos los nombres de columna crudos distintos."""
    headers: set[str] = set()
    for path in sorted(dataset_dir.glob("*.csv")):
        try:
            with path.open(encoding="utf-8", errors="replace") as f:
                first = f.readline().rstrip("\n\r")
        except OSError:
            continue
        headers.update(col.strip() for col in first.split(",") if col.strip())
    return headers


def audit_dataset(dataset_dir: Path) -> tuple[dict[str, str], list[str]]:
    """Devuelve (mapeo generado, headers desconocidos) para revisar cobertura."""
    headers = discover_headers(dataset_dir)
    mapping = build_alias_map(headers)
    unknown = sorted(
        h for h in headers if h not in mapping and not is_dropped(h)
    )
    return mapping, unknown
