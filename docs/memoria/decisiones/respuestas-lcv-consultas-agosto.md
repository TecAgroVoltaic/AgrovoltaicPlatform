---
name: respuestas-lcv-consultas-agosto
description: Segunda ronda de respuestas de Leo Cardinale (2026-08-30) a las tres consultas enviadas el 2026-08-28. Cierra el emparejamiento del Performance Ratio cambiando la unidad de analisis a diaria y mensual, declara valido el voltaje AC en cero (se reemplaza por una prueba de disponibilidad del equipo) y confirma que la energia del tablero es AC. Deja una sola pregunta abierta, la ecuacion de transposicion, que la confirma Hugo. Los huecos que dejaba marcados se midieron el 2026-08-31: ver energia-ac-tablero
categoria: decision
actualizado: 2026-08-31
tags: [performance-ratio, emparejamiento, voltaje-ac, energia, transposicion, disponibilidad, lcv, evaluacion-datos]
---

# Respuestas de Leo Cardinale a las tres consultas sobre la data (2026-08-30)

**Segunda ronda.** La primera fue el 2026-08-10 y trataba el **tratamiento de los datos**
(P1 a P12: nombres, 85 °C, offset, filas mezcladas, muestreo, límites, calibración):
[[respuestas-leo-cardinale]]. Esta ronda es distinta y no la contradice en nada: trata **cómo se
calculan las métricas** sobre los datos ya tratados.

**Qué se envió:** el 2026-08-28 salió `docs/equipo/consultas-sobre-la-data.pdf` (+ `.txt`) con
tres consultas y tres hechos de contexto, redactadas en impersonal para que las leyera gente que
no trabaja en el código.

**Qué volvió:** el 2026-08-30, entre las 22:47 y las 23:08 CST, Leo devolvió el documento
anotado: `consultas-sobre-la-data-Rev-LCV.pdf` (raíz del repo). Son anotaciones PDF firmadas
`lcardinale`; no se ven con `pdftotext`, hay que extraerlas del objeto de anotaciones.

**Las citas verbatim completas viven en `docs/referencia/respuestas-lcv-consultas.md`.** Ese
archivo es la fuente. Acá van las mismas citas y, sobre todo, **qué cambia en la
implementación**.

> Regla al implementar: si una cita no cuadra con el dato, se anota como discrepancia y se
> consulta. No se ajusta la cita.

> **2026-08-31: los huecos que esta nota dejaba marcados ya se midieron, y el PR nuevo ya se
> calculó.** Con el método de Leo **gana el arreglo inclinado** en las cinco particiones probadas
> → [[performance-ratio-diario]]. Y sobre la energía: Cobertura real de los
> cuatro acumuladores, comportamiento de reinicio, razón AC/DC y el destino de los 39 MWh están en
> [[energia-ac-tablero]]. Salieron además tres hallazgos que no se buscaban: las columnas de
> energía están en **kWh** y no en Wh ([[unidades-energia-kwh]]), y `v_sc_electrico_corregido`
> tiene **dos bugs** que afectan directo a lo que Leo pidió ([[vista-corregida-no-corrige]]).
> Cada advertencia técnica de abajo lleva su resultado anotado.

## Resumen

| Consulta | Qué se preguntó | Estado |
|---|---|---|
| **1a** | ¿Se cambia el emparejamiento del Performance Ratio? | **Cerrada, cambiando la pregunta**: el PR pasa a ser diario y mensual |
| **1b** | ¿Se usa la irradiancia del plano de cada arreglo? | **Principio confirmado, ecuación ABIERTA**: la define Hugo |
| **2** | ¿`voltaje_vac = 0` es dato válido o error? | **Cerrada**: es dato válido; el rango 100-280 V se retira |
| **3** | ¿La energía del tablero es continua o alterna? | **Cerrada**: es **AC**, y el 2026-08-31 se midió que el contador **sí sirve** y que el hueco de cuatro meses **no existe** |

## Consulta 1a: el emparejamiento del Performance Ratio

Se preguntó si se aplicaba el cambio de emparejamiento (promediar la irradiancia sobre la ventana
de 5 min de cada lectura del inversor, en vez de exigir coincidencia exacta de marca de tiempo),
con la evidencia mes a mes de [[emparejamiento-por-timestamp]].

> El asunto de que los datos no esten completamente sincronizados es algo
> importante a considerar porque se dara tambien para muchas otras variables.
> Creo que hay dos caminos:
> 1. Definir los periodos de analisis, y se podria trabajar con datos acumulados
>    o promedios durante el periodo de interes.
> 2. Sincronizar con el dato mas cerca.
>
> El caso 1 creo que es el que conviene para el performance ratio. De hecho, creo
> que podemos empezar a analizar el performance ratio para el dia y para el mes.
> Para el dia la energia generada se obtiene de la variable EnergiaPV1 y
> EnergiaPV2. Se debe tomar el total acumulado al final de dia. Esta se debe
> dividir entre la radiacion del dia. Para calcular la radiacion se hace:
> radiacion_intervalo = Irradiancia*5/60. La radiacion del dia es la sumatoria de
> todos esos durante el dia.
>
> La sincronizacion con el dato mas cercano la podemos utilizar cuando vayamos a
> hacer algun analisis punto a punto cada 5 min, entonces si ocupariamos hacerlo
> asi; pero para el performance_ratio creo que no aplica; mas interesante
> analizarlo en periodos mas largos como dia o mes; no cada 5 min.

**No eligió ninguna de las dos opciones que se le ofrecieron.** Cambió la unidad de análisis:
el Performance Ratio deja de ser una métrica de 5 minutos.

### Qué cambia en la implementación

1. **El PR se calcula por día y por mes**, no por lectura. La pregunta de qué arreglo rinde más
   se responde sobre acumulados, no sobre pares instantáneos.
2. **La energía del día sale de los acumuladores del inversor**, `energia_pv1_wh` y
   `energia_pv2_wh`, tomando el total acumulado al final del día. No de integrar la potencia.
   ⚠️ **Medido el 2026-08-31:** son **acumuladores diarios** (abren en 0 al amanecer en 134 de 144
   días y crecen monótonos), así que "el total acumulado al final del día" es literalmente el
   **cierre del día**. Pero **solo cubren 144 días, y ninguno entre nov-2025 y feb-2026**: el PR
   diario **no se puede calcular en ese tramo**, aunque la energía AC sí exista ahí
   ([[energia-ac-tablero]]).
3. **La radiación del día es la suma de la radiación de cada intervalo**, con
   `radiacion_intervalo = irradiancia * 5/60`.
4. **El emparejamiento fino sigue existiendo, pero en otro lugar**: análisis punto a punto cada
   5 min. Ahí sí aplica el vecino más cercano.

### Advertencia técnica: la fórmula `5/60` supone cadencia de 5 minutos, y la nuestra no lo es

La fórmula convierte W/m² a Wh/m² multiplicando por 5 min / 60 min, y es correcta **si cada
lectura cubre 5 minutos**. `radiacion_sc_15s` tiene saltos reales de 15, 30, 45, 60, 75, 300,
315 y 330 s según la época ([[muestreo-variable]]). Aplicar `5/60` a un tramo de 15 s multiplica
la irradiación de ese tramo por **veinte**.

La generalización correcta, que es la que hay que implementar:

    radiacion_intervalo_wh_m2 = irradiancia_wm2 * (dt_real_segundos / 3600)

donde `dt_real` es `lead(timestamp) - timestamp` **acotado a un techo con nombre**. Sin techo, el
salto nocturno de 40.200 s se integra como once horas de sol. Con cadencia de 5 min esta fórmula
da exactamente lo que dice Leo, así que no lo contradice: lo generaliza al histórico real.

### Qué pasa con la migración escrita y no aplicada

`agente-historico/sql/002_performance_emparejado_por_bin.sql` seguía **escrita y sin aplicar**, a
la espera de esta respuesta. Leo **no la aprobó ni la rechazó**: cambió la unidad de análisis, con
lo que el PR ya no pasa por ese cruce. La migración sigue siendo pertinente para los cruces que
**sí** son punto a punto (la nube de puntos potencia contra irradiancia, Fig. 8), donde el sesgo
medido el 2026-08-28 sigue vigente. Aplicarla o no es ahora **decisión nuestra**, no del equipo:
anotado en [[abiertos]].

Lo que **no** cambia es la regla general que salió de ese hallazgo: ningún cruce entre dos tablas
de cadencia distinta se hace por igualdad de timestamp, y todo cruce reporta qué fracción de la
muestra conservó ([[emparejamiento-por-timestamp]]).

## Consulta 1b: irradiancia en el plano de cada arreglo. **ESTA ES LA QUE SIGUE ABIERTA**

Se preguntó si, dado que el piranómetro está montado en horizontal, cada arreglo se compara
contra la irradiancia de su propio plano.

> Para el performance_ratio de cada arreglo, idealmente debemos trabajar para la
> radiacion en el plano, pero como lo que tenemos es radiacion horizontal,
> debemos aplicar un modelo matematico que hace el ajuste, entonces tendremos una
> radiacion para cada uno en particular. Sobre esto podrias consultar a Hugo cual
> ecuacion utilizar.

**El principio queda confirmado:** sí hay que usar irradiancia por plano, una por arreglo, vía
modelo de transposición desde la horizontal. Eso valida el segundo hallazgo del 2026-08-28
(comparar el arreglo vertical contra la GHI horizontal lo castiga: pendiente 0,547 contra 0,906
con su propia POA).

**Lo que falta es cuál ecuación de transposición.** Nosotros ya tenemos POA modelada con `pvlib`
en `radiacion_sc_poa` ([[implementacion]], [[geometria-sistema]]), así que no estamos parados:
estamos pendientes de que Hugo confirme el modelo o lo cambie.

**Es la única pregunta abierta de esta ronda.** Anotada en [[bloqueantes]].

## Consulta 2: el voltaje AC en cero

Se preguntó si un 0 en el voltaje de salida cuenta como dato válido (inversor sin exportar) o
como dato inválido. De eso dependía el veredicto de calidad de **238 días**
([[store-hallazgos-calidad]]).

> Debo revisar si la medicion es medida en la red AC externa o en la red AC que
> genera el inversor. Si indicas que marca 0V en la noche, quiere decir que
> corresponde a la tension AC que genera el inversor; siendo asi, si vale la pena
> que el sistema detecte cuando se da este caso durante el dia; digamos entre
> 7am-5pm; porque quiere decir que el sistema no esta tratando de acoplarse a la
> red AC y entonces vale la pena ir a revisarlo.
>
> Lo mismo aplica para frecuencia y potencia total. Deberian ser mayores a cero
> durante el dia; entre 7am y 5pm. Podriamos ampliar el rango un poco mas cercano
> al amanecer y tardecer pero generaria muchas falsas alarmas.
>
> Si aun asi se generan muchas falsas alarmas, podria ser cuando el inversor se
> desconecta por muy baja irradiancia, entonces podriamos incluir otro parametro
> adicional, que seria la irradiancia. De esta forma, si hay irradiancia mayor a
> unos 300W/m2, todas las variables dichas deberian ser mayores a 0.

**El 0 V es dato válido.** Y la prueba cambia de familia: deja de ser una prueba de **validez
física del dato** y pasa a ser una prueba de **disponibilidad del equipo**.

> ⚠️ **Discrepancia medida el 2026-08-31: la premisa de Leo es falsa aunque su conclusión sea
> correcta**, y hay que decírselo con las dos partes ([[inversor-sin-acoplar]]). Leo deduce que la
> medición es del inversor *"porque marca 0V en la noche"*, pero **la tabla eléctrica tiene 7 filas
> en todo el histórico fuera de la franja 05-17 h**: no hay noche que medir, y el 0 V es un **20 %
> plano a todas las horas** (581 lecturas al mediodía). **La conclusión se sostiene por otra vía y
> más fuerte:** el 0 V coincide con DC = 0 en 7.872 de 7.872 casos, no existe ni una lectura con
> 0 V y DC > 50 W, y el **97 % (7.639 lecturas en 99 días) tiene tensión de string sobre 50 V**, o
> sea el arreglo energizado con el inversor sin acoplar, a plena luz.

### Qué cambia en la implementación

1. **El rango 100-280 V se retira como prueba de validez física.** Estaba mal planteado: marcaba
   7.955 lecturas de las cuales 7.873 valían exactamente 0, que es el inversor sin exportar
   ([[pruebas-calidad-umbrales]]).
2. **Prueba nueva, de disponibilidad:** detectar `voltaje_vac`, `frecuencia_hz` y
   `potencia_total_wac` en 0 **durante el día**, entre las **7:00 y las 17:00**. Las tres
   variables, no solo el voltaje.
3. **Ampliar la ventana hacia el amanecer y el atardecer no es gratis**: lo dice el propio Leo,
   generaría muchas falsas alarmas.
4. **Refinamiento opcional, si aun así hay muchas falsas alarmas:** condicionar por irradiancia.
   Con irradiancia **mayor a unos 300 W/m²**, las tres variables deberían ser mayores que cero.
5. **El significado del hallazgo cambia:** ya no dice "este dato es malo", dice "el sistema no
   está tratando de acoplarse a la red AC y vale la pena ir a revisarlo". Es una alerta operativa
   dirigida a alguien que va al campo.

### Advertencia técnica: el refinamiento por irradiancia solo se puede evaluar desde julio 2025

La irradiancia previa al **2025-07-01** es NULL por decisión del equipo (el error de medición de
los primeros meses, [[respuestas-leo-cardinale]] P12). Antes de esa fecha la prueba tiene que caer
al criterio horario **y decirlo en la salida**, en vez de callar que no pudo evaluar el refinamiento.
Es la regla de [[silencio-leido-como-salud]]: la ausencia de señal no se reporta como señal.

### Advertencia técnica: la vista corregida borra justamente esos ceros

Medido el **2026-08-31**: `v_sc_electrico_corregido` trae
`CASE WHEN voltaje_vac < 100.0 OR voltaje_vac > 280.0 THEN NULL`, o sea que **la vista anula los
7.873 ceros que Leo acaba de declarar dato válido**.

Consecuencia: hoy cualquier análisis que lea la vista corregida **es incapaz de ver un inversor
caído a mediodía**, que es exactamente lo que Leo pide detectar. **La prueba de disponibilidad
tiene que leer el crudo**, no la vista. Es el mismo patrón que el de las pruebas de validez física
leídas contra vistas corregidas ([[silencio-leido-como-salud]]), y va junto con el otro bug de la
misma vista en [[vista-corregida-no-corrige]].

### Consecuencia sobre el veredicto por día

~~Los **238 días en grave** por `voltaje_vac = 0` dejan de estarlo.~~ **Corregido el 2026-08-31, y
la distinción importa:** los conteos eran correctos (7.955 lecturas, 238 días con el hallazgo), la
**atribución causal no**. Quitar el rango 100-280 **no mueve ni un día**: el veredicto eléctrico
queda en **206 grave · 68 aviso · 0 ok**, exactamente igual que antes. Esos 238 días **ya estaban
graves por otra cosa**, así que el rango era ruido encima de un veredicto ya saturado.

Los bloqueantes reales del verde, en orden: la **columna AC ausente** de nov-2025 a feb-2026
(**129 días**, triple contada), el **DS18B20 muerto** (**111 días**) y **`ruido_excesivo` en
severidad `aviso`**, que hace el verde imposible por construcción (bajándolo a `info` pasan **15
días a verde**). Hoy llega a verde **un solo día, el 2026-04-09**, y solo en el eje eléctrico.
Detalle en [[store-hallazgos-calidad]] y [[inversor-sin-acoplar]].

## Consulta 3: la energía del tablero, continua o alterna

Se preguntó si la casilla del tablero significa energía en continua (la suma de los dos arreglos)
o en alterna, porque el doc de evaluación pide "energía total producida" y no dice de qué columna
sale (ambigüedad 3 de [[catalogo-metricas-evaluacion]]).

> Tenemos dos: energia_hoy y Energia total. Ambas son energias totales en AC.
> Sera siempre un poco menor a la suma de las de PV1 y PV2 porque consideran las
> perdidas del inversor. Normalmente ambas pueden ser utiles. La primera se
> resetea todos los dias y la otra se resetea cuando llega a su valor maximo
> segun el tipo de variable. Con estas vale la pena calcular la energia en otros
> periodos, por ejemplo energia del mes y energia del ano. Puede hacerse con
> cualquiera de las dos.

**Es AC**, y sale de `energia_hoy_wh` o `energia_total_wh`. No de integrar la potencia DC.

### Qué cambia en la implementación

1. **La energía del tablero es AC.** El número que se venía publicando (1.522,78 kWh, integral de
   la potencia DC corregida) **no es esa casilla**: es la suma DC de los dos arreglos, que
   responde otra pregunta. Leo lo dice explícitamente: la AC será siempre un poco menor, porque
   considera las pérdidas del inversor.
2. **Las dos columnas sirven**, y con cualquiera de las dos se puede calcular la energía de otros
   períodos (mes, año).
3. **Las dos son contadores que se reinician:** `energia_hoy_wh` cada día, `energia_total_wh` al
   llegar a su valor máximo. Un contador que se reinicia **no se lee con `max()`**: se lee sumando
   incrementos y tratando los saltos negativos como reinicios.
   ⚠️ **Matizado el 2026-08-31, con la medición en la mano.** `energia_hoy_wh` sí se reinicia cada
   día. **`energia_total_wh` no se reinicia ni una vez** en toda la serie (0 reinicios en 19.889
   lecturas; va monótona de 182,3 a 2.710,7 kWh), lo que no contradice a Leo: dijo que se reinicia
   *"cuando llega a su valor maximo"* y todavía no llegó. Y la receta de sumar incrementos
   **necesita una tolerancia**: sin ella, 37 saltos de ruido de punto flotante de 1e-13 se leen
   como reinicios y el total da **89.661,5**, un número absurdo. Con tolerancia de 0,001 el
   resultado correcto es el último menos el primero. Ver [[energia-ac-tablero]].

### Advertencia técnica: los 39 MWh que descartaron el contador se midieron sobre la tabla sucia

El argumento con que se descartó el acumulador del inversor fue que `max(energia_total_wh)` daba
**39.328.367**, imposible para 2,84 kWp. Ese máximo se midió sobre `monitoreo_sc_electrico`,
que es la tabla **cruda y contaminada** con filas del piranómetro (por eso
`max(potencia_pv1_w)` da 26.503.162 W en un arreglo de 1.420 Wp, ver [[filas-mezcladas]]).

> ✅ **RESUELTO el 2026-08-31, y la sospecha era correcta: el contador SÍ sirve.**
> El detalle está en [[energia-ac-tablero]] y la medición completa en
> `../../referencia/medicion-energia-ac.md`. Lo esencial:
>
> - De las **466 filas** con firma de contaminación, **una sola** trae `energia_total_wh`: la del
>   **`2025-10-07 07:45`**, la misma que produce los 26 MW de `potencia_pv1_w`. Sin ella el máximo
>   es **2.710,7 kWh**, que son 571 kWh/kWp/año en 569 días: bajo, pero físico.
> - **Descartamos el contador por leer la tabla contaminada**, y ese descarte llegó hasta el
>   documento que se le envió al equipo. Hay que decirlo así.
> - **La cobertura ya no está sin medir.** `energia_hoy_wh` cubre 270 días y `energia_total_wh`
>   147; `energia_pv1_wh` y `energia_pv2_wh` solo **144 días**, y **ninguno entre nov-2025 y
>   feb-2026**, que es un límite duro para el PR diario de la consulta 1a.
> - ⚠️ **La vista corregida no corrige nada de esto:** las cuatro columnas de energía pasan **sin
>   ningún `CASE`**, así que devuelve los mismos 39 MWh que la cruda → [[vista-corregida-no-corrige]].

### El hueco de cuatro meses del tablero AC no existe

La consulta 3 terminaba preguntando qué mostrar en los cuatro meses sin dato AC si la energía
tenía que ser alterna. **No hay que decidir nada: el dato estaba en otra columna.**
`energia_hoy_wh` tiene **13.923 lecturas en 118 días** entre noviembre 2025 y febrero 2026, justo
donde `potencia_total_wac`, `energia_total_wh`, `energia_pv1_wh` y `energia_pv2_wh` están al 100 %
en NULL. Espejo del mismo fenómeno: noviembre 2024 tiene AC y cero DC. Medido el 2026-08-31,
detalle en [[energia-ac-tablero]].

### La predicción de R7 se cumple, medida

Leo dijo que la AC sería *"siempre un poco menor"* que la suma de PV1 y PV2. Contador contra
contador, sobre 129 días: **mediana 0,958** (p05 0,944, p95 1,000), o sea una eficiencia de
inversor del 95,8 %. Solo 3 días pasan de 1 y los tres están truncados.

Contra la **integración** DC (los 1.522,78 kWh) la razón sale 1,128, o sea el AC 13 % mayor, y la
causa medida es que **la integración DC subestima un 14 %** por pesar cada fila a 5 minutos aunque
el día tenga huecos internos. Es la advertencia A de más arriba en su versión eléctrica.

### Las columnas están en kWh, no en Wh

Hallazgo del 2026-08-31 que no estaba en ninguna nota y que **condiciona toda cifra de energía**:
pese al sufijo `_wh`, una unidad de esas cuatro columnas vale **1 kWh**. Verificado por dos vías
(la razón contra `potencia_total_wac` integrada da mediana 1.003,58 sobre 127 días, y el
rendimiento específico implícito da máximo exactamente 5,00 kWh/kWp/día). Quien lea el nombre se
equivoca por un factor de mil → [[unidades-energia-kwh]].

Las cuatro columnas existen con esos nombres exactos, verificado en `monitoreo_sc_electrico`.

## Los tres hechos de contexto

Se reportaron tres hechos, sin pregunta explícita. Leo respondió a los tres.

| Hecho reportado | Respuesta verbatim |
|---|---|
| El SP722 registró solo 18 días (2026-05-11 a 2026-05-28, 360 lecturas) | *"Esto esta bien, lo que pasa es que fue una medicion adicional que se incorporo"* |
| El piranómetro de reflejada se instaló el 2025-10-25, así que el albedo tiene 7 meses y no 19 | *"Misma situacion que el anterior"* |
| El sistema dejó de reportar el 2026-06-01 | *"Vamos a revisar esto"* |

Los dos primeros quedan **explicados**: son mediciones adicionales incorporadas después, no una
falla. La ventana corta es la que hay, y sigue siendo el presupuesto disponible para cualquier
análisis de albedo o de calibración con el SP722 ([[fuentes-fisicas]]).

El tercero queda **en manos de Leo**: dijo que lo van a revisar. Anotado en [[bloqueantes]] como
pendiente de tercero, con la fecha en que se le pasó.

## Reglas del proyecto que esta ronda no toca

Siguen mandando, y conviene repetirlas porque cualquier implementación de lo de arriba las
atraviesa:

- **Los timestamps NO son UTC.** Son hora local de Costa Rica etiquetada `+00`. Nunca
  `AT TIME ZONE`, nunca conversión de zona. `extract(hour from timestamp)` ya devuelve la hora
  local, que es justamente lo que necesita la ventana de 7:00 a 17:00 de la consulta 2.
- **Nunca calcular desde `monitoreo_sc_electrico`**: se usan las vistas corregidas
  (`v_sc_electrico_corregido`, `v_sc_radiacion_corregida`, `v_sc_radiacion_calibrada`). La única
  excepción es medir la contaminación misma.
- **La base es de solo lectura.** Nada de DDL, nada de escrituras.
- **`metrica(valor, n, unidad)` con n = 0 devuelve `None`, jamás cero.**
- 1.420 Wp por arreglo, 2.840 Wp total. **PV1 = Inclinado** (20°, azimut 150). **PV2 = Vertical**
  (90°, azimut 50). Ver [[geometria-sistema]].

Relacionado: [[respuestas-leo-cardinale]], [[performance-ratio-diario]],
[[inversor-sin-acoplar]], [[energia-ac-tablero]],
[[unidades-energia-kwh]],
[[vista-corregida-no-corrige]], [[emparejamiento-por-timestamp]],
[[store-hallazgos-calidad]], [[pruebas-calidad-umbrales]], [[catalogo-metricas-evaluacion]],
[[geometria-sistema]], [[capa-analitica]], [[muestreo-variable]], [[filas-mezcladas]],
[[silencio-leido-como-salud]], [[fuentes-fisicas]], [[implementacion]], [[decisiones]],
[[bloqueantes]], [[abiertos]], [[pendientes-evaluacion-datos]], [[estado]].
