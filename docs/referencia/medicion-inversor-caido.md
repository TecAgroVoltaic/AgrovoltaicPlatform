# Medicion: deteccion de inversor caido (R3 de Leo Cardinale)

Medicion de SOLO LECTURA sobre la Supabase de produccion, 2026-08-31.
No se escribio nada, no se creo ninguna vista, no se toco codigo.

Nace de **R3** de `respuestas-lcv-consultas.md` (el 0 V de AC es dato valido; hay que
detectar el inversor sin acoplar entre 7am y 5pm) y de la **advertencia C** (la
irradiancia previa al 2025-07-01 es NULL, asi que la variante condicionada por
irradiancia solo se puede evaluar desde julio 2025).

---

## 0. HALLAZGO PREVIO Y BLOQUEANTE: la vista corregida borra la evidencia

`v_sc_electrico_corregido` contiene esto:

```sql
CASE WHEN voltaje_vac  < 100.0 OR voltaje_vac  > 280.0 THEN NULL ELSE voltaje_vac  END,
CASE WHEN frecuencia_hz <  55.0 OR frecuencia_hz >  65.0 THEN NULL ELSE frecuencia_hz END,
CASE WHEN potencia_total_wac < 0 OR potencia_total_wac > 5000 THEN NULL ELSE potencia_total_wac END
```

O sea: la capa "corregida" convierte en NULL exactamente los ceros que Leo acaba de
declarar dato VALIDO y que la prueba nueva tiene que contar. Medido:

| variable | ceros en la tabla cruda | ceros que sobreviven en la vista |
|---|---:|---:|
| `voltaje_vac` | **7.872** | **0** |
| `frecuencia_hz` | **3.760** | **0** |
| `potencia_total_wac` | 4.099 | 4.099 (el 0 cae dentro de 0-5000) |

(Conteos sobre la base descontaminada que se define mas abajo en este mismo apartado.
Sobre la tabla cruda entera son 7.873 y 3.761: la contaminacion no toca este fenomeno.)

Consecuencia operativa, no teorica: **cualquier analisis que lea la vista corregida es
estructuralmente incapaz de ver un inversor caido a mediodia.** Una prueba de
disponibilidad escrita contra la vista devolveria cero hallazgos siempre y aprobaria
por construccion, que es el mismo modo de fallo que ya documenta
`validez_fisica._exigir_dato_sin_corregir` para la validez fisica.

El rango 100-280 esta escrito en **tres** lugares y hay que tocar los tres:

1. `agente-historico/src/historico/config.py:76` (`RANGOS`, lo usa el barrido SQL)
2. `agente-historico/src/historico/analitica/catalogo.py` (`_e("voltaje_vac", ..., minimo=100, maximo=280)`)
3. la vista `v_sc_electrico_corregido` en la base

### Fuente de esta medicion

Las tres variables de la prueba se leen de **`monitoreo_sc_electrico` cruda**, que es
la excepcion legitima a la regla del proyecto (igual que medir la contaminacion). A
cambio hay que descartar a mano las filas del piranometro mezcladas, y se descartan
por su **FIRMA** (magnitudes imposibles para un inversor de 2,84 kWp), nunca por el
rango de la variable que se esta midiendo:

```sql
WITH electrico AS (
    SELECT "timestamp" AS ts,
           voltaje_vac, frecuencia_hz, potencia_total_wac,
           voltaje_pv1_v, voltaje_pv2_v, potencia_pv1_w, potencia_pv2_w
      FROM monitoreo_sc_electrico
     WHERE (
           potencia_pv1_w  > 5000 OR potencia_pv2_w  > 5000
        OR voltaje_pv1_v   > 600  OR voltaje_pv2_v   > 600
        OR corriente_pv1_a > 20   OR corriente_pv2_a > 20
        OR potencia_total_wac > 5000
        OR temperatura_inversor_c > 100
        OR potencia_pv1_w < 0 OR potencia_pv2_w < 0
        OR voltaje_pv1_v  < 0 OR voltaje_pv2_v  < 0
     ) IS NOT TRUE          -- IS NOT TRUE, no NOT(...): con NULLs, NOT(NULL) descarta la fila
)
```

**Descartadas: 490 filas en 46 dias** (2025-10-07 a 2026-03-09), de 36.469 → **35.979
filas utiles en 274 dias**. La fila conocida `2025-10-07 07:45` esta entre ellas
(`potencia_pv1_w` = 26.503.162 W, `temperatura_inversor_c` = 291,1 C).
Criterio disparado sobre todo por `voltaje_pv1_v > 600` (260 filas) y
`voltaje_pv2_v < 0` (204). De esas 490, **una sola** habria sido marcada por la regla
nueva: el efecto de la contaminacion sobre esta medicion es de 1 lectura en 6.330.

> `NOT (...)` con esa firma reduce la base a 18.005 filas / 132 dias por logica
> ternaria. Es un error facil de cometer y silencioso: se pierde la mitad del
> historico sin ningun aviso.

---

## 1. La hipotesis de Leo contra el dato

Leo escribe: *"Debo revisar si la medicion es medida en la red AC externa o en la red
AC que genera el inversor. Si indicas que marca 0V en la noche, quiere decir que
corresponde a la tension AC que genera el inversor"*.

**La CONCLUSION de Leo es correcta. La PREMISA en la que se apoya no se sostiene con
nuestro dato, y hay que decirselo.**

### 1a. Distribucion horaria de `voltaje_vac = 0` (hora local, sin conversion de zona)

```sql
SELECT extract(hour from ts)::int h, count(*) n,
       count(*) FILTER (WHERE voltaje_vac = 0)       v0,
       count(*) FILTER (WHERE frecuencia_hz = 0)     f0,
       count(*) FILTER (WHERE potencia_total_wac = 0) w0
  FROM electrico GROUP BY 1 ORDER BY 1
```

| hora | filas | `vac=0` | % | `hz=0` | `wac=0` |
|---:|---:|---:|---:|---:|---:|
| 5 | 1.485 | 386 | 26,0 % | 249 | 529 |
| 6 | 2.889 | 837 | 29,0 % | 405 | 429 |
| 7 | 2.955 | 782 | 26,5 % | 401 | 405 |
| 8 | 2.971 | 687 | 23,1 % | 372 | 380 |
| 9 | 2.943 | 610 | 20,7 % | 295 | 298 |
| 10 | 2.887 | 656 | 22,7 % | 287 | 289 |
| 11 | 2.882 | 612 | 21,2 % | 253 | 260 |
| **12** | 2.908 | **581** | **20,0 %** | 240 | 240 |
| 13 | 2.916 | 557 | 19,1 % | 232 | 233 |
| 14 | 2.948 | 563 | 19,1 % | 250 | 253 |
| 15 | 3.007 | 626 | 20,8 % | 300 | 301 |
| 16 | 2.898 | 625 | 21,6 % | 285 | 287 |
| 17 | 2.283 | 350 | 15,3 % | 191 | 195 |
| 18 | 5 | 0 | 0 % | 0 | 0 |
| 20 | 2 | 0 | 0 % | 0 | 0 |

**DISCREPANCIA 1: no hay noche que medir.** La tabla electrica tiene **7 filas en todo
el historico** fuera de la franja 05-17 h. El logger solo graba de dia (se alimenta del
propio inversor). La observacion "marca 0 V en la noche" **no puede salir de esta
tabla**: no hay lecturas nocturnas que la respalden.

**DISCREPANCIA 2: el 0 V no se concentra al amanecer ni al atardecer.** Es un ~20 %
plano a TODAS las horas, mediodia incluido: **581 lecturas de 0 V entre las 12 y las
13 h**. Contra la ventana solar real de cada dia:

| tramo | filas | `vac=0` | % |
|---|---:|---:|---:|
| antes del amanecer | 483 | 85 | 17,6 % |
| **entre amanecer y atardecer** | **35.072** | **7.759 (98,5 % de todos los ceros)** | **22,1 %** |
| despues del atardecer | 424 | 28 | 6,6 % |

### 1b. Correlacion con la generacion DC

| estado de `voltaje_vac` | lecturas | DC = 0 W | DC > 50 W | DC > 200 W |
|---|---:|---:|---:|---:|
| `= 0` | 7.872 | **7.872 (100 %)** | **0** | **0** |
| `> 0` | 26.460 | 643 | 23.236 | 19.005 |
| `NULL` | 1.647 | n/d | n/d | n/d |

El acoplamiento es total: **cuando el AC esta en 0, la potencia DC es 0 en el 100 % de
los casos**, y no existe ni una sola lectura con 0 V de AC y mas de 50 W de DC.

### 1c. El caso "inversor caido con sol": existe, pero no se ve en la potencia DC

La potencia DC no sirve para detectarlo, porque es telemetria **del propio inversor**:
si no se acopla, no hay MPPT, no hay corriente y la potencia cae a 0 por definicion.
Lo que si queda es la **tension de string**:

| `voltaje_vac = 0`, ¿que hace el DC? | lecturas | dias |
|---|---:|---:|
| tension de string > 50 V (arreglo energizado, inversor sin acoplar) | **7.639 (97,0 %)** | **99** |
| tension de string = 0 V (todo apagado) | 221 (2,8 %) | n/d |

**Veredicto sobre R3: el dato RESPALDA la conclusion de Leo y CONTRADICE su premisa.**
La medicion es efectivamente de la tension que genera el inversor (el 0 V acompaña
siempre al DC en 0, nunca a generacion real). Pero la razon no es que sea de noche: es
que en 7.639 de 7.872 casos, a plena luz y con el arreglo energizado, **el inversor no
se estaba acoplando**. El fenomeno que Leo queria ir a buscar entre 7am y 5pm es la
mayoria del dato, no la excepcion.

Ojo con la tension de string como sensor de luz: durante los eventos vale
**~175 V constantes en TODAS las bandas de irradiancia** (media 165,8 V con GHI < 50 y
175,7 V con GHI 300-600). Es una lectura de reposo del inversor, no una Voc que siga al
sol. Por eso **no sirve** para condicionar la regla: filtrar por tension DC deja 6.320
de 6.330 lecturas, o sea no filtra nada.

---

## 2. Rendimiento de la regla horaria 07:00-17:00

Regla nueva: `ts::time >= '07:00' AND ts::time < '17:00'` y alguna de las tres en 0.
Regla vieja: `voltaje_vac` fuera de [100, 280] (`fuera_de_rango`, grave).

| | lecturas | dias |
|---|---:|---:|
| **Regla vieja** (rango 100-280, sin hora) | **7.954** | **238** |
| `voltaje_vac = 0` en 07-17 | 6.299 | 93 |
| `frecuencia_hz = 0` en 07-17 | 2.915 | 47 |
| `potencia_total_wac = 0` en 07-17 | 2.946 | 49 |
| **alguna de las tres en 07-17** | **6.330** | **95** |
| las tres a la vez en 07-17 | 2.915 | 47 |

Filas dentro de la ventana 07-17: 29.315 (el 21,6 % queda marcado).

La regla nueva marca **1.624 lecturas menos** (−20 %) pero, sobre todo, **143 dias
menos** (238 → 95, −60 %). La diferencia esta en que la regla vieja se dispara con una
sola lectura de borde y contamina el dia entero; la nueva exige que el apagon caiga en
el nucleo del dia.

`frecuencia_hz` y `potencia_total_wac` marcan la mitad que `voltaje_vac` por una razon
conocida y ajena a la prueba: **son NULL al 100 % de nov-2025 a feb-2026** (la columna
no vino en el CSV). En esos cuatro meses la unica de las tres que puede detectar algo
es `voltaje_vac`.

### Por mes

| mes | filas | vieja | dias | `vac=0` 07-17 | dias | `hz=0` | dias | `wac=0` | dias | alguna | **dias** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2024-11 | 174 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2024-12 | 114 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2025-05 | 2.515 | 344 | 13 | 292 | 4 | 292 | 4 | 294 | 4 | 294 | 4 |
| 2025-06 | 2.609 | 111 | 14 | 54 | 2 | 54 | 2 | 55 | 2 | 55 | 2 |
| 2025-09 | 902 | 239 | 6 | 181 | 3 | 181 | 3 | 182 | 3 | 182 | 3 |
| 2025-10 | 2.626 | 660 | 16 | 502 | 9 | 502 | 9 | 506 | 9 | 506 | 9 |
| 2025-11 | 3.427 | 1.180 | 28 | 992 | 13 | 0 | 0 | 0 | 0 | 992 | 13 |
| 2025-12 | 3.943 | 1.107 | 31 | 905 | 12 | 0 | 0 | 0 | 0 | 905 | 12 |
| 2026-01 | 3.960 | 1.170 | 31 | 956 | 12 | 0 | 0 | 0 | 0 | 956 | 12 |
| 2026-02 | 3.639 | 675 | 28 | 531 | 9 | 0 | 0 | 0 | 0 | 531 | 9 |
| 2026-03 | 3.932 | 837 | 24 | 690 | 9 | 690 | 9 | 696 | 9 | 696 | 9 |
| 2026-04 | 4.297 | 926 | 24 | 713 | 10 | 713 | 10 | 719 | 10 | 719 | 10 |
| 2026-05 | 3.686 | 592 | 22 | 400 | 9 | 400 | 9 | 410 | 11 | 410 | 11 |
| 2026-06 | 155 | 113 | 1 | 83 | 1 | 83 | 1 | 84 | 1 | 84 | 1 |

Los dias flotan entre 0 y 13 por mes sin tendencia clara; nov-2025 a ene-2026 son los
tres peores (13, 12, 12 dias). Ver la nota del §4c sobre ese tramo.

### Forma de los episodios: no son parpadeos, son apagones

De los 95 dias marcados, la fraccion de la ventana 07-17 afectada tiene **mediana del
68,9 %** (p25 23,3 %, p75 100 %):

| fraccion del dia caida | dias |
|---|---:|
| < 5 % | 3 |
| 5-20 % | 16 |
| 20-50 % | 22 |
| 50-90 % | 22 |
| **>= 90 % (apagon de dia entero)** | **32** |

---

## 3. La falsa alarma que Leo anticipa, cuantificada

Emparejamiento irradiancia-inversor **por promedio de ventana de 5 min**, no por
igualdad de timestamp:

```sql
, rad AS (SELECT date_bin('5 minutes', "timestamp", timestamp '2024-01-01 00:00:00') bin,
                 avg(irradiancia_incidente) ghi
            FROM v_sc_radiacion_corregida GROUP BY 1)
...
LEFT JOIN rad r ON r.bin = date_bin('5 minutes', e.ts, timestamp '2024-01-01 00:00:00')
```

**El hallazgo central del proyecto se reconfirma aqui:** emparejar por igualdad exacta
de timestamp encuentra irradiancia para **818 de las 6.330** lecturas marcadas, o sea
**pierde el 87,1 %**. Con `date_bin` de 5 min se emparejan **5.979 (94,5 %)**, con 1,48
muestras de radiacion por ventana en promedio.

### Irradiancia concurrente de las 5.979 lecturas emparejadas

| banda GHI (W/m2) | lecturas | % |
|---|---:|---:|
| 0 | 316 | 5,3 % |
| 0-50 | 546 | 9,1 % |
| 50-100 | 492 | 8,2 % |
| 100-200 | 1.109 | 18,5 % |
| 200-300 | 788 | 13,2 % |
| **>= 300** | **2.728** | **45,6 %** |

GHI medio de las lecturas marcadas: **356,7 W/m2**.

**El ruido que la regla horaria sola genera, por el criterio del propio Leo (< 300
W/m2), es de 3.251 lecturas: el 54,4 % de lo emparejado.** Pero conviene matizarlo:
solo **1.354 lecturas (22,6 %) estan por debajo de 100 W/m2**, que es donde
"desconectado por baja irradiancia" es una explicacion honesta. Las 1.897 de la banda
100-300 W/m2 son zona gris: un arreglo de 2,84 kWp a 200 W/m2 deberia estar generando
del orden de 500 W, muy por encima del arranque del inversor. Llamarlas todas falsa
alarma es concederle demasiado al umbral.

Escala de la serie de irradiancia usada (desde 2025-07-01, `v_sc_radiacion_corregida`):
mediana 194 W/m2, p95 874, media 11-13 h 548, **maximo 5.943 y 191 lecturas por encima
de 1.500 W/m2 (0,3 %)**. La serie sigue **sin calibrar**, asi que el umbral de 300
opera sobre una escala aproximada. No invalida la medicion (el orden de magnitud es
correcto) pero si conviene revisarlo cuando se cierre R2 con Hugo.

---

## 4. La variante condicionada por irradiancia (> 300 W/m2)

| variante | condicion | lecturas | dias |
|---|---|---:|---:|
| **A** horaria | 07-17 | 6.330 | 95 |
| **B** irradiancia sola | GHI >= 300 | 2.747 | 69 |
| **C** horaria + irradiancia | 07-17 y GHI >= 300 | **2.728** | **69** |
| **D** ventana solar | amanecer..atardecer de `ventana_solar` | 8.073 | 224 |
| **F** horaria, y si hay GHI exigir >= 300 | 07-17 y (GHI NULL o >= 300) | 3.079 | 75 |

Desglose de **C** por variable: `voltaje_vac` 2.717 lecturas / 69 dias;
`frecuencia_hz` 1.357 / 33; `potencia_total_wac` 1.368 / 33.

**C elimina 3.602 lecturas (−56,9 %) y 26 dias (−27,4 %) contra A.** La condicion de
hora, una vez aplicada la de irradiancia, casi no aporta (B = 2.747 vs C = 2.728, 19
lecturas de diferencia): con GHI >= 300 W/m2 ya practicamente se esta dentro de 07-17.

### 4a. La advertencia de Leo sobre ampliar la ventana, medida

Leo escribe: *"Podriamos ampliar el rango un poco mas cercano al amanecer y tardecer
pero generaria muchas falsas alarmas."* **Confirmado con numero.** Usar la ventana solar
real de `ventana_solar` en vez de las 07-17 fijas pasa de **95 a 224 dias** marcados
(+136 %) y de 6.330 a 8.073 lecturas. La ventana fija es claramente mejor.

Sensibilidad del umbral de irradiancia (dentro de 07-17):

| umbral | lecturas | dias |
|---:|---:|---:|
| 100 | 4.625 | 85 |
| 200 | 3.516 | 81 |
| 250 | 3.120 | 76 |
| **300** | **2.728** | **69** |
| 400 | 2.101 | 67 |
| 500 | 1.631 | 63 |

El conteo de dias es estable entre 300 y 500 (69 → 63): el umbral de Leo cae en una
meseta, no en una pendiente. Buena señal.

### 4b. Lo que la variante C NO puede evaluar (advertencia C del brief)

- **46 de los 274 dias con dato electrico son anteriores al 2025-07-01** y no tienen
  irradiancia por decision del equipo. Ahi la variante C es ciega.
- De las 6.330 lecturas que marca la regla horaria, **351 (en 8 dias) se quedan sin
  irradiancia**; 349 de esas 351 son pre-julio-2025. El emparejamiento por ventana de
  5 min cubre practicamente todo lo demas.
- **Que les pasa hoy: desaparecen en silencio.** `GHI >= 300` con GHI NULL es NULL, o
  sea falso, o sea la lectura no se marca y nadie se entera. Esto no es aceptable: son
  8 dias, y entre ellos **3 apagones de dia entero**.

Los 3 apagones completos que C pierde:

| fecha | lecturas 07-17 | caidas | % | por que C no lo ve |
|---|---:|---:|---:|---|
| 2025-05-07 | 104 | 104 | 100 % | sin irradiancia (pre-jul-2025) |
| 2025-05-26 | 120 | 108 | 90 % | sin irradiancia (pre-jul-2025) |
| 2026-01-05 | 113 | 113 | 100 % | dia `cubierto`, kt 0,16, GHI max 292 W/m2 |

El de 2026-01-05 merece atencion: el inversor estuvo caido las 113 lecturas del dia
con GHI medio de 99 W/m2 y pico de 292. Es un dia genuinamente encapotado, pero a 292
W/m2 el arreglo deberia haber producido del orden de 700 W. El umbral de 300 lo
descarta por 8 W/m2. **La condicion de irradiancia, aplicada como filtro duro,
enmascara apagones reales.**

### 4c. Nota sobre el tramo nov-2025 a feb-2026

Ese tramo concentra los peores meses de la regla (13, 12, 12 y 9 dias) y coincide con
el regimen anomalo detectado por otra medicion (+27 % de potencia a igual irradiancia,
`voltaje_pv1_v > 250 V` concentrado ahi, `potencia_total_wac` y los acumuladores al
100 % en NULL). **No lo atribuyo a la regla.** Los dias marcados de ese tramo estan
corroborados de forma independiente por generacion DC diaria nula (§5b): 8 dias en
nov, 8 en dic, 8 en ene y 3 en feb aparecen tambien en la lista de "planta parada bajo
sol". El fenomeno del +27 % sigue sin explicacion y no interfiere con esta medicion.

---

## 5. Impacto en el veredicto diario

### 5a. Correccion de partida

El enunciado dice "238 de 274 dias quedan marcados como graves por esta prueba". El
238 es el numero de dias con hallazgo `voltaje_vac / fuera_de_rango`, no el numero de
dias cuyo veredicto es grave. El veredicto real hoy, via `calidad.contexto.dias()`:

- **electrico, 274 dias con datos: 206 grave, 68 aviso, 0 ok**
- global, 569 dias de calendario: 258 grave, 16 aviso, 295 sin datos, **0 ok**

### 5b. Recalculo (simulacion fiel de `contexto.reducir`: material = tipo invalidante o >= 20 % de las lecturas del dia)

| escenario | grave | aviso | **ok** |
|---|---:|---:|---:|
| **HOY** | **206** | 68 | **0** |
| Base saneada: fuera el rango 100-280 de `voltaje_vac` **solamente** | 206 | 68 | **0** |
| Base saneada: fuera el 100-280 (vac) + el 55-65 (hz) + `constante_en_cero` | **181** | 92 | **1** |
| ... + regla **A** (07-17) como **grave** | 198 | 75 | 1 |
| ... + regla **A** como **aviso** | 181 | 92 | 1 |
| ... + regla **C** (07-17 + GHI>=300) como **grave** | 193 | 80 | 1 |
| ... + regla **C** como **aviso** | 181 | 92 | 1 |
| ... + regla **D** (ventana solar) como **grave** | 206 | 68 | **0** |

**Respuesta directa: pasa a verde UN dia (2026-04-09), y solo en el veredicto
electrico.** En el veredicto global sigue en grave, porque ese dia la radiacion esta
en grave. **Ningun dia del historico llega a verde global con ninguna de las dos
variantes.**

Dato que conviene subrayar: **quitar el rango 100-280 de `voltaje_vac` por si solo no
mueve ni un dia** (206 → 206). Los 238 dias que marca la regla vieja ya estaban graves
por otra cosa. El rango 100-280 no era el cuello de botella del veredicto: era ruido
encima de un veredicto que ya estaba saturado.

### 5c. El siguiente motivo dominante (lo que va a bloquear despues)

Sobre la base saneada + regla C como grave (193 dias graves), los motivos materiales:

| variable | tipo | dias |
|---|---|---:|
| `potencia_total_wac` / `frecuencia_hz` / `temperatura_inversor_c` | `valor_nulo` | **129** |
| las mismas tres | `parametro_faltante` | 127 |
| las mismas tres | `columna_ausente` | 125 |
| `temp_inclinado` | `fuera_de_rango` | 105 |
| `temp_inclinado` | `saturado_85` | 104 |
| `temp_inclinado` | `sobre_maximo_fisico` | 104 |
| `temp_inclinado` | `flatline` | 99 |
| `temp_vertical` | `fuera_de_rango` | 57 |

Agrupado por causa fisica:

| causa | dias graves |
|---|---:|
| **(A) La columna AC no vino en el CSV (nov-2025 a feb-2026)** | **129** |
| **(B) DS18B20 muerto (saturado en 85 C)** | **111** |
| (C) inversor sin acoplar (la regla nueva) | 40 |
| union A + B | **145 de 193** |
| solo por C | 16 |
| ninguna de las tres | 32 |

**El siguiente bloqueante es (A), con 129 dias: la ausencia de `potencia_total_wac`,
`frecuencia_hz` y `temperatura_inversor_c` de noviembre 2025 a febrero 2026.** Y trae
un defecto propio: **el mismo hecho se cuenta TRES veces** (`valor_nulo`,
`parametro_faltante`, `columna_ausente`) sobre las mismas 129, 127 y 125 fechas. Un
hecho que se reporta tres veces pesa el triple en cualquier lectura por conteo.
Detras viene (B), el DS18B20 muerto, con 111 dias.

### 5d. Por que NINGUN dia llega a verde, y no es por estas pruebas

`_veredicto` da `ok` solo si el dia no tiene **ni un solo** hallazgo grave o aviso. En
los 80 dias que quedan en aviso, lo que impide el verde es:

| variable | tipo | severidad | en N de 80 dias |
|---|---|---|---:|
| `potencia_pv2_w` | `ruido_excesivo` | aviso | 64 |
| `potencia_pv1_w` | `ruido_excesivo` | aviso | 63 |
| `corriente_pv1_a` | `ruido_excesivo` | aviso | 62 |
| `temperatura_inversor_c` | `fuera_de_rango` | grave | 60 |
| `potencia_total_wac` | `ruido_excesivo` | aviso | 58 |

Por tipo, en esos 80 dias: `ruido_excesivo` 442 hallazgos, `valor_nulo` 162,
`fuera_de_rango` 64, `minuto_faltante` 60. **`ruido_excesivo` dispara sobre casi todas
las variables de casi todos los dias**, asi que mientras siga en severidad `aviso` el
verde es inalcanzable por construccion. Medido: bajandolo a `info`, los dias verdes
pasan de 1 a **15** (grave 173, aviso 86, ok 15). Es un tema aparte, pero es EL tema
si alguien espera ver dias verdes.

---

## 6. Contraste independiente: los dias de planta parada bajo sol

Reconstruccion por una via distinta a la de esta prueba (energia, no voltaje): dias
con al menos 12 lecturas de sol pleno (GHI >= 300) dentro de 07-17 y generacion DC
nula en >= 90 % de ellas.

- Dias con sol pleno suficiente para evaluar: **202**
- Dias con la planta parada bajo sol: **41 (20,3 %)**

Contra la medicion paralela del equipo (43 de 197 dias, 22 %, sobre un universo de
dias con cobertura completa ligeramente distinto): **coinciden**. Las dos vias miden
el mismo fenomeno y dan la misma magnitud, ~20-22 % de los dias evaluables.

Y lo importante para esta prueba:

| regla | dias que marca | de los 41 dias parados-con-sol, cuantos captura |
|---|---:|---:|
| **A** (07-17) | 95 | **41 de 41 (100 %)** |
| **C** (07-17 + GHI >= 300) | 69 | **41 de 41 (100 %)** |

**Ningun dia de planta parada bajo sol se le escapa a ninguna de las dos reglas.** Las
dos mediciones se refuerzan: lo que la regla de Leo detecta no es ruido de calidad de
dato, es **el ~20 % de los dias con la planta parada bajo sol** que hunde el
performance ratio de 0,830 a 0,648.

---

## 7. Materialidad: cuantos dias superarian el 20 %

| regla | dias marcados | dias que superan el 20 % de las lecturas |
|---|---:|---:|
| A (07-17) | 95 | 70 |
| C (07-17 + GHI >= 300) | 69 | 40 |
| D (ventana solar) | 224 | 82 |

---

# RECOMENDACION

## 7.1 La regla

**Ventana fija 07:00-17:00 con la irradiancia como GRADUADOR de severidad, no como
filtro de existencia.** En una sola frase: se marca por hora, se gradua por sol, y
cuando no hay sol medido se marca igual y se dice que no se pudo graduar.

```sql
-- Fuente: monitoreo_sc_electrico CRUDA (la vista corregida borra los ceros),
-- descartando las filas del piranometro por su FIRMA (ver §0).
marcada        := ts::time >= '07:00' AND ts::time < '17:00'
                  AND (voltaje_vac = 0 OR frecuencia_hz = 0 OR potencia_total_wac = 0)
ghi            := avg(irradiancia_incidente) sobre date_bin('5 minutes', ts)  -- NUNCA por igualdad de timestamp
severidad      := 'grave'          si ghi >= 300
                  'aviso'          si ghi <  300
                  'aviso' + motivo 'sin_irradiancia'   si ghi IS NULL
```

**Por que esta y no las otras, con los numeros:**

- **Contra la ventana solar (D):** 224 dias vs 95. Leo lo anticipo y el dato lo
  confirma: ampliar al amanecer/atardecer mas que duplica los dias tocados. Descartada.
- **Contra la irradiancia como filtro duro (C):** C pierde **8 dias** que no tienen
  irradiancia, **3 de ellos apagones de dia entero** (2025-05-07, 2025-05-26,
  2026-01-05), y los pierde **en silencio**, porque `NULL >= 300` es falso. Un detector
  de averias que se apaga solo en los 46 dias sin irradiancia y no lo dice es peor que
  no tenerlo. Ademas C no aporta casi nada sobre B (2.728 vs 2.747): la hora ya estaba
  haciendo el trabajo.
- **La irradiancia SI aporta como graduador:** separa 2.728 lecturas / 69 dias donde el
  sol es indiscutible, de 3.251 donde la explicacion "estaba nublado" es admisible. Esa
  separacion es informacion real y hay que conservarla; lo que no hay que hacer es
  tirar la mitad del hallazgo.
- **La ventana fija 07-17 se queda como esta.** No hay que moverla a hora solar: solo
  7 lecturas de 35.979 caen fuera de 05-17 h, y el criterio de Leo es operativo (cuando
  hay alguien para ir a revisar), no astronomico.
- **Umbral 300 W/m2:** se respeta el de Leo. Esta en una meseta (69 dias a 300, 67 a
  400, 63 a 500), asi que la eleccion no es fragil. Anotar que la serie de irradiancia
  sigue sin calibrar (0,3 % por encima de 1.500 W/m2) y revisar el umbral cuando se
  cierre R2 con Hugo.

**Comportamiento en los dias sin irradiancia disponible (46 de 274, todos anteriores al
2025-07-01):** la regla marca igual, con severidad `aviso` y motivo explicito
`sin_irradiancia`. Nunca se calla. El hallazgo lleva el motivo en el detalle para que
quien lo lea sepa que no se pudo graduar, en vez de creer que se descarto.

**Severidad:** `grave` con GHI >= 300, `aviso` en el resto. El hallazgo pesa: 41 de los
202 dias evaluables (20,3 %) tienen la planta parada bajo sol pleno, y eso mueve el
performance ratio de 0,830 a 0,648. Pero **la severidad debe vivir en un eje aparte del
veredicto de calidad de dato** (siguiente punto).

## 7.2 ¿El codigo actual confunde disponibilidad con validez? Si, y hay que separarlo

**Si, y se puede medir.** Hoy `voltaje_vac` con limite inferior 100 produce
`fuera_de_rango` **grave** en **238 dias**, y con eso declara que el DATO de esos dias
es malo. El dato es perfecto: el sensor registro con exactitud que el inversor marcaba
0 V. Lo que estaba mal era el EQUIPO. Un dia con el inversor caido es un dia con dato
BUENO sobre un sistema MALO, y el veredicto actual no puede decir esa frase.

Consecuencia practica y ya medible: `calidad.contexto.confianza()` es lo que toda
herramienta incrusta para decir "de este periodo se puede fiar". Con la regla vieja,
un mes con muchos apagones sale con la confianza hundida, y el agente concluye "no
confies en la energia de este mes" cuando la verdad es la contraria: **la energia de
ese mes es exacta, y es baja porque la planta estuvo parada**. Es un error en la
direccion peligrosa: esconde la averia detras de una advertencia de calidad de dato.

**Recomendacion: modulo propio.** `calidad/pruebas/disponibilidad.py`, hermano de las
cuatro familias del documento y no una quinta prueba de `validez_fisica.py`. Tres
razones:

1. `validez_fisica.py` arranca con `_exigir_dato_sin_corregir` y se declara `no_aplica`
   contra las vistas corregidas. Esta prueba necesita lo mismo pero por otro motivo (la
   vista borra el 0, no lo recorta), y mezclar las dos justificaciones en el mismo
   `raise NoAplica` hace ilegible por que se pide el crudo.
2. Los limites de `validez_fisica` salen de `catalogo.minimo/.maximo`. Esta prueba no
   tiene limite por variable: tiene una hora, un umbral de irradiancia y un
   emparejamiento por ventana. No entra en esa forma sin deformarla.
3. Es la primera prueba del sistema que mide el EQUIPO. Va a haber mas (arranque tardio,
   parada temprana, codigo de error del inversor, clipping). Merece su casa.

**Y el hallazgo NO debe entrar en el veredicto de calidad de dato.** Concretamente: el
tipo `inversor_sin_acoplar` no va en `contexto.TIPOS_QUE_INVALIDAN` ni debe contar como
grave material en `contexto.reducir`. Medido: metiendolo como grave, los dias graves
suben de 181 a 193; como aviso, se quedan en 181. Lo correcto es que **no cuente en
ninguna de las dos**, y que viaje en un eje separado de "disponibilidad del equipo"
dentro del mismo payload de `confianza()`. El numero que el experto necesita es
"41 de 202 dias con la planta parada", no "12 dias mas en rojo".

## 7.3 El `CASE` de la vista: eliminarlo, no ajustarlo

Los tres `CASE` de las variables AC de `v_sc_electrico_corregido` deben **eliminarse**,
no reajustarse a un rango mas ancho:

- **`voltaje_vac`: eliminar el `CASE` entero.** No existe un rango de validez fisica
  para esta variable: 0 V es valido (inversor sin acoplar) y 100-218 V es valido
  (inversor acoplado). Todo el dominio observado es valido. Ademas el techo de 280 V
  **nunca se dispara**: el maximo del historico es **218,8 V**. Lo unico que hace ese
  `CASE` es borrar los 7.872 ceros validos. Un `CASE WHEN voltaje_vac < 0` seria el
  unico defendible, y en 35.979 filas no hay ni una negativa: no aporta nada.
- **`frecuencia_hz`: eliminar el `CASE` entero,** por identica razon. El techo de 65 Hz
  tampoco se dispara nunca (maximo 60,06 Hz), y el piso de 55 Hz borra 3.760 ceros
  validos mas 120 lecturas de transicion entre 0 y 55 Hz.
- **`potencia_total_wac`: conservar el techo, quitar el piso.** `> 5000` si atrapa
  contaminacion real (1 fila). `< 0` no aparece nunca. El 0 ya sobrevive, asi que esta
  columna no esta rota, pero conviene dejarla coherente con las otras dos.

Cambiar el rango en vez de quitarlo solo mueve el problema: cualquier piso por encima
de 0 vuelve a borrar los ceros, que es justo el dato que Leo pidio detectar.

**Y hay que tocar los tres lugares a la vez** (`config.RANGOS`,
`analitica.catalogo` y la vista). Si se arregla la vista y se olvida `config.RANGOS`,
el barrido sigue escribiendo los 7.954 `fuera_de_rango` graves y el veredicto no se
mueve; si se arregla `config` y se olvida la vista, el analisis sigue ciego a los
apagones. Ninguno de los dos errores revienta nada: los dos fallan en silencio.

---

## Apendice: consultas usadas

Todas parten del CTE `electrico` del §0. Las principales:

```sql
-- §1a distribucion horaria (hora LOCAL: NUNCA `AT TIME ZONE`)
SELECT extract(hour from ts)::int h, count(*) n,
       count(*) FILTER (WHERE voltaje_vac = 0) v0
  FROM electrico GROUP BY 1 ORDER BY 1;

-- §1b/1c correlacion con DC y tension de string
SELECT count(*) FILTER (WHERE voltaje_vac = 0) vac0,
       count(*) FILTER (WHERE voltaje_vac = 0
                          AND coalesce(potencia_pv1_w,0)+coalesce(potencia_pv2_w,0) = 0) dc0,
       count(*) FILTER (WHERE voltaje_vac = 0
                          AND greatest(coalesce(voltaje_pv1_v,0),
                                       coalesce(voltaje_pv2_v,0)) > 50) vdc50
  FROM electrico;

-- §2 regla horaria
SELECT count(*) FILTER (WHERE ts::time >= '07:00' AND ts::time < '17:00'
                          AND (voltaje_vac = 0 OR frecuencia_hz = 0
                               OR potencia_total_wac = 0)) marcadas,
       count(DISTINCT ts::date) FILTER (WHERE ts::time >= '07:00' AND ts::time < '17:00'
                          AND (voltaje_vac = 0 OR frecuencia_hz = 0
                               OR potencia_total_wac = 0)) dias
  FROM electrico;

-- §3/§4 emparejamiento por ventana de 5 min (NUNCA por igualdad de timestamp)
WITH rad AS (
    SELECT date_bin('5 minutes', "timestamp", timestamp '2024-01-01 00:00:00') bin,
           avg(irradiancia_incidente) ghi
      FROM v_sc_radiacion_corregida GROUP BY 1)
SELECT count(*) FILTER (WHERE r.ghi >= 300) con_sol,
       count(*) FILTER (WHERE r.ghi <  300) sin_sol,
       count(*) FILTER (WHERE r.ghi IS NULL) sin_medir
  FROM electrico e
  LEFT JOIN rad r ON r.bin = date_bin('5 minutes', e.ts, timestamp '2024-01-01 00:00:00')
 WHERE e.ts::time >= '07:00' AND e.ts::time < '17:00'
   AND (e.voltaje_vac = 0 OR e.frecuencia_hz = 0 OR e.potencia_total_wac = 0);
```
