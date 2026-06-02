---
name: duplicados
description: Archivos con sufijo (N); algunos son duplicados exactos por MD5, otros son fragmentos parciales
categoria: inconsistencia
---

# Archivos duplicados y fragmentos `(N)`

Archivos con sufijo `(N)`: algunos son **duplicados exactos** (mismo MD5), otros son
**fragmentos parciales** o descargas fallidas (archivos diminutos de 1-2 filas).

**Evidencia en NEW (2026-06-01):**
- Duplicados exactos (mismo MD5): `Monitoreo_2024-12-23(1)` y `Monitoreo_2025-10-01(1)`.
- Fragmentos diminutos: `Monitoreo_2024-12-24(1..5)` (86-87 bytes, 1-2 filas cada uno).

Decisión: duplicados exactos se eliminan; los fragmentos `(N)` requieren decisión del usuario
(¿son de otro sensor, descargas parciales, pruebas?).

Relacionado: [[decisiones]], [[dataset-actual]].
