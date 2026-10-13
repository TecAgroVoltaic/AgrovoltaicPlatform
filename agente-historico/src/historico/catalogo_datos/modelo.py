"""Tipos del catalogo unificado: una variable de cualquiera de las cuatro fuentes.

La parte PUBLICA (id, etiqueta, unidad, cobertura, cadencia, nota) es la que viaja en
`GET /datos/catalogo` (contrato §2). La parte de RESOLUCION (relacion, columna,
filtro, sensor_tipo, reloj) es interior: dice de donde leer y nunca sale del
servicio, para no atar la API al esquema de la base.
"""
from __future__ import annotations

from dataclasses import dataclass

from historico.fuentes.catalogo import AGRODASH_CARTAGO, AGRODASH_SC, SUPABASE_AMBIENTAL, SUPABASE_PV

FUENTES = (SUPABASE_PV, SUPABASE_AMBIENTAL, AGRODASH_SC, AGRODASH_CARTAGO)
FUENTES_SQL = (SUPABASE_PV, SUPABASE_AMBIENTAL)
FUENTES_API = (AGRODASH_SC, AGRODASH_CARTAGO)
# Prefijo corto del nombre de columna por defecto en formato ancho (contrato §3).
PREFIJO = {SUPABASE_PV: "sc_", SUPABASE_AMBIENTAL: "amb_", AGRODASH_SC: "adsc_", AGRODASH_CARTAGO: "cart_"}
VERSION = 1


class VariableNoCatalogada(KeyError, ValueError):
    """Id que no esta en el catalogo unificado (o cuya fuente no responde)."""

    codigo = "variable_desconocida"

    def __str__(self) -> str:
        return self.args[0] if self.args else ""


@dataclass(frozen=True)
class VariableDatos:
    """Una variable exportable, con lo que se publica y lo que hace falta para leerla."""

    fuente: str
    clave: str
    grupo: str
    grupo_etiqueta: str
    etiqueta: str
    unidad: str | None
    desde: str | None            # primer dia con dato (YYYY-MM-DD) o None
    hasta: str | None            # ultimo dia con dato (inclusivo) o None
    cadencia_s: int | None
    nota: str | None = None
    # ── resolucion (interior) ──────────────────────────────────────────────
    relacion: str | None = None  # SQL: relacion de la allowlist
    columna: str | None = None   # SQL: columna de la allowlist
    filtro: str = ""             # SQL: filtro literal extra (" AND ...")
    variable_store: str | None = None   # store ambiental: valor de `variable` (parametro)
    sensor_tipo: str | None = None      # AgroDash: `type` del sensor, tal cual
    cajas: tuple[str, ...] = ()         # AgroDash: cajas del sitio con ese tipo
    reloj: str = "local"         # 'local' (etiqueta +00 espuria) | 'utc' (instante real)
    tcol: str = '"timestamp"'    # SQL: columna temporal (literal de la allowlist)

    @property
    def id(self) -> str:
        return f"{self.fuente}:{self.clave}"

    @property
    def via_api(self) -> bool:
        return self.fuente in FUENTES_API

    def publica(self) -> dict:
        return {"id": self.id, "etiqueta": self.etiqueta, "unidad": self.unidad,
                "desde": self.desde, "hasta": self.hasta, "cadencia_s": self.cadencia_s,
                "nota": self.nota}


def nota_corta(texto: str | None, maximo: int = 120) -> str | None:
    """Primera clausula de un texto largo (huecos del catalogo analitico)."""
    if not texto:
        return None
    corte = min((i for i in (texto.find(":"), texto.find(". ")) if i > 0), default=len(texto))
    corto = texto[:corte].strip()
    return corto if len(corto) <= maximo else corto[: maximo - 1].rstrip() + "…"
