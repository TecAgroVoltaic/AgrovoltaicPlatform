"""Lo fijo de cada fuente: identidad, region, via de acceso y que vistas alimenta.

Texto curado a mano y no deducido: que pantalla de la consola lee de cada fuente es
una decision de producto, no algo que se pueda preguntar a la base.
"""
from __future__ import annotations

from historico.agrodash_api import CARTAGO, SAN_CARLOS

SUPABASE_PV = "supabase_pv"
SUPABASE_AMBIENTAL = "supabase_ambiental"
AGRODASH_SC = "agrodash_sc"
AGRODASH_CARTAGO = "agrodash_cartago"

_ACCESO_SUPABASE = "base propia (Supabase)"
_ACCESO_AGRODASH = "API pública de AgroDash"

METADATOS: dict[str, dict] = {
    SUPABASE_PV: {
        "id": SUPABASE_PV, "nombre": "Supabase PV San Carlos", "region": SAN_CARLOS,
        "acceso": _ACCESO_SUPABASE,
        "descripcion": "Inversor, piranómetros y DS18B20 del sistema fotovoltaico, "
                       "cargados por el ETL de CSV",
        "alimenta": ["Tablero", "Series", "Estadística", "Calidad", "Comparativa",
                     "Alertas", "Asistente", "Descargas"],
    },
    SUPABASE_AMBIENTAL: {
        "id": SUPABASE_AMBIENTAL, "nombre": "Store ambiental San Carlos (copia de AgroDash)",
        "region": SAN_CARLOS, "acceso": _ACCESO_SUPABASE,
        "descripcion": "Lecturas de las cajas de San Carlos copiadas desde AgroDash, "
                       "en formato largo y con reloj UTC real",
        "alimenta": ["Descargas", "Agente Predictivo"],
    },
    AGRODASH_SC: {
        "id": AGRODASH_SC, "nombre": "AgroDash · cajas San Carlos", "region": SAN_CARLOS,
        "acceso": _ACCESO_AGRODASH,
        "descripcion": "Sensores de suelo y ambiente de las cajas con sufijo SC, leídos en vivo",
        "alimenta": ["Tablero (climatología)", "Descargas"],
    },
    AGRODASH_CARTAGO: {
        "id": AGRODASH_CARTAGO, "nombre": "AgroDash · Cartago", "region": CARTAGO,
        "acceso": _ACCESO_AGRODASH,
        "descripcion": "Sensores de suelo y ambiente del resto de las cajas de AgroDash, "
                       "leídos en vivo",
        "alimenta": ["Descargas"],
    },
}
