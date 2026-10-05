---
name: cuota-store-supabase
description: La cuota del store estaba reventada (egress 103%, disco 90%) por un modelo de datos inflado y una descarga completa cada 6 h; normalizado el 2026-08-24 quedo en 30% de disco y 11,8x menos egress, sin perder un dato
categoria: proyecto
actualizado: 2026-08-24
tags: [supabase, cuota, egress, rls, normalizacion, infraestructura]
---

# Cuota del store (Supabase Free tier)

**RESUELTO el 2026-08-24 sin gastar un colon y sin perder un dato.** Lo que sigue es el
diagnostico y la cirugia, porque la causa de fondo (modelar una serie de tiempo como texto
repetido) es un error que se puede repetir en las otras tablas.

## De donde veniamos

| Metrica | 2026-08-24 antes | Limite Free | Despues |
|---|---:|---:|---:|
| **Egress** | **5,156 GB (103 %)** | 5 GB | ~0,57 GB/mes proyectado |
| **Disco** | 415 MB (90 %) | 500 MB | **150 MB (30 %)** |

## Las dos causas (ninguna era "Supabase se nos quedo corta")

**1. La tabla estaba inflada 4 veces.** `lecturas_ambientales_sc` pesaba 353 MB, el 85 % de la
base, para guardar 885.606 floats. Formato largo con **siete columnas de texto** repetidas en
cada fila (~130 bytes) cuando en toda la tabla habia apenas **once combinaciones distintas**. Y
los indices (192 MB) pesaban mas que los datos (161 MB): `idx_lecturas_sensor_ts` eran 103 MB de
btree sobre un texto de once valores posibles.

**2. El forecaster se bajaba la tabla entera, dos veces al dia.** `data.py` hacia
`SELECT ts, valor, sensor_id ... WHERE variable = X` sin filtro: **todos** los canales (5 de
humedad, 6 de irradiancia) para despues descartar todos menos uno en pandas. Se cacheaba en un
parquet dentro del contenedor, pero el contenedor no tiene volumen y `forecast-refresh.timer`
lo recrea cada 6 h. 56 MB por arranque en frio, ~235 MB/dia medidos. Eso era el egress entero.

## Lo que se hizo (migracion 002)

Separar la dimension (11 filas) de los hechos (885.606). Detalle y justificacion de cada
decision en `agente-predictivo/sql/002_normalizar_lecturas_ambientales.sql`.

- `series_ambientales`: 1 fila por canal. `sensor_id` pasa de texto a `uuid`.
- `lecturas_ambientales`: `(serie_id, ts, ts_medicion, valor, origen_id)`, PK `(serie_id, ts)`.
- **Sin indices secundarios.** La PK cubre todo lo que se consulta.
- `lecturas_ambientales_sc` **sigue existiendo como vista** con la forma exacta de la tabla vieja,
  asi que la consulta vieja del forecaster funciona igual y el contenedor desplegado no se rompio.
- `data.py` ahora elige el canal con un agregado diminuto y baja **solo ese canal, solo las dos
  columnas que usa**: 56 MB -> 4,7 MB por arranque, **11,8 veces menos**.

Resultado: la tabla 353 -> 88 MB, la base 415 -> 150 MB, 253 tests en verde.

## Lo que NO se hizo, y por que

- **`valor` sigue en DOUBLE PRECISION.** Pasarlo a `real` ahorraba 4 bytes por fila pero
  perturbaba 186.730 valores en el septimo digito. La regla de Leo es guardar el crudo.
- **No se podo ni una fila.** Normalizar es lossless; retencion no lo es.
- **No se subio de plan ni se migro a Railway.** Railway sale ~5 USD/mes (RAM 10 USD/GB-mes,
  volumen 0,156 USD/GB-mes, egress 0,05 USD/GB, plan Hobby con 5 USD de credito) contra 25 de
  Supabase Pro, y no tiene topes duros; queda anotado como destino si alguna vez hace falta.
  Pero migrar sin normalizar solo habria hecho barata la ineficiencia.

## Como se verifico que no se perdio nada

Antes del `DROP`: 885.606 = 885.606 en las 11 series; sumas exactas en `numeric` identicas
(diferencia maxima 0.00); hash por fila de `(valor, ts_medicion)` identico; hash de `origen_id`
identico; `EXCEPT` en los dos sentidos sobre el canal del forecaster dio 0 y 0; la serie que
devuelve `data.py` identica a la de antes. Backup local previo en
`sql/dump/lecturas_ambientales_sc_2026-08-24.csv.gz` (28 MB, 885.606 filas).

Truco util: comparar `sum(valor)` en `double precision` daba 5 de 11 y asusta. Es el **orden** de
la suma en IEEE 754, no diferencia de datos. En `numeric` da 11 de 11.

## Runway

La ingesta SC sigue congelada desde el 2026-07-23. Cuando se restaure: ~9.000 filas/dia entre las
dos variables, ~275k/mes. A la densidad vieja eran 110 MB/mes con 85 MB de margen, o sea **menos
de un mes de vida**. A la nueva son ~28 MB/mes con 350 MB de margen: **mas de un año**.

## Lo que queda pendiente

- ~~Redesplegar el contenedor en la EC2.~~ **HECHO el 2026-08-24 14:52 UTC.** rsync +
  `docker-compose -f docker-compose.forecast.yml up -d --build --force-recreate`. **Ojo: es el
  binario `/usr/local/bin/docker-compose`, NO el plugin `docker compose`**, que en esa EC2 no
  existe (el runbook 04 dice lo contrario y esta desactualizado). Verificado: `/salud/ingesta`
  devuelve los mismos 191.676 y 693.930 de antes; arranque en frio real (contenedor de 14:52:26,
  parquet escrito 16 s despues) con `/forecast` en 0,25 s y 0,52 s; el ETL `--full` releyo 582.015
  filas de AgroDash contra el camino de escritura nuevo e inserto **0** (idempotencia y FKs OK);
  endpoint publico sano.
- **El volumen del contenedor** sigue sin darse. Ya no es critico (4,7 MB por arranque en frio se
  aguantan de sobra), pero sigue siendo trabajo tirado a la basura cada 6 h. Ver [[abiertos]].
- **`fliwer.readings`** (la migracion de Joshua) tiene 82.828 inserts para 41.414 filas vivas
  (cargo dos veces, hay bloat) y un `raw_payload jsonb` que duplica cada columna, 460 bytes por
  fila. Mismo error de modelado, escala 20 veces menor. Sin tocar.

## Como medirlo

```sql
select pg_size_pretty(pg_database_size(current_database()));

select c.relname,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total,
       pg_size_pretty(pg_relation_size(c.oid))       as heap,
       pg_size_pretty(pg_indexes_size(c.oid))        as indices
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public','fliwer') and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc;
```

Relacionado: [[acceso-lectura-equipo]], [[agrodash-local]], [[pipeline-tiempo-real]],
[[arquitectura-regiones]], [[abiertos]], [[superficie-expuesta]], [[estado]].
