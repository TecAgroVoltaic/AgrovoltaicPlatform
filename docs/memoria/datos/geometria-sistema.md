---
name: geometria-sistema
description: Geometría y specs físicas del sistema San Carlos confirmadas por Leo (kWp por arreglo, tilt/azimut, mapeo PV1/PV2↔inclinado/vertical, bifacial); insumo para calibración clear-sky y Performance Ratio
categoria: datos
---

# Geometría del sistema fotovoltaico (San Carlos)

Confirmada por Leo Cardinale el **2026-08-10** (ver [[respuestas-leo-cardinale]]). Cierra los
bloqueantes de [[bloqueantes]] que impedían calibrar la irradiancia y calcular el Performance Ratio.

## Dos arreglos

| String | = Arreglo | Geometría | Potencia | Convención |
|---|---|---|---|---|
| **PV1** | Arreglo 1 = **Inclinado** | tilt **20°**, azimut **150°** | 4 × 355 Wp = **1420 Wp** | bifacial |
| **PV2** | Arreglo 2 = **Vertical**  | tilt **90°**, azimut **50°** (cara al norte) | 4 × 355 Wp = **1420 Wp** | bifacial |

- **Total instalado: 2840 Wp** (2 arreglos × 1420 Wp). Explica por qué picos de "26,5 MW" en los
  datos son imposibles: el sistema es de ~1–2 kW por string.
- **Azimut:** Norte = 0°, positivo en sentido de las manecillas del reloj (→ 150° ≈ Sur-Sureste;
  50° ≈ Nor-Noreste). Formato pvlib estándar (N=0, E=90, S=180, O=270).
- **Módulos:** 4 paneles de **355 Wp** por arreglo.
- **Bifaciales: SÍ** — el factor de bifacialidad (aporte de la cara trasera) se deja para un
  "análisis avanzado" posterior; no entra en el modelo base de producción esperada aún.

## Por qué importa (no invertir las comparaciones)

El diccionario decía "PV1 = arreglo 1 / PV2 = arreglo 2" pero **no** cuál era vertical y cuál
inclinado. Ahora fijo: **PV1 = Inclinado, PV2 = Vertical**. Cualquier comparación entre arreglos
(p. ej. producción vertical vs. inclinado) usa este mapeo o queda invertida.

## Ubicación del sitio (para clear-sky)

| Parámetro | Valor | Nota |
|---|---|---|
| Latitud | **10.33** | nivel ciudad (San Carlos / Ciudad Quesada, Alajuela) |
| Longitud | **−84.42** | |
| Altitud | **600 m** | afina la turbidez Linke (refinamiento opcional) |
| Timezone | **America/Costa_Rica** | UTC−6 fijo, sin horario de verano |

Fuente: `agente-pronostico/src/pronostico/config.py` (overrideable por `SITE_LAT`/`SITE_LON`/`SITE_ALT`/`SITE_TZ`).

## Uso en calibración

Con la lat/lon de arriba + estos tilt/azimut, el **modelo clear-sky (pvlib)** es el camino de
calibración de irradiancia — necesario porque **no existe constante de calibración guardada**
("celda calibrada" = nombre comercial, [[respuestas-leo-cardinale]]). El agente de pronóstico ya
usa este modelo (Ineichen + Linke climatológica, `agente-pronostico/src/pronostico/physics.py`);
la calibración reutiliza ese enfoque. Ver [[irradiancia-sin-calibrar]].

## Performance Ratio + bifacialidad (2026-08-10)

Primer cálculo de PR por arreglo (transposición GHI→POA por plano con pvlib, PR = (P_dc/1420 Wp)/(POA/1000)):

| Arreglo | PR frontal | PR bifacial (φ=0,80) | Ganancia trasera |
|---|---|---|---|
| PV1 inclinado | 0,72 | **0,62** | ~16 % |
| PV2 vertical  | 1,13 | **0,62** | ~94 % |

**Hallazgo:** con POA solo-frontal el vertical da **PR>1** (imposible) porque es **bifacial** y
capta ~94 % extra por la cara trasera (reflejo del suelo + sol por detrás). Al modelar la
bifacialidad (dos planos: frontal + φ·trasera, albedo medido), **ambos arreglos convergen a
PR ≈ 0,62** — validación física: mismos paneles/inversor/sitio → mismo PR intrínseco. La
convergencia ocurre en **φ ≈ 0,80**, lo que **estima empíricamente el factor de bifacialidad**
(a confirmar con datasheet). *Pendiente del equipo: factor de bifacialidad real y, para afinar la
POA trasera, geometría de filas (GCR/altura/pitch).*

Capa implementada: tabla `radiacion_sc_poa` (POA frontal + bifacial por arreglo, pvlib) + vista
`v_sc_performance` (`pr_pv1`, `pr_pv2`). Módulo `performance.py`. Ver [[implementacion]].

Relacionado: [[respuestas-leo-cardinale]], [[bloqueantes]], [[irradiancia-sin-calibrar]],
[[diccionario-variables]], [[metodologia]], [[implementacion]].
