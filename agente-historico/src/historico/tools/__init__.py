"""Registro de tools: junta los esquemas y el dispatch. Solo ensamblado, sin logica.

Cada tool vive en su propio modulo (SRP) y expone `SCHEMA` (lo que ve el LLM) y
`run(**params)` (la ejecucion). Agregar una tool = crear su archivo e importarlo aca.

DOS FAMILIAS, y la division no es cosmetica: es la que `arquitectura.py` deriva
para dibujar el agente, y la que dice de que trata cada pregunta.

  * ANALISIS  — que paso: energia, performance, irradiancia, temperatura, tendencia,
                los KPIs de cabecera, las series con su recta, la distribucion
                mensual, la irradiacion acumulada, el perfil horario, la correlacion
                entre dos variables, las crestas por sensor y el comparativo
                inclinado contra vertical.
  * CALIDAD   — si el dato sirve: veredicto del periodo, hallazgos, cielo,
                diagnostico de un dia suelto, completitud con sus huecos y las
                cuatro familias de pruebas del documento de evaluacion.

La relacion entre las dos es lo que hace al Historico mas que un puñado de tools
sueltas: las de analisis que agregan sobre un periodo incrustan el bloque
`confianza` (ver `historico.calidad.contexto`), asi que el modelo no puede
reportar un numero sin ver sobre cuantos dias utilizables se calculo.

## Lo que la tool devuelve NO es lo que devuelve la API

Las tools de analitica llaman a la MISMA funcion de `historico.analitica` que los
endpoints, y despues recortan: la nube de 2.000 pares, las densidades de 200
puntos por grupo, las 720 celdas de la carpeta y las series punto a punto son
dibujo, y mandarselas a un modelo es quemar tokens en algo que no puede leer.
`run()` devuelve el RESUMEN (ajuste, R2, pares, estadisticos, hora del pico, meses
con mas outliers); los arrays completos viajan por la API, que es quien dibuja.
Es el mismo reparto que ya existia entre `tendencia` y `graficar`.
"""
from __future__ import annotations

from historico.tools import (
    arquitectura_agente,
    calidad_periodo,
    carpeta_dia_hora,
    catalogo,
    cielo_periodo,
    cobertura,
    comparativa_arreglos,
    completitud_datos,
    correlacion_variables,
    crestas_distribucion,
    diagnostico_dia,
    distribucion_mensual,
    energia,
    graficar,
    hallazgos,
    irradiacion_mensual,
    irradiancia,
    performance,
    pruebas_calidad,
    resumen_dashboard,
    serie_variable,
    temperatura,
    tendencia,
)

ANALISIS = [energia, performance, irradiancia, temperatura, tendencia,
            cobertura, catalogo, graficar,
            resumen_dashboard, serie_variable, distribucion_mensual,
            irradiacion_mensual, carpeta_dia_hora, correlacion_variables,
            crestas_distribucion, comparativa_arreglos]
# El agente hablando de si mismo. Va en CALIDAD y no en ANALISIS porque responde
# "se puede confiar en esto", que es la misma pregunta que el resto de la familia.
CALIDAD = [calidad_periodo, hallazgos, cielo_periodo, diagnostico_dia,
           arquitectura_agente, completitud_datos, pruebas_calidad]

_TOOLS = ANALISIS + CALIDAD

# Lo que se le pasa al modelo y el mapa nombre->funcion que ejecuta el lazo.
SCHEMAS = [t.SCHEMA for t in _TOOLS]
DISPATCH = {t.SCHEMA["name"]: t.run for t in _TOOLS}

# Familia por nombre de tool. Lo consume `arquitectura.py`; se deriva de las listas
# de arriba y no se escribe a mano, para que no puedan quedar desincronizadas.
FAMILIA = {**{t.SCHEMA["name"]: "analisis" for t in ANALISIS},
           **{t.SCHEMA["name"]: "calidad" for t in CALIDAD}}
