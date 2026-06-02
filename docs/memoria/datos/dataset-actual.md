---
name: dataset-actual
description: Carpeta NEW con 285 CSVs (2024-11-10 a 2026-06-01); es OLD + 8 archivos nuevos, sin limpiar
categoria: datos
---

# Dataset actual

- **Carpeta activa:** `dataset/Monitoreo-AgroVoltaic-SC-NEW/` — **285 CSVs**.
- **Rango:** 2024-11-10 → 2026-06-01 (~19 meses).
- También existen `...-OLD/` (277 CSVs, snapshot anterior) y los `.zip` originales.

## NEW vs OLD
`NEW = OLD + 8 archivos nuevos` (2026-05-25 → 2026-06-01). **No se limpió nada**, solo se
agregó data reciente. Los 8 nuevos usan el schema más limpio (27 cols, con SP722), pero
arrastran las inconsistencias de fondo (irradiancia sin calibrar, SP722 casi siempre vacío).

## Verificación (2026-06-01)
NEW reproduce **todas** las inconsistencias documentadas en el EDA. Ver la carpeta
`inconsistencias/` — cada problema tiene su archivo con la evidencia contada en NEW.

Relacionado: [[fuentes-fisicas]], [[schemas-multiples]], [[gaps-temporales]].
