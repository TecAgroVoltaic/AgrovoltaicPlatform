# AgroVoltaic - Estandarizacion de Datos de Monitoreo

## Que es esto

Datos crudos de un sistema agrovoltaico (paneles solares + agricultura) recolectados durante ~19 meses (Nov 2024 - Jun 2026). Los datos vienen de 3 fuentes fisicas: un inversor solar de 2 strings (PV1 y PV2), piranometros (irradiancia incidente, reflejada y albedo; un segundo sensor SP722 desde May 2026), y sensores de temperatura DS18B20. El problema central es que **no hay un estandar de datos**: los CSV tienen 13 schemas distintos, columnas que aparecen/desaparecen, nombres inconsistentes, filas de distintos sensores mezcladas, y valores sin calibrar.

El objetivo es limpiar y estandarizar todo para insertarlo en **Supabase** mediante un **pipeline automatizado y permanente** (proceso reproducible e idempotente, NO un script de una sola vez), y eventualmente construir un dashboard con visualizacion, prediccion y agentes de IA.

## Punto de entrada: sistema de memoria

**Antes de trabajar, lee `docs/memoria/INDEX.md`.** El conocimiento del proyecto esta organizado como un sistema de archivos jerarquico (un tema por archivo, agrupado por carpeta, con frontmatter y enlaces `[[...]]`). El INDEX es el mapa maestro. Manten ese sistema actualizado cuando cambien hechos o decisiones.

```
docs/memoria/
  INDEX.md              ← mapa maestro (empieza aca)
  proyecto/             ← objetivo, estado
  datos/                ← fuentes fisicas, dataset actual
  inconsistencias/      ← un archivo por problema, con evidencia contada en NEW
  decisiones/           ← que decidimos y por que
  pendientes/           ← lo que bloquea (lat/lon, kWp, timezone, sensor)
  contexto-externo/     ← AgroDash (sistema aparte)
```

## Estado actual

- EDA exhaustivo completo: identifico los 13 schemas, los problemas de calidad y las brechas temporales
- Pipeline de limpieza priorizado (TODO) con 12 pasos en 6 fases — diseñado, NO implementado
- 17 preguntas pendientes para el equipo de campo (lat/lon, modelo de sensores, kWp, timezone)
- **Verificacion 2026-06-01:** la carpeta `NEW` (285 CSVs) reproduce TODAS las inconsistencias del EDA. Es `OLD + 8 archivos nuevos` (2026-05-25 a 2026-06-01), sin limpiar
- **No se ha escrito codigo de limpieza todavia** — fase de entendimiento y planificacion

## Estructura del proyecto

```
AgroVoltaic/
  CLAUDE.md                 ← este archivo
  dataset/
    Monitoreo-AgroVoltaic-SC-NEW/   ← CARPETA ACTIVA: 285 CSVs crudos (2024-11-10 a 2026-06-01)
    Monitoreo-AgroVoltaic-SC-OLD/   ← snapshot anterior (277 CSVs), referencia
    *.zip                           ← descargas originales
  docs/
    memoria/                        ← SISTEMA DE MEMORIA (empezar por INDEX.md)
    EDA-Monitoreo-AgroVoltaic.md    ← analisis exploratorio completo
    TODO-Pipeline-Limpieza.md       ← pipeline de 12 pasos con mapeos de schemas
    DUDAS-Pendientes.md / .pdf      ← 17 preguntas que bloquean decisiones
    ObjetivosProyecto.md            ← plan de trabajo de la pasantia (contexto academico)
    referencia_api_agrodash.pdf     ← contexto de AgroDash (SISTEMA APARTE, no combinar)
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

- Resamplear todo a 5 minutos (el intervalo mas grueso) con mean para rates y last para acumulados
- Temperaturas de 85.0 → NULL (no interpolar, marcar como error de sensor). Respaldado por AgroDash (su API solo acepta -10..60 C)
- Irradiancia -38.845 → 0 (offset nocturno)
- Calibracion de irradiancia pendiente hasta tener lat/lon y modelo del piranometro
- No generar datos sinteticos para los gaps largos (126 y 71 dias) — usar NASA POWER como referencia paralela
- Archivos duplicados exactos se eliminan; los fragmentos `(N)` requieren decision del usuario
- La carga a Supabase debe ser un pipeline automatizado/idempotente, no un proceso temporal

## Informacion pendiente (bloqueante)

Estas preguntas bloquean la calibracion de irradiancia y el calculo de Performance Ratio:
1. **Lat/lon** del sitio
2. **kWp instalados** (total y por string)
3. **Timezone** de los timestamps — SIN CONFIRMAR. El `CLAUDE.md` asumia UTC-4 Bolivia; AgroDash usa UTC-6 Costa Rica pero es otro sistema, asi que no lo resuelve. Conflicto abierto para el equipo de campo
4. **Modelo del piranometro pre-2025** (el reciente es SP722)

## AgroDash — sistema APARTE (no combinar)

`docs/referencia_api_agrodash.pdf` documenta **AgroDash**, un dashboard YA en produccion (Rust+Axum+PostgreSQL) de **sensores agronomicos/de suelo** (humedad, ec, potencial, polinomial, calibrada, temperatura). Es un sistema hermano pero **completamente separado**: NO se fusiona con la data fotovoltaica. El PDF es solo contexto general de referencia, NO una guia a seguir. Ver `docs/memoria/contexto-externo/agrodash.md`.

## Herramientas recomendadas

- `pvlib-python` — modelos clear-sky para calibrar irradiancia
- `pvanalytics` — QC automatizado de datos solares
- `NASA POWER API` — datos satelitales de referencia
- `pandas` — resampleo y transformacion
- Destino final: **Supabase** (PostgreSQL)
