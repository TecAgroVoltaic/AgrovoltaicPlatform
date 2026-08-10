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

Relacionado: [[bloqueantes]], [[decisiones]], [[respuestas-leo-cardinale]], [[geometria-sistema]], [[fuentes-fisicas]].
