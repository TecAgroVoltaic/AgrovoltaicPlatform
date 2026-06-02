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

Herramientas recomendadas: `pvlib-python`, `pvanalytics`, `NASA POWER API`, `pandas`.
Destino: **Supabase (PostgreSQL)**.
