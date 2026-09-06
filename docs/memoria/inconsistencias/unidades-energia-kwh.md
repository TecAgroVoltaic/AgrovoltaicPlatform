---
name: unidades-energia-kwh
description: Las cuatro columnas de energía están en kWh, no en Wh, pese al sufijo _wh del nombre. Medido por dos vías contra producción el 2026-08-31. Quien lea el nombre se equivoca por un factor de mil
categoria: inconsistencia
actualizado: 2026-08-31
tags: [unidades, energia, nomenclatura, kpi, columnas]
---

# El sufijo `_wh` miente: las columnas de energía están en kWh

Hallado el **2026-08-31** al medir la energía AC del tablero ([[energia-ac-tablero]]). No estaba
en ninguna nota anterior y no lo pidió nadie: apareció solo, y condiciona toda cifra de energía
del proyecto.

Las cuatro columnas se llaman `energia_hoy_wh`, `energia_total_wh`, `energia_pv1_wh` y
`energia_pv2_wh`, pero **una unidad de esas columnas vale 1 kWh**.

## Cómo se midió (dos vías independientes)

**1. Contra una columna cuya unidad sí es conocida.** Se integró `potencia_total_wac`, que está en
W, día a día, y se dividió entre el cierre diario del contador:

| días | p25 | mediana | p75 |
|---|---|---|---|
| 127 | 999,04 | **1.003,58** | 1.008,07 |

Mil, con una dispersión de menos del 1 %.

**2. Contraste físico.** El rendimiento específico diario implícito (cierre AC dividido entre los
2,84 kWp instalados) da **mediana 2,32 y máximo exactamente 5,00 kWh/kWp/día**, que es el techo
físico de Costa Rica. Leídas como Wh, esas mismas columnas darían **14 Wh de producción diaria**
para 2,84 kWp, o sea mil veces menos de lo que es físicamente posible.

## Por qué importa

Porque **el error no avisa**. Un nombre de columna es lo primero que lee quien escribe una
consulta, y `energia_total_wh` invita a dividir entre 1000 para pasar a kWh. Quien lo haga publica
un número **mil veces más chico** y no hay nada en el dato que lo contradiga: 2,7 kWh de vida para
una planta de 2,84 kWp es raro, pero no es imposible a simple vista.

Es de la misma familia que [[silencio-leido-como-salud]]: una afirmación falsa que el sistema
sostiene sin emitir ningún error. Acá la afirmación falsa la hace el propio nombre de la columna.

## Alcance

Aplica a las **cuatro** columnas de energía de `monitoreo_sc_electrico` y de las vistas que las
propagan. **No** aplica a `potencia_total_wac`, `potencia_pv1_w` ni `potencia_pv2_w`, que sí están
en W (es justamente lo que permitió medir el factor).

Toda cifra de energía de [[energia-ac-tablero]] está en kWh. Las cifras viejas que salen de
integrar potencia (los 1.522,78 kWh de [[catalogo-metricas-evaluacion]]) no están afectadas: esas
se calcularon desde las columnas de potencia, que están bien.

## Qué hacer

Hay dos caminos y **no se ha decidido cuál**, porque uno toca el pipeline:

- **Renombrar** las columnas a `_kwh` en el esquema. Es lo correcto, y obliga a re-correr el ETL y
  a tocar todo lo que las nombre.
- **Documentarlo** en el diccionario de columnas y dejar el nombre. Más barato, pero deja la
  trampa puesta para el próximo que llegue.

Mientras tanto queda anotado en `../../referencia/columnas-supabase.md` y en
[[diccionario-variables]], que son los dos lugares donde alguien va a buscar qué significa una
columna. Anotado como pendiente en [[abiertos]].

Detalle de la medición, con las consultas: `../../referencia/medicion-energia-ac.md`.

Relacionado: [[energia-ac-tablero]], [[diccionario-variables]], [[catalogo-metricas-evaluacion]],
[[respuestas-lcv-consultas-agosto]], [[silencio-leido-como-salud]], [[vista-corregida-no-corrige]],
[[abiertos]].
