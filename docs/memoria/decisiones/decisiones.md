---
name: decisiones
description: Decisiones tomadas sobre limpieza (resampleo 5min, 85→NULL, offset→0, gaps, duplicados, schema destino)
categoria: decision
---

# Decisiones tomadas

| Decisión | Detalle | Vínculo |
|---|---|---|
| **Resampleo a 5 min** | mean para tasas, last para acumulados (intervalo más grueso) | [[muestreo-variable]] |
| **Temp 85.0 → NULL** | Error de sensor, no interpolar. Respaldado por AgroDash (−10…60 °C) | [[temperatura-85]], [[agrodash]] |
| **Irradiancia −38.845 → 0** | Es offset nocturno del piranómetro, no un valor real | [[irradiancia-sin-calibrar]] |
| **Calibración de irradiancia: pendiente** | Esperar lat/lon y modelo del piranómetro | [[bloqueantes]] |
| **Gaps largos: sin datos sintéticos** | 126 y 71 días → usar NASA POWER como referencia paralela | [[gaps-temporales]] |
| **Duplicados** | Exactos (mismo MD5) se eliminan; fragmentos `(N)` requieren decisión del usuario | [[duplicados]] |
| **Schema destino** | Superset de todas las variables; timestamp TIMESTAMPTZ al inicio; metadata de archivo/schema origen | [[schemas-multiples]] |

## Decisiones de implementación (2026-06-02)

| Decisión | Detalle | Vínculo |
|---|---|---|
| **Cero columnas quemadas** | Única fuente = `normalize.CONCEPT_MAP` (leyenda mínima slug→canónico). Schema canónico, tags, resampleo y DDL SQL se DERIVAN | [[implementacion]], [[schemas-multiples]] |
| **`slugify` normaliza variantes** | Acentos/unidades/mayúsculas colapsan solas → no se enumeran las ~70 variantes crudas | [[typos-headers]] |
| **DDL SQL generado** | `ddl.py` infiere tipos desde el schema canónico; `sql/001_schema.sql` es artefacto | [[implementacion]] |
| **Sin índice `timestamp::date`** | Postgres lo rechaza (no IMMUTABLE); la PK en timestamp ya da btree | [[implementacion]] |
| **Conexión Postgres directa** | psycopg + Session pooler (`postgres.<ref>`), NO el API REST. UPSERT masivo | [[implementacion]] |
| **CLI interactivo, un entrypoint** | `python3 main.py` → menú numerado, sin flags; dry-run exporta CSV (abrible) | [[implementacion]] |
| **Filas ragged se saltan** | `read_raw_csv` tolerante; separación fina (Paso 2) queda pendiente | [[filas-mezcladas]] |

Herramientas usadas: `pandas`, `psycopg`, `python-dotenv`, `pyarrow`; `pvlib`/
`pvanalytics` reservadas para la calibración (pendiente). Destino: **Supabase (PostgreSQL)**.
