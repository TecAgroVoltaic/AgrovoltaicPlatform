---
name: energia-ac-tablero
description: Qué es realmente la energía AC del tablero, medido contra producción el 2026-08-31. Cierra los huecos que dejó la respuesta de Leo del 2026-08-30: el contador del inversor SÍ sirve (los 39 MWh salían de una sola fila contaminada), el hueco de cuatro meses del tablero AC no existe, energia_pv1_wh y energia_pv2_wh son acumuladores DIARIOS, y la razón AC/DC medida es 0,958, exactamente lo que Leo predijo
categoria: datos
actualizado: 2026-08-31
tags: [energia, acumuladores, tablero, kpi, ac, dc, performance-ratio, evaluacion-datos]
---

# La energía AC del tablero, medida

**Medición de solo lectura contra la Supabase de producción, el 2026-08-31.** Nace de la
respuesta **R7** de Leo ([[respuestas-lcv-consultas-agosto]]) y de la advertencia que esa nota
dejó marcada: que los 39 MWh con que se había descartado el contador del inversor se midieron
sobre la tabla contaminada y había que volver a medirlos. Se volvieron a medir.

**Detalle completo, con las consultas SQL:** `../../referencia/medicion-energia-ac.md`.

> ⚠️ **Antes de leer cualquier cifra de este archivo:** las cuatro columnas de energía están en
> **kWh**, no en Wh, pese al sufijo `_wh` del nombre. Está medido y documentado en
> [[unidades-energia-kwh]]. Todo lo de abajo está en kWh.

## Lo que cambia respecto de lo que creíamos

| Se creía | Se midió el 2026-08-31 |
|---|---|
| El acumulador del inversor no sirve: `energia_total_wh` llega a 39.328.367, imposible para 2,84 kWp | **Sale de UNA sola fila contaminada.** Sin ella el máximo es **2.710,7 kWh**, que es físico. El contador **sí sirve** |
| El tablero AC no tiene dato de nov-2025 a feb-2026 | **El hueco no existe.** `energia_hoy_wh` tiene **13.923 lecturas en 118 días** en ese tramo |
| `energia_pv1_wh` / `energia_pv2_wh` son "energía del día por arreglo", sin más precisión | Son **acumuladores diarios**: abren en 0 al amanecer y crecen monótonos hasta el cierre. **No** son energía del intervalo |
| `energia_total_wh` es un contador que se reinicia | En nuestra serie **no se reinicia ni una vez** (0 reinicios en 19.889 lecturas). Va monótono de 182,3 a 2.710,7 kWh |

## Los 39 MWh eran un artefacto nuestro

Hay que decirlo así de claro, porque el número viajó hasta el documento que se le mandó al
equipo: **descartamos el contador del inversor por leer la tabla contaminada.**

- De las **466 filas** de `monitoreo_sc_electrico` con firma de contaminación (potencia > 5.000 W,
  voltaje > 600 V o voltaje negativo), **una sola** trae `energia_total_wh`.
- Esa fila es **`2025-10-07 07:45`**, la misma que produce `potencia_pv1_w` = 26.503.162,8 W y
  `temperatura_inversor_c` = 291,1. Es una fila de piranómetro mezclada ([[filas-mezcladas]]).
- Máximos con y sin esa fila:

| Columna | Con la fila sucia | Sin ella | Factor |
|---|---|---|---|
| `energia_total_wh` | 39.328.367,1 | **2.710,7** | 14.508x |
| `energia_hoy_wh` | 671,1 | **137,25** (el segundo es 14,2) | 4,9x |
| `energia_pv1_wh` | 203.194,6 | **7,9** | 25.721x |
| `energia_pv2_wh` | 5,3 | 5,3 | 1x |

**2.710,7 kWh de vida para 2,84 kWp** desde el 2024-11-10 hasta el 2026-06-01 (569 días, 1,56
años) son **571 kWh/kWp/año**: bajo, pero perfectamente físico para un agrovoltaico con un arreglo
vertical y sombreado.

### Segunda fila sospechosa: el 2026-03-09

El máximo de `energia_hoy_wh` sin la fila anterior, **137,25**, tampoco es un día récord: es el
**último registro del 2026-03-09**, a las 17:55. Ese día venía acumulando normal hasta 3,586 a las
10:45, luego la columna se va a NULL durante siete horas y reaparece en 137,25. Misma huella que
la del 2025-10-07 (ese mismo día PV1 y PV2 se intercambian de magnitud a las 11:10). El segundo
cierre más alto de toda la serie es **14,2 kWh**, que para 2,84 kWp son exactamente 5,00
kWh/kWp/día.

**Por sí sola esa fila mete un 8 % de error en cualquier total anual.** Recomendación: excluir el
2026-03-09 o su último registro.

## Cobertura: dónde está cada columna

Filas no nulas por mes, sobre `v_sc_electrico_corregido`:

| mes | días | `energia_hoy_wh` | `energia_total_wh` | `potencia_total_wac` | `energia_pv1_wh` | `energia_pv2_wh` |
|---|---|---|---|---|---|---|
| 2024-11 | 3 | 174 | 174 | 174 | **0** | **0** |
| 2024-12 | 6 | 69 | 69 | 69 | 69 | 69 |
| 2025-05 | 19 | 2.515 | 2.515 | 2.515 | 2.515 | 2.515 |
| 2025-06 | 18 | 2.609 | 2.609 | 2.609 | 2.609 | 2.609 |
| 2025-09 | 8 | 902 | 902 | 902 | 902 | 902 |
| 2025-10 | 20 | 2.627 | 2.627 | 2.626 | 2.627 | 2.627 |
| **2025-11** | 28 | **3.154** | **0** | **0** | **0** | **0** |
| **2025-12** | 31 | **3.756** | **0** | **0** | **0** | **0** |
| **2026-01** | 31 | **3.670** | **0** | **0** | **0** | **0** |
| **2026-02** | 28 | **3.343** | **0** | **0** | **0** | **0** |
| 2026-03 | 27 | 3.729 | 3.207 | 3.207 | 3.207 | 3.207 |
| 2026-04 | 29 | 4.140 | 4.140 | 4.140 | 4.140 | 4.140 |
| 2026-05 | 25 | 3.497 | 3.497 | 3.497 | 3.497 | 3.497 |
| 2026-06 | 1 | 150 | 150 | 150 | 150 | 150 |

**El hueco de cuatro meses del tablero AC no existe.** La consulta 3 que se le envió al equipo
preguntaba qué mostrar en esos cuatro meses si la energía tenía que ser AC. No hay que decidir
nada: **el dato AC de ese tramo está en `energia_hoy_wh`**, que es justamente la primera de las dos
columnas que Leo nombra en R7. Lo que está vacío ahí es `potencia_total_wac`, que es otra columna.

**Espejo del mismo fenómeno:** noviembre 2024 tiene AC (174 filas de `energia_hoy_wh` y
`energia_total_wh`) y **cero DC**. Ahí el hueco es del otro lado.

**Y un límite duro para el Performance Ratio diario:** `energia_pv1_wh` y `energia_pv2_wh` solo
cubren **144 días**, y **ninguno cae entre nov-2025 y feb-2026**. La receta de Leo para el PR
diario se apoya en esas dos columnas, así que el PR diario **no se puede calcular en ese tramo**,
por más que la energía AC sí exista ahí ([[emparejamiento-por-timestamp]]).

## Cómo se comporta cada acumulador

### `energia_hoy_wh`: diario, se reinicia cada día

270 días con dato. **232 de 270 (86 %) no tienen ni un retroceso** dentro del día; el peor
retroceso de toda la serie es de **0,575 kWh**, que es ruido de reporte del inversor y no un
reinicio. El cierre coincide con el máximo del día en 252 de 270 días.

Distribución del cierre diario: min 0,00 · p25 2,475 · **mediana 6,65** · p75 9,20 · max 137,25
(la fila mala) · **suma 1.777,68 kWh**. Sin el 2026-03-09: 269 días, **1.640,43 kWh**, y el máximo
baja a 14,2.

### `energia_total_wh`: de vida, y NO se reinicia

**19.889 lecturas, 0 reinicios.** Los 37 "saltos negativos" que aparecen al medir sin tolerancia
son todos del orden de **-4,5e-13 kWh**: ruido de punto flotante del `double precision`. Ninguna
caída supera 1e-11.

Es estrictamente monótona: **182,3 kWh** el 2024-11-10 y **2.710,7 kWh** el 2026-06-01, con el
máximo en la última fila de la serie.

> ⚠️ **Trampa de método, medida.** Reconstruir el total "sumando incrementos positivos y tratando
> cada salto negativo como reinicio" **sin tolerancia** da **89.661,5**, un número absurdo: el
> algoritmo lee 37 veces el ruido de 1e-13 como un reinicio y vuelve a sumar el contador entero.
> Con tolerancia de 0,001 el resultado correcto es simplemente **el último menos el primero**.
> Esto corrige la receta que [[respuestas-lcv-consultas-agosto]] había derivado de R7: la idea
> ("no se lee con `max()`") sigue valiendo, pero **sin tolerancia el algoritmo se rompe**.

Que no se reinicie **no contradice a Leo**, que dijo que se reinicia *"cuando llega a su valor
maximo segun el tipo de variable"*: simplemente todavía no llegó.

### `energia_pv1_wh` y `energia_pv2_wh`: acumuladores DIARIOS

144 días, 19.715 filas. Ni de vida ni de intervalo:

- **Abren en 0 al amanecer en 134 de 144 días.** Los 10 restantes son días cuyo primer registro es
  de media mañana, no días que arrastren el valor del anterior.
- Crecen monótonos: solo **3 retrocesos en 19.715 filas** (2 en PV1, 1 en PV2).
- Su cierre es del orden del cierre de `energia_hoy_wh`, **no** del de `energia_total_wh`.
- **No son energía del intervalo.** Si lo fueran bajarían por la tarde siguiendo la potencia, y no
  bajan nunca.

| | días | abre en 0 | mediana del cierre | max cierre | suma de cierres |
|---|---|---|---|---|---|
| `energia_pv1_wh` (Inclinado) | 144 | 134 | **4,20** | 7,90 | 572,70 |
| `energia_pv2_wh` (Vertical) | 144 | 134 | **2,95** | 5,30 | 398,10 |

**Consecuencia directa para el PR diario:** hay que tomar el **cierre del día**, que es
exactamente lo que dice R1 (*"se debe tomar el total acumulado al final de dia"*), leerlo en kWh,
y recordar que solo hay 144 días.

Y las columnas encajan entre sí: `energia_total_wh` = base del día + `energia_hoy_wh`, fila a
fila. En **133 de 147 días** el delta intradía de `energia_total_wh` coincide con el cierre de
`energia_hoy_wh` con error menor a 0,01 kWh (error medio 0,206; el máximo, 8,6, es el 2026-03-09).

## Tres totales distintos, los tres correctos

No se pueden restar entre sí porque miden ventanas distintas:

| Concepto | Valor | Ventana |
|---|---|---|
| **AC del contador de vida** (2.710,7 − 182,3) | **2.528,40 kWh** | **569 días de calendario**, incluidos los que no tenemos |
| Suma de deltas intradía de `energia_total_wh` | 905,55 kWh | solo los 147 días con dato de esa columna |
| Suma de cierres diarios de `energia_hoy_wh` | **1.777,68 kWh** (1.640,43 sin el 2026-03-09) | 270 días con dato |
| Integración DC de la potencia PV1 + PV2 | **1.522,78 kWh** | 274 días con dato |

**El dato que ningún otro número del sistema ve:** de los 2.528,40 kWh del contador de vida, solo
**905,55 caen en días que tenemos registrados**. O sea que **1.622,85 kWh se generaron en días que
no están en el corpus** (ene-abr 2025, jul-ago 2025, nov-2025 a feb-2026). El contador de vida es
**el único instrumento del sistema que ve los huecos** ([[gaps-temporales]]).

De ahí que haya que decir siempre cuál de las dos preguntas se está respondiendo: **"cuánto
registramos"** y **"cuánto produjo la planta"** no son la misma pregunta, y la diferencia acá es
del orden del 64 %.

## La predicción de Leo se cumple, y hay que decir contra qué

Leo dijo en R7 que la energía AC *"sera siempre un poco menor a la suma de las de PV1 y PV2 porque
consideran las perdidas del inversor"*.

| Comparación | Razón AC/DC | ¿Cumple R7? |
|---|---|---|
| Contador AC contra contadores DC, **mediana diaria sobre 129 días** | **0,958** | **Sí, exactamente** |
| Suma de cierres AC (1.640,43) contra integración DC (1.522,78) | 1,128 | **No: el AC sale 13 % mayor** |

Distribución de la razón diaria contador contra contador, 129 días: min 0,117 · **p05 0,944** ·
p25 0,953 · **mediana 0,958** · p75 0,968 · **p95 1,000** · max 1,125. El 90 % central cae entre
94 % y 100 %, que es **una eficiencia de inversor del 95,8 %**, valor de catálogo normal. Sobre
esos 129 días: AC 925,23 kWh contra DC 970,10 kWh, razón 0,954.

Solo **3 de 129 días** dan razón mayor que 1, y son días truncados, no anomalías físicas. Los días
atípicos que el informe identifica son el **2024-12-23** (una sola fila en todo el día, razón
0,117), el **2025-05-20** (59 filas, razón 1,125) y el **2025-05-06** (54 filas, razón 1,000).

### La discrepancia del 13 %: no es que el AC esté inflado, es que la integración DC subestima

Medido sobre los mismos 129 días: el **contador DC** da 970,10 kWh y la **integración DC** da
831,74 kWh, razón **0,857**. La integración pierde alrededor del **14 %** porque pesa cada fila a
5 minutos aunque el día tenga huecos internos de 10, 15 o 20 minutos. Es la misma trampa de la
advertencia A de [[respuestas-lcv-consultas-agosto]], en su versión eléctrica: el peso de cada
fila tiene que ser el **salto real** al siguiente registro, acotado a un techo con nombre
([[muestreo-variable]]).

## Implementado el 2026-08-31: los dos totales tienen nombre propio

`analitica/energia.py` existe ([[implementacion-decisiones-lcv]]), y la lección de este archivo
entró al código **como dos claves distintas y no como un número con nota al pie**:

| Clave | Valor | Qué contesta |
|---|---|---|
| `registrada` | **1.644,02 kWh** | suma de cierres diarios: lo que el datalogger vio |
| `planta` | **2.528,40 kWh** | contador de vida: lo que la planta produjo |

Así, los **1.622,85 kWh generados en días que no tenemos** dejan de ser una advertencia que alguien
tiene que recordar y pasan a ser **aritmética entre dos campos que existen**.

Y **el hueco de cuatro meses ya no existe ni en la medición ni en el código**: nov-2025 a feb-2026
devuelve **667,2 kWh reales**, leídos de `energia_hoy_wh`.

## Veredicto

La energía del tablero sale de **`energia_hoy_wh`**, y de **`energia_total_wh`** cuando está
disponible. Son la misma cuenta AC del inversor, están en **kWh**, y son coherentes con los
contadores DC con una razón mediana de **0,958**. **El tablero AC se puede llenar para toda la
serie** usando `energia_hoy_wh` como fuente primaria y `energia_total_wh` como control.

Dos cosas hay que arreglar antes de poner esto en producción:

1. **`v_sc_electrico_corregido` no corrige estas columnas** y encima borra dato válido →
   [[vista-corregida-no-corrige]].
2. **El 2026-03-09** tiene un último registro de 137,25 kWh que es otra fila mezclada y mete un
   8 % de error en cualquier total anual → [[filas-mezcladas]].

Relacionado: [[respuestas-lcv-consultas-agosto]], [[implementacion-decisiones-lcv]],
[[performance-ratio-diario]],
[[unidades-energia-kwh]],
[[vista-corregida-no-corrige]], [[catalogo-metricas-evaluacion]], [[filas-mezcladas]],
[[gaps-temporales]], [[muestreo-variable]], [[emparejamiento-por-timestamp]],
[[verificacion-numeros]], [[diccionario-variables]], [[geometria-sistema]],
[[silencio-leido-como-salud]], [[capa-analitica]].
