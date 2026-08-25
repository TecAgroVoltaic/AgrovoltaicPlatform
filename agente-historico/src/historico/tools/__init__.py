"""Registro de tools: junta los esquemas y el dispatch. Solo ensamblado, sin logica.

Cada tool vive en su propio modulo (SRP) y expone `SCHEMA` (lo que ve el LLM) y
`run(**params)` (la ejecucion). Agregar una tool = crear su archivo e importarlo aca.

DOS FAMILIAS, y la division no es cosmetica: es la que `arquitectura.py` deriva
para dibujar el agente, y la que dice de que trata cada pregunta.

  * ANALISIS  — que paso: energia, performance, irradiancia, temperatura, tendencia.
  * CALIDAD   — si el dato sirve: veredicto del periodo, hallazgos, cielo.

La relacion entre las dos es lo que hace al Historico mas que ocho tools sueltas:
las de analisis que agregan sobre un periodo incrustan el bloque `confianza`
(ver `historico.calidad.contexto`), asi que el modelo no puede reportar un numero
sin ver sobre cuantos dias utilizables se calculo.
"""
from __future__ import annotations

from historico.tools import (
    calidad_periodo,
    catalogo,
    cielo_periodo,
    cobertura,
    energia,
    graficar,
    hallazgos,
    irradiancia,
    performance,
    temperatura,
    tendencia,
)

ANALISIS = [energia, performance, irradiancia, temperatura, tendencia,
            cobertura, catalogo, graficar]
CALIDAD = [calidad_periodo, hallazgos, cielo_periodo]

_TOOLS = ANALISIS + CALIDAD

# Lo que se le pasa al modelo y el mapa nombre->funcion que ejecuta el lazo.
SCHEMAS = [t.SCHEMA for t in _TOOLS]
DISPATCH = {t.SCHEMA["name"]: t.run for t in _TOOLS}

# Familia por nombre de tool. Lo consume `arquitectura.py`; se deriva de las listas
# de arriba y no se escribe a mano, para que no puedan quedar desincronizadas.
FAMILIA = {**{t.SCHEMA["name"]: "analisis" for t in ANALISIS},
           **{t.SCHEMA["name"]: "calidad" for t in CALIDAD}}
