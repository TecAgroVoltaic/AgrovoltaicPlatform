"""Aparejos comunes a toda la suite.

## Por que el cache se vacia entre pruebas, y por que es AUTOUSE

`calidad.contexto.confianza` cachea por `(desde, hasta, variables, fuente)` con un
TTL de segundos (ver `historico.cache`). Una suite corre en milisegundos, o sea
MUY dentro de ese TTL, y varias pruebas preguntan por el mismo rango con la misma
lista de columnas cambiando solo el doble de la base. Sin vaciar, la segunda
prueba recibiria la respuesta que calculo la primera con OTROS datos y fallaria
por un motivo que no tiene nada que ver con lo que quiere fijar.

Va como `autouse` a proposito: una prueba nueva que toque confianza no tiene que
acordarse de pedir el aparejo. Acordarse es justo lo que falla en silencio.
"""
from __future__ import annotations

import pytest

from historico import cache


@pytest.fixture(autouse=True)
def _cache_limpio():
    """Cada prueba arranca y termina sin nada guardado de la anterior."""
    cache.invalidar_todo()
    yield
    cache.invalidar_todo()
