---
name: latencia-manda-sobre-el-sql
description: En el Agente Histórico el tiempo de un endpoint es viajes × 225 ms, no coste de SQL; se reducen los viajes con paralelismo, fusión en un solo CTE y un caché breve con coalescencia
categoria: decisiones
---

# La latencia manda sobre el SQL (Agente Histórico, 2026-09-01)

Las cinco vistas de la consola cargaban lento y la causa **no era el SQL**: era la
cantidad de idas y vueltas a la base.

## La medición que ordena todo

La Supabase está en `us-east-1` y el servicio consulta por el **pooler en modo
sesión**. Medido el 2026-09-01:

| | |
|---|---|
| `SELECT 1` contra el pooler | **225 ms** |
| `analitica/energia` | 4 viajes · 0,92 s |
| `analitica/rendimiento` | 4 viajes · 1,19 s |
| bloque `confianza` (3 consultas) | 0,60 s |

O sea que **el tiempo de un endpoint es esencialmente `viajes × 225 ms`**: las
consultas en sí son casi gratis y afinarlas no mueve la aguja. Cuatro consultas
secuenciales son 900 ms garantizados antes de calcular nada.

De ahí la regla: **lo que se optimiza es la cantidad de viajes, no el plan de
ejecución.** Está escrita en la cabecera de `src/historico/db.py` para que el
próximo que lea el código no "simplifique" la concurrencia sin saber lo que cuesta.

## Las tres palancas, en orden de rendimiento

1. **Fusión.** Los tres insumos del bloque `confianza` (calendario, filas por día,
   hallazgos) no dependen unos de otros y viajaban por separado. Ahora salen en
   **una sola consulta** con subconsultas escalares y `json_agg`. Como ese bloque va
   dentro de casi toda respuesta agregada, la fusión rebaja **dos viajes en diez
   endpoints**. Detalle sutil: `json_agg` devuelve las fechas como texto ISO, igual
   que hacía `db.query`; si algún día devolviera `date`, los diccionarios dejarían
   de cruzar **en silencio** y todos los días saldrían utilizables.
2. **Concurrencia.** `db.en_paralelo()` corre a la vez las consultas independientes
   de un mismo endpoint. El pool ya era thread-safe y FastAPI corre los `def` en su
   threadpool, así que no hubo nada más que coordinar. Dos reglas la hacen
   intercambiable por la versión secuencial: la salida va **en orden de argumento**
   (no de terminación) y se levanta la excepción de la **primera** tarea que falla.
   Y un `en_paralelo` dentro de otro corre en fila a propósito: con un ejecutor de
   ancho fijo, un obrero que encola y espera puede colgar el proceso entero.
3. **Caché breve con coalescencia.** `confianza` se cachea por
   `(desde, hasta, variables, fuente)`. Lo que rinde **no es el TTL sino la
   coalescencia**: la consola pide con `Promise.all`, o sea que las peticiones de
   una vista llegan a la vez y con un caché de solo TTL fallarían todas a la vez.

## Lo que el caché no puede romper

- **Devuelve copias profundas.** Los llamadores le agregan claves encima
  (`vigilancia`, `sin_vigilancia`, una `advertencia` propia). Servir el objeto
  guardado haría que la respuesta dependiera de quién preguntó antes.
- **TTL de 10 s, 128 entradas.** El techo existe porque la clave lleva el rango de
  fechas: un caché sin límite es una fuga de memoria con otro nombre.
- **Si corre el barrido con entradas vivas:** en el **mismo proceso** (el CLI
  `historico barrido` / `historico todo`) `db.ejecutar*` invalida y no hay ventana.
  En **otro proceso** (lo normal: cron) la API no se entera y puede servir el
  veredicto anterior **hasta que venza el TTL**. Ese es el precio, y por eso el TTL
  es de segundos. `HISTORICO_CACHE_TTL_SEG=0` lo apaga sin tocar código.

## El resultado, y el criterio con que se aceptó

Rango de referencia (30 días), suma de los 15 endpoints: **14,0 s → 3,8 s**.
Histórico completo: **22,3 s → 7,2 s**. `calidad/resumen`, que es lo único que
bloquea la primera pintura de `/calidad`, pasó de **7 viajes / 1,62 s a 4 / 0,19 s**;
`analitica/resumen`, que bloquea el HTML del Tablero por ser Server Component, de
**5 / 1,08 s a 2 / 0,21 s**.

El criterio de aceptación no fue el tiempo sino que **no cambiara ni un número**: se
capturaron las respuestas de los 15 endpoints en 5 rangos (incluidos dos vacíos)
antes y después y se compararon **hoja por hoja**: 122.295 valores, 79.769 de ellos
numéricos, **cero diferencias**. Ver [[agente-historico]].
