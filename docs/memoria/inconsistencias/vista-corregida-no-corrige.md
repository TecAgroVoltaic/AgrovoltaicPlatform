---
name: vista-corregida-no-corrige
description: Dos bugs de v_sc_electrico_corregido medidos el 2026-08-31. Las cuatro columnas de energía pasan sin ningún CASE, así que la vista corregida devuelve los mismos 39 MWh que la cruda; y el CASE de voltaje_vac borra los 7.873 ceros que Leo acaba de declarar dato válido, con lo que la vista es incapaz de ver un inversor caído a mediodía
categoria: inconsistencia
actualizado: 2026-08-31
tags: [vistas, supabase, energia, voltaje-ac, disponibilidad, calidad, bug]
---

# La vista «corregida» no corrige lo que se cree, y borra dato válido

Medido el **2026-08-31** contra producción, leyendo la definición viva de la vista con
`pg_get_viewdef` y comparando conteos ([[energia-ac-tablero]]). Son **dos bugs distintos** de
`v_sc_electrico_corregido`, y los dos hacen daño en direcciones opuestas: uno **no limpia lo que
debería** y el otro **limpia lo que no debería**.

La regla del proyecto es "nunca calcular desde `monitoreo_sc_electrico`, usar las vistas
corregidas". Estos dos bugs son la razón por la que esa regla, sola, no alcanza.

## Bug 1: las cuatro columnas de energía pasan sin ningún `CASE`

La vista es un `SELECT` columna a columna con `CASE` de rango y **sin `WHERE`**. Las columnas de
energía aparecen tal cual:

```
    corriente_aac,
    energia_hoy_wh,
    energia_total_wh,
    energia_pv1_wh,
    energia_pv2_wh,
```

Resultado: **no se cae ni una fila y ningún máximo cambia.**

| Relación | filas | `energia_total_wh` no nulos | min | max |
|---|---|---|---|---|
| `monitoreo_sc_electrico` (cruda) | 36.469 | 19.890 | 182,3 | **39.328.367,1** |
| `v_sc_electrico_corregido` | 36.469 | 19.890 | 182,3 | **39.328.367,1** |
| Diferencia | **0** | 0 | 0 | **0** |

O sea que **hoy la vista "corregida" devuelve exactamente los mismos 39 MWh que la cruda**. La
advertencia que [[respuestas-lcv-consultas-agosto]] dejó abierta daba por hecho que la vista
limpiaba estas columnas: no lo hace.

Dónde está la contaminación de verdad, medida sobre la cruda:

| Firma | filas |
|---|---|
| `potencia_pv1_w` o `potencia_pv2_w` > 5.000 W | 2 |
| `voltaje_pv1_v` o `voltaje_pv2_v` > 600 V | 260 |
| voltaje negativo | 204 |
| **cualquiera de las anteriores** | **466** |
| de esas 466, cuántas traen `energia_total_wh` | **1** |

Una sola fila, la del `2025-10-07 07:45` ([[filas-mezcladas]]). Sin ella el máximo es 2.710,7 kWh
y el contador **sí sirve**: el detalle en [[energia-ac-tablero]].

## Bug 2: los `CASE` de las variables AC borran los ceros que Leo declaró válidos

La vista trae:

```sql
CASE WHEN voltaje_vac < 100.0 OR voltaje_vac > 280.0 THEN NULL ...
```

Ese rango es el que **Leo retiró el 2026-08-30**: el 0 V es el inversor sin exportar, es dato
válido, y de las 7.955 lecturas que el rango marcaba, **7.873 valen exactamente 0**
([[respuestas-lcv-consultas-agosto]], [[pruebas-calidad-umbrales]]).

**Y no es solo el voltaje.** Medido el 2026-08-31 sobre la base descontaminada
([[inversor-sin-acoplar]]):

| Variable | Ceros en la tabla cruda | Ceros que sobreviven en la vista |
|---|---|---|
| `voltaje_vac` | **7.872** | **0** |
| `frecuencia_hz` | **3.760** | **0** |
| `potencia_total_wac` | 4.099 | 4.099 (el 0 cae dentro de 0-5000) |

**Consecuencia práctica, y es grave:** hoy cualquier análisis que lea la vista corregida **es
incapaz de ver un inversor caído a mediodía**, porque el cero que lo delata ya fue convertido en
NULL antes de llegar. Y detectar exactamente eso es lo que Leo pidió: las tres variables AC en 0
entre las 7:00 y las 17:00 ([[store-hallazgos-calidad]]).

O sea que la prueba de disponibilidad del equipo **no se puede implementar sobre la vista
corregida**. Tiene que leer el crudo.

### Los tres `CASE` hay que ELIMINARLOS, no ensancharlos

Medido, y es la parte que decide entre arreglar y volver a romper:

- **`voltaje_vac`: eliminar el `CASE` entero.** No existe un rango de validez física para esta
  variable: 0 V es válido (inversor sin acoplar) y 100-218 V es válido (inversor acoplado), o sea
  que **todo el dominio observado es válido**. Además **el techo de 280 V nunca dispara**: el máximo
  del histórico es **218,8 V**. Lo único que hace ese `CASE` es borrar 7.872 ceros válidos. Un
  `CASE WHEN voltaje_vac < 0` sería lo único defendible, y en 35.979 filas **no hay ni una
  negativa**.
- **`frecuencia_hz`: eliminar el `CASE` entero**, por idéntica razón. **El techo de 65 Hz tampoco
  dispara nunca** (máximo **60,06 Hz**), y el piso de 55 Hz borra 3.760 ceros válidos más 120
  lecturas de transición.
- **`potencia_total_wac`: conservar el techo, quitar el piso.** El `> 5000` sí atrapa contaminación
  real (1 fila); el `< 0` no aparece nunca.

**Ensanchar el rango en vez de quitarlo solo mueve el problema:** cualquier piso por encima de 0
vuelve a borrar los ceros, que son justamente el dato que Leo pidió detectar.

### Hay que tocar TRES sitios a la vez, y los tres fallan en silencio

El rango 100-280 está escrito en tres lugares:

1. `agente-historico/src/historico/config.py:76` (`RANGOS`, lo usa el barrido SQL)
2. `agente-historico/src/historico/analitica/catalogo.py` (`_e("voltaje_vac", ..., minimo=100, maximo=280)`)
3. la vista `v_sc_electrico_corregido` en la base

**Arreglar la vista y olvidar `config.RANGOS`:** el barrido sigue escribiendo los 7.954
`fuera_de_rango` graves y el veredicto no se mueve. **Arreglar `config` y olvidar la vista:** el
análisis sigue ciego a los apagones. **Ninguno de los dos errores revienta nada.** Por eso se anota
como **una sola unidad de trabajo** y no como tres.

> ⚠️ **Corregido el 2026-08-31: eran CINCO, no tres.** Faltaban `src/agrovoltaic/ddl.py` (el
> generador del ETL, **con su propio config**) y `sql/schema.sql`, que es **generado** por el
> anterior. Con los tres de arriba arreglados, **regenerar el esquema desde el menú del ETL
> reintroducía los dos defectos completos**. Ya está corregido en los cinco, pero la causa sigue
> viva: **la misma vista está definida en dos proyectos** y pueden divergir sin que nada lo note
> → [[rango-fisico-en-cinco-sitios]].

## Es el mismo patrón que ya conocíamos

Este segundo bug es idéntico en forma al de las pruebas de validez física leídas contra las vistas
corregidas: **la vista ya borró lo que la prueba busca, así que la prueba se aprueba a sí misma**
([[silencio-leido-como-salud]]). La diferencia es que allá el resultado era "cero valores
imposibles" y acá es "cero inversores caídos". En los dos casos la salida es tranquilizadora y
falsa.

Regla que se refuerza: **toda prueba que busque un valor tiene que declarar contra qué relación se
leyó**, y si esa relación aplica una corrección sobre la variable que la prueba mira, la prueba no
vale.

## Estado

~~**Ninguno de los dos está arreglado.**~~ **2026-08-31: la migración ya está escrita.**
`sql/003_electrico_sin_falsos_positivos.sql` quita los `CASE` y está **validada pero NO aplicada**:
aplicarla es una de las **dos únicas escrituras a producción** pendientes y **la decide Izack**
([[implementacion-decisiones-lcv]], [[abiertos]]). Los cinco sitios de código ya están corregidos
([[rango-fisico-en-cinco-sitios]]); lo que falta es la base.

Detalle de la medición, con las consultas: `../../referencia/medicion-energia-ac.md`.

Relacionado: [[inversor-sin-acoplar]], [[rango-fisico-en-cinco-sitios]],
[[implementacion-decisiones-lcv]], [[energia-ac-tablero]], [[respuestas-lcv-consultas-agosto]],
[[silencio-leido-como-salud]], [[store-hallazgos-calidad]], [[pruebas-calidad-umbrales]],
[[filas-mezcladas]], [[unidades-energia-kwh]], [[implementacion]], [[abiertos]].
