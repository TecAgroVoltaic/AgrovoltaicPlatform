---
name: implementacion
description: Pipeline ETL implementado (paquete src/agrovoltaic) que estandariza los CSV y los carga a Supabase; corrió OK con 36.630 filas
categoria: proyecto
---

# Implementación del pipeline ETL

Implementado y corrido OK el 2026-06-02 (285 CSV → 36.630 filas en `monitoreo_agrovoltaic`).

> **⚠️ Rediseño 2026-08-10 (v0.2) — validado con Leo Cardinale** ([[respuestas-leo-cardinale]]).
> Cambio de fondo: **el crudo se guarda tal cual; la corrección vive en vistas SQL**. El modelo
> pasó de **1 tabla transformada** a **2 tablas crudas + 2 vistas de corrección**:
> - `monitoreo_sc_electrico` (5 min, crudo) · `radiacion_sc_15s` (15 s, crudo, base aparte)
> - `v_sc_electrico_corregido` · `v_sc_radiacion_corregida` (aplican temp 85/rango, offset, límites, pre-2025 inválida)
> - `diccionario_variables` (definiciones, Leo P1)
>
> **Estado (2026-08-10): APLICADO Y CARGADO en la Supabase real `jijklguopafevyucogro`.**
> DDL por MCP (migraciones `agrovoltaic_v2_crudo_electrico_radiacion` +
> `agrovoltaic_v2_views_security_invoker`) y ETL por el pipeline (psycopg): **36.469 filas
> eléctricas / 94.868 de radiación** (0 fallos; los 36.614/95.521 enviados se dedupean por PK
> timestamp). Crudo verificado en DB (temp=85 en 12.174 filas, pico 26,5 MW, offset −38.845 en
> 3.198); vistas OK (temp=85→0, potencia máx 1.603 W, irrad<0→0). Vistas con `security_invoker=on`.
> La tabla vieja `monitoreo_agrovoltaic` quedó vacía → **se puede borrar**. DDL en `sql/schema.sql`.
> **Pendiente de decisión:** RLS (deshabilitado en todas las tablas públicas del proyecto).

## Entrada / ejecución
- Punto de entrada único: `python3 main.py` (agrega `src/` al path, no requiere instalar).
- **Menú interactivo numerado** (sin flags): auditar · dry-run · generar DDL · subir
  tablas a Supabase · ver DDL · cargar datos (incremental / reprocesar todo).
- Entorno: venv `env/`, deps en `requirements.txt` (pandas, numpy, psycopg, pvlib,
  pvanalytics, pyarrow, python-dotenv). Python 3.14.
- Conexión Supabase: `DATABASE_URL` en `.env` (Session pooler, usuario
  `postgres.<ref>`). NO usa el API REST/PostgREST.

## Estructura (`src/agrovoltaic/`)
- `normalize.py` — **corazón escalable**. `slugify()` normaliza acentos/unidades/
  mayúsculas → colapsa las ~70 variantes crudas solo. `CONCEPT_MAP` = leyenda mínima
  slug→canónico (1 entrada por concepto, irreducible: el dataset no trae diccionario).
- `schemas.py` — `CANONICAL_COLUMNS` derivado de `CONCEPT_MAP`; `infer_tags()` deriva
  etiquetas del nombre; `agg_method()` decide resampleo por etiqueta.
- `extract.py` — leer CSV (tolerante a filas ragged), normalizar columnas, tipar,
  parsear timestamp. (El `classify_rows` viejo se removió: el split ahora es por columnas.)
- `transform.py` — **v0.2:** `split_streams()` separa eléctrico/radiación por columnas;
  resamplea eléctrico a 5 min y radiación a 15 s. **SIN limpieza** (el crudo se conserva).
- `ddl.py` — **genera 2 tablas + 2 vistas de corrección + diccionario** desde tags/config.
  `correction_expr()` deriva el SQL de cada corrección (cero columnas quemadas).
- `load.py` — UPSERT por `timestamp` en cada tabla (`upsert_electrico`/`upsert_radiacion`).
  `state.py` — md5 en `_ingest_log`.
- `pipeline.py` — orquesta extract→transform→load. `cli.py` — menú. `config.py` — paths/conexión/constantes.

## Principio de diseño: cero columnas quemadas
Única fuente irreducible = `normalize.CONCEPT_MAP`. Todo lo demás se deriva:
`CANONICAL_COLUMNS`, tags, método de resampleo, columnas de inserción y el **DDL SQL**
(`sql/001_schema.sql` es artefacto generado). Columna nueva = 1 línea en `CONCEPT_MAP`
→ entra sola al schema, la tabla y el resampleo. Variante de ortografía nueva del
mismo concepto → la reconoce `slugify` sin tocar código.

## Idempotencia / escalabilidad
- **Nivel archivo:** `_ingest_log` (md5) → salta CSV sin cambios.
- **Nivel fila:** PK `timestamp` + `ON CONFLICT DO UPDATE` → reprocesar no duplica.
- CSV nuevo: soltarlo en la carpeta y correr "cargar incremental".

## Corrección (v0.2: en vistas, no in-place)
El crudo entra sin tocar. Las vistas `v_*_corregido` aplican (parámetros en `config.py`):
- **Eléctrico:** temp `=85` o fuera de `[10,80]`→NULL; potencia fuera de `[0,5000]`→NULL;
  voltaje string `[0,600]`; corriente string `[0,20]`; frecuencia `[55,65]`; vac `[100,280]`.
- **Radiación:** offset `−38.845`→0, negativos→0, **timestamp < 2025-07-01 → NULL** (Leo P12,
  irradiancia temprana inválida) + bandera `valido`. Sigue **sin calibrar a W/m²** (falta clear-sky).
- Metadata por fila: `n_muestras`, `intervalo_original_seg`, `fuente_archivo` (ya no `tipo_fila`).

## Bugs reales corregidos en la primera corrida
1. `voltaje_vac`/`corriente_aac` sin identidad → CSV snake_case los tiraba como
   desconocidos. Resuelto con identidad automática de todo canónico.
2. 6 archivos de **filas mezcladas** reventaban el parser CSV → ahora `read_raw_csv`
   reintenta tolerante (conserva filas que matchean el header, loguea las saltadas).
3. Índice `timestamp::date` rechazado por Postgres (no IMMUTABLE) → eliminado; la PK
   en `timestamp` ya da el btree.

## Pendiente (no implementado)
- **Aplicar el DDL v0.2 + cargar** a la Supabase real (`jijklguopafevyucogro`): reconectar el MCP
  (apuntaba a otra cuenta) y correr "reprocesar TODO". Los CSV se re-inflan desde
  `dataset/Monitoreo-AgroVoltaic-SC-NEW.zip` (la carpeta se borró del working tree en esta rama).
- Separación fina de filas mezcladas (Paso 2): hoy se saltan las ragged (Leo P6/P7: recuperar lo
  posible como Joshua, aceptar huecos). → spec y par ground-truth en [[correccion-filas-mezcladas]].
- **Calibración de irradiancia a W/m² (pvlib) — ya DESBLOQUEADA:** no hay constante guardada, se
  hace por clear-sky con lat/lon + tilt/azimut de [[geometria-sistema]]. Se aplicará como columna
  `*_wm2` sobre `v_sc_radiacion_corregida`. Performance Ratio habilitado (kWp conocido).
- Notebook EDA (`notebooks/eda.ipynb`) hecho: valida la limpieza y explora patrones
  (cobertura, NULLs, distribuciones, correlación irradiancia↔potencia, perfil diario por
  mediana). Tests (`tests/`) aún vacíos.

Relacionado: [[estado]], [[objetivo]], [[decisiones]], [[bloqueantes]],
[[schemas-multiples]], [[filas-mezcladas]].
