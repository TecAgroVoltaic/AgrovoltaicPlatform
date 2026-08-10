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

Decisión previa (SUPERADA): `−38.845 → 0` in-place.

> **Respuesta oficial de Leo (2026-08-10, [[respuestas-leo-cardinale]] · P4/P5/P11/P12):**
> - El offset negativo constante es **normal/esperado** en este equipo: asunto de **calibración
>   (exactitud)** y, en los analógicos, **ruido eléctrico**. → **dejar el crudo**, corregir en
>   análisis con una **variable corregida nueva**.
> - **No hay constante de calibración guardada.** "Celda calibrada" es solo el **nombre comercial**
>   del producto — el dato **no** viene escalado a W/m². → calibrar por **modelo clear-sky (pvlib)**
>   usando lat/lon + tilt/azimut de [[geometria-sistema]].
> - **Datos tempranos inválidos:** hubo un error en la medición de irradiancia en los primeros
>   meses, **corregido a mediados de 2025** → descartar lo anterior. **SP722** recién arrancó en
>   **mayo 2026** (por eso sus columnas están casi siempre vacías).

## Calibración clear-sky — HALLAZGO (2026-08-10)

Primer pase de calibración con pvlib (Ineichen, lat/lon de [[geometria-sistema]]) sobre los
57.043 puntos **válidos** (post 2025-07-01):

- **El período válido YA está en W/m².** Factor de escala empírico **k ≈ 0,98 (≈ 1,0)**: la cruda
  coincide con el clear-sky GHI en días despejados (p. ej. 2026-04-19: cruda 900 vs teórico 994 a
  mediodía). Confirma a Leo (P12): el error se corrigió a mediados de 2025 y desde entonces la
  celda entrega W/m². La escala solo faltaba **pre-mediados-2025** (ya descartado por la vista).
- Distribución de **kt\*** = medido/clear-sky sana (mediana 0,41 por tardes nubladas del trópico;
  p95 = 0,99 → los momentos claros llegan al clear-sky). La celda parece medir en **plano
  horizontal (GHI)**.
- Lo que quedaba no era escala sino **outliers**: spikes hasta ~5.900 W/m² (~1% con kt*>1,2), ruido
  eléctrico → se marca con `qc_ok` en la vista de calibración.

**Capa de calibración implementada** (regla de Leo: crudo intacto, derivados en análisis):
`radiacion_sc_clearsky` (cs_ghi_wm2 por timestamp, pvlib) + vista `v_sc_radiacion_calibrada`
(`irradiancia_*_wm2`, `cs_ghi_wm2`, `kt_star`, `qc_ok`). Módulos `clearsky.py` + `calibracion.py`.
Escala = 1,0. **OJO timezone:** los timestamps almacenados son hora local CR guardada como UTC →
se reinterpretan a `America/Costa_Rica` antes de pvlib.

Relacionado: [[bloqueantes]], [[decisiones]], [[respuestas-leo-cardinale]], [[geometria-sistema]], [[fuentes-fisicas]], [[implementacion]].
