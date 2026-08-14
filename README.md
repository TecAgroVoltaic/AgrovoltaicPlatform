# AgroVoltaic — plataforma de datos y agentes

Monorepo del sistema agrovoltaico de San Carlos: el **ETL de los CSV crudos** a Supabase,
dos **agentes LLM** (análisis histórico y pronóstico) y una **consola** para depurarlos.

> Contexto del problema, decisiones y estado: ver `CLAUDE.md` y `docs/memoria/INDEX.md`.

## Qué hay acá y cómo se levanta cada cosa

| Qué | Dónde | Cómo se corre |
|---|---|---|
| **ETL de CSV → Supabase** | raíz (`main.py`) | `python3 main.py` (menú interactivo) |
| **Agente de pronóstico** | `agente-pronostico/` | `python -m pronostico.cli "…"` · servicio: `uvicorn pronostico.api:app` |
| **Agente analizador** | `agente-analizador/` | `analizador` · servicio: `uvicorn analizador.api:app --port 8010` |
| **Consola de depuración** | `mvp-debugger/` | `./dev.sh` (todo local) · `./consola.sh` (contra la EC2) |
| **Ingesta AgroDash → Supabase** | `agente-pronostico/` | automática en la EC2 cada 15 min; a mano: `python -m pronostico.etl` |
| **Réplica local de AgroDash** | `agente-pronostico/scripts/` | `./agrodash_local.sh` (restaura el dump si falta) |

Cada carpeta tiene su README con el detalle. Lo que corre en producción está en la EC2
(`52.1.28.77`): dos contenedores de agentes, la réplica de AgroDash y dos temporizadores
systemd (`agente-pronostico/deploy/systemd/`).

## Tests y CI

```bash
cd agente-pronostico && pip install -e ".[dev,service]" && pytest -q   # 117 tests
cd agente-analizador && pip install -e ".[dev,service]" && pytest -q   #  24 tests
cd mvp-debugger      && npm ci && npm run build && ./scripts/smoke-auth.sh
```

Los tres corren en GitHub Actions en cada push y cada PR (`.github/workflows/ci.yml`).
Ninguno necesita credenciales ni red hacia Supabase: si un test empieza a pedirlas,
dejó de ser unitario.

## Salud del sistema

La ingesta y el gasto se miran sin entrar al servidor:

- `GET /salud/ingesta` — antigüedad de los datos por variable. **503** si están viejos.
- `GET /salud/panel` — lo anterior más errores recientes, gasto del día y última predicción.
- En la consola: sección **Salud del sistema**.

## El ETL de CSV

Pipeline **idempotente y escalable** que estandariza los CSV crudos (inversor +
piranómetros + sensores de temperatura) y los carga a **Supabase (PostgreSQL)**.
Soporta CSV nuevos sin tocar código: se sueltan en la carpeta del dataset y se
vuelve a correr.

### Estructura

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

## Pendiente

La geometría del sitio (lat/lon, kWp, tilt/azimut, timezone) quedó **resuelta** el
2026-08-10, así que la calibración de irradiancia y el Performance Ratio ya están
implementados — ver `docs/memoria/proyecto/implementacion.md`.

Sigue pendiente la **separación fina de filas mezcladas** (Paso 2): hoy se conservan
las filas que matchean el header del archivo. Estado completo en
`docs/memoria/proyecto/estado.md`.
