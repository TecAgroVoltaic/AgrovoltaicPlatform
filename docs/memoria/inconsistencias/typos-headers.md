---
name: typos-headers
description: Typos y variantes de acento en los headers (Energì grave, POTencia, Corriente PV2[A] sin espacio)
categoria: inconsistencia
---

# Typos en los headers

Errores tipográficos y variantes de acento/espaciado en los nombres de columna, señal de que
distintas personas editaron la configuración con distintos encodings.

**Evidencia en NEW (2026-06-01):**
- `Energì` (acento grave, en vez de agudo/sin acento) → **72 archivos**.
- `POTencia` (mayúscula errónea) → **2 archivos**.
- `Corriente PV2[A]` (sin espacio antes de `[A]`) → **5 archivos**.

El acento en "Energia" alterna entre grave (ì), agudo (í) y sin acento. Hay además dos columnas
"Corriente PV2" (con y sin espacio) para lo mismo.

Relacionado: [[schemas-multiples]], [[decisiones]].
