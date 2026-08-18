# Memoria del Proyecto — AgroVoltaic

Sistema de memoria jerárquico. Un tema por archivo, agrupados por carpeta. Empieza aquí
para ubicar qué buscas; cada línea apunta al archivo de detalle.

**Última actualización:** 2026-08-18 · *(**Cartago caído → la fuente del ETL es ahora una réplica
del dump dentro de la EC2** (`agrodash-pg`, `127.0.0.1:5433`, 21,3 M filas). El ETL llevaba 9 días
fallando en silencio: corregido, con `/salud/ingesta` que lo hace visible (hoy **503, stale**, dato
congelado desde el 23-jul). Jonathan cerró además **6 tareas de confiabilidad** —auth de la consola
que falla cerrada, rate-limit + tope de gasto en el store, CI con 3 jobs, vistas de salud, estados
de error— y sumó un **documento de arquitectura en LaTeX** y un RUNBOOK. Verificado en vivo el
18-ago: ver [agrodash-local](proyecto/agrodash-local.md). **Dos riesgos nuevos documentados:**
[cuota-store-supabase](proyecto/cuota-store-supabase.md) (79 % del Free tier) y
[superficie-expuesta](proyecto/superficie-expuesta.md).)*

**Anterior:** 2026-08-10 · *(**Leo Cardinale validó el tratamiento de datos** —
doc rev LCV, ver [respuestas-leo-cardinale](decisiones/respuestas-leo-cardinale.md). Regla
rectora nueva: **guardar el crudo en la DB y corregir en una capa de análisis** (superó 85→NULL,
offset→0, resampleo-todo-a-5-min). Muestreo: eléctricas 5 min / radiación 15 s aparte. Temp válida
10–80 °C. Bloqueantes de geometría RESUELTOS: 1420 Wp/arreglo, PV1=inclinado/PV2=vertical,
tilt/azimut, sin constante de calibración → clear-sky. **Esquema Supabase rediseñado + ETL
re-corrido + capas de calibración y Performance Ratio, TODO EN VIVO** en `jijklguopafevyucogro`
(modelo crudo+vistas; radiación ya en W/m²; PR por arreglo ≈0,62 con bifacialidad; modelo viejo
dropeado). Detalle en [implementacion](proyecto/implementacion.md). Prev: agente de pronóstico
multi-variable VIVO en la EC2, fuente SC congelada 23-jul → "solo histórico".)*

## proyecto/ — qué es y en qué fase está
- [objetivo.md](proyecto/objetivo.md) — estandarizar CSV crudos y cargarlos a Supabase como pipeline automatizado y permanente
- [estado.md](proyecto/estado.md) — pipeline implementado y corrido OK (36.630 filas en Supabase); falta calibración y Paso 2
- [implementacion.md](proyecto/implementacion.md) — paquete `src/agrovoltaic`: diseño (cero columnas quemadas), estructura, idempotencia, bugs corregidos
- [arquitectura-regiones.md](proyecto/arquitectura-regiones.md) — dos regiones (Cartago/AgroDash + San Carlos/Supabase), sin DB central; San Carlos está partido
- [capa-agentes.md](proyecto/capa-agentes.md) — Comparador + Analizador; infraestructura consolidada (servicio Python aparte, batch, lee ambas DBs)
- [agente-pronostico.md](proyecto/agente-pronostico.md) — MVP: agente LLM que pronostica irradiancia (Caja Irradiancia SC) vía clear-sky + kt*; rival estadístico; Fase 0-1 hecha + auditada (Haiku, sin fuga, 47 tests); próximo: montar en VisioneFlow (DB por URL)
- [agente-analizador.md](proyecto/agente-analizador.md) — **NUEVO (2026-08-10):** agente Q&A sobre el histórico PV en Supabase; tools atómicas (SRP) sobre las vistas limpias; el LLM solo orquesta; MVP CLI, tools validadas contra la base
- [mvp-debugger.md](proyecto/mvp-debugger.md) — **NUEVO (2026-08-10):** web local (Next.js) para depurar en vivo los dos agentes: visor de traza (tools+salidas+respuesta), explorador de datos read-only, tokens+costo por consulta y acumulado (`/preguntar`, `/datos/*`, `/uso`); + artifact de diseño en iteración
- [integracion-visioneflow.md](proyecto/integracion-visioneflow.md) — agente montándose en VisioneFlow: servicio FastAPI /forecast HECHO (53 tests) + modelos agregados + deploy preparado (runbook docs/pronostico/04); bloqueante: la EC2 no alcanza la DB AgroDash (sin Tailscale)
- [conectividad-tailnet.md](proyecto/conectividad-tailnet.md) — malla Tailscale para acceso a datos: la EC2 (100.125.236.125) YA lee la DB viva de Cartago (100.101.177.71) por Postgres 5432, rol read-only `agrovoltaic_ro`, probado OK; pendiente: rotar la clave débil de prueba
- [pipeline-tiempo-real.md](proyecto/pipeline-tiempo-real.md) — pipeline arquitectura A (AgroDash→ETL→Supabase store→forecaster multi-variable irradiancia+humedad); congelamiento SC 23-jul → "solo histórico"; desplegado en la EC2 con timers (~812k filas backfilleadas)
- [agrodash-local.md](proyecto/agrodash-local.md) — **NUEVO (2026-08-14):** réplica del dump de AgroDash **restaurada en la EC2** (`agrodash-pg`, 127.0.0.1:5433) como fuente del ETL con Cartago caído; 5.045 MB / 21.3M filas → el dump completo NO cabe en la Supabase Free (500 MB); + script para levantarla local
- [cuota-store-supabase.md](proyecto/cuota-store-supabase.md) — **NUEVO (2026-08-18):** el store está al **79 % del Free tier** (395/500 MB) y `lecturas_ambientales_sc` se lleva el 89 %; pasarse = solo-lectura; opciones sin decidir
- [superficie-expuesta.md](proyecto/superficie-expuesta.md) — **NUEVO (2026-08-18):** qué escucha y qué es alcanzable en la EC2 (verificado desde fuera); 8000/8010 bindean `0.0.0.0` y solo los frena el security group; `/forecast/salud/ingesta` es público
- [metodologia.md](proyecto/metodologia.md) — metodología del equipo (San Carlos): variables, puntos de medición, arquitectura HW, frecuencias, periodos
- [evaluacion-datos.md](proyecto/evaluacion-datos.md) — plan de análisis/dashboard San Carlos: DataViz/Stats/Mining, 7 objetivos energéticos, Ridge, Colab

## datos/ — el dataset y sus fuentes
- [fuentes-fisicas.md](datos/fuentes-fisicas.md) — 3 fuentes: inversor, piranómetros, DS18B20
- [dataset-actual.md](datos/dataset-actual.md) — carpeta NEW (285 CSVs), rango, NEW vs OLD
- [agrodash-esquema.md](datos/agrodash-esquema.md) — esquema real de AgroDash (caja→sensor→reading, 34 tablas) y su calidad
- [agrovoltaic2025-db.md](datos/agrovoltaic2025-db.md) — DB de Joshua: re-volcado crudo + 1 tabla unificada SIN limpiar; veredicto: no adoptar
- [remodelado-propuesto.md](datos/remodelado-propuesto.md) — **HISTÓRICO/SUPERADO**: las vistas viejas (v_inversor/…) y `monitoreo_agrovoltaic` se dropearon; el split ahora es nativo del modelo crudo
- [diccionario-variables.md](datos/diccionario-variables.md) — variables fuente San Carlos (jun 2026): 3 tablas (PV/inversor+SP722, Fliwer, nodos ESP32)
- [correccion-filas-mezcladas.md](datos/correccion-filas-mezcladas.md) — spec del equipo para remapear filas de piranómetro (L/M/N/O) + par ground-truth original/corregido
- [geometria-sistema.md](datos/geometria-sistema.md) — specs físicas confirmadas por Leo: 1420 Wp/arreglo (4×355 Wp), PV1=inclinado (20°/150°), PV2=vertical (90°/50°), bifaciales; insumo de calibración/PR

## inconsistencias/ — un archivo por problema (verificadas en NEW el 2026-06-01)
- [schemas-multiples.md](inconsistencias/schemas-multiples.md) — 13 schemas, nombres inconsistentes
- [filas-mezcladas.md](inconsistencias/filas-mezcladas.md) — filas de distintas fuentes con ≠ nº de columnas
- [irradiancia-sin-calibrar.md](inconsistencias/irradiancia-sin-calibrar.md) — valores negativos/irreales, offset −38.845
- [temperatura-85.md](inconsistencias/temperatura-85.md) — saturación en 85.0 (error DS18B20)
- [muestreo-variable.md](inconsistencias/muestreo-variable.md) — de 2 s a 5 min según la época
- [gaps-temporales.md](inconsistencias/gaps-temporales.md) — gaps de 126 y 71 días + nuevos
- [duplicados.md](inconsistencias/duplicados.md) — archivos `(N)` duplicados y fragmentos
- [typos-headers.md](inconsistencias/typos-headers.md) — `Energì`, `POTencia`, `Corriente PV2[A]`

## decisiones/ — qué decidimos y por qué
- [decisiones.md](decisiones/decisiones.md) — resampleo, gaps, duplicados, schema destino; **2026-08-10 giro a "crudo en DB + corrección en análisis"** (superó 85→NULL, offset→0, resampleo-todo)
- [respuestas-leo-cardinale.md](decisiones/respuestas-leo-cardinale.md) — **fuente de verdad**: respuestas verbatim de Leo P1–P12 + los 4 datos pendientes (doc rev LCV, 2026-08-10)

## pendientes/ — lo que bloquea
- [bloqueantes.md](pendientes/bloqueantes.md) — **2026-08-10 casi todo RESUELTO por Leo** (kWp, tilt/azimut, PV1/PV2, constante de calibración); solo queda el mapeo caja→sitio fino para el Comparador

## contexto-externo/ — sistemas relacionados
- [agrodash.md](contexto-externo/agrodash.md) — DB de Cartago y objetivo de comparación; suelo/riego/experimentos, NO fotovoltaica; contiene ambos sitios

---

## Material fuera de la memoria (en `../`, agrupado por carpeta)

Detalle largo, binarios y material de apoyo. La memoria de arriba los cita cuando hace falta.

### analisis/ — análisis puntuales
- `../analisis/cambios-2026-08-18.html` — resumen de los 19 commits del 14–17 ago (réplica de AgroDash en la EC2, 6 tareas de confiabilidad, doc de arquitectura) + verificación en vivo y riesgos

### referencia/ — documentos largos de detalle
- `../referencia/EDA-Monitoreo-AgroVoltaic.md` — análisis exploratorio completo (los 13 schemas, calidad, gaps)
- `../referencia/TODO-Pipeline-Limpieza.md` — diseño del pipeline de 12 pasos · **HISTÓRICO: ya implementado**, ver [implementacion](proyecto/implementacion.md)
- `../referencia/columnas-supabase.md` — diccionario de columnas de la tabla `monitoreo_agrovoltaic` (qué es cada una)
- `../referencia/ObjetivosProyecto.md` — plan de la pasantía (contexto académico)
- `../referencia/agrodash-control-schema.sql` — esquema real de AgroDash (DDL, sin secretos)
- `../referencia/Metodologia-Agrivoltaic.docx` — doc fuente de la metodología (San Carlos) → [metodologia](proyecto/metodologia.md)
- `../referencia/Evaluacion-de-datos.docx` — doc fuente del diccionario + plan de análisis → [evaluacion-datos](proyecto/evaluacion-datos.md), [diccionario-variables](datos/diccionario-variables.md)
- `../referencia/temp_tail_ridge_plot.py` — código de referencia del análisis Ridge (DataStats)
- `../referencia/correccion-filas-mezcladas/` — PNG anotado + par CSV original/corregido (ground-truth Paso 2) → [correccion-filas-mezcladas](datos/correccion-filas-mezcladas.md)

### conceptos/ — material pedagógico (cómo funciona el sistema)
- `../conceptos/glosario.md` — términos del dominio (panel, string, irradiancia, albedo, bifacial)
- `../conceptos/sistema-fotovoltaico.html` — anatomía de un sistema fotovoltaico
- `../conceptos/panel-desnivel-electrones.html` — por qué nace la corriente en el panel
- `../conceptos/proceso-datos-agrovoltaico.html` — diagrama "de la luz al dato" (sol → Supabase)

### equipo/ — interacción con el equipo de campo / profesor
- `../equipo/DUDAS-Pendientes.md` (+`.pdf`) — 17 preguntas para el equipo de campo
- `../equipo/Preguntas-Profesor-CapaAgentes.pdf` — preguntas para definir la capa de agentes
- `../equipo/Preguntas-Profesor-Tratamiento-Datos.pdf` — consulta al profesor: decisiones de tratamiento con opciones y preguntas P1–P12 (nomenclatura, 85 °C, offset, filas mezcladas, resampleo, umbrales, calibración); breve/no técnica; lo ya respondido por el diccionario/metodología va como nota, no como pregunta
- `../equipo/Hallazgos-Datos-Monitoreo-SanCarlos.pdf` — hallazgos y tratamiento aplicado (base del PDF de preguntas)
- `../equipo/Minuta_Reunion_2025-06-24.pdf` — minuta de reunión

### _archivo/ — histórico / desactualizado (no usar como fuente actual)
- `../_archivo/referencia_api_agrodash.pdf` — PDF de AgroDash (DESACTUALIZADO; usar el `.sql` real)
- `../_archivo/Need.md` — nota cruda de la capa de agentes, ya destilada en [capa-agentes](proyecto/capa-agentes.md)
