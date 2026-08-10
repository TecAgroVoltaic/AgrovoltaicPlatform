---
name: filas-mezcladas
description: Filas de distintas fuentes (inversor vs sensor) con distinto nº de columnas intercaladas en un mismo CSV
categoria: inconsistencia
---

# Filas de fuentes mezcladas (GRAVE)

En varios archivos, filas del inversor (17-22 cols) y filas solo-sensor (3-4 cols) se
intercalan en el mismo CSV. Esto corrompe los datos si se leen sin separar por tipo de fila:
valores de irradiancia caen en columnas como "Voltaje PV1".

**Evidencia en NEW (2026-06-01):** 8 archivos con filas de distinto nº de columnas:
`2024-12-25`, `2024-12-27`, `2024-12-28`, `2024-12-29`, `2025-05-20`, `2025-10-18`,
`2025-10-20`, `2025-10-30`.

> Desde mar-2026 el problema desaparece (todas las filas con nº de columnas consistente).

**Cómo corregirlo:** el equipo especificó el remapeo (los 3 valores del piranómetro → columnas
L/M/N y su timestamp → columna O; el resto en blanco) y dejó un par original/corregido como
ground-truth → [[correccion-filas-mezcladas]].

> **Respuesta oficial de Leo (2026-08-10, [[respuestas-leo-cardinale]] · P6/P7):** es un error que
> **Joshua ya trabajó**; algunos datos se recuperaron y otros quedaron con huecos — y **eso es lo
> recomendable**: recuperar lo que se pueda con la regla de remapeo y aceptar los huecos donde no.

Relacionado: [[schemas-multiples]], [[fuentes-fisicas]], [[correccion-filas-mezcladas]], [[respuestas-leo-cardinale]].
