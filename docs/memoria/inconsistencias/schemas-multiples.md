---
name: schemas-multiples
description: 13 schemas distintos con nombres de columna inconsistentes (cortos, largos, snake_case) entre épocas. Sigue siendo cierto para el histórico, y DEJÓ DE REPRODUCIRSE en el dato nuevo: los 57 CSVs del 2026-06-02 al 2026-08-31 comparten una sola cabecera de 27 columnas
categoria: inconsistencia
actualizado: 2026-09-01
---

# Schemas múltiples / nombres inconsistentes

13 schemas distintos a lo largo del tiempo. La misma variable física tiene varios nombres:
`vpv1` / `Voltaje PV1 [V]` / `voltaje_pv1_v`. Columnas aparecen y desaparecen entre épocas
(PV2, Frecuencia, Energía total, Temp inversor, código error, irradiancia reflejada, albedo).

**Evidencia en NEW (2026-06-01):** 12 headers exactos distintos coexisten. Los 8 archivos
nuevos usan el schema más limpio (27 cols, con SP722), pero el histórico mantiene toda la
heterogeneidad.

Mapeo completo de los 13 schemas por período: `../../referencia/EDA-Monitoreo-AgroVoltaic.md` §2 y §8.

## Dejó de pasar en el dato nuevo, desde el 2026-06-02

**Medido sobre los 57 CSVs de la carga del 2026-09-01** ([[dataset-actual]]):

| | |
|---|---|
| Rango | 2026-06-02 a 2026-08-31 |
| Archivos | 57 |
| **Cabeceras exactas distintas** | **1** |
| Columnas de esa cabecera | 27 |

**Alguien estandarizó la salida del logger** en algún momento entre el 2026-06-01 y el 2026-06-02.
La inconsistencia número 1 del proyecto **no se reproduce ni una vez** en tres meses de dato nuevo.

Dos precisiones para no sobre-leerlo:

- **Este archivo no se archiva ni se borra.** Los 13 schemas siguen siendo un hecho del **histórico**
  (2024-11-10 a 2026-06-01), que es la mayor parte del corpus y el que hay que seguir procesando con
  el mapeo completo. Lo que cambió es **desde cuándo deja de pasar**, y esa fecha es el 2026-06-02.
- **No sabemos si fue deliberado.** Nadie del equipo avisó del cambio. Que se sostenga en el futuro
  es una expectativa, no un hecho verificado: conviene preguntarlo ([[correccion-al-equipo]]).

La cabecera única, verbatim:

```
timestamp,Voltaje PV1 [V],Corriente PV1 [A],Potencia PV1 [W],Voltaje PV2 [V],Corriente PV2 [A],
Potencia PV2 [W],Potencia total [Wac],Frecuencia,Voltaje [Vac],Corriente [Aac],Energia hoy [Wh],
Energia total [Wh],Temperatura inversor [C],Energia PV1 [Wh],Energia PV2 [Wh],codigo_error,
temp_vertical,temp_inclinado,irradiancia_incidente,irradiancia_reflejada,albedo,
Irradiancia_incidente_SP722 [W/m2],Irradiancia_reflejada_SP722 [W/m2],
Detector_incidente_SP722 [mV],Detector_reflejado_SP722 [mV],Albedo_SP722
```

(está en una sola línea en el archivo; acá va cortada para que se lea).

Y con ella caen los otros dos síntomas de la misma familia: **ninguno de los tres typos de cabecera**
([[typos-headers]]) y **ninguna fila mezclada** ([[filas-mezcladas]]) aparecen en los 57.

Relacionado: [[typos-headers]], [[filas-mezcladas]], [[dataset-actual]],
[[correccion-al-equipo]], [[decisiones]].
