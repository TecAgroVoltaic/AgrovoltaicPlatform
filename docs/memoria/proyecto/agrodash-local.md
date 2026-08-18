---
name: agrodash-local
description: Réplica de AgroDash restaurada desde el dump — VIVE EN LA EC2 (contenedor agrodash-pg, 127.0.0.1:5433) y es la fuente del ETL mientras Cartago está caído; el script local sirve para trabajar de forma aislada
categoria: proyecto
---

# Réplica de AgroDash (fuente del ETL con Cartago off)

**Creada 2026-08-14.** Ni el server vivo de Cartago (`100.101.177.71`) ni la réplica del
rig (`100.100.130.47`) están accesibles. Sin fuente, el ETL de [[pipeline-tiempo-real]]
fallaba cada 15 min. La solución es restaurar el dump y apuntar ahí `DATABASE_URL`.

## La que importa: la réplica de la EC2 (productiva)

El dump está restaurado **en la EC2** (`52.1.28.77`), que es donde corre el ETL:

| | |
|---|---|
| Contenedor | `agrodash-pg` (`postgres:16`, volumen `agrodash_pgdata`, `restart unless-stopped`) |
| Puerto | `127.0.0.1:5433` — **atado a loopback**, no expuesto a internet |
| DB / user | `agrodash_control` / `postgres` (clave en `/home/ec2-user/.agrodash_pw`, `chmod 600`) |
| Alcance | el sidecar es `network_mode: host` → la ve directo, sin cambios de red |
| Tamaño | 21.314.662 filas, 5.045 MB |

`DATABASE_URL` en `forecast.env` apunta ahí; la URL de Cartago quedó **comentada** en el
mismo archivo con la fecha y cómo revertir (backup en `forecast.env.bak-cartago-2026-08-14`).
Cuando Cartago vuelva, es cambiar esa línea — cero código, porque `config.conninfo()` ya
resuelve la fuente por URL.

## La local (opcional, para trabajar aislado)

```bash
~/AgrovoltaicPlatform/agente-pronostico/scripts/agrodash_local.sh
```

Corre en **foreground**: Ctrl+C baja el server (la data persiste). El script es idempotente
en tres niveles — si el cluster no existe hace `initdb`, si la DB no existe la crea, y si
`readings` está vacía restaura el dump. Ya restaurada, solo levanta postgres. Si ya hay un
postgres escuchando en el puerto, no arranca otro: solo prepara la DB.

El dump se busca primero en el **directorio actual** y, si no hay, en `sql/dump/` del repo.

| | |
|---|---|
| Cluster | `~/pgdata-agrodash` (PostgreSQL 18, nativo, sin Docker) |
| Puerto | **5433** (5432 lo ocupa otra DB de la máquina) |
| DB / user | `agrodash_control` / `postgres`, **sin password** (`trust`, solo localhost) |
| Conexión | `postgresql://postgres@127.0.0.1:5433/agrodash_control` |
| Dump | `sql/dump/agrodash_control_2026-06-30.dump` (638 MB, gitignored) |

Overrides por entorno: `AGRODASH_PGDATA`, `AGRODASH_PGPORT`, `AGRODASH_DB`,
`AGRODASH_USER`, `AGRODASH_RESTORE_JOBS`.

## Tamaño restaurado (medido 2026-08-14)

**5.046 MB**, `readings` = **21.314.662 filas** (1.593 MB de datos + **3.143 MB de índices**).
El restore tarda ~1 min con `-j 4`.

Esto **descarta meter el dump completo en Supabase**: el proyecto `jijklguopafevyucogro` es
**Free tier (límite 500 MB)** y ya usa 365 MB — el dump es 10× el límite, y pasarse deja el
proyecto en read-only. La vía correcta es la que ya implementa `pronostico/etl.py`: leer esta
réplica local y subir a Supabase **solo los targets de San Carlos**
(`lecturas_ambientales_sc`), respetando la separación de regiones de
[[arquitectura-regiones]].

## Trampas encontradas

- **El socket unix debe ir dentro del data dir** (`-k ~/pgdata-agrodash`): `/run/postgresql`
  no existe sin el unit de systemd y postgres muere con
  `could not create lock file "/run/postgresql/.s.PGSQL.5433.lock"`.
- **`pg_restore` 18.x contra un server ≤16 falla** con
  `unrecognized configuration parameter "transaction_timeout"`. Contra el cluster nativo
  (PG 18) no pasa; si se restaura en un `postgres:16` de Docker hay que usar el `pg_restore`
  del propio contenedor.
- El dump es de **PostgreSQL 14.23** — restaurar en 16/18 funciona (forward-compatible).

## Límite: la data está congelada

El dump es del **2026-06-30**, y las cajas SC dejaron de reportar el **2026-07-23**
([[agrodash]]). El store de Supabase ya tenía hasta el 23-jul, así que esta réplica **no
aporta datos nuevos hacia adelante**: el ETL incremental corre verde trayendo 0 filas.
Su valor es el **backfill hacia atrás**, ya aprovechado.

## Backfill hecho (2026-08-14)

`etl --full --variable irradiancia` con `BACKFILL_SINCE=2025-11-01`: **73.290 filas**
insertadas, Supabase 365 → **395 MB**. La historia de irradiancia pasó de arrancar el
2026-05-01 a arrancar el **2025-11-28** (con el gap conocido de ene–feb).

**Humedad de suelo NO se backfilleó a propósito:** son 936.295 filas ≈ 375 MB y el store
es Free tier (500 MB, hoy 395 usados → quedan ~105 MB). Por eso existe el flag
`--variable`: `--full` sin filtro habría arrastrado ambas y reventado la cuota.

## Verificación en producción (2026-08-18)

Comprobado contra la EC2 y el store, no solo contra los commits:

| Qué | Resultado |
|---|---|
| Contenedor | `agrodash-pg` (`postgres:16`) **Up 3 días**, `127.0.0.1:5433` |
| Contenido | **21.314.662 filas**, 5.046 MB, último dato `2026-06-30 09:39:41` |
| Fuente del ETL | `DATABASE_URL` → `127.0.0.1:5433`; la línea de Cartago sigue comentada y el backup existe |
| Temporizadores | `forecast-etl` cada 15 min (última corrida **exit 0**, 0 filas nuevas) · `forecast-refresh` cada 6 h |
| Frescura | `/salud/ingesta` → **HTTP 503, estado `stale`**: último dato 2026-07-23, **629 h de edad** |
| Último error del ETL | 2026-08-14 21:09 · `fallo:fuente` contra el puerto 9999 — la **prueba deliberada** de la regresión, no un fallo real |
| Store | 395 MB · irradiancia 191.676 filas desde **2025-11-28** · humedad 693.930 desde 2026-05-01 |
| Disco de la EC2 | 22 GB usados de 50 (43 %); la réplica se lleva ~5 GB |

El 503 de `/salud/ingesta` es **el estado correcto**, no una regresión: refleja que el dato lleva
26 días congelado. Volverá a verde solo cuando Cartago esté arriba **y** las cajas SC vuelvan a
reportar — son dos problemas distintos y esta réplica no resuelve ninguno.

Resumen ejecutivo de todo el cambio: `../../analisis/cambios-2026-08-18.html`.

Relacionado: [[agrodash]], [[pipeline-tiempo-real]], [[arquitectura-regiones]],
[[conectividad-tailnet]], [[estado]], [[cuota-store-supabase]], [[superficie-expuesta]].
