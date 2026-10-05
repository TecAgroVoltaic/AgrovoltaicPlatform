---
name: regla-post-carga
description: Regla operativa adoptada el 2026-09-01: después de cargar datos nuevos se corre `historico todo` (sol, barrido, cielo, reporte, en ese orden) y nunca solo `barrido`. El veredicto saca su calendario de la tabla de apoyo `ventana_solar`, así que un barrido suelto escribe hallazgos que el veredicto no puede ver, y devuelve un número viejo y plausible sin un solo aviso
categoria: decision
actualizado: 2026-09-01
tags: [operativa, barrido, calidad, carga, ventana-solar, fallos-silenciosos, agente-historico]
---

# Después de una carga se corre el barrido completo, no solo el barrido

**Decidido el 2026-09-01**, después de pisar el problema en la primera carga de datos nuevos en
tres meses ([[dataset-actual]]).

## La regla

> Después de ingestar datos nuevos se corre **`historico todo`**, en su orden:
> **sol → barrido → cielo → reporte**. Correr solo `barrido` no es "hacer una parte del trabajo":
> es dejar el sistema **contando sobre un calendario viejo y sin decirlo**.

## Qué pasó

Cargados los 57 CSVs del 2026-06-02 al 2026-08-31, se corrió **solo el barrido**. El barrido hizo
su trabajo: leyó los días nuevos y escribió sus hallazgos.

**Y el veredicto siguió informando 274 días con datos cuando la base ya tenía 331.**

La causa es de dependencia, no de cálculo: **el calendario del veredicto no sale de la tabla de
datos, sale de la tabla de apoyo `ventana_solar`**, que es la que dice qué días existen y cuántas
horas de sol tiene cada uno (se construye con pvlib, y es lo que permite medir la completitud
contra las horas de sol y no contra 24 h, ver [[agente-historico-calidad]]). Esa tabla terminaba el
**2026-06-01**. Para el veredicto, los 57 días nuevos **no existían**, así que los hallazgos que el
barrido acababa de escribir no tenían dónde caer.

**No hubo error ni advertencia.** Devolvió un número plausible, del mismo orden de magnitud que
siempre, y viejo.

## Por qué el orden importa

| Paso | Qué construye | De qué depende |
|---|---|---|
| `sol` | `ventana_solar`: qué días existen y sus horas de sol | solo de las fechas |
| `barrido` | los hallazgos por día y variable | del calendario que dejó `sol` |
| `cielo` | `cielo_diario`: kt, variabilidad, tipo de día | del clear-sky y del calendario |
| `reporte` | el veredicto y los resúmenes | de los tres anteriores |

Cada paso escribe el denominador del siguiente. Correr uno solo no falla: **produce un resultado
consistente con un mundo que ya no existe**.

## Es el quinto caso del mismo patrón, y el quinto que falla hacia el lado tranquilizador

Va anotado en [[silencio-leido-como-salud]] junto a los otros cuatro. Comparten la forma exacta:
ninguno produce un error, un log ni un valor raro, y **los cinco devuelven el número más optimista
de los disponibles**. Acá el optimismo es doble: el sistema reportaba menos días de los que tiene
(o sea, menos evidencia de problemas) y a la vez daba por buena una foto de tres meses atrás.

La generalización que ya estaba escrita y esta vez se cumplió otra vez: **una tabla de apoyo que se
queda corta no se queja, se calla**. Lo mismo vale para `cielo_diario`, para el clear-sky y para la
POA modelada, que también se calculan por día y también terminaban el 2026-06-01.

## Resuelto el mismo día

Corrido `historico todo`, las tablas derivadas quedaron así:

| Tabla | Antes | Después |
|---|---|---|
| `ventana_solar` | 569 días | **660 días** |
| `cielo_diario` | 228 | **285** |
| `hallazgos_calidad` | 28.509 | **34.408** |
| clear-sky y POA | hasta 2026-06-01 | **hasta 2026-08-31** |

Los 660 días de `ventana_solar` son el calendario completo del corpus, del 2024-11-10 al
2026-08-31, y cuadran con los 569 anteriores más los 91 días del tramo nuevo.

⚠️ **Hueco marcado:** esta memoria documenta `hallazgos_calidad` en **23.533 filas** al 2026-08-31
([[store-hallazgos-calidad]]) y acá arranca en **28.509**. La corrida que produjo esa diferencia
(previsiblemente el re-corrido del barrido con la prueba de disponibilidad puesta) **no quedó
registrada**. Si alguien necesita auditar de dónde salen los 28.509, ese salto es el punto ciego.

## Qué hacer para que la regla no dependa de acordarse

Anotado como pendiente en [[abiertos]], no resuelto acá: lo correcto no es recordar el orden, es
que **el barrido se niegue a correr, o avise fuerte, cuando `ventana_solar` no cubre el rango que
le están pidiendo**. Es exactamente la regla 1 de [[silencio-leido-como-salud]]: un resultado que no
declara su alcance no se puede evaluar.

Relacionado: [[dataset-actual]], [[silencio-leido-como-salud]], [[store-hallazgos-calidad]],
[[agente-historico-calidad]], [[gaps-temporales]], [[correccion-al-equipo]],
[[abiertos]], [[decisiones]].
