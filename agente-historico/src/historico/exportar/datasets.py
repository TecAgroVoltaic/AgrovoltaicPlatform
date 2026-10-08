"""Catalogo estatico de fuentes y datasets exportables (la allowlist)."""
from __future__ import annotations

from historico import datos
from historico.exportar.modelo import Columna, Dataset

FUENTES: dict[str, dict] = {
    "supabase": {
        "titulo": "Supabase PV · San Carlos",
        "descripcion": "Histórico fotovoltaico estandarizado (inversor, piranómetros, calibración, "
                       "Performance Ratio) y el store ambiental copiado desde AgroDash.",
    },
    "agrodash": {
        "titulo": "AgroDash · Cartago + San Carlos",
        "descripcion": "Plataforma de sensores de suelo y ambiente de la región (cajas → sensores → "
                       "lecturas), leída en vivo por su API. Filtrable por caja y tipo de sensor.",
    },
}

_TITULO_SUPABASE: dict[str, str] = {
    "electrico_crudo":     "Eléctrico crudo",
    "electrico_corregido": "Eléctrico corregido",
    "radiacion_15s_cruda": "Radiación 15 s cruda",
    "radiacion_corregida": "Radiación corregida",
    "radiacion_calibrada": "Radiación calibrada",
    "radiacion_clearsky":  "Cielo despejado (clear-sky)",
    "radiacion_poa":       "Radiación en plano (POA)",
    "performance":         "Performance Ratio",
    "diccionario":         "Diccionario de variables",
    "ambiental_crudo":     "Ambiental (store SC)",
}
_DESCRIPCION_SUPABASE: dict[str, str] = {
    "electrico_crudo":     "Inversor (PV1/PV2, AC, temperaturas) a 5 min, tal cual llegó del CSV",
    "electrico_corregido": "Inversor con columnas corregidas (temp 85 → nulo, rangos válidos)",
    "radiacion_15s_cruda": "Piranómetros a 15 s, valores crudos del sensor",
    "radiacion_corregida": "Piranómetros con offset nocturno corregido",
    "radiacion_calibrada": "Piranómetros calibrados a W/m² (clear-sky) + kt*",
    "radiacion_clearsky":  "Irradiancia de cielo despejado modelada (pvlib) para el sitio",
    "radiacion_poa":       "Irradiancia en el plano de cada arreglo (POA, con bifacialidad)",
    "performance":         "Performance Ratio por arreglo y energía integrada",
    "diccionario":         "Diccionario de variables (sin columna temporal: se exporta completo)",
    "ambiental_crudo":     "Lecturas de San Carlos copiadas desde AgroDash (irradiancia, humedad), formato largo",
}
# Relaciones de Supabase cuyo reloj es UTC real (el resto: reloj local etiquetado +00).
_RELOJ_UTC_SUPABASE: frozenset[str] = frozenset({"ambiental_crudo"})

_RELACIONES_SUPABASE: dict[str, tuple[str, str | None]] = {
    **datos.RELACIONES,
    "ambiental_crudo": ("lecturas_ambientales_sc", "ts"),
}

_TS = "timestamp without time zone"


def _datasets_supabase() -> dict[tuple[str, str], Dataset]:
    return {
        ("supabase", clave): Dataset(
            clave=clave, fuente="supabase",
            titulo=_TITULO_SUPABASE.get(clave, clave), descripcion=_DESCRIPCION_SUPABASE.get(clave, ""),
            origen=rel, tcol=tcol, talias=tcol,
            reloj="utc" if clave in _RELOJ_UTC_SUPABASE else "local", tcol_tz=True,
            relacion=rel,
        )
        for clave, (rel, tcol) in _RELACIONES_SUPABASE.items()
    }


_COLS_SENSOR = (
    Columna("caja", "caja", "text"),
    Columna("sensor_numero", "sensor_numero", "integer"),
    Columna("sensor_tipo", "sensor_tipo", "text"),
    Columna("sensor_id", "sensor_id", "text"),
)

DATASETS: dict[tuple[str, str], Dataset] = _datasets_supabase()
DATASETS[("agrodash", "lecturas")] = Dataset(
    clave="lecturas", fuente="agrodash", via="api", paso=True,
    titulo="Lecturas de sensores",
    descripcion="Cada lectura con su caja y tipo de sensor (formato largo). Con resolución 'crudo' cada fila "
                "es una lectura; con un paso mayor, el promedio del intervalo (más n, mínimo, máximo, desvío).",
    origen="api:/readings", tcol="ts", talias="ts", reloj="local", tcol_tz=False,
    columnas=(Columna("ts", "ts", _TS), *_COLS_SENSOR,
              Columna("valor", "valor", "double precision"), Columna("n", "n", "integer"),
              Columna("minimo", "minimo", "double precision"), Columna("maximo", "maximo", "double precision"),
              Columna("desvio", "desvio", "double precision")),
    filtros={"caja": "caja", "sensor_tipo": "sensor_tipo"},
)
DATASETS[("agrodash", "sensores")] = Dataset(
    clave="sensores", fuente="agrodash", via="api",
    titulo="Catálogo de cajas y sensores",
    descripcion="Qué sensores hay en cada caja, con su id (sin columna temporal: se exporta completo).",
    origen="api:/boxes", tcol=None, columnas=_COLS_SENSOR,
    filtros={"caja": "caja", "sensor_tipo": "sensor_tipo"},
)
