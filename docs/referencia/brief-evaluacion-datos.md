# Brief tecnico: Sistema de Evaluacion de Datos AgroVoltaic

Fuente funcional: `Evaluación de datos.pdf` (Leonardo Cardinale, 2026-08-28).
Este documento NO lo reemplaza: traduce el PDF a decisiones de implementacion ya
verificadas contra la base de datos real. Si algo choca, manda el PDF y se avisa.

## 1. La decision de fondo

Primero los ALGORITMOS, despues el agente. El valor de un agente aca no esta en el
LLM sino en sus herramientas, y las herramientas son algoritmos. Se construyen
genericos y con contrato de tool desde el dia uno para que el agente futuro los
componga sin reescribir nada. El agente llegara a acompañar a un experto humano:
el experto pide una variable o metrica, el agente elige la tool, trae el dato y
aporta su lectura.

Consecuencia arquitectonica: **los algoritmos viven en Python, en
`agente-historico/src/historico/analitica/`. El frontend no calcula.** Un mismo
numero tiene que salir igual para la consola, para la tool del agente y para el
CLI; si el navegador hiciera su propia cuenta, el experto y el agente podrian
discrepar sobre el mismo dato.

Todo analisis se acota por RANGO DE FECHAS que da el usuario. El rango es
parametro de primera clase, no un filtro opcional.

## 2. La realidad de los datos (verificada, no supuesta)

Consultado sobre la Supabase de produccion el 2026-08-28:

| Relacion | Filas | Desde | Hasta | Dias |
|---|---|---|---|---|
| `monitoreo_sc_electrico` | 36.469 | 2024-11-10 | 2026-06-01 | 274 |
| `radiacion_sc_15s` | 94.868 | 2024-11-10 | 2026-06-01 | 274 |
| `radiacion_sc_poa` | 56.450 | 2025-09-05 | 2026-06-01 | 228 |
| `radiacion_sc_clearsky` | 94.868 | — | — | — |
| `lecturas_ambientales` | 1.126.451 | 2025-11-28 | 2026-08-28 | 162 |

Hechos que cambian el diseño:

1. **El sistema PV dejo de reportar el 2026-06-01.** No hay CSVs pendientes de
   ingestar (confirmado por Izack). El KPI "Ultima actualizacion" debe mostrar esa
   antiguedad como ALERTA de frescura, no como un dato neutro.
2. **274 dias de un calendario de 569.** Huecos grandes: ene-abr 2025 y jul-ago 2025.
3. **`potencia_total_wac` y `energia_total_wh` son NULL al 100% de nov-2025 a
   feb-2026** (4 meses). La columna no vino en el CSV.
4. **La tabla cruda esta contaminada:** `max(potencia_pv1_w)` = 26.503.162 W en un
   arreglo de 1.420 Wp. Son las filas mezcladas del piranometro. **Nunca leer de
   `monitoreo_sc_electrico` para calcular: usar siempre las vistas corregidas.**
5. **`energia_total_wh` va de 182 a 39.328.367 Wh**, imposible para 2,84 kWp en 19
   meses. El acumulador del inversor NO sirve como fuente de energia: hay que
   integrar la potencia corregida (es lo que ya hace `tools/energia.py`).
6. **`lecturas_ambientales` solo tiene 2 variables:** humedad de suelo (5 canales,
   unidad `adc`) e irradiancia (6 canales, unidad `crudo`). **No existe humedad
   relativa, ni temperatura ambiente, ni viento, ni precipitacion** en ninguna
   tabla. Cinco de las nueve pruebas de validez fisica del PDF no tienen dato.
7. **Fliwer (Tabla 2) y nodos ESP32 (Tabla 3) no estan ingestados.** Fuera del
   alcance de esta tanda por decision de Izack.
8. **SI tenemos POA modelada** (`radiacion_sc_poa`: PV1/PV2, frontal y bifacial).
   El PDF dice "No tenemos en los planos del arreglo": la realidad ya lo supero.
   El eje 3 del PDF (uso de la irradiancia, GHI vs POA) SI se puede construir.

### Cobertura REAL por variable (verificada 2026-08-28, contradice la documentacion)

No todas las variables existen en toda la ventana, y las fechas no son las que
`CLAUDE.md` da por buenas. Medido sobre valores no nulos:

| Variable | Desde | Hasta | Lecturas |
|---|---|---|---|
| `irradiancia_incidente` | 2024-11-10 (util 2025-07-01) | 2026-06-01 | 94.868 |
| `irradiancia_reflejada` | **2025-10-25** | 2026-06-01 | 39.822 |
| `albedo` | **2025-10-25** | 2026-06-01 | 39.777 |
| SP722 (las cuatro) | **2026-05-11** | **2026-05-28** | **360** |
| POA (modelada) | 2025-09-05 | 2026-06-01 | 56.450 |

Dos correcciones a lo que el equipo daba por cierto:

1. **El SP722 no esta "desde mayo 2026".** Corrio DIECIOCHO DIAS y se detuvo, con
   360 lecturas en total, y ademas paro tres dias antes que el resto del sistema.
   Cualquier grafico suyo sale vacio para casi cualquier rango que elija el usuario,
   y la razon es que el sensor apenas funciono, no que falten datos.
2. **El piranometro de reflejada se instalo mucho despues que el de incidente.**
   Sin el no hay albedo: todo analisis de albedo tiene siete meses de ventana, no
   diecinueve.

Esto vive en `analitica/catalogo.py` como `dato_desde` / `dato_hasta`, con
`cobertura(*claves)` (la INTERSECCION, porque quien pide varias las quiere cruzar) y
`fuera_de_cobertura(desde, hasta, *claves)`, que devuelve el motivo legible.
Usalos ANTES de consultar: una nube de cero puntos se lee como "no hay correlacion",
y no es lo mismo que "estas dos variables nunca coexistieron".

## 3. LA REGLA QUE NO SE PUEDE ROMPER: los timestamps no son UTC

Las columnas son `timestamptz` etiquetadas `+00`, pero lo guardado es la **hora
local de Costa Rica**. Verificado contra el dato: la irradiancia media pico cae en
la hora 11-12 y se anula en la 5 y la 17, y `ventana_solar` da amanecer 05:26 y
atardecer 17:20 para esas fechas.

**Nunca aplicar `AT TIME ZONE` ni convertir zona.** `extract(hour from timestamp)`
ya devuelve la hora local; filtrar por fecha ISO ya filtra por fecha local. Meter
una conversion corre seis horas todos los perfiles diarios, el heatmap de carpeta
y la comparacion contra la altura solar.

## 4. Vistas de la base que YA existen (usarlas, no reimplementarlas)

- `v_sc_electrico_corregido`: recorta por rango fisico (potencia 0-5000 W, temp
  10-80 C excluyendo el 85 del DS18B20 muerto). **Fuente por defecto de lo electrico.**
- `v_sc_radiacion_corregida`: offset nocturno -38,845 a 0, negativos a 0, y NULL
  antes del 2025-07-01 (la irradiancia previa se descarta por decision del equipo).
- `v_sc_radiacion_calibrada`: lo anterior + `cs_ghi_wm2`, `kt_star`, `qc_ok`, `valido`.
- `v_sc_performance`: potencia + POA + `pr_pv1` / `pr_pv2` ya calculados.
- `lecturas_ambientales_sc`: lecturas ambientales con su dimension resuelta.
- Tablas de apoyo: `ventana_solar` (amanecer/atardecer por dia), `cielo_diario`
  (kt, indice de variabilidad, clase), `hallazgos_calidad`, `diccionario_variables`.

## 5. Contrato compartido (YA ESCRITO: no lo modifiques, usalo)

- `historico.analitica.ventana`: `crear(desde, hasta, granularidad) -> Ventana`,
  `ultimos_dias(n, hasta)`, `VentanaInvalida(codigo, mensaje)`. La ventana es
  `[desde, hasta)` con fin EXCLUSIVO y granularidad `hora|dia|semana|mes`.
- `historico.analitica.resultado`: `metrica(valor, n, unidad, motivo)` y
  `sobre(ventana, confianza, **payload)`.
  **`metrica` con n = 0 devuelve `None`, jamas cero.** Un cero y un "no hay dato"
  se ven igual cuando salen desnudos, y con 4 meses de AC en NULL esa confusion
  convierte el dashboard en una mentira.
- `historico.calidad.contexto.confianza(desde, hasta, variables, fuente)`: el
  bloque de fiabilidad. **Toda metrica que agregue sobre un periodo lo incrusta**,
  pasando las columnas de las que depende (si no, una columna rota ajena condena
  el periodo entero). Va dentro del payload, no al lado.

## 6. Constantes fisicas del sistema

- 1.420 Wp por arreglo (4 x 355 Wp bifaciales); 2.840 Wp total.
- **PV1 = Inclinado** (tilt 20 grados, azimut 150). **PV2 = Vertical** (tilt 90, azimut 50).
- Norte = 0 grados, sentido horario positivo. Zona horaria Costa Rica UTC-6.
- Temperatura de modulo valida: 10-80 C (reemplaza el -10..60 de AgroDash).

## 7. Umbrales EXACTOS del PDF para las pruebas de calidad

Van todos en `calidad/pruebas/umbrales.py`, con nombre, y nunca sueltos en el codigo.

**Completitud:** NaN, NULL, timestamps faltantes, minutos faltantes, parametros
faltantes, dispositivos faltantes.

**Validez fisica:** irradiancia < 0; irradiancia > 1500 W/m2; irradiancia de noche
(contrastar contra la altura solar, usar `ventana_solar`); RH > 100%; RH < 0%;
temperatura ambiente < -5 C; temperatura ambiente > 50 C; viento < 0;
precipitacion < 0.
*Sin fuente hoy: RH, temperatura ambiente, viento, precipitacion. La prueba se
implementa igual y se reporta como `sin_fuente`, no se omite: el hueco tiene que
verse y quedar medido.*

**Consistencia temporal:** timestamps duplicados; intervalos mayores a 2x la tasa
de muestreo esperada; fluctuaciones en las marcas de tiempo.

**Anomalias estadisticas:** salto de temperatura > 3 C entre mediciones; salto de
RH > 15%; salto de irradiancia > 300 W/m2; flatline de 30 mediciones consecutivas;
outlier IQR fuera de [Q1 - 1,5*IQR, Q3 + 1,5*IQR]; ruido excesivo cuando el cambio
absoluto supera media + 6*desviacion absoluta maxima.
Referencia bibliografica del PDF: https://bsrn.awi.de/

### Cadencia: como se deriva (CORREGIDO 2026-08-28, verificado contra la base)

La primera version de este brief decia que `intervalo_original_seg` da la cadencia
fila por fila. **Es falso para lo electrico** y hay que saberlo, porque el error se
paga en pesos de integracion equivocados.

Medido sobre los saltos reales entre filas consecutivas:

- **`monitoreo_sc_electrico` esta remuestreado a 5 min UNIFORMES.** 35.101 de 36.468
  saltos son exactamente 300 s. `intervalo_original_seg` en esas mismas filas va de
  2 a 330 s: guarda la cadencia del CSV ORIGINAL, no la de lo almacenado. Usarla
  como peso le pone 315 s a una fila que cubre 300 s.
- **`radiacion_sc_15s` NO esta remuestreado uniforme.** Los saltos reales son 15, 30,
  45, 60, 75, 300, 315 y 330 s segun la epoca. Y solo octubre 2025 esta de verdad a
  15 s: el nombre de la tabla es el objetivo del resampleo, no lo que contiene.

**La regla, y vale para las dos tablas:**

1. Para INTEGRAR (energia, irradiacion, cualquier magnitud por tiempo): el peso de
   cada fila es el salto real al siguiente registro (`lead(timestamp) - timestamp`),
   **acotado a un techo con nombre**. Sin el techo, el salto nocturno de 40.200 s se
   integra como once horas de generacion. No uses metadatos: el salto real no puede
   mentir sobre lo que la fila cubre.
2. Para medir COMPLETITUD (cuanto dato falta contra lo que deberia haber): la
   cadencia de referencia es la MODA de los saltos reales del periodo, no una
   constante ni `intervalo_original_seg`. Expon la cadencia usada en la salida: sin
   eso, dos periodos con completitud 0,9 pueden estar midiendo contra objetivos que
   difieren en dos ordenes de magnitud y nadie lo nota.
3. `intervalo_original_seg` sirve para UNA sola cosa: saber con que cadencia se
   tomo el CSV de origen (trazabilidad y deteccion de `cambio_de_cadencia`). No es
   la cadencia del dato guardado.

## 8. Metricas y graficos del PDF

**Dashboard (Fig. 2), 9 casillas:** ultima actualizacion; energia total producida
(kWh); energia ultimos 7 dias; energia total Inclinado; energia 7 dias Inclinado;
rendimiento especifico Inclinado (kWh/kWp); energia total Vertical; energia 7 dias
Vertical; rendimiento especifico Vertical.
Los "ultimos 7 dias" se cuentan **contra el ultimo dia CON DATOS**, no contra hoy:
el sistema dejo de reportar en junio y contra hoy saldrian todos en cero.
El PDF deja abierta la unidad de tiempo del rendimiento especifico ("definir
mensual o anual"): se reporta el acumulado del periodo y ademas normalizado por
año, y se deja anotado como duda para el equipo.

**Timeseries:** filtro de calendario inicio/fin; grafico de cantidad de puntos en
el servidor por dia (Fig. 4, completitud); series por variable con linea de
tendencia, media movil y banda de desviacion estandar (Fig. 5).

**Estadistica:** box plots mensuales por variable + barras de irradiacion mensual
(Fig. 6); grafico de crestas comparando distribuciones entre sensores (Fig. 7);
dispersion irradiancia vs potencia con ajuste OLS mostrando ecuacion y R2 (Fig. 8);
heatmaps de carpeta dia-del-año x hora-del-dia (Fig. 8 bis).

**AMBIGUEDAD DEL PDF, decidida y anotada:** la Fig. 7 se describe como "regresion
Ridge" con enlace a la regularizacion de Tikhonov, pero la figura es un **grafico
de crestas (ridgeline / joyplot)** de densidades por sensor coloreadas por
probabilidad de cola, y el codigo de referencia se llama `temp_tail_ridge_plot.py`.
Se implementa lo que muestra la figura (densidades KDE apiladas + probabilidad de
cola + umbral marcado) y se deja la discrepancia registrada para consultarla.

**Ejes de analisis energetico:** (1) comparativo Vertical vs Inclinado: energia
diaria/mensual/anual, curvas de generacion horaria, performance ratio kWh/kWp,
relacion energia-irradiancia, estacionalidad; (2) efecto de la temperatura sobre el
rendimiento; (3) uso de la irradiancia, GHI vs POA. Los ejes 4 a 7 el PDF los marca
"mas adelante" o "no tenemos": fuera de alcance de esta tanda.

## 9. Estandar de codigo

Vale para todos los equipos el documento
`/Users/izack/.claude/agents/frontend-code-architect.md` (secciones 1 a 18): Clean
Code, SOLID, YAGNI, sin magic numbers, manejo explicito de error/carga/vacio, tests
con Given-When-Then y proposito real, limite de referencia de 150 lineas por archivo.

Precisiones para este repo:

- **Identificadores en ingles solo en codigo NUEVO de TypeScript.** El paquete
  Python existente esta integramente en español (`historico`, `energia`, `periodo`)
  y romper esa consistencia a media migracion es peor deuda que la que arregla: el
  codigo Python nuevo sigue en español. Queda anotado como deuda tecnica conocida.
- Prosa, comentarios y textos de UI en español. **Sin rayas em (—) como puntuacion:**
  usar dos puntos, coma o parentesis.
- Sin `Co-authored-by` en los commits.
- Los comentarios explican el PORQUE de lo no obvio, nunca el QUE.
