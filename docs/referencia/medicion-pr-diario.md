# Medicion: Performance Ratio diario y mensual (metodo de Leo Cardinale)

Medicion de SOLO LECTURA sobre la Supabase de produccion, 2026-08-31. No se creo
ni modifico ningun objeto de la base. Nace de **R1** y de la **advertencia A** de
`respuestas-lcv-consultas.md`.

Ventana: **2025-07-01 a 2026-06-01** (la irradiancia anterior es NULL por decision
del equipo). Dentro de esa ventana el sistema no reporto en julio ni agosto 2025,
asi que el dato real arranca el **2025-09-05**: 228 dias con dato, 197 utilizables.

---

## 0. Resumen ejecutivo

1. Los acumuladores de energia **si sirven**, y ademas estan **en kWh pese al
   sufijo `_wh`**. Son contadores **diarios** que se reinician a medianoche. Los 39
   MWh que hicieron descartarlos venian de **una sola fila** contaminada.
2. La formula literal `Irradiancia*5/60` infla la irradiacion de la ventana un
   **+83,6%** (factor 1,84x), con un maximo de **+860%** en octubre 2025 y un
   **-6,7%** en febrero 2026. **El error cambia de signo**, asi que no se puede
   corregir con una constante.
3. Con el metodo de Leo, **gana el inclinado (PV1)**, y gana en los diez meses.
   Contra irradiancia horizontal: **PR1 0,733 vs PR2 0,517** (+41,6%).
4. La respuesta **depende fuerte** del insumo de irradiancia, pero **solo para el
   vertical**: el PR de PV2 va de 0,612 (POA bifacial) a **1,217** (POA frontal),
   un rango del **99%**. El de PV1 varia 14%. Un PR de 1,217 es fisicamente
   imposible: prueba de que el aporte trasero del vertical existe, y de que casi
   toda la ventaja aparente de PV2 vive en una cantidad **modelada**.
5. Hallazgo no pedido pero que condiciona todo: **43 de los 197 dias utiles (22%)
   tienen generacion nula con sol pleno y registro completo**. Es el escenario de
   R3 (inversor desacoplado). Incluirlos o no mueve el PR de 0,648 a 0,830, pero
   **no cambia el ganador**.

---

## 1. Naturaleza de `energia_pv1_wh` / `energia_pv2_wh`

### Que son

**Acumuladores diarios que se reinician a medianoche, expresados en kWh.**

Evidencia, fila por fila. Dia 2026-04-15 completo (extracto):

| timestamp | potencia_pv1_w | energia_pv1_wh | energia_pv2_wh | energia_hoy_wh | energia_total_wh |
|---|---|---|---|---|---|
| 10:15 | 1366,4 | 0,000 | 0,000 | 0,1 | 2374,1 |
| 11:00 | 1100,1 | 0,595 | 0,300 | 0,881 | 2374,9 |
| 13:00 | 1019,0 | 2,186 | 1,114 | 3,171 | 2377,2 |
| 16:25 | 174,9 | 3,900 | 3,100 | 6,700 | 2380,7 |
| 17:55 | 1,2 | 4,000 | 3,200 | 6,900 | 2380,9 |

Los tres contadores diarios crecen monotonos y cierran el dia; `energia_total_wh`
avanza **+6,8** en el dia, que es lo que marca `energia_hoy_wh` (6,9). Y 6,9 < 4,0
+ 3,2 = 7,2, exactamente lo que dice R7: la AC es un poco menor que la suma DC por
las perdidas del inversor.

### Reinicios y saltos negativos

Medido sobre las 19.635 parejas consecutivas con dato:

| columna | saltos negativos totales | de esos, INTRA-dia |
|---|---|---|
| `energia_pv1_wh` | 63 | **3** |
| `energia_pv2_wh` | 62 | **2** |
| `energia_hoy_wh` | 152 | **3** |
| `energia_total_wh` | 1 | **1** |

De las 67 fronteras de dia en que las dos filas tienen dato, **62 abren el dia
nuevo en 0,000**. O sea: el salto negativo es el reinicio de medianoche, no un
fallo. Dentro del dia el contador practicamente nunca retrocede.

Los tres retrocesos intra-dia de PV1 son:

- `2025-10-07 07:50`: viene de la fila **contaminada** de las 07:45 (ver abajo).
- `2026-04-24 07:05` y `07:10`: bajada de 0,23 a 0,02 a 0,00 kWh. Reinicio del
  inversor al amanecer, 0,23 kWh de perdida. Irrelevante.

### Las unidades: son kWh, no Wh

Comprobado contra la integral de la potencia (que si esta en W). Sobre los dias con
cobertura completa la razon `integral_Wh / contador` da **~1000** de forma
sistematica:

| dia | horas cubiertas | integral PV1 (Wh) | contador PV1 | razon |
|---|---|---|---|---|
| 2025-05-08 | 12,75 | 5.016,4 | 4,9 | 1.023,8 |
| 2025-05-14 | 12,75 | 4.993,9 | 5,0 | 998,8 |
| 2025-05-15 | 12,67 | 5.292,9 | 5,3 | 998,7 |
| 2025-05-17 | 12,75 | 5.797,9 | 5,8 | 999,6 |
| 2025-05-19 | 12,83 | 3.797,8 | 3,8 | 999,4 |
| 2025-06-05 | 12,75 | 3.506,1 | 3,5 | 1.001,7 |

Sobre 83 dias bien cubiertos la mediana de `contador_kWh*1000 / integral_Wh` es
**0,992** (PV1) y **0,980** (PV2). Coincide con la medicion independiente del
coordinador (mediana 1.003,9 sobre 128 dias contra `potencia_total_wac`).

### La contaminacion: el mito de los 39 MWh

**Advertencia B queda respondida: era un artefacto, y sigue vivo en la vista
corregida.** `v_sc_electrico_corregido` aplica `CASE` a voltaje, corriente,
potencia y temperatura, pero **pasa las cuatro columnas de energia sin tocar**.

En toda la serie hay exactamente **dos** filas anomalas:

| timestamp | n_muestras | energia_pv1_wh | energia_hoy_wh | energia_total_wh |
|---|---|---|---|---|
| 2025-10-07 07:45 | 1 | **203.194,6** | 671,1 | **39.328.367,1** |
| 2026-03-09 17:55 | 1 | (NULL) | **137,25** | (NULL) |

Excluidas esas dos, `energia_total_wh` recorre 182,3 -> 2.710,7 de forma monotona:
un acumulador **de vida en kWh**, del todo plausible para 2,84 kWp en la ventana
util (954 kWh/kWp). El descarte previo del contador **fue un artefacto de leer la
tabla sucia**, tal como sospechaba la advertencia B.

### Cobertura: el limite real del metodo de Leo

| mes | filas | `potencia_pv1_w` | `energia_pv1_wh` | dias |
|---|---|---|---|---|
| 2025-09 | 902 | 902 | 902 | 8 |
| 2025-10 | 2.627 | 2.626 | 2.627 | 20 |
| 2025-11 | 3.510 | 3.153 | **0** | 28 |
| 2025-12 | 4.013 | 3.756 | **0** | 31 |
| 2026-01 | 4.124 | 3.670 | **0** | 31 |
| 2026-02 | 3.733 | 3.343 | **0** | 28 |
| 2026-03 | 4.010 | 3.759 | 3.207 | 27 |
| 2026-04 | 4.297 | 4.140 | 4.140 | 29 |
| 2026-05 | 3.686 | 3.497 | 3.497 | 25 |
| 2026-06 | 155 | 150 | 150 | 1 |

**Los acumuladores por arreglo faltan por completo entre nov-2025 y feb-2026**
(118 dias). En la ventana util quedan **105 dias con contador de 228**, y tras el
filtro de dias validos, **91 de 197**.

### Veredicto de la medicion 1

**El plan A de Leo funciona, y se usa. Se reporta el plan B en paralelo, no en su
lugar.** Los acumuladores son fieles pero cubren menos de la mitad de la ventana;
integrar la potencia recupera los otros 106 dias. Sobre los 91 dias en que los dos
existen, los dos metodos dan el mismo PR dentro del **0,7%** (PR1 vs GHI: 0,677 con
contador, 0,682 con integral). Ambos numeros van en el informe, etiquetados.

### Sobre el -14% de la integracion (advertencia del coordinador)

Se reprodujo y **la causa no es el peso de las filas, es la cobertura**. Sobre los
144 dias con contador de toda la serie, la integral por dt real queda **-3,8%**
(PV1) y **-12,9%** (PV2) bajo el contador. Pero el desglose mensual muestra que el
hueco vive entero en los meses con dias truncados:

| mes | dias | contador PV1 (kWh) | integral dt real | dif % | valor de apertura medio | horas cubiertas |
|---|---|---|---|---|---|---|
| 2024-12 | 2 | 6,3 | 1,1 | **-83,3%** | 2,65 | 2,88 |
| 2025-05 | 19 | 79,8 | 76,4 | -4,3% | 0,22 | 11,03 |
| 2025-06 | 18 | 69,7 | 69,7 | 0,0% | 0,05 | 12,09 |
| 2025-09 | 8 | 30,5 | 20,2 | **-33,8%** | 0,31 | 9,44 |
| 2025-10 | 20 | 63,9 | 64,3 | +0,6% | 0,02 | 10,95 |
| 2026-03 | 22 | 103,9 | 104,2 | +0,3% | 0,00 | 12,80 |
| 2026-04 | 29 | 116,7 | 118,3 | +1,4% | 0,00 | 12,36 |
| 2026-05 | 25 | 99,7 | 94,4 | -5,3% | 0,23 | 12,32 |
| 2026-06 | 1 | 2,2 | 2,2 | +0,2% | 0,00 | 12,92 |

Cuando el registrador arranca tarde, **el contador ya trae la manana en el bolsillo
y la integral no puede inventarla**: el "valor de apertura" del contador lo delata
(2,65 kWh en dic-2024, 0,31 en sep-2025, 0,00 en los meses limpios). En los meses
con apertura ~0 y dia completo los dos metodos coinciden dentro de **±1,4%**. Por
eso el criterio de dia valido es lo que hace comparables los dos planes, y no un
peso mejor elegido.

Peso plano de 5 min vs dt real, sobre los mismos 105 dias de la ventana util:
**-3,4% y -3,2%** respectivamente. En lo electrico la diferencia de peso es menor
que en la radiacion, porque lo electrico **si** esta remuestreado a 5 min uniformes.

---

## 2. Irradiacion diaria y el error de `Irradiancia*5/60`

### La formula que se implemento

```
radiacion_intervalo_wh_m2 = irradiancia_wm2 * (dt_real_seg / 3600)
dt_real_seg = LEAST(COALESCE(lead(timestamp) - timestamp, 300), TECHO_DT_SEG)
TECHO_DT_SEG = 600
```

`TECHO_DT_SEG = 600 s` es el doble de la cadencia nominal de 5 min: el mismo
criterio de "intervalo excesivo" que ya usa el barrido de calidad. Sin techo, el
salto nocturno de **40.200 s** (25 apariciones en la ventana) se integraria como
once horas de sol. El `lead` se particiona **por dia**, asi que el salto de la
noche nunca entra; la ultima fila del dia recibe 300 s.

### Por que se parte de `v_sc_radiacion_calibrada` con `qc_ok`

`radiacion_sc_poa` esta construida **solo sobre las filas `qc_ok`**: 56.450 filas,
exactamente el numero de `qc_ok` en la ventana. Integrar el GHI sobre una rejilla
mas ancha que la de la POA compararia dos dias distintos. Sin ese filtro el
2025-09-22 da **14.738 Wh/m2**, fisicamente imposible (593 filas de 57.043, el
1,04%, fallan el QC).

### Cadencia real medida (ventana util, saltos dentro del dia)

| dt (s) | filas | % |
|---|---|---|
| 15 | 13.830 | 24,3 |
| 300 | 12.096 | 21,2 |
| 315 | 9.716 | 17,0 |
| 60 | 9.533 | 16,7 |
| 330 | 4.970 | 8,7 |
| 30 | 2.490 | 4,4 |
| 45 | 1.939 | 3,4 |
| 75 | 1.531 | 2,7 |

Solo el 21% de las filas mide realmente 300 s. **La suposicion de la formula
literal se cumple en una de cada cinco lecturas.**

### EL NUMERO PARA LEO: error de `5/60` por mes

| mes | dt moda (s) | dt real (kWh/m2) | literal 5/60 (kWh/m2) | factor | error |
|---|---|---|---|---|---|
| 2025-09 | 60 | 20,3 | 118,6 | 5,83x | **+483,0%** |
| 2025-10 | 60 | 63,6 | 611,0 | 9,60x | **+860,4%** |
| 2025-11 | 315 | 69,3 | 70,9 | 1,02x | +2,4% |
| 2025-12 | 315 | 95,5 | 89,1 | 0,93x | **-6,6%** |
| 2026-01 | 315 | 93,0 | 87,2 | 0,94x | **-6,3%** |
| 2026-02 | 315 | 67,7 | 63,2 | 0,93x | **-6,7%** |
| 2026-03 | 300 | 125,3 | 121,6 | 0,97x | -2,9% |
| 2026-04 | 300 | 121,3 | 121,1 | 1,00x | -0,2% |
| 2026-05 | 300 | 89,6 | 89,5 | 1,00x | -0,1% |
| 2026-06 | 300 | 4,0 | 4,0 | 1,00x | -0,1% |
| **TOTAL** | | **749,6** | **1.376,2** | **1,84x** | **+83,6%** |

Lo importante no es el +83,6% global, es que **el error cambia de signo**:

- En **sep-oct 2025** (cadencia de 15 y 60 s) la formula literal multiplica la
  irradiacion **por seis y por diez**. El PR de esos meses saldria dividido entre
  seis y entre diez, y se leeria como "los paneles se estropearon en octubre".
- En **nov 2025 - feb 2026** (cadencia real de 315 s) la formula **subestima un
  6,5%**, porque supone 300 s donde el registrador tarda 315. El PR de esos meses
  saldria inflado un 7%, y se leeria como "el invierno rinde mejor".
- En **mar-jun 2026** (cadencia de 300 s de verdad) la formula literal y la
  generalizada coinciden dentro del **0,2%**. Ahi Leo tiene razon exacta.

Es decir: la formula literal no introduce un sesgo constante que se pueda
descontar, sino **una estacionalidad falsa de un orden de magnitud**, dictada por
cuando cambio la cadencia del registrador y no por el sol.

### Irradiacion mensual y horas de dato real

Sobre los 197 dias validos:

| mes | dias | h dato/dia | cobertura | GHI (kWh/m2) | GHI/dia | POA1 bif | POA1 fr | POA2 bif | POA2 fr |
|---|---|---|---|---|---|---|---|---|---|
| 2025-09 | 5 | 11,99 | 0,99 | 17,00 | 3,40 | 20,20 | 17,37 | 13,00 | 7,52 |
| 2025-10 | 17 | 11,86 | 1,00 | 58,13 | 3,42 | 68,36 | 58,82 | 50,53 | 25,92 |
| 2025-11 | 23 | 11,62 | 1,00 | 64,11 | 2,79 | 74,89 | 65,19 | 59,70 | 26,80 |
| 2025-12 | 28 | 11,66 | 1,01 | 89,19 | 3,19 | 105,72 | 92,91 | 80,57 | 34,66 |
| 2026-01 | 25 | 11,77 | 1,01 | 75,20 | 3,01 | 88,44 | 77,71 | 67,46 | 29,77 |
| 2026-02 | 26 | 11,82 | 1,00 | 64,94 | 2,50 | 74,02 | 64,67 | 58,51 | 28,43 |
| 2026-03 | 22 | 12,72 | 1,05 | 102,87 | 4,68 | 112,98 | 101,43 | 76,89 | 39,66 |
| 2026-04 | 27 | 12,91 | 1,04 | 117,50 | 4,35 | 126,09 | 111,79 | 92,25 | 51,86 |
| 2026-05 | 23 | 12,89 | 1,02 | 87,69 | 3,81 | 94,68 | 82,03 | 73,33 | 42,76 |
| 2026-06 | 1 | 12,92 | 1,02 | 3,97 | 3,97 | 4,33 | 3,65 | 3,30 | 1,84 |
| **TOTAL** | **197** | **12,16** | **1,02** | **680,59** | **3,45** | **769,71** | **675,57** | **575,52** | **289,22** |

La cobertura pasa de 1,00 porque `horas_sol` de `ventana_solar` mide de amanecer a
atardecer y el registrador graba algunos minutos antes y despues.

La serie diaria completa (228 dias) esta en el **anexo A**.

### Criterio de dia valido

```
cob_rad  = horas_de_dato_radiacion / horas_sol  >= 0,90
cob_ele  = horas_de_dato_electrico / horas_sol  >= 0,90
|horas_rad - horas_ele| <= 0,5 h
```

El tercero es el que de verdad importa y no es obvio: si el piranometro grabo doce
horas y el inversor seis, el PR sale a la mitad **sin que ninguna de las dos
coberturas se vea mal por separado**. Es el caso del 2026-03-09 (4,97 h de
radiacion contra 9,67 h de electrico) y del 2025-09-22 (2,92 contra 6,08).

**228 dias con dato, 31 descartados, 197 validos.** Los 31 estan listados en el
anexo B.

---

## 3. Performance Ratio: definicion usada

Se copio la definicion que ya circula en el proyecto, la de `v_sc_performance`:

```
PR = (E_kWh / P0_kWp) / (H_kWh_m2 / 1 kW/m2)      con P0 = 1,420 kWp por arreglo
```

Adimensional. La unica diferencia con la vista es la **unidad de agregacion**: la
vista lo evalua fila a fila cada 5 min; aca se agrega por dia y por mes, ponderando
por energia, `PR_periodo = sum(E) / (P0 * sum(H))`. Es la forma estandar (IEC
61724) de subir un PR a un periodo, y la misma que ya usa `tools/performance.py`.

### Nota sobre el estado de `v_sc_performance` en produccion

La vista **viva** en la base todavia usa el `JOIN ... USING ("timestamp")` exacto.
La migracion `sql/002_performance_emparejado_por_bin.sql`, que corrige el
emparejamiento promediando la POA por bin de 5 min, **existe en el repo pero no
esta aplicada**. Verificado contra `pg_views` y por el conteo: la vista viva da
3.041 pares, el bin da 19.482.

Los dos baselines se remidieron hoy y reproducen exactamente lo documentado:

| metodo punto a punto | pares | PR1 | PR2 | gana |
|---|---|---|---|---|
| timestamp exacto (vista viva) | 3.041 | 0,622 | 0,626 | PV2 |
| promedio de ventana de 5 min | 19.482 | 0,664 | 0,633 | PV1 |

---

## 4. Resultado: PR mensual y anual

### 4.1 Tabla mes a mes (energia por integral de potencia, 197 dias)

`GHI` = irradiancia horizontal, que es lo que describe Leo. `POA bif` y `POA fr` =
plano del arreglo, bifacial y solo cara frontal.

| mes | dias | dias caidos | PR1 GHI | PR2 GHI | gana | PR1 POAbif | PR2 POAbif | gana | PR1 POAfr | PR2 POAfr |
|---|---|---|---|---|---|---|---|---|---|---|
| 2025-09 | 5 | 1 | 0,685 | 0,374 | **PV1** | 0,577 | 0,489 | **PV1** | 0,671 | 0,844 |
| 2025-10 | 17 | 3 | 0,704 | 0,516 | **PV1** | 0,598 | 0,594 | **PV1** | 0,695 | 1,158 |
| 2025-11 | 23 | 8 | 0,723 | 0,501 | **PV1** | 0,619 | 0,538 | **PV1** | 0,711 | 1,199 |
| 2025-12 | 28 | 7 | 0,819 | 0,563 | **PV1** | 0,691 | 0,623 | **PV1** | 0,786 | 1,448 |
| 2026-01 | 25 | 8 | 0,771 | 0,520 | **PV1** | 0,655 | 0,580 | **PV1** | 0,746 | 1,314 |
| 2026-02 | 26 | 5 | 0,828 | 0,583 | **PV1** | 0,726 | 0,648 | **PV1** | 0,831 | 1,333 |
| 2026-03 | 22 | 5 | 0,664 | 0,443 | **PV1** | 0,604 | 0,592 | **PV1** | 0,673 | 1,148 |
| 2026-04 | 27 | 4 | 0,682 | 0,503 | **PV1** | 0,636 | 0,641 | PV2 | 0,717 | 1,141 |
| 2026-05 | 23 | 2 | 0,741 | 0,577 | **PV1** | 0,686 | 0,690 | PV2 | 0,792 | 1,182 |
| 2026-06 | 1 | 0 | 0,391 | 0,283 | **PV1** | 0,359 | 0,341 | **PV1** | 0,426 | 0,612 |
| **ANUAL** | **197** | **43** | **0,733** | **0,517** | **PV1** | **0,648** | **0,612** | **PV1** | **0,738** | **1,217** |

**Contra GHI, PV1 gana los diez meses.** Contra POA bifacial gana ocho de diez, y
los dos que pierde (abr y may 2026) son por 0,005 y 0,004: un empate.

La estacionalidad es real y el promedio anual la esconde. La brecha PV1-PV2 contra
POA bifacial:

| mes | sep | oct | nov | dic | ene | feb | mar | abr | may |
|---|---|---|---|---|---|---|---|---|---|
| PR1 - PR2 | +0,088 | +0,004 | +0,081 | +0,068 | +0,075 | +0,078 | +0,012 | **-0,005** | **-0,004** |

El patron es limpio: **en oct/mar/abr/may la brecha se cierra** (sol alto, cerca
del cenit) y **en nov-feb el inclinado se despega** (sol bajo y al sur, que es a
donde mira PV1 con azimut 150; PV2 mira al 50, nordeste, y en esos meses vive de
difusa y de reflejada).

### 4.2 Metodo literal de Leo: energia por contador (91 dias)

| mes | dias | PR1 GHI | PR2 GHI | PR1 POAbif | PR2 POAbif | PR1 POAfr | PR2 POAfr |
|---|---|---|---|---|---|---|---|
| 2025-09 | 5 | 0,675 | 0,365 | 0,568 | 0,477 | 0,661 | 0,824 |
| 2025-10 | 17 | 0,697 | 0,506 | 0,592 | 0,583 | 0,688 | 1,136 |
| 2026-03 | 18 | 0,621 | 0,409 | 0,568 | 0,553 | 0,632 | 1,075 |
| 2026-04 | 27 | 0,674 | 0,493 | 0,628 | 0,627 | 0,708 | 1,116 |
| 2026-05 | 23 | 0,736 | 0,570 | 0,682 | 0,682 | 0,787 | 1,169 |
| 2026-06 | 1 | 0,390 | 0,284 | 0,358 | 0,342 | 0,425 | 0,614 |
| **TOTAL** | **91** | **0,677** | **0,485** | **0,615** | **0,607** | **0,699** | **1,106** |

Los dos planes, sobre los mismos 91 dias:

| fuente de energia | PR1 GHI | PR2 GHI | PR1 POAbif | PR2 POAbif |
|---|---|---|---|---|
| contador (plan A, literal de Leo) | 0,677 | 0,485 | 0,615 | 0,607 |
| integral dt real (plan B) | 0,682 | 0,493 | 0,620 | 0,618 |
| diferencia | +0,7% | +1,6% | +0,8% | +1,8% |

**Los dos metodos convergen.** Pero **este subconjunto no representa el año**: le
faltan nov-2025 a feb-2026, justo los meses en que el inclinado se despega. Por eso
el PR2 POAbif del contador (0,607) queda casi pegado al de PV1 (0,615), mientras
que sobre el año completo la brecha es de 0,036. Cualquier "PR anual" calculado
solo con el contador tiene **sesgo estacional de muestreo** y hay que decirlo.

### 4.3 Comparacion con lo que ya teniamos

| metodo | unidad de analisis | PR1 (inclinado) | PR2 (vertical) | gana | brecha |
|---|---|---|---|---|---|
| timestamp exacto (vista viva) | 5 min | 0,622 | 0,626 | PV2 | -0,6% |
| promedio de ventana de 5 min | 5 min | 0,664 | 0,633 | PV1 | +4,9% |
| **Leo, contador, POA bifacial** | dia -> año | **0,615** | **0,607** | **PV1** | **+1,3%** |
| **Leo, integral, POA bifacial** | dia -> año | **0,648** | **0,612** | **PV1** | **+5,9%** |
| **Leo, integral, GHI horizontal** | dia -> año | **0,733** | **0,517** | **PV1** | **+41,6%** |

El metodo de Leo con POA bifacial (0,648 / 0,612) **cae casi encima del metodo de
bin de 5 min** (0,664 / 0,633) y **confirma su veredicto**. Tres metodos
independientes de emparejamiento (bin de 5 min, muestra mas cercana, y ahora
agregacion diaria) coinciden en que gana el inclinado. El unico que decia lo
contrario era el join por timestamp exacto, que ya sabiamos sesgado (el 69% de su
muestra salia de dos meses).

---

## 5. La version con POA: PENDIENTE DE HUGO (R2)

**Marcado como no cerrado.** `radiacion_sc_poa` es una transposicion modelada con
pvlib. R2 pide confirmar con Hugo **cual ecuacion** usar. Lo de abajo es el mismo
calculo con el mejor insumo disponible hoy, no un resultado firme.

### Sensibilidad del PR anual al insumo de irradiancia

| insumo | PR1 (inclinado) | PR2 (vertical) | gana | brecha |
|---|---|---|---|---|
| GHI horizontal | 0,733 | 0,517 | **PV1** | +41,6% |
| POA frontal | 0,738 | **1,217** | PV2 | -39,4% |
| POA bifacial | 0,648 | 0,612 | **PV1** | +5,9% |

| arreglo | PR bifacial | PR frontal | variacion |
|---|---|---|---|
| PV1 inclinado | 0,648 | 0,738 | **14%** |
| PV2 vertical | 0,612 | 1,217 | **99%** |

**Este es el hallazgo, con su numero.** El PR del vertical **se duplica** segun se
use POA frontal o bifacial; el del inclinado se mueve un 14%. Y el valor frontal de
PV2, **1,217**, es fisicamente imposible: ningun arreglo entrega mas energia que la
luz que recibe por P0. Que sea imposible **prueba que el aporte trasero existe**,
pero tambien deja claro que la mitad del denominador de PV2 **no se midio, se
modelo**.

Dias con PR frontal > 1 (imposible): **PV2 en 138 de 197 dias (70%), maximo 3,19**.
PV1 en 55 de 197 (28%), maximo 1,60.

Y la posicion de PV2 en el ranking **depende enteramente de esa cantidad modelada**:

| insumo | dias que gana PV1 | dias que gana PV2 |
|---|---|---|
| GHI | 161 | 5 |
| POA bifacial | 120 | 46 |
| POA frontal | 3 | **163** |

### Aporte trasero modelado, por mes

| mes | ganancia trasera PV1 | ganancia trasera PV2 | POA1bif/GHI | POA2bif/GHI |
|---|---|---|---|---|
| 2025-09 | +16,3% | +72,8% | 1,19 | 0,76 |
| 2025-10 | +16,2% | +94,9% | 1,18 | 0,87 |
| 2025-11 | +14,9% | **+122,7%** | 1,17 | 0,93 |
| 2025-12 | +13,8% | **+132,4%** | 1,19 | 0,90 |
| 2026-01 | +13,8% | **+126,6%** | 1,18 | 0,90 |
| 2026-02 | +14,5% | +105,8% | 1,14 | 0,90 |
| 2026-03 | +11,4% | +93,9% | 1,10 | 0,75 |
| 2026-04 | +12,8% | +77,9% | 1,07 | 0,79 |
| 2026-05 | +15,4% | +71,5% | 1,08 | 0,84 |
| **TOTAL** | **+13,9%** | **+99,0%** | **1,13** | **0,85** |

Concuerda con el +15% / +109% que el equipo ya habia medido (la diferencia sale de
restringir a dias validos y de pesar por dt real). Y agrega la estacionalidad: en
**dic-ene la cara trasera aporta el 57% de toda la irradiancia de PV2** (+132%). En
esos meses el PR del vertical es **mayoritariamente una prediccion de modelo**, no
una medicion, y es justo cuando mas lejos queda de PV1.

---

## 6. Discrepancias y avisos que NO hay que maquillar

### 6.1 El 22% de los dias utiles tiene generacion nula con sol pleno

**43 de los 197 dias validos** (31 con energia exactamente 0) tienen cobertura
completa de radiacion Y de electrico, sol normal, y **PR ~ 0**. Ejemplos:
2026-01-25 con 4,41 kWh/m2 de GHI y 0 Wh generados; 2026-05-08 con 6,21 kWh/m2 y 0
Wh. Es exactamente el escenario que describe R3: el inversor no se acopla a la red.

No es un problema de dato, **es indisponibilidad del equipo**, y hay que decidir a
proposito si entra en el PR:

| | dias | PR1 GHI | PR2 GHI | PR1 POAbif | PR2 POAbif | gana |
|---|---|---|---|---|---|---|
| todos los dias validos | 197 | 0,733 | 0,517 | 0,648 | 0,612 | PV1 |
| solo dias con el inversor operando | 154 | 0,938 | 0,661 | **0,830** | **0,779** | PV1 |

La norma IEC 61724 incluye la indisponibilidad en el PR (por eso 0,648), pero para
juzgar **el arreglo** y no la planta, el numero relevante es 0,830 / 0,779. El
ganador no cambia; la brecha pasa de +5,9% a **+6,5%**. Las dos cifras deberian
reportarse siempre juntas: un PR de 0,648 hace pensar en paneles malos cuando lo
que hubo fue un inversor apagado 43 dias.

### 6.2 Discrepancia abierta: regimen anomalo nov-2025 a feb-2026

Los PR de esos cuatro meses **no son de fiar**, y la evidencia es convergente. A
igual irradiancia medida (GHI entre 700 y 900 W/m2), la potencia media de PV1 por
mes:

| mes | sep | oct | **nov** | **dic** | **ene** | **feb** | mar | abr | may |
|---|---|---|---|---|---|---|---|---|---|
| P1 media (W) a GHI 700-900 | 943 | 953 | **1.206** | **1.208** | **1.200** | **1.094** | 969 | 936 | 887 |

**+27% de potencia a la misma irradiancia** en nov-ene contra oct o mar. La
geometria explica parte (POA1/GHI sube de 1,07-1,10 en mar-abr a 1,17-1,19 en
nov-ene, o sea +8%), no los 27 puntos. Coincide ademas con:

- Es el unico tramo en que **desaparecen** `energia_pv*_wh`, `energia_total_wh` y
  `potencia_total_wac` (cambio de esquema del CSV).
- **240 / 123 / 140 / 111 filas** con `voltaje_pv1_v > 250 V` en nov/dic/ene/feb,
  contra **0** en sep, oct, abr, may. La tension de operacion real es ~184 V; el
  limite de 600 V de la vista corregida es demasiado laxo para atraparlas.
- **9 / 18 / 5 / 7 filas** con `potencia_pv1_w` por encima del nominal de 1.420 W,
  contra 0 en el resto.
- `kt` medio de **0,353 en febrero**, el minimo de la serie, cuando febrero es
  estacion seca y deberia ser de los meses mas despejados.
- `PR1` contra POA **frontal** de **1,115 / 1,063 / 1,095 / 1,033** en esos cuatro
  meses (dias con inversor operando): fisicamente imposible tambien para el
  inclinado, no solo para el vertical.

No se puede resolver desde la base: o la irradiancia esta subestimada ~20% en ese
tramo (suciedad del piranometro? deriva?), o lo electrico esta sobreestimado, o
las dos cosas. **Queda como hallazgo para el equipo.**

Lo tranquilizador es que el veredicto **no depende de ese tramo**:

| subconjunto | dias | PR1 GHI | PR2 GHI | PR1 POAbif | PR2 POAbif | gana |
|---|---|---|---|---|---|---|
| todos los validos | 197 | 0,733 | 0,517 | 0,648 | 0,612 | PV1 |
| **sin nov25-feb26** | 95 | 0,691 | 0,498 | 0,627 | 0,623 | PV1 |
| sin nov25-feb26, inversor operando | 80 | 0,832 | 0,598 | 0,754 | 0,741 | PV1 |
| solo nov25-feb26 | 102 | 0,788 | 0,543 | 0,674 | 0,598 | PV1 |
| contador (plan A) | 91 | 0,677 | 0,485 | 0,615 | 0,607 | PV1 |

**PV1 gana en los cinco cortes.**

### 6.3 Aviso de lectura: el PR contra GHI no es un PR

Contra irradiancia horizontal el denominador es el **mismo para los dos arreglos**,
asi que `PR1/PR2` es identico a `E1/E2`. El +41,6% no dice "el inclinado convierte
mejor", dice **"el inclinado produce un 41,6% mas de energia por kWp instalado"**.
Es la pregunta mas util para decidir como orientar el proximo arreglo, pero no es
una medida de eficiencia de conversion. Para eso hay que ir a POA, y ahi la brecha
cae a +5,9%.

Rendimiento especifico sobre los 197 dias: **PV1 498,7 kWh/kWp, PV2 352,1
kWh/kWp** (razon 1,416).

---

## VEREDICTO

**Con el metodo de Leo (energia diaria contra irradiacion diaria, agregado por mes
y por año), gana el arreglo INCLINADO (PV1).**

- Contra la irradiancia horizontal que Leo describe: **PR1 0,733 vs PR2 0,517**,
  el inclinado un **+41,6%** arriba. Gana **los diez meses**, sin una sola
  excepcion.
- Con la energia del contador, que es la formulacion literal de R1: **0,677 vs
  0,485**. El mismo veredicto con la mitad de los dias.
- Este resultado **confirma el emparejamiento por bin de 5 min** (0,664 / 0,633) y
  **contradice el join por timestamp exacto** (0,622 / 0,626), que era el unico que
  daba ganador al vertical y que ya sabiamos sesgado. Es la tercera metodologia
  independiente que llega a la misma conclusion.

**Cuanto depende de horizontal vs POA: muchisimo, y de forma asimetrica.**

- El PR de **PV1 casi no se mueve**: 0,648 (POA bifacial) a 0,738 (POA frontal),
  un 14%.
- El PR de **PV2 se duplica**: 0,612 a **1,217**, un 99%. Y 1,217 es imposible.
- **Con POA bifacial el inclinado sigue ganando** (0,648 vs 0,612, +5,9%), pero la
  brecha se comprime de 42 puntos a 6. Casi toda la ventaja del inclinado en la
  version horizontal es **geometrica**, no de calidad de conversion: PV1 recibe
  1,13 veces el GHI y PV2 solo 0,85 veces.
- **Con POA frontal el ganador se invierte**, pero ese resultado hay que
  descartarlo: da PR > 1 en el 70% de los dias del vertical. No es un empate
  metodologico, es un modelo incompleto.

**Lo que esto significa en una frase:** el inclinado gana por producir mas energia
(+42% por kWp), no por convertir mejor (+6%). Y ese +6% **no es un resultado
cerrado**, porque el 50% de la irradiancia con que se juzga al vertical
(+99,0% de aporte trasero modelado, hasta +132% en diciembre) sale de una
transposicion que **R2 todavia espera que Hugo confirme**. Si Hugo cambia la
ecuacion de transposicion o el factor de bifacialidad, el +5,9% se mueve; el +41,6%
contra horizontal no, porque no depende de ningun modelo.

**Tres cosas que hay que llevarle a Leo, ademas del veredicto:**

1. `Irradiancia*5/60` hay que generalizar a `Irradiancia*(dt_real/3600)` con techo.
   No es un refinamiento: la formula literal **infla octubre 2025 un +860% y
   desinfla diciembre un -6,6%**, o sea inventa una estacionalidad de un orden de
   magnitud que no existe en el cielo.
2. Sus acumuladores **si sirven**, y estan **en kWh pese al nombre `_wh`**. Los 39
   MWh que los habian condenado eran **una sola fila** contaminada. Pero faltan
   enteros entre nov-2025 y feb-2026, asi que el PR anual solo con ellos tiene
   sesgo estacional y conviene reportarlo junto al de la integral.
3. El 22% de los dias utiles tiene el inversor caido con sol pleno (el caso de su
   R3). Eso, y no los paneles, es lo que baja el PR de 0,830 a 0,648.

---

## SQL usado

### Serie diaria (la consulta principal)

```sql
WITH rad AS (
    SELECT r."timestamp",
           r."timestamp"::date                     AS dia,
           r.irradiancia_incidente_wm2             AS ghi,
           p.poa_pv1_wm2, p.poa_pv2_wm2,
           p.poa_pv1_front_wm2, p.poa_pv2_front_wm2,
           -- TECHO_DT_SEG = 600 s: el doble de la cadencia nominal de 5 min. Sin
           -- techo, el salto nocturno de 40.200 s se integra como once horas de sol.
           LEAST(COALESCE(EXTRACT(epoch FROM (
                    lead(r."timestamp") OVER (PARTITION BY r."timestamp"::date
                                              ORDER BY r."timestamp")
                    - r."timestamp")), 300), 600)  AS dt
      FROM v_sc_radiacion_calibrada r
      LEFT JOIN radiacion_sc_poa p USING ("timestamp")
     WHERE r."timestamp" >= '2025-07-01'
       AND r.irradiancia_incidente_wm2 IS NOT NULL
       -- radiacion_sc_poa esta construida solo sobre filas qc_ok: sin este filtro
       -- el GHI se integra sobre una rejilla mas ancha que la POA (y el 2025-09-22
       -- da 14.738 Wh/m2, imposible).
       AND r.qc_ok
), rad_dia AS (
    SELECT dia,
           count(*)                                        AS n_rad,
           round((sum(dt)/3600.0)::numeric, 3)             AS horas_rad,
           round(sum(ghi * dt / 3600.0)::numeric, 1)       AS ghi_wh_m2_dtreal,
           round(sum(ghi * 5.0/60.0)::numeric, 1)          AS ghi_wh_m2_literal,
           round(sum(poa_pv1_wm2       * dt / 3600.0)::numeric, 1) AS poa1_bif_wh_m2,
           round(sum(poa_pv2_wm2       * dt / 3600.0)::numeric, 1) AS poa2_bif_wh_m2,
           round(sum(poa_pv1_front_wm2 * dt / 3600.0)::numeric, 1) AS poa1_front_wh_m2,
           round(sum(poa_pv2_front_wm2 * dt / 3600.0)::numeric, 1) AS poa2_front_wh_m2,
           mode() WITHIN GROUP (ORDER BY dt)               AS moda_dt_seg
      FROM rad GROUP BY dia
), ele AS (
    SELECT "timestamp", "timestamp"::date AS dia,
           potencia_pv1_w, potencia_pv2_w,
           energia_pv1_wh, energia_pv2_wh, energia_hoy_wh,
           LEAST(COALESCE(EXTRACT(epoch FROM (
                    lead("timestamp") OVER (PARTITION BY "timestamp"::date
                                            ORDER BY "timestamp")
                    - "timestamp")), 300), 600)            AS dt
      FROM v_sc_electrico_corregido
     WHERE "timestamp" >= '2025-07-01'
       -- v_sc_electrico_corregido NO filtra las columnas de energia: estas dos
       -- filas del piranometro pasan enteras (203.194 kWh y 39.328.367 kWh).
       AND "timestamp" NOT IN (TIMESTAMPTZ '2025-10-07 07:45+00',
                               TIMESTAMPTZ '2026-03-09 17:55+00')
), ele_dia AS (
    SELECT dia,
           count(*)                                    AS n_ele,
           round((sum(dt)/3600.0)::numeric, 3)         AS horas_ele,
           round(sum(potencia_pv1_w * dt / 3600.0)::numeric, 1) AS e1_int_wh,
           round(sum(potencia_pv2_w * dt / 3600.0)::numeric, 1) AS e2_int_wh,
           -- "el total acumulado al final de dia" (R1): el ultimo valor no nulo.
           -- Es un contador diario que se reinicia a medianoche, y esta en kWh.
           round((array_agg(energia_pv1_wh ORDER BY "timestamp" DESC)
                    FILTER (WHERE energia_pv1_wh IS NOT NULL))[1]::numeric, 3) AS e1_cont_kwh,
           round((array_agg(energia_pv2_wh ORDER BY "timestamp" DESC)
                    FILTER (WHERE energia_pv2_wh IS NOT NULL))[1]::numeric, 3) AS e2_cont_kwh
      FROM ele GROUP BY dia
)
SELECT COALESCE(r.dia, e.dia) AS dia, v.horas_sol,
       r.n_rad, r.horas_rad, r.moda_dt_seg,
       round((r.horas_rad / v.horas_sol)::numeric, 3) AS cob_rad,
       r.ghi_wh_m2_dtreal, r.ghi_wh_m2_literal,
       r.poa1_bif_wh_m2, r.poa1_front_wh_m2, r.poa2_bif_wh_m2, r.poa2_front_wh_m2,
       e.n_ele, e.horas_ele,
       round((e.horas_ele / v.horas_sol)::numeric, 3) AS cob_ele,
       e.e1_int_wh, e.e2_int_wh, e.e1_cont_kwh, e.e2_cont_kwh
  FROM rad_dia r
  FULL JOIN ele_dia e ON e.dia = r.dia
  LEFT JOIN ventana_solar v ON v.fecha = COALESCE(r.dia, e.dia)
 ORDER BY 1;
```

### Filtro de dia valido y PR agregado (sobre la salida de arriba)

```sql
-- dia valido:
--   cob_rad >= 0.90 AND cob_ele >= 0.90 AND abs(horas_rad - horas_ele) <= 0.5
--
-- PR de un periodo, ponderado por energia (IEC 61724). P0 = 1.420 kWp por arreglo.
--   PR = sum(E_kWh) / (1.420 * sum(H_kWh_m2))
--
-- H = ghi_wh_m2_dtreal/1000        -> PR contra irradiancia horizontal (Leo)
-- H = poa1_bif_wh_m2/1000          -> PR contra POA bifacial de PV1
-- H = poa1_front_wh_m2/1000        -> PR contra POA solo cara frontal de PV1
--
-- "dia con el inversor operando": PR1 contra POA bifacial >= 0.15.
```

### Naturaleza del acumulador (medicion 1)

```sql
WITH e AS (
  SELECT "timestamp", "timestamp"::date AS dia,
         energia_pv1_wh e1, energia_hoy_wh eh, energia_total_wh et,
         lag(energia_pv1_wh)   OVER (ORDER BY "timestamp") e1p,
         lag(energia_hoy_wh)   OVER (ORDER BY "timestamp") ehp,
         lag(energia_total_wh) OVER (ORDER BY "timestamp") etp,
         lag("timestamp"::date) OVER (ORDER BY "timestamp") diap
    FROM v_sc_electrico_corregido
)
SELECT count(*) FILTER (WHERE e1 IS NOT NULL AND e1p IS NOT NULL)         AS pares,
       count(*) FILTER (WHERE e1 < e1p - 1e-9)                            AS neg_total,
       count(*) FILTER (WHERE e1 < e1p - 1e-9 AND dia = diap)             AS neg_intradia,
       count(*) FILTER (WHERE dia <> diap AND e1 IS NOT NULL
                          AND e1p IS NOT NULL AND e1 < 0.001)             AS abre_en_cero
  FROM e;
```

### Error de la formula literal, por mes

```sql
-- sobre rad_dia de la consulta principal
SELECT to_char(dia,'YYYY-MM') AS mes,
       mode() WITHIN GROUP (ORDER BY moda_dt_seg)                    AS dt_moda,
       round((sum(ghi_wh_m2_dtreal) /1000)::numeric,1)               AS dt_real_kwh_m2,
       round((sum(ghi_wh_m2_literal)/1000)::numeric,1)               AS literal_kwh_m2,
       round((sum(ghi_wh_m2_literal)/sum(ghi_wh_m2_dtreal))::numeric,3)        AS factor,
       round((100*(sum(ghi_wh_m2_literal)/sum(ghi_wh_m2_dtreal)-1))::numeric,1) AS error_pct
  FROM rad_dia GROUP BY 1 ORDER BY 1;
```

### Baselines punto a punto (para comparar)

```sql
WITH poa_bin AS (
  SELECT date_bin('5 minutes', "timestamp", TIMESTAMPTZ '2024-01-01') b,
         avg(poa_pv1_wm2) q1, avg(poa_pv2_wm2) q2
    FROM radiacion_sc_poa GROUP BY 1
)
SELECT round((sum(e.potencia_pv1_w) FILTER (WHERE p.q1>100 AND e.potencia_pv1_w>=0)
            / NULLIF(1420.0*sum(p.q1/1000.0) FILTER (WHERE p.q1>100
                     AND e.potencia_pv1_w>=0),0))::numeric,3) AS pr1,
       round((sum(e.potencia_pv2_w) FILTER (WHERE p.q2>100 AND e.potencia_pv2_w>=0)
            / NULLIF(1420.0*sum(p.q2/1000.0) FILTER (WHERE p.q2>100
                     AND e.potencia_pv2_w>=0),0))::numeric,3) AS pr2
  FROM v_sc_electrico_corregido e
  JOIN poa_bin p ON p.b = date_bin('5 minutes', e."timestamp", TIMESTAMPTZ '2024-01-01');
```

### Regimen anomalo nov-feb (discrepancia 6.2)

```sql
WITH r AS (
  SELECT date_bin('5 minutes',"timestamp",TIMESTAMPTZ '2024-01-01') b,
         avg(irradiancia_incidente_wm2) ghi
    FROM v_sc_radiacion_calibrada
   WHERE "timestamp" >= '2025-09-01' AND qc_ok GROUP BY 1
)
SELECT to_char(e."timestamp",'YYYY-MM') mes,
       round(avg(e.potencia_pv1_w) FILTER (WHERE r.ghi BETWEEN 700 AND 900)::numeric,0) p1_a_ghi800,
       round(avg(e.potencia_pv2_w) FILTER (WHERE r.ghi BETWEEN 700 AND 900)::numeric,0) p2_a_ghi800
  FROM v_sc_electrico_corregido e
  JOIN r ON r.b = date_bin('5 minutes',e."timestamp",TIMESTAMPTZ '2024-01-01')
 WHERE e."timestamp" >= '2025-09-01' AND e.potencia_pv1_w > 50
 GROUP BY 1 ORDER BY 1;
```

---

## Anexo B: los 31 dias descartados

| dia | horas sol | horas rad | horas ele | cob rad | cob ele | desfase h | motivo |
|---|---|---|---|---|---|---|---|
| 2025-09-22 | 12,11 | 2,92 | 6,08 | 0,24 | 0,50 | 3,17 | cobertura + desfase |
| 2025-09-24 | 12,09 | 3,88 | 3,92 | 0,32 | 0,32 | 0,04 | cobertura |
| 2025-09-26 | 12,07 | 5,51 | 5,50 | 0,46 | 0,46 | 0,01 | cobertura |
| 2025-10-02 | 12,02 | 4,64 | 4,58 | 0,39 | 0,38 | 0,06 | cobertura |
| 2025-10-07 | 11,97 | 9,85 | 9,83 | 0,82 | 0,82 | 0,02 | cobertura |
| 2025-10-30 | 11,77 | 3,04 | 3,00 | 0,26 | 0,26 | 0,04 | cobertura |
| 2025-11-03 | 11,74 | 2,38 | 2,50 | 0,20 | 0,21 | 0,12 | cobertura |
| 2025-11-13 | 11,66 | 10,57 | 11,17 | 0,91 | 0,96 | 0,60 | desfase |
| 2025-11-20 | 11,62 | 10,61 | 11,33 | 0,91 | 0,98 | 0,72 | desfase |
| 2025-11-24 | 11,60 | 6,14 | 6,50 | 0,53 | 0,56 | 0,36 | cobertura |
| 2025-11-26 | 11,59 | 9,48 | 9,75 | 0,82 | 0,84 | 0,28 | cobertura |
| 2025-12-13 | 11,53 | 5,12 | 5,08 | 0,44 | 0,44 | 0,03 | cobertura |
| 2025-12-18 | 11,52 | 11,29 | 12,08 | 0,98 | 1,05 | 0,79 | desfase |
| 2025-12-30 | 11,53 | 11,22 | 12,00 | 0,97 | 1,04 | 0,78 | desfase |
| 2026-01-01 | 11,54 | 10,28 | 11,25 | 0,89 | 0,98 | 0,97 | cobertura + desfase |
| 2026-01-03 | 11,54 | 10,45 | 11,58 | 0,91 | 1,00 | 1,14 | desfase |
| 2026-01-04 | 11,54 | 10,63 | 11,58 | 0,92 | 1,00 | 0,95 | desfase |
| 2026-01-10 | 11,57 | 11,06 | 11,92 | 0,96 | 1,03 | 0,86 | desfase |
| 2026-01-19 | 11,61 | 11,12 | 12,08 | 0,96 | 1,04 | 0,97 | desfase |
| 2026-01-28 | 11,67 | 11,05 | 12,08 | 0,95 | 1,04 | 1,03 | desfase |
| 2026-02-03 | 11,71 | 11,05 | 11,92 | 0,94 | 1,02 | 0,86 | desfase |
| 2026-02-24 | 11,89 | 11,37 | 12,00 | 0,96 | 1,01 | 0,63 | desfase |
| 2026-03-09 | 12,01 | 4,97 | 9,67 | 0,41 | 0,81 | 4,70 | cobertura + desfase |
| 2026-03-10 | 12,02 | 12,93 | 12,25 | 1,08 | 1,02 | 0,68 | desfase |
| 2026-03-11 | 12,03 | 12,91 | 12,25 | 1,07 | 1,02 | 0,66 | desfase |
| 2026-03-21 | 12,12 | 10,58 | 12,92 | 0,87 | 1,07 | 2,33 | cobertura + desfase |
| 2026-03-23 | 12,14 | 12,25 | 12,92 | 1,01 | 1,06 | 0,67 | desfase |
| 2026-04-13 | 12,34 | 2,25 | 2,25 | 0,18 | 0,18 | 0,00 | cobertura |
| 2026-04-15 | 12,36 | 7,73 | 7,75 | 0,63 | 0,63 | 0,02 | cobertura |
| 2026-05-06 | 12,54 | 3,03 | 3,00 | 0,24 | 0,24 | 0,03 | cobertura |
| 2026-05-28 | 12,67 | 8,68 | 8,75 | 0,69 | 0,69 | 0,07 | cobertura |

---

## Anexo A: serie diaria completa (228 dias)

`h dato` = horas de radiacion realmente cubiertas (suma de dt acotado). `cob` =
esas horas contra `ventana_solar.horas_sol`. `E1 cont` = contador diario en kWh
(vacio donde la columna no vino en el CSV). Los PR se muestran para todos los dias,
incluidos los descartados, para que se pueda ver por que se descartan.

| dia | h dato | cob | dt moda s | GHI dt real Wh/m2 | GHI 5/60 Wh/m2 | err % | POA1 bif | POA2 bif | E1 Wh | E2 Wh | E1 cont kWh | PR1 GHI | PR2 GHI | PR1 POAbif | PR2 POAbif | nota |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2025-09-05 | 12.46 | 1.01 | 60 | 706 | 4373 | +519 | 814 | 763 | 941 | 753 | 0.90 | 0.938 | 0.750 | 0.814 | 0.695 |  |
| 2025-09-22 | 2.92 | 0.24 | 15 | 886 | 6040 | +581 | 1012 | 538 | 1034 | 567 | 1.80 | 0.822 | 0.450 | 0.720 | 0.742 | descartado |
| 2025-09-24 | 3.88 | 0.32 | 30 | 862 | 4736 | +449 | 985 | 669 | 991 | 724 | 6.00 | 0.809 | 0.591 | 0.708 | 0.762 | descartado |
| 2025-09-25 | 12.25 | 1.01 | 45 | 3544 | 34119 | +863 | 4184 | 2932 | 4597 | 2866 | 4.50 | 0.914 | 0.570 | 0.774 | 0.688 |  |
| 2025-09-26 | 5.51 | 0.46 | 60 | 1598 | 7756 | +385 | 1735 | 1404 | 1606 | 1794 | 6.40 | 0.708 | 0.791 | 0.652 | 0.900 | descartado |
| 2025-09-27 | 12.26 | 1.02 | 60 | 4329 | 20967 | +384 | 5158 | 3023 | 5637 | 2824 | 5.60 | 0.917 | 0.459 | 0.770 | 0.658 |  |
| 2025-09-28 | 11.85 | 0.98 | 60 | 4153 | 20109 | +384 | 5027 | 3013 | 5370 | 2578 | 5.30 | 0.911 | 0.437 | 0.752 | 0.602 |  |
| 2025-09-30 | 11.12 | 0.92 | 60 | 4269 | 20536 | +381 | 5020 | 3266 | 0 | 0 | 0.00 | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2025-10-01 | 11.60 | 0.96 | 60 | 2457 | 11637 | +374 | 2917 | 2222 | 2105 | 1356 | 2.10 | 0.603 | 0.389 | 0.508 | 0.430 |  |
| 2025-10-02 | 4.64 | 0.39 | 60 | 1462 | 6756 | +362 | 1822 | 1248 | 1758 | 854 | 1.70 | 0.847 | 0.411 | 0.679 | 0.482 | descartado |
| 2025-10-03 | 11.94 | 0.99 | 60 | 3750 | 18008 | +380 | 4301 | 3596 | 16 | 11 | 0.00 | 0.003 | 0.002 | 0.003 | 0.002 | inversor caido |
| 2025-10-04 | 11.93 | 0.99 | 60 | 3739 | 27122 | +625 | 4469 | 3106 | 4902 | 3061 | 4.90 | 0.923 | 0.577 | 0.772 | 0.694 |  |
| 2025-10-05 | 12.08 | 1.01 | 30 | 3386 | 31956 | +844 | 3911 | 3060 | 4003 | 3058 | 4.00 | 0.833 | 0.636 | 0.721 | 0.704 |  |
| 2025-10-06 | 12.26 | 1.02 | 60 | 2735 | 14802 | +441 | 3162 | 2855 | 3543 | 2788 | 3.50 | 0.912 | 0.718 | 0.789 | 0.688 |  |
| 2025-10-07 | 9.85 | 0.82 | 60 | 3636 | 20322 | +459 | 4252 | 3183 | 4463 | 3092 | 4.70 | 0.864 | 0.599 | 0.739 | 0.684 | descartado |
| 2025-10-14 | 11.90 | 1.00 | 45 | 3298 | 22517 | +583 | 3790 | 3232 | 3915 | 3593 | 3.90 | 0.836 | 0.767 | 0.727 | 0.783 |  |
| 2025-10-15 | 11.43 | 0.96 | 30 | 4148 | 38554 | +829 | 4764 | 3701 | 4664 | 4012 | 4.60 | 0.792 | 0.681 | 0.689 | 0.763 |  |
| 2025-10-16 | 11.79 | 0.99 | 60 | 2187 | 12005 | +449 | 2646 | 1909 | 0 | 0 | 0.00 | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2025-10-17 | 11.58 | 0.97 | 60 | 3428 | 16454 | +380 | 4086 | 2980 | 0 | 0 | 0.00 | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2025-10-18 | 11.85 | 1.00 | 60 | 4567 | 21905 | +380 | 5570 | 3234 | 4804 | 2410 | 4.70 | 0.741 | 0.372 | 0.607 | 0.525 |  |
| 2025-10-19 | 11.91 | 1.00 | 60 | 3849 | 18461 | +380 | 4574 | 3282 | 4704 | 3571 | 4.70 | 0.861 | 0.653 | 0.724 | 0.766 |  |
| 2025-10-20 | 12.16 | 1.03 | 60 | 2340 | 11252 | +381 | 2763 | 2278 | 3201 | 2344 | 3.20 | 0.963 | 0.705 | 0.816 | 0.725 |  |
| 2025-10-21 | 11.93 | 1.01 | 60 | 2149 | 10206 | +375 | 2574 | 2039 | 2812 | 1998 | 2.80 | 0.921 | 0.655 | 0.769 | 0.690 |  |
| 2025-10-25 | 12.08 | 1.02 | 15 | 5026 | 100521 | +1900 | 5956 | 3969 | 4888 | 4396 | 4.80 | 0.685 | 0.616 | 0.578 | 0.780 |  |
| 2025-10-26 | 11.85 | 1.00 | 15 | 2628 | 52567 | +1900 | 3086 | 2544 | 3267 | 2712 | 3.20 | 0.875 | 0.727 | 0.746 | 0.751 |  |
| 2025-10-28 | 12.10 | 1.03 | 15 | 4116 | 82313 | +1900 | 4762 | 3374 | 5568 | 3714 | 5.50 | 0.953 | 0.636 | 0.823 | 0.775 |  |
| 2025-10-29 | 11.21 | 0.95 | 15 | 4322 | 86356 | +1898 | 5029 | 3146 | 5693 | 3587 | 5.60 | 0.928 | 0.585 | 0.797 | 0.803 |  |
| 2025-10-30 | 3.04 | 0.26 | 15 | 390 | 7251 | +1758 | 445 | 391 | 0 | 0 | 0.00 | 0.000 | 0.000 | 0.000 | 0.000 | descartado |
| 2025-11-03 | 2.38 | 0.20 | 315 | 124 | 114 | -8 | 143 | 135 | 192 | 127 |  | 1.089 | 0.722 | 0.944 | 0.666 | descartado |
| 2025-11-04 | 11.41 | 0.97 | 315 | 840 | 786 | -6 | 952 | 873 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2025-11-05 | 11.83 | 1.01 | 315 | 3608 | 3391 | -6 | 4117 | 2755 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2025-11-06 | 11.46 | 0.98 | 315 | 3069 | 2826 | -8 | 3606 | 2364 | 2423 | 1413 |  | 0.556 | 0.324 | 0.473 | 0.421 |  |
| 2025-11-07 | 11.75 | 1.00 | 315 | 5074 | 4751 | -6 | 5947 | 4026 | 14 | 9 |  | 0.002 | 0.001 | 0.002 | 0.002 | inversor caido |
| 2025-11-08 | 11.32 | 0.97 | 315 | 3762 | 3511 | -7 | 4282 | 3239 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2025-11-09 | 11.38 | 0.97 | 315 | 1917 | 1795 | -6 | 2189 | 1974 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2025-11-10 | 11.74 | 1.00 | 315 | 2115 | 1980 | -6 | 2439 | 1996 | 3883 | 2271 |  | 1.293 | 0.756 | 1.121 | 0.801 |  |
| 2025-11-11 | 11.12 | 0.95 | 315 | 1565 | 1464 | -6 | 1765 | 1606 | 2662 | 1802 |  | 1.198 | 0.811 | 1.062 | 0.790 |  |
| 2025-11-12 | 11.75 | 1.01 | 315 | 1900 | 1780 | -6 | 2140 | 1883 | 3235 | 2188 |  | 1.199 | 0.811 | 1.065 | 0.818 |  |
| 2025-11-13 | 10.57 | 0.91 | 315 | 1179 | 1104 | -6 | 1352 | 1286 | 622 | 373 |  | 0.372 | 0.223 | 0.324 | 0.204 | descartado |
| 2025-11-14 | 11.48 | 0.98 | 315 | 2935 | 2748 | -6 | 3434 | 2507 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2025-11-15 | 11.82 | 1.01 | 315 | 1744 | 1631 | -6 | 1962 | 1775 | 3025 | 2129 |  | 1.222 | 0.860 | 1.086 | 0.844 |  |
| 2025-11-16 | 11.64 | 1.00 | 315 | 2801 | 2640 | -6 | 3204 | 2766 | 4110 | 3039 |  | 1.033 | 0.764 | 0.903 | 0.774 |  |
| 2025-11-17 | 11.90 | 1.02 | 315 | 1836 | 1727 | -6 | 2080 | 1952 | 2615 | 2075 |  | 1.003 | 0.796 | 0.885 | 0.749 |  |
| 2025-11-18 | 12.00 | 1.03 | 315 | 4105 | 3842 | -6 | 4955 | 3756 | 7604 | 4585 |  | 1.304 | 0.787 | 1.081 | 0.860 |  |
| 2025-11-19 | 11.91 | 1.02 | 315 | 4892 | 4532 | -7 | 5929 | 4305 | 8700 | 5249 |  | 1.253 | 0.756 | 1.033 | 0.859 |  |
| 2025-11-20 | 10.61 | 0.91 | 315 | 1470 | 1375 | -6 | 1744 | 1656 | 227 | 142 |  | 0.109 | 0.068 | 0.092 | 0.060 | descartado |
| 2025-11-21 | 11.30 | 0.97 | 315 | 2334 | 2214 | -5 | 2726 | 2283 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2025-11-22 | 11.89 | 1.02 | 315 | 3036 | 2793 | -8 | 3522 | 3125 | 345 | 447 |  | 0.080 | 0.104 | 0.069 | 0.101 | inversor caido |
| 2025-11-23 | 11.92 | 1.03 | 315 | 3925 | 3681 | -6 | 4668 | 3721 | 6556 | 4762 |  | 1.176 | 0.854 | 0.989 | 0.901 |  |
| 2025-11-24 | 6.14 | 0.53 | 315 | 872 | 1375 | +58 | 996 | 1088 | 1525 | 2182 |  | 1.232 | 1.763 | 1.079 | 1.413 | descartado |
| 2025-11-25 | 11.75 | 1.01 | 120 | 2731 | 5096 | +87 | 3266 | 2816 | 6356 | 4542 |  | 1.639 | 1.171 | 1.371 | 1.136 |  |
| 2025-11-26 | 9.47 | 0.82 | 225 | 1514 | 2659 | +76 | 1802 | 1614 | 2858 | 1822 |  | 1.329 | 0.847 | 1.117 | 0.795 | descartado |
| 2025-11-27 | 10.75 | 0.93 | 135 | 2249 | 4000 | +78 | 2670 | 2296 | 4641 | 3776 |  | 1.453 | 1.182 | 1.224 | 1.158 |  |
| 2025-11-28 | 11.40 | 0.98 | 315 | 2265 | 2082 | -8 | 2645 | 2406 | 2964 | 2159 |  | 0.921 | 0.671 | 0.789 | 0.632 |  |
| 2025-11-29 | 11.80 | 1.02 | 315 | 1696 | 1589 | -6 | 1948 | 1766 | 503 | 373 |  | 0.209 | 0.155 | 0.182 | 0.149 |  |
| 2025-11-30 | 11.90 | 1.03 | 315 | 3712 | 3444 | -7 | 4448 | 3504 | 6156 | 4822 |  | 1.168 | 0.915 | 0.975 | 0.969 |  |
| 2025-12-01 | 11.65 | 1.01 | 315 | 2183 | 2060 | -6 | 2596 | 2080 | 3524 | 2217 |  | 1.137 | 0.715 | 0.956 | 0.751 |  |
| 2025-12-02 | 11.66 | 1.01 | 315 | 2337 | 2187 | -6 | 2718 | 2346 | 4110 | 2932 |  | 1.238 | 0.884 | 1.065 | 0.880 |  |
| 2025-12-03 | 11.50 | 0.99 | 315 | 2454 | 2309 | -6 | 2871 | 2435 | 3664 | 2556 |  | 1.051 | 0.733 | 0.899 | 0.739 |  |
| 2025-12-04 | 11.74 | 1.02 | 315 | 2371 | 2234 | -6 | 2747 | 2570 | 3584 | 3069 |  | 1.065 | 0.912 | 0.919 | 0.841 |  |
| 2025-12-05 | 11.22 | 0.97 | 315 | 3751 | 3381 | -10 | 4504 | 3560 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2025-12-06 | 11.64 | 1.01 | 315 | 4340 | 4070 | -6 | 5381 | 3808 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2025-12-07 | 11.68 | 1.01 | 315 | 2780 | 2625 | -6 | 3328 | 2614 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2025-12-08 | 11.64 | 1.01 | 315 | 3144 | 2953 | -6 | 3778 | 2997 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2025-12-09 | 11.81 | 1.02 | 315 | 3610 | 3383 | -6 | 4303 | 3241 | 3731 | 3162 |  | 0.728 | 0.617 | 0.611 | 0.687 |  |
| 2025-12-10 | 11.71 | 1.01 | 315 | 3156 | 2934 | -7 | 3780 | 2747 | 1017 | 467 |  | 0.227 | 0.104 | 0.190 | 0.120 |  |
| 2025-12-11 | 11.28 | 0.98 | 315 | 4029 | 3706 | -8 | 4836 | 3504 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2025-12-12 | 11.73 | 1.02 | 315 | 3121 | 2923 | -6 | 3686 | 2845 | 4032 | 2822 |  | 0.910 | 0.637 | 0.770 | 0.699 |  |
| 2025-12-13 | 5.12 | 0.44 | 315 | 461 | 440 | -4 | 537 | 495 | 262 | 161 |  | 0.401 | 0.246 | 0.344 | 0.229 | descartado |
| 2025-12-14 | 11.20 | 0.97 | 315 | 1586 | 1495 | -6 | 1822 | 1552 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2025-12-15 | 10.94 | 0.95 | 315 | 1237 | 1156 | -7 | 1404 | 1304 | 1115 | 926 |  | 0.635 | 0.527 | 0.559 | 0.500 |  |
| 2025-12-16 | 11.73 | 1.02 | 315 | 2513 | 2354 | -6 | 2882 | 2334 | 4352 | 2956 |  | 1.220 | 0.829 | 1.063 | 0.892 |  |
| 2025-12-17 | 11.74 | 1.02 | 315 | 2619 | 2452 | -6 | 3083 | 2222 | 4656 | 2594 |  | 1.252 | 0.697 | 1.063 | 0.822 |  |
| 2025-12-18 | 11.29 | 0.98 | 315 | 3292 | 3083 | -6 | 3923 | 2833 | 6469 | 3367 |  | 1.384 | 0.720 | 1.161 | 0.837 | descartado |
| 2025-12-19 | 11.82 | 1.03 | 315 | 3321 | 3118 | -6 | 3892 | 2912 | 5406 | 3543 |  | 1.146 | 0.751 | 0.978 | 0.857 |  |
| 2025-12-20 | 11.92 | 1.03 | 315 | 3914 | 3662 | -6 | 4682 | 3348 | 7048 | 4625 |  | 1.268 | 0.832 | 1.060 | 0.973 |  |
| 2025-12-21 | 11.90 | 1.03 | 315 | 4197 | 3930 | -6 | 5070 | 3377 | 7567 | 4586 |  | 1.270 | 0.769 | 1.051 | 0.956 |  |
| 2025-12-22 | 11.91 | 1.03 | 315 | 4952 | 4636 | -6 | 5996 | 4018 | 8763 | 5814 |  | 1.246 | 0.827 | 1.029 | 1.019 |  |
| 2025-12-23 | 11.43 | 0.99 | 315 | 3500 | 3160 | -10 | 4100 | 3170 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2025-12-24 | 11.85 | 1.03 | 315 | 3604 | 3382 | -6 | 4374 | 3182 | 5994 | 3328 |  | 1.171 | 0.650 | 0.965 | 0.737 |  |
| 2025-12-25 | 11.85 | 1.03 | 315 | 4238 | 3970 | -6 | 4983 | 3834 | 6968 | 5874 |  | 1.158 | 0.976 | 0.985 | 1.079 |  |
| 2025-12-26 | 11.92 | 1.03 | 315 | 4082 | 3819 | -6 | 4784 | 3408 | 6845 | 4623 |  | 1.181 | 0.798 | 1.008 | 0.955 |  |
| 2025-12-27 | 11.82 | 1.02 | 315 | 2117 | 1966 | -7 | 2444 | 2132 | 4161 | 2758 |  | 1.384 | 0.917 | 1.199 | 0.911 |  |
| 2025-12-28 | 11.92 | 1.03 | 315 | 3766 | 3527 | -6 | 4480 | 2948 | 6597 | 3863 |  | 1.234 | 0.722 | 1.037 | 0.923 |  |
| 2025-12-29 | 11.92 | 1.03 | 315 | 3865 | 3613 | -7 | 4446 | 3816 | 6573 | 5390 |  | 1.198 | 0.982 | 1.041 | 0.995 |  |
| 2025-12-30 | 11.22 | 0.97 | 315 | 2520 | 2360 | -6 | 2979 | 2320 | 5136 | 2440 |  | 1.435 | 0.682 | 1.214 | 0.741 | descartado |
| 2025-12-31 | 11.47 | 0.99 | 315 | 2399 | 2244 | -6 | 2751 | 2263 | 4052 | 3169 |  | 1.190 | 0.930 | 1.037 | 0.986 |  |
| 2026-01-01 | 10.28 | 0.89 | 315 | 1610 | 1510 | -6 | 1805 | 1612 | 2438 | 1630 |  | 1.067 | 0.713 | 0.951 | 0.712 | descartado |
| 2026-01-02 | 11.55 | 1.00 | 315 | 951 | 904 | -5 | 1192 | 1123 | 1042 | 636 |  | 0.772 | 0.471 | 0.616 | 0.399 |  |
| 2026-01-03 | 10.45 | 0.91 | 315 | 1319 | 1238 | -6 | 1517 | 1454 | 2230 | 1431 |  | 1.190 | 0.764 | 1.035 | 0.693 | descartado |
| 2026-01-04 | 10.63 | 0.92 | 315 | 2749 | 2584 | -6 | 3147 | 2663 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | descartado |
| 2026-01-05 | 11.21 | 0.97 | 315 | 1107 | 1036 | -6 | 1268 | 1178 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2026-01-06 | 11.46 | 0.99 | 315 | 2070 | 1956 | -6 | 2386 | 1981 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2026-01-07 | 11.57 | 1.00 | 315 | 3364 | 3162 | -6 | 4126 | 2790 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2026-01-08 | 11.73 | 1.01 | 315 | 3326 | 3125 | -6 | 3894 | 3089 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2026-01-09 | 11.40 | 0.99 | 315 | 4845 | 4529 | -7 | 5748 | 4134 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2026-01-10 | 11.06 | 0.96 | 315 | 3830 | 3601 | -6 | 4507 | 3554 | 4488 | 3702 |  | 0.825 | 0.681 | 0.701 | 0.733 | descartado |
| 2026-01-11 | 12.00 | 1.04 | 315 | 4969 | 4650 | -6 | 5970 | 3978 | 8712 | 5477 |  | 1.235 | 0.776 | 1.028 | 0.970 |  |
| 2026-01-12 | 11.82 | 1.02 | 315 | 3967 | 3705 | -7 | 4683 | 3591 | 7020 | 4791 |  | 1.246 | 0.851 | 1.056 | 0.940 |  |
| 2026-01-13 | 11.91 | 1.03 | 315 | 3715 | 3470 | -7 | 4398 | 3146 | 6356 | 4240 |  | 1.205 | 0.804 | 1.018 | 0.949 |  |
| 2026-01-14 | 11.61 | 1.00 | 315 | 3746 | 3496 | -7 | 4371 | 3191 | 5580 | 3685 |  | 1.049 | 0.693 | 0.899 | 0.813 |  |
| 2026-01-15 | 11.83 | 1.02 | 315 | 3113 | 2911 | -7 | 3620 | 2806 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2026-01-16 | 11.46 | 0.99 | 315 | 1568 | 1474 | -6 | 1799 | 1506 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2026-01-17 | 12.02 | 1.04 | 315 | 1955 | 1825 | -7 | 2202 | 1970 | 3190 | 2298 |  | 1.149 | 0.828 | 1.020 | 0.821 |  |
| 2026-01-18 | 11.73 | 1.01 | 315 | 2841 | 2675 | -6 | 3346 | 2289 | 4112 | 2425 |  | 1.019 | 0.601 | 0.865 | 0.746 |  |
| 2026-01-19 | 11.12 | 0.96 | 315 | 3161 | 2958 | -6 | 3617 | 2858 | 4932 | 4012 |  | 1.099 | 0.894 | 0.960 | 0.989 | descartado |
| 2026-01-20 | 12.01 | 1.03 | 315 | 2822 | 2638 | -7 | 3231 | 2724 | 4751 | 3373 |  | 1.186 | 0.842 | 1.036 | 0.872 |  |
| 2026-01-21 | 11.91 | 1.02 | 315 | 2637 | 2485 | -6 | 3080 | 2439 | 4115 | 2615 |  | 1.099 | 0.698 | 0.941 | 0.755 |  |
| 2026-01-22 | 12.02 | 1.03 | 315 | 3392 | 3187 | -6 | 3951 | 3237 | 4843 | 3282 |  | 1.005 | 0.681 | 0.863 | 0.714 |  |
| 2026-01-23 | 12.08 | 1.04 | 315 | 3058 | 2890 | -5 | 3623 | 2544 | 3997 | 2329 |  | 0.920 | 0.536 | 0.777 | 0.645 |  |
| 2026-01-24 | 11.65 | 1.00 | 315 | 4817 | 4509 | -6 | 5777 | 3763 | 7666 | 4879 |  | 1.121 | 0.713 | 0.934 | 0.913 |  |
| 2026-01-25 | 11.82 | 1.01 | 315 | 4406 | 4126 | -6 | 5234 | 3854 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2026-01-26 | 12.08 | 1.04 | 315 | 4997 | 4683 | -6 | 5949 | 4303 | 8706 | 5745 |  | 1.227 | 0.810 | 1.031 | 0.940 |  |
| 2026-01-27 | 11.91 | 1.02 | 315 | 2656 | 2494 | -6 | 3047 | 2800 | 3745 | 3532 |  | 0.993 | 0.936 | 0.866 | 0.888 |  |
| 2026-01-28 | 11.05 | 0.95 | 315 | 5105 | 4780 | -6 | 6194 | 4128 | 8636 | 4854 |  | 1.191 | 0.670 | 0.982 | 0.828 | descartado |
| 2026-01-29 | 11.85 | 1.01 | 315 | 1895 | 1768 | -7 | 2168 | 1845 | 3251 | 2092 |  | 1.208 | 0.778 | 1.056 | 0.798 |  |
| 2026-01-30 | 11.85 | 1.01 | 315 | 1739 | 1627 | -6 | 1959 | 1857 | 2942 | 2635 |  | 1.191 | 1.067 | 1.058 | 0.999 |  |
| 2026-01-31 | 11.85 | 1.01 | 315 | 1241 | 1160 | -6 | 1418 | 1318 | 2272 | 1502 |  | 1.289 | 0.852 | 1.128 | 0.802 |  |
| 2026-02-01 | 11.72 | 1.00 | 315 | 1294 | 1226 | -5 | 1475 | 1358 | 1764 | 1164 |  | 0.960 | 0.633 | 0.842 | 0.603 |  |
| 2026-02-02 | 11.44 | 0.98 | 315 | 1283 | 1227 | -4 | 1474 | 1391 | 81 | 47 |  | 0.045 | 0.026 | 0.039 | 0.024 | inversor caido |
| 2026-02-03 | 11.05 | 0.94 | 315 | 2227 | 2099 | -6 | 2557 | 2304 | 2539 | 1898 |  | 0.803 | 0.600 | 0.699 | 0.580 | descartado |
| 2026-02-04 | 11.10 | 0.95 | 315 | 487 | 443 | -9 | 562 | 524 | 61 | 34 |  | 0.088 | 0.050 | 0.077 | 0.046 | inversor caido |
| 2026-02-05 | 11.82 | 1.01 | 315 | 1954 | 1838 | -6 | 2192 | 2132 | 2629 | 2979 |  | 0.947 | 1.073 | 0.845 | 0.984 |  |
| 2026-02-06 | 11.82 | 1.01 | 315 | 1561 | 1475 | -5 | 1777 | 1626 | 2174 | 1404 |  | 0.981 | 0.634 | 0.862 | 0.608 |  |
| 2026-02-07 | 11.99 | 1.02 | 315 | 2039 | 1924 | -6 | 2320 | 2016 | 2941 | 2042 |  | 1.016 | 0.705 | 0.893 | 0.713 |  |
| 2026-02-08 | 11.73 | 1.00 | 315 | 1262 | 1193 | -5 | 1482 | 1384 | 1717 | 1199 |  | 0.958 | 0.669 | 0.816 | 0.610 |  |
| 2026-02-09 | 11.74 | 1.00 | 315 | 716 | 670 | -6 | 839 | 786 | 1370 | 874 |  | 1.348 | 0.860 | 1.150 | 0.783 |  |
| 2026-02-10 | 11.83 | 1.00 | 315 | 1232 | 1154 | -6 | 1390 | 1301 | 2100 | 1646 |  | 1.200 | 0.941 | 1.064 | 0.891 |  |
| 2026-02-11 | 11.20 | 0.95 | 315 | 1798 | 1685 | -6 | 1998 | 1887 | 2122 | 1998 |  | 0.831 | 0.783 | 0.748 | 0.745 |  |
| 2026-02-12 | 12.00 | 1.02 | 315 | 3582 | 3349 | -7 | 4183 | 2990 | 5740 | 3553 |  | 1.128 | 0.698 | 0.966 | 0.837 |  |
| 2026-02-13 | 12.12 | 1.03 | 315 | 3642 | 3406 | -6 | 4357 | 2757 | 6470 | 3273 |  | 1.251 | 0.633 | 1.046 | 0.836 |  |
| 2026-02-14 | 11.52 | 0.98 | 315 | 2104 | 1906 | -9 | 2352 | 2000 | 2244 | 2000 |  | 0.751 | 0.669 | 0.672 | 0.704 |  |
| 2026-02-15 | 11.75 | 1.00 | 315 | 1602 | 1500 | -6 | 1821 | 1573 | 2638 | 1752 |  | 1.160 | 0.770 | 1.020 | 0.784 |  |
| 2026-02-16 | 11.93 | 1.01 | 315 | 4427 | 4151 | -6 | 5016 | 3633 | 6102 | 4404 |  | 0.971 | 0.700 | 0.857 | 0.854 |  |
| 2026-02-17 | 12.10 | 1.02 | 315 | 4889 | 4568 | -7 | 5611 | 3744 | 6805 | 4922 |  | 0.980 | 0.709 | 0.854 | 0.926 |  |
| 2026-02-18 | 12.18 | 1.03 | 315 | 3255 | 3061 | -6 | 3773 | 2878 | 4989 | 3142 |  | 1.080 | 0.680 | 0.931 | 0.769 |  |
| 2026-02-19 | 12.00 | 1.01 | 315 | 3831 | 3534 | -8 | 4292 | 3372 | 5718 | 4347 |  | 1.051 | 0.799 | 0.938 | 0.908 |  |
| 2026-02-20 | 11.99 | 1.01 | 315 | 3225 | 3020 | -6 | 3668 | 2712 | 4984 | 3140 |  | 1.088 | 0.686 | 0.957 | 0.815 |  |
| 2026-02-21 | 11.61 | 0.98 | 315 | 3717 | 3355 | -10 | 4220 | 3053 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2026-02-22 | 11.44 | 0.96 | 315 | 3834 | 3495 | -9 | 4292 | 3218 | 0 | 0 |  | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2026-02-23 | 12.10 | 1.02 | 315 | 2204 | 2060 | -7 | 2560 | 2119 | 3933 | 2409 |  | 1.257 | 0.770 | 1.082 | 0.800 |  |
| 2026-02-24 | 11.37 | 0.96 | 315 | 561 | 521 | -7 | 648 | 664 | 680 | 452 |  | 0.853 | 0.567 | 0.739 | 0.480 | descartado |
| 2026-02-25 | 12.01 | 1.01 | 315 | 990 | 940 | -5 | 1154 | 1084 | 1105 | 755 |  | 0.786 | 0.537 | 0.674 | 0.490 |  |
| 2026-02-26 | 12.11 | 1.02 | 315 | 2019 | 1899 | -6 | 2255 | 2113 | 2214 | 2373 |  | 0.772 | 0.828 | 0.691 | 0.791 |  |
| 2026-02-27 | 11.97 | 1.00 | 315 | 3837 | 3581 | -7 | 4212 | 3443 | 311 | 233 |  | 0.057 | 0.043 | 0.052 | 0.048 | inversor caido |
| 2026-02-28 | 12.17 | 1.02 | 315 | 4153 | 3884 | -6 | 4741 | 3420 | 6142 | 4117 |  | 1.041 | 0.698 | 0.912 | 0.848 |  |
| 2026-03-01 | 12.08 | 1.01 | 315 | 2680 | 2519 | -6 | 2980 | 2429 | 3197 | 2496 |  | 0.840 | 0.656 | 0.755 | 0.723 |  |
| 2026-03-02 | 12.28 | 1.03 | 315 | 3302 | 3106 | -6 | 3680 | 2934 | 4320 | 3386 |  | 0.921 | 0.722 | 0.827 | 0.813 |  |
| 2026-03-03 | 12.00 | 1.00 | 315 | 4285 | 4004 | -7 | 4889 | 3289 | 5826 | 3696 |  | 0.958 | 0.607 | 0.839 | 0.791 |  |
| 2026-03-04 | 12.17 | 1.02 | 315 | 4450 | 4179 | -6 | 5088 | 3074 | 5809 | 3128 |  | 0.919 | 0.495 | 0.804 | 0.717 |  |
| 2026-03-09 | 4.97 | 0.41 | 315 | 1614 | 1447 | -10 | 1864 | 1320 | 2679 | 4695 |  | 1.169 | 2.049 | 1.012 | 2.504 | descartado |
| 2026-03-10 | 12.93 | 1.08 | 300 | 5776 | 5708 | -1 | 6668 | 3748 | 6327 | 3468 | 6.30 | 0.771 | 0.423 | 0.668 | 0.652 | descartado |
| 2026-03-11 | 12.91 | 1.07 | 300 | 4854 | 4806 | -1 | 5648 | 3619 | 7074 | 3864 | 7.00 | 1.026 | 0.561 | 0.882 | 0.752 | descartado |
| 2026-03-12 | 12.42 | 1.03 | 300 | 5414 | 5337 | -1 | 5952 | 3703 | 7340 | 4564 | 7.90 | 0.955 | 0.594 | 0.868 | 0.868 |  |
| 2026-03-13 | 12.92 | 1.07 | 300 | 5018 | 5018 | +0 | 5504 | 3985 | 6951 | 4883 | 6.90 | 0.976 | 0.685 | 0.889 | 0.863 |  |
| 2026-03-14 | 12.92 | 1.07 | 300 | 5771 | 5771 | +0 | 6419 | 3824 | 7809 | 4332 | 7.80 | 0.953 | 0.529 | 0.857 | 0.798 |  |
| 2026-03-15 | 12.92 | 1.07 | 300 | 3645 | 3645 | +0 | 3965 | 3046 | 4925 | 3389 | 4.90 | 0.951 | 0.655 | 0.875 | 0.783 |  |
| 2026-03-16 | 12.96 | 1.07 | 300 | 4501 | 4472 | -1 | 4944 | 3571 | 5542 | 3540 | 5.50 | 0.867 | 0.554 | 0.789 | 0.698 |  |
| 2026-03-17 | 12.92 | 1.07 | 300 | 5988 | 5988 | +0 | 6551 | 4098 | 7384 | 3892 | 7.30 | 0.868 | 0.458 | 0.794 | 0.669 |  |
| 2026-03-18 | 12.92 | 1.07 | 300 | 5245 | 5245 | +0 | 5712 | 4035 | 395 | 678 | 0.30 | 0.053 | 0.091 | 0.049 | 0.118 | inversor caido |
| 2026-03-19 | 12.92 | 1.07 | 300 | 4635 | 4635 | +0 | 4901 | 3218 | 5595 | 4081 | 5.50 | 0.850 | 0.620 | 0.804 | 0.893 |  |
| 2026-03-20 | 12.93 | 1.07 | 300 | 4794 | 4792 | -0 | 5201 | 3545 | 197 | 170 | 0.20 | 0.029 | 0.025 | 0.027 | 0.034 | inversor caido |
| 2026-03-21 | 10.58 | 0.87 | 300 | 4319 | 3384 | -22 | 4770 | 3009 | 6592 | 4300 | 6.60 | 1.075 | 0.701 | 0.973 | 1.006 | descartado |
| 2026-03-22 | 12.83 | 1.06 | 300 | 4229 | 4098 | -3 | 4685 | 3293 | 4206 | 2997 | 4.20 | 0.700 | 0.499 | 0.632 | 0.641 |  |
| 2026-03-23 | 12.25 | 1.01 | 300 | 5872 | 5409 | -8 | 6682 | 4652 | 6390 | 5263 | 6.30 | 0.766 | 0.631 | 0.674 | 0.797 | descartado |
| 2026-03-24 | 12.75 | 1.05 | 300 | 5668 | 5316 | -6 | 6229 | 4268 | 6424 | 4794 | 6.40 | 0.798 | 0.596 | 0.726 | 0.791 |  |
| 2026-03-25 | 12.92 | 1.06 | 300 | 5326 | 5326 | +0 | 5906 | 3893 | 7239 | 4922 | 7.20 | 0.957 | 0.651 | 0.863 | 0.890 |  |
| 2026-03-26 | 12.92 | 1.06 | 300 | 5587 | 5202 | -7 | 6256 | 4543 | 5562 | 4001 | 5.50 | 0.701 | 0.504 | 0.626 | 0.620 |  |
| 2026-03-27 | 12.34 | 1.01 | 300 | 2654 | 2609 | -2 | 2937 | 2487 | 46 | 35 | 0.00 | 0.012 | 0.009 | 0.011 | 0.010 | inversor caido |
| 2026-03-28 | 12.90 | 1.06 | 300 | 4508 | 4503 | -0 | 4928 | 2899 | 29 | 20 | 0.00 | 0.004 | 0.003 | 0.004 | 0.005 | inversor caido |
| 2026-03-29 | 12.92 | 1.06 | 300 | 5554 | 5519 | -1 | 5883 | 3566 | 0 | 0 | 0.00 | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2026-03-30 | 12.92 | 1.06 | 300 | 5378 | 5378 | +0 | 5798 | 3831 | 6650 | 4615 | 6.60 | 0.871 | 0.604 | 0.808 | 0.848 |  |
| 2026-03-31 | 12.94 | 1.06 | 300 | 4239 | 4227 | -0 | 4574 | 3357 | 1510 | 1023 | 1.50 | 0.251 | 0.170 | 0.232 | 0.215 |  |
| 2026-04-01 | 12.92 | 1.06 | 300 | 2347 | 2347 | +0 | 2561 | 2051 | 2841 | 2040 | 2.80 | 0.852 | 0.612 | 0.781 | 0.701 |  |
| 2026-04-02 | 12.92 | 1.06 | 300 | 3019 | 3019 | +0 | 3290 | 2769 | 4120 | 3152 | 4.10 | 0.961 | 0.735 | 0.882 | 0.801 |  |
| 2026-04-03 | 12.92 | 1.05 | 300 | 3764 | 3764 | +0 | 4092 | 3326 | 4975 | 4057 | 4.90 | 0.931 | 0.759 | 0.856 | 0.859 |  |
| 2026-04-04 | 12.92 | 1.05 | 300 | 4970 | 4967 | -0 | 5392 | 3345 | 1111 | 836 | 1.10 | 0.157 | 0.118 | 0.145 | 0.176 | inversor caido |
| 2026-04-05 | 12.92 | 1.05 | 300 | 4717 | 4717 | +0 | 5201 | 3915 | 0 | 0 | 0.00 | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2026-04-06 | 12.91 | 1.05 | 300 | 3125 | 3091 | -1 | 3507 | 2981 | 2219 | 1662 | 2.20 | 0.500 | 0.375 | 0.446 | 0.393 |  |
| 2026-04-07 | 12.92 | 1.05 | 300 | 2275 | 2275 | +0 | 2549 | 2123 | 880 | 639 | 0.80 | 0.272 | 0.198 | 0.243 | 0.212 |  |
| 2026-04-08 | 12.92 | 1.05 | 300 | 3047 | 3047 | +0 | 3342 | 2953 | 1711 | 1659 | 1.70 | 0.396 | 0.383 | 0.361 | 0.396 |  |
| 2026-04-09 | 12.94 | 1.05 | 300 | 3803 | 3795 | -0 | 4084 | 3435 | 4859 | 4148 | 4.80 | 0.900 | 0.768 | 0.838 | 0.850 |  |
| 2026-04-10 | 12.92 | 1.05 | 300 | 3693 | 3693 | +0 | 4050 | 3024 | 5218 | 3499 | 5.20 | 0.995 | 0.667 | 0.907 | 0.815 |  |
| 2026-04-11 | 12.92 | 1.05 | 300 | 2956 | 2956 | +0 | 3211 | 2612 | 3883 | 2959 | 3.80 | 0.925 | 0.705 | 0.851 | 0.798 |  |
| 2026-04-12 | 12.92 | 1.05 | 300 | 2950 | 2950 | +0 | 3182 | 2529 | 3920 | 2926 | 3.90 | 0.936 | 0.698 | 0.867 | 0.815 |  |
| 2026-04-13 | 2.25 | 0.18 | 300 | 170 | 170 | +0 | 207 | 241 | 334 | 382 | 0.30 | 1.387 | 1.586 | 1.137 | 1.116 | descartado |
| 2026-04-15 | 7.73 | 0.62 | 300 | 3617 | 3634 | +0 | 3686 | 2677 | 4102 | 3300 | 4.00 | 0.799 | 0.643 | 0.784 | 0.868 | descartado |
| 2026-04-16 | 12.92 | 1.04 | 300 | 5306 | 5306 | +0 | 5733 | 3630 | 6853 | 4438 | 6.80 | 0.909 | 0.589 | 0.842 | 0.861 |  |
| 2026-04-17 | 12.92 | 1.04 | 300 | 4295 | 4295 | +0 | 4518 | 3531 | 5243 | 4382 | 5.20 | 0.860 | 0.719 | 0.817 | 0.874 |  |
| 2026-04-18 | 12.91 | 1.04 | 300 | 5886 | 5880 | -0 | 6290 | 4323 | 117 | 243 | 0.10 | 0.014 | 0.029 | 0.013 | 0.040 | inversor caido |
| 2026-04-19 | 12.95 | 1.04 | 300 | 6626 | 6595 | -0 | 6983 | 4802 | 0 | 0 | 0.00 | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2026-04-20 | 12.97 | 1.05 | 300 | 6170 | 6139 | -1 | 6554 | 4458 | 5793 | 3762 | 5.70 | 0.661 | 0.429 | 0.622 | 0.594 |  |
| 2026-04-21 | 12.92 | 1.04 | 300 | 6336 | 6336 | +0 | 6517 | 4468 | 7295 | 5282 | 7.20 | 0.811 | 0.587 | 0.788 | 0.833 |  |
| 2026-04-22 | 12.67 | 1.02 | 300 | 2198 | 2141 | -3 | 2432 | 2092 | 2672 | 2006 | 2.60 | 0.856 | 0.643 | 0.774 | 0.675 |  |
| 2026-04-23 | 12.92 | 1.04 | 300 | 4956 | 4956 | +0 | 5170 | 3784 | 5924 | 4490 | 5.90 | 0.842 | 0.638 | 0.807 | 0.836 |  |
| 2026-04-24 | 12.92 | 1.04 | 300 | 4012 | 4012 | +0 | 4336 | 3528 | 5199 | 4038 | 4.80 | 0.913 | 0.709 | 0.844 | 0.806 |  |
| 2026-04-25 | 12.92 | 1.04 | 300 | 4876 | 4876 | +0 | 5297 | 3591 | 6333 | 4424 | 6.30 | 0.915 | 0.639 | 0.842 | 0.868 |  |
| 2026-04-26 | 12.92 | 1.04 | 300 | 5435 | 5435 | +0 | 5796 | 3858 | 6808 | 4944 | 6.80 | 0.882 | 0.641 | 0.827 | 0.902 |  |
| 2026-04-27 | 12.85 | 1.03 | 300 | 5222 | 5176 | -1 | 5429 | 3830 | 6422 | 4871 | 6.40 | 0.866 | 0.657 | 0.833 | 0.896 |  |
| 2026-04-28 | 12.96 | 1.04 | 300 | 4817 | 4808 | -0 | 5218 | 3429 | 6150 | 3775 | 6.10 | 0.899 | 0.552 | 0.830 | 0.775 |  |
| 2026-04-29 | 12.92 | 1.03 | 300 | 5668 | 5668 | +0 | 6000 | 4220 | 7066 | 5333 | 7.00 | 0.878 | 0.663 | 0.829 | 0.890 |  |
| 2026-04-30 | 12.92 | 1.03 | 300 | 5032 | 5032 | +0 | 5354 | 3643 | 6230 | 4426 | 6.20 | 0.872 | 0.619 | 0.819 | 0.856 |  |
| 2026-05-01 | 12.92 | 1.03 | 300 | 1303 | 1303 | +0 | 1457 | 1342 | 1934 | 1482 | 1.90 | 1.045 | 0.801 | 0.935 | 0.778 |  |
| 2026-05-02 | 12.92 | 1.03 | 300 | 3420 | 3408 | -0 | 3712 | 2702 | 4438 | 3071 | 4.40 | 0.914 | 0.632 | 0.842 | 0.800 |  |
| 2026-05-03 | 12.92 | 1.03 | 300 | 3331 | 3331 | +0 | 3543 | 2951 | 4170 | 3282 | 4.10 | 0.882 | 0.694 | 0.829 | 0.783 |  |
| 2026-05-04 | 12.93 | 1.03 | 300 | 4550 | 4550 | +0 | 4891 | 3700 | 5800 | 4521 | 5.80 | 0.898 | 0.700 | 0.835 | 0.861 |  |
| 2026-05-05 | 12.92 | 1.03 | 300 | 2396 | 2354 | -2 | 2519 | 2366 | 0 | 0 | 0.00 | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2026-05-06 | 3.03 | 0.24 | 300 | 298 | 309 | +4 | 326 | 314 | 358 | 354 | 5.90 | 0.848 | 0.837 | 0.775 | 0.794 | descartado |
| 2026-05-07 | 12.17 | 0.97 | 300 | 2362 | 2321 | -2 | 2597 | 2167 | 2984 | 2293 | 3.30 | 0.890 | 0.684 | 0.809 | 0.745 |  |
| 2026-05-08 | 12.92 | 1.03 | 300 | 6209 | 6209 | +0 | 6421 | 4130 | 0 | 0 | 0.00 | 0.000 | 0.000 | 0.000 | 0.000 | inversor caido |
| 2026-05-10 | 12.93 | 1.03 | 300 | 3494 | 3490 | -0 | 3569 | 2961 | 2799 | 2421 | 2.80 | 0.564 | 0.488 | 0.552 | 0.576 |  |
| 2026-05-11 | 12.95 | 1.03 | 300 | 5833 | 5808 | -0 | 6300 | 4318 | 7142 | 5256 | 7.10 | 0.862 | 0.634 | 0.798 | 0.857 |  |
| 2026-05-12 | 12.92 | 1.03 | 300 | 2793 | 2793 | +0 | 3076 | 2539 | 3764 | 2856 | 3.70 | 0.949 | 0.720 | 0.862 | 0.792 |  |
| 2026-05-13 | 12.92 | 1.03 | 300 | 4954 | 4895 | -1 | 5161 | 3281 | 5695 | 3863 | 5.60 | 0.810 | 0.549 | 0.777 | 0.829 |  |
| 2026-05-14 | 12.83 | 1.02 | 300 | 3075 | 3069 | -0 | 3438 | 3063 | 4228 | 3608 | 4.20 | 0.968 | 0.826 | 0.866 | 0.830 |  |
| 2026-05-15 | 12.92 | 1.02 | 300 | 4341 | 4341 | +0 | 4789 | 3872 | 5699 | 4682 | 5.60 | 0.925 | 0.760 | 0.838 | 0.852 |  |
| 2026-05-16 | 12.92 | 1.02 | 300 | 3344 | 3344 | +0 | 3700 | 3235 | 3573 | 2878 | 3.50 | 0.752 | 0.606 | 0.680 | 0.627 |  |
| 2026-05-18 | 12.94 | 1.03 | 300 | 5445 | 5442 | -0 | 5784 | 3852 | 5185 | 3281 | 5.10 | 0.671 | 0.424 | 0.631 | 0.600 |  |
| 2026-05-19 | 12.83 | 1.02 | 300 | 4544 | 4529 | -0 | 4729 | 3524 | 5038 | 4028 | 5.20 | 0.781 | 0.624 | 0.750 | 0.805 |  |
| 2026-05-21 | 12.95 | 1.02 | 300 | 5075 | 5081 | +0 | 5443 | 4012 | 6040 | 4768 | 6.00 | 0.838 | 0.662 | 0.782 | 0.837 |  |
| 2026-05-25 | 12.92 | 1.02 | 300 | 5257 | 5257 | +0 | 5734 | 4126 | 6285 | 4833 | 6.20 | 0.842 | 0.647 | 0.772 | 0.825 |  |
| 2026-05-26 | 12.92 | 1.02 | 300 | 2761 | 2760 | -0 | 3141 | 2819 | 3768 | 3255 | 3.70 | 0.961 | 0.830 | 0.845 | 0.813 |  |
| 2026-05-27 | 13.00 | 1.03 | 300 | 2632 | 2632 | +0 | 2828 | 2492 | 1883 | 1677 | 1.80 | 0.504 | 0.449 | 0.469 | 0.474 |  |
| 2026-05-28 | 8.68 | 0.69 | 300 | 1608 | 1746 | +9 | 1831 | 1641 | 1813 | 1588 | 2.10 | 0.794 | 0.695 | 0.697 | 0.681 | descartado |
| 2026-05-29 | 12.92 | 1.02 | 300 | 2204 | 2204 | -0 | 2498 | 2235 | 2367 | 1884 | 2.30 | 0.756 | 0.602 | 0.667 | 0.594 |  |
| 2026-05-30 | 12.92 | 1.02 | 300 | 4735 | 4735 | +0 | 5314 | 4014 | 5841 | 4873 | 5.80 | 0.869 | 0.725 | 0.774 | 0.855 |  |
| 2026-05-31 | 12.92 | 1.02 | 300 | 3633 | 3633 | +0 | 4033 | 3629 | 3628 | 2985 | 3.60 | 0.703 | 0.579 | 0.633 | 0.579 |  |
| 2026-06-01 | 12.92 | 1.02 | 300 | 3971 | 3967 | -0 | 4329 | 3297 | 2205 | 1596 | 2.20 | 0.391 | 0.283 | 0.359 | 0.341 |  |
