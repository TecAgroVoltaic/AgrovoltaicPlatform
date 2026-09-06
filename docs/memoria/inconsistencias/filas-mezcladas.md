---
name: filas-mezcladas
description: Filas de distintas fuentes (inversor vs sensor) con distinto nº de columnas intercaladas en un mismo CSV. Confirmado el 2026-09-01: no aparece ni una en los 57 CSVs nuevos, las 8.822 filas traen las 27 columnas
categoria: inconsistencia
actualizado: 2026-09-01
---

# Filas de fuentes mezcladas (GRAVE)

En varios archivos, filas del inversor (17-22 cols) y filas solo-sensor (3-4 cols) se
intercalan en el mismo CSV. Esto corrompe los datos si se leen sin separar por tipo de fila:
valores de irradiancia caen en columnas como "Voltaje PV1".

**Evidencia en NEW (2026-06-01):** 8 archivos con filas de distinto nº de columnas:
`2024-12-25`, `2024-12-27`, `2024-12-28`, `2024-12-29`, `2025-05-20`, `2025-10-18`,
`2025-10-20`, `2025-10-30`.

> Desde mar-2026 el problema desaparece (todas las filas con nº de columnas consistente).

**Confirmado con tres meses más de dato (2026-09-01):** en los **57 CSVs del 2026-06-02 al
2026-08-31** ([[dataset-actual]]) las **8.822 filas traen las 27 columnas**, sin una sola
excepción. La desaparición no era un tramo corto: se sostiene, y coincide con la estandarización de
la cabecera ([[schemas-multiples]]).

**Cómo corregirlo:** el equipo especificó el remapeo (los 3 valores del piranómetro → columnas
L/M/N y su timestamp → columna O; el resto en blanco) y dejó un par original/corregido como
ground-truth → [[correccion-filas-mezcladas]].

> **Respuesta oficial de Leo (2026-08-10, [[respuestas-leo-cardinale]] · P6/P7):** es un error que
> **Joshua ya trabajó**; algunos datos se recuperaron y otros quedaron con huecos — y **eso es lo
> recomendable**: recuperar lo que se pueda con la regla de remapeo y aceptar los huecos donde no.

## Dos filas concretas que envenenan los totales de energía (medido 2026-08-31)

El daño de estas filas no se queda en el CSV: llega a los máximos de la base y desde ahí a los
números publicados. Medido al calcular la energía AC ([[energia-ac-tablero]]):

- De las **466 filas** de `monitoreo_sc_electrico` con firma de contaminación (potencia > 5.000 W,
  voltaje > 600 V o voltaje negativo), **una sola** trae `energia_total_wh`: la del
  **`2025-10-07 07:45`**, con `potencia_pv1_w` = 26.503.162,8 W, `temperatura_inversor_c` = 291,1 y
  `energia_total_wh` = 39.328.367,1. **Esa fila sola** es la que hizo descartar el contador del
  inversor en el documento enviado al equipo. Sin ella el máximo es 2.710,7 kWh y el contador
  sirve.
- El **último registro del 2026-03-09** (17:55) da `energia_hoy_wh` = 137,25 contra una mediana de
  6,65 y un segundo máximo de 14,2. Ese día venía acumulando normal hasta 3,586 a las 10:45, la
  columna se va a NULL siete horas y reaparece en 137,25. Misma huella (ese mismo día PV1 y PV2 se
  intercambian de magnitud a las 11:10). **Por sí sola mete un 8 % de error en cualquier total
  anual.**

Las dos son argumento a favor del Paso 2 (separación fina) y, mientras tanto, de excluirlas
explícitamente en cualquier agregación de energía.

Relacionado: [[schemas-multiples]], [[dataset-actual]], [[fuentes-fisicas]], [[correccion-filas-mezcladas]],
[[respuestas-leo-cardinale]], [[energia-ac-tablero]], [[vista-corregida-no-corrige]],
[[catalogo-metricas-evaluacion]].
