---
name: cuota-store-supabase
description: El store de Supabase está al 79% del Free tier (395 de 500 MB) y lecturas_ambientales_sc se lleva el 89%; pasarse deja el proyecto en solo-lectura
categoria: proyecto
---

# Cuota del store (Supabase Free tier)

**Medido 2026-08-18** sobre `jijklguopafevyucogro`: **395 MB de los 500** del plan Free (79 %).

| Tabla | Tamaño | Filas | Peso |
|---|---:|---:|---:|
| `lecturas_ambientales_sc` | 353 MB | 885.606 | **89 %** |
| `radiacion_sc_15s` | 11 MB | 94.868 | 3 % |
| `monitoreo_sc_electrico` | 7,8 MB | 36.469 | 2 % |
| `radiacion_sc_clearsky` | 6,2 MB | 94.868 | 2 % |
| `radiacion_sc_poa` | 5,1 MB | 56.450 | 1 % |
| resto (`agente_log`, `predicciones`, `_ingest_log`, `diccionario_variables`, `gasto_diario`) | ~1,6 MB | — | <1 % |

Casi todo el consumo es **la ingesta ambiental que viene de AgroDash**, no el histórico
fotovoltaico propio (que suma ~30 MB entre todas sus tablas y vistas).

## Por qué importa

Superar el límite del Free tier deja el proyecto en **solo-lectura**. Eso no degrada: **rompe**
la escritura del ETL (`lecturas_ambientales_sc`), la del forecaster (`predicciones`) y la del
control de gasto (`gasto_diario`). Con ~105 MB de margen, cualquier backfill grande lo revienta.

## Lo que ya se dejó fuera por esta razón

- **Humedad de suelo completa:** ~936.295 filas ≈ **375 MB**. No cabe. Por eso existe el flag
  `--variable` del ETL: `--full` sin filtro habría arrastrado ambas variables y reventado la cuota
  ([[agrodash-local]]).
- **El dump entero de AgroDash:** 5.046 MB, **10× el límite**. Nunca fue opción; la vía correcta
  es leer la réplica local y subir solo los targets de San Carlos ([[arquitectura-regiones]]).

## Decisión pendiente

Ninguna de estas está tomada; la cuota se esquivó, no se resolvió:

1. **Subir de plan** (Pro, 8 GB) — resuelve de raíz, cuesta dinero.
2. **Podar o aplicar retención** a `lecturas_ambientales_sc` (p. ej. mantener resolución fina solo
   de los últimos N meses y agregados hacia atrás).
3. **Mover la ingesta ambiental fuera de Supabase**, dejando ahí solo el histórico PV y los
   agregados que consumen los agentes.

## Cómo medirlo

```sql
select pg_size_pretty(pg_database_size(current_database()));
select c.relname, pg_size_pretty(pg_total_relation_size(c.oid))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc;
```

Relacionado: [[agrodash-local]], [[pipeline-tiempo-real]], [[arquitectura-regiones]], [[estado]].
