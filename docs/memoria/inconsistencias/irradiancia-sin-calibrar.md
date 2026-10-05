---
name: irradiancia-sin-calibrar
description: Irradiancia con valores negativos/irreales y offset constante −38.845; lecturas crudas sin calibrar a W/m2. Sigue vivo en el dato nuevo (2026-09-01): picos de 1.464 W/m2 y 102 días con kt imposible. Y el SP722 vuelve a ser candidato a calibración, porque su ventana ya no son 18 días sino casi cuatro meses
categoria: inconsistencia
actualizado: 2026-09-01
---

# Irradiancia sin calibrar

Los valores de irradiancia son físicamente imposibles en muchos registros (negativos, o
miles de W/m²). Parecen **lecturas crudas del sensor** (¿mV?) sin convertir a W/m². El valor
**−38.845008416418494** aparece constantemente como offset nocturno (no es irradiancia real).

**Evidencia en NEW (2026-06-01):**
- Offset exacto −38.845 en **205 archivos**.
- Mínimos de irradiancia hasta **−15.538**.
- Los 8 archivos nuevos (may-jun 2026) **siguen** con valores nocturnos negativos (~−38.8).
- Columnas **SP722 casi siempre vacías**: en los CSV solo `2026-05-28` reporta lecturas. Medido
  contra producción el **2026-08-28**, el sensor entero vivió del **2026-05-11 al 2026-05-28**:
  **360 lecturas en 18 días**, y paró tres días antes que el resto del sistema. Ver
  [[fuentes-fisicas]].
- El canal de **reflejada** (y con él el **albedo**) **no existe antes del 2025-10-25**: el
  piranómetro de reflejada se instaló mucho después que el de incidente (medido en producción,
  2026-08-28). Todo análisis de albedo tiene **7 meses de ventana, no 19**.

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

⚠️ **Matiz medido el 2026-08-28 (consulta directa a producción).** Lo que dijo Leo es cierto y se
queda, pero en el proyecto se leyó como "desde mayo 2026 hay SP722". ~~No lo hay: arrancó el
2026-05-11, se detuvo el 2026-05-28 y dejó 360 lecturas.~~ **Corregido el 2026-09-01: sí lo hay.**
El sensor volvió el **2026-06-03** y son **8.984 lecturas hasta el 2026-08-31**. Ver
[[fuentes-fisicas]].

## Sigue vivo en el dato nuevo, y el SP722 vuelve al juego (2026-09-01)

Con los 57 CSVs del 2026-06-02 al 2026-08-31 ingestados ([[dataset-actual]]):

| Hecho | Medida |
|---|---|
| Pico de irradiancia en los CSV nuevos | **1.464,46 W/m²** (2026-07-21 13:25) |
| Días con `kt_imposible` en el histórico ya recalculado | **102** |

**1.464 W/m² no es físicamente posible en San Carlos**, ni siquiera con reflexión de nubes: la
constante solar en el tope de la atmósfera son ~1.361 W/m². O sea que **la irradiancia sin calibrar
no es un problema del histórico viejo**, se sigue manifestando en el dato que llegó esta semana, y
el descarte de "todo lo pre-mediados-2025" no alcanza para taparlo.

Los **102 días con kt imposible** vienen de `cielo_diario`, que pasó de 228 a **285 días**
caracterizados con el recorrido completo ([[regla-post-carga]]). El diagnóstico de fondo no cambia
y se refuerza: **kt > 1,2 en más de un tercio de los días caracterizados dice algo sobre la
calibración, no sobre el cielo** ([[agente-historico-calidad]]).

### El SP722 vuelve a ser candidato a calibración

Se había descartado **por ventana insuficiente** (18 días, 360 lecturas). Esa ventana era falsa:
son **casi cuatro meses**, del 2026-05-11 al 2026-08-31, y en los CSV crudos nuevos **8.636 de
8.822 filas** traen sus cuatro columnas con valor.

Con ese solape ya se puede: comparar `irradiancia_incidente` contra `Irradiancia_incidente_SP722`
(que viene declarado en W/m² por el propio nombre de la columna) sobre el mismo período, y ver si
la relación es una constante, una recta con offset o nada. **Es una segunda vía de calibración
independiente del clear-sky**, que es exactamente lo que no teníamos. El pendiente reabierto está
en [[abiertos]]; la corrección al equipo, en [[correccion-al-equipo]].

⚠️ **No es una promesa de que funcione.** El SP722 puede estar tan descalibrado como el otro, y
nadie ha comparado los dos todavía. Lo que cambió es que **el argumento para no intentarlo
desapareció**.

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

Relacionado: [[bloqueantes]], [[abiertos]], [[dataset-actual]], [[correccion-al-equipo]],
[[regla-post-carga]], [[decisiones]], [[respuestas-leo-cardinale]], [[geometria-sistema]],
[[fuentes-fisicas]], [[agente-historico-calidad]], [[implementacion]],
[[silencio-leido-como-salud]].
