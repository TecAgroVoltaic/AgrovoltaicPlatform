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

## 2026-08-14 — las 6 tareas de confiabilidad del MVP, cerradas

| Tarea | Qué se hizo |
|---|---|
| Ingesta automatizada + frescura | El ETL fallaba en silencio hace 9 días (Cartago caído): corregido, fuente movida a una réplica del dump **en la EC2**, units versionados y `GET /salud/ingesta` |
| Auth en el mvp-debugger | `middleware.ts` con sesión firmada (Web Crypto, runtime Edge). **Falla cerrada** sin `DEBUGGER_PASSWORD` |
| Tope de gasto y rate-limit | Token bucket por identidad + tope diario leído de `gasto_diario` en el store |
| Tests de humo + CI | 3 jobs en GitHub Actions; analizador pasó de 0 a 24 tests |
| Observabilidad | Vistas `v_salud_ingesta`/`v_agente_errores` + panel "Salud del sistema" en la consola |
| Estados de error en la web | Las vistas ya no quedan en "cargando…" para siempre ante una respuesta inesperada |

Detalle en [[pipeline-tiempo-real]] y [[agrodash-local]]. 12 PRs.

**Próximo paso:** explorar AgroDash para el Agente Comparador ([[capa-agentes]]);
notebook EDA; atacar Paso 2 (filas mezcladas); calibración de irradiancia.

Relacionado: [[objetivo]], [[implementacion]], [[dataset-actual]], [[bloqueantes]].
