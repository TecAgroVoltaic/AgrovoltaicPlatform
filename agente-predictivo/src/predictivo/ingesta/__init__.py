"""
De DONDE lee el ETL: eleccion de la fuente por el ESQUEMA de la URL.

SRP: este paquete solo sabe traer lecturas crudas de AgroDash. No conoce el store,
no sabe que es una serie ni una variable normalizada: eso es de `etl.py`.

Por que existe. Hasta 2026-08-25 la unica forma de leer AgroDash era Postgres, y
`etl.py` tenia el SQL adentro. Cuando aparecio la API publica de Cartago hicieron
falta DOS caminos, y la eleccion tenia que seguir siendo lo que ya era: cambiar una
URL. De ahi el despacho por esquema.

    postgresql:// | postgres://   -> ingesta.postgres     (DB directa o replica)
    http://       | https://      -> ingesta.api_agrodash (API publica de Cartago)

Cualquier otro esquema es un error EXPLICITO. Un default silencioso aca significaria
ingerir de la fuente equivocada sin que nadie se entere, que es justo el modo de
falla que este proyecto ya sufrio (nueve dias de ETL fallando en silencio).

El contrato que las dos implementaciones cumplen es una sola funcion:

    lecturas(caja, tipo, desde) -> iterable de
        (origen_id, caja, sensor_id, sensor_type, ts, ts_medicion, valor)

`ts` y `ts_medicion` salen NAIVE en hora local de Costa Rica, tal como los guarda
AgroDash. Etiquetarlos es responsabilidad de `etl.py` (`_localizar`), que es donde
vive la politica de timezone.
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator, Protocol, runtime_checkable
from urllib.parse import urlsplit

from predictivo.ingesta import api_agrodash, postgres

ESQUEMAS_POSTGRES = frozenset({"postgresql", "postgres"})
ESQUEMAS_HTTP = frozenset({"http", "https"})

TIPO_POSTGRES = "postgres"
TIPO_HTTP = "http"


@runtime_checkable
class FuenteLecturas(Protocol):
    """Lo unico que el ETL le pide a una fuente."""

    def lecturas(self, caja: str, tipo: str, desde) -> Iterator[tuple]:
        ...


def clasificar(url: str) -> str:
    """TIPO_POSTGRES | TIPO_HTTP. Levanta si el esquema no es ninguno de los dos.

    Se mira SOLO el esquema: es lo unico que decide con que hablar. El host, el
    puerto y la base son cosa de cada implementacion.
    """
    esquema = (urlsplit(url).scheme or "").lower()
    if esquema in ESQUEMAS_POSTGRES:
        return TIPO_POSTGRES
    if esquema in ESQUEMAS_HTTP:
        return TIPO_HTTP
    raise ValueError(
        f"Esquema de fuente no soportado: {esquema or '(ninguno)'!r}. "
        f"Se espera postgresql:// o postgres:// (DB directa o replica) "
        f"o http:// o https:// (API publica de AgroDash)."
    )


@contextmanager
def abrir(url: str, timeout_seg: int = 15) -> Iterator[FuenteLecturas]:
    """Abre la fuente que corresponda a `url` y la cierra al salir.

    Es un context manager porque el camino Postgres tiene una conexion que hay que
    soltar. El HTTP no la tiene, pero cumple la misma forma para que `etl.py` no
    tenga que preguntar cual es cual.
    """
    if clasificar(url) == TIPO_POSTGRES:
        with postgres.abrir(url, timeout_seg) as fuente:
            yield fuente
    else:
        with api_agrodash.abrir(url, timeout_seg) as fuente:
            yield fuente
