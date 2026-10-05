---
name: store-hallazgos-calidad
description: Estado real de hallazgos_calidad tras correr el barrido completo en producción el 2026-08-28 (de 3.158 a 23.533 filas, 23 tipos, 6 fuentes) y el problema de producto que dejó: ningún día queda en verde. El falso positivo de voltaje_vac = 0 quedó RESUELTO el 2026-08-30 (Leo: el 0 es dato válido; la prueba pasa a ser de disponibilidad del equipo) y hay que re-correr el barrido. Las duplicaciones de detectores siguen sin resolver
categoria: datos
actualizado: 2026-09-01
tags: [calidad, hallazgos, barrido, veredicto, supabase, evaluacion-datos]
---

# El store de hallazgos después del barrido completo

**Corrido en producción el 2026-08-28.** Es un cambio de estado de la base, no una medición:
`hallazgos_calidad` quedó con contenido distinto del que documentaba
[[agente-historico-calidad]].

| | Antes (barrido del 2026-08-24) | Después (2026-08-28) |
|---|---|---|
| Filas | 3.158 | **23.533** |
| Tipos de hallazgo | 10 | **23** |
| Fuentes | 2 | **6** |

Reparto por severidad: **4.071 graves · 8.498 avisos · 10.964 info**.

Fuentes nuevas en el store: `radiacion_sc_poa`, `radiacion_sc_clearsky`,
`v_sc_radiacion_calibrada` y `sin_fuente`. Esta última es deliberada: las **cuatro** variables que
el doc de evaluación pide y que **ninguna tabla contiene** (humedad relativa, temperatura
ambiente, viento, precipitación) están en el catálogo marcadas con **`fuente_ausente` y su
motivo**, y su prueba de validez física **se implementa igual y se reporta con ese estado** en vez
de omitirse, quedando en el store bajo la fuente `sin_fuente`. Así el hueco queda **medido y
visible** en vez de desaparecer ([[pendientes-evaluacion-datos]], [[silencio-leido-como-salud]]).

**Idempotencia verificada:** el barrido se corrió dos veces sobre el mismo rango y el conteo
quedó idéntico.

## El problema de producto: ningún día queda en verde

El veredicto por día quedó así, sobre 569 días de calendario:

| Veredicto | Días |
|---|---|
| `ok` | **0** |
| `aviso` | 16 |
| `grave` | 258 |
| `sin_datos` | 295 |

> **Corrección del 2026-08-31, y la distinción es sutil.** Sobre los **274 días con dato
> eléctrico**, el veredicto real es **206 grave · 68 aviso · 0 ok**. La tabla de arriba es el
> veredicto **global** sobre el calendario entero, que mezcla el eje de radiación. Los dos son
> ciertos y responden preguntas distintas; hay que decir siempre cuál se está citando
> ([[inversor-sin-acoplar]]).

**Cero días en verde.** Un eje de veredicto donde nada es nunca "ok" no informa de nada: es el
mismo fallo que la vista «Calidad de datos» ya había encontrado el 2026-08-24 cuando el veredicto
combinado daba 226 graves y cero días ok, y que se corrigió entonces separando por fuente y
metiendo el criterio de materialidad (`FRACCION_MATERIAL`). El barrido completo lo volvió a
producir, ahora por otras causas.

Causas que se creyeron dominantes el 2026-08-28, en el orden en que se anotaron entonces:

1. **`voltaje_vac = 0` marcado fuera de rango: 238 días.** Es un **falso positivo**, ver abajo.
   **Causa cerrada el 2026-08-30**: Leo confirmó que el 0 es dato válido
   ([[respuestas-lcv-consultas-agosto]]).
2. **Columnas AC vacías durante cuatro meses, contadas por TRES detectores a la vez:** ~127 días.
3. **Termopar saturado en 85 °C:** 115 días ([[temperatura-85]]).

### ⚠️ La atribución causal del punto 1 es FALSA, medido el 2026-08-31

Los **conteos** eran correctos (7.955 lecturas, 238 días con hallazgo grave de `fuera_de_rango` en
`voltaje_vac`). Lo falso es la **causalidad**: se dijo que ese era *el motivo principal* de que
ningún día quede en verde, y no lo es.

**Quitar el rango 100-280 no mueve ni un día:** 206 graves antes y **206 después**. Los 238 días
que marcaba la regla vieja **ya estaban graves por otra cosa**. El rango 100-280 no era el cuello
de botella del veredicto: era **ruido encima de un veredicto que ya estaba saturado**.

Es una distinción sutil y se va a volver a confundir, así que conviene decirla con todas las
letras: **"esta prueba marca 238 días" y "esta prueba es la causa de que 238 días estén en rojo"
no son la misma afirmación**, y la segunda hay que medirla aparte, quitando la prueba y volviendo
a correr el veredicto.

### Los bloqueantes reales del verde, en orden (medido 2026-08-31)

| # | Causa | Días graves |
|---|---|---|
| 1 | **La columna AC no vino en el CSV** (nov-2025 a feb-2026), triple contada como `valor_nulo` + `parametro_faltante` + `columna_ausente` | **129** |
| 2 | **DS18B20 muerto**, saturado en 85 °C ([[temperatura-85]]) | **111** |
| 3 | `inversor_sin_acoplar` con la regla nueva | 40 |
| | unión de 1 y 2 | **145 de 193** |

Y por debajo de todo eso hay un cuarto bloqueante que actúa sobre los días que **no** son graves:
**`ruido_excesivo` en severidad `aviso`**. Dispara sobre casi todas las variables de casi todos los
días (442 hallazgos en los 80 días que quedan en aviso), y como el veredicto `ok` exige **cero**
hallazgos graves **y cero avisos**, mientras siga en `aviso` **el verde es inalcanzable por
construcción**. Medido: **bajándolo a `info`, los días verdes pasan de 1 a 15**.

Hoy **un solo día llega a verde, el 2026-04-09**, y solo en el eje eléctrico: en el global sigue en
grave porque ese día la radiación está en grave.

## Conclusión de diseño: el veredicto por día no es la señal útil de este dataset

Lo que sí informa es el **bloque `confianza` por variable**. Un día puede tener la potencia DC
impecable y la AC inexistente, y un solo semáforo miente en las dos direcciones: en verde
esconde que la mitad del día no existe, y en rojo descarta la mitad que sí sirve.

La consecuencia práctica: quien consulte una métrica tiene que recibir la confianza **de las
columnas de las que esa métrica depende**, no el veredicto global del día. Eso ya es el contrato
de `calidad.contexto.confianza` ([[capa-analitica]]); lo que queda es dejar de presentar el
veredicto diario como si fuera la respuesta.

**Esto no significa borrar el veredicto por día**: sigue sirviendo para el mapa de calendario,
que es donde se ven los 295 días que no existen ([[gaps-temporales]]). Significa que no es lo que
hay que poner delante de una métrica.

## Falso positivo: `voltaje_vac = 0` no es un valor fuera de rango

El rango de validez definido es **100 a 280 V**. Con él quedan **7.955 lecturas marcadas**, pero:

- **7.873 valen exactamente 0.**
- La mediana de la columna es **212,4 V** y el máximo **218,8 V**.

Cero voltios es el **inversor sin exportar** (de noche, al amanecer), no un error de medición. La
distribución lo confirma: cuando el inversor exporta, el voltaje está donde tiene que estar y ni
una lectura se acerca al borde superior del rango.

~~Es la **causa principal de que 238 días queden en grave**.~~ **Corregido el 2026-08-31: marca
238 días, pero no es la causa de que estén en rojo** (quitarla deja el veredicto en 206 y 206). Ver
la corrección de arriba. Es exactamente la misma trampa que ya se había separado en
`constante_en_cero` para el caso del flatline ([[agente-historico-calidad]]): un cero operativo no
es una avería.

~~**Pendiente de decisión del equipo**~~ **RESUELTO el 2026-08-30 por Leo Cardinale**
([[respuestas-lcv-consultas-agosto]]). Salió como consulta en
`docs/equipo/consultas-sobre-la-data.pdf` y volvió respondida.

### La resolución: el 0 V es válido y la prueba cambia de familia

Leo confirmó que la medición corresponde a **la tensión AC que genera el inversor** (lo dedujo
justamente del 0 V nocturno que se le reportó), así que **el cero es dato válido**. El rango
100-280 V como prueba de **validez física** queda retirado.

En su lugar va una prueba de **disponibilidad del equipo**: detectar `voltaje_vac`,
`frecuencia_hz` y `potencia_total_wac` en 0 **durante el día, entre las 7:00 y las 17:00**, porque
eso significa que el sistema no está tratando de acoplarse a la red AC y hay que ir a revisarlo.
Refinamiento opcional si aparecen muchas falsas alarmas: exigir además irradiancia **mayor a unos
300 W/m²**. Ampliar la ventana hacia el amanecer y el atardecer lo desaconseja el propio Leo, por
falsas alarmas.

Cambia el significado del hallazgo: ya no dice "este dato es malo", dice "el equipo no está
exportando cuando debería". Es una alerta operativa, no una marca de calidad del dato.

⚠️ **Y hay una trampa para implementarla, medida el 2026-08-31:** `v_sc_electrico_corregido`
anula esos mismos ceros (`CASE WHEN voltaje_vac < 100.0 OR voltaje_vac > 280.0 THEN NULL`), así que
**la prueba de disponibilidad no se puede implementar sobre la vista corregida**: tiene que leer el
crudo, o dará siempre cero inversores caídos ([[vista-corregida-no-corrige]]).

### El ensayo del barrido nuevo (2026-08-31, escrituras anuladas)

La prueba de disponibilidad ya está implementada y el barrido se corrió **con las escrituras
anuladas**, así que **el store todavía no cambió** ([[implementacion-decisiones-lcv]]):

| | Ensayo |
|---|---|
| Hallazgos totales | **25.720** (contra 23.533 hoy) |
| `inversor_sin_acoplar` | **190 filas en 96 días** |
| de esas, graves bajo sol (GHI >= 300) | 135 |
| avisos por irradiancia baja | 37 |
| avisos con motivo `sin_irradiancia` | 18 |

El reparto de severidades confirma que **la irradiancia gradúa y no filtra**: los 18 días sin
irradiancia **aparecen igual**, con su motivo, en vez de desaparecer ([[inversor-sin-acoplar]]).

**Qué falta hacer acá:** **re-correr el barrido** de verdad, con el rango retirado y la prueba nueva
puesta. Es una de las **dos únicas escrituras a producción** pendientes, y la decide Izack.
⚠️ **Pero no esperar que eso destrabe el verde:** medido el 2026-08-31, quitar el rango deja el
veredicto **exactamente igual** (206 y 206). Lo que hay que atacar para ver días verdes es, en
orden, la columna AC ausente (129 días), el DS18B20 (111) y **`ruido_excesivo` en severidad
`aviso`**, que es el que hace el verde imposible por construcción. Ver arriba y
[[inversor-sin-acoplar]].

## Deuda: cuatro detectores para dos hechos

Detectada y **no resuelta**. Son duplicaciones reales en el store, no ruido de conteo:

1. **`nulos` (detector viejo del barrido) y `valor_nulo` (detector nuevo) escriben exactamente el
   mismo hecho**, con idéntico conteo e idéntica severidad, para las **12 variables eléctricas**.
2. **`valor_nulo`, `parametro_faltante` y `columna_ausente` disparan los tres** sobre
   `frecuencia_hz`, `temperatura_inversor_c` y `potencia_total_wac` durante ~127 días con
   fracción 1,0.

O sea: **cuatro detectores para dos hechos** ("esta columna no vino en el CSV" y "esta lectura es
nula"). Infla el conteo del store, multiplica por tres el peso de las columnas AC en el veredicto
del día, y hace que cualquier resumen por tipo de hallazgo cuente lo mismo varias veces.

Resolverlo es decidir **cuál detector es el dueño de cada hecho** y que los demás cedan, no
sumarlos. Anotado en [[abiertos]].

## Después de la carga del 2026-09-01: 34.408 hallazgos y una quinta parte que no pesa

Con los 57 días nuevos ingestados ([[dataset-actual]]) y el recorrido completo corrido,
`hallazgos_calidad` quedó en **34.408 filas**.

| Momento | Filas |
|---|---|
| Barrido del 2026-08-24 | 3.158 |
| Barrido completo del 2026-08-28 | 23.533 |
| Antes de la carga del 2026-09-01 | **28.509** |
| Después de la carga y el recorrido completo | **34.408** |

⚠️ **Hueco marcado, y es de auditoría.** Esta memoria documenta 23.533 al 2026-08-31 y el
2026-09-01 la cuenta arranca en **28.509**. **La corrida que produjo esa diferencia no quedó
registrada** (lo esperable es el re-corrido del barrido con la prueba de disponibilidad puesta, que
en ensayo daba 25.720, pero eso no cuadra con 28.509 y no hay que darlo por hecho). Si alguien
tiene que reconstruir de dónde sale cada hallazgo, ese salto es el punto ciego.

**Y la carga estuvo a punto de no verse.** Corriendo solo el barrido, el veredicto siguió
informando **274 días con datos cuando la base ya tenía 331**, porque su calendario sale de
`ventana_solar` y esa tabla terminaba el 2026-06-01. Regla operativa y cifras del arreglo en
[[regla-post-carga]].

### 5.325 hallazgos de 28.509 no pueden pesar jamás en ningún veredicto

Lo descubrió la vista de Calidad al construirse ([[vistas-frontend]]), medido sobre los 28.509
previos a la carga:

> **Casi uno de cada cinco hallazgos del store no cuenta para nada**, y hasta ahora se mostraba
> mezclado con los que sí.

El motivo ya tenía nombre: **su fuente no tiene denominador contable**. Son los hallazgos sobre las
**cuatro POA**, `kt_star` y `cs_ghi_wm2`; `contexto.py` no sabe contar filas de esas fuentes, así
que la materialidad (`n_afectadas >= 0,20 × n_dia`) no se puede evaluar y el hallazgo queda fuera
del veredicto ([[abiertos]]).

No es un bug nuevo: es la cara visible de un pendiente conocido. Lo nuevo es **que ahora se ve**. El
backend publica dos campos separados, **`hallazgos_en_el_periodo`** y
**`cuentan_para_el_veredicto`**, en vez de un total que se leía como si todo pesara.

Es la misma familia de [[silencio-leido-como-salud]] en su versión menos obvia: no es un cero que se
lee como salud, es **un total grande que se lee como cobertura**.

## Cómo re-verificarlo

Las consultas de referencia viven en [[verificacion-numeros]]. Los conteos de arriba hay que
re-medirlos cada vez que se corra el barrido: son un corte fechado, igual que el resto de las
cifras de la consola.

Relacionado: [[dataset-actual]], [[regla-post-carga]], [[vistas-frontend]],
[[respuestas-lcv-consultas-agosto]], [[inversor-sin-acoplar]],
[[implementacion-decisiones-lcv]],
[[vista-corregida-no-corrige]],
[[energia-ac-tablero]], [[agente-historico-calidad]], [[capa-analitica]], [[pruebas-calidad-umbrales]],
[[silencio-leido-como-salud]], [[temperatura-85]], [[gaps-temporales]],
[[emparejamiento-por-timestamp]], [[verificacion-numeros]], [[abiertos]],
[[pendientes-evaluacion-datos]].
