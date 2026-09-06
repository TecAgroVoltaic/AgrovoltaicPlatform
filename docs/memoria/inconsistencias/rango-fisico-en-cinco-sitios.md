---
name: rango-fisico-en-cinco-sitios
description: El rango de validez del voltaje AC estaba escrito en cinco lugares y no en tres, y dos de ellos viven en el OTRO proyecto. La misma vista está definida en dos repos y pueden divergir; con tres sitios arreglados, regenerar el esquema desde el menú del ETL reintroducía los dos defectos completos. Corregido en los cinco el 2026-08-31
categoria: inconsistencia
actualizado: 2026-08-31
tags: [duplicacion, vistas, etl, esquema, configuracion, voltaje-ac]
---

# El mismo rango, escrito en cinco sitios y en dos proyectos

Descubierto el **2026-08-31** al implementar las decisiones de Leo
([[implementacion-decisiones-lcv]]). Ya estaba anotado que el rango 100-280 V del voltaje AC vivía
en **tres** lugares y que había que tocar los tres a la vez porque olvidar uno falla en silencio
([[vista-corregida-no-corrige]]).

**Eran cinco, y los dos que faltaban son los peores.**

| # | Sitio | Proyecto |
|---|---|---|
| 1 | `agente-historico/src/historico/config.py` (`RANGOS`) | Agente Histórico |
| 2 | `agente-historico/src/historico/analitica/catalogo.py` | Agente Histórico |
| 3 | la vista `v_sc_electrico_corregido` en la base | Supabase |
| **4** | **`src/agrovoltaic/ddl.py`**, el generador del ETL, **con su propio config** | **ETL** |
| **5** | **`sql/schema.sql`**, que es un artefacto **generado** por el anterior | **ETL** |

## Por qué es peor que una duplicación normal

Porque **el arreglo parcial se deshace solo**. Con los tres primeros corregidos, **bastaba
regenerar el esquema desde el menú del ETL para reintroducir los dos defectos completos**: los
`CASE` que borran los ceros válidos volverían a la vista, y con ellos la ceguera al inversor caído
que Leo pidió detectar ([[inversor-sin-acoplar]]).

No hace falta que alguien se equivoque: basta que alguien haga **lo correcto** en el otro proyecto,
que es regenerar el esquema desde su única fuente. El ETL fue diseñado con la regla de **cero
columnas quemadas** y el DDL derivado de `CONCEPT_MAP` ([[implementacion]]), que es una buena
regla; el problema es que **su config no es el mismo config** que el del Agente Histórico.

## El fondo: la misma vista definida en dos proyectos

`v_sc_electrico_corregido` la **crea** el ETL (`src/agrovoltaic`) y la **lee y parametriza** el
Agente Histórico (`agente-historico`). Cada uno tiene su propia idea de cuál es el rango válido, y
**nada obliga a que coincidan**. Pueden divergir en cualquier momento sin que ninguna prueba lo
note, porque los dos proyectos pasan sus tests por separado.

Es la misma forma de fallo de [[silencio-leido-como-salud]]: no hay error, hay una divergencia que
nadie mira. Y acá tiene un agravante propio, que **el sentido de la divergencia depende de quién
corrió último**.

## Estado

**Corregido en los cinco sitios el 2026-08-31.** Lo que **no** está resuelto es la causa: sigue
habiendo dos definiciones de la misma vista en dos repos. Mientras eso siga así, cualquier cambio
de rango es una operación de cinco puntos y hay que tratarla como una unidad, no como cinco
tareas.

`sql/003_electrico_sin_falsos_positivos.sql` está **escrita y validada pero NO aplicada**: la
escritura a producción la decide Izack ([[abiertos]]).

Relacionado: [[vista-corregida-no-corrige]], [[implementacion-decisiones-lcv]],
[[implementacion]], [[inversor-sin-acoplar]], [[silencio-leido-como-salud]],
[[respuestas-lcv-consultas-agosto]], [[capa-analitica]], [[abiertos]].
