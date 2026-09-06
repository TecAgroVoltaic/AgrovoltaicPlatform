---
name: algoritmos-antes-que-agente
description: Decisión de Izack (2026-08-28) tras el doc de evaluación de datos de Leonardo Cardinale: primero se construyen los algoritmos que calculan todas las métricas del PDF, y el agente viene después, como acompañante de un experto humano sobre ese catálogo de tools. EJECUTADA el mismo día: la capa está construida (ver capa-analitica)
categoria: decision
actualizado: 2026-08-28
tags: [agente-historico, algoritmos, tools, alcance, evaluacion-datos]
---

# Algoritmos primero, agente después

**Decidido por Izack el 2026-08-28**, a partir del documento *Definición de evaluación
de datos de proyecto Agrivoltaic* de Leonardo Cardinale Villalobos (el equipo lo llama
"el doc de Hugo"), fechado 2026-08-28. Fuente: `Evaluación de datos.pdf` en la raíz del
repo. Catálogo destilado en [[catalogo-metricas-evaluacion]], [[pruebas-calidad-umbrales]]
y [[graficos-evaluacion]].

## Las dos cosas que cambian

**1. El PDF redefine qué hace el Agente Histórico.** Todo lo que el documento enumera
(los 9 KPIs del dashboard, las series de tiempo, el análisis estadístico, las 4 familias
de pruebas de calidad y los 7 ejes de análisis energético) **son las métricas que evaluará
el Agente Histórico**. Deja de ser un catálogo suelto de "análisis que estaría bueno hacer"
y pasa a ser la especificación funcional del agente.

**2. Se pospone el agente y primero se construyen los algoritmos.** Se van a implementar
algoritmos que calculen todas esas métricas sobre los datos que ya están en Supabase,
antes de montar cualquier lazo de LLM encima.

> Razón, en palabras de Izack: *"acá un agente no brindará valor; el valor está en los
> tools que tiene el agente, y los tools son algoritmos"*.

Es la misma tesis que ya sostenía el diseño del [[agente-historico]] ("el LLM solo orquesta,
nunca calcula") llevada a su conclusión de secuencia: si el valor está en las tools, las
tools van primero.

## Contrato de los algoritmos

Los algoritmos **no se escriben para esta consola ni para este dashboard**. Se escriben
para que un agente los llame después:

- **Genéricos**, no cableados a una vista ni a un caso puntual.
- **Contrato de tool**: entrada tipada, salida tipada. Nada de imprimir, formatear o
  decidir cómo se dibuja.
- **Sin acoplarse a la UI**: el mismo algoritmo tiene que servir a un gráfico, a un
  reporte y a una respuesta en lenguaje natural sin cambiarle una línea.
- **Rango de fechas como parámetro de primera clase.** Todos los análisis se hacen sobre
  un rango `[desde, hasta]` que provee el usuario (ejemplo: *"evaluar la variable X de
  enero a marzo"*). No hay algoritmo que asuma "todo el histórico" ni "el último mes".

Esto ya tiene precedente probado en el repo: `agente-historico/tools/*` (una tool = un
archivo = una pregunta específica, con `SCHEMA` + `run()`) y `periodo.py`, que normaliza
`[desde, hasta)`. El trabajo nuevo es **extender ese catálogo hasta cubrir el PDF completo**,
no inventar un patrón.

## El agente sí va a existir, y para qué

Cuando todos los algoritmos estén listos. Su propósito es **acompañar a un experto humano**,
no automatizar el análisis a ciegas.

Caso de uso que define el alcance: un experto quiere analizar cierta variable o métrica en
cierto rango de fechas. El agente debe poder **usar cualquiera de las tools, correr el
análisis, presentarle el dato al experto y aportar su propio análisis encima**. El experto
decide; el agente le ahorra el camino hasta el número y le ofrece una lectura.

Consecuencia de diseño: el agente no necesita ser autónomo ni disparar solo. Necesita
cobertura de tools amplia y capacidad de componerlas, que es exactamente lo que se está
construyendo primero.

## Qué queda matizado de lo anterior

- **[[alcance-agente-historico]] (2026-08-26) sigue vigente en su tesis y se refuerza**: el
  Histórico es el agente **del corpus PV de San Carlos**, no de AgroDash. Lo que cambia es
  que ahora ese alcance tiene una lista concreta de entregables (el PDF) en vez de quedar
  definido solo por el corpus. La condición que ese documento ponía para reconsiderar
  ("cuando el trabajo de cierre del corpus esté terminado") se amplía: ahora también hay que
  terminar el catálogo de algoritmos.
- **[[evaluacion-datos]]** llevaba una advertencia que hoy es falsa: decía que ese plan de
  análisis era "NO para el Agente Histórico". Con esta decisión es exactamente al revés:
  ese plan **es** el Agente Histórico. Corregido en ese archivo.
- **[[agente-historico-calidad]]** deja de ser un componente aparte y pasa a ser la parte ya
  hecha de la familia 1 y 2 de pruebas del PDF (ver [[pruebas-calidad-umbrales]]).
- **[[capa-agentes]]**: el Histórico se describía como "reporte diario + alertas + Q&A". El
  rol nuevo es más estrecho y más claro: **acompañante de un experto sobre un catálogo de
  tools**, disparado por el experto y acotado a un rango de fechas.

## Lo que esta decisión NO resuelve

No dice en qué orden se construyen los algoritmos ni cuáles son prioridad. El PDF marca
varias cosas como "más adelante" o "no tenemos" (ver [[catalogo-metricas-evaluacion]]), y
eso ordena por eliminación, pero la priorización dentro de lo que sí es factible está
pendiente de decidir con Izack.

## Ejecutado el mismo día: la capa está construida

**Actualización 2026-08-28 (misma sesión).** La decisión dejó de ser un plan: la capa de
algoritmos se construyó y está terminada. **13 módulos** de analítica, **11** de pruebas de
calidad, **325 tests** sin base de datos, **23 tools** registradas y **10 endpoints GET**.
Detalle y decisiones de arquitectura en [[capa-analitica]]; las fundaciones del frontend que la
consume, en [[consola-analitica]].

Se cumplió el contrato tal cual estaba escrito, y le salieron tres corolarios que conviene fijar
porque no eran obvios al decidir:

1. **Los algoritmos viven en Python y el frontend no calcula.** Es la forma concreta de "el mismo
   número para los tres consumidores": si el navegador hiciera su propia cuenta, el experto y el
   agente podrían discrepar sobre el mismo dato.
2. **El payload del LLM no es el de la API.** Las tools devuelven el resumen y omiten los arrays
   grandes, que viajan solo por la API. "Contrato de tool" no significa "la misma respuesta para
   todos".
3. **Un endpoint por algoritmo, no por vista**, compuestos en el servidor. Así la API no queda
   acoplada a la forma de la pantalla.

Y produjo el hallazgo que más cambia el proyecto: **el emparejamiento por timestamp exacto
sesgaba el Performance Ratio e invertía la comparación Vertical vs Inclinado**, que es el eje 1
del PDF ([[emparejamiento-por-timestamp]]). Vale como respaldo de la propia decisión: se encontró
construyendo los algoritmos, no se habría encontrado montando un LLM sobre las tools viejas.

**Sigue pendiente el agente**, y ahora con dos deudas concretas que lo bloquean de hecho:
`tools/hallazgos.py::QUE_ES` conserva los 12 tipos viejos contra los 23 que ya hay en el store, y
`agent/prompts.py` nombra a mano las tools viejas sin mencionar las diez nuevas ([[abiertos]]).

Relacionado: [[capa-analitica]], [[consola-analitica]], [[alcance-agente-historico]],
[[agente-historico]], [[agente-historico-calidad]], [[capa-agentes]], [[evaluacion-datos]],
[[catalogo-metricas-evaluacion]], [[pruebas-calidad-umbrales]], [[graficos-evaluacion]],
[[emparejamiento-por-timestamp]], [[store-hallazgos-calidad]], [[decisiones]], [[abiertos]].
