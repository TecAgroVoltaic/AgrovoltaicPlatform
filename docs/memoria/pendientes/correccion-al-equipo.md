---
name: correccion-al-equipo
description: URGENTE. El documento que se le envió al equipo el 2026-08-28 (consultas-sobre-la-data) tiene tres afirmaciones que la carga del 2026-09-01 dejó falsas o vencidas, y una de ellas ya provocó trabajo del otro lado: Leo se llevó a revisar un corte del sistema que nunca ocurrió. Hay que enviar una corrección
categoria: pendiente
actualizado: 2026-09-01
tags: [equipo, correccion, urgente, consultas, leo-cardinale]
---

# El documento enviado al equipo tiene tres afirmaciones falsas

**Es lo más urgente de la jornada del 2026-09-01.** No es deuda técnica: son hechos equivocados
que ya están en manos de otras personas, y sobre uno de ellos el equipo ya empezó a trabajar.

El documento es `../../equipo/consultas-sobre-la-data.txt` (+ el `.pdf` con el mismo contenido),
fechado el **2026-08-28**, y volvió anotado por Leo Cardinale el 2026-08-30 como
`consultas-sobre-la-data-Rev-LCV.pdf` ([[respuestas-lcv-consultas-agosto]]).

Lo que lo invalida es la carga del **2026-09-01**: 57 CSVs del 2026-06-02 al 2026-08-31 que Izack
descargó en `Last-Data.zip` y que ya están ingestados ([[dataset-actual]]).

## Las tres, con lo que dice el documento y lo que se midió

### 1. "El sistema dejó de reportar el 1 de junio de 2026: hoy son 88 días sin datos nuevos"

**FALSO, y es el peor de los tres.** El sistema nunca dejó de reportar: hay dato hasta el
**2026-08-31**, y **55 de los 57 días nuevos tienen generación real**, con picos de **2.115 W**
sobre 2.840 Wp instalados (2026-07-06 09:05).

Lo que estaba desactualizado era **nuestra descarga**, no la planta.

**Y ya costó trabajo ajeno:** Leo respondió *"Vamos a revisar esto"* y el pendiente quedó
registrado a su nombre en [[bloqueantes]] (punto 11). **Hay que avisarle antes de que alguien vaya
a campo a revisar un corte que no existió.**

### 2. "El sensor SP722 registró 18 días, del 11 al 28 de mayo, con 360 lecturas. Es todo el dato que hay si se pensaba usarlo para calibrar"

**FALSO desde el 2026-06-03.** El SP722 volvió a registrar y no paró: son **8.984 lecturas del
2026-05-11 al 2026-08-31**, casi cuatro meses. En los 57 CSV crudos, **8.636 de 8.822 filas**
traen las cuatro columnas del SP722 con valor.

La frase "es todo el dato que hay" era la premisa con la que se **descartó el SP722 como opción de
calibración**. Esa premisa cayó, así que **el descarte se reabre** ([[abiertos]],
[[fuentes-fisicas]]).

### 3. "Cualquier análisis de albedo tiene 7 meses de ventana, no 19"

**VENCIDA, no falsa.** La parte que se sostiene: el piranómetro de reflejada sigue arrancando el
**2025-10-25**, mucho después que el de incidente, y Leo ya explicó por qué (fue una medición
adicional incorporada después). Lo que ya no vale es el **tamaño de la ventana**: con dato hasta el
2026-08-31 son unos **10 meses**, no 7, y la reflejada y el albedo vienen con valor en **las 8.822
filas** de los CSV nuevos.

⚠️ **Hueco:** el conteo exacto de lecturas de `irradiancia_reflejada` y `albedo` en producción
después de la carga **no está medido**. Hay que medirlo antes de escribir una cifra nueva en el
documento corregido.

## Y una cuarta cosa, que no está en el documento pero el equipo tiene que saber

**Los 13 esquemas se terminaron.** Los 57 archivos nuevos comparten **una sola cabecera de 27
columnas**, y **ninguna de sus 8.822 filas viene mezclada** (todas traen los 27 campos). Alguien
estandarizó la salida del logger en algún momento entre el 2026-06-01 y el 2026-06-02.

No es una corrección al documento (ese punto nunca estuvo ahí), es una **buena noticia que conviene
confirmar con quien haya hecho el cambio**: saber si fue deliberado decide si podemos contar con que
siga así. Ver [[schemas-multiples]].

## Qué hay que hacer

1. **Enviar la corrección**, con las tres de arriba y la cuarta como nota. Prioridad sobre
   cualquier otra cosa de esta lista, porque el punto 1 tiene a alguien trabajando en falso.
2. **Medir antes de escribir** la ventana nueva de reflejada y albedo (el hueco de arriba).
3. **Reabrir el SP722 como candidato de calibración** y decir explícitamente que el descarte
   anterior se apoyaba en una ventana que ya no es la real ([[abiertos]]).
4. **Cerrar el punto 11 de [[bloqueantes]]**, que ya no es un pendiente de Leo.

## Por qué pasó, que es lo que hay que no repetir

Ninguna de las tres afirmaciones era un error de medición: **las tres se midieron bien contra la
base**. Lo que falló es que la base estaba al día con **nuestra última descarga** y no con la
planta, y en ningún punto del camino había algo que dijera la diferencia.

Es la misma forma de [[silencio-leido-como-salud]]: **la ausencia de dato nuevo se leyó como
ausencia de generación nueva**, y el número que salió (88 días sin reportar) era plausible,
verificable y falso. La lección operativa concreta está en [[regla-post-carga]]: **antes de
afirmarle a alguien que el sistema está caído, hay que descartar que lo caído sea nuestra copia**.

Relacionado: [[dataset-actual]], [[fuentes-fisicas]], [[gaps-temporales]],
[[schemas-multiples]], [[regla-post-carga]], [[bloqueantes]], [[abiertos]],
[[respuestas-lcv-consultas-agosto]], [[silencio-leido-como-salud]],
[[inversor-sin-acoplar]].
