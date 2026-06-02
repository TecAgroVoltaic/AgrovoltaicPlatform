---
name: gaps-temporales
description: Brechas largas sin datos (126 y 71 días) más gaps menores, incluido uno nuevo en may-2026
categoria: inconsistencia
---

# Gaps temporales

Brechas significativas sin ningún dato:

| Desde | Hasta | Días |
|---|---|---|
| 2024-12-29 | 2025-05-04 | **126** |
| 2025-06-26 | 2025-09-05 | **71** |
| 2024-11-21 | 2024-12-23 | 32 |
| 2025-09-05 | 2025-09-22 | 17 |
| 2024-11-12 | 2024-11-21 | 9 |

**Evidencia en NEW (2026-06-01):** persisten los históricos + nuevo mini-gap: faltan
**22, 23 y 24 de may-2026** (salta de 05-21 a 05-25).

Decisión: **no** generar datos sintéticos para los gaps largos; usar NASA POWER como
referencia paralela.

Relacionado: [[decisiones]], [[dataset-actual]].
