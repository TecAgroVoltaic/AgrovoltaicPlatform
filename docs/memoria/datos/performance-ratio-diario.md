---
name: performance-ratio-diario
description: El Performance Ratio calculado con el método que pidió Leo (energía diaria contra irradiación diaria, agregado por mes y por año), medido contra producción el 2026-08-31. Gana el arreglo INCLINADO en las cinco particiones probadas. Es la tercera metodología independiente que llega a esa conclusión. Incluye el error de signo variable de la fórmula 5/60, el 22 por ciento de días con el inversor caído, y el régimen anómalo de nov-2025 a feb-2026
categoria: datos
actualizado: 2026-08-31
tags: [performance-ratio, kpi, poa, bifacial, inclinado, vertical, evaluacion-datos, agente-historico]
---

# Performance Ratio diario y mensual, con el método de Leo

**Medición de solo lectura contra producción, el 2026-08-31.** Es la respuesta a **R1** de
[[respuestas-lcv-consultas-agosto]]: el PR deja de ser una métrica de 5 minutos y pasa a ser
diaria y mensual. **Detalle completo, con el SQL y los anexos:**
`../../referencia/medicion-pr-diario.md`.

Esto **cierra la pregunta principal del proyecto**: si rinde más el arreglo vertical o el
inclinado.

## Definición y alcance

```
PR = (E_kWh / P0_kWp) / (H_kWh_m2 / 1 kW/m2)      con P0 = 1,420 kWp por arreglo
```

Misma definición que ya circulaba en `v_sc_performance`. **Lo único que cambia es la unidad de
agregación:** la vista lo evalúa fila a fila cada 5 min, acá se agrega por día y por mes
ponderando por energía (`PR_periodo = sum(E) / (P0 * sum(H))`), que es la forma estándar de la
**IEC 61724** y la que ya usa `tools/performance.py`.

**Ventana:** 2025-07-01 a 2026-06-01, porque la irradiancia anterior es NULL por decisión del
equipo. Dentro de esa ventana no se reportó en julio ni agosto 2025, así que el dato real arranca
el **2025-09-05**. **228 días con dato, 31 descartados, 197 válidos.**

### El criterio de día válido, y el tercero no es obvio

```
cob_rad = horas_de_dato_radiacion / horas_sol  >= 0,90
cob_ele = horas_de_dato_electrico / horas_sol  >= 0,90
|horas_rad - horas_ele| <= 0,5 h
```

El tercero es el que de verdad importa: **si el piranómetro grabó doce horas y el inversor seis,
el PR sale a la mitad sin que ninguna de las dos coberturas se vea mal por separado.** Es el caso
del 2026-03-09 (4,97 h de radiación contra 9,67 h de eléctrico) y del 2025-09-22 (2,92 contra
6,08).

## Resultado: gana el inclinado

| Insumo de irradiancia | PR1 inclinado | PR2 vertical | Gana | Brecha |
|---|---|---|---|---|
| **GHI horizontal** (lo que describe Leo) | **0,733** | **0,517** | **PV1** | **+41,6 %** |
| **POA bifacial** | **0,648** | **0,612** | **PV1** | **+5,9 %** |
| POA frontal | 0,738 | **1,217** | PV2 | −39,4 % |

Contra GHI **PV1 gana los diez meses, sin una sola excepción**. Contra POA bifacial gana ocho de
diez, y los dos que pierde (abril y mayo 2026) son por **0,005 y 0,004**, o sea un empate.

**La fila de POA frontal hay que descartarla:** 1,217 es físicamente imposible (ningún arreglo
entrega más energía que la luz que recibe por kWp), y da PR > 1 en el **70 % de los días** del
vertical. No es un empate metodológico, es un modelo incompleto.

### Confirma lo que ya sabíamos, por un camino independiente

| Método | Unidad de análisis | PR1 | PR2 | Gana |
|---|---|---|---|---|
| Timestamp exacto (la vista viva) | 5 min | 0,622 | 0,626 | PV2 |
| Promedio de ventana de 5 min | 5 min | 0,664 | 0,633 | PV1 |
| **Leo, integral, POA bifacial** | día a año | **0,648** | **0,612** | **PV1** |
| **Leo, contador, POA bifacial** | día a año | **0,615** | **0,607** | **PV1** |

El método de Leo con POA bifacial **cae casi encima del emparejamiento por bin** y **confirma su
veredicto**. Ya son **tres metodologías independientes** (bin de 5 min, vecino más cercano, y
ahora agregación diaria) que coinciden en que gana el inclinado. El único que decía lo contrario
era el join por timestamp exacto, que ya sabíamos sesgado
([[emparejamiento-por-timestamp]]).

Los dos baselines se remidieron el mismo día y reproducen lo documentado. **La migración
`sql/002_performance_emparejado_por_bin.sql` sigue sin aplicar:** la vista viva usa el `JOIN`
exacto y da 3.041 pares contra los 19.482 del bin.

### La estacionalidad es real y el promedio anual la esconde

Brecha PR1 − PR2 contra POA bifacial, mes a mes:

| sep | oct | nov | dic | ene | feb | mar | abr | may |
|---|---|---|---|---|---|---|---|---|
| +0,088 | +0,004 | +0,081 | +0,068 | +0,075 | +0,078 | +0,012 | **−0,005** | **−0,004** |

Patrón limpio: **en octubre y de marzo a mayo la brecha se cierra** (sol alto, cerca del cenit) y
**de noviembre a febrero el inclinado se despega** (sol bajo y al sur, que es adonde mira PV1 con
azimut 150; PV2 mira al 50, nornoreste, y en esos meses vive de difusa y de reflejada). Ver
[[geometria-sistema]].

## El método literal de Leo (energía del contador) converge, pero con menos días

Usando el **cierre diario de `energia_pv1_wh` y `energia_pv2_wh`**, que es la formulación literal
de R1, hay **91 días** en vez de 197:

| Fuente de energía | PR1 GHI | PR2 GHI | PR1 POAbif | PR2 POAbif |
|---|---|---|---|---|
| Contador (literal de Leo) | 0,677 | 0,485 | 0,615 | 0,607 |
| Integral con `dt` real | 0,682 | 0,493 | 0,620 | 0,618 |
| Diferencia | +0,7 % | +1,6 % | +0,8 % | +1,8 % |

**Los dos métodos convergen dentro del 2 %.** Pero ese subconjunto **no representa el año**: le
faltan nov-2025 a feb-2026, justo los meses en que el inclinado se despega
([[energia-ac-tablero]] documenta por qué esas columnas no existen ahí). Por eso el PR2 del
contador queda casi pegado al de PV1. **Cualquier PR anual calculado solo con el contador tiene
sesgo estacional de muestreo, y hay que decirlo.**

## La fórmula `5/60` no se puede corregir con una constante

Leo escribió `radiacion_intervalo = Irradiancia*5/60`. Sobre la ventana entera esa fórmula infla
la irradiación un **+83,6 %** (factor 1,84x), pero lo importante **no es la magnitud, es que el
error cambia de signo**:

| Tramo | Cadencia real | Error de `5/60` |
|---|---|---|
| sep-oct 2025 | 15 y 60 s | **+483 % y +860 %** |
| nov 2025 a feb 2026 | 315 s | **−6,3 % a −6,7 %** |
| mar-jun 2026 | 300 s | −0,2 % a −0,1 % |

- En **sep-oct 2025** la fórmula literal multiplica la irradiación por seis y por diez. El PR de
  esos meses saldría dividido entre seis y entre diez, y se leería como *"los paneles se
  estropearon en octubre"*.
- En **nov 2025 a feb 2026** subestima un 6,5 %, porque supone 300 s donde el registrador tarda
  315. El PR saldría inflado un 7 %, y se leería como *"el invierno rinde mejor"*.
- En **mar-jun 2026** las dos fórmulas coinciden dentro del 0,2 %. Ahí Leo tiene razón exacta.

O sea que la fórmula literal **no introduce un sesgo constante que se pueda descontar: inventa una
estacionalidad de un orden de magnitud**, dictada por cuándo cambió la cadencia del registrador y
no por el sol. Es la advertencia A de [[respuestas-lcv-consultas-agosto]] con su número, y la
razón de la regla de [[muestreo-variable]]: pesar por el salto real con techo.

## Tres cosas que no hay que maquillar

### 1. El 22 % de los días útiles tiene el inversor caído con sol pleno

**43 de los 197 días válidos** (31 con energía exactamente 0) tienen cobertura completa de
radiación y de eléctrico, sol normal, y **PR cercano a 0**. Ejemplos: el 2026-01-25 con
4,41 kWh/m² de GHI y 0 Wh generados; el 2026-05-08 con 6,21 kWh/m² y 0 Wh.

**Es exactamente el escenario de R3**, el inversor que no se acopla a la red
([[store-hallazgos-calidad]]). No es un problema de dato: es **indisponibilidad del equipo**.

✅ **Confirmado por una vía independiente el 2026-08-31** ([[inversor-sin-acoplar]]): contando por
**voltaje** en vez de por energía salen **41 de 202 días evaluables (20,3 %)**, la misma magnitud
sobre un universo de días ligeramente distinto. Y la regla de disponibilidad **captura 41 de 41**:
ni un día de planta parada bajo sol se le escapa.

| | días | PR1 POAbif | PR2 POAbif | Gana |
|---|---|---|---|---|
| Todos los días válidos | 197 | **0,648** | **0,612** | PV1 |
| Solo días con el inversor operando | 154 | **0,830** | **0,779** | PV1 |

La IEC 61724 **incluye** la indisponibilidad en el PR, por eso el 0,648. Pero para juzgar **el
arreglo** y no la planta, el número relevante es 0,830 / 0,779. El ganador no cambia y la brecha
pasa de +5,9 % a +6,5 %.

**Las dos cifras deberían reportarse siempre juntas:** un PR de 0,648 hace pensar en paneles
malos, cuando lo que hubo fue un inversor apagado 43 días.

### 2. Régimen anómalo de nov-2025 a feb-2026, sin explicar

Los PR de esos cuatro meses **no son de fiar**, y la evidencia es convergente: a igual irradiancia
medida (GHI entre 700 y 900 W/m²), la potencia media de PV1 sube **+27 %** en nov-ene contra
octubre o marzo. La geometría explica +8 %, no los 27 puntos. Coincide además con:

- Es el único tramo donde **desaparecen** `energia_pv1_wh`, `energia_pv2_wh`, `energia_total_wh` y
  `potencia_total_wac` (cambio de esquema del CSV, ver [[energia-ac-tablero]]).
- **240 / 123 / 140 / 111 filas** con `voltaje_pv1_v` > 250 V en nov/dic/ene/feb, contra **0** en
  sep, oct, abr y may. La tensión de operación real es de unos 184 V, y **el límite de 600 V de la
  vista corregida es demasiado laxo para atraparlas** ([[vista-corregida-no-corrige]]).
- Filas con `potencia_pv1_w` por encima del nominal de 1.420 W: 9 / 18 / 5 / 7, contra 0 en el
  resto.
- `kt` medio de **0,353 en febrero**, el mínimo de la serie, cuando febrero es estación seca y
  debería ser de los meses más despejados.
- `PR1` contra POA **frontal** de 1,115 / 1,063 / 1,095 / 1,033 en esos meses: imposible también
  para el inclinado, no solo para el vertical.

**No se puede resolver desde la base:** o la irradiancia está subestimada un 20 % en ese tramo
(suciedad del piranómetro, deriva), o lo eléctrico está sobreestimado, o las dos cosas. **Queda
como hallazgo para el equipo**, anotado en [[bloqueantes]].

Lo tranquilizador es que **el veredicto no depende de ese tramo**: PV1 gana en las cinco
particiones probadas (todos los válidos, sin nov-feb, sin nov-feb y con el inversor operando, solo
nov-feb, y el plan del contador).

### 3. El PR contra GHI no es un PR

Contra irradiancia horizontal **el denominador es el mismo para los dos arreglos**, así que
`PR1/PR2` es idéntico a `E1/E2`. El **+41,6 % no dice "el inclinado convierte mejor"**: dice **"el
inclinado produce un 41,6 % más de energía por kWp instalado"**.

Es la pregunta más útil para decidir cómo orientar el próximo arreglo, pero **no es una medida de
eficiencia de conversión**. Para eso hay que ir a POA, y ahí la brecha cae a +5,9 %.

Rendimiento específico sobre los 197 días: **PV1 498,7 kWh/kWp · PV2 352,1 kWh/kWp** (razón
1,416).

## Cuánto de esto depende de un modelo, y no de una medición

**Muchísimo, y de forma asimétrica.** Es el mismo hallazgo de [[geometria-sistema]], ahora con el
PR anual:

| Arreglo | PR con POA bifacial | PR con POA frontal | Variación |
|---|---|---|---|
| PV1 inclinado | 0,648 | 0,738 | **14 %** |
| PV2 vertical | 0,612 | **1,217** | **99 %** |

**El PR del vertical se duplica** según qué POA se use; el del inclinado se mueve un 14 %. Y su
posición en el ranking depende enteramente de esa cantidad modelada:

| Insumo | Días que gana PV1 | Días que gana PV2 |
|---|---|---|
| GHI | 161 | 5 |
| POA bifacial | 120 | 46 |
| POA frontal | 3 | **163** |

Que el valor frontal de PV2 sea **imposible** (1,217) **prueba que el aporte trasero existe**,
pero también deja claro que **la mitad del denominador de PV2 no se midió: se modeló**.

**Y eso es exactamente lo que R2 todavía espera que Hugo confirme** ([[bloqueantes]]). Si Hugo
cambia la ecuación de transposición o el factor de bifacialidad, **el +5,9 % se mueve**. El
+41,6 % contra horizontal **no**, porque no depende de ningún modelo.

## Implementado el 2026-08-31, y reproduce estos números

`analitica/rendimiento.py` calcula el PR diario y mensual, y **da exactamente las cifras de este
archivo** ([[implementacion-decisiones-lcv]]), que es la prueba de que la medición y el código
dicen lo mismo. Tres cosas quedaron dentro del módulo y no en la cabeza de quien lo use:

- **Agrega ponderando por energía según IEC 61724**, no promediando los PR diarios.
- **La variante de POA frontal sale marcada como físicamente imposible** (138 de 197 días por
  encima de 1), en vez de devolverse como un resultado más.
- Techo de `dt` de **600 s**.

**Y se cerró una duplicación que nadie había visto:** `comparativa.py` **calculaba su propio PR a 5
minutos**, o sea que convivían dos definiciones del mismo indicador. Ahora llama a
`rendimiento.py`, sus números **se mueven de 0,664 / 0,633 a 0,648 / 0,612** y **el ganador no
cambia**. Lo que legítimamente vive a 5 minutos quedó con nombre propio, `emparejamiento_5min`,
**sin ninguna clave `pr`**: mientras dos cosas distintas se llamen igual, alguien las va a
comparar.

## Veredicto en una frase

**El inclinado gana por producir más energía (+42 % por kWp), no por convertir mejor (+6 %).** Y
ese +6 % **no es un resultado cerrado**, porque la mitad de la irradiancia con que se juzga al
vertical sale de una transposición pendiente de confirmación.

## Qué llevarle a Leo, además del veredicto

1. **`Irradiancia*5/60` hay que generalizar** a `Irradiancia*(dt_real/3600)` con techo. No es un
   refinamiento: la fórmula literal infla octubre 2025 un +860 % y desinfla diciembre un −6,6 %.
2. **Sus acumuladores sí sirven**, y están **en kWh pese al nombre `_wh`**
   ([[unidades-energia-kwh]]). Los 39 MWh que los habían condenado eran **una sola fila**
   contaminada ([[energia-ac-tablero]]). Pero faltan enteros entre nov-2025 y feb-2026, así que el
   PR anual solo con ellos tiene sesgo estacional.
3. **El 22 % de los días útiles tiene el inversor caído con sol pleno**, que es el caso de su R3.
   Eso, y no los paneles, es lo que baja el PR de 0,830 a 0,648.

Relacionado: [[respuestas-lcv-consultas-agosto]], [[implementacion-decisiones-lcv]],
[[inversor-sin-acoplar]],
[[emparejamiento-por-timestamp]],
[[geometria-sistema]], [[energia-ac-tablero]], [[unidades-energia-kwh]],
[[vista-corregida-no-corrige]], [[muestreo-variable]], [[catalogo-metricas-evaluacion]],
[[store-hallazgos-calidad]], [[bloqueantes]], [[abiertos]], [[capa-analitica]],
[[implementacion]], [[irradiancia-sin-calibrar]], [[verificacion-numeros]].
