# Respuestas de Leo Cardinale a "Consultas sobre la data"

Fuente: `consultas-sobre-la-data-Rev-LCV.pdf` (raiz del repo). Son **anotaciones
PDF** firmadas `lcardinale`, fechadas 2026-08-30 entre 22:47 y 23:08 CST. No se
ven con `pdftotext`: hay que extraerlas del objeto de anotaciones.

Abajo van **verbatim**. No las parafrasees al implementarlas: si algo no cuadra
con el dato, se anota como discrepancia y se consulta, no se ajusta la cita.

---

## R1 — sobre la pregunta 1a (emparejamiento potencia/irradiancia)

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

**Lectura:** no eligio ninguna de las dos opciones que le ofreci (timestamp
exacto vs. promedio de ventana). Cambio la unidad de analisis: el PR deja de ser
una metrica de 5 minutos y pasa a ser **diaria y mensual**, calculada con los
**acumuladores de energia** (`energia_pv1_wh`, `energia_pv2_wh`) contra la
**irradiacion integrada del dia**. El emparejamiento fino sigue existiendo, pero
para analisis punto a punto, no para el PR.

## R2 — sobre la pregunta 1b (irradiancia en el plano). **ESTA ES LA QUE ESPERA A HUGO**

> Para el performance_ratio de cada arreglo, idealmente debemos trabajar para la
> radiacion en el plano, pero como lo que tenemos es radiacion horizontal,
> debemos aplicar un modelo matematico que hace el ajuste, entonces tendremos una
> radiacion para cada uno en particular. Sobre esto podrias consultar a Hugo cual
> ecuacion utilizar.

**Lectura:** el PRINCIPIO esta confirmado (si, irradiancia por plano, una por
arreglo). Lo que falta es **cual ecuacion de transposicion**. Nosotros ya
tenemos POA modelada con pvlib en `radiacion_sc_poa`; no estamos parados,
estamos pendientes de que Hugo confirme o cambie el modelo.

## R3 — sobre la pregunta 2 (voltaje AC en cero)

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

**Lectura:** el 0 V **es dato valido**. El rango 100-280 V como prueba de validez
fisica esta mal planteado. Se reemplaza por una prueba distinta, **condicionada
por hora y por irradiancia**, y que ademas ya no habla de calidad del dato sino
de **disponibilidad del equipo**.

## R4 — sobre el hecho "SP722 solo 18 dias"

> Esto esta bien, lo que pasa es que fue una medicion adicional que se incorporo

## R5 — sobre el hecho "piranometro de reflejada desde 2025-10-25"

> Misma situacion que el anterior

## R6 — sobre el hecho "el sistema dejo de reportar el 2026-06-01"

> Vamos a revisar esto

## R7 — sobre la pregunta 3 (energia del tablero: continua o alterna)

> Tenemos dos: energia_hoy y Energia total. Ambas son energias totales en AC.
> Sera siempre un poco menor a la suma de las de PV1 y PV2 porque consideran las
> perdidas del inversor. Normalmente ambas pueden ser utiles. La primera se
> resetea todos los dias y la otra se resetea cuando llega a su valor maximo
> segun el tipo de variable. Con estas vale la pena calcular la energia en otros
> periodos, por ejemplo energia del mes y energia del ano. Puede hacerse con
> cualquiera de las dos.

**Lectura:** la casilla del tablero es **AC**, y sale de `energia_hoy_wh` o
`energia_total_wh`, no de integrar la potencia DC. Las dos son **contadores que
se reinician**: `energia_hoy_wh` cada dia, `energia_total_wh` al llegar a su
maximo. Un contador que se reinicia no se lee con `max()`: se lee sumando
incrementos y tratando los saltos negativos como reinicios.

---

## Columnas reales (verificadas en `monitoreo_sc_electrico`)

Las cuatro que Leo nombra existen, con estos nombres exactos:

`energia_hoy_wh`, `energia_total_wh`, `energia_pv1_wh`, `energia_pv2_wh`

---

## Tres advertencias tecnicas que el equipo tiene que tener presentes

Ninguna contradice a Leo. Son cosas que su respuesta da por sentadas y que en
nuestro dato no se cumplen.

### A. `Irradiancia*5/60` supone cadencia de 5 minutos, y la nuestra no lo es

La formula convierte W/m2 a Wh/m2 multiplicando por 5 min / 60 min. Es correcta
**si cada lectura cubre 5 minutos**. `radiacion_sc_15s` tiene saltos reales de
15, 30, 45, 60, 75, 300, 315 y 330 s segun la epoca. Aplicar `5/60` a un tramo de
15 s multiplica la irradiacion de ese tramo por **veinte**.

La generalizacion correcta, y es la que hay que implementar:

    radiacion_intervalo_wh_m2 = irradiancia_wm2 * (dt_real_segundos / 3600)

donde `dt_real` es `lead(timestamp) - timestamp`, **acotado a un techo con
nombre** (sin techo, el salto nocturno de 40.200 s se integra como once horas de
sol). Con cadencia de 5 min esta formula da exactamente lo que dice Leo.

### B. La tabla cruda esta contaminada: los 39 MWh pueden no ser del inversor

`max(energia_total_wh)` = 39.328.367 Wh se midio sobre `monitoreo_sc_electrico`,
que tiene filas del piranometro mezcladas (por eso `max(potencia_pv1_w)` da
26.503.162 W en un arreglo de 1.420 Wp). **Hay que volver a medir los cuatro
acumuladores sobre la vista corregida antes de afirmar que el contador no sirve.**
Es posible que el descarte del contador en la consulta 3 haya sido un artefacto
de leer la tabla sucia.

### C. La irradiancia previa al 2025-07-01 es NULL por decision del equipo

La variante "irradiancia > 300 W/m2" de R3 solo puede evaluarse desde julio 2025.
Antes de esa fecha la prueba tiene que caer al criterio horario, y decirlo.

---

## Reglas del proyecto que siguen mandando

- **Los timestamps NO son UTC.** Son hora local de Costa Rica etiquetada `+00`.
  Nunca `AT TIME ZONE`, nunca conversion de zona. `extract(hour from timestamp)`
  ya devuelve la hora local. Verificado: pico de irradiancia en la hora 11-12,
  cero en la 5 y la 17, contra `ventana_solar` (amanecer 05:26, atardecer 17:20).
- **Nunca calcular desde `monitoreo_sc_electrico`**: usar las vistas corregidas
  (`v_sc_electrico_corregido`, `v_sc_radiacion_corregida`, `v_sc_radiacion_calibrada`).
  La unica excepcion es medir la contaminacion misma.
- **La base es de SOLO LECTURA.** Nada de DDL, nada de escrituras.
- **`metrica(valor, n, unidad)` con n = 0 devuelve `None`, jamas cero.**
- 1.420 Wp por arreglo, 2.840 Wp total. **PV1 = Inclinado** (20 grados, azimut
  150). **PV2 = Vertical** (90 grados, azimut 50).
