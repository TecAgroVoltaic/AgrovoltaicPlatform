---
name: geometria-sistema
description: Geometría y specs físicas del sistema San Carlos confirmadas por Leo (kWp por arreglo, tilt/azimut, mapeo PV1/PV2↔inclinado/vertical, bifacial); insumo para calibración clear-sky y Performance Ratio. 2026-08-30: Leo confirma el principio de trabajar con irradiancia por plano, pero la ecuación de transposición la define Hugo
categoria: datos
actualizado: 2026-08-30
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

Fuente: `agente-predictivo/src/predictivo/config.py` (overrideable por `SITE_LAT`/`SITE_LON`/`SITE_ALT`/`SITE_TZ`).

## Uso en calibración

Con la lat/lon de arriba + estos tilt/azimut, el **modelo clear-sky (pvlib)** es el camino de
calibración de irradiancia — necesario porque **no existe constante de calibración guardada**
("celda calibrada" = nombre comercial, [[respuestas-leo-cardinale]]). El Agente Predictivo ya
usa este modelo (Ineichen + Linke climatológica, `agente-predictivo/src/predictivo/physics.py`);
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

> ⚠️ **La convergencia queda EN REVISIÓN desde el 2026-08-28.** Los PR de arriba salieron de
> `v_sc_performance`, que unía potencia con POA **por timestamp exacto** y por eso conservaba
> **4.369 de 28.996 lecturas (15 %)**, con el 69 % de la muestra concentrada en octubre 2025 y
> mayo 2026. Al emparejar por bin de 5 min (19.482 pares) los PR **dejan de converger**:
> **PV1 = 0,664 · PV2 = 0,633**. El argumento de "ambos convergen, luego φ ≈ 0,80" se apoyaba en
> esa muestra sesgada, así que **no vale como está**. No dice que φ = 0,80 sea falso: dice que
> queda **sin validar**, y re-estimarlo con el emparejamiento corregido **no alcanza**, porque el
> argumento era además circular (ver la sección siguiente). Evidencia completa en
> [[emparejamiento-por-timestamp]]; la migración está escrita y **no aplicada**, a la espera de
> que Leo y Hugo confirmen.
>
> Segundo hallazgo del mismo día, y afecta a cualquier comparación entre arreglos: **el
> piranómetro está en horizontal**, así que comparar el vertical (90°) contra GHI le da pendiente
> **0,547** y contra su propia POA **0,906**. Cada arreglo se compara contra la irradiancia de su
> propio plano.

> **2026-08-30: Leo confirma el principio de la transposición, pero no la ecuación.**
> Preguntado si cada arreglo se compara contra la irradiancia de su propio plano, respondió:
> *"idealmente debemos trabajar para la radiacion en el plano, pero como lo que tenemos es
> radiacion horizontal, debemos aplicar un modelo matematico que hace el ajuste, entonces tendremos
> una radiacion para cada uno en particular. Sobre esto podrias consultar a Hugo cual ecuacion
> utilizar."*
>
> O sea que la POA por arreglo **es el camino correcto** y el segundo hallazgo del 2026-08-28 queda
> avalado. Lo que falta es **cuál modelo de transposición**: el nuestro es `pvlib` y **Hugo tiene
> que confirmarlo o cambiarlo** antes de publicar PR por arreglo. Único pendiente abierto de esa
> ronda ([[respuestas-lcv-consultas-agosto]], [[bloqueantes]]).
>
> La misma ronda cambió además la **unidad** del PR: pasa a ser **diario y mensual**, con los
> acumuladores de energía contra la radiación integrada del día. Los PR de la tabla de arriba
> (0,62 / 0,62) y los del emparejamiento por bin (0,664 / 0,633) son ambos **de la definición
> vieja**. ✅ **El PR con la definición nueva se calculó el 2026-08-31**
> ([[performance-ratio-diario]]): con POA bifacial da **PV1 0,648 contra PV2 0,612**, gana el
> inclinado, y es la **tercera metodología independiente** que llega a esa conclusión. Y confirma
> con el PR anual lo que esta nota dice de φ: el PR del **vertical se duplica** según se use POA
> frontal o bifacial (0,612 a 1,217, un 99 %) mientras que el del **inclinado se mueve un 14 %**,
> y su posición en el ranking depende enteramente de esa cantidad modelada (gana 46 días con POA
> bifacial y 163 con frontal). Que el 1,217 sea **imposible** prueba que el aporte trasero existe,
> y a la vez que **la mitad del denominador de PV2 no se midió**.

## Casi la mitad de la irradiancia del vertical es modelo, no medición (2026-08-28)

Medido sobre `radiacion_sc_poa`, promediando solo donde la frontal supera 100 W/m² (para no
contar la noche):

| Arreglo | POA frontal | POA efectiva | Aporte de la cara trasera |
|---|---|---|---|
| PV1 inclinado | 493,1 W/m² | 564,4 W/m² | **+15 %** |
| PV2 vertical | 201,2 W/m² | 398,3 W/m² | **+109 %** |

**En el arreglo vertical la cara trasera modelada aporta más que la frontal.** Casi la mitad de
su irradiancia efectiva no es una medición: es el resultado de aplicar φ y un albedo de suelo
supuesto.

**La consecuencia importa más que el valor exacto de φ.** El PR del vertical es casi
proporcionalmente sensible a ese factor y el del inclinado casi no lo es: un error del **10 % en
φ** mueve el PR del vertical alrededor de un **5 %** y el del inclinado un **0,7 %**. O sea que la
comparación vertical contra inclinado no descansa solo en el emparejamiento
([[emparejamiento-por-timestamp]]): descansa además en un modelo que **solo el vertical usa de
forma significativa**.

**Y por eso la validación vieja era circular.** Se tomaba como prueba de que φ estaba bien el
hecho de que los dos PR convergieran, cuando esa convergencia se conseguía **ajustando la
irradiancia del vertical con el propio φ**. El argumento se apoyaba en su propia conclusión.

**Estado: φ ≈ 0,80 queda SIN VALIDAR, no refutado.** No hay un número nuevo que lo reemplace. Lo
que sí queda establecido es que **hace falta una validación independiente**, porque la que había
no valía. Sigue siendo pendiente del equipo el factor de bifacialidad real (datasheet) y, para
afinar la POA trasera, la geometría de filas (GCR, altura, pitch).

Relacionado: [[respuestas-leo-cardinale]], [[respuestas-lcv-consultas-agosto]],
[[performance-ratio-diario]], [[bloqueantes]], [[irradiancia-sin-calibrar]],
[[diccionario-variables]], [[metodologia]], [[implementacion]],
[[emparejamiento-por-timestamp]].
