# AgroVoltaic — ETL de Monitoreo a Supabase

Pipeline **idempotente y escalable** que estandariza los CSV crudos del sistema
agrovoltaico (inversor + piranometros + sensores de temperatura) y los carga a
**Supabase (PostgreSQL)**. Soporta CSV nuevos sin tocar codigo: se sueltan en la
carpeta del dataset y se vuelve a correr.

> Contexto del problema, decisiones y estado: ver `CLAUDE.md` y `docs/memoria/INDEX.md`.

## Estructura

```
main.py          # punto de entrada: python3 main.py (menu interactivo)
src/agrovoltaic/
  normalize.py   # slugify + CONCEPT_MAP -> genera el mapeo crudo→canonico
  schemas.py     # CANONICAL_COLUMNS + tags (infer_tags) + agg_method
  config.py      # paths, conexion, constantes de limpieza
  extract.py     # leer CSV, normalizar columnas, clasificar fila inversor|sensor
  transform.py   # limpiar (85→NULL, offset→0...) + resamplear a 5 min
  ddl.py         # generar el DDL SQL desde el schema canonico
  load.py        # UPSERT idempotente por timestamp
  state.py       # registro md5 de archivos ya procesados
  pipeline.py    # orquestar extract→transform→load
  cli.py         # menu interactivo (acciones del pipeline)
sql/schema.sql       # GENERADO (no editar a mano)
notebooks/eda.ipynb
```

## Setup

```bash
python3 -m venv env
source env/bin/activate          # Windows: env\Scripts\activate
pip install -r requirements.txt
```

Credenciales de Supabase (Settings → Database → Connection string → "Session pooler"):

```bash
cp .env.example .env
# editar .env y poner DATABASE_URL=...
```

## Uso

Un solo comando, menu interactivo:

```bash
python3 main.py
```

```
=== AgroVoltaic ETL ===
Opciones:
  1. Auditar dataset (cobertura de headers)
  2. Dry-run (procesar sin base de datos)
  3. Crear/actualizar tablas (generar sql/schema.sql)
  4. Subir tablas a Supabase (aplicar el DDL)
  5. Ver DDL en pantalla (solo muestra, no guarda)
  6. Cargar datos a Supabase (incremental)
  7. Cargar datos a Supabase (reprocesar TODO — vacía y recarga)
  0. Salir
```

Orden sugerido la primera vez: **1** (verificar que el dataset esta cubierto) →
**2** (validar la limpieza sin tocar la DB) → **3** (generar el DDL) →
**4** (crear las tablas en Supabase) → **6** (cargar datos).
Para CSV nuevos: soltarlos en la carpeta del dataset y repetir **6**.

## Verificación (notebook EDA)

Después de cargar los datos (opción **6**), abrí el notebook para verificar que quedaron sanos:

```bash
jupyter notebook notebooks/eda.ipynb   # o abrirlo en VSCode
```

`Restart Kernel` + `Run All`. Lee directo de Supabase (o `output/dry_run.csv` si no hay
`DATABASE_URL`) y en cada sección imprime un veredicto **OK / REVISAR** con su
interpretación: cobertura temporal, % NULL, distribuciones, correlación irradiancia↔potencia,
y un chequeo pasa/falla de la limpieza (temp 85 y negativos deben ser 0).

## Idempotencia / escalabilidad

- **Nivel archivo:** `_ingest_log` guarda el md5; `run` salta lo que no cambio.
- **Nivel fila:** `timestamp` es PRIMARY KEY con `ON CONFLICT DO UPDATE` → reprocesar
  nunca duplica.
- **CSV nuevo:** soltarlo en `dataset/Monitoreo-AgroVoltaic-SC-NEW/` y correr la opción 6.
- **Automatizar:** cron / GitHub Action que corra el pipeline.

## Pendiente (bloqueado por info del sitio)

Calibracion de irradiancia a W/m2 (pvlib), Performance Ratio y features derivados
esperan: lat/lon, kWp por string, timezone y modelo del piranometro. Ver
`docs/DUDAS-Pendientes.md`. La separacion fina de filas mezcladas (Paso 2) tambien
queda pendiente; hoy se conservan las filas que matchean el header del archivo.
