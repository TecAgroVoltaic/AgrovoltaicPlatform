---
name: inversor-sin-acoplar
description: La detección del inversor caído que pidió Leo en R3, medida contra producción el 2026-08-31. La premisa de Leo (el 0 V es de noche) es falsa pero su conclusión es correcta. Incluye la regla recomendada (ventana fija 07-17, irradiancia como graduador y nunca como filtro) y, desde el 2026-09-01, la parte que deja de ser historia: el código de error 302 y los dos días de generación cero, uno de ellos el último día que tenemos
tags: [disponibilidad, inversor, voltaje-ac, calidad, r3, evaluacion-datos, agente-historico]
---

# Detectar el inversor sin acoplar (R3)

**Medición de solo lectura contra producción, el 2026-08-31.** Es la respuesta a **R3** de
[[respuestas-lcv-consultas-agosto]]: el 0 V de AC es dato válido, y lo que hay que detectar es el
inversor que no se acopla a la red entre las 7 y las 5. **Detalle completo, con el SQL:**
`../../referencia/medicion-inversor-caido.md`.

Cierra la consulta 2 de las tres que se le enviaron al equipo.

## La premisa de Leo es falsa, su conclusión es correcta, y hay que decirle las dos cosas

Leo escribió: *"Si indicas que marca 0V en la noche, quiere decir que corresponde a la tension AC
que genera el inversor"*. Es un razonamiento correcto sobre una observación que **nuestro dato no
respalda**.

**Discrepancia 1: no hay noche que medir.** La tabla eléctrica tiene **7 filas en todo el
histórico** fuera de la franja de 05 a 17 h. El logger solo graba de día, porque se alimenta del
propio inversor. La observación *"marca 0 V en la noche"* **no puede salir de esta tabla**.

**Discrepancia 2: el 0 V no se concentra al amanecer ni al atardecer.** Es un **20 % plano a todas
las horas**, mediodía incluido: **581 lecturas de 0 V entre las 12 y las 13 h**. Contra la ventana
solar real, el **98,5 % de todos los ceros cae entre el amanecer y el atardecer**.

**Pero la conclusión se sostiene por otra vía, y es más fuerte que la original:**

| Estado de `voltaje_vac` | lecturas | DC = 0 W | DC > 50 W |
|---|---|---|---|
| `= 0` | 7.872 | **7.872 (100 %)** | **0** |
| `> 0` | 26.460 | 643 | 23.236 |

El acoplamiento es total: **cuando el AC está en 0, la potencia DC es 0 en el 100 % de los casos**,
y **no existe ni una sola lectura con 0 V de AC y más de 50 W de DC**. La medición es efectivamente
de la tensión que genera el inversor.

Y el motivo real no es la noche: de esos 7.872 ceros, **7.639 (el 97 %, en 99 días) tienen tensión
de string por encima de 50 V**, o sea **el arreglo energizado con el inversor sin acoplar**, a
plena luz. **El fenómeno que Leo quería ir a buscar entre las 7 y las 5 es la mayoría del dato, no
la excepción.**

> Se registra con las dos partes a propósito. Una conclusión correcta apoyada en una premisa falsa
> es exactamente el tipo de cosa que hay que poder reconstruir después, cuando alguien pregunte de
> dónde salió la regla.

**Ojo con la tensión de string como sensor de luz:** durante los eventos vale unos **175 V
constantes en todas las bandas de irradiancia** (165,8 V con GHI < 50 y 175,7 V con GHI 300-600).
Es una lectura de reposo del inversor, no una Voc que siga al sol, así que **no sirve** para
condicionar la regla: filtrar por tensión DC deja 6.320 de 6.330 lecturas, o sea no filtra nada.

## De dónde se lee, y las dos trampas de leerlo

Las tres variables se leen de **`monitoreo_sc_electrico` cruda**, que es la excepción legítima a la
regla del proyecto, igual que medir la contaminación. La vista corregida **borra la evidencia**:
convierte en NULL los 7.872 ceros de `voltaje_vac` y los 3.760 de `frecuencia_hz`
([[vista-corregida-no-corrige]]).

**Trampa 1: descartar la contaminación por FIRMA, nunca por el rango de la variable que se mide.**
Se descartan **490 filas en 46 días** por magnitudes imposibles para un inversor de 2,84 kWp,
quedando 35.979 filas útiles en 274 días. De esas 490, **una sola** habría sido marcada por la
regla nueva: el efecto de la contaminación sobre esta medición es de **1 lectura en 6.330**. (Son
490 y no las 466 de [[energia-ac-tablero]] porque la firma acá es más ancha: suma corriente > 20 A,
`potencia_total_wac` > 5.000 y temperatura de inversor > 100 °C. No se contradicen, una contiene a
la otra.)

**Trampa 2: `IS NOT TRUE` y no `NOT (...)`.** Con NULLs de por medio, `NOT(NULL)` descarta la fila,
y escribir `NOT (firma)` reduce la base de 35.979 a **18.005 filas en 132 días**: **se pierde la
mitad del histórico sin ningún aviso**. Es el patrón de [[silencio-leido-como-salud]] en su forma
más barata de cometer.

## Rendimiento de la regla horaria

Regla nueva: dentro de 07:00-17:00 y alguna de las tres variables AC en 0. Regla vieja:
`voltaje_vac` fuera de [100, 280].

| | lecturas | días |
|---|---|---|
| **Regla vieja** (rango 100-280, sin hora) | 7.954 | **238** |
| `voltaje_vac = 0` en 07-17 | 6.299 | 93 |
| `frecuencia_hz = 0` en 07-17 | 2.915 | 47 |
| `potencia_total_wac = 0` en 07-17 | 2.946 | 49 |
| **alguna de las tres en 07-17** | **6.330** | **95** |

La regla nueva marca 1.624 lecturas menos (−20 %) pero sobre todo **143 días menos** (238 a 95,
−60 %): la vieja se dispara con una sola lectura de borde y contamina el día entero, la nueva exige
que el apagón caiga en el núcleo del día.

`frecuencia_hz` y `potencia_total_wac` marcan la mitad que `voltaje_vac` por una razón ajena a la
prueba: **son NULL al 100 % de nov-2025 a feb-2026** porque la columna no vino en el CSV. En esos
cuatro meses **la única de las tres que puede detectar algo es `voltaje_vac`**.

**No son parpadeos, son apagones.** De los 95 días marcados, la fracción de la ventana afectada
tiene **mediana del 68,9 %**, y **32 días son apagones de día entero** (más del 90 % de la
ventana).

## La regla recomendada: la irradiancia gradúa, no filtra

**Ventana fija 07:00-17:00, con la irradiancia como graduador de severidad y no como filtro de
existencia.** En una frase: se marca por hora, se gradúa por sol, y cuando no hay sol medido se
marca igual y se dice que no se pudo graduar.

```
marcada    := 07:00 <= hora < 17:00  y  (voltaje_vac = 0 o frecuencia_hz = 0 o potencia_total_wac = 0)
ghi        := promedio de irradiancia_incidente sobre date_bin de 5 min   (NUNCA por igualdad de timestamp)
severidad  := grave                              si GHI >= 300
              aviso                              si GHI <  300
              aviso con motivo `sin_irradiancia` si GHI es NULL
```

### Por qué esta y no las otras, con los números

| Variante | Condición | lecturas | días |
|---|---|---|---|
| **A** horaria | 07-17 | **6.330** | **95** |
| B irradiancia sola | GHI >= 300 | 2.747 | 69 |
| C horaria + irradiancia | 07-17 y GHI >= 300 | 2.728 | 69 |
| D ventana solar | amanecer a atardecer | 8.073 | **224** |

- **Contra la ventana solar (D): 224 días contra 95.** Leo lo anticipó (*"generaria muchas falsas
  alarmas"*) y el dato lo confirma con número. Descartada. Además, mover la ventana a hora solar no
  tiene sentido acá: solo 7 lecturas de 35.979 caen fuera de 05-17 h, y el criterio de Leo es
  **operativo** (cuándo hay alguien para ir a revisar), no astronómico.
- **Contra la irradiancia como filtro duro (C): pierde 8 días en silencio, 3 de ellos apagones de
  día entero.** Son el **2025-05-07** (104 de 104 lecturas caídas), el **2025-05-26** (108 de 120) y
  el **2026-01-05** (113 de 113). Los dos primeros son anteriores al 2025-07-01 y no tienen
  irradiancia por decisión del equipo; el tercero es un día encapotado con pico de 292 W/m², **que
  el umbral descarta por 8 W/m²**, cuando a 292 W/m² el arreglo debería haber producido del orden
  de 700 W. Y los pierde **sin avisar**, porque `NULL >= 300` es falso. Un detector de averías que
  se apaga solo en los 46 días sin irradiancia y no lo dice es peor que no tenerlo.
- **C tampoco aporta casi nada sobre B** (2.728 contra 2.747, 19 lecturas): la hora ya estaba
  haciendo el trabajo.
- **Pero la irradiancia sí aporta como graduador:** separa **2.728 lecturas en 69 días donde el sol
  es indiscutible** de 3.251 donde "estaba nublado" es una explicación admisible. Esa separación es
  información real; lo que no hay que hacer es tirar la mitad del hallazgo.
- **Umbral 300 W/m²:** se respeta el de Leo, y **está en una meseta** (69 días a 300, 67 a 400, 63 a
  500), así que la elección no es frágil. ⚠️ Con una salvedad: la serie de irradiancia **sigue sin
  calibrar** (mediana 194 W/m², máximo 5.943, un 0,3 % por encima de 1.500 W/m²), así que el umbral
  opera sobre una escala aproximada. **Hay que revisarlo cuando se cierre R2 con Hugo**
  ([[bloqueantes]]).

**Rendimiento de la regla recomendada: 6.330 lecturas en 95 días** (contra 7.954 en 238 de la
vieja), con 32 días de apagón de más del 90 % de la ventana.

### El emparejamiento vuelve a ser decisivo

Buscar la irradiancia concurrente **por igualdad exacta de timestamp** la encuentra para **818 de
las 6.330** lecturas marcadas: **pierde el 87,1 %**. Con `date_bin` de 5 min se emparejan **5.979
(94,5 %)**. Es la enésima confirmación de [[emparejamiento-por-timestamp]], ahora en una prueba de
calidad y no en el Performance Ratio.

Irradiancia concurrente de las 5.979 emparejadas: **GHI medio 356,7 W/m²**, con el **45,6 % por
encima de 300**. Solo el 22,6 % está por debajo de 100 W/m², que es donde "desconectado por baja
irradiancia" es una explicación honesta; las 1.897 lecturas de la banda 100-300 son **zona gris**
(a 200 W/m² un arreglo de 2,84 kWp debería estar generando del orden de 500 W, muy por encima del
arranque del inversor). Llamarlas todas falsa alarma le concede demasiado al umbral.

## Convergencia total con la medición de energía

Reconstruido por una vía **independiente** (energía, no voltaje): días con al menos 12 lecturas de
sol pleno dentro de 07-17 y generación DC nula en el 90 % o más de ellas.

- Días con sol suficiente para evaluar: **202**
- Días con la planta parada bajo sol: **41 (20,3 %)**

Coincide con la medición del Performance Ratio, que da 43 de 197 días (22 %) sobre un universo de
días ligeramente distinto ([[performance-ratio-diario]]). **Las dos vías miden el mismo fenómeno y
dan la misma magnitud.**

Y lo que cierra el caso: **las dos reglas capturan 41 de 41.** Ni un día de planta parada bajo sol
se le escapa ni a A ni a C.

**El tramo anómalo de nov-2025 a feb-2026 no es un artefacto de la regla.** Concentra sus peores
meses (13, 12, 12 y 9 días), pero esos días están corroborados de forma independiente por
generación DC diaria nula: 8 en noviembre, 8 en diciembre, 8 en enero y 3 en febrero aparecen
también en la lista de planta parada. El +27 % de potencia a igual irradiancia sigue sin
explicación y **no interfiere con esta medición** ([[performance-ratio-diario]]).

## Lo que esta prueba NO es: calidad del dato

**Un día con el inversor caído es un día con dato BUENO sobre un sistema MALO**, y el veredicto
actual no puede decir esa frase.

Hoy `voltaje_vac` con límite inferior 100 produce `fuera_de_rango` **grave** en 238 días, y con eso
declara que **el dato** de esos días es malo. El dato es perfecto: el sensor registró con exactitud
que el inversor marcaba 0 V. Lo que estaba mal era **el equipo**.

La consecuencia es medible y va en la dirección peligrosa: `calidad.contexto.confianza()` es lo que
toda herramienta incrusta para decir "de este período se puede fiar". Con la regla vieja, **un mes
con muchos apagones sale con la confianza hundida y el agente concluye "no confíes en la energía de
este mes", cuando la verdad es la contraria: la energía de ese mes es exacta, y es baja porque la
planta estuvo parada.** Esconde la avería detrás de una advertencia de calidad de dato.

De ahí la decisión de arquitectura, registrada en [[decisiones]] y detallada en [[capa-analitica]]:
módulo propio `calidad/pruebas/disponibilidad.py`, y el tipo `inversor_sin_acoplar` **fuera** del
veredicto de calidad del dato. El número que el experto necesita es **"41 de 202 días con la planta
parada"**, no "12 días más en rojo".

## Implementado el 2026-08-31

`calidad/pruebas/disponibilidad.py` existe y es la **quinta familia** de pruebas
([[implementacion-decisiones-lcv]]). Dos detalles de la implementación que valen más que el módulo:

- **Queda excluido del veredicto en las TRES cuentas de `contexto.py`**, no solo en
  `TIPOS_QUE_INVALIDAN`. Sacarlo de una sola habría dejado el hallazgo entrando por las otras dos,
  en silencio.
- **Se ve en un canal propio**, así que el experto recibe "la planta estuvo parada" y no "no te
  fíes del dato", que era el error que motivó toda esta sección.

**Ensayo del barrido con las escrituras anuladas: 190 filas de `inversor_sin_acoplar` en 96 días**
(135 graves bajo sol, 37 avisos por irradiancia baja, **18 avisos con motivo `sin_irradiancia`**).
Esos 18 son la prueba de que la regla **no se calla** cuando no puede graduar. El barrido **todavía
no se corrió contra producción** ([[store-hallazgos-calidad]]).

## 2026-09-01: ya no es historia, es el último día que tenemos

La carga de los 57 CSVs ([[dataset-actual]]) convierte esta prueba de un análisis retrospectivo en
una **alarma abierta**.

### El código de error 302

| Dónde | Registros con `codigo_error = 302` |
|---|---|
| Agosto 2026, en producción | **661** |
| Junio 2026, en los CSV crudos | 322 |
| Julio 2026, en los CSV crudos | 339 |
| Agosto 2026, en los CSV crudos | 663 |

⚠️ **Dos huecos marcados, y ninguno cambia la conclusión.** Los CSV de agosto tienen **663** filas
con 302 y la base **661**: la diferencia de dos filas **no está explicada** (el corpus nuevo pierde
21 filas entre CSV y base, así que probablemente sea del mismo origen, pero eso hay que medirlo).
Y **qué significa exactamente el 302 no lo sabemos**: no está en ninguna documentación del
proyecto, y hay que preguntárselo al equipo o buscarlo en el manual del inversor.

Lo que sí se sabe sin el manual es **con qué coincide**, y es suficiente para tratarlo como avería.

### Los dos peores días del histórico son el 2026-08-26 y el 2026-08-31

**Generación exactamente cero todo el día, los dos.** Medido sobre los CSV crudos y contra
producción:

| | 2026-08-26 | 2026-08-31 |
|---|---|---|
| Filas del día | 155 | 155 |
| Filas con `codigo_error = 302` | **144** | **147** |
| Suma de potencia PV1 + PV2 en todo el día | **0,00 W** | **0,00 W** |
| Irradiancia máxima | **1.077,9 W/m²** | **1.041,0 W/m²** |
| Tensión de string | **168 V** (máximo en el CSV: 185,9) | **172 V** (máximo: 180,6) |
| Corriente PV1 máxima | **0,000 A** | **0,000 A** |

Es la firma exacta de `inversor_sin_acoplar`, y con las tres condiciones a la vez: **hay sol
abundante, los arreglos están energizados, y la corriente es cero.** El arreglo produce tensión y
nadie se la toma.

**Y el 2026-08-31 es el último día que tenemos.** No es un episodio cerrado que se estudia en el
histórico: **hasta donde llega nuestro dato, la planta no está generando.** Eso hay que decírselo al
equipo junto con la corrección del corte inexistente ([[correccion-al-equipo]]), porque las dos
cosas van juntas y la segunda sin la primera suena a buena noticia.

### La cuenta de disponibilidad después de la carga

| | |
|---|---|
| Días con la planta parada | **118** |
| de esos, con sol pleno | **86** |
| sobre días con dato | **331** |

⚠️ **No restar estos números de los de la sección anterior.** Los 41 de 202 del 2026-08-31 salen de
un criterio distinto (generación DC nula en el 90 % o más de las lecturas de sol pleno de un día, y
solo sobre los días evaluables), y el universo tampoco es el mismo. **Las dos cuentas son válidas y
miden cosas parecidas con reglas distintas**; cuál se cita hay que decirlo siempre, igual que pasa
con las dos completitudes ([[gaps-temporales]]) y con los dos veredictos
([[store-hallazgos-calidad]]).

Lo que sí se sostiene sin ninguna aritmética: **más de un tercio de los días con dato tienen la
planta parada**, y eso ya no es un problema de calidad del dato ni de análisis retrospectivo. Es
mantenimiento.

Relacionado: [[dataset-actual]], [[correccion-al-equipo]],
[[respuestas-lcv-consultas-agosto]], [[implementacion-decisiones-lcv]],
[[vista-corregida-no-corrige]],
[[store-hallazgos-calidad]], [[pruebas-calidad-umbrales]], [[performance-ratio-diario]],
[[emparejamiento-por-timestamp]], [[silencio-leido-como-salud]], [[energia-ac-tablero]],
[[capa-analitica]], [[decisiones]], [[bloqueantes]], [[abiertos]],
[[irradiancia-sin-calibrar]], [[agente-historico-calidad]].
