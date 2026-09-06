---
name: catalogo-metricas-evaluacion
description: Catálogo de métricas que hay que calcular sobre los datos de San Carlos, según el doc de evaluación de datos de Leonardo Cardinale (2026-08-28); los 9 KPIs del dashboard con sus definiciones textuales, los 7 ejes de análisis energético con lo que el doc marca "más adelante" o "no tenemos", y las preguntas de investigación abiertas
categoria: datos
actualizado: 2026-08-31
tags: [metricas, kpi, analisis-energetico, evaluacion-datos, agente-historico]
---

# Catálogo de métricas a calcular (doc de evaluación de datos, 2026-08-28)

Destilado de `Evaluación de datos.pdf` (raíz del repo), *Definición de evaluación de datos
de proyecto Agrivoltaic*, de **Leonardo Cardinale Villalobos**, 2026-08-28. El equipo lo
llama "el doc de Hugo". Sustituye y amplía la versión `.docx` que ya estaba destilada en
[[evaluacion-datos]].

**Esto es la especificación funcional de los algoritmos** que se construyen antes del agente
(ver [[algoritmos-antes-que-agente]]). Las pruebas de calidad van aparte, en
[[pruebas-calidad-umbrales]]; los gráficos, en [[graficos-evaluacion]].

Notebook de referencia del autor (Colab):
https://colab.research.google.com/drive/1pvvlb1-og8nc04ffFB3F_VLT6w0ttuCa?usp=sharing

> **Regla transversal:** todo se calcula sobre un **rango de fechas provisto por el usuario**.
> El rango es parámetro de primera clase de cada algoritmo, no un filtro que se agrega después.

> **Estado 2026-08-28 (mismo día, más tarde): los algoritmos ya existen.** Este archivo dejó de
> ser solo especificación. La capa está construida (13 módulos de analítica, 23 tools, 10
> endpoints): ver [[capa-analitica]]. Lo que falta son **las vistas** que los presentan
> ([[consola-analitica]], [[graficos-evaluacion]]).
>
> **2026-08-31: el eje 1 tiene respuesta.** Con el método de Leo, **gana el arreglo inclinado**
> (POA bifacial 0,648 contra 0,612; GHI horizontal 0,733 contra 0,517, ganando los diez meses), y
> es la tercera metodología independiente que lo dice → [[performance-ratio-diario]]. Lo de abajo
> es la historia de cómo se llegó ahí.
>
> **Y el eje 1 cambió de resultado.** El Performance Ratio se estaba calculando sobre un cruce por
> timestamp exacto que conservaba el 15 % de la muestra, concentrada en dos meses. Con el
> emparejamiento corregido **gana el arreglo inclinado, no el vertical**
> ([[emparejamiento-por-timestamp]]). Antes de publicar cualquier número de este catálogo hay que
> leer ese archivo.
>
> **Y el 2026-08-30 Leo respondió a las tres consultas** ([[respuestas-lcv-consultas-agosto]]).
> Dos cosas de este catálogo cambian:
>
> 1. **El Performance Ratio pasa a ser diario y mensual**, no una métrica de 5 minutos. Se calcula
>    con el acumulado de `energia_pv1_wh` y `energia_pv2_wh` al final del día, dividido entre la
>    radiación integrada del día. El emparejamiento fino queda para los análisis punto a punto.
> 2. **La energía del tablero es AC** y sale de `energia_hoy_wh` o `energia_total_wh`, lo que
>    cierra la ambigüedad 3 de más abajo. **El 1.522,78 kWh publicado es DC** (integral de la
>    potencia corregida), o sea otra magnitud: la AC es siempre un poco menor porque incluye las
>    pérdidas del inversor.
>
> **Y el 2026-08-31 se midió contra producción qué es esa energía AC** ([[energia-ac-tablero]]).
> Tres cosas que cambian este catálogo: el **contador del inversor SÍ sirve** (los 39 MWh salían de
> una sola fila contaminada; sin ella el máximo es 2.710,7 kWh), **las columnas de energía están en
> kWh** pese al sufijo `_wh` ([[unidades-energia-kwh]]), y **la integración DC subestima un 14 %**
> por pesar cada fila a 5 minutos aunque el día tenga huecos internos, así que el 1.522,78 kWh es
> un piso y no la cifra buena.

## Arquitectura del sistema según el doc

Tres bloques (Fig. 1):

| Bloque | Submódulos |
|---|---|
| **DataViz** | Dashboard, Timeseries |
| **DataStats** | resumen estadístico, comparativas entre sensores/inversores, calidad de los datos |
| **DataMining** | (el doc lo nombra en la figura pero **no lo desarrolla en el texto**) |

## Dashboard: los 9 KPIs (Fig. 2)

Grilla de 3 × 3. Título de la pantalla: *"SISTEMA GESTION DATOS AGRIVOLTAIC"*.

| | Columna 1 | Columna 2 | Columna 3 |
|---|---|---|---|
| **Fila 1** | Última Actualización | Energía total producida (kWh) | Energía últimos 7 días (kWh) |
| **Fila 2** | Energía total Inclinado (kWh) | Energía 7 días Inclinado (kWh) | Rendimiento Específico (kWh/kWp) |
| **Fila 3** | Energía total Vertical (kWh) | Energía 7 días Vertical (kWh) | Rendimiento Específico (kWh/kWp) |

Definiciones **textuales** del doc (no reformuladas):

- **Última Actualización:** "visualización del último día de donde se tienen datos".
- **Energía Total Producida:** "Suma total de energía para todos los sistemas desde el
  inicio del proyecto (en kWh o en MWh)".
- **Energía Últimos 7 días:** "Suma de la energía de los últimos 7 días. En este caso, la
  energía de los últimos 7 días **al último día de actualización**". Es decir, la ventana se
  ancla al último dato disponible, **no a hoy**. Con el histórico congelado (último dato PV
  2026-06-01) esto importa: anclarlo a hoy daría cero.
- **Rendimiento específico:** "La división entre la energía total producida y la potencia
  instalada de los equipos. **Definir la unidad de tiempo a utilizar (mensual, anual)**".

Insumo disponible para el kWp: **1420 Wp por arreglo (4 × 355 Wp), 2840 Wp total**, PV1 =
Inclinado, PV2 = Vertical (ver [[geometria-sistema]]). Ya no está bloqueado.

## Los KPIs, ya calculados (medidos contra producción el 2026-08-28)

Primeros valores reales, por consulta directa a la Supabase (no supuesto). Sirven de referencia
para detectar regresiones cuando se implementen los algoritmos:

| KPI | Valor medido |
|---|---|
| Última actualización | **2026-06-01** · **88 días** de antigüedad · estado **detenida** |
| Energía total producida | **1.522,78 kWh** |
| Energía total Inclinado (PV1) | **921,05 kWh** |
| Energía total Vertical (PV2) | **601,72 kWh** |
| Rendimiento específico Inclinado | **864 kWh/kWp/año**, normalizando por **días con datos** |

**Cifras AC medidas el 2026-08-31** ([[energia-ac-tablero]]), que son las que corresponden a la
casilla del tablero según R7. En **kWh**, ver [[unidades-energia-kwh]]:

| Concepto | Valor | Ventana |
|---|---|---|
| Contador de vida (2.710,7 − 182,3) | **2.528,40 kWh** | 569 días de calendario, huecos incluidos |
| Suma de cierres diarios de `energia_hoy_wh` | **1.777,68 kWh** (1.640,43 sin el 2026-03-09) | 270 días con dato |
| Energía generada en días **que no tenemos** | **1.622,85 kWh** | la diferencia entre las dos ventanas |

El contador de vida es **el único número del sistema que ve los huecos** ([[gaps-temporales]]).
"Cuánto registramos" y "cuánto produjo la planta" son preguntas distintas, y acá la diferencia es
del orden del 64 %: hay que decir siempre cuál se está respondiendo.

Dos advertencias que salieron de calcularlos:

- ~~**La energía NO sale del acumulador del inversor.**~~ **SUPERADO el 2026-08-30**: para la
  casilla del tablero sí sale del acumulador, y es **AC**
  ([[respuestas-lcv-consultas-agosto]]). Y el **2026-08-31 se midió que el acumulador funciona**:
  `energia_total_wh` es monótona de **182,3 a 2.710,7 kWh** y no se reinicia ni una vez en 19.889
  lecturas ([[energia-ac-tablero]]). Lo de abajo describe cómo se calculó el 1.522,78 kWh, que
  es la **suma DC de los dos arreglos** y sigue siendo un número legítimo, pero de otra magnitud y
  **subestimado en un 14 %** frente al contador DC (970,10 contra 831,74 kWh sobre 129 días).
  Se integra la **potencia corregida**, pesando cada fila por el **salto real al siguiente
  registro y acotado a 900 s** ([[muestreo-variable]]).
- **El rendimiento específico depende de por qué se normalice, y la diferencia es de más del
  doble:** 864 kWh/kWp/año por días con datos, contra **416** normalizando por calendario. El 416
  mezcla el desempeño de la planta con el fallo del datalogger, así que no responde la pregunta
  que el KPI hace. Contraste útil: **diciembre 2025, mes completo, da 896**. Hay que decir siempre
  cuál de las dos normalizaciones se usó.

## Los 7 ejes de análisis energético

El doc los numera de forma inconsistente (el primero aparece rotulado "5." dentro de la
sección de calidad de datos, y a partir de ahí reinicia en 2). Acá van en el orden en que
aparecen, con la numeración que el propio doc les da a partir del segundo.

### 1. Análisis comparativo de rendimiento energético
**Objetivo:** comparar el rendimiento de ambas configuraciones (arreglo **Vertical vs
Inclinado**).
- Energía generada diaria / mensual / anual.
- Curvas de generación horaria.
- Producción específica / Performance Ratio (kWh/kWp) de cada configuración (diario,
  mensual, anual).
- Indicadores útiles: relación entre energía generada e irradiancia; estacionalidad
  (comparar desempeño en distintas estaciones).

### 2. Efecto de la temperatura sobre el rendimiento
**Objetivo:** analizar cómo la temperatura del módulo afecta la generación.
- Comparación térmica entre ambas configuraciones (la vertical tiende a calentarse menos).
- Coeficiente de temperatura, medido vs esperado → **"más adelante"**.
- Relación entre temperatura del módulo y caída de eficiencia.

### 3. Análisis de uso de la irradiancia
**Objetivo:** evaluar qué tanto aprovecha cada configuración la irradiancia disponible.
- Relación irradiancia vs generación energética.
- GHI vs POA (Plane of Array Irradiance) → el doc anota literalmente **"No tenemos en los
  planos del arreglo"**. ⚠️ **La realidad ya lo superó** (verificado en producción el
  2026-08-28): existe POA **modelada** con `pvlib` en la tabla `radiacion_sc_poa` (PV1/PV2,
  frontal y bifacial, **56.450 timestamps desde 2025-09-05**, ver [[implementacion]]). Es
  estimación y no medición, y hay que declararlo en cada resultado, pero el eje 3 **sí se puede
  construir**.
- Simulación o estimación de irradiancia incidente en cara frontal y posterior (útil por ser
  bifacial) → **"más adelante"**.

### 4. Análisis estacional y angular (**opcional**)
**Objetivo:** evaluar cómo la configuración afecta el desempeño a lo largo del año.
- Mejor desempeño de la vertical en invierno (sol más bajo).
- Mejor desempeño de la inclinada en verano (sol más alto).
- Comparación del ángulo de incidencia de la radiación sobre los paneles.

### 5. Simetría de generación en paneles bifaciales
El doc lo titula así y le agrega entre paréntesis: **"no tenemos en ambos planos"**.
**Objetivo:** determinar cuánto aporta la cara trasera del módulo bifacial.
- Con sensores bifaciales o datos separados: comparar frente vs reverso.
- **En ausencia de sensores traseros** (nuestro caso): estimar el aporte bifacial por modelo,
  según configuración y condiciones del suelo.

### 6. Modelado de potencial de optimización → **"más adelante"**
**Objetivo:** predecir qué configuración es más rentable según localización.
- Modelos de generación anual en distintas configuraciones.
- Estimar **LCOE** (Levelized Cost of Energy) si hay costos de instalación.
- Rentabilidad bajo distintos escenarios (residencial, agrícola, urbano).

### 7. Validación con modelos → **"más adelante"**
**Objetivo:** comparar datos reales contra modelos teóricos.
- Simular ambas configuraciones con **PVsyst, SAM o MATLAB** y comparar con los datos reales.
- Validación de modelos bifaciales en condiciones reales.

### Resumen de factibilidad hoy

| Eje | Estado según el doc |
|---|---|
| 1. Rendimiento comparado V vs I | Factible ya (kWp y geometría resueltos). ⚠️ **Su resultado depende del emparejamiento**: por timestamp exacto gana el vertical (0,622 vs 0,626), por bin de 5 min gana el inclinado (0,664 vs 0,633) → [[emparejamiento-por-timestamp]] |
| 2. Efecto de temperatura | Factible salvo el coeficiente de temperatura ("más adelante") |
| 3. Uso de la irradiancia | **Factible**: la POA modelada ya existe (`radiacion_sc_poa`); lo que el doc daba por faltante está en la base desde la v0.4 del ETL. El bifacial **medido** sigue "más adelante" |
| 4. Estacional y angular | Marcado **opcional** por el propio doc |
| 5. Simetría bifacial | **Solo por modelo**: no hay sensores traseros |
| 6. Optimización / LCOE | "Más adelante" |
| 7. Validación PVsyst/SAM/MATLAB | "Más adelante" |

## Preguntas de investigación que plantea el doc

Van tal cual, agrupadas como las agrupa el documento. No son métricas todavía: son las
preguntas que las métricas deberían poder contestar.

**Transversal:** ¿qué efecto de **erosión** hace el agua que cae de los paneles solares sobre
la huerta?

**Abióticos** (con los datos Fliwer que compartió **Wayner** en marzo 2025, de 2024 y 2025,
más imágenes del proyecto):
- Comparar cada una de las variables entre los arreglos y contra la **huerta de control**,
  buscando relaciones respecto a la configuración del arreglo.
- ¿Hay diferencia en el efecto para cada cultivo?
- ¿Cómo se ven afectadas las variables para cada tipo de arreglo y en diferentes estaciones?
- ¿Cómo se comporta la **sombra** generada por los paneles durante el año?

**Bióticos:**
- ¿Hay diferencia en el crecimiento de los cultivos según el arreglo?

**Eléctricos:**
- ¿Cómo se comporta la generación eléctrica para cada tipo de arreglo?
- ¿Cómo se comporta la generación para los diferentes meses del año?
- ¿Cómo se comporta la generación **total al combinar los dos tipos de arreglo**, frente a
  usar una sola configuración?
- ¿Se ve afectada la generación debido a los cultivos?
- ¿Se podría incluir una medición de **temperatura ambiente en el sitio distinta a la que
  está en los cultivos**?

## Ambigüedades del doc (no resueltas acá a propósito)

1. **Rendimiento Específico aparece dos veces** (fila del Inclinado y fila del Vertical), pero
   la definición que da el doc es global: "energía total producida / potencia instalada de los
   equipos". Falta confirmar que la intención es **por arreglo** (E_inclinado / 1420 Wp y
   E_vertical / 1420 Wp) y no el mismo número repetido.
2. **La unidad de tiempo del Rendimiento Específico queda explícitamente sin definir** por el
   propio doc ("Definir la unidad de tiempo a utilizar (mensual, anual)"). Es una decisión que
   le toca al equipo.
3. **"Energía total producida" no dice de qué columna sale.** El inversor expone `Energia
   total` (acumulado del equipo), `energia_hoy` y `Energía PV1/PV2` (del día); el
   [[agente-historico]] hoy la calcula por **integral de potencia**. Los tres caminos dan
   números distintos, sobre todo con la cobertura desigual ya documentada (n_ac ≈ 19,9k vs
   n_pv1 ≈ 34,4k). Falta fijar cuál es el oficial.
   **Medido el 2026-08-28: el acumulador del inversor queda descartado.** `energia_total_wh` va de
   **182 a 39.328.367 Wh**, imposible para 2,84 kWp. La fuente de energía es la **integral de la
   potencia corregida**. Falta que el autor confirme, pero técnicamente ya no hay tres caminos.
   ~~Falta que el autor confirme~~ **RESUELTO el 2026-08-30, y al revés de lo que decíamos**
   ([[respuestas-lcv-consultas-agosto]]): Leo dice que la energía del tablero es **AC** y sale de
   `energia_hoy_wh` o `energia_total_wh`, que *"seran siempre un poco menor a la suma de las de
   PV1 y PV2 porque consideran las perdidas del inversor"*. Las dos son **contadores que se
   reinician** (`energia_hoy_wh` cada día; `energia_total_wh` al llegar a su máximo), así que no se
   leen con `max()`: se leen sumando incrementos y tratando los saltos negativos como reinicios,
   que es exactamente lo que **no** se hizo al medir los 39 MWh.
   ⚠️ Además, esos 39 MWh se midieron sobre `monitoreo_sc_electrico`, la tabla **cruda y
   contaminada** con filas del piranómetro (por eso `max(potencia_pv1_w)` da 26.503.162 W en un
   arreglo de 1.420 Wp, ver [[filas-mezcladas]]).
   ✅ **Vuelto a medir el 2026-08-31, y el descarte era nuestro error:** los 39 MWh salen de **una
   sola fila**, la del `2025-10-07 07:45`. Sin ella el máximo es **2.710,7 kWh**, que son 571
   kWh/kWp/año en 569 días: físico. **El contador del inversor sí sirve.** La cobertura ya no está
   sin medir: `energia_hoy_wh` cubre 270 días (incluidos los 118 de nov-2025 a feb-2026 donde todo
   lo demás es NULL), `energia_total_wh` 147, y `energia_pv1_wh` / `energia_pv2_wh` solo **144**.
   Detalle en [[energia-ac-tablero]].
4. ~~**"Todos los sistemas" en la energía total**: ¿es la suma de PV1 + PV2 (DC) o la potencia
   total AC del inversor? No es lo mismo y el doc no lo dice.~~
   **RESUELTO el 2026-08-30: es AC** ([[respuestas-lcv-consultas-agosto]]).
5. **DataMining aparece en la figura de arquitectura y nunca se desarrolla.** Queda sin
   contenido: no se sabe si es análisis futuro, clustering, o simplemente un placeholder.
6. **El bloque de análisis energético mezcla dos numeraciones** (empieza en "5." y sigue en
   "2."). Es un desliz de edición, pero conviene confirmar que no falte un ítem.

Relacionado: [[respuestas-lcv-consultas-agosto]], [[energia-ac-tablero]], [[unidades-energia-kwh]], [[evaluacion-datos]], [[pruebas-calidad-umbrales]], [[graficos-evaluacion]],
[[algoritmos-antes-que-agente]], [[diccionario-variables]], [[geometria-sistema]],
[[metodologia]], [[agente-historico]], [[bloqueantes]], [[muestreo-variable]],
[[gaps-temporales]], [[fuentes-fisicas]], [[silencio-leido-como-salud]],
[[capa-analitica]], [[consola-analitica]], [[emparejamiento-por-timestamp]],
[[store-hallazgos-calidad]].
