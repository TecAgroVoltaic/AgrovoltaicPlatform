---
name: agrovoltaic2025-db
description: Observación/referencia — agrovoltaic2025.db (SQLite de Joshua); re-volcado crudo + 1 tabla unificada SIN limpiar; veredicto: no adoptar (nuestro pipeline es superior)
categoria: datos
---

# agrovoltaic2025.db (de Joshua) — observación/referencia

SQLite de 84 MB en la raíz del repo (`agrovoltaic2025.db`), hecho por **otro estudiante (Joshua)**
como intento de "normalización". Inspeccionado en solo-lectura el 2026-06-16. **No es producción.**

## Qué contiene (172 tablas)
- **~170 tablas = volcado 1-tabla-por-CSV** por fecha, **cargadas dos veces** (dos convenciones:
  `Monitoreo_2025-05-22` y `Monitoreo_2025_05_22`; `2024-11-10` y `2024_11_10`). Todo **TEXT**,
  sin limpiar; conserva los 13 schemas y los typos ([[schemas-multiples]]); varias vacías. = ruido.
- **`datos`** (32k filas): abandonada/vacía (`sensor`/`fecha`/`valor` todos NULL).
- **`monitoreo_agrovoltaico`** (29 cols, **112.581 filas**): la única tabla real; esquema target,
  tipada, timestamps **sin duplicados**, rango **2024-11-10 → 2026-05-28** (casi al día).

## Veredicto crítico
La tabla buena es un **merge de esquemas crudo, NO limpio** — todos los problemas siguen:
- Irradiancia sin calibrar: `irradiancia_incidente` −15.538…11.265, **19.687 negativos** ([[irradiancia-sin-calibrar]]).
- `albedo` máx **175** (imposible); error **temp=85** presente (`temp_inclinado` 17.525×85) ([[temperatura-85]]).
- Outliers absurdos (`potencia_pv1_w` 26 MW, inversor 291 °C); columnas muertas/duplicadas
  (`corriente_pv2_a_1` 100% NULL, doble `temperatura_inversor_*`); SP722 ~99.7% NULL; **no resampleada** (2 s).

**No adoptar.** Nuestro pipeline `src/agrovoltaic` ya produce datos **limpios y resampleados**
(36.630 filas en Supabase, ver [[estado]], [[implementacion]]) → es superior. Uso posible: solo
**cross-check** de cobertura/rango en ventanas solapadas. La fuente de verdad sigue siendo
nuestro pipeline → Supabase ([[arquitectura-regiones]]).

> El usuario gestiona personalmente el borrado de este `.db` (y de archivos `.sql`); no eliminar por cuenta propia.

Relacionado: [[arquitectura-regiones]], [[estado]], [[implementacion]], [[schemas-multiples]], [[irradiancia-sin-calibrar]], [[temperatura-85]].
