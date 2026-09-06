---
name: gaps-temporales
description: Brechas largas sin datos (126 y 71 días) más gaps menores. El "corpus detenido desde el 2026-06-01" quedó FALSO el 2026-09-01: entraron 57 días nuevos y la base pasó a 331 días con dato sobre 660 de calendario. Los gaps históricos siguen intactos, y las dos completitudes que no hay que mezclar hay que volver a medirlas
categoria: inconsistencia
actualizado: 2026-09-01
---

# Gaps temporales

Brechas significativas sin ningún dato:

| Desde | Hasta | Días |
|---|---|---|
| 2024-12-29 | 2025-05-04 | **126** |
| 2025-06-26 | 2025-09-05 | **71** |
| 2024-11-21 | 2024-12-23 | 32 |
| 2025-09-05 | 2025-09-22 | 17 |
| 2024-11-12 | 2024-11-21 | 9 |

**Evidencia en NEW (2026-06-01):** persisten los históricos + nuevo mini-gap: faltan
**22, 23 y 24 de may-2026** (salta de 05-21 a 05-25).

Decisión: **no** generar datos sintéticos para los gaps largos; usar NASA POWER como
referencia paralela.

## Recuento medido en producción (2026-08-28)

Consulta directa a la Supabase, no conteo sobre los CSV: **295 días sin datos** dentro del
calendario, agrupados en **26 tramos**. El mayor es de **125 días, del 2024-12-30 al 2025-05-03**:
es el mismo hueco que la tabla de arriba lista como "126 días del 2024-12-29 al 2025-05-04",
contado sobre los días **efectivamente vacíos** en vez de sobre los extremos que sí tienen dato.
Al hablar de la base va el número medido (125 días, 26 tramos); al hablar de los archivos, el de
la tabla.

## ~~El corpus está detenido~~ FALSO, corregido el 2026-09-01

Lo que decía esta sección:

> ~~Último dato: **2026-06-01**. Al **2026-08-28** son **88 días de antigüedad** y no hay CSVs
> pendientes de ingestar. El estado que corresponde reportar es "detenida", no "al día".~~

**El sistema nunca dejó de reportar.** Sí había CSVs pendientes de ingestar, y eran 57: entraron el
2026-09-01 desde `Last-Data.zip` y llegan hasta el **2026-08-31** ([[dataset-actual]]). Lo detenido
era la descarga, no la planta.

Esto era uno de los tres hechos que se le reportaron al equipo, así que hay que corregirlo
([[correccion-al-equipo]]).

## El recuento después de la carga (2026-09-01)

| | Antes (corte 2026-08-28) | Después |
|---|---|---|
| Días de calendario | 569 | **660** (2024-11-10 a 2026-08-31) |
| Días con dato eléctrico | 274 | **331** |
| Días sin dato | 295 | **329** (por aritmética: 660 − 331) |
| Cobertura del calendario | 0,444 | **0,50** |

⚠️ **Lo que NO se volvió a medir**, y no hay que citar del corte viejo como si fuera de hoy: el
**número de tramos** (eran 26; los 57 días nuevos son contiguos, así que no deberían agregar
tramos, pero eso hay que confirmarlo), la **completitud dentro de los días con registro** (era
0,926) y el reparto de energía de la sección de más abajo.

**Los gaps históricos no se movieron**: los 125 días de 2024-12-30 a 2025-05-03 y los 71 de
jul-ago 2025 siguen exactamente donde estaban. Lo que cambió es que **el corpus dejó de tener un
final**.

## Dos completitudes distintas, que no hay que mezclar

Eléctrico, medido el 2026-08-28:

| Pregunta | Valor |
|---|---|
| ¿Cuánto del calendario tiene dato? | **0,444** |
| ¿Cuán completos son los días en que el logger sí grabó? | **0,926** |

La primera mide el fallo del datalogger; la segunda, la calidad del registro cuando estuvo vivo.
Un único número llamado "completitud" que no diga cuál de las dos es, engaña. Y la cadencia contra
la que se mide importa igual: de nov-2025 a jun-2026 la completitud eléctrica va de **0,84 a
1,02** usando la moda de los saltos reales, mientras que con una cadencia nominal fija daba
**0,05**. Ver [[muestreo-variable]].

## Cuánto se generó en los días que no tenemos (medido 2026-08-31, corte VIEJO)

⚠️ **Esta sección es anterior a la carga del 2026-09-01 y sus números son de un calendario de 569
días.** Con 57 días más registrados, la parte que "no tenemos" es necesariamente menor. **Hay que
re-medirla**: el método sigue siendo válido, las cifras no.


Hay un instrumento que **sí ve los huecos**, y es el contador de vida del inversor,
`energia_total_wh`: no se reinicia nunca, así que su recorrido total cubre el calendario entero,
haya CSV o no.

| Concepto | Valor |
|---|---|
| Energía AC de todo el período (2.710,7 − 182,3) | **2.528,40 kWh** sobre 569 días de calendario |
| De eso, lo que cae en días **que tenemos registrados** | 905,55 kWh |
| **Generado en días que NO están en el corpus** | **1.622,85 kWh** |

O sea que **el 64 % de la energía que produjo la planta ocurrió en días que el datalogger no
grabó**. Es la primera cuantificación de lo que cuestan estos gaps en la magnitud que le importa
al proyecto, y no en días de calendario. Detalle en [[energia-ac-tablero]].

Refuerza la distinción de arriba: "cuánto registramos" y "cuánto produjo la planta" son preguntas
distintas, y ahora hay un número para cada una.

Relacionado: [[correccion-al-equipo]], [[regla-post-carga]],
[[decisiones]], [[dataset-actual]], [[muestreo-variable]],
[[agente-historico-calidad]], [[verificacion-numeros]], [[silencio-leido-como-salud]],
[[energia-ac-tablero]].
