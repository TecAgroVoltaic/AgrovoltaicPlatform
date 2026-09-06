---
name: graficos-evaluacion
description: Especificación de las visualizaciones del doc de evaluación de datos (2026-08-28); grilla de 9 KPIs, filtro de calendario, Data_Drifts de completitud, series interactivas con trendline/media móvil/desviación, box plots mensuales + barras de GHI, ridge plot con regresión Ridge, scatter con OLS y heatmaps tipo carpeta
categoria: proyecto
actualizado: 2026-08-28
tags: [visualizacion, dataviz, dashboard, graficos, evaluacion-datos]
---

# Gráficos y visualizaciones a implementar

Del doc `Evaluación de datos.pdf` (raíz del repo), de **Leonardo Cardinale Villalobos**,
2026-08-28. **Los gráficos a implementar son los que salen en el PDF**, ni más ni menos
(decisión de Izack, ver [[algoritmos-antes-que-agente]]).

Las métricas que alimentan estos gráficos están en [[catalogo-metricas-evaluacion]]; las
pruebas de calidad, en [[pruebas-calidad-umbrales]].

> Todos los gráficos se dibujan sobre el **rango de fechas que pide el usuario**. El filtro
> de calendario no es un adorno del dashboard: es la entrada de todo el módulo.

## Bloque DataViz

### 1. Dashboard de KPIs (Fig. 2)

Grilla de **3 × 3 tarjetas**, número grande arriba y etiqueta debajo, sin gráfico. Título de
pantalla *"SISTEMA GESTION DATOS AGRIVOLTAIC"*. Los 9 campos y sus definiciones textuales
están en [[catalogo-metricas-evaluacion]].

Detalle de formato visible en la figura: los números van con **separador de miles por espacio
y coma decimal** (`54 645,56`), y la fecha en formato largo en español (`17 Agosto 2024`).

### 2. Filtro de calendario (Fig. 3)

Selector de **fecha inicio y fecha final**, con calendario mensual desplegable. Es el primer
control del módulo Timeseries y condiciona todo lo que se dibuja después.

### 3. "Data_Drifts": cantidad de puntos en el servidor (Fig. 4)

Gráfico de **línea**, eje X = día, eje Y = *Number of points*. El doc lo define como *"uno de
los primeros filtros para evaluar la completitud de la data"*: se lee por sus **caídas**, los
días en que el conteo se desploma respecto de la meseta normal.

Es el mismo problema que la vista «Calidad de datos» ya resolvió como **calendario** en vez de
tabla ([[agente-historico-calidad]]), por una razón que aplica igual acá: **una línea sí
muestra los días con pocos puntos, pero no muestra los días que no existen**. En nuestro
histórico faltan 295 días de 569, y en un gráfico de línea por día esos días simplemente no se
dibujan. Vale la pena implementar el Data_Drifts del doc y no perder el calendario.

### 4. Series de tiempo interactivas por variable (Fig. 5)

*"Para las variables de la tabla 1 (Definición de variables), se deberá mostrar gráficos
interactivos basados en los filtros establecidos"*, y **sin filtros sobre la data** (el doc es
explícito: el módulo Timeseries visualiza el dato como está).

Cada gráfico lleva **cuatro trazos**, según la leyenda de la figura:

1. **Value**: la serie cruda.
2. **Trendline**: línea de tendencia (en el ejemplo, horizontal sobre todo el periodo).
3. **Rolling Average**: media móvil.
4. **Standard Deviation**: desviación estándar.

El título del ejemplo incluye el rango temporal y la ubicación (lat/lon), lo cual sugiere que
el título debe declarar sobre qué datos se está mirando.

## Bloque DataStats

### 5. Resumen estadístico mensual: box plots + barras de GHI (Fig. 6)

Figura apilada de **4 paneles que comparten el eje X = mes**:

| Panel | Tipo | Variable del ejemplo |
|---|---|---|
| 1 | box plot por mes | T (°C) |
| 2 | box plot por mes | RH (%) |
| 3 | box plot por mes | WS (m/s), velocidad de viento |
| 4 | **barras** por mes | GHI (kWh/m²) |

Los box plots muestran caja, mediana, bigotes y **outliers como puntos**. El panel de GHI es
un total mensual acumulado, no una distribución.

⚠️ El ejemplo usa **viento**, que no medimos. Ver [[pendientes-evaluacion-datos]].

### 6. Ridge plot con regresión Ridge (Fig. 7)

Comparativa de la **distribución de frecuencias entre dos o más sensores/inversores** (el pie
de figura da el ejemplo: *"sistema inclinado vs sistema aislado"*). El doc propone
explícitamente aplicar una **regresión Ridge** a la distribución de las frecuencias
(https://es.wikipedia.org/wiki/Regresión_Ridge).

Lo que muestra la figura:
- Una densidad apilada por sensor, etiquetada a la izquierda (`SM_01` … `SM_08`).
- Relleno con **mapa de color por "Tail probability"** (barra de color de 0,00 a 0,40).
- Una **línea vertical roja punteada** común a todas las series, como umbral de referencia.
- Eje X = la variable comparada (en el ejemplo, *Soil Moisture (%)*).

Código de referencia que da el doc: **`temp_tail_ridge_plot.py`**, ya en el repo en
`../../referencia/temp_tail_ridge_plot.py`. ⚠️ Hoy está cableado a columnas de humedad de
suelo con prefijo `SM_`: hay que generalizarlo a cualquier variable, que es exactamente el
contrato de algoritmo genérico de [[algoritmos-antes-que-agente]].

### 7. Scatter irradiancia vs potencia con regresión OLS (Fig. 8)

*"Evaluar la correspondencia entre la irradiación y la potencia del sistema, así como su
aproximación por regresión del sistema"*.

- Nube de puntos, eje X = irradiancia, eje Y = potencia.
- Recta de ajuste **OLS**, declarada en la leyenda.
- **La ecuación y el R² impresos dentro del gráfico** (en el ejemplo: `PAR = 2.016*GHI
  -8.449`, `R²= 0.999`).

⚠️ **El pie de figura y el gráfico no coinciden**: el pie habla de *potencia vs irradiación*
pero el ejemplo grafica **PAR vs GHI**. Ver ambigüedades.

### 8. Heatmaps tipo "carpeta" (Fig. 8 bis, *Diagramas de carpeta para series de tiempo*)

Par de mapas de calor con:
- **Eje Y = día del año** (etiquetado por mes, Ene a Dic, "Day count").
- **Eje X = hora del día** (0 a 23).
- **Color = magnitud** de la variable, con barra de color a la derecha.

En el ejemplo son dos: uno de *Consumption (kW)* con paleta magma/inferno y otro de
*Generation (kW)* con paleta negro-rojo-amarillo. El de generación muestra el patrón esperable
(un bulbo centrado al mediodía que se ensancha en verano), que es justamente lo que hace útil
esta vista: **la estacionalidad y el horario se leen de un vistazo**.

Para nosotros el aplicable es el de **generación**; el de consumo no tiene fuente de datos en
este proyecto.

## Bloque DataMining

El doc lo dibuja en la figura de arquitectura (Fig. 1) y **no desarrolla ningún gráfico para
él**. No hay nada que implementar todavía.

## Ambigüedades del doc (registradas, no resueltas)

1. **Fig. 8 aparece dos veces** con el mismo número (el scatter OLS y los diagramas de
   carpeta). Es un desliz de numeración, pero conviene confirmar que no falte una figura.
2. **El ejemplo del scatter grafica PAR vs GHI, no potencia vs irradiancia.** Hay que
   confirmar si la intención es (a) el gráfico de potencia vs irradiancia que dice el texto,
   (b) también uno de PAR vs GHI para el análisis abiótico, o (c) las dos cosas. La ecuación
   y el R² impresos son el requisito real y aplican a cualquiera de los tres casos.
3. **"Regresión Ridge a la distribución de frecuencias"** no es un procedimiento estándar y el
   doc no lo detalla. Puede querer decir (a) suavizar la densidad con un ajuste regularizado,
   (b) usar Ridge para modelar una variable en función de las otras y comparar coeficientes, o
   (c) simplemente el nombre del *ridge plot* (joyplot), que es lo que la figura muestra y que
   **no tiene nada que ver con la regresión Ridge**. La coincidencia de nombres es sospechosa
   y hay que preguntarla.
4. **El colormap "Tail probability" del ridge plot no está definido.** El código de referencia
   lo calcula, pero el doc no dice de qué cola (superior, inferior, bilateral) ni respecto de
   qué distribución.
5. **La línea vertical roja de la Fig. 7 no está explicada.** No se sabe si es un umbral fijo,
   una media global o un valor de referencia agronómico.
6. **Ninguna figura dice qué hacer con los datos marcados como malos** por las pruebas de
   calidad: si se dibujan igual, si se ocultan, o si se muestran con otro estilo. El módulo
   Timeseries dice explícitamente "sin filtros", pero no se aclara para el resto.
7. **Los ejemplos vienen de otros datasets** (irradiancia diaria en lat 40,53 / lon −103,16;
   humedad de suelo `SM_01..08`; consumo eléctrico). Son plantillas visuales, no
   especificaciones de nuestras variables: hay que mapear cada gráfico a las variables reales
   de la Tabla 1.

## Estado de implementación (2026-08-28)

**Las primitivas existen, las vistas no.** En el frontend hay **seis primitivas de gráfico
tipadas** (serie temporal, barras, box plot, heatmap de carpeta, dispersión con ajuste, gráfico
de crestas) sobre ECharts 6 con registro selectivo, más las rutas `/`, `/series`,
`/estadistica`, `/calidad` y `/comparativa`, y el rango de fechas en la URL. **Falta componer las
pantallas**, y ese es el pendiente principal del frente: ver [[consola-analitica]]. Los números
salen de [[capa-analitica]], nunca del navegador.

Dos cosas del contenido de estos gráficos cambiaron el mismo día:

- **La dispersión de la Fig. 8 estaba sesgada.** Cruzaba irradiancia con potencia por timestamp
  exacto y conservaba **4.388 de 28.625** lecturas. Al emparejar por bin, la recta pasa de
  **pendiente 0,636 con R² 0,369** a **pendiente 0,745 con R² 0,401**, y la pendiente es
  justamente la respuesta que ese gráfico da ([[emparejamiento-por-timestamp]]).
- **Cada arreglo se dibuja contra la irradiancia de su propio plano.** Contra la GHI horizontal el
  vertical da pendiente 0,547 y contra su POA 0,906: el sensor está montado en horizontal y el
  arreglo vertical no se le parece. Los dos números son legítimos, así que hay que **rotular
  contra qué plano se comparó**.

Y una consecuencia de [[store-hallazgos-calidad]] para la ambigüedad 6 de arriba: el veredicto por
día quedó con **cero días en verde**, así que un gráfico que coloree por veredicto diario saldría
todo del mismo color. La señal que sí discrimina es la **confianza por variable**.

Relacionado: [[catalogo-metricas-evaluacion]], [[pruebas-calidad-umbrales]],
[[algoritmos-antes-que-agente]], [[evaluacion-datos]], [[agente-historico-calidad]],
[[mvp-debugger]], [[diccionario-variables]], [[pendientes-evaluacion-datos]],
[[consola-analitica]], [[capa-analitica]], [[emparejamiento-por-timestamp]],
[[store-hallazgos-calidad]].
