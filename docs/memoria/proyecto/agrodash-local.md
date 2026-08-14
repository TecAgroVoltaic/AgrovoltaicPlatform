---
name: agrodash-local
description: Réplica local de AgroDash restaurada desde el dump — cluster nativo en el puerto 5433 levantado con scripts/agrodash_local.sh; es la fuente del ETL mientras Cartago y el rig están caídos
categoria: proyecto
---

# Réplica local de AgroDash (fuente del ETL cuando Cartago está off)

**Creada 2026-08-14.** Ni el server vivo de Cartago (`100.101.177.71`) ni la réplica del
rig (`100.100.130.47`) están accesibles: la máquina de trabajo no tiene Tailscale ni el
contenedor `agrodash-pg`. Sin fuente, el ETL de [[pipeline-tiempo-real]] no puede correr.
La solución es restaurar el dump localmente y apuntar ahí `DATABASE_URL`.

## Cómo levantarla

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
([[agrodash]]). El store de Supabase ya tiene hasta el 23-jul, así que esta réplica **no
aporta datos nuevos hacia adelante**: sirve para backfill hacia atrás (antes del
2026-05-01, piso del `BACKFILL_SINCE` actual) y para que el ETL tenga contra qué correr.

Relacionado: [[agrodash]], [[pipeline-tiempo-real]], [[arquitectura-regiones]],
[[conectividad-tailnet]], [[estado]].
