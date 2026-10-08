"""Lectura en streaming: filas de a una, sin traer el resultado entero. Para EXPORTAR."""
from __future__ import annotations

from typing import Iterator

from historico.db import conexion


def en_streaming(sql: str, params: tuple = ()) -> Iterator[tuple]:
    """Filas de a UNA, sin traer el resultado entero a memoria. Para EXPORTAR.

    `query()` hace `fetchall()`, y para lo que consumen las vistas (agregados de
    unos cientos de filas) es lo correcto. Para bajarse una relacion completa no:
    la radiacion son 103.678 filas y el archivo se puede empezar a escribir con la
    primera, sin esperar a la ultima ni tener las 103.678 en el proceso a la vez.

    ## Por que `stream()` y NO un cursor de servidor, que es lo que uno buscaria

    Medido el 2026-09-04 sobre `v_sc_radiacion_calibrada` entera (103.678 filas)
    contra el pooler de Supabase:

        cur.stream()                   2,83 s    pico   0,0 MB
        query() / fetchall             4,11 s    pico  93,2 MB
        cursor de servidor con nombre  9,02 s    pico   4,8 MB

    El cursor con nombre pierde por lo mismo que gobierna todo este modulo: cada
    `FETCH` es un viaje de ~225 ms, y veintiun lotes de 5.000 filas son cinco
    segundos de puro ida y vuelta. `stream()` usa el modo de fila unica de libpq:
    un solo viaje, y las filas se van consumiendo del socket. Ademas no necesita
    transaccion, que en este pool (autocommit) es la diferencia entre funcionar y
    no: un `DECLARE CURSOR` fuera de un bloque transaccional es un error de SQL.

    Devuelve TUPLAS, no dicts, y sin pasar por `_limpiar`: quien exporta formatea
    cada tipo a su manera (datenum, ISO, NaN) y un dict por fila serian 60 MB de
    claves repetidas.

    La conexion queda prestada mientras se recorra el generador, y vuelve al pool
    al agotarlo o al cerrarlo. Cortar antes de tiempo es seguro: esta verificado
    que la conexion vuelve sana y se puede reusar enseguida.
    """
    with conexion._get_pool().connection() as conn:
        with conn.cursor() as cur:
            yield from cur.stream(sql, params)
