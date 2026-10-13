"""Catalogo UNIFICADO de variables de las cuatro fuentes (contrato §2).

Identificador estable `"<SourceId>:<clave>"`:
- `supabase_pv:<clave>` del catalogo analitico (solo las disponibles);
- `supabase_ambiental:<variable>` del store `lecturas_ambientales_sc`;
- `agrodash_sc:<sensor_tipo>` y `agrodash_cartago:<sensor_tipo>`, el `type` tal cual.

Fachada del paquete: `modelo` (tipos), `pv`, `ambiental` y `agrodash` (una fuente
cada uno), `etiquetas` (nombres legibles de AgroDash) y `armado` (cache y resolucion).
"""
from __future__ import annotations

from historico.catalogo_datos.armado import catalogo, filtrar, grupos, resolver, variables  # noqa: F401
from historico.catalogo_datos.modelo import (  # noqa: F401
    FUENTES, FUENTES_API, FUENTES_SQL, PREFIJO, VERSION, VariableDatos, VariableNoCatalogada,
)
