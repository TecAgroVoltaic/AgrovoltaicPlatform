"""Registro de tools: junta los esquemas y el dispatch. Solo ensamblado, sin logica.

Cada tool vive en su propio modulo (SRP) y expone `SCHEMA` (lo que ve el LLM) y
`run(**params)` (la ejecucion). Agregar una tool = crear su archivo e importarlo aca.
"""
from __future__ import annotations

from analizador.tools import (
    catalogo,
    cobertura,
    energia,
    irradiancia,
    performance,
    temperatura,
)

_TOOLS = [energia, performance, irradiancia, temperatura, cobertura, catalogo]

# Lo que se le pasa al modelo y el mapa nombre->funcion que ejecuta el lazo.
SCHEMAS = [t.SCHEMA for t in _TOOLS]
DISPATCH = {t.SCHEMA["name"]: t.run for t in _TOOLS}
