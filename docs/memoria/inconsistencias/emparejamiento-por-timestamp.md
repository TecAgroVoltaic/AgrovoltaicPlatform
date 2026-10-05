---
name: emparejamiento-por-timestamp
description: Cruzar dos tablas de cadencia distinta por timestamp exacto conservaba el 15 % de la muestra y no de forma uniforme; el sesgo INVIERTE la comparación Vertical vs Inclinado, que es el eje 1 del doc de evaluación. Medido el 2026-08-28. Incluye el segundo hallazgo (comparar contra la irradiancia horizontal castiga al arreglo vertical) y la fragilidad del factor bifacial: en el vertical la cara trasera modelada aporta mas que la frontal, asi que phi ~ 0,80 queda sin validar. 2026-08-30: Leo respondio cambiando la unidad de analisis (el PR pasa a diario y mensual con acumuladores de energia), asi que el PR deja de pasar por este cruce; el hallazgo sigue vigente para los analisis punto a punto y para la nube de puntos de la Fig. 8
categoria: inconsistencia
actualizado: 2026-08-30
tags: [performance-ratio, join, cadencia, sesgo, poa, evaluacion-datos, agente-historico]
---

# El emparejamiento por timestamp exacto sesga la comparación entre arreglos

Hallado el **2026-08-28** al construir la capa de algoritmos ([[capa-analitica]]) y verificado
por consulta directa a la Supabase de producción. Es el hallazgo más importante de esa tanda
porque **cambia el resultado de la pregunta principal del proyecto**: si rinde más el arreglo
vertical o el inclinado.

## Qué estaba mal

La vista `v_sc_performance` unía la potencia con la POA **por timestamp exacto**:

- Lo eléctrico está a **5 min uniformes** (`monitoreo_sc_electrico`).
- La POA hereda la **cadencia irregular** de la radiación, que va de 2 s a 315 s según la
  época ([[muestreo-variable]]).

Dos rejillas que casi nunca caen en el mismo instante. Ese cruce **conservaba 4.369 de 28.996
lecturas, el 15 %**.

## La pérdida no es uniforme, y ahí está el veneno

Porcentaje de lecturas que sobrevivían al cruce, por mes:

| Mes | Sobrevive |
|---|---|
| 2025-09 | 30,3 % |
| 2025-10 | **45,4 %** |
| 2025-11 | 5,0 % |
| 2025-12 | 4,4 % |
| 2026-01 | 4,7 % |
| 2026-02 | 4,7 % |
| 2026-03 | 4,7 % |
| 2026-04 | 4,0 % |
| 2026-05 | **52,9 %** |
| 2026-06 | **68,7 %** |

**El 69 % de la muestra salía de octubre 2025 y mayo 2026**, que son justamente los meses en que
las cadencias de los dos registradores se alineaban. O sea: el Performance Ratio no se estaba
midiendo sobre el histórico, se estaba midiendo sobre dos meses elegidos por un accidente de
sincronización de relojes.

Perder el 85 % de una muestra al azar solo cuesta precisión. Perderlo **correlacionado con la
época del año** cuesta el resultado, porque la estacionalidad es exactamente la variable que la
comparación Vertical vs Inclinado quiere medir.

## El sesgo invierte la conclusión

| Método de emparejamiento | Pares | PR PV1 inclinado | PR PV2 vertical | Gana |
|---|---|---|---|---|
| Timestamp exacto (lo que había) | 4.369 | **0,622** | **0,626** | Vertical |
| Promedio por bin de 5 min | 19.482 | **0,664** | **0,633** | Inclinado |
| Más cercana dentro de ±150 s | 19.251 | **0,665** | **0,634** | Inclinado |

Los dos métodos correctos son **independientes entre sí** (uno agrega, el otro elige el vecino
más próximo) y **convergen**, así que el resultado no depende del método elegido: depende de
haber dejado de tirar el 85 % de la muestra.

Esto es el **eje 1 del doc de evaluación de datos** ([[catalogo-metricas-evaluacion]]), o sea la
pregunta que el documento pone primero.

### Consecuencia sobre la validación del factor bifacial

La convergencia `PR ≈ 0,62` de los dos arreglos se venía usando como **validación física** del
modelo bifacial y para estimar empíricamente `φ ≈ 0,80` ([[geometria-sistema]],
[[implementacion]]). Con el emparejamiento por bin los PR **ya no convergen** (0,664 contra
0,633), así que esa validación se apoya en una muestra sesgada.

Y al medirlo aparece que **el emparejamiento no era el único problema**. Sobre `radiacion_sc_poa`,
promediando donde la frontal supera 100 W/m² (para no contar la noche):

| Arreglo | POA frontal | POA efectiva | Aporte de la cara trasera |
|---|---|---|---|
| PV1 inclinado | 493,1 W/m² | 564,4 W/m² | **+15 %** |
| PV2 vertical | 201,2 W/m² | 398,3 W/m² | **+109 %** |

**En el vertical la cara trasera modelada aporta más que la frontal**, o sea que casi la mitad de
su irradiancia efectiva no es medición sino el resultado de aplicar φ y un albedo de suelo
supuesto. Eso hace que **el PR del vertical sea casi proporcionalmente sensible a φ y el del
inclinado casi no lo sea**: un error del **10 % en φ** mueve el PR del vertical alrededor de un
**5 %** y el del inclinado un **0,7 %**.

La comparación Vertical vs Inclinado descansa entonces sobre **dos** apoyos, no uno: el
emparejamiento (lo que documenta este archivo) y **un modelo que solo el vertical usa de forma
significativa**. Arreglar el primero no arregla el segundo.

Y la validación vieja era además **circular**: se tomaba como prueba de que φ estaba bien el
hecho de que los dos PR convergieran, cuando esa convergencia se conseguía **ajustando la
irradiancia del vertical con el propio φ**.

**Estado: φ ≈ 0,80 queda SIN VALIDAR, no refutado**, y no hay un número nuevo que lo reemplace.
Lo que sí queda establecido es que **hace falta una validación independiente**, porque la que
había no valía. Detalle en [[geometria-sistema]].

## Auditoría: qué otros cruces están afectados

Se revisaron todos los cruces entre tablas de cadencia distinta.

| Cruce | Resultado | Veredicto |
|---|---|---|
| radiación × clear-sky (`kt*`) | 94.868 = 94.868 | **Limpio**: la tabla de clear-sky se calculó para los mismos instantes, no hay dos rejillas |
| potencia × POA (Performance Ratio) | 4.369 de 28.996 | **Sesgado** |
| irradiancia × potencia (la nube de puntos con ajuste, Fig. 8 del PDF) | 4.388 de 28.625 | **Sesgado** |

La nube de puntos de la Fig. 8 cambia de forma al arreglarla: la recta pasa de **pendiente 0,636
con R² 0,369** a **pendiente 0,745 con R² 0,401** al emparejar por bin. No es un retoque
cosmético: la pendiente es la respuesta que ese gráfico da.

## Segundo hallazgo: comparar contra la irradiancia horizontal castiga al vertical

Medido también el 2026-08-28, ya con emparejamiento por bin:

| Comparación | Pendiente | R² |
|---|---|---|
| PV1 inclinado contra **GHI horizontal** | 0,936 | 0,509 |
| PV1 inclinado contra **su propia POA** | 0,842 | 0,523 |
| PV2 vertical contra **GHI horizontal** | **0,547** | **0,349** |
| PV2 vertical contra **su propia POA** | **0,906** | **0,470** |

El piranómetro está montado **en horizontal**. Al arreglo inclinado (20°) se le parece bastante;
al vertical (90°) no se le parece nada. Comparado contra la horizontal, el vertical aparece como
un arreglo malo, y lo que está midiendo es la diferencia de plano, no la diferencia de
rendimiento.

**Regla que sale de esto: cada arreglo se compara contra la irradiancia de su propio plano.** La
POA modelada por arreglo ya existe (`radiacion_sc_poa`, ver [[implementacion]]), así que no hay
excusa de dato faltante. Y hay que declarar siempre contra qué plano se comparó, porque los dos
números son legítimos y responden preguntas distintas.

## Estado: migración escrita, NO aplicada

`agente-historico/sql/002_performance_emparejado_por_bin.sql` está escrita y **no se aplicó**.

**Decisión de Izack:** avisar primero a Leo y a Hugo, y aplicarla cuando confirmen. La razón es
que el número publicado del PR cambia, y con él la conclusión de cuál arreglo rinde más: no es un
cambio que convenga hacer en silencio. La consulta al equipo salió en
`docs/equipo/consultas-sobre-la-data.pdf` con la evidencia mes a mes.

## Respuesta de Leo (2026-08-30): el PR deja de pasar por este cruce

Leo devolvió el documento anotado el **2026-08-30** ([[respuestas-lcv-consultas-agosto]],
citas verbatim en `docs/referencia/respuestas-lcv-consultas.md`). **No eligió ninguna de las dos
opciones que se le ofrecieron**: cambió la unidad de análisis.

> El caso 1 creo que es el que conviene para el performance ratio. De hecho, creo
> que podemos empezar a analizar el performance ratio para el dia y para el mes.
> [...] La sincronizacion con el dato mas cercano la podemos utilizar cuando vayamos a
> hacer algun analisis punto a punto cada 5 min, entonces si ocupariamos hacerlo
> asi; pero para el performance_ratio creo que no aplica.

**Qué queda superado de este archivo.** El Performance Ratio ya no se calcula emparejando
lecturas: se calcula por **día y por mes**, con el acumulado de `energia_pv1_wh` y
`energia_pv2_wh` al final del día dividido entre la radiación integrada del día. Así que la tabla
de "el sesgo invierte la conclusión" (0,622 / 0,626 contra 0,664 / 0,633) **deja de ser el número
de referencia del PR**: es la medición que motivó la consulta, no el resultado vigente. El PR
diario y mensual **se calculó el 2026-08-31** ([[performance-ratio-diario]]) y **confirma este
archivo**: con POA bifacial da **0,648 contra 0,612**, que cae casi encima del emparejamiento por
bin (0,664 / 0,633). Ya son **tres metodologías independientes** que dan ganador al inclinado, y
la única que decía lo contrario sigue siendo el join por timestamp exacto.

**Qué sigue vigente, sin cambios.** Todo lo demás de este archivo:

- La **auditoría de cruces**: la nube de puntos potencia contra irradiancia (Fig. 8) sigue siendo
  un cruce punto a punto y sigue sesgada, y ahí sí aplica el emparejamiento por vecino más
  cercano que el propio Leo avala para ese caso.
- El **segundo hallazgo** (comparar el vertical contra la GHI horizontal lo castiga) queda
  **confirmado** por la respuesta 1b: Leo dice que hay que trabajar con la radiación en el plano
  de cada arreglo, y que la ecuación de transposición la defina Hugo ([[bloqueantes]]).
- La **fragilidad del factor bifacial** φ, que no depende del emparejamiento
  ([[geometria-sistema]]).
- La **regla general**: ningún cruce entre tablas de cadencia distinta se hace por igualdad de
  timestamp, y todo cruce reporta qué fracción conservó.

**La migración 002 pasa a ser decisión nuestra.** Ya no espera a nadie: Leo no la aprobó ni la
rechazó, movió el PR fuera de su alcance. Sigue teniendo sentido para los cruces punto a punto.
Anotado en [[abiertos]].

## Lección general

Es el mismo patrón que [[silencio-leido-como-salud]], pero al revés de como se suele buscar: acá
**el `JOIN` sí devolvía filas**, así que nada parecía roto. Un `INNER JOIN` entre dos series de
tiempo con cadencias distintas no falla ni avisa: devuelve el subconjunto en que los relojes
coincidieron, y ese subconjunto **no es una muestra aleatoria del período**.

Regla: **ningún cruce entre dos tablas de cadencia distinta se hace por igualdad de timestamp.**
Se agrega a una rejilla común (bin) o se empareja por vecino más cercano con tolerancia
declarada, y **se reporta cuántas filas sobrevivieron**. Si un cruce no dice qué fracción
conservó, no se puede saber si el número que devuelve significa algo.

## Cuarta confirmación, y esta vez fuera del Performance Ratio (2026-08-31)

Al medir la prueba de inversor caído ([[inversor-sin-acoplar]]) hubo que buscar la irradiancia
concurrente de 6.330 lecturas marcadas. Por **igualdad exacta de timestamp** se encuentra para
**818**, o sea **se pierde el 87,1 %**. Con `date_bin` de 5 min se emparejan **5.979 (94,5 %)**.

Vale la pena anotarlo porque es la primera vez que el sesgo aparece en una **prueba de calidad** y
no en una métrica: con el join exacto, la severidad de la mayoría de los hallazgos habría quedado
sin graduar, y la regla habría parecido que no puede distinguir un apagón con sol de uno de noche.
La regla es la misma de siempre y ya no admite excepciones: **ningún cruce entre tablas de cadencia
distinta se hace por igualdad de timestamp**.

Relacionado: [[respuestas-lcv-consultas-agosto]], [[performance-ratio-diario]],
[[inversor-sin-acoplar]], [[capa-analitica]], [[geometria-sistema]], [[implementacion]],
[[catalogo-metricas-evaluacion]], [[muestreo-variable]], [[store-hallazgos-calidad]],
[[silencio-leido-como-salud]], [[verificacion-numeros]], [[agente-historico]],
[[graficos-evaluacion]].
