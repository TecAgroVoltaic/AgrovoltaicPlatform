---
name: pruebas-calidad-umbrales
description: Las 4 familias de pruebas de calidad de datos con sus umbrales exactos, según el doc de evaluación de datos de Leonardo Cardinale (2026-08-28); completitud, validez física, consistencia temporal y anomalías estadísticas. Las cuatro están implementadas desde el 2026-08-28 (paquete calidad/pruebas); el estado del store tras correrlas está en store-hallazgos-calidad. 2026-08-30: el rango 100-280 V del voltaje AC queda RETIRADO de validez física y se reemplaza por una prueba de disponibilidad del equipo (familia nueva)
categoria: datos
actualizado: 2026-08-30
tags: [calidad, umbrales, qc, bsrn, agente-historico, evaluacion-datos]
---

# Pruebas de calidad de datos y umbrales exactos

Del doc `Evaluación de datos.pdf` (raíz del repo), sección *"Calidad de los datos"*, de
**Leonardo Cardinale Villalobos**, 2026-08-28. Contexto y decisión de implementación en
[[algoritmos-antes-que-agente]]; el resto del catálogo en [[catalogo-metricas-evaluacion]].

Encuadre del doc: *"Para toda la base de datos, deberían poder generar las siguientes
pruebas"*. Es decir, aplican a **todas** las variables y todas las fuentes, no solo a las
eléctricas.

Referencia bibliográfica que cita el propio doc: **BSRN** (Baseline Surface Radiation
Network), https://bsrn.awi.de/

> Los umbrales de abajo son **verbatim del documento**. No se ajustaron, no se
> reinterpretaron y no se completaron con criterios propios. Donde el doc es ambiguo se dice
> que lo es, en la sección final.

## 1. Completeness (el doc la marca **"Done"**)

*¿Hay información faltante?*

- NaN values
- NULL values
- Missing timestamps
- Missing Minutes
- Missing Parameters
- Missing devices

## 2. Validez física

*¿Puede esto pasar en la vida real?*

| Prueba | Umbral exacto |
|---|---|
| Irradiancias negativas | < 0 |
| Irradiancias excesivas | > 1500 W/m² |
| Irradiancia nocturna | valor de irradiancia de noche, **verificando contra la altura solar** |
| Humedad relativa alta | RH > 100 % |
| Humedad relativa negativa | RH < 0 % |
| Temperatura ambiente baja | T ambiente < −5 °C |
| Temperatura ambiente alta | T ambiente > 50 °C |
| Viento negativo | velocidad del viento < 0 |
| Precipitación negativa | precipitación < 0 |

⚠️ **Dónde se lee esta familia importa tanto como el umbral.** Leída contra las **vistas
corregidas** siempre da cero valores imposibles, no porque el sensor esté bien sino porque la
vista ya anuló lo que caía fuera de rango: la prueba se aprueba a sí misma. Se lee contra el
**crudo**. Ver [[silencio-leido-como-salud]].

### 2026-08-30: el rango de voltaje AC sale de esta familia

El rango **100 a 280 V** para `voltaje_vac` no viene del doc: lo pusimos nosotros, y **estaba mal
planteado**. Leo Cardinale lo resolvió el 2026-08-30 ([[respuestas-lcv-consultas-agosto]]): el
**0 V es dato válido**, es el inversor sin exportar, y la medición corresponde a la tensión AC que
genera el propio inversor.

- **Se retira** el rango 100-280 V como prueba de validez física.
- **Se agrega una prueba de disponibilidad del equipo**, que no pertenece a ninguna de las cuatro
  familias del doc: `voltaje_vac`, `frecuencia_hz` y `potencia_total_wac` en 0 **entre las 7:00 y
  las 17:00**. Las tres variables, no solo el voltaje.
- **Refinamiento opcional** si aparecen muchas falsas alarmas: condicionar a irradiancia **mayor a
  unos 300 W/m²**. Ampliar la ventana hacia el amanecer o el atardecer lo desaconseja el propio
  Leo.
- ⚠️ **El refinamiento por irradiancia solo se puede evaluar desde julio 2025**: la irradiancia
  previa al 2025-07-01 es NULL por decisión del equipo ([[respuestas-leo-cardinale]] P12). Antes
  de esa fecha la prueba cae al criterio horario **y tiene que decirlo en la salida**, en vez de
  callar que no pudo evaluar el refinamiento ([[silencio-leido-como-salud]]).

La distinción que esto deja para el resto del catálogo: **un cero operativo no es una avería**, y
una prueba que detecta ausencia de servicio no es una prueba de validez del dato. Son dos ejes
distintos y no deberían compartir severidad ni veredicto.

**Medido el 2026-08-31, y la prueba nueva ya tiene forma cerrada** ([[inversor-sin-acoplar]]): la
irradiancia entra como **graduador de severidad y no como filtro** (grave con GHI >= 300, aviso por
debajo, aviso con motivo `sin_irradiancia` cuando es NULL), porque usarla de filtro **pierde 8 días
en silencio, 3 de ellos apagones de día entero**. Rendimiento: **6.330 lecturas en 95 días** contra
las 7.954 en 238 de la regla vieja. Y va en un **módulo propio**, `calidad/pruebas/disponibilidad.py`,
que es una **quinta familia** fuera de las cuatro del doc, porque mide el **equipo** y no el dato
([[decisiones]], [[capa-analitica]]).

## 3. Consistencia temporal

*¿Es la información consistente o existen redundancias?*

- Timestamps duplicados.
- **Intervalos de tiempo mayores a dos veces la tasa de muestreo deseada.**
- Fluctuaciones en las marcas de tiempo.

## 4. Anomalías estadísticas

*¿Tiene sentido el valor?*

| Prueba | Umbral exacto |
|---|---|
| Salto de temperatura | > 3 °C entre mediciones |
| Salto de humedad relativa | > 15 % entre mediciones |
| Salto de irradiancia | > 300 W/m² entre mediciones |
| Flatline | 30 mediciones consecutivas iguales |
| Outlier por IQR | fuera de `Q1 − 1,5 × IQR` y `Q3 + 1,5 × IQR` |
| Ruido excesivo | cambios absolutos superiores a `media + 6 × desviación máxima absoluta` |

## Qué de esto ya está implementado

> **Actualización 2026-08-28: las cuatro familias están implementadas.** El paquete
> `historico/calidad/pruebas/` (11 módulos: `umbrales`, `contrato`, `cadencia`, `estadistica`,
> `completitud`, `validez_fisica`, `consistencia_temporal`, `anomalias`, `registro`, `consultas`)
> cubre lo que la tabla de abajo daba por pendiente, y **el barrido completo se corrió en
> producción**: `hallazgos_calidad` pasó de 3.158 filas y 10 tipos a **23.533 filas, 23 tipos y 6
> fuentes**. La tabla siguiente queda como registro de lo que había el 2026-08-24; el estado
> actual del store, sus problemas y las duplicaciones de detectores están en
> [[store-hallazgos-calidad]], y las decisiones de arquitectura en [[capa-analitica]].
>
> Cambios de criterio que salieron de implementarlas:
> - **La cadencia se mide, no se declara.** `cadencia.py` priorizaba `intervalo_original_seg` y
>   eso marcaba **8.756** saltos como intervalo excesivo cuando los reales son **65**
>   ([[muestreo-variable]], donde además se corrige una afirmación previa de esa sesión).
> - **`voltaje_vac = 0` es un falso positivo del rango 100-280 V.** De 7.955 lecturas marcadas,
>   **7.873 valen exactamente 0**: es el inversor sin exportar, no un error de medición. ~~Causa
>   principal de que 238 días queden en grave.~~ **RESUELTO el 2026-08-30**: Leo confirmó que el 0
>   es válido y el rango se retira, ver la sección de validez física de arriba. ⚠️ **Y corregido el
>   2026-08-31: marca 238 días, pero no es la causa de que estén en rojo** (quitar el rango deja el
>   veredicto en 206 y 206) → [[store-hallazgos-calidad]], [[inversor-sin-acoplar]].
> - **Cuatro detectores para dos hechos**: `nulos` / `valor_nulo` duplican el mismo hecho, y
>   `valor_nulo` + `parametro_faltante` + `columna_ausente` disparan los tres sobre las columnas
>   AC vacías. Sin resolver.

Estado al 2026-08-24, cuando solo existía el barrido del [[agente-historico-calidad]] (cubría
parte de las familias 1 y 2, y descubrió cosas que el doc no anticipa):

| Prueba del doc | Estado en el repo |
|---|---|
| NaN / NULL | Hecho, pero **desdoblado**: una columna con todas las filas en NULL no es "faltan datos", es que la columna no vino en el CSV → `columna_ausente`, no `nulos` |
| Missing timestamps / minutes | Hecho **contra las horas de sol** (`ventana_solar`, pvlib), no contra 24 h: el logger solo graba de día |
| Timestamps duplicados | Medido: **cero** en radiación, el ETL ya dedupló |
| Irradiancia fuera de rango | `fuera_de_rango` en 256 de 274 días, 11 variables |
| Flatline | Hecho, pero **partido en tres**: `saturado_85` (DS18B20 desconectado), `constante_en_cero` (el inversor no generó ese día, hecho operativo) y `sensor_plano` (grave, hoy no aparece nunca) |
| Irradiancia nocturna vs altura solar | Parcial: existe `ventana_solar` con pvlib, falta la prueba explícita |
| Missing devices / parameters | No implementado como tal |
| Saltos de T / RH / irradiancia | No implementado |
| IQR outlier | No implementado |
| Ruido excesivo | No implementado |
| Consistencia temporal (intervalos, fluctuaciones) | No implementado. Hay **33 cadencias distintas** medidas en el histórico, pero la cadencia de referencia ya está decidida: **moda de los saltos reales del período** ([[muestreo-variable]]) |

## Qué variables mira el barrido, y cuáles no (medido 2026-08-28)

Verificado contra `hallazgos_calidad` por consulta directa a producción: el barrido vigila
**14 de las 26 variables** del diccionario. Las que **no** mira, comprobadas una por una:
`albedo`, las **cuatro** del SP722, `cs_ghi_wm2`, `kt_star` y las **dos POA**.

Para esas, **"cero hallazgos" no significa que estén limpias: significa que nadie las miró**. Es
una distinción que antes no se podía hacer, porque la salida no separaba "sin problemas" de "sin
cobertura". Toda prueba tiene que reportar su **alcance** junto con su resultado. Ver
[[silencio-leido-como-salud]].

## Lo que estas pruebas asumen y no tenemos

- **Velocidad del viento y precipitación**: dos de las nueve pruebas de validez física son
  sobre variables que **ninguna de las tres tablas de variables del doc incluye** (ni
  Tabla 1 PV, ni Tabla 2 Fliwer, ni Tabla 3 ESP32). Ver [[pendientes-evaluacion-datos]].
- **Temperatura ambiente**: las pruebas de −5 °C / 50 °C son sobre **T ambiente**, que en
  nuestros datos solo aparece vía Fliwer (`temperature (ºC)`) y nodos ESP32 (`dht_temp_C`).
  Las temperaturas del corpus PV son de **módulo e inversor**, que es otra variable.
- **Tasa de muestreo "deseada"**: la prueba de consistencia temporal se define contra una tasa
  deseada que el doc no fija. Ver ambigüedades.

## Choque de umbrales con lo ya decidido

Hay **tres rangos de temperatura válida circulando** en el proyecto y no son el mismo caso:

| Rango | Variable a la que aplica | Fuente |
|---|---|---|
| **10 a 80 °C** | temperatura de **módulo/panel** (posproceso) | Leo Cardinale, doc rev LCV, 2026-08-10 ([[respuestas-leo-cardinale]]) |
| **−5 a 50 °C** | temperatura **ambiente** | este doc, 2026-08-28 |
| −10 a 60 °C | (heredado de AgroDash) | **reemplazado** por el de 2026-08-10 |

**No se contradicen**: son variables distintas. Pero conviene dejarlo explícito porque el
código que aplique un rango de temperatura tiene que saber cuál de las dos está filtrando.

## Ambigüedades del doc (registradas, no resueltas)

1. **"Completeness (Done)": ¿hecho por quién?** No se sabe si significa que el módulo ya está
   implementado por el equipo del TEC, que ya se corrió sobre los datos, o que el diseño de
   esa familia ya está cerrado. Nuestro [[agente-historico-calidad]] la implementó por su
   cuenta; falta saber si hay una implementación paralela que haya que reconciliar.
2. **"Missing timestamps" vs "Missing Minutes"** no están diferenciados. Lo más plausible es
   que uno sea "faltan filas en la rejilla esperada" y el otro "faltan minutos dentro de una
   hora", pero el doc no lo dice.
3. **Ningún umbral declara la cadencia de referencia.** "Salto de temperatura > 3 °C entre
   mediciones" significa cosas muy distintas a 15 s, a 5 min o a 15 min, y nuestro histórico
   tiene **33 cadencias distintas** ([[muestreo-variable]]). Ya se pagó exactamente esta
   trampa una vez: el índice de variabilidad daba **4,15 con cadencia de 315 s y 23,81 con
   cadencia de 42 s para el mismo kt** ([[agente-historico-calidad]]). Hay que fijar la
   rejilla sobre la que se evalúan los saltos.
   **Resuelto de nuestro lado el 2026-08-28** (falta confirmarlo con el autor): la cadencia de
   referencia es la **moda de los saltos reales del período**, y se expone en la salida. Lo que
   **no** sirve es `intervalo_original_seg`: guarda la cadencia del CSV de origen, no la del dato
   guardado ([[muestreo-variable]]).
4. **"Desviación máxima absoluta"** en la prueba de ruido excesivo es ambigua. En la
   literatura de QC (y en BSRN) lo habitual es la **MAD = median absolute deviation**; el doc
   dice "máxima" y además la combina con "media", lo cual sugiere una fórmula mixta
   (`media + 6 × MAD`). Con "máxima" literal la prueba casi nunca dispararía. Hay que
   confirmarlo con el autor.
5. **"Tasa de muestreo deseada"** no está definida. Lo más cercano decidido es el estándar de
   Leo del 2026-08-10: eléctricas a **5 min**, radiación a **15 s**
   ([[respuestas-leo-cardinale]]). Falta confirmar que esa es la "deseada" para esta prueba, y
   qué se hace con los tramos históricos que muestrearon a 2 s o a 1 min.
   Ojo: medido el 2026-08-28, la radiación **no está a 15 s** salvo en **octubre 2025**; el resto
   del histórico va de 2 s a 315 s ([[muestreo-variable]]). Medir contra los 15 s "deseados" daría
   completitudes absurdas.
6. **"Flatline: 30 mediciones consecutivas"** no dice si es por variable, ni si hay tolerancia
   numérica (¿exactamente iguales, o dentro de un epsilon?), ni qué pasa con las variables
   que legítimamente son constantes (irradiancia en cero de noche, generación en cero un día
   sin sol).
7. **El outlier por IQR no dice sobre qué ventana** se calculan Q1 y Q3: ¿todo el histórico,
   el rango pedido por el usuario, por mes, por hora del día? Con estacionalidad fuerte la
   respuesta cambia por completo.
8. **La prueba de irradiancia nocturna no fija un umbral de altura solar.** Dice "verificar
   contra la altura solar" pero no da el ángulo (¿0°? ¿−6° de crepúsculo civil?) ni el valor
   de irradiancia tolerable durante la noche.

Relacionado: [[respuestas-lcv-consultas-agosto]], [[inversor-sin-acoplar]],
[[agente-historico-calidad]], [[capa-analitica]], [[store-hallazgos-calidad]],
[[catalogo-metricas-evaluacion]],
[[graficos-evaluacion]], [[algoritmos-antes-que-agente]], [[respuestas-leo-cardinale]],
[[muestreo-variable]], [[irradiancia-sin-calibrar]], [[temperatura-85]],
[[pendientes-evaluacion-datos]], [[silencio-leido-como-salud]], [[gaps-temporales]].
