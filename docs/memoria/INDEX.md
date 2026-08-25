# Memoria del Proyecto — AgroVoltaic

Sistema de memoria jerárquico. Un tema por archivo, agrupados por carpeta. Empieza aquí
para ubicar qué buscas; cada línea apunta al archivo de detalle.

**Última actualización:** 2026-08-25 · *(**Servidor propio y consola desplegada.**
AgroVoltaic salió del EC2 de VisioneFlow: los dos agentes, la réplica de AgroDash y la consola
viven ahora en `VisioneMetrics`, detrás de nginx con TLS en `agro.visione-edge.com`. Se corrigieron
tres cosas que la doc daba por buenas y no lo eran: los servicios escuchaban en `0.0.0.0` (no en
loopback), el `Dockerfile` del Predictivo apuntaba a un módulo que el refactor borró, y la
renovación automática del certificado estaba **deshabilitada** pese a que certbot dijo lo
contrario. Detalle en [servidor-propio](proyecto/servidor-propio.md). **TODO decidido y pospuesto:**
unificar la orquestación en VisioneFlow cuando el Agente Histórico esté terminado, porque hoy hay
dos cerebros sobre las mismas tools: ver [abiertos](pendientes/abiertos.md).)*

**Anterior:** 2026-08-21 · *(**Vocabulario unificado + vista «Base de datos» nueva.**
Los modos del agente pasaron por dos renombres hasta quedar en `medicion_visible` / `medicion_oculta`:
antes la misma cosa tenía cuatro nombres (servicio, chip, botón y variable decían cosas distintas) y
«modo backtest» era además falso, porque `/backtest` dibuja el gráfico en los dos. Al renombrar
apareció una **fuga real**: un modo inválido caía al modo PERMISIVO, o sea que quien pedía la medición
oculta recibía `backtest`. Ahora es 422, verificado en producción. Vista **«Base de datos»** nueva: el
recorrido del ETL en cinco actos con el dato a la vista, partido por la línea que separa lo
irreversible (al cargar) de lo reescribible (al consultar), más once tratamientos numerados como el
doc de Leo. Y las fichas de los tools ganaron **«En qué ayuda»**. Detalle en
[agente-predictivo](proyecto/agente-predictivo.md) y [mvp-debugger](proyecto/mvp-debugger.md).
**La extensión de Chrome no conecta**, así que toda la UI se verifica con `react-dom/server` — ver
[verificacion-consola](proyecto/verificacion-consola.md).)*

**Previo:** 2026-08-19 · *(**Solo el Agente Predictivo, y verificado end-to-end.**
El Agente Histórico quedó bloqueado en la consola con un flag de servidor reversible
(`AGENTE_HISTORICO=on`). 74 chequeos e2e, 0 fallas. Hallazgo que habría hundido la demo: el último
dato es de madrugada → se agregó el instante de referencia (`ahora` en `/forecast`).)*

**Antes:** 2026-08-18 · Cartago caído → el ETL lee una réplica del dump dentro de la EC2; llevaba
9 días fallando en silencio. Detalle: [agrodash-local](proyecto/agrodash-local.md) · riesgos abiertos
en [cuota-store-supabase](proyecto/cuota-store-supabase.md) y [superficie-expuesta](proyecto/superficie-expuesta.md).

**Y antes:** 2026-08-10 · Leo Cardinale validó el tratamiento de datos y con eso cayeron los
bloqueantes de geometría. Regla rectora: **crudo en la DB, corrección en capa de análisis**. Esquema
rediseñado, ETL re-corrido y capas de calibración y PR **en vivo**. Fuente de verdad:
[respuestas-leo-cardinale](decisiones/respuestas-leo-cardinale.md) · [implementacion](proyecto/implementacion.md).

## proyecto/ — qué es y en qué fase está
- [objetivo.md](proyecto/objetivo.md) — estandarizar CSV crudos y cargarlos a Supabase como pipeline automatizado y permanente
- [estado.md](proyecto/estado.md) — pipeline implementado y corrido OK (36.630 filas en Supabase); falta calibración y Paso 2
- [implementacion.md](proyecto/implementacion.md) — paquete `src/agrovoltaic`: diseño (cero columnas quemadas), estructura, idempotencia, bugs corregidos
- [arquitectura-regiones.md](proyecto/arquitectura-regiones.md) — dos regiones (Cartago/AgroDash + San Carlos/Supabase), sin DB central; San Carlos está partido
- [capa-agentes.md](proyecto/capa-agentes.md) — Agente Histórico + Agente Predictivo; infraestructura consolidada (servicio Python aparte, batch, lee ambas DBs)
- [agente-predictivo.md](proyecto/agente-predictivo.md) — agente LLM que pronostica irradiancia + humedad de suelo vía clear-sky + kt*; dos modos (`medicion_visible` / `medicion_oculta`) y `GET /arquitectura`, que **deriva** el mapa del agente de `agent.MODOS` y los esquemas reales; **verificado e2e contra producción el 19-ago (72 chequeos, 0 fallas · 159 tests)**; instante de referencia para pronosticar con sol pese al congelamiento; cobertura real de la serie
- [servidor-propio.md](proyecto/servidor-propio.md) — **NUEVO (2026-08-25):** la plataforma salió del EC2 de VisioneFlow a uno propio (`VisioneMetrics`), con dominio, TLS y la consola desplegada en `agro.visione-edge.com`. Réplica de 6 GB movida por red privada y verificada por conteo exacto (21.314.662 filas). Los servicios **no estaban en loopback** como decía la doc: escuchaban en `0.0.0.0` y los tapaba solo el security group. El servidor **se apaga 19:00–07:00 y los fines de semana**, así que todo consumidor externo tiene que disparar en esa ventana
- [agente-historico-calidad.md](proyecto/agente-historico-calidad.md) — **NUEVO (2026-08-24):** control de calidad determinista del histórico PV (completitud contra las **horas de sol**, no contra 24 h) + caracterización del cielo (kt y variabilidad). Las tres trampas que costaron una corrida cada una: el **VI medía la cadencia del logger** (4,15 vs 23,81 para el mismo kt), los **kt imposibles se disfrazaban de día soleado** (kt medio 5,67), y **«sensor plano» eran tres cosas distintas** (85, cero, o trabado de verdad). Store `hallazgos_calidad` + `cielo_diario` + reporte + **vista «Calidad de datos» en la consola** (servicio :8020, mapa de días como calendario y no tabla, dos tiras por fuente: radiación 126 días ok contra eléctrico 4)
- [agente-historico.md](proyecto/agente-historico.md) — **NUEVO (2026-08-10):** agente Q&A sobre el histórico PV en Supabase; tools atómicas (SRP) sobre las vistas limpias; el LLM solo orquesta; MVP CLI, tools validadas contra la base
- [mvp-debugger.md](proyecto/mvp-debugger.md) — web local (Next.js) para depurar en vivo los agentes; **desde el 19-ago solo muestra el predictivo** (flag `AGENTE_HISTORICO`): visor de traza (tools+salidas+respuesta), explorador de datos read-only, tokens+costo por consulta y acumulado (`/preguntar`, `/datos/*`, `/uso`); **vista «Arquitectura del agente»** (grafo de nodos leído de `/arquitectura`, con hover y modales por herramienta, cada uno con «En qué ayuda»); **vista «Base de datos»** (el recorrido del ETL en cinco actos, con el dato a la vista en cada paso); + artifact de diseño en iteración
- [integracion-visioneflow.md](proyecto/integracion-visioneflow.md) — agente montándose en VisioneFlow: servicio FastAPI /forecast HECHO (53 tests) + modelos agregados + deploy preparado (runbook docs/predictivo/04); bloqueante: la EC2 no alcanza la DB AgroDash (sin Tailscale)
- [conectividad-tailnet.md](proyecto/conectividad-tailnet.md) — malla Tailscale para acceso a datos: la EC2 (100.125.236.125) YA lee la DB viva de Cartago (100.101.177.71) por Postgres 5432, rol read-only `agrovoltaic_ro`, probado OK; pendiente: rotar la clave débil de prueba
- [pipeline-tiempo-real.md](proyecto/pipeline-tiempo-real.md) — pipeline arquitectura A (AgroDash→ETL→Supabase store→forecaster multi-variable irradiancia+humedad); congelamiento SC 23-jul → "solo histórico"; desplegado en la EC2 con timers (~812k filas backfilleadas)
- [agrodash-local.md](proyecto/agrodash-local.md) — **NUEVO (2026-08-14):** réplica del dump de AgroDash **restaurada en la EC2** (`agrodash-pg`, 127.0.0.1:5433) como fuente del ETL con Cartago caído; 5.045 MB / 21.3M filas → el dump completo NO cabe en la Supabase Free (500 MB); + script para levantarla local
- [cuota-store-supabase.md](proyecto/cuota-store-supabase.md) — **RESUELTO (2026-08-24):** la cuota estaba reventada (egress 103 %, disco 90 %) por **modelar una serie de tiempo como texto repetido**: 353 MB para 885.606 floats con solo 11 combinaciones distintas, e índices (192 MB) más pesados que los datos (161 MB). Normalizado sin perder un dato: base **415 → 150 MB (90 → 30 %)** y la bajada del forecaster **56 → 4,7 MB (11,8x)**. Migración 002
- [acceso-lectura-equipo.md](proyecto/acceso-lectura-equipo.md) — **NUEVO (2026-08-24):** por qué un cliente con la llave anon ve **0 filas y ningún error** (RLS activo sin políticas) y por qué una consulta grande devuelve «conexión cerrada» (`statement_timeout` de 3 s). El rol `joshua_ro` (login + BYPASSRLS + solo lectura + 120 s) por el session pooler
- [superficie-expuesta.md](proyecto/superficie-expuesta.md) — **NUEVO (2026-08-18):** qué escucha y qué es alcanzable en la EC2 (verificado desde fuera); 8000/8010 bindean `0.0.0.0` y solo los frena el security group; `/forecast/salud/ingesta` es público
- [verificacion-consola.md](proyecto/verificacion-consola.md) — **NUEVO (2026-08-21):** la extensión de Chrome NO conecta; cómo verificar la UI sin navegador (`tsc` + `react-dom/server`, 44 chequeos) y las trampas de la operativa local (`npm run build` con `next dev` vivo rompe el dev server)
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
- [verificacion-numeros.md](datos/verificacion-numeros.md) — **NUEVO (2026-08-21):** las consultas SQL que reproducen el antes/después del ETL; hay que re-correrlas cuando cambie el pipeline, porque las cifras de la consola son un corte fechado
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

## pendientes/ — lo que bloquea y lo que falta decidir
- [abiertos.md](pendientes/abiertos.md) — **NUEVO (2026-08-21):** lo que depende de NOSOTROS: volumen del contenedor (885k filas cada 6 h), addon NWP apagado (−8 % MAE a 6 h), 32 commits sin pushear, NSRDB sin evaluar
- [bloqueantes.md](pendientes/bloqueantes.md) — **2026-08-10 casi todo RESUELTO por Leo** (kWp, tilt/azimut, PV1/PV2, constante de calibración); solo queda el mapeo caja→sitio fino para el Agente Histórico

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
- `../conceptos/anticipacion/` — **NUEVO (2026-08-19):** el selector de anticipación explicado sin jerga, con el ejemplo real del 22-jul 08:00 y las dos advertencias al comparar errores entre resoluciones (`.html` fuente + `.pdf` de 2 páginas)

### equipo/ — interacción con el equipo de campo / profesor
- `../equipo/DUDAS-Pendientes.md` (+`.pdf`) — 17 preguntas para el equipo de campo
- `../equipo/Preguntas-Profesor-CapaAgentes.pdf` — preguntas para definir la capa de agentes
- `../equipo/Preguntas-Profesor-Tratamiento-Datos.pdf` — consulta al profesor: decisiones de tratamiento con opciones y preguntas P1–P12 (nomenclatura, 85 °C, offset, filas mezcladas, resampleo, umbrales, calibración); breve/no técnica; lo ya respondido por el diccionario/metodología va como nota, no como pregunta
- `../equipo/Hallazgos-Datos-Monitoreo-SanCarlos.pdf` — hallazgos y tratamiento aplicado (base del PDF de preguntas)
- `../equipo/Minuta_Reunion_2025-06-24.pdf` — minuta de reunión

### _archivo/ — histórico / desactualizado (no usar como fuente actual)
- `../_archivo/referencia_api_agrodash.pdf` — PDF de AgroDash (DESACTUALIZADO; usar el `.sql` real)
- `../_archivo/Need.md` — nota cruda de la capa de agentes, ya destilada en [capa-agentes](proyecto/capa-agentes.md)
