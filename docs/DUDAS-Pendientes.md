# DUDAS Pendientes - Monitoreo AgroVoltaic SC

**Fecha:** 2026-05-22  
**Estado:** Todas pendientes  
**Contexto:** Preguntas que deben resolverse antes o durante la estandarizacion de datos. Sin estas respuestas, varias decisiones del pipeline quedan bloqueadas o se hacen con supuestos que pueden estar mal.

---

## Bloque A: Informacion del sitio (BLOQUEANTES)

Estas dudas bloquean la calibracion de irradiancia y el calculo de Performance Ratio. Son la prioridad maxima.

### 1. Ubicacion exacta de la instalacion
**Pregunta:** Cual es la latitud y longitud del sistema agrovoltaico en Santa Cruz?  
**Por que importa:** pvlib necesita las coordenadas para calcular la posicion solar (elevacion, azimut) y la irradiancia clear-sky teorica en cualquier momento del dia. Sin esto, no se puede calibrar el piranometro ni calcular el Clear Sky Index.  
**Alternativa si no se tiene:** Usar coordenadas aproximadas del area general de Santa Cruz, pero esto introduce error en el calculo solar, especialmente en el angulo de elevacion.

### 2. Capacidad instalada (kWp)
**Pregunta:** Cual es la potencia pico instalada del sistema? Desglosada por string si es posible (kWp de PV1 y kWp de PV2).  
**Por que importa:** El Performance Ratio y el Specific Yield se calculan dividiendo la produccion real entre la capacidad instalada. Sin este dato, esos indicadores no se pueden calcular.  
**Dato relacionado:** La potencia maxima observada en los datos es ~1,600W (pac_total en May 2025). Esto sugiere un sistema de ~2 kWp, pero es solo una estimacion.

### 3. Modelo y marca del inversor
**Pregunta:** Que inversor se usa? Tiene 1 o 2 entradas MPPT (Maximum Power Point Tracking)?  
**Por que importa:** En el periodo Dic 2024 - May 2025, las columnas vpv2/ipv2/pv2_watt desaparecen. Si el inversor tiene 2 MPPT, la desaparicion de PV2 indica un problema de software/monitoreo (los datos se perdieron pero PV2 seguia generando). Si tiene 1 MPPT, PV2 quiza nunca estuvo conectado y fue agregado despues. Esto cambia como interpretamos pac_total en ese periodo.

### 4. Timezone de los timestamps
**Pregunta:** Los timestamps en los CSV estan en hora local de Bolivia (UTC-4) o en UTC?  
**Por que importa:** Para calcular la posicion solar correctamente, pvlib necesita timestamps en UTC o con timezone explicito. Si los timestamps son hora local sin indicador, hay que agregarle `tz='America/La_Paz'` antes de cualquier calculo solar. Un error de 4 horas en la posicion solar invalida toda la calibracion de irradiancia.  
**Pista:** Si la irradiancia medida tiene su pico alrededor de las 12:00-13:00 en los datos, es probable que sea hora local.

---

## Bloque B: Sensores e instrumentacion

### 5. Modelo del piranometro principal
**Pregunta:** Que modelo de piranometro se uso para medir irradiancia? Es termopila o fotodiodo? Cual es su sensibilidad en mV/(W/m2)?  
**Por que importa:** Los valores de irradiancia en los datos de Nov 2024 - Sep 2025 van desde -5,826 hasta +15,236. Estos valores son fisicamente imposibles en W/m2 (el maximo real es ~1,361 W/m2 extraterrestre). Esto significa una de dos cosas:
  - **a)** Los datos estan en unidades crudas (mV) y necesitan conversion: `W/m2 = mV / sensibilidad`
  - **b)** La conversion se hizo pero con un factor incorrecto

Si el sensor es un termopila tipico con sensibilidad ~0.04 mV/(W/m2), y los picos son ~6,800, entonces: `6800 * 0.04 = 272 mV`, lo cual es demasiado alto para un piranometro. Esto no cuadra.

Otra posibilidad: que los datos ya esten en un formato intermedio (cuentas ADC, no mV ni W/m2) y necesiten una doble conversion.

**Sin saber el modelo exacto:** Se puede intentar una calibracion empirica usando pvlib clear-sky como referencia (ver TODO Paso 5b), pero el resultado tendra incertidumbre desconocida.

### 6. Modelo del piranometro SP722
**Pregunta:** El sensor SP722 que aparece en Mayo 2026, es un Apogee SP-722? Es un piranometro de referencia para calibrar el principal?  
**Por que importa:** Si el SP722 es un sensor calibrado de fabrica, sus lecturas pueden servir como "verdad" para corregir el piranometro principal. Los datos de May 2026 tienen ambos sensores en paralelo — ese es el periodo de validacion cruzada.

### 7. Que miden temp_vertical y temp_inclinado?
**Pregunta:** Los sensores de temperatura (temp1/temp2, luego renombrados a temp_vertical/temp_inclinado), que miden exactamente? Temperatura del panel? Temperatura ambiente? Temperatura del suelo?  
**Por que importa:** Los nombres sugieren dos orientaciones del panel (vertical e inclinado), lo cual implicaria que son **temperaturas de modulo** (back-of-module). Pero tambien podrian ser temperaturas ambiente a dos alturas o posiciones.

Si son temperaturas de modulo → se usan para calcular PR corregido por temperatura y para estimar perdidas termicas.

Si son temperaturas ambiente → se usan para modelar condiciones climaticas pero no para correccion de PR.

**Pista:** Los valores tipicos observados (21-27 C en Nov 2024) son bajos para temperatura de modulo bajo irradiancia (un panel al sol facilmente llega a 45-60 C). Esto sugiere que podrian ser temperatura ambiente, no de modulo.

### 8. Se cambio o recalibro el piranometro principal?
**Pregunta:** El piranometro principal se cambio, recalibro, o ajusto en algun momento? Especificamente:
  - Alrededor de Oct 2025 (cuando la columna cambia de `irradiancia` a `irradiancia_incidente` y se agrega `irradiancia_reflejada`)
  - Alrededor de Mar 2026 (cuando el schema se estabiliza y los valores parecen mas coherentes)

**Por que importa:** Si el sensor cambio, el factor de calibracion de antes del cambio no aplica despues (y viceversa). Habria que calibrar cada periodo por separado.

---

## Bloque C: Arquitectura del sistema de monitoreo

### 9. Que sistema recolecta los datos?
**Pregunta:** Los datos se recolectan con un datalogger? Un microcontrolador (ESP32, Raspberry Pi)? Un sistema SCADA? Es software propio o de terceros?  
**Por que importa:** Explica muchas de las inconsistencias:
  - Los 13 schemas distintos sugieren que alguien edita el codigo de recoleccion frecuentemente
  - Las filas intercaladas de inversor y sensor sugieren que el sistema tiene dos fuentes que escriben al mismo archivo CSV sin sincronizacion
  - El Schema 8 (snake_case de 2 dias) parece un intento de normalizacion que alguien hizo y luego revirti
  - El cambio de intervalos (2s → 5min) sugiere cambios en la configuracion del logger

### 10. Por que hay dos tipos de fila en el mismo CSV?
**Pregunta:** Es intencional que las lecturas del inversor y del piranometro se mezclen en el mismo archivo? O es un bug del sistema de recoleccion?  
**Por que importa:** Si es intencional, el sistema esta disenado para que el inversor y el sensor reporten a intervalos distintos y ambos se escriban al mismo archivo. Si es un bug, los datos del sensor en las filas cortas podrian estar duplicados o desincronizados.

**Observacion:** En Mar 2026+, el problema desaparece y todas las filas tienen la misma estructura. Esto sugiere que se corrigio el sistema de recoleccion. Confirmar si fue un fix intencional.

### 11. Que significan los archivos con sufijo (1)?
**Pregunta:** Los archivos como `Monitoreo_2025-05-04(1).csv` (368 bytes, ~5 filas) junto a `Monitoreo_2025-05-04.csv` (24,786 bytes, ~300 filas), que son? Descargas parciales? Archivos de otro sensor? Backups?  
**Por que importa:** Si son fragmentos del mismo dia, podrian contener datos que faltan en el archivo principal. Si son descargas fallidas, se pueden ignorar. Si son de otro sensor o ubicacion, incluirlos corromperia el dataset.

---

## Bloque D: Definicion de variables

### 12. Potencia total: Wac o VA?
**Pregunta:** La columna de potencia total aparece como `Potencia total [Wac]` en algunos schemas y `Potencia total [VA]` en otros. Cual es correcta?  
**Por que importa:** Wac (watts activos) y VA (volt-amperes aparentes) son magnitudes distintas. La relacion es: `Wac = VA * factor_de_potencia`. Para un inversor fotovoltaico tipico, el factor de potencia es ~0.99, asi que la diferencia practica es minima, pero conceptualmente son distintas. Si el inversor reporta en VA, el calculo de PR y eficiencia se debe hacer con VA, no con Wac.

### 13. Energia PV1 y Energia PV2: que representan?
**Pregunta:** Las columnas `Energìa PV1` y `Energìa PV2` (luego `energia_pv1_wh`, `energia_pv2_wh`), son la energia generada por cada string (acumulada por dia? total historica?) o son algo distinto?  
**Por que importa:** En el Schema 6 (el mas comun), estas columnas estan **casi siempre vacias**. Pero en schemas anteriores tienen valores como 1.3, 3.0, 4, etc. que parecen ser kWh acumulados del dia. Si son acumulados del dia, son redundantes con `energia_hoy_wh` (que seria la suma de ambas). Si son acumulados totales, cada una deberia crecer monotonicamente.

### 14. El albedo calculado es correcto?
**Pregunta:** La columna `albedo` (= irradiancia_reflejada / irradiancia_incidente) muestra valor 0 constantemente en Oct 2025, incluso cuando ambas irradiancias tienen valores. Por que?  
**Por que importa:** Si el calculo de albedo se hace en el sistema de monitoreo y tiene un bug, habria que recalcularlo. Si es porque `irradiancia_incidente` es negativa (como vimos, -38.84) y el sistema pone 0 cuando el cociente es negativo, entonces el albedo se podra calcular correctamente una vez que la irradiancia este calibrada.

---

## Bloque E: Operacion del sistema

### 15. Hubo cambios fisicos en la instalacion?
**Pregunta:** Hubo algun cambio fisico durante Nov 2024 - May 2026? Por ejemplo:
  - Se agrego o quito un string de paneles (PV2)
  - Se cambio el inversor
  - Se agregaron sensores (el SP722 en May 2026 es evidente, pero hubo otros?)
  - Se reorientation los paneles
  - Se cambiaron cables o conexiones de sensores de temperatura

**Por que importa:** La desaparicion de PV2 entre Dic 2024 y May 2025, la aparicion de irradiancia reflejada en Oct 2025, y los sensores de temperatura fallando en 85.0 durante meses sugieren cambios fisicos o fallos de hardware que afectan la interpretacion de los datos.

### 16. Que paso durante los gaps de 126 y 71 dias?
**Pregunta:** Los periodos sin datos (Ene-Abr 2025 = 126 dias, Jul-Ago 2025 = 71 dias), el sistema estaba apagado? Los datos se perdieron? Nunca se recolectaron?  
**Por que importa:** Si el sistema estaba operando pero los datos no se guardaron, se perdio informacion irrecuperable. Si el sistema estaba apagado (mantenimiento, construccion), los gaps son esperables. Si los datos existen en otro formato o ubicacion, se podrian recuperar.

### 17. Hay otros datos del sistema que no estan en estos CSV?
**Pregunta:** Existe algun otro dashboard, base de datos, o sistema donde se almacenen datos de este proyecto agrovoltaico? Por ejemplo: datos agricolas (rendimiento de cultivos, humedad del suelo), datos meteorologicos de una estacion cercana, datos del inversor en su propia plataforma cloud (SolarMAN, Growatt, etc.)?  
**Por que importa:** Si el inversor tiene su propia plataforma cloud, los datos de energia podrian verificarse contra esa fuente. Si hay datos agricolas, se podrian correlacionar con la irradiancia y el sombreo de los paneles (analisis agrovoltaico propiamente dicho).

---

## Resumen de prioridades

| # | Duda | Bloquea | Prioridad |
|---|---|---|---|
| 1 | Lat/Lon | Calibracion irradiancia, clear-sky, PR, NASA POWER | **CRITICA** |
| 2 | kWp instalados | Performance Ratio, Specific Yield | **CRITICA** |
| 4 | Timezone | Toda la calibracion solar | **CRITICA** |
| 5 | Modelo piranometro | Calibracion irradiancia | **ALTA** |
| 3 | Modelo inversor (1 o 2 MPPT) | Interpretacion de datos PV2 faltantes | **ALTA** |
| 7 | Que miden temp1/temp2 | PR corregido por temperatura | **ALTA** |
| 10 | Filas mezcladas: bug o intencional | Estrategia de separacion | **MEDIA** |
| 12 | Wac vs VA | Calculo de PR | **MEDIA** |
| 16 | Que paso en los gaps | Contexto pero no bloquea | **BAJA** |
| Resto | 6,8,9,11,13,14,15,17 | Contexto y validacion | **BAJA** |
