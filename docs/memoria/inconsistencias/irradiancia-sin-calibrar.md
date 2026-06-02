---
name: irradiancia-sin-calibrar
description: Irradiancia con valores negativos/irreales y offset constante −38.845; lecturas crudas sin calibrar a W/m2
categoria: inconsistencia
---

# Irradiancia sin calibrar

Los valores de irradiancia son físicamente imposibles en muchos registros (negativos, o
miles de W/m²). Parecen **lecturas crudas del sensor** (¿mV?) sin convertir a W/m². El valor
**−38.845008416418494** aparece constantemente como offset nocturno (no es irradiancia real).

**Evidencia en NEW (2026-06-01):**
- Offset exacto −38.845 en **205 archivos**.
- Mínimos de irradiancia hasta **−15.538**.
- Los 8 archivos nuevos (may-jun 2026) **siguen** con valores nocturnos negativos (~−38.8).
- Columnas **SP722 casi siempre vacías**; solo `2026-05-28` reporta lecturas.

Decisión: `−38.845 → 0`; calibración real pendiente hasta tener lat/lon y modelo del sensor.

Relacionado: [[bloqueantes]], [[decisiones]], [[fuentes-fisicas]].
