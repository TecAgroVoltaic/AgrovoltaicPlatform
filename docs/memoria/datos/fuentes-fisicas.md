---
name: fuentes-fisicas
description: Los datos vienen de 3 fuentes físicas (inversor, piranómetros, DS18B20) que muestrean a intervalos distintos; desde jun 2026 se suman dos fuentes abióticas (Fliwer y nodos ESP32) que todavía NO están en el pipeline. La ventana real de cada canal de radiación está medida contra producción, y el 2026-09-01 el SP722 dejó de ser un sensor de 18 días: volvió a registrar el 2026-06-03 y son 8.984 lecturas hasta el 2026-08-31
categoria: datos
actualizado: 2026-09-01
---

# Fuentes físicas de datos

Los CSV combinan lecturas de **3 fuentes** que muestrean a intervalos distintos y a veces
se intercalan mal en un mismo archivo (ver [[filas-mezcladas]]):

1. **Inversor solar** — 2 strings (PV1 y PV2): voltajes, corrientes, potencias, frecuencia,
   voltaje/corriente AC, energía acumulada, temperatura del inversor, código de error.
2. **Piranómetro(s) / celda calibrada** — irradiancia incidente, reflejada, albedo. Los tres
   canales **no arrancan juntos**: ver la ventana real medida abajo. Hay además un segundo sensor
   de referencia modelo **SP722** (5 columnas) que **sí está funcionando**: paró 6 días en junio y
   volvió el 2026-06-03 (ver la corrección del 2026-09-01 abajo).
3. **Sensores de temperatura DS18B20** — `temp1`/`temp2` (luego `temp_vertical`/
   `temp_inclinado`): temperatura del panel en dos orientaciones.

## Ventana real de cada canal de radiación (medido en producción, 2026-08-28)

**Corrección de hechos.** Hasta hoy la memoria decía "un segundo sensor SP722 **desde** may-2026"
y trataba incidente, reflejada y albedo como si existieran en toda la ventana del proyecto. Las
dos cosas son falsas. Medido sobre valores **no nulos** de `radiacion_sc_15s`, por consulta
directa a la Supabase de producción el **2026-08-28** (no es un supuesto ni un conteo sobre los
CSV):

| Canal | Desde | Hasta | Lecturas |
|---|---|---|---|
| `irradiancia_incidente` | 2024-11-10 | 2026-06-01 | 94.868 |
| `irradiancia_reflejada` | **2025-10-25** | 2026-06-01 | 39.822 |
| `albedo` | **2025-10-25** | 2026-06-01 | 39.777 |
| SP722, **las cuatro** columnas (incidente, reflejada, albedo, detector mV) | **2026-05-11** | ~~2026-05-28~~ **2026-08-31** | ~~360~~ **8.984** |

⚠️ **La tabla es del corte del 2026-08-28 y quedó vieja el 2026-09-01**, cuando entraron 57 CSVs
más ([[dataset-actual]]). La fila del SP722 ya está corregida arriba con lo medido. **Las otras
tres filas todavía no se volvieron a medir**: las fechas "hasta" y los conteos de
`irradiancia_incidente`, `irradiancia_reflejada` y `albedo` son del corte viejo y **hay que
re-medirlos antes de citarlos**. Lo que sí se sabe de los CSV crudos nuevos es que **las 8.822
filas traen reflejada y albedo con valor**, así que los tres canales siguen vivos hasta el
2026-08-31.

Qué cambia con esto:

- ~~**El SP722 no está "desde mayo 2026".** Corrió **18 días**, dejó **360 lecturas**, y validarlo
  contra el piranómetro viejo tiene **18 días de ventana útil**: ese es todo el presupuesto de datos
  que existe, si alguien pensaba usarlo para calibrar.~~ **FALSO desde el 2026-09-01**, ver abajo.
- **El piranómetro de reflejada se instaló mucho después que el de incidente.** Sin reflejada no
  hay albedo, así que **todo análisis de albedo tiene 7 meses de ventana, no 19**.

### Por qué son tan cortas: Leo lo explicó el 2026-08-30

Se le reportaron los dos hechos y respondió que el SP722 *"esta bien, lo que pasa es que fue una
medicion adicional que se incorporo"*, y sobre el piranómetro de reflejada, *"misma situacion que
el anterior"* ([[respuestas-lcv-consultas-agosto]]).

O sea: **no son un fallo del sistema, son instrumentación agregada después.** Eso cierra la
pregunta de si había que buscar dato perdido en algún lado. ~~Pero no agranda la ventana: los 18
días del SP722 y los 7 meses de albedo siguen siendo todo el presupuesto disponible.~~ **Esa última
frase quedó falsa el 2026-09-01**, y por el motivo más simple: había más dato, no lo habíamos
descargado.

## El SP722 no corrió 18 días: corrección del 2026-09-01

Con los 57 CSVs nuevos ingestados ([[dataset-actual]]), medido contra producción:

| | Se creía (2026-08-28) | Se midió (2026-09-01) |
|---|---|---|
| Ventana del SP722 | 2026-05-11 a 2026-05-28 | **2026-05-11 a 2026-08-31** |
| Lecturas | 360 | **8.984** |
| Duración | 18 días | **casi cuatro meses** |

El sensor **paró el 2026-05-28 y volvió el 2026-06-03**, y desde entonces no se detuvo. En los CSV
crudos nuevos, **8.636 de 8.822 filas** traen las cuatro columnas del SP722 con valor.

**Consecuencia directa, y es la que importa:** el SP722 se había descartado como opción de
calibración **por ventana insuficiente**, y ese argumento ya no existe. Casi cuatro meses de
solape contra el piranómetro viejo son un presupuesto de datos razonable para comparar
`irradiancia_incidente` contra `Irradiancia_incidente_SP722` y `albedo` contra `Albedo_SP722`.
**El pendiente se reabre** ([[abiertos]], [[irradiancia-sin-calibrar]]).

Y la frase del documento del equipo *"es todo el dato que hay si se pensaba usarlo para calibrar"*
quedó falsa y hay que corregirla ([[correccion-al-equipo]]).

Regla que se deriva: antes de consultar hay que preguntar si las variables pedidas
**coexistieron** en el rango. Una nube de cero puntos se lee como "no hay correlación", y no es lo
mismo que "estas dos variables nunca convivieron". Ver [[silencio-leido-como-salud]].

## Fuentes abióticas (nuevas, jun 2026): fuera del pipeline

El doc de evaluación de datos ([[catalogo-metricas-evaluacion]]) define **dos fuentes más**,
en tablas propias. **Ninguna de las dos pasa hoy por el ETL ni vive en Supabase**: los CSV de
arriba son solo las tres fuentes de la Raspberry Pi. Variables detalladas en
[[diccionario-variables]] (Tablas 2 y 3).

4. **Fliwer** (Tabla 2), procesa el propio equipo Fliwer: temperatura ambiente, humedad del
   aire, luminosidad (lux), humedad del suelo (`water %`), conductividad eléctrica (µS) y
   batería (%), con **dos estampas de tiempo** (`measure time` y `measure time CR`, hora de
   Costa Rica). Sube **manual** a la nube, batería de unas 2 semanas (ver [[metodologia]]).
5. **Nodos abióticos ESP32** (Tabla 3), fabricados por el equipo: radiación PAR estimada con
   fotodiodo (`ppfd_umol`, `iphoto_uA`, `n_samples`), temperatura y humedad ambiental
   (**DHT22**), y suelo por **SEN0600 DFRobot** por RS485 (temperatura, humedad cruda y
   calibrada, EC) más un capacitivo de bajo costo (`analog_hum_pct`, **SKU 000538**).

⚠️ **Dónde viven esos archivos es un pendiente**, no un dato conocido: los Fliwer están en una
carpeta de SharePoint del TEC (Wayner Montero) y los nodos suben a Google Drive. Ver
[[pendientes-evaluacion-datos]].

Relacionado: [[dataset-actual]], [[correccion-al-equipo]], [[abiertos]],
[[respuestas-lcv-consultas-agosto]], [[diccionario-variables]], [[catalogo-metricas-evaluacion]], [[metodologia]],
[[pendientes-evaluacion-datos]], [[irradiancia-sin-calibrar]], [[temperatura-85]],
[[schemas-multiples]], [[muestreo-variable]], [[silencio-leido-como-salud]],
[[verificacion-numeros]].
