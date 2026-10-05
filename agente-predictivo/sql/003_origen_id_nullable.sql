-- 003 — `origen_id` pasa a ser opcional
--
-- POR QUE
-- Hasta ahora la unica fuente del ETL era Postgres (AgroDash directo o una replica
-- del dump), y de ahi salia `readings.id` para cada lectura. Desde 2026-08-25 la
-- fuente puede ser la API publica de AgroDash, que expone `bucket` y `value` pero
-- NO el id de la fila de origen.
--
-- Se eligio dejar la columna en NULL en vez de sintetizar un uuid: un id fabricado
-- es indistinguible de uno real, y quien intentara cruzarlo contra `readings` no
-- encontraria nada sin ninguna senal de por que. NULL dice la verdad: "esta fila
-- vino por un camino que no expone el id de origen".
--
-- QUE NO CAMBIA
-- Las 885.606 filas historicas conservan su `origen_id`. La idempotencia del ETL
-- ya no depende de esta columna desde la 002: va por la PK `(serie_id, ts)`.
--
-- REVERSIBLE
--   UPDATE lecturas_ambientales SET origen_id = gen_random_uuid() WHERE origen_id IS NULL;
--   ALTER TABLE lecturas_ambientales ALTER COLUMN origen_id SET NOT NULL;
-- (pero eso inventaria los ids que esta migracion existe para no inventar)

ALTER TABLE lecturas_ambientales
    ALTER COLUMN origen_id DROP NOT NULL;

COMMENT ON COLUMN lecturas_ambientales.origen_id IS
    'readings.id de AgroDash. Sin indice a proposito: es trazabilidad, no clave de '
    'busqueda. NULL = ingerida por la API publica de AgroDash, que no expone el id '
    'de origen (ver ingesta/api_agrodash.py).';
