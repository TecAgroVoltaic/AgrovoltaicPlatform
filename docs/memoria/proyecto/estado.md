---
name: estado
description: Pipeline ETL implementado y corrido OK (36.630 filas en Supabase); falta calibración de irradiancia (bloqueada) y separación fina de filas mezcladas
categoria: proyecto
---

# Estado actual

**Actualizado 2026-06-02.** El pipeline está implementado y corrió con éxito.

| Fase | Estado |
|---|---|
| EDA exhaustivo | ✅ Hecho (`../../referencia/EDA-Monitoreo-AgroVoltaic.md`) |
| Pipeline de limpieza (diseño) | ✅ Definido (`../../referencia/TODO-Pipeline-Limpieza.md`) |
| Código de limpieza | ✅ Implementado (`src/agrovoltaic/`), ver [[implementacion]] |
| Carga a Supabase | ✅ Corrió: 285 CSV → 36.630 filas en `monitoreo_agrovoltaic` |
| Copia local de AgroDash (Cartago) | ✅ Dump de `control` descargado 2026-06-30 → `sql/dump/agrodash_control_2026-06-30.dump` (609 MB) — ver [[agrodash]] |
| Restaurar dump AgroDash (entorno de pruebas) | ✅ Corriendo en `izack-rig` (Docker `agrodash-pg`, Tailscale `100.100.130.47:5432`, DB `agrodash_control`, 21.3M filas) — ver [[agrodash]] |
| Explorar AgroDash para el Comparador | ⬜ Pendiente (ya consultable, ver [[capa-agentes]]) |
| Separación fina de filas mezcladas (Paso 2) | ⬜ Pendiente (hoy se saltan las ragged) |
| Calibración de irradiancia / Performance Ratio | ⬜ Bloqueado por [[bloqueantes]] |
| EDA notebook + tests | ⬜ Vacíos |
| Dashboard / predicción / IA | ⬜ Futuro |

**Próximo paso:** restaurar el dump de AgroDash y explorarlo para el Agente Comparador
([[agrodash]], [[capa-agentes]]); notebook EDA + tests; atacar Paso 2; desbloquear calibración
con lat/lon, kWp, timezone y modelo de piranómetro.

Relacionado: [[objetivo]], [[implementacion]], [[dataset-actual]], [[bloqueantes]].
