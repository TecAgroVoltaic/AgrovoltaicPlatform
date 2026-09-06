---
name: capa-analitica
description: La capa de algoritmos del Agente Histórico, construida y terminada el 2026-08-28; 13 módulos de analítica + 11 de pruebas de calidad, 325 tests sin base de datos, 23 tools y 10 endpoints. Incluye las decisiones de arquitectura (funciones puras, payload del LLM distinto al de la API, un endpoint por algoritmo) y los contratos compartidos de catalogo.py. 2026-08-30: las respuestas de Leo obligan a cuatro cambios concretos (PR diario y mensual, energía AC, prueba de disponibilidad, integración por salto real)
categoria: proyecto
actualizado: 2026-08-31
tags: [algoritmos, analitica, calidad, tools, arquitectura, agente-historico, evaluacion-datos]
---

# Capa de algoritmos (`historico/analitica` + `historico/calidad/pruebas`)

**Construida y terminada el 2026-08-28.** Es lo que decidió [[algoritmos-antes-que-agente]]:
primero los algoritmos, el agente después, porque el valor está en las tools y las tools son
algoritmos. El brief técnico que leyeron todos los equipos es
`docs/referencia/brief-evaluacion-datos.md`.

## Qué se construyó

**`agente-historico/src/historico/analitica/`, 13 módulos.**

| Grupo | Módulos |
|---|---|
| Contratos compartidos | `ventana.py`, `resultado.py`, `catalogo.py`, `fuente.py` |
| Algoritmos | `resumen.py`, `completitud.py`, `series.py`, `distribucion.py`, `carpeta.py`, `correlacion.py`, `crestas.py`, `comparativa.py` |

**`agente-historico/src/historico/calidad/pruebas/`, 11 módulos:** `umbrales.py`, `contrato.py`,
`cadencia.py`, `estadistica.py`, `completitud.py`, `validez_fisica.py`,
`consistencia_temporal.py`, `anomalias.py`, `registro.py`, `consultas.py`.

**325 tests pasando, todos sin base de datos.** Se pudo porque la estadística y el criterio están
separados del SQL, siguiendo el patrón que ya existía en `calidad/contexto.py:reducir()`: las
consultas traen filas y las funciones puras deciden. Un test que necesita una base es un test que
no se corre.

**23 tools registradas** (16 de análisis, 7 de calidad) y **10 endpoints GET nuevos** bajo
`/analitica/*` y `/calidad/pruebas`, con un manejador compartido que traduce los errores tipados a
**HTTP 400 / 422 devolviendo un `codigo`**. El código de error viaja en la respuesta: un cliente
que recibe 422 tiene que poder decir **por qué** sin parsear prosa.

## Las tres decisiones de arquitectura

### 1. Los algoritmos son funciones puras que no saben del LLM ni de la UI

`tools/` es una **capa delgada** de `SCHEMA` + `run()` encima de las funciones. La misma función
sirve a **la API de la consola, a la tool del agente y al CLI**.

El motivo no es elegancia: es que los tres tienen que dar **el mismo número**. Si el navegador
hiciera su propia cuenta, el experto y el agente podrían discrepar sobre el mismo dato y no
habría forma de saber cuál de los dos tiene razón. **El frontend no calcula** ([[consola-analitica]]).

### 2. El payload del LLM no es el payload de la API

Las tools devuelven **el resumen** (ajuste, R², estadísticos, hora del pico) y **omiten los
arrays grandes** (puntos, matrices, densidades), que viajan solo por la API.

Es el mismo criterio que ya se había aplicado a la tool `graficar` del chat ([[mvp-debugger]]):
el LLM recibe la conclusión, el dibujo lo hace quien dibuja. Meterle 19.482 puntos a un modelo
para que diga "hay correlación" es pagar tokens por algo que la función ya calculó.

### 3. Un endpoint por algoritmo, no por vista

El frontend los compone desde **Server Components con `Promise.all`**: el navegador hace una sola
petición y la API no queda acoplada a la forma de la pantalla. Si mañana la pantalla cambia, la
API no se entera. Si la API tuviera un endpoint "vista de estadística", cada rediseño sería una
migración de backend.

## Contratos compartidos nuevos en `analitica/catalogo.py`

Son la parte menos vistosa y la que más errores previene.

- **`Variable.clave_calidad` y `fuente_calidad`.** Traducen la clave del catálogo al nombre con
  que el barrido registró los hallazgos. Existen porque ese cruce ya falló en silencio: buscar
  `irradiancia_incidente_wm2` en una tabla que guarda `irradiancia_incidente` no da error, da
  vacío, y vacío se lee como dato impecable ([[silencio-leido-como-salud]]).
  **Verificado: el barrido solo vigila 14 de las 26 variables**, así que el mapeo también tiene
  que poder decir "esta variable no la mira nadie".

- **`Variable.origen_crudo` → `(relacion, columna)` sin corregir.** Existe porque las pruebas de
  validez física leídas contra las vistas corregidas **salen vacías por construcción**: la vista
  ya anuló lo que caía fuera de rango, así que la prueba se aprueba a sí misma
  ([[pruebas-calidad-umbrales]]).

- **`Variable.dato_desde` / `dato_hasta`**, más las funciones **`cobertura(*claves)`** (la
  intersección, porque quien pide varias variables las quiere cruzar) y
  **`fuera_de_cobertura(desde, hasta, *claves)`**, que devuelve un **motivo legible**. Se
  consultan **antes** de ir a la base: una nube de cero puntos se lee como "no hay correlación", y
  no es lo mismo que "estas dos variables nunca coexistieron". El SP722 tiene 18 días y el albedo
  empieza el 2025-10-25 ([[fuentes-fisicas]]).

- **Una guarda que revienta al importar** si una variable con fuente se queda sin
  `relacion_cruda`. No es defensivo por si acaso: **ese olvido ya ocurrió**, y las tres
  temperaturas perdían sus **837 hallazgos** en silencio. Un fallo de configuración que se
  descubre en tiempo de importación cuesta un segundo; el mismo fallo descubierto por un número
  raro cuesta una corrida.

- **`VariableDesconocida` hereda de `KeyError` **y** de `ValueError`.** Así un parámetro mal
  escrito por el LLM sale **400 y no 500**. El agente escribe nombres de variable y a veces los
  escribe mal: eso es entrada inválida del cliente, no una caída del servidor, y la diferencia
  importa porque un 500 despierta a alguien y un 400 lo corrige el propio agente.

## Cadencia medida, no declarada

`calidad/pruebas/cadencia.py` priorizaba `intervalo_original_seg` (el metadato) sobre la cadencia
observada. Se corrigió: ahora infiere la cadencia de los saltos reales, con el metadato solo como
desempate. **El detalle, los números y la corrección de una afirmación previa que resultó
imprecisa están en [[muestreo-variable]].**

En corto: con el umbral sobre la cadencia declarada salían **8.756** saltos como intervalo
excesivo y con la medida salen **65**; los 8.691 de diferencia eran pasos normales de 300 s
marcados como hueco.

## Un defecto de rendimiento cuadrático, corregido

`cadencia.esperada()` recorría **la serie entera** y `completitud` la llamaba **una vez por día**:
alrededor de **26 millones de recálculos**. Se memoizó sobre la instancia (`Serie` es un dataclass
congelado, así que se usa `object.__setattr__`).

Pasó de cuadrático a lineal: **274 días de 462,8 s a 0,084 s** en la medición de referencia.

Vale la pena anotarlo porque el defecto era invisible en los tests (que corren sobre series
cortas) y solo aparecía al barrer el histórico completo. Cualquier función que derive una
propiedad de **toda** la serie y se llame **por cada tramo** tiene esta forma.

## Lo que las respuestas de Leo del 2026-08-30 obligan a cambiar acá

La capa se construyó el 2026-08-28 con las preguntas todavía abiertas. El 2026-08-30 volvieron
respondidas ([[respuestas-lcv-consultas-agosto]]) y dejan **cuatro cambios concretos** en los
módulos, ninguno de arquitectura:

1. **El Performance Ratio cambia de unidad de análisis.** Deja de calcularse por par de lecturas
   y pasa a ser **diario y mensual**: energía del día como acumulado de `energia_pv1_wh` y
   `energia_pv2_wh` al final del día, dividida entre la radiación integrada del día. El
   emparejamiento fino se conserva, pero para los análisis punto a punto
   ([[emparejamiento-por-timestamp]]).
2. **La energía del tablero pasa a ser AC**, de `energia_hoy_wh` o `energia_total_wh`. Son
   **contadores que se reinician**, así que el algoritmo que los lea tiene que sumar incrementos y
   tratar los saltos negativos como reinicios, no hacer `max()`
   ([[catalogo-metricas-evaluacion]]).
3. **La integración de irradiancia no puede usar `5/60` fijo.** Leo la escribió suponiendo
   cadencia de 5 min y la nuestra va de 15 s a 330 s: hay que pesar por el **salto real acotado a
   un techo con nombre**, que es la regla que ya usa la integración de potencia
   ([[muestreo-variable]]).
4. **La validez física de `voltaje_vac` sale, y entra una prueba de disponibilidad del equipo**
   (las tres variables AC en 0 entre las 7:00 y las 17:00, con refinamiento opcional por
   irradiancia > 300 W/m²). Es un eje distinto del de calidad del dato y no debería compartir
   severidad con él ([[pruebas-calidad-umbrales]], [[store-hallazgos-calidad]]).
   **Cerrada como decisión de arquitectura el 2026-08-31** ([[inversor-sin-acoplar]],
   [[decisiones]]): va en un **módulo propio `calidad/pruebas/disponibilidad.py`**, hermano de las
   cuatro familias y **no** una quinta prueba de `validez_fisica.py`. Tres razones medidas:
   `validez_fisica` arranca con `_exigir_dato_sin_corregir` y mezclar sus dos justificaciones haría
   ilegible por qué se pide el crudo; sus límites salen de `catalogo.minimo/.maximo` y esta prueba
   no tiene límite por variable sino una hora, un umbral y un emparejamiento por ventana; y es **la
   primera prueba del sistema que mide el EQUIPO**, de las que va a haber más (arranque tardío,
   parada temprana, código de error, clipping).
   **Y el tipo `inversor_sin_acoplar` NO entra en el veredicto de calidad del dato:** ni en
   `contexto.TIPOS_QUE_INVALIDAN` ni como grave material en `contexto.reducir`. Viaja en un eje
   aparte dentro del mismo payload de `confianza()`. Medido: como grave sube los días graves de 181
   a 193 y como aviso los deja en 181; lo correcto es **que no cuente en ninguna de las dos**.

Nada de esto toca las tres decisiones de arquitectura de arriba: son funciones puras, siguen
siéndolo, y el cambio entra por el algoritmo, no por la forma de la capa.

## La ronda del 2026-08-31: la capa creció con lo que decidió Leo

Detalle completo en [[implementacion-decisiones-lcv]]. La suite pasó de **353 a 462 tests en
verde**. Tres módulos nuevos (`analitica/rendimiento.py`, `analitica/energia.py`,
`calidad/pruebas/disponibilidad.py`) más `analitica/contaminacion.py`, que convierte en **un dato
compartido** una firma que estaba en **tres sitios con tres criterios distintos**.

Lo que esa ronda enseñó sobre la propia capa:

- **`comparativa.py` calculaba su propio Performance Ratio a 5 minutos**, así que convivían **dos
  definiciones del mismo indicador**. Ahora llama a `rendimiento.py`. La parte que evita que
  vuelva: lo que legítimamente vive a 5 min quedó con nombre propio, `emparejamiento_5min`, **sin
  ninguna clave `pr`** ([[performance-ratio-diario]]).
- **La regla de `_VIGILADAS` es asimétrica a propósito.** Las cuatro columnas de energía entran;
  las dos POA frontales no. **Una clave de más produce silencio leído como salud; una clave de
  menos la canta `sin_vigilancia()`.** Como los dos errores no cuestan lo mismo, ante la duda se
  deja fuera. La POA queda afuera porque sus hallazgos viajan con fuente `radiacion_sc_poa`, que
  `calidad/contexto.py` **no sabe contar**, y declararla vigilada convertiría un aviso honesto en
  un aprobado falso ([[decisiones]], [[silencio-leido-como-salud]]).
- **Un parámetro opcional puede ser una trampa.** `confianza` acepta que no le pasen variables,
  informa "sin acotar" y **no cuenta nada**, así que la forma de llamarla mal es también la más
  cómoda. Costó 190 días de veredicto equivocado ([[silencio-leido-como-salud]]).

## Lo que queda de esta capa

- ~~**`tools/hallazgos.py::QUE_ES` sigue con los 12 tipos viejos.**~~ **HECHO el 2026-08-31:** pasó
  de 12 a **30 entradas**, y lo importante no es el número sino que **la lista se deriva del
  registro**, con tests que **fallan si sobra o falta un tipo**. Antes se desincronizaba sin avisar.
- **`agent/prompts.py` nombra a mano las tools viejas** y no menciona las diez nuevas. El agente
  no las va a usar aunque estén registradas.
- **`contexto.py` no sabe contar filas de `radiacion_sc_poa`**, y es lo único que bloquea vigilar
  la POA.
- **Hacer obligatorio el parámetro `variables` de `confianza`.**

Están en [[abiertos]].

Relacionado: [[respuestas-lcv-consultas-agosto]], [[implementacion-decisiones-lcv]],
[[inversor-sin-acoplar]], [[rango-fisico-en-cinco-sitios]],
[[algoritmos-antes-que-agente]], [[consola-analitica]], [[agente-historico]],
[[agente-historico-calidad]], [[store-hallazgos-calidad]], [[emparejamiento-por-timestamp]],
[[pruebas-calidad-umbrales]], [[catalogo-metricas-evaluacion]], [[graficos-evaluacion]],
[[silencio-leido-como-salud]], [[muestreo-variable]], [[fuentes-fisicas]], [[abiertos]].
