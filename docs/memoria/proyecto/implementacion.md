---
name: implementacion
description: Pipeline ETL implementado (paquete src/agrovoltaic) que estandariza los CSV y los carga a Supabase; corrió OK con 36.630 filas
categoria: proyecto
---

# Implementación del pipeline ETL

Implementado y **corrido con éxito el 2026-06-02**: 285 CSV → **36.630 filas** en la
tabla `monitoreo_agrovoltaic` de Supabase. Reemplaza el diseño de
`../TODO-Pipeline-Limpieza.md` (las fases sin bloqueo ya son código).

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
  parsear timestamp, clasificar fila `inversor|sensor`.
- `transform.py` — limpieza + resampleo a 5 min (todo vía tags, sin listas quemadas).
- `ddl.py` — **genera el DDL SQL** desde `CANONICAL_COLUMNS` (infiere tipos).
- `load.py` — UPSERT por `timestamp`. `state.py` — md5 en `_ingest_log`.
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

## Limpieza aplicada (decisiones ya codificadas)
temp 85.0 / fuera de rango → NULL · irradiancia offset −38.845 y negativos → 0 ·
potencia negativa → 0 · freq/vac fuera de rango → NULL · resampleo 5 min (mean
instantáneas, last acumuladores) + columnas `n_muestras`, `intervalo_original_seg`,
`tipo_fila`, `fuente_archivo`.

## Bugs reales corregidos en la primera corrida
1. `voltaje_vac`/`corriente_aac` sin identidad → CSV snake_case los tiraba como
   desconocidos. Resuelto con identidad automática de todo canónico.
2. 6 archivos de **filas mezcladas** reventaban el parser CSV → ahora `read_raw_csv`
   reintenta tolerante (conserva filas que matchean el header, loguea las saltadas).
3. Índice `timestamp::date` rechazado por Postgres (no IMMUTABLE) → eliminado; la PK
   en `timestamp` ya da el btree.

## Pendiente (no implementado)
- Separación fina de filas mezcladas (Paso 2): hoy se saltan las ragged.
- Calibración de irradiancia a W/m² (pvlib), Performance Ratio y features →
  bloqueado por [[bloqueantes]] (lat/lon, kWp, timezone, modelo de piranómetro).
- Notebook EDA (`notebooks/eda.ipynb`) hecho: valida la limpieza y explora patrones
  (cobertura, NULLs, distribuciones, correlación irradiancia↔potencia, perfil diario por
  mediana). Tests (`tests/`) aún vacíos.

Relacionado: [[estado]], [[objetivo]], [[decisiones]], [[bloqueantes]],
[[schemas-multiples]], [[filas-mezcladas]].
