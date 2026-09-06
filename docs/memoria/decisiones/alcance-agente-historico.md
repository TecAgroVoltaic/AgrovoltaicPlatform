---
name: alcance-agente-historico
description: El Agente Histórico es el agente de los CSV del sistema PV, no de AgroDash. Los dos corpus son temas distintos y el de los CSV es irremplazable; conectar el vivo queda como opción evaluada, no como plan
categoria: decision
actualizado: 2026-08-26
tags: [agente-historico, alcance, csv, agrodash, corpus]
---

# Alcance del Agente Histórico: los CSV, no AgroDash

**Decidido por Izack el 2026-08-26.** El Agente Histórico se define por **el corpus
de los CSV del sistema fotovoltaico de San Carlos**. Conectarlo a AgroDash es una
posibilidad técnica real y barata (ver abajo), pero **no se hace ahora** y no forma
parte de su identidad.

> Estado: **propuesta pendiente**. No se cambió una línea de código. Lo que sigue es
> el razonamiento que sostiene la decisión, para que no haya que reconstruirlo.

> **⚠️ MATIZADO el 2026-08-28 (no superado).** La tesis de este documento sigue en pie: el
> Histórico es el agente **del corpus PV**, no de AgroDash. Lo que cambió es que ahora ese
> alcance tiene una **lista concreta de entregables**: las métricas del doc de evaluación de
> datos de Leonardo Cardinale ([[catalogo-metricas-evaluacion]],
> [[pruebas-calidad-umbrales]], [[graficos-evaluacion]]). Y cambió la **secuencia**: primero
> se construyen todos los algoritmos, el agente viene después y su rol es acompañar a un
> experto humano ([[algoritmos-antes-que-agente]]). En consecuencia, la condición de la última
> sección ("bajo qué condición se reconsideraría") se amplía: además de cerrar el corpus, hay
> que terminar el catálogo de algoritmos.

## Por qué son dos temas y no uno

| | CSV del PV | AgroDash (SC) |
|---|---|---|
| Qué mide | generación fotovoltaica (V, A, W, temperatura de inversor) + piranómetros propios | suelo y ambiente (humedad ADC, irradiancia cruda) |
| Variable en común | irradiancia, y **es otro sensor**, otra calibración, otra cadencia | idem |
| Ciclo de vida | corpus **cerrado**, crece por lotes cuando alguien entrega un zip | flujo **vivo**, 3 a 5 min de rezago |
| Fallas típicas | **estructurales**: 13 esquemas, filas mezcladas, typos de encabezado, sensores sin calibrar | **operativas**: la caja deja de reportar, el sensor se traba, la ingesta se congela |
| Si se pierde | **no se puede volver a medir** | se vuelve a consultar mañana |

La última fila es la que manda. Los 19 meses de generación (2024-11-10 a 2026-06-01,
36.469 filas eléctricas y 94.868 de radiación) existen **en un solo lugar**, en 285
CSV con 13 esquemas distintos. Si el criterio de limpieza está mal, la pérdida es
permanente: no hay forma de volver a noviembre de 2024 a medir. AgroDash, en cambio,
es un flujo: un error de lectura de hoy se corrige releyendo mañana.

Eso convierte a los dos corpus en **dos productos con trabajos opuestos**:

- El de los CSV es un corpus **finito e irremplazable** cuyo trabajo es **cerrarse bien**.
- AgroDash es un flujo **infinito y reconsultable** cuyo trabajo es **vigilarse siempre**.

Mezclarlos diluye al primero: el flujo vivo genera hallazgos todos los días y desplaza
por volumen al trabajo de cierre, que es el que no se puede posponer sin costo.

## El hecho técnico que conviene no volver a "descubrir"

Verificado el 2026-08-26 desde la conexión de solo lectura del propio Histórico:

```
lecturas_ambientales      1.107.375 filas · último dato 2026-08-26 21:01 (hace 3 min)
series_ambientales        11 series, TODAS de San Carlos
                          6 · Caja Irradiancia SC   (5 min de rezago)
                          5 · Caja Hum_Suelo SC     (3 min de rezago)
```

**El dato vivo de AgroDash ya vive en la misma base y el mismo esquema que lee el
Histórico**, puesto ahí por el ETL del Agente Predictivo ([[agrodash-api]]). No hace
falta ingesta, credencial ni red nuevas: conectarlo sería agregar una entrada a
`config.RANGOS` y extender `ventana_solar` más allá del 2026-06-01.

Se anota justamente porque es fácil: que **no** esté conectado es una decisión, no un
olvido. Quien lo vea después no debe leerlo como un cabo suelto.

## Lo que esta decisión deja abierto (y su costo)

Nadie vigila la frescura de la ingesta viva. El proyecto ya lo pagó dos veces
([[agrodash-api]], [[agrodash-local]]): 33 días con el store sin avanzar mientras el
ETL corría en verde con cero filas, y 21 días sin enterarse de que las cajas SC habían
vuelto el 2026-08-05. Al 2026-08-26 el `/salud/panel` del Predictivo desplegado
responde `estado: "desconocido"` y su configuración todavía apunta a la réplica del
tailnet en vez de a la API viva.

Ese hueco **queda abierto a propósito** con esta decisión, y le corresponde al
Predictivo (que ya tiene `salud.py` y `anomalias.py`) o a un tercer componente, no al
Histórico.

## Bajo qué condición se reconsideraría

Cuando el trabajo de cierre del corpus CSV esté terminado: separación fina de filas
mezcladas (Paso 2), calibración de irradiancia por clear-sky y la decisión sobre los
fragmentos `(N)`. Ahí el corpus deja de necesitar criterio nuevo y el motor de calidad
queda libre. Ver [[decisiones]] y [[bloqueantes]].

Relacionado: [[algoritmos-antes-que-agente]], [[agente-historico]],
[[agente-historico-calidad]], [[capa-agentes]], [[catalogo-metricas-evaluacion]],
[[arquitectura-regiones]], [[agrodash]], [[agrodash-api]], [[decisiones]].
