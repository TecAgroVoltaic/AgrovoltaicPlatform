---
name: typos-headers
description: Typos y variantes de acento en los headers (Energì grave, POTencia, Corriente PV2[A] sin espacio). Ninguno de los tres aparece en los 57 CSVs nuevos (2026-06-02 a 2026-08-31)
categoria: inconsistencia
actualizado: 2026-09-01
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

## Ninguno de los tres aparece en el dato nuevo (medido 2026-09-01)

En los **57 CSVs del 2026-06-02 al 2026-08-31** ([[dataset-actual]]) la cabecera es una sola, y dice
`Energia hoy [Wh]` / `Energia total [Wh]` (sin acento), `Corriente PV2 [A]` (con espacio) y
`Potencia total [Wac]` (sin la mayúscula errónea). Es la misma estandarización del logger que cortó
los 13 schemas ([[schemas-multiples]]).

Sigue siendo un hecho del **histórico**, que es donde el ETL tiene que seguir tolerándolos.

Relacionado: [[schemas-multiples]], [[dataset-actual]], [[decisiones]].
