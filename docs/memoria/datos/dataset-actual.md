---
name: dataset-actual
description: El corpus NO está cerrado. El 2026-09-01 entraron 57 CSVs nuevos (2026-06-02 a 2026-08-31) desde Last-Data.zip, ya ingestados: la base pasó de 274 a 331 días y de 36.469 a 45.270 filas eléctricas. Los 57 comparten UNA sola cabecera de 27 columnas y ninguna fila mezclada
categoria: datos
actualizado: 2026-09-01
---

# Dataset actual

- **Corpus completo:** **342 CSVs**, del **2024-11-10 al 2026-08-31**, en dos tandas.
- **Tanda histórica:** 285 CSVs hasta el 2026-06-01.
- **Tanda nueva (2026-09-01):** **57 CSVs** del **2026-06-02 al 2026-08-31**, descargados por Izack
  en `dataset/Last-Data.zip` y **ya ingestados**.

⚠️ **Dónde está cada cosa hoy (verificado en disco el 2026-09-01).** La carpeta
`dataset/Monitoreo-AgroVoltaic-SC-NEW/` **contiene solo los 57 archivos nuevos**: la extracción de
`Last-Data.zip` ocupó su lugar. Los 285 históricos siguen disponibles en
`dataset/Monitoreo-AgroVoltaic-SC-NEW.zip` y, sobre todo, **ya están en la base**. La carpeta
`...-OLD/` **ya no existe en disco**. Quien vaya a re-correr el ETL sobre "la carpeta activa" tiene
que saber que hoy eso son 57 archivos y no 342.

## Qué cambió en la base con la carga (medido, 2026-09-01)

| | Antes | Después |
|---|---|---|
| Días con dato eléctrico | 274 | **331** |
| Filas eléctricas | 36.469 | **45.270** |
| Último dato | 2026-06-01 | **2026-08-31** |

Y las tablas derivadas, que **no se actualizan solas** y por poco quedan atrás:
`ventana_solar` 569 → **660 días**, `cielo_diario` 228 → **285**, `hallazgos_calidad`
28.509 → **34.408**, clear-sky y POA hasta el 2026-08-31. Cómo se pisó ese problema y la regla que
salió de ahí, en [[regla-post-carga]].

## Los 57 archivos nuevos: el logger se estandarizó

Medido sobre los CSV crudos el 2026-09-01:

| | |
|---|---|
| Cabeceras distintas entre los 57 | **1** (27 columnas) |
| Filas de datos | 8.822 |
| Filas con las 27 columnas | **8.822 (el 100 %)** |
| Filas con las cuatro columnas del SP722 con valor | 8.636 |
| Filas con `irradiancia_reflejada` y `albedo` | 8.822 |

Dos cosas que **dejaron de reproducirse** en el dato nuevo, y las dos son inconsistencias
históricas del proyecto: **los 13 esquemas** ([[schemas-multiples]]) y **las filas mezcladas**
([[filas-mezcladas]]). Tampoco aparece ninguno de los tres typos de cabecera
([[typos-headers]]): la cabecera nueva dice `Energia hoy [Wh]`, `Corriente PV2 [A]` y
`Potencia total [Wac]`, sin acento grave, con espacio y sin la mayúscula errónea.

**Siguen apareciendo:** la irradiancia sin calibrar, con picos de **1.464,46 W/m²** el 2026-07-21
([[irradiancia-sin-calibrar]]) y el **código de error 302** ([[inversor-sin-acoplar]]).

## El corpus NO está cerrado (corrige el 2026-08-28)

Lo que decía esta nota hasta ayer, y era falso:

> ~~El sistema PV dejó de reportar el 2026-06-01 y no hay CSVs pendientes de ingestar. Al
> 2026-08-28 eso son 88 días de antigüedad: el estado que corresponde reportar es "detenida".~~

**El sistema nunca dejó de reportar.** Hay dato hasta el 2026-08-31 y **55 de los 57 días nuevos
tienen generación real**, con un pico de **2.115 W** sobre 2.840 Wp instalados (2026-07-06 09:05).
Lo que estaba detenido era **nuestra descarga**.

Eso llegó al documento que se le envió al equipo, así que hay que enviar una corrección:
[[correccion-al-equipo]].

⚠️ **Los dos días que no generaron nada son el 2026-08-26 y el 2026-08-31**, o sea **el último día
que tenemos**. No es un dato de color: es la alarma de la jornada ([[inversor-sin-acoplar]]).

## NEW vs OLD (histórico, sigue vigente para la tanda de 285)

`NEW = OLD + 8 archivos nuevos` (2026-05-25 → 2026-06-01). **No se limpió nada**, solo se agregó
data reciente.

## Verificación (2026-06-01)

Los 285 históricos reproducen **todas** las inconsistencias documentadas en el EDA. Ver la carpeta
`inconsistencias/`: cada problema tiene su archivo con la evidencia contada. Esa verificación
**sigue siendo válida para el histórico** y **ya no describe el dato nuevo**.

Relacionado: [[fuentes-fisicas]], [[schemas-multiples]], [[gaps-temporales]],
[[muestreo-variable]], [[filas-mezcladas]], [[typos-headers]],
[[irradiancia-sin-calibrar]], [[inversor-sin-acoplar]], [[regla-post-carga]],
[[correccion-al-equipo]].
