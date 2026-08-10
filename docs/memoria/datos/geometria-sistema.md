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

## Uso en calibración

Con lat/lon del sitio (Izack la tiene, [[bloqueantes]]) + estos tilt/azimut, el **modelo
clear-sky (pvlib)** es viable como camino de calibración de irradiancia — necesario porque **no
existe constante de calibración guardada** ("celda calibrada" = nombre comercial, [[respuestas-leo-cardinale]]).
Ver [[irradiancia-sin-calibrar]].

Relacionado: [[respuestas-leo-cardinale]], [[bloqueantes]], [[irradiancia-sin-calibrar]],
[[diccionario-variables]], [[metodologia]].
