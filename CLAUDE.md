# AgroVoltaic - Estandarizacion de Datos de Monitoreo

## Que es esto

Datos crudos de un sistema agrovoltaico (paneles solares + agricultura) recolectados durante ~19 meses (Nov 2024 - Jun 2026). Los datos vienen de 3 fuentes fisicas: un inversor solar de 2 strings (PV1 y PV2), piranometros (irradiancia incidente, reflejada y albedo; un segundo sensor SP722 desde May 2026), y sensores de temperatura DS18B20. El problema central es que **no hay un estandar de datos**: los CSV tienen 13 schemas distintos, columnas que aparecen/desaparecen, nombres inconsistentes, filas de distintos sensores mezcladas, y valores sin calibrar.

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
- **Pipeline ETL implementado y corrido OK** (`src/agrovoltaic/`): 285 CSV → **36.630 filas** en la tabla `monitoreo_agrovoltaic` de Supabase. Idempotente e incremental. Detalle en `docs/memoria/proyecto/implementacion.md`
- **2026-08-10 — Leo Cardinale validó el tratamiento (doc rev LCV).** Regla rectora nueva: **guardar el crudo en la DB y corregir en una capa de análisis** (superó 85→NULL, offset→0, resampleo-todo-a-5-min). Bloqueantes de geometría RESUELTOS. Implica **rediseñar el esquema Supabase + re-correr el ETL**. Fuente de verdad: `docs/memoria/decisiones/respuestas-leo-cardinale.md`
- **Pendiente:** separacion fina de filas mezcladas (Paso 2) y **calibracion de irradiancia** (ya desbloqueada: clear-sky con lat/lon + tilt/azimut; ver `docs/memoria/datos/geometria-sistema.md`)
- Siguiente fase en diseño: **capa de agentes** (Comparador + Analizador) sobre dos regiones — ver `docs/memoria/proyecto/capa-agentes.md`
- **Verificacion 2026-06-01:** la carpeta `NEW` (285 CSVs) reproduce TODAS las inconsistencias del EDA. Es `OLD + 8 archivos nuevos` (2026-05-25 a 2026-06-01), sin limpiar

## Estructura del proyecto

```
AgroVoltaic/
  CLAUDE.md                 ← este archivo
  dataset/
    Monitoreo-AgroVoltaic-SC-NEW/   ← CARPETA ACTIVA: 285 CSVs crudos (2024-11-10 a 2026-06-01)
    Monitoreo-AgroVoltaic-SC-OLD/   ← snapshot anterior (277 CSVs), referencia
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
3. **Irradiancia sin calibrar** — valores negativos e irreales (minimos hasta -15,538). Lecturas crudas del sensor (¿mV?) sin convertir a W/m2. El offset nocturno constante -38.845 aparece en 205 archivos. Persiste incluso en los archivos nuevos; columnas SP722 casi siempre vacias
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
- **Calibración de irradiancia:** no hay constante guardada ("celda calibrada" = nombre comercial) → **clear-sky (pvlib)** con lat/lon + tilt/azimut. Descartar irradiancia **pre-mediados-2025** (error corregido a mediados 2025); **SP722** desde mayo 2026.

**Otras (previas, vigentes):**
- No generar datos sinteticos para los gaps largos (126 y 71 dias) — usar NASA POWER como referencia paralela
- Archivos duplicados exactos se eliminan; los fragmentos `(N)` requieren decision del usuario
- La carga a Supabase debe ser un pipeline automatizado/idempotente, no un proceso temporal

Detalle y justificacion: `docs/memoria/decisiones/decisiones.md` y `docs/memoria/decisiones/respuestas-leo-cardinale.md`.

## Informacion pendiente (bloqueante)

**2026-08-10 — casi todo RESUELTO por Leo Cardinale** (ver `docs/memoria/datos/geometria-sistema.md`):
- ✅ **kWp:** 1420 Wp por arreglo (4 × 355 Wp), 2840 Wp total, bifaciales
- ✅ **Tilt/azimut y mapeo:** PV1 = Inclinado (20°/150°) · PV2 = Vertical (90°/50°); Norte=0°, horario+
- ✅ **Constante de calibración:** no existe ("celda calibrada" = nombre comercial) → calibrar por clear-sky
- ✅ **Lat/lon:** la tiene Izack · ✅ **Timezone:** Costa Rica UTC−6

Único bloqueante restante (no bloquea San Carlos PV, solo el Comparador entre regiones):
- **Mapeo caja→sitio fino en AgroDash** (que cajas son Cartago y cuales San Carlos)

## AgroDash — region Cartago (no fusionar a nivel de datos)

`docs/_archivo/referencia_api_agrodash.pdf` (**DESACTUALIZADO**) documenta **AgroDash**. Realidad vigente (ver `docs/memoria/contexto-externo/agrodash.md` y `docs/memoria/datos/agrodash-esquema.md`): AgroDash es la **base de datos de la region Cartago** (PostgreSQL, app Rust/Axum) de sensores de **suelo/ambiente** (humedad, EC, temperatura, irradiancia, PAR) — **NO** fotovoltaica. A nivel de **almacenamiento** sigue separada de la Supabase PV de San Carlos (no se fusionan tablas), pero el **Agente Comparador SI la lee** y la data ambiental de San Carlos ya vive ahi (cajas con sufijo `SC`). Usar el esquema real (`docs/referencia/agrodash-control-schema.sql`), no el PDF.

## Herramientas recomendadas

- `pvlib-python` — modelos clear-sky para calibrar irradiancia
- `pvanalytics` — QC automatizado de datos solares
- `NASA POWER API` — datos satelitales de referencia
- `pandas` — resampleo y transformacion
- Destino final: **Supabase** (PostgreSQL)
