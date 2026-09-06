# Medicion: la energia AC del tablero

Medicion de SOLO LECTURA sobre la Supabase de produccion, ejecutada el 2026-08-31
desde `agente-historico` con `.venv/bin/python` y `historico.db.query`.
Nace de **R7** de `respuestas-lcv-consultas.md` y de la **advertencia B** del mismo
documento. No se creo ninguna vista ni se escribio nada.

Timestamps tratados como hora local de Costa Rica etiquetada `+00`, sin
`AT TIME ZONE`, tal como manda la regla del proyecto.

---

## Base comun de las mediciones 2 a 6

`v_sc_electrico_corregido` **no descarta filas** (ver medicion 1), asi que todas
las mediciones posteriores a la 1 corren sobre la vista corregida MENOS las filas
con firma de contaminacion, con este CTE:

```sql
with sucias as (
  select timestamp from monitoreo_sc_electrico
  where coalesce(potencia_pv1_w,0) > 5000 or coalesce(potencia_pv2_w,0) > 5000
     or coalesce(voltaje_pv1_v,0) > 600  or coalesce(voltaje_pv2_v,0) > 600
     or coalesce(voltaje_pv1_v,0) < 0    or coalesce(voltaje_pv2_v,0) < 0
),
base as (
  select v.* from v_sc_electrico_corregido v
  left join sucias s using (timestamp)
  where s.timestamp is null
)
```

---

## HALLAZGO CERO (no estaba pedido, pero condiciona todo lo demas): las cuatro columnas estan en kWh, no en Wh

Las columnas se llaman `energia_hoy_wh`, `energia_total_wh`, `energia_pv1_wh`,
`energia_pv2_wh`, pero **una unidad de esas columnas vale 1 kWh**. Medido, no supuesto:
se integro `potencia_total_wac` (que si esta en W) dia a dia y se dividio entre el
cierre diario del contador.

```sql
-- (BASE)
, w as (select *, timestamp::date dia,
    least(extract(epoch from (lead(timestamp) over (partition by timestamp::date
                              order by timestamp) - timestamp)), 300) dt
    from base)
, d as (select dia,
    (array_agg(energia_hoy_wh order by timestamp desc)
       filter (where energia_hoy_wh is not null))[1] ac_cierre,
    sum(potencia_total_wac * coalesce(dt,300))/3600.0 int_ac_wh
  from w group by 1)
select count(*) dias,
  percentile_cont(0.25) within group (order by int_ac_wh/nullif(ac_cierre,0)) p25,
  percentile_cont(0.5)  within group (order by int_ac_wh/nullif(ac_cierre,0)) mediana,
  percentile_cont(0.75) within group (order by int_ac_wh/nullif(ac_cierre,0)) p75
from d where ac_cierre > 1 and int_ac_wh > 0;
```

| dias | p25 | mediana | p75 |
|---|---|---|---|
| 127 | 999,04 | **1.003,58** | 1.008,07 |

Mil, con dispersion de menos del 1%. Contraste fisico que lo confirma: el
rendimiento especifico diario implicito (cierre AC / 2,84 kWp) da **mediana 2,32 y
maximo exactamente 5,00 kWh/kWp/dia**, que es el techo fisico de Costa Rica. Leidas
como Wh, esas mismas columnas darian 14 Wh de produccion diaria para 2,84 kWp, es
decir mil veces menos que lo fisicamente posible.

**Consecuencia:** toda cifra de este informe que salga de esas cuatro columnas esta
en kWh. El sufijo `_wh` del nombre es incorrecto y hay que renombrarlo o documentarlo.

---

## Medicion 1 — Contaminacion: cruda contra vista corregida

```sql
select count(*) filas_total,
  count(energia_hoy_wh)  n_hoy,  min(energia_hoy_wh)  min_hoy,  max(energia_hoy_wh)  max_hoy,
  count(energia_total_wh) n_total, min(energia_total_wh) min_total, max(energia_total_wh) max_total
from monitoreo_sc_electrico;      -- y lo mismo contra v_sc_electrico_corregido
```

| Relacion | filas | n_hoy | min_hoy | max_hoy | n_total | min_total | max_total |
|---|---|---|---|---|---|---|---|
| `monitoreo_sc_electrico` (cruda) | 36.469 | 34.335 | 0,0 | 671,1 | 19.890 | 182,3 | **39.328.367,1** |
| `v_sc_electrico_corregido` | 36.469 | 34.335 | 0,0 | 671,1 | 19.890 | 182,3 | **39.328.367,1** |
| Diferencia | **0** | 0 | 0 | 0 | 0 | 0 | **0** |

### La vista corregida NO corrige nada de esto

`pg_get_viewdef` sobre la vista viva confirma lo que dice `sql/schema.sql`: la vista
es un `SELECT` columna a columna con `CASE` de rango, **sin `WHERE`**, y las cuatro
columnas de energia pasan **tal cual, sin ningun `CASE`**:

```
    corriente_aac,
    energia_hoy_wh,
    energia_total_wh,
    energia_pv1_wh,
    energia_pv2_wh,
```

O sea: **no se cae ni una fila** y **el maximo no cambia en absoluto**. La advertencia
B daba por hecho que la vista limpiaba estas columnas y no lo hace. Es un bug de la
vista, no un matiz.

### Donde esta la contaminacion realmente

| Firma en `monitoreo_sc_electrico` | filas |
|---|---|
| `potencia_pv1_w` o `potencia_pv2_w` > 5000 W | 2 |
| `voltaje_pv1_v` o `voltaje_pv2_v` > 600 V | 260 |
| voltaje negativo | 204 |
| **cualquiera de las anteriores** | **466** |
| de esas 466, cuantas traen `energia_total_wh` | **1** |

**El maximo de 39.328.367,1 sale de UNA sola fila**, la de `2025-10-07 07:45`, que es
la misma fila que produce el `max(potencia_pv1_w)` = 26.503.162,8 W citado en el brief:

| timestamp | potencia_pv1_w | potencia_total_wac | temperatura_inversor_c | energia_hoy_wh | energia_total_wh | energia_pv1_wh |
|---|---|---|---|---|---|---|
| 2025-10-07 07:45 | 26.503.162,8 | 118.633,9 | 291,1 | 671,1 | 39.328.367,1 | 203.194,6 |

### Maximos una vez excluida esa fila

```sql
select max(energia_hoy_wh), max(energia_total_wh), max(energia_pv1_wh), max(energia_pv2_wh)
from monitoreo_sc_electrico
where not (coalesce(potencia_pv1_w,0) > 5000 or coalesce(potencia_pv2_w,0) > 5000
        or coalesce(voltaje_pv1_v,0) > 600  or coalesce(voltaje_pv2_v,0) > 600
        or coalesce(voltaje_pv1_v,0) < 0    or coalesce(voltaje_pv2_v,0) < 0);
```

| Columna | max con la fila sucia | max sin ella | factor |
|---|---|---|---|
| `energia_total_wh` | 39.328.367,1 | **2.710,7** | 14.508x |
| `energia_hoy_wh` | 671,1 | **137,25** (y el segundo es 14,2) | 4,9x |
| `energia_pv1_wh` | 203.194,6 | **7,9** | 25.721x |
| `energia_pv2_wh` | 5,3 | 5,3 | 1x |

**Veredicto de la medicion 1:** el maximo corregido **NO es imposible**. 2.710,7 kWh
de vida para 2,84 kWp desde noviembre 2024 hasta junio 2026 (569 dias, 1,56 anos) son
571 kWh/kWp/ano, bajo pero perfectamente fisico para un agrovoltaico con un arreglo
vertical y sombreado. **El descarte del contador en la consulta 3 fue un artefacto de
leer la tabla sucia, exactamente como sospechaba la advertencia B.**

---

## Medicion 2 — Cobertura mensual (filas no nulas)

```sql
select to_char(date_trunc('month', timestamp), 'YYYY-MM') mes,
       count(*) filas, count(distinct timestamp::date) dias,
       count(energia_hoy_wh) n_e_hoy, count(energia_total_wh) n_e_total,
       count(potencia_total_wac) n_p_wac,
       count(energia_pv1_wh) n_e_pv1, count(energia_pv2_wh) n_e_pv2
from v_sc_electrico_corregido group by 1 order by 1;
```

| mes | filas | dias | `energia_hoy_wh` | `energia_total_wh` | `potencia_total_wac` | `energia_pv1_wh` | `energia_pv2_wh` |
|---|---|---|---|---|---|---|---|
| 2024-11 | 174 | 3 | 174 | 174 | 174 | **0** | **0** |
| 2024-12 | 114 | 6 | 69 | 69 | 69 | 69 | 69 |
| 2025-05 | 2.515 | 19 | 2.515 | 2.515 | 2.515 | 2.515 | 2.515 |
| 2025-06 | 2.609 | 18 | 2.609 | 2.609 | 2.609 | 2.609 | 2.609 |
| 2025-09 | 902 | 8 | 902 | 902 | 902 | 902 | 902 |
| 2025-10 | 2.627 | 20 | 2.627 | 2.627 | 2.626 | 2.627 | 2.627 |
| **2025-11** | 3.510 | 28 | **3.154** | **0** | **0** | **0** | **0** |
| **2025-12** | 4.013 | 31 | **3.756** | **0** | **0** | **0** | **0** |
| **2026-01** | 4.124 | 31 | **3.670** | **0** | **0** | **0** | **0** |
| **2026-02** | 3.733 | 28 | **3.343** | **0** | **0** | **0** | **0** |
| 2026-03 | 4.010 | 27 | 3.729 | 3.207 | 3.207 | 3.207 | 3.207 |
| 2026-04 | 4.297 | 29 | 4.140 | 4.140 | 4.140 | 4.140 | 4.140 |
| 2026-05 | 3.686 | 25 | 3.497 | 3.497 | 3.497 | 3.497 | 3.497 |
| 2026-06 | 155 | 1 | 150 | 150 | 150 | 150 | 150 |

### RESPUESTA A LA PREGUNTA CLAVE, Y HAY QUE DECIRLA FUERTE

**NO. `energia_hoy_wh` NO esta vacia de nov-2025 a feb-2026.** Tiene **13.923 lecturas
en 118 dias** justo en el tramo donde `potencia_total_wac`, `energia_total_wh`,
`energia_pv1_wh` y `energia_pv2_wh` estan al 100% en NULL.

**El hueco de cuatro meses del tablero AC desaparece.** El punto 3 de la seccion 2 del
brief (`potencia_total_wac` y `energia_total_wh` son NULL de nov-2025 a feb-2026) es
cierto, pero la conclusion que se saco de el (que no hay dato AC en esos cuatro meses)
es falsa: el dato AC de esos cuatro meses esta en `energia_hoy_wh`, que es exactamente
la primera de las dos columnas que nombra Leo en R7.

Hallazgo secundario: **noviembre 2024 es el espejo del caso.** Tiene AC (174 filas de
`energia_hoy_wh` y `energia_total_wh`) pero cero de `energia_pv1_wh` y `energia_pv2_wh`.
Ahi el hueco es del lado DC.

---

## Medicion 3 — Comportamiento de reset de `energia_hoy_wh`

```sql
-- (BASE)
, s as (select timestamp::date dia, energia_hoy_wh,
          energia_hoy_wh - lag(energia_hoy_wh)
            over (partition by timestamp::date order by timestamp) delta
        from base where energia_hoy_wh is not null)
select count(distinct dia) dias,
       count(*) filter (where delta < 0) saltos_neg_total,
       count(distinct dia) filter (where delta < 0) dias_con_salto_neg,
       min(delta) peor_salto
from s;
```

| dias | saltos negativos totales | dias con al menos uno | peor salto |
|---|---|---|---|
| 270 | 111 | 38 | -0,575 kWh |

| saltos negativos en el dia | dias |
|---|---|
| **0** | **232** |
| 1 | 14 |
| 2 | 13 |
| 3 a 8 | 10 |
| 13 | 1 |

**Si: es monotona creciente dentro del dia y vuelve a ~0 al cambiar de dia.**
232 de 270 dias (86%) no tienen ni un retroceso, y el peor retroceso de toda la serie
es de 0,575 kWh (ruido de reporte del inversor, no un reinicio). La apertura diaria
tiene mediana 0,0 y maximo 8,6 (ese maximo son dias cuyo primer registro ya es de
media manana). El cierre coincide con el maximo del dia en 252 de 270 dias.

### Distribucion del valor de cierre diario (en kWh, ver Hallazgo Cero)

```sql
-- (BASE)
, c as (select timestamp::date dia,
    (array_agg(energia_hoy_wh order by timestamp asc))[1]  apertura,
    (array_agg(energia_hoy_wh order by timestamp desc))[1] cierre,
    max(energia_hoy_wh) maximo
  from base where energia_hoy_wh is not null group by 1)
select count(*) dias, min(cierre), percentile_cont(0.25) within group (order by cierre),
  percentile_cont(0.5) within group (order by cierre),
  percentile_cont(0.75) within group (order by cierre),
  max(cierre), avg(cierre), sum(cierre) from c;
```

| dias | min | p25 | mediana | p75 | max | media | suma |
|---|---|---|---|---|---|---|---|
| 270 | 0,00 | 2,475 | **6,65** | 9,20 | 137,25 | 6,584 | **1.777,68** |

**El maximo de 137,25 es un artefacto aislado, no un dia record.** Cae el 2026-03-09
a las 17:55, en la ultima fila del dia; ese dia venia acumulando normal hasta 3,586 a
las 10:45, luego `energia_hoy_wh` se va a NULL durante siete horas y reaparece en
137,25 en el ultimo registro. Es una fila mezclada mas, con la misma huella que la del
2025-10-07 (en ese mismo dia PV1 y PV2 se intercambian de magnitud a las 11:10). El
segundo cierre mas alto de toda la serie es **14,2 kWh**, que para 2,84 kWp es
exactamente 5,00 kWh/kWp/dia. **Recomendacion: excluir 2026-03-09 o su ultimo registro.**

Sin ese dia: 269 dias, suma **1.640,43 kWh**, y el maximo pasa a 14,2.

---

## Medicion 4 — Comportamiento de reset de `energia_total_wh`

```sql
-- (BASE)
, s as (select timestamp, energia_total_wh,
          lag(energia_total_wh) over (order by timestamp) prev
        from base where energia_total_wh is not null)
select count(*) n_lecturas,
  count(*) filter (where energia_total_wh - prev < -1e-6)  saltos_neg_crudos,
  count(*) filter (where energia_total_wh - prev < -0.001) saltos_neg_reales,
  count(*) filter (where energia_total_wh - prev < -1.0)   reinicios_grandes,
  min(energia_total_wh - prev) peor_caida,
  sum(greatest(energia_total_wh - prev, 0)) suma_incrementos_positivos
from s;
```

| lecturas | saltos negativos "crudos" | con tolerancia 0,001 | reinicios > 1 kWh | peor caida | suma de incrementos positivos |
|---|---|---|---|---|---|
| 19.889 | 37 | **0** | **0** | -5,46e-12 | **2.528,40** |

**`energia_total_wh` NO se reinicia ni una sola vez en toda la serie.** Los 37 "saltos
negativos" que aparecen sin tolerancia son todos del orden de -4,5e-13 kWh: ruido de
punto flotante del `double precision`, no reinicios. Ninguna caida supera 1e-11.

Es un acumulador de vida estrictamente monotono: **182,3 kWh** el 2024-11-10 y
**2.710,7 kWh** el 2026-06-01, con el maximo en la ultima fila de la serie.

| mes | primer valor | ultimo valor |
|---|---|---|
| 2024-11 | 182,3 | 201,4 |
| 2024-12 | 218,3 | 225,2 |
| 2025-05 | 581,6 | 735,1 |
| 2025-06 | 777,8 | 909,4 |
| 2025-09 | 1.138,5 | 1.245,9 |
| 2025-10 | 1.245,9 | 1.395,7 |
| *(nov-2025 a feb-2026: sin dato)* | | |
| 2026-03 | 2.148,7 | 2.313,4 |
| 2026-04 | 2.313,4 | 2.508,2 |
| 2026-05 | 2.508,2 | 2.707,1 |
| 2026-06 | 2.707,1 | 2.710,7 |

**Advertencia de metodo:** reconstruir "sumando incrementos positivos y tratando cada
salto negativo como reinicio" **sin tolerancia** da **89.661,5**, un numero absurdo,
porque el algoritmo lee 37 veces el ruido de 1e-13 como un reinicio y vuelve a sumar
el valor entero del contador. Con tolerancia de 0,001 el resultado correcto es
simplemente el ultimo menos el primero.

### Energia AC total reconstruida y comparaciones

| Concepto | Valor | Cobertura |
|---|---|---|
| **AC reconstruido de `energia_total_wh`** (2.710,7 - 182,3) | **2.528,40 kWh** | 569 dias de calendario, 2024-11-10 a 2026-06-01 |
| Suma de deltas intradia de `energia_total_wh` | 905,55 kWh | solo los 147 dias con dato de esa columna |
| **Suma de cierres diarios de `energia_hoy_wh`** | **1.777,68 kWh** (1.640,43 sin 2026-03-09) | 270 dias con dato |
| Integracion DC (5/60 sobre potencia PV1+PV2) | **1.522,78 kWh** | 274 dias con dato |

Los tres numeros miden ventanas distintas y por eso no se pueden restar entre si:

- Los **2.528,4 kWh** del contador de vida cubren **todo el calendario**, incluidos los
  ~295 dias sin CSV (ene-abr 2025, jul-ago 2025, nov-2025 a feb-2026). La diferencia
  entre 2.528,4 y los 905,55 de deltas intradia es **1.622,85 kWh generados en dias que
  no tenemos registrados**. Este es el unico numero del sistema que ve los huecos.
- Los **1.777,68 kWh** de cierres diarios cubren solo los 270 dias con dato.

### ¿Se cumple lo que predice Leo (AC un poco menor que DC)?

**Depende de contra que se compare, y hay que decir las dos cosas.**

| Comparacion | Razon AC/DC | ¿Cumple R7? |
|---|---|---|
| Contador AC (`energia_hoy_wh`) vs contadores DC (`energia_pv1_wh`+`energia_pv2_wh`), **mediana diaria sobre 129 dias** | **0,958** | **SI, exactamente** |
| Suma de cierres AC (1.640,43, sin el dia malo) vs integracion DC (1.522,78) | 1,128 | **NO, el AC sale 13% MAYOR** |

**Discrepancia, reportada sin ajustar la interpretacion:** la prediccion de Leo se
cumple con precision cuando las dos energias se leen de los contadores del propio
inversor. **No se cumple contra la integracion DC de 1.522,78 kWh**, y la causa medida
es que **la integracion DC subestima**, no que el AC este inflado:

```sql
-- contador DC vs integracion DC, mismos dias
select sum(dc_pv1_cierre+dc_pv2_cierre) contador, sum(int_dc_kwh) integrado from d ...
```

| dias | contador DC | integracion DC | razon |
|---|---|---|---|
| 129 | 970,10 kWh | 831,74 kWh | **0,857** |

La integracion pierde ~14% porque pesa cada fila a 5 minutos aunque el dia tenga
huecos internos de 10, 15 o 20 minutos (visible en 2026-03-09: filas a 10:55, 11:05,
11:10, y despues cada 20 min). Es la advertencia A del propio documento de Leo, en su
version electrica.

---

## Medicion 5 — ¿Que son `energia_pv1_wh` y `energia_pv2_wh`? (critico para el PR diario)

```sql
-- (BASE)
, s as (select timestamp, timestamp::date dia,
    energia_pv1_wh - lag(energia_pv1_wh) over (partition by timestamp::date order by timestamp) d1,
    energia_pv2_wh - lag(energia_pv2_wh) over (partition by timestamp::date order by timestamp) d2
  from base where energia_pv1_wh is not null)
select count(distinct dia) dias, count(*) n,
  count(*) filter (where d1 < -0.001) neg_pv1, count(*) filter (where d2 < -0.001) neg_pv2,
  min(d1), min(d2) from s;
```

| dias | filas | saltos negativos PV1 | saltos negativos PV2 | peor PV1 | peor PV2 |
|---|---|---|---|---|---|
| 144 | 19.715 | **2** | **1** | -0,21 | -0,37 |

```sql
-- apertura y cierre por dia
, c as (select timestamp::date dia,
    (array_agg(energia_pv1_wh order by timestamp asc))[1]  ap1,
    (array_agg(energia_pv1_wh order by timestamp desc))[1] ci1,
    (array_agg(energia_pv2_wh order by timestamp asc))[1]  ap2,
    (array_agg(energia_pv2_wh order by timestamp desc))[1] ci2
  from base where energia_pv1_wh is not null group by 1)
```

| | dias | abre en 0 | max apertura | min cierre | mediana cierre | max cierre | suma cierres |
|---|---|---|---|---|---|---|---|
| `energia_pv1_wh` (Inclinado) | 144 | **134** | 5,57 | 0,0 | **4,20** | 7,90 | 572,70 |
| `energia_pv2_wh` (Vertical) | 144 | **134** | 3,40 | 0,0 | **2,95** | 5,30 | 398,10 |

### Patron real, mirado fila por fila (2026-04-29, dia completo)

| hora | `energia_hoy_wh` | `energia_total_wh` | `energia_pv1_wh` | `energia_pv2_wh` | `potencia_total_wac` |
|---|---|---|---|---|---|
| 05:20 | 0,000 | 2.486,300 | 0,00 | 0,00 | 0,0 |
| 05:55 | 0,000 | 2.486,300 | 0,00 | 0,00 | 94,5 |
| 06:05 | 0,015 | 2.486,315 | 0,00 | 0,00 | 685,7 |
| 06:10 | 0,100 | 2.486,400 | 0,00 | 0,06 | 747,5 |
| 06:15 | 0,155 | 2.486,455 | 0,00 | 0,10 | 798,1 |
| 06:20 | 0,210 | 2.486,510 | 0,00 | 0,155 | 849,8 |
| 06:25 | 0,300 | 2.486,600 | 0,06 | 0,20 | 888,9 |
| ... | ... | ... | ... | ... | ... |
| 17:25 (cierre) | 11,800 | 2.498,100 | 7,00 | 5,30 | ~0 |

**Veredicto de la medicion 5: `energia_pv1_wh` y `energia_pv2_wh` son ACUMULADORES
DIARIOS.** Ni de vida ni de intervalo:

- Abren en 0 al amanecer en 134 de 144 dias (los 10 restantes son dias cuyo primer
  registro es de media manana, no dias que arrastren el valor del dia anterior).
- Crecen monotonamente durante el dia: solo 3 retrocesos en 19.715 filas.
- Su cierre diario es del mismo orden que el cierre de `energia_hoy_wh`, no de
  `energia_total_wh`.
- **NO son energia del intervalo.** Si lo fueran, el valor bajaria por la tarde
  siguiendo la potencia, y no baja nunca.

Ademas se ve en la tabla de arriba que `energia_total_wh` = base del dia +
`energia_hoy_wh` fila a fila (2.486,3 + 0,21 = 2.486,51). Confirmado formalmente: en
133 de 147 dias el delta intradia de `energia_total_wh` coincide con el cierre de
`energia_hoy_wh` con error menor a 0,01 kWh; el error medio es 0,206 y el maximo 8,6,
que es el dia malo 2026-03-09.

**Para el agente que calcula el PR diario: tomar el CIERRE del dia de
`energia_pv1_wh` y `energia_pv2_wh` (que es lo que dice R1 de Leo: "se debe tomar el
total acumulado al final de dia"), interpretarlo en kWh, y recordar que solo hay
144 dias con esas columnas, ninguno entre nov-2025 y feb-2026.**

---

## Medicion 6 — Coherencia AC contra DC por dia

```sql
-- (BASE) + d = cierres diarios
select count(*) dias,
  min(ac_cierre/nullif(pv1_cierre+pv2_cierre,0)) mn,
  percentile_cont(0.05) within group (order by ac_cierre/nullif(pv1_cierre+pv2_cierre,0)) p05,
  percentile_cont(0.25) within group (order by ac_cierre/nullif(pv1_cierre+pv2_cierre,0)) p25,
  percentile_cont(0.50) within group (order by ac_cierre/nullif(pv1_cierre+pv2_cierre,0)) mediana,
  percentile_cont(0.75) within group (order by ac_cierre/nullif(pv1_cierre+pv2_cierre,0)) p75,
  percentile_cont(0.95) within group (order by ac_cierre/nullif(pv1_cierre+pv2_cierre,0)) p95,
  max(ac_cierre/nullif(pv1_cierre+pv2_cierre,0)) mx,
  count(*) filter (where ac_cierre/nullif(pv1_cierre+pv2_cierre,0) > 1) dias_mayor_1
from d where pv1_cierre+pv2_cierre > 0.5 and ac_cierre is not null;
```

| dias | min | p05 | p25 | **mediana** | p75 | p95 | max | dias con razon > 1 |
|---|---|---|---|---|---|---|---|---|
| 129 | 0,117 | 0,944 | 0,953 | **0,958** | 0,968 | 1,000 | 1,125 | **3** |

Suma sobre esos 129 dias: **AC 925,23 kWh** contra **DC 970,10 kWh**, razon 0,954.

**La razon da > 1 en solo 3 de 129 dias, y los tres son dias truncados**, no anomalias
fisicas:

| dia | AC | DC | razon | filas del dia |
|---|---|---|---|---|
| 2024-12-23 | 0,7 | 6,0 | 0,117 | **1** |
| 2025-05-20 | 0,9 | 0,8 | 1,125 | 59 |
| 2025-05-06 | 2,4 | 2,4 | 1,000 | 54 |

El p05 = 0,944 y el p95 = 1,000 dicen que el 90% central de los dias cae entre 94% y
100%. **La eficiencia del inversor medida es del 95,8%**, que es un valor de catalogo
perfectamente normal.

**Nada que reportar como "no cierra" en esta medicion: cierra, y cierra bien.**

---

## VEREDICTO

**La energia del tablero sale de `energia_hoy_wh`, y de `energia_total_wh` cuando esta
disponible: son la misma cuenta AC del inversor (`energia_total` = base del dia +
`energia_hoy`), estan en kWh pese al sufijo `_wh` del nombre, y son coherentes con los
contadores DC con una razon AC/DC de mediana 0,958, exactamente el "un poco menor por
las perdidas del inversor" que predijo Leo. El acumulador de vida no se reinicia jamas
(0 reinicios en 19.889 lecturas) y va de 182,3 a 2.710,7 kWh: los 39.328.367 que nos
hicieron descartarlo venian de UNA sola fila contaminada del 2025-10-07 07:45, la
misma que produce los 26 MW de potencia PV1.**

**El hueco de cuatro meses del tablero AC NO existe.** `energia_hoy_wh` tiene 13.923
lecturas en 118 dias entre nov-2025 y feb-2026, justo donde `potencia_total_wac` y
`energia_total_wh` estan al 100% en NULL. El tablero AC se puede llenar para toda la
serie usando `energia_hoy_wh` como fuente primaria y `energia_total_wh` como control.

**Dos cosas hay que arreglar antes de usar esto en produccion:** (1)
`v_sc_electrico_corregido` no filtra ni una fila y deja las cuatro columnas de energia
sin tocar, asi que hoy la vista "corregida" devuelve los mismos 39 MWh que la cruda;
(2) el dia 2026-03-09 tiene un ultimo registro de 137,25 kWh que es otra fila mezclada
y por si solo mete 8% de error en cualquier total anual.
