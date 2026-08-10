---
name: schemas-multiples
description: 13 schemas distintos con nombres de columna inconsistentes (cortos, largos, snake_case) entre épocas
categoria: inconsistencia
---

# Schemas múltiples / nombres inconsistentes

13 schemas distintos a lo largo del tiempo. La misma variable física tiene varios nombres:
`vpv1` / `Voltaje PV1 [V]` / `voltaje_pv1_v`. Columnas aparecen y desaparecen entre épocas
(PV2, Frecuencia, Energía total, Temp inversor, código error, irradiancia reflejada, albedo).

**Evidencia en NEW (2026-06-01):** 12 headers exactos distintos coexisten. Los 8 archivos
nuevos usan el schema más limpio (27 cols, con SP722), pero el histórico mantiene toda la
heterogeneidad.

Mapeo completo de los 13 schemas por período: `../../referencia/EDA-Monitoreo-AgroVoltaic.md` §2 y §8.

Relacionado: [[typos-headers]], [[filas-mezcladas]], [[decisiones]].
