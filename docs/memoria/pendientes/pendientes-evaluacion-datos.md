---
name: pendientes-evaluacion-datos
description: Lo que el doc de evaluación de datos (2026-08-28) pide y todavía no tenemos; sensores bifaciales traseros, viento y precipitación, temperatura ambiente propia, y dónde viven realmente los datos Fliwer y de nodos ESP32. La POA salió de esta lista: existe modelada, verificado contra producción el 2026-08-28
categoria: pendiente
actualizado: 2026-08-30
tags: [pendientes, evaluacion-datos, poa, bifacial, fliwer, esp32, datos-faltantes]
---

# Pendientes que abre el doc de evaluación de datos

Del doc `Evaluación de datos.pdf` (2026-08-28) de Leonardo Cardinale. Catálogo completo en
[[catalogo-metricas-evaluacion]], pruebas en [[pruebas-calidad-umbrales]], gráficos en
[[graficos-evaluacion]].

Se separa de [[bloqueantes]] (que depende de terceros) y de [[abiertos]] (que depende de
nosotros) porque acá hay de las dos cosas y todo viene del mismo documento.

## Datos que el doc asume y no tenemos

### 1. POA (Plane of Array Irradiance) · ~~pendiente~~ **RESUELTO por modelo**
El eje 3 pide comparar **GHI vs POA** y el doc anota literalmente **"No tenemos en los planos del
arreglo"**. Cuando se escribió este archivo se dio esa frase por vigente. **No lo es**, y esta
memoria tenía dos verdades a la vez: la POA **modelada** ya existe en la base desde la v0.4 del
ETL, tabla `radiacion_sc_poa` (PV1/PV2, frontal y bifacial, **56.450 timestamps desde
2025-09-05**, transposición con `pvlib` sobre la geometría de [[geometria-sistema]], ver
[[implementacion]]). Comprobado por consulta directa a producción el **2026-08-28**.

Lo que queda no es conseguir POA: es una **decisión**. Es estimación y no medición, y hay que
declararlo en cada resultado que la use. Solo la POA **medida** con un sensor en el plano del
arreglo sigue sin existir, y nadie ha pedido instalarlo.

### 2. Sensores bifaciales traseros · lo dice el propio doc
El eje 5 se titula *"Simetría de generación en paneles bifaciales"* y el doc le agrega
**"no tenemos en ambos planos"**. Los paneles **sí son bifaciales** (confirmado, ver
[[geometria-sistema]]) pero no hay medición de la cara trasera. El propio doc da la salida:
*"En ausencia de sensores traseros, puedes usar modelos para estimar aporte bifacial según
configuración y condiciones del suelo"*.

Insumo que sí tenemos y sirve: el **albedo** medido (incidente y reflejada). ⚠️ Con dos límites
medidos el 2026-08-28: el albedo **no existe antes del 2025-10-25** (el piranómetro de reflejada
se instaló mucho después que el de incidente), o sea **7 meses de ventana y no 19**; y
`Albedo_SP722` tiene **360 lecturas en 18 días** (2026-05-11 a 2026-05-28), que es todo el
presupuesto disponible si se quisiera usar como referencia. Ver [[fuentes-fisicas]].

**Decisión pendiente:** ¿se instala un sensor trasero (es una compra y una intervención en
campo) o se acepta la estimación por modelo? La respuesta cambia si el eje 5 es entregable o
solo indicativo.

### 3. Velocidad del viento y precipitación · el doc NO lo dice, lo detectamos nosotros
Dos de las nueve pruebas de validez física son **viento < 0** y **precipitación < 0**, y el
ejemplo del resumen estadístico mensual (Fig. 6) incluye un panel de **WS (m/s)**.

Ninguna de las tres tablas de variables del propio documento (Tabla 1 PV, Tabla 2 Fliwer,
Tabla 3 nodos ESP32) contiene viento ni precipitación. **No los medimos.**

Tres opciones, todas sin decidir:
- Declarar esas dos pruebas y ese panel **fuera de alcance** y dejarlo escrito.
- Traerlos de una fuente externa (NASA POWER ya está en el radar del proyecto; Open-Meteo ya
  está integrado como addon NWP apagado, ver [[abiertos]]).
- Instalar los sensores.

### 4. Temperatura ambiente en el sitio, distinta a la de los cultivos
El propio doc lo plantea como pregunta abierta al final: *"¿Se podría incluir una medición de
temperatura ambiente en el sitio diferente a la que está en los cultivos?"*.

Hoy la única temperatura ambiente disponible viene de los sensores **entre los cultivos**
(Fliwer `temperature (ºC)`, ESP32 `dht_temp_C`), que es justamente lo que la pregunta señala
como problema: esa temperatura ya está afectada por el microclima del arreglo, así que no
sirve como referencia neutra. Las temperaturas del corpus PV son de **módulo e inversor**, no
de ambiente.

Es una pregunta de **instrumentación** dirigida al equipo de campo, no algo que se resuelva
con software.

## Dónde viven los datos de las fuentes nuevas

El doc incorpora en junio 2026 dos fuentes abióticas que **no están en el pipeline ETL** ni en
Supabase (ver [[fuentes-fisicas]] y [[diccionario-variables]]):

### Fliwer (Tabla 2)
El doc dice: *"Datos compartidos por Wayner en Marzo 2025"*, con *"los datos de los Fliwer
hasta la fecha (del 2024 y 2025)"*. El enlace del PDF apunta a una carpeta de **SharePoint del
TEC**, en el OneDrive personal de `wmontero_itcr_ac_cr` (Wayner Montero):

```
https://tecnube1-my.sharepoint.com/:f:/g/personal/wmontero_itcr_ac_cr/IgDkmkxSh7FPRZ6Fm0KbCijB...
```

Un segundo enlace del mismo origen apunta a *"Imágenes AgriVoltaic"*:

```
https://tecnube1-my.sharepoint.com/:f:/g/personal/wmontero_itcr_ac_cr/IgApYKC2bejKR4re2L1cHBBE...
```

**Pendiente:** conseguir acceso (probablemente requiere cuenta ITCR o que Wayner comparta la
carpeta) y decidir si esos CSV entran al pipeline o se tratan aparte.

⚠️ Ojo con el solape: el [[agente-historico-calidad]] ya trabajó con **4 dispositivos
`fliwer` de Joshua** que solapan **1.938 de 3.302 horas** con radiación (59 %). No está
confirmado si son los mismos datos que los de Wayner, un subconjunto, o dos entregas
distintas. Hay que verificarlo antes de duplicar.

### Nodos abióticos ESP32 (Tabla 3)
El doc define las 11 variables (ver [[diccionario-variables]]) pero **no dice dónde están los
archivos**. Por [[metodologia]] sabemos que los nodos suben por WiFi a **Google Drive**, con
opción LoRa a un gateway en la Raspberry Pi.

**Pendiente:** ubicar la carpeta, saber si ya hay datos acumulados o si es instrumentación
recién montada, y confirmar el formato.

## Decisiones de alcance que el doc deja abiertas

- **Unidad de tiempo del Rendimiento Específico** (mensual o anual): el doc dice
  explícitamente *"Definir la unidad de tiempo a utilizar"*. Nadie la definió.
- ~~**Qué columna es la "energía total producida"** oficial: acumulador del inversor,
  `energia_hoy`, o integral de potencia.~~ **RESUELTO el 2026-08-30 por Leo: es AC**, de
  `energia_hoy_wh` o `energia_total_wh` ([[respuestas-lcv-consultas-agosto]],
  [[catalogo-metricas-evaluacion]]).
- **Prioridad de construcción de los algoritmos**: [[algoritmos-antes-que-agente]] fija el
  orden general (algoritmos antes que agente) pero no el orden interno.
- **Las 8 ambigüedades de umbrales** de [[pruebas-calidad-umbrales]] y las 7 de
  [[graficos-evaluacion]]: son preguntas para el autor del documento, no para resolver por
  nuestra cuenta.
- **`DataMining`**: aparece en la arquitectura y nunca se desarrolla. Sin contenido.

## Lo que YA se le preguntó al equipo (2026-08-28) y volvió respondido (2026-08-30)

> **Actualización 2026-08-30.** Leo Cardinale devolvió el documento anotado. **Las tres consultas
> de abajo están cerradas salvo una pregunta derivada**, que es la ecuación de transposición y la
> confirma Hugo. Decisiones, citas verbatim y qué cambia en la implementación:
> [[respuestas-lcv-consultas-agosto]]. La lista de abajo queda como registro de lo que se preguntó
> y por qué; el resultado de cada una está anotado en su punto.
>
> Además, de las cinco **decisiones de alcance** de la sección anterior, la de **qué columna es la
> energía total producida** queda resuelta: es **AC**, de `energia_hoy_wh` o `energia_total_wh`
> ([[catalogo-metricas-evaluacion]]). Las otras cuatro siguen abiertas, incluida la **unidad de
> tiempo del Rendimiento Específico**, que Leo no tocó: lo que sí definió es la unidad del
> **Performance Ratio** (día y mes), que es otra métrica.
>
> Y de los dos hechos reportados sobre ventanas cortas (SP722 de 18 días, piranómetro de reflejada
> desde el 2025-10-25), Leo confirmó que **son mediciones adicionales incorporadas después**, no un
> fallo. Eso no agranda la ventana: sigue siendo el presupuesto disponible para el eje 5
> ([[fuentes-fisicas]]).


Salió el documento `docs/equipo/consultas-sobre-la-data.pdf` (y su `.txt`) con **tres consultas
para el grupo**, más tres hechos de contexto. Redactado en impersonal y sin dar por sabido nada
del stack, porque lo leen personas que no trabajan en el código.

Las tres, y por qué cada una necesita respuesta antes de seguir:

1. **El emparejamiento del Performance Ratio**, con la evidencia mes a mes. Es la que más pesa:
   cambia cuál de los dos arreglos rinde más, que es el eje 1 del doc. La migración está escrita y
   **no se aplica hasta que Leo y Hugo confirmen** ([[emparejamiento-por-timestamp]]).
   → **2026-08-30: cerrada cambiando la pregunta.** El PR pasa a ser **diario y mensual**, con los
   acumuladores de energía contra la radiación integrada del día. Derivada abierta: **cuál ecuación
   de transposición**, la confirma Hugo ([[bloqueantes]]).
2. **`voltaje_vac = 0`**: si cuenta como valor válido (inversor sin exportar) o como error de
   medición. Define el veredicto de **238 días** ([[store-hallazgos-calidad]]).
   → **2026-08-30: cerrada. Es dato válido.** El rango 100-280 V se retira y entra una prueba de
   **disponibilidad del equipo**, cuya forma quedó cerrada y medida el **2026-08-31**
   ([[inversor-sin-acoplar]]). ⚠️ Ojo con la frase "define el veredicto de 238 días": era la
   pregunta tal como se hizo, pero la atribución causal resultó **falsa**, porque quitar el rango
   deja el veredicto igual ([[store-hallazgos-calidad]]).
3. **Si la energía del tablero es continua o alterna.** Sin eso, "energía total producida" sigue
   sin tener una columna oficial, que es la ambigüedad 3 de [[catalogo-metricas-evaluacion]].
   → **2026-08-30: cerrada. Es AC**, de `energia_hoy_wh` o `energia_total_wh`.

Material de respaldo del mismo día: un documento web con la evidencia completa del hallazgo del
emparejamiento (https://claude.ai/code/artifact/733783d8-9789-47dd-8406-72ead07787c0) y el brief
técnico que leyeron todos los equipos, `docs/referencia/brief-evaluacion-datos.md`.

## Higiene de repositorio

El PDF vive en la **raíz del repo** (`Evaluación de datos.pdf`). Los demás documentos fuente
del equipo viven en `docs/referencia/` (donde ya está la versión `.docx` anterior,
`Evaluacion-de-datos.docx`). Conviene moverlo ahí para que no se pierda, y dejar claro cuál de
los dos es la versión vigente (**el PDF de 2026-08-28**).

Relacionado: [[respuestas-lcv-consultas-agosto]], [[inversor-sin-acoplar]],
[[catalogo-metricas-evaluacion]], [[pruebas-calidad-umbrales]],
[[graficos-evaluacion]], [[algoritmos-antes-que-agente]], [[bloqueantes]], [[abiertos]],
[[geometria-sistema]], [[fuentes-fisicas]], [[diccionario-variables]], [[metodologia]],
[[agente-historico-calidad]], [[implementacion]], [[silencio-leido-como-salud]],
[[emparejamiento-por-timestamp]], [[store-hallazgos-calidad]], [[capa-analitica]].
