---
name: estado
description: Pipeline ETL implementado y corrido OK (36.630 filas en Supabase); falta calibración de irradiancia (bloqueada) y separación fina de filas mezcladas
categoria: proyecto
---

# Estado actual

**Actualizado 2026-06-02.** El pipeline está implementado y corrió con éxito.

| Fase | Estado |
|---|---|
| EDA exhaustivo | ✅ Hecho (`../EDA-Monitoreo-AgroVoltaic.md`) |
| Pipeline de limpieza (diseño) | ✅ Definido (`../TODO-Pipeline-Limpieza.md`) |
| Código de limpieza | ✅ Implementado (`src/agrovoltaic/`), ver [[implementacion]] |
| Carga a Supabase | ✅ Corrió: 285 CSV → 36.630 filas en `monitoreo_agrovoltaic` |
| Separación fina de filas mezcladas (Paso 2) | ⬜ Pendiente (hoy se saltan las ragged) |
| Calibración de irradiancia / Performance Ratio | ⬜ Bloqueado por [[bloqueantes]] |
| EDA notebook + tests | ⬜ Vacíos |
| Dashboard / predicción / IA | ⬜ Futuro |

**Próximo paso:** notebook EDA + tests; atacar Paso 2; desbloquear calibración con
lat/lon, kWp, timezone y modelo de piranómetro.

Relacionado: [[objetivo]], [[implementacion]], [[dataset-actual]], [[bloqueantes]].
