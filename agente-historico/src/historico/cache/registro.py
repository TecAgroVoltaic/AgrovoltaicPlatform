"""Los caches vivos del proceso, para que una escritura en la base los vacie a todos."""
from __future__ import annotations

from historico.cache.breve import CacheBreve

# Los caches vivos del proceso. `db.ejecutar*` los invalida a todos: es una lista y
# no una llamada suelta para que agregar un cache nuevo no obligue a acordarse de
# engancharlo a la invalidacion (olvidarlo fallaria en silencio, sirviendo dato viejo).
_REGISTRADOS: list[CacheBreve] = []


def registrar(cache: CacheBreve) -> CacheBreve:
    """Anota el cache para que una escritura en la base lo vacie. Devuelve el mismo."""
    _REGISTRADOS.append(cache)
    return cache


def invalidar_todo() -> None:
    """Vacia TODOS los caches registrados. La llama `db` al escribir."""
    for cache in _REGISTRADOS:
        cache.invalidar_todo()
