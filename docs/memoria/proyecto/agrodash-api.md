---
name: agrodash-api
description: La API pública de AgroDash es la fuente del ETL desde 2026-08-26; reemplaza a la réplica del dump y devuelve dato vivo, pero sus timestamps son centros de bin y solo son exactos en ventanas cortas
categoria: proyecto
actualizado: 2026-08-26
tags: [agrodash, etl, ingesta, fuente, api]
---

# AgroDash por HTTP: la fuente viva

**2026-08-26.** El ETL del Agente Predictivo dejó de leer la réplica del dump y pasa a
leer la **API pública de AgroDash**:

```
https://agrodash.nm.35-208-114-233.nip.io/api/v1
```

Es la app Rust/Axum del equipo de Cartago, la misma que alimenta su dashboard. Sin
autenticación, sin el header `Origin` que pide la doc vieja, y sin tailnet. IP pública
de Google Cloud, TLS de Let's Encrypt.

## Por qué se cambió

La réplica del dump quedó congelada el 2026-06-30 y el store llevaba **33 días sin
avanzar**, mientras el ETL corría **verde cada 15 minutos trayendo cero filas**. La
premisa que sostenía ese arreglo (*"Cartago está caído"*) era falsa: lo inalcanzable
era el **puerto Postgres por tailnet**, no Cartago. Su app estaba sirviendo dato de
hace 30 segundos todo ese tiempo.

Las cajas SC sí estuvieron caídas, pero del **24-jul al 4-ago**. Reanudaron el
**2026-08-05 16:49** y nadie se enteró porque la fuente era un snapshot.

Lección que vale más que el cambio: **un timer en `SUCCESS` no prueba que entren
datos**. Lo que lo prueba es la edad del último dato (`/predictivo/salud/ingesta`).

## La trampa: los timestamps no son los reales

`GET /readings` **no devuelve el instante de la lectura**. Devuelve el **centro del bin**
de una grilla que la API arma con `(ventana, points)`, y el ancho del bin se topa para
no pasar de ~7200 buckets por respuesta.

Medido contra el store (sensor `45a5c0a7…`, 2026-07-22 09:00-10:00, 12 lecturas cuyo
`created_at` real ya estaba ingerido por el camino Postgres):

| Ventana pedida | Ancho del bin | `bucket` devuelto | ¿Es el instante real? |
|---|---|---|---|
| 1 h | 1 s | `09:00:04.500` | **Sí** (created_at + 0,5 s) |
| 2 h | 1 s | `09:00:04.500` | **Sí** |
| 3 h | 2 s | `09:00:05` | no, corrido |
| 24 h | 17,28 s | `09:00:10.500` | no, corrido 6 s |

De ahí las dos reglas de `ingesta/api_agrodash.py`:

1. **Ventanas de 7200 s como máximo.** Solo así el bin baja a 1 s y truncar el `.500`
   recupera el `created_at` exacto.
2. **`n == 1` no alcanza como guarda.** A 3 h los timestamps ya están corridos y `n`
   sigue siendo 1, porque las lecturas están a 5 min y nunca comparten bin. La guarda
   que sí distingue es exigir que **todo bucket termine en `.500`**.

Por qué importa tanto: la PK del store es `(serie_id, ts)`. Un timestamp corrido medio
segundo **no colisiona**, así que cada corrida incremental (que re-lee 2 h de solape)
insertaría duplicados de todo lo ya ingerido. Corrupción silenciosa, no un error
visible. Por eso las guardas **levantan** y dejan `fallo:fuente` en `agente_log`.

## Otras trampas verificadas

- **`from`/`to` con sufijo `Z` dan HTTP 400** (`trailing input`), aunque la doc vieja
  los escribe así. Van sin sufijo.
- **Los timestamps son hora local de Costa Rica, no UTC**, al revés de lo que advierte
  la doc vieja en un recuadro. Verificado contra el reloj y contra la curva diurna
  (amanecer 05:45, pico 12:00, ocaso 18:15). Coincide con lo que el ETL ya asumía.
- La respuesta trae campos no documentados: `n`, `min`, `max` por bucket.

## Lo que esta fuente no puede dar

| Columna | Antes (Postgres) | Ahora (API) |
|---|---|---|
| `origen_id` | `readings.id` | **NULL** (migración 003 la hizo nullable) |
| `ts_medicion` | `timestamp_real` | **NULL** (el esquema ya lo contemplaba) |

Se eligió NULL sobre sintetizar un uuid: un id fabricado es indistinguible de uno real
y quien lo cruzara contra `readings` no encontraría nada, sin ninguna señal de por qué.
Las 885.606 filas históricas conservan su `origen_id`.

## Cómo se validó

No contra mocks: contra el store, que tiene 885.606 filas ingeridas por el camino
Postgres. Se tiró por el adaptador una ventana que el store ya tenía y se comparó el
**md5 de los timestamps**:

| Variable | Ventana | Filas | md5 API = md5 store | Suma de valores |
|---|---|---|---|---|
| irradiancia | 20 a 22-jul (3 días) | 729 = 729 | `6e95306c…` ✓ | 85.111,02 = 85.111,02 |
| humedad_suelo | 22-jul (1 día) | 1.862 = 1.862 | `cdc5f98e…` ✓ | 39.402.784 = 39.402.784 |

2.591 lecturas, cero divergencia. Eso es lo que garantiza que el `ON CONFLICT
(serie_id, ts) DO NOTHING` siga deduplicando.

## Resultado (2026-08-26)

| | Antes | Después |
|---|---|---|
| `/predictivo/salud/ingesta` | **503** `stale`, congelada 33,5 días | **200** `ok`, `congelada: false` |
| Edad del último dato | 804 h | **minutos** |
| irradiancia | 191.676 filas, tope 23-jul | 224.970 (**+33.096** por API) |
| humedad_suelo | 693.930 filas, tope 23-jul | 881.250 (**+187.180** por API) |
| Store Supabase | 152 MB | 169 MB (**33,8 %** del Free tier) |

Los 11 canales quedaron **uniformes** (5 × 176.222 y 6 × 37.462), que es señal de que no
faltó ninguno: los canales de una caja reportan juntos.

La corrida automática del timer, ya sin intervención, tarda **20 s** y demuestra que el
solape deduplica: leyó 336 de irradiancia e insertó 198, leyó 900 de humedad e insertó
140. Las diferencias son exactamente las 2 h de solape que ya estaban.

## Operación

- La fuente se elige por el **esquema** de `DATABASE_URL`, sin tocar código. Volver al
  dump es descomentar una línea (backup: `predictivo.env.bak-dump-20260826`).
- **El backfill no entra en el timer**: `predictivo-etl.service` tiene
  `TimeoutStartSec=10min` y un backfill de un mes son miles de requests. La corrida de
  irradiancia tardó **1.399 s (23 min)**. El estado estable son ~22 requests por corrida.

### Dos trampas del backfill, cada una costó una corrida

**1. `predictivo-refresh.timer` mata cualquier `docker exec` largo.** Corre cada 6 h y
hace `up -d --force-recreate`: destruye el contenedor, y con él el proceso del backfill.
Murió a los 16 min, y **de la peor forma posible**: sin excepción, sin fila
`fallo:` en `agente_log` y con el log de stdout vacío, porque lo mataron desde afuera y
el `except` nunca corrió. Solo se notó comparando filas esperadas contra filas escritas.
La solución no es parar ese timer sino **no correr dentro del contenedor de servicio**:

```bash
docker compose -f docker-compose.predictivo.yml run --rm --no-deps \
  -e BACKFILL_SINCE=2026-07-23 predictivo \
  python -m predictivo.etl --full --variable humedad_suelo
```

**2. El watermark es por VARIABLE, no por sensor.** Cuando ese backfill murió a medias
dejó 2 canales completos hasta hoy, 1 a medias y 2 sin tocar. `_watermark` hace
`max(ts) WHERE variable = ...`, o sea que toma el del canal MÁS adelantado: un re-run
incremental habría arrancado desde hoy y **saltado en silencio la historia de los otros
tres**. Después de un backfill interrumpido hay que ir con `--full` + `BACKFILL_SINCE`
acotado al tramo, nunca con el incremental.
- El adaptador es **secuencial a propósito**: en régimen normal son segundos, y meter
  concurrencia solo complica el caso que no importa.
- **La API no tiene SLA ni autenticación.** Es de un equipo ajeno y puede cambiar sin
  aviso. Por eso las guardas son duras: que falle ruidoso, no que escriba corrido.

## Lo que NO se retiró

La réplica `agrodash-pg`, el dump de 609 MB y `agrodash_local.sh` siguen en pie como
vuelta atrás. Retirarlos (y recuperar ~6 GB del disco) es una decisión posterior,
cuando la API acumule semanas de estabilidad. Ver [[agrodash-local]].

Relacionado: [[agrodash]], [[agrodash-local]], [[pipeline-tiempo-real]],
[[servidor-propio]], [[conectividad-tailnet]], [[cuota-store-supabase]].
