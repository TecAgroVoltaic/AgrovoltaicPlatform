---
name: capa-agentes
description: Capa de agentes (Agente Histórico + Agente Predictivo) — infraestructura consolidada (servicio Python aparte, batch, lee ambas DBs y mapea al consultar); con alcance real y puntos abiertos. 2026-08-28: el Histórico se redefine como acompañante de un experto sobre un catálogo de algoritmos
categoria: proyecto
actualizado: 2026-08-28
---

# Capa de agentes — infraestructura (consolidada 2026-06-16)

Dos agentes sobre las regiones ([[arquitectura-regiones]]):
- **Agente Histórico** — responde qué pasó y si el dato en que se apoya la respuesta sirve. Absorbió lo que este documento llamaba «Comparador» (vigilar desvíos) y «Analizador» (Q&A en lenguaje natural): eran dos agentes en el diseño y terminaron siendo dos familias de herramientas del mismo.
- **Agente Predictivo** — pronostica humedad de suelo e irradiancia.

## 2026-08-28 — el Agente Histórico se redefine (y se pospone)

Decisión de Izack a partir del doc de evaluación de datos de Leonardo Cardinale
([[algoritmos-antes-que-agente]]). Cambian tres cosas de lo que dice el resto de este archivo:

**1. Su alcance ahora es una lista concreta.** Lo que evalúa el Agente Histórico son las
métricas del PDF: los 9 KPIs del dashboard, las series de tiempo, el análisis estadístico, las
4 familias de pruebas de calidad y los 7 ejes de análisis energético
([[catalogo-metricas-evaluacion]], [[pruebas-calidad-umbrales]], [[graficos-evaluacion]]).
Sobre el corpus PV de San Carlos, no sobre AgroDash ([[alcance-agente-historico]]).

**2. Primero los algoritmos, el agente después.** El valor está en las tools, y las tools son
algoritmos. Se construye el catálogo completo antes de montar el lazo de LLM. Contrato:
genéricos, entrada y salida tipadas, sin acoplarse a la UI, y **rango de fechas como parámetro
de primera clase** en todos.

**3. Su propósito no es automatizar, es acompañar.** El caso de uso que define el diseño: un
experto quiere analizar cierta variable o métrica en cierto rango; el agente usa las tools que
haga falta, corre el análisis, le presenta el dato y aporta su propia lectura. **El experto
decide.** Eso matiza lo que dice más abajo sobre «reporte diario + alertas»: esa salida sigue
teniendo sentido para vigilancia, pero **no es** el modo principal del Histórico. El agente lo
dispara una persona con una pregunta, no un cron.

### Y el mismo día, el catálogo se construyó

La condición que posponía al Histórico era "hasta que el catálogo de algoritmos esté completo".
**Ya está** ([[capa-analitica]]): 13 módulos de analítica, 11 de pruebas de calidad, 325 tests,
**23 tools registradas** y 10 endpoints. El Histórico deja de estar bloqueado por falta de manos
y pasa a estar pendiente de dos costuras concretas:

- `tools/hallazgos.py::QUE_ES` tiene los **12 tipos viejos** y el store ya guarda **23**: la
  consola mostraría 17 hallazgos sin glosa ([[store-hallazgos-calidad]]).
- `agent/prompts.py` **nombra a mano** las tools viejas y no menciona las diez nuevas, así que el
  agente no las usaría aunque estén registradas.

Ambas en [[abiertos]]. Nota de orden: ahí también está decidido unificar la orquestación en
VisioneFlow **después** de terminar el Agente Histórico, así que esa cola no se alteró.

## Infraestructura (decidida)
- **Servicio aparte** (NO dentro de AgroDash), en **Python**, **batch/programado** (cron); **sin streaming** (delay aceptable, reporte diario sirve).
- **Lee ambas fuentes**: AgroDash (Postgres `control`) y la **Supabase** de San Carlos. **Mapea las variables comunes al consultar**; NO reestructura las DBs origen.
- **Detección determinista** (estadística/ML: media móvil, EWMA/control charts, **filtro de Kalman**, STL, z-score, residual vs irradiancia, change-point) → **store de hallazgos** propio.
- **LLM solo por encima**: (Agente Histórico) traduce hallazgos → reporte/alerta en lenguaje natural; (Agente Histórico) Q&A + impacto vía **capa semántica/tools sobre agregados (rollups)** + **RAG** de casos públicos. El LLM NO está en el camino de detección numérica.
- **Salidas**: reporte diario + alertas + respuestas NL.
- **Patrón de validación** (origen: nota de campo archivada en `../../_archivo/Need.md`): un modelo (ML o estadístico) **predice** el valor esperado; el agente lo contrasta con los datos **reales de los últimos X minutos** y, si divergen más de lo tolerable, **alerta**.

## Alcance real (por descubrimientos)
- Cartago **no tiene PV** ([[agrodash-esquema]]) → la comparación cruzada solo es viable en **variables ambientales** (irradiancia, temperatura). Los datos ambientales de San Carlos **ya están en AgroDash** (cajas `SC`).
- Señal de drift recomendada: **cada sitio vs su propia línea base**; el cruce inter-sitio como corroboración.

## Abierto (no cerrado)
- **Métrica**: relativa ahora vs **Performance Ratio** cuando lleguen kWp/calibración (bloqueado, [[bloqueantes]]).
- **Insertar San Carlos como caja en AgroDash**: a valorar; NO requerido por esta infra.
- **Re-modelado del almacenamiento** de San Carlos (catálogo de procedencia + posible split por subsistema) y mejora del EDA: dirección acordada, ver [[remodelado-propuesto]].
- Proveedor LLM / hosting: por definir.

Relacionado: [[algoritmos-antes-que-agente]], [[capa-analitica]], [[consola-analitica]],
[[alcance-agente-historico]],
[[catalogo-metricas-evaluacion]], [[graficos-evaluacion]], [[agente-historico]],
[[agente-historico-calidad]], [[arquitectura-regiones]], [[agrodash]], [[agrodash-esquema]],
[[remodelado-propuesto]], [[bloqueantes]].
