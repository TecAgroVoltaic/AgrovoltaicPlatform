---
name: comparador
description: El Comparador (control de calidad determinista del historico PV + caracterizacion del cielo) implementado el 2026-08-24; incluye los tres bugs que se encontraron corriendolo y por que importan
categoria: proyecto
actualizado: 2026-08-24
tags: [comparador, calidad, nubes, kt, agentes]
---

# Comparador (agente-comparador/)

Los cuatro puntos que pidio Isaac por WhatsApp el 2026-08-21 (calidad de sensores, alertas de
inconsistencia, criterios estadisticos de nubes, variables que afectan la irradiancia) son
exactamente el **Comparador** que ya preveia [[capa-agentes]]: deteccion determinista, store de
hallazgos propio, y el LLM solo narrando por encima.

Alcance decidido con el usuario: **San Carlos PV primero** (`radiacion_sc_15s` +
`monitoreo_sc_electrico`), alerta = **tabla de hallazgos + reporte**, y el punto 4 primero como
**estudio** y despues como capacidad diaria.

## Lo que descubrieron los datos, antes de escribir codigo

- **El logger solo graba de dia.** Los dias sanos cubren 11,5 a 12,7 h. Por eso "el dia esta
  completo" se mide contra las **horas de sol** (tabla `ventana_solar`, pvlib) y no contra 24 h.
  `radiacion_sc_clearsky` NO sirve para eso: solo tiene timestamps donde ya hay dato.
- **El nombre `radiacion_sc_15s` engaña**: el regimen real dominante es de 5 minutos (196 de
  274 dias). Hay 33 cadencias distintas en el historico.
- **Cero timestamps duplicados y cero nulos de fila** en radiacion: el ETL ya deduplico. El
  problema de completitud es otro (cobertura: 274 dias con datos de 569 de calendario, 48 %).

## Las tres trampas que costaron una corrida cada una

**1. El VI medía la cadencia del logger, no el cielo.** El indice de variabilidad esta definido
para un intervalo FIJO. Calculado sobre las muestras crudas daba VI 4,15 con cadencia de 315 s
y **VI 23,81 con cadencia de 42 s para el mismo kt**. El numerador no encoge al afinar el
muestreo (el ruido de nubes es de alta frecuencia) pero el denominador si (el cielo despejado
es suave). Arreglo: calcularlo sobre **rejilla uniforme de 5 min**. Despues del arreglo los tres
regimenes dan 4,44 / 4,18 / 3,50.

**2. Los kt imposibles se disfrazaban de dia soleado.** Incluir las muestras con kt > 1,2 en el
promedio diario daba `kt_medio` = **5,67**, o sea cinco veces la energia del cielo despejado
como caracteristica del dia. Se excluyen de la estadistica y se cuentan aparte como hallazgo.
Con eso el kt maximo diario real es 0,83: **en San Carlos no hay un solo dia completamente
despejado**, y eso ahora es un hallazgo creible y no un artefacto.

**3. "Sensor plano" eran tres cosas distintas.** De 307 casos, ninguno era un sensor trabado:
129 estaban clavados en **85** (DS18B20 desconectado, ya cubierto por `saturado_85`) y 178 en
**0** (el inversor no genero ese dia, que es un hecho operativo, no una averia). Se separaron en
`saturado_85`, `constante_en_cero` (aviso) y `sensor_plano` (grave, solo si el valor constante
no es ninguno de esos dos). Hoy `sensor_plano` no aparece ni una vez.

Bonus: una columna con TODAS las filas en NULL no es "faltan datos", es que la columna no vino
en el CSV. Es el problema de los 13 esquemas y se arregla en el ETL, asi que se llama
`columna_ausente` y no `nulos`.

Y un bug de coordinacion: el barrido borraba el rango completo por fuente antes de reinsertar,
y se llevaba puesto el `kt_imposible` que escribe `cielo.py` sobre la misma fuente. **En
silencio**: el resumen de la corrida seguia dando los mismos numeros. Ahora el borrado se acota
a `TIPOS_PROPIOS`.

## Umbrales calibrados, no importados

`VI_VARIABLE = 6.0`. Medido sobre los 228 dias: min 0,76 · p25 3,09 · mediana 4,29 · p75 5,62 ·
p95 7,29 · max 9,33. El 3,0 que suele citarse es para datos de 1 minuto y etiquetaba al 77 % de
los dias como "variable", o sea que no distinguia nada. Hay un test que lo fija: si alguien lo
baja sin volver a medir la distribucion, la prueba se lo dice.

## Estado del historico segun el barrido (2026-08-24)

274 dias analizados por fuente. Cobertura 48 % del calendario. Cielo: 18 despejados, 113
parciales, 61 cubiertos, 36 variables; la irradiancia medida fue el **51 % de la de cielo
despejado** (kt medio 0,462: sitio muy nuboso, coherente con lo que ya decia el forecaster).

Lo mas grave: `fuera_de_rango` en 256 dias y 11 variables, `columna_ausente` en 140 dias y 12
variables, `saturado_85` en 117 dias. Y **`kt_imposible` en 82 de los 228 dias
caracterizados**, que dice algo incomodo sobre la calibracion de la irradiancia: ver
[[irradiancia-sin-calibrar]].

## En la consola (2026-08-24)

Vista **«Calidad de datos»** en el mvp-debugger, transversal (no de un agente: describe los
datos, no el comportamiento de un modelo). Servicio FastAPI propio en **:8020**, proxy
`/api/comparador/*` **solo GET**: la deteccion corre por lotes y la consola solo sirve el
store. Si la consola pudiera dispararla, cada visita recorreria los 274 dias y el resultado
dependeria de quien mire y cuando.

Dos decisiones de la vista que costaron una iteracion:

- **El mapa es un calendario, no una tabla.** El hallazgo mas grande son los 295 dias que
  faltan de 569, y una tabla de 274 filas no puede mostrar lo que no existe.
- **Dos tiras, una por fuente.** El veredicto combinado daba 226 graves y **cero dias ok**, o
  sea un mapa todo rojo, tan informativo como uno todo verde. Separado aparece lo accionable:
  **radiacion 126 dias ok, electrico 4**. El problema esta en el inversor, no en el
  piranometro.

Y el veredicto se decide en el SERVICIO, no en la vista: si lo calculara el cliente, la
consola y el reporte del CLI podrian discrepar sobre si un dia sirve. Ademas "grave" no es
cualquier hallazgo grave, es el que toca una parte material del dia (una quinta parte de las
lecturas, o los que invalidan el dia por naturaleza): un dia no deja de servir porque 3 de 144
lecturas de una de trece columnas se salieran de rango.

Dos trampas tecnicas anotadas: `timestamptz <= date` compara contra la **medianoche** de ese
dia y se comia el ultimo dia entero (274 aparecia como 273), y **psycopg parsea los `%` de
toda la cadena SQL, comentarios incluidos** (un "20 %" en un comentario revienta con
"incomplete placeholder").

El arnes de verificacion sin navegador se **promovio de scratchpad a
`mvp-debugger/scripts/verificar-vistas.mjs`** (`npm run verificar`, 28 chequeos), que era deuda
anotada en [[abiertos]]. Ver [[verificacion-consola]].

## Pendiente

- **Punto 4 (el estudio).** Los 4 dispositivos `fliwer` de Joshua (temperatura, humedad de aire,
  lux, humedad de suelo, EC, sobre los propios paneles) solapan **1.938 de las 3.302 horas** con
  radiacion, 59 %. AgroDash solo aporta 907 h (27 %). El electrico solapa el 100 % pero sus
  temperaturas son EFECTO de la irradiancia, no causa.
- **Programarlo** (hoy se corre a mano) y **la capa de lenguaje natural** sobre el store.

Relacionado: [[capa-agentes]], [[irradiancia-sin-calibrar]], [[temperatura-85]],
[[schemas-multiples]], [[muestreo-variable]], [[agente-analizador]].
