# AgroVoltaic - Estandarizacion de Datos de Monitoreo

## Que es esto

Datos crudos de un sistema agrovoltaico (paneles solares + agricultura) recolectados durante ~22 meses (Nov 2024 - Ago 2026). Los datos vienen de 3 fuentes fisicas: un inversor solar de 2 strings (PV1 y PV2), piranometros (irradiancia incidente desde Nov 2024; reflejada y albedo solo desde el 2025-10-25, o sea ~10 meses de ventana y no 22; y un segundo sensor SP722 que arranco el 2026-05-11, paro, y volvio el 2026-06-03: 8.984 lecturas hasta el 2026-08-31), y sensores de temperatura DS18B20. El problema central es que **no hay un estandar de datos**: los CSV del historico tienen 13 schemas distintos (los 57 archivos nuevos, del 2026-06-02 en adelante, ya traen UNA sola cabecera), columnas que aparecen/desaparecen, nombres inconsistentes, filas de distintos sensores mezcladas, y valores sin calibrar.

El objetivo es limpiar y estandarizar todo para insertarlo en **Supabase** mediante un **pipeline automatizado y permanente** (proceso reproducible e idempotente, NO un script de una sola vez), y eventualmente construir un dashboard con visualizacion, prediccion y agentes de IA.

## Punto de entrada: sistema de memoria

**Antes de trabajar, lee `docs/memoria/INDEX.md`.** El conocimiento del proyecto esta organizado como un sistema de archivos jerarquico (un tema por archivo, agrupado por carpeta, con frontmatter y enlaces `[[...]]`). El INDEX es el mapa maestro. Manten ese sistema actualizado cuando cambien hechos o decisiones.

```
docs/memoria/
  INDEX.md              ← mapa maestro (empieza aca)
  proyecto/             ← objetivo, estado, implementacion, regiones, capa de agentes
  datos/                ← fuentes fisicas, dataset actual, esquemas (AgroDash, etc.)
  inconsistencias/      ← un archivo por problema, con evidencia contada en NEW
  decisiones/           ← que decidimos y por que
  pendientes/           ← lo que bloquea (lat/lon, kWp, modelo de sensor)
  contexto-externo/     ← AgroDash (DB de la region Cartago)
```

## Estado actual

- EDA exhaustivo completo: identifico los 13 schemas, los problemas de calidad y las brechas temporales
- **Pipeline ETL implementado y corrido OK** (`src/agrovoltaic/`): 342 CSV → **45.270 filas** electricas (331 dias, hasta el 2026-08-31) en Supabase. Idempotente e incremental. Detalle en `docs/memoria/proyecto/implementacion.md`
- **2026-08-10 — Leo Cardinale validó el tratamiento (doc rev LCV).** Regla rectora nueva: **guardar el crudo en la DB y corregir en una capa de análisis** (superó 85→NULL, offset→0, resampleo-todo-a-5-min). Bloqueantes de geometría RESUELTOS. Implica **rediseñar el esquema Supabase + re-correr el ETL**. Fuente de verdad: `docs/memoria/decisiones/respuestas-leo-cardinale.md`
- **Pendiente:** separacion fina de filas mezcladas (Paso 2) y **calibracion de irradiancia** (ya desbloqueada: clear-sky con lat/lon + tilt/azimut; ver `docs/memoria/datos/geometria-sistema.md`)
- Siguiente fase en diseño: **capa de agentes** (Agente Histórico + Agente Predictivo) sobre dos regiones — ver `docs/memoria/proyecto/capa-agentes.md`
- **2026-08-30 — Leo Cardinale respondio las tres consultas de datos (`consultas-sobre-la-data-Rev-LCV.pdf`, anotaciones PDF).** El Performance Ratio pasa a calcularse **por dia y por mes** con acumuladores de energia, no cada 5 min. La energia del tablero es **AC** (`energia_hoy_wh` / `energia_total_wh`). Un **0 V en el voltaje AC es dato valido**: el rango 100-280 V sale de validez fisica y entra una prueba de **disponibilidad del equipo**. Fuente de verdad: `docs/memoria/decisiones/respuestas-lcv-consultas-agosto.md`
- **Medido 2026-08-31, corrige dos cosas que dabamos por ciertas:** las columnas `energia_*_wh` estan en **kWh pese al nombre**; y el hueco de cuatro meses de energia AC **no existe** (`energia_hoy_wh` cubre nov-2025 a feb-2026 con 13.923 lecturas). Los 39 MWh con que se habia descartado el contador del inversor salian de **una sola fila contaminada**
- **Capa analitica y de calidad construida y corrida** (`agente-historico/src/historico/analitica/` y `calidad/`): metricas, series, distribuciones, correlaciones y las pruebas del PDF de evaluacion. Falta construir las **vistas del frontend**
- **2026-09-01 — carga nueva (`Last-Data.zip`, 57 CSVs del 2026-06-02 al 2026-08-31).** Desmiente tres cosas que le dijimos al equipo: el sistema **nunca dejo de reportar** (55 de 57 dias con generacion real), el **SP722 no corrio 18 dias** (vuelve a ser candidato para calibrar) y el albedo ya no tiene 7 meses de ventana. **ALARMA: el 2026-08-26 y el 2026-08-31 la planta genero CERO todo el dia** (codigo de error 302) con mas de 1.000 W/m2 de sol

## Estructura del proyecto

```
AgroVoltaic/
  CLAUDE.md                 ← este archivo
  dataset/
    Monitoreo-AgroVoltaic-SC-NEW/   ← CARPETA ACTIVA: 342 CSVs crudos (2024-11-10 a 2026-08-31)
                                      OJO: 4 sin el prefijo `Monitoreo_`. Coincide 342/342 con `_ingest_log`
    *.zip                           ← descargas originales
  src/agrovoltaic/          ← pipeline ETL (ver README.md y memoria/proyecto/implementacion.md)
  docs/
    memoria/        ← SISTEMA DE MEMORIA (empezar por INDEX.md)
    referencia/     ← docs largos: EDA, TODO-Pipeline (ya implementado), columnas-supabase, ObjetivosProyecto, agrodash-control-schema.sql
    conceptos/      ← material pedagogico: glosario + diagramas HTML (+ img/)
    equipo/         ← interaccion con el equipo: DUDAS-Pendientes (.md/.pdf), Preguntas-Profesor.pdf, Minuta_Reunion
    _archivo/       ← desactualizado/historico: referencia_api_agrodash.pdf, Need.md
```

## Problemas clave de los datos (verificados en NEW, 2026-06-01)

1. **13 schemas distintos** — nombres de columnas cambian entre cortos (`vpv1`), largos (`Voltaje PV1 [V]`), y snake_case (`voltaje_pv1_v`). Hay typos: `POTencia` (2 archivos), `Energì` con acento grave (72 archivos), `Corriente PV2[A]` sin espacio (5 archivos)
2. **Filas de distintas fuentes mezcladas** — lecturas del inversor (17-22 cols) y del piranometro (3-4 cols) se intercalan en el mismo CSV (8 archivos: 2024-12-25/27/28/29, 2025-05-20, 2025-10-18/20/30). Valores de irradiancia caen en columnas como "Voltaje PV1"
3. **Irradiancia sin calibrar** — valores negativos e irreales (minimos hasta -15,538). Lecturas crudas del sensor (¿mV?) sin convertir a W/m2. El offset nocturno constante -38.845 aparece en 205 archivos. Persiste en los archivos nuevos, con picos de **1.464 W/m2** (imposibles en San Carlos) y **102 dias de kt imposible**. El SP722 ya NO esta vacio: 8.984 lecturas
4. **Temperaturas saturadas en 85.0** — error clasico de DS18B20 desconectado; presente en 137 archivos
5. **Intervalo de muestreo variable** — 2 seg (Dic 2024), 1 min (May 2025), 5 min (Nov 2025+)
6. **Gaps de datos** — 126 dias (Ene-Abr 2025), 71 dias (Jul-Ago 2025), + mini-gap nuevo (faltan 22-24 May 2026)
7. **Archivos duplicados** — exactos por MD5: `2024-12-23(1)`, `2025-10-01(1)`. Fragmentos diminutos: `2024-12-24(1..5)`

Detalle por inconsistencia (con evidencia): `docs/memoria/inconsistencias/`.

## Decisiones tomadas

**Validadas con Leo Cardinale (2026-08-10, doc rev LCV) — regla rectora: crudo en la DB, corrección en capa de análisis:**
- **Guardar el valor crudo**; cada corrección (temp 85, offset −38.845, fuera de rango) genera una **variable/columna corregida nueva**. NO transformar in-place. *(Superó: 85→NULL, offset→0.)*
- **Muestreo:** variables eléctricas a **5 min**; **radiación a 15 s en tabla aparte** (era 10 s; ThingSpeak no permite <15 s). Muestreos <10 s = pruebas → conservar o promediar a 15 s. *(Superó: resamplear todo a 5 min.)*
- **Temperatura válida: 10–80 °C** (reemplaza el −10..60 C de AgroDash), aplicado en posproceso.
- **Filas mezcladas:** recuperar lo posible (como hizo Joshua), aceptar huecos.
- **Nombres de columnas aprobados**; abreviar los largos + tabla de definiciones.
- **Calibración de irradiancia:** no hay constante guardada ("celda calibrada" = nombre comercial) → **clear-sky (pvlib)** con lat/lon + tilt/azimut. Descartar irradiancia **pre-mediados-2025** (error corregido a mediados 2025). El **SP722** se habia descartado por ventana corta; con la carga del 2026-09-01 tiene ~4 meses (8.984 lecturas) y **ese descarte esta REABIERTO**.

**Validadas con Leo Cardinale (2026-08-30, segunda ronda: como se CALCULA) — ver `respuestas-lcv-consultas-agosto.md`:**
- **Performance Ratio por dia y por mes**, no cada 5 minutos. Energia del dia desde los acumuladores `energia_pv1_wh`/`energia_pv2_wh` (son acumuladores **diarios**), dividida por la irradiacion integrada del dia. El emparejamiento con el dato mas cercano queda para analisis punto a punto, no para el PR
- **Irradiancia por plano de cada arreglo** para el PR: principio confirmado, **la ecuacion de transposicion la debe confirmar Hugo** (no bloquea: ya hay POA modelada con pvlib en `radiacion_sc_poa`)
- **Un 0 en el voltaje AC es dato valido** (inversor sin exportar). La prueba nueva detecta `voltaje_vac`, `frecuencia_hz` y `potencia_total_wac` en cero **durante el dia (7am-5pm)**, con refinamiento por **irradiancia > 300 W/m2**. Ya no mide validez del dato sino disponibilidad del equipo
- **La energia del tablero es AC**, desde `energia_hoy_wh` (se reinicia cada dia) o `energia_total_wh`. Da ~0,958 de la suma DC de los dos arreglos, por perdidas del inversor (medido sobre 129 dias)
- **Ojo con la formula `Irradiancia*5/60`** que dio Leo: supone cadencia de 5 min y la nuestra va de 15 s a 330 s. La generalizacion correcta es `irradiancia * dt_real/3600` con techo

**Otras (previas, vigentes):**
- No generar datos sinteticos para los gaps largos (126 y 71 dias) — usar NASA POWER como referencia paralela
- Archivos duplicados exactos se eliminan; los fragmentos `(N)` requieren decision del usuario
- La carga a Supabase debe ser un pipeline automatizado/idempotente, no un proceso temporal

Detalle y justificacion: `docs/memoria/decisiones/decisiones.md`, `docs/memoria/decisiones/respuestas-leo-cardinale.md` (primera ronda, tratamiento) y `docs/memoria/decisiones/respuestas-lcv-consultas-agosto.md` (segunda ronda, calculo).

## Informacion pendiente (bloqueante)

**2026-08-10 — casi todo RESUELTO por Leo Cardinale** (ver `docs/memoria/datos/geometria-sistema.md`):
- ✅ **kWp:** 1420 Wp por arreglo (4 × 355 Wp), 2840 Wp total, bifaciales
- ✅ **Tilt/azimut y mapeo:** PV1 = Inclinado (20°/150°) · PV2 = Vertical (90°/50°); Norte=0°, horario+
- ✅ **Constante de calibración:** no existe ("celda calibrada" = nombre comercial) → calibrar por clear-sky
- ✅ **Lat/lon:** la tiene Izack · ✅ **Timezone:** Costa Rica UTC−6

**Bloqueantes abiertos al 2026-08-31:**
- **Ecuacion de transposicion de irradiancia horizontal al plano de cada arreglo: la confirma Hugo** (Leo confirmo el principio el 2026-08-30). No frena el trabajo: ya corre POA modelada con pvlib, pero el modelo esta pendiente de aval
- **Avisarle a Leo que el sistema NUNCA dejo de reportar.** Le pedimos revisar una caida que no existio: era nuestra descarga la que estaba vieja. Lo que si hay que revisar es el **codigo de error 302**: el ultimo dia con dato (2026-08-31) la planta no genero nada
- **Mapeo caja→sitio fino en AgroDash** (que cajas son Cartago y cuales San Carlos). No bloquea San Carlos PV, solo la comparación entre regiones

## AgroDash — region Cartago (no fusionar a nivel de datos)

`docs/_archivo/referencia_api_agrodash.pdf` (**DESACTUALIZADO**) documenta **AgroDash**. Realidad vigente (ver `docs/memoria/contexto-externo/agrodash.md` y `docs/memoria/datos/agrodash-esquema.md`): AgroDash es la **base de datos de la region Cartago** (PostgreSQL, app Rust/Axum) de sensores de **suelo/ambiente** (humedad, EC, temperatura, irradiancia, PAR) — **NO** fotovoltaica. A nivel de **almacenamiento** sigue separada de la Supabase PV de San Carlos (no se fusionan tablas), pero el **Agente Histórico SI la lee** y la data ambiental de San Carlos ya vive ahi (cajas con sufijo `SC`). Usar el esquema real (`docs/referencia/agrodash-control-schema.sql`), no el PDF.

## Herramientas recomendadas

- `pvlib-python` — modelos clear-sky para calibrar irradiancia
- `pvanalytics` — QC automatizado de datos solares
- `NASA POWER API` — datos satelitales de referencia
- `pandas` — resampleo y transformacion
- Destino final: **Supabase** (PostgreSQL)
