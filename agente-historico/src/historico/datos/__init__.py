"""Peek de datos read-only para el debugger humano (NO es una tool del LLM).

Responsabilidad unica: exponer, de forma segura y acotada, lo que hay en la DB
para inspeccion humana en el MVP (ver filas, cobertura, series para graficar).
Se separa de `tools/` a proposito: las tools sirven al LLM (encapsulan la fisica
correcta); esto sirve al OJO HUMANO que cruza-verifica lo que el agente calculo.

Seguridad: allowlist de relaciones -> el nombre de tabla/columna nunca se
interpola sin validar contra un conjunto conocido (sin inyeccion). Todo pasa por
`db.query`, que fuerza la transaccion de SOLO LECTURA.

Fachada del paquete: `relaciones` (allowlist), `inspeccion` (tablas, columnas,
muestra) y `agregada` (serie para graficar).
"""
from __future__ import annotations

from historico.datos.agregada import _AGGS, _BUCKETS, serie  # noqa: F401
from historico.datos.inspeccion import _LIMITE_MAX, columnas, muestra, tablas  # noqa: F401
from historico.datos.relaciones import RELACIONES, _columnas, _rel  # noqa: F401
