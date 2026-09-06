---
name: implementacion-decisiones-lcv
description: La ronda que llevó al código las tres respuestas de Leo del 2026-08-30, implementada el 2026-08-31. Tres módulos nuevos (rendimiento, energia, disponibilidad), la firma de contaminación compartida, la suite de 353 a 462 tests en verde, y NADA escrito todavía en producción. Incluye las correcciones a cosas que se daban por buenas: comparativa.py tenía su propia definición de PR, QUE_ES pasó de 12 a 30, y el rango físico vivía en cinco sitios y no en tres
categoria: proyecto
actualizado: 2026-08-31
tags: [implementacion, algoritmos, calidad, disponibilidad, performance-ratio, energia, tests]
---

# Se implementó lo que decidió Leo

**2026-08-31.** Las tres respuestas de [[respuestas-lcv-consultas-agosto]] pasaron de medición a
código. La suite fue de **353 a 462 tests en verde**.

> **Nada se escribió todavía en producción.** Las dos únicas escrituras pendientes son aplicar
> `sql/003_electrico_sin_falsos_positivos.sql` y re-correr el barrido, y **las decide Izack**
> ([[abiertos]]).

## Lo construido

| Módulo | Qué resuelve |
|---|---|
| **`analitica/rendimiento.py`** | El Performance Ratio diario y mensual (**R1**) |
| **`analitica/energia.py`** | La energía AC del tablero (**R7**) |
| **`calidad/pruebas/disponibilidad.py`** | El inversor sin acoplar (**R3**), quinta familia de pruebas |
| **`analitica/contaminacion.py`** | La firma de filas del piranómetro, escrita como datos y compartida |
| **`sql/003_electrico_sin_falsos_positivos.sql`** | La vista sin los `CASE` que borraban ceros válidos. **Escrita y validada, NO aplicada** |

### `rendimiento.py`: el PR reproduce exactamente los números medidos

No es un cálculo nuevo: es el de [[performance-ratio-diario]] llevado a función pura, y **da los
mismos números**, que es la prueba de que la medición y el código dicen lo mismo.

| Variante | PR1 inclinado | PR2 vertical |
|---|---|---|
| Contador / GHI | 0,677 | 0,485 |
| Integral / GHI | 0,733 | 0,517 |
| Integral / POA bifacial | **0,648** | **0,612** |
| Integral / POA frontal | 0,738 | **1,217** |

La fila de POA frontal sale **marcada como físicamente imposible** (138 de 197 días por encima de
1), en vez de devolverse como un resultado más. Agrega **ponderando por energía según IEC 61724**,
no promediando los PR diarios, que son dos cosas distintas. Techo de `dt` de **600 s**.

### `energia.py`: dos totales con nombre propio

La lección de [[energia-ac-tablero]] entró al código como **dos claves distintas y no como un
número con nota al pie**:

| Clave | Valor | Qué contesta |
|---|---|---|
| `registrada` | **1.644,02 kWh** | suma de cierres diarios: lo que el datalogger vio |
| `planta` | **2.528,40 kWh** | contador de vida: lo que la planta produjo |

La diferencia, **1.622,85 kWh generados en días que no tenemos**, deja de ser una advertencia que
alguien tiene que recordar y pasa a ser aritmética entre dos campos que existen
([[gaps-temporales]]).

Y **el hueco de cuatro meses ya no existe ni en la medición ni en el código**: nov-2025 a feb-2026
devuelve **667,2 kWh reales**, leídos de `energia_hoy_wh`, que es la única columna AC viva en ese
tramo.

### `disponibilidad.py`: la quinta familia, y fuera del veredicto

Implementa la regla de [[inversor-sin-acoplar]] tal como se decidió: tipo `inversor_sin_acoplar`,
ventana fija 07-17, y **la irradiancia gradúa la severidad, no filtra**.

**El detalle que importa y era fácil de hacer a medias:** queda excluido del veredicto de calidad
del dato **en las tres cuentas de `contexto.py`**, no solo en `TIPOS_QUE_INVALIDAN`. Sacarlo de una
sola de las tres habría dejado el hallazgo entrando por las otras dos, en silencio. Y **se ve en un
canal propio**, así que el experto recibe "la planta estuvo parada" en vez de "no te fíes del dato"
([[decisiones]]).

### `contaminacion.py`: una firma, no tres

La firma de las filas del piranómetro **estaba en tres sitios con tres criterios distintos**, que
es como se llegó a que una medición contara 466 filas contaminadas y otra 490
([[energia-ac-tablero]], [[inversor-sin-acoplar]]). Ahora es **un dato compartido**, no tres
copias de una condición.

## Correcciones a cosas que se daban por buenas

### `comparativa.py` tenía su propia definición de Performance Ratio

Convivían **dos definiciones del mismo indicador**: una a 5 minutos dentro de `comparativa.py` y
otra diaria en `performance.py`. Ahora `comparativa.py` llama a `rendimiento.py`.

Sus números **se mueven de 0,664 / 0,633 a 0,648 / 0,612**, y **el ganador no cambia**: sigue
ganando el inclinado ([[performance-ratio-diario]]).

Y lo que legítimamente vive a 5 minutos **quedó con nombre propio**, `emparejamiento_5min`, **sin
ninguna clave `pr`**. Es la parte que evita que el problema vuelva: mientras dos cosas distintas se
llamen igual, alguien las va a comparar.

### `tools/hallazgos.py::QUE_ES` pasó de 12 a 30 entradas

Cierra el pendiente que estaba anotado desde el 2026-08-28 ([[capa-analitica]]). Lo importante no
es el número: **la lista se deriva del registro**, y hay tests que **fallan si sobra o falta un
tipo**. Antes era una lista a mano que se desincronizaba sin avisar, y la consola mostraba el
código del hallazgo sin glosa.

### El rango físico vivía en CINCO sitios, no en tres

Es la corrección más peligrosa de la tanda y tiene archivo propio:
[[rango-fisico-en-cinco-sitios]]. En corto: además de `config.py`, `catalogo.py` y la vista,
estaban `src/agrovoltaic/ddl.py` (el generador del ETL, **con su propio config**) y
`sql/schema.sql`, que es **generado**. Con los tres primeros arreglados, **bastaba regenerar el
esquema desde el menú del ETL para reintroducir los dos defectos completos**. Ya está corregido en
los cinco.

## Un bug nuevo, y falla hacia el mismo lado que los otros tres

`tools/calidad_periodo.py` llamaba `confianza(d, h, fuente)` **de forma posicional**, y la fuente
caía en el parámetro `variables`. Medido contra producción:

| Consulta | Reportaba | Real |
|---|---|---|
| Acotando a lo eléctrico | 258 días utilizables | **68** |
| Acotando a radiación | 258 | 196 |
| **Sin acotar (la llamada por defecto)** | **274** | **45** |

Con lo eléctrico, **190 días cambiaban de veredicto**.

Va con los otros de su familia en [[silencio-leido-como-salud]], junto con **la trampa de diseño
que lo hizo posible**, que es lo que de verdad hay que arreglar: `confianza` **acepta que no le
pasen variables**, informa "sin acotar" y **no cuenta nada**. La forma de llamarla mal es también
la más cómoda. Hacer el parámetro obligatorio queda pendiente ([[abiertos]]).

## Decisión de diseño: qué entra a `_VIGILADAS`

**Las cuatro columnas de energía entran. Las dos POA frontales no.**

El criterio y **su asimetría**, que es lo que hay que recordar: **una clave de más produce silencio
leído como salud; una clave de menos la canta `sin_vigilancia()`**. Los dos errores no cuestan lo
mismo, así que ante la duda se deja fuera.

La POA queda afuera porque sus hallazgos viajan con fuente `radiacion_sc_poa`, que
`calidad/contexto.py` **no sabe contar**. Declararla vigilada convertiría **un aviso honesto en un
aprobado falso**, que es exactamente el fallo de [[silencio-leido-como-salud]]. Registrado también
en [[decisiones]].

## Lo que queda

- **Aplicar `sql/003` y re-correr el barrido.** Son las **dos únicas escrituras a producción** y
  las decide Izack. El ensayo del barrido con las escrituras anuladas da **25.720 hallazgos** y
  **190 filas de `inversor_sin_acoplar` en 96 días** (135 graves bajo sol, 37 avisos por
  irradiancia baja, 18 sin irradiancia) → [[store-hallazgos-calidad]].
- **`contexto.py` no sabe contar filas de `radiacion_sc_poa`**, y es lo único que bloquea vigilar
  la POA.
- **Hacer obligatorio el parámetro `variables` de `confianza`.**
- **Las vistas del frontend siguen sin construirse**, que es lo que falta del encargo original
  ([[consola-analitica]]).

Relacionado: [[respuestas-lcv-consultas-agosto]], [[capa-analitica]],
[[performance-ratio-diario]], [[energia-ac-tablero]], [[inversor-sin-acoplar]],
[[rango-fisico-en-cinco-sitios]], [[vista-corregida-no-corrige]],
[[silencio-leido-como-salud]], [[store-hallazgos-calidad]], [[decisiones]],
[[unidades-energia-kwh]], [[gaps-temporales]], [[consola-analitica]], [[abiertos]],
[[implementacion]], [[estado]].
