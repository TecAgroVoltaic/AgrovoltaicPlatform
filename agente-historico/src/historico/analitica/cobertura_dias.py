"""Que dias del calendario tienen al menos una lectura. Para el selector de fechas.

Es la respuesta mas liviana de `analitica`: sin ventana, sin confianza y sin sobre de
`resultado`, porque es metadato del historico entero y no la lectura de un periodo.
La consola la usa para deshabilitar en el calendario los dias en que no hay nada que
mirar.

Se lee de las tablas CRUDAS (`monitoreo_sc_electrico`, `radiacion_sc_15s`) y no de
las vistas corregidas: un dia con lecturas que la correccion anula sigue siendo un
dia con datos, y la pregunta es si el logger grabo. La fecha es `"timestamp"::date`
SIN conversion de zona, el mismo criterio que `calidad.contexto`: las tablas PV
guardan la hora local del sitio etiquetada +00, asi que convertir correria el dia.

El SQL vive en `_consultar` y el criterio en `componer`, que se prueba sin base.
"""
from __future__ import annotations

from datetime import date, timedelta

from historico import cache, db

ELECTRICO, RADIACION = "electrico", "radiacion"

_SQL_DIAS_ELECTRICO = """
    SELECT DISTINCT "timestamp"::date AS fecha
      FROM monitoreo_sc_electrico
     ORDER BY fecha
"""
_SQL_DIAS_RADIACION = """
    SELECT DISTINCT "timestamp"::date AS fecha
      FROM radiacion_sc_15s
     ORDER BY fecha
"""

# Clave constante: la respuesta no depende de parametros, asi que una entrada sirve a
# todas las peticiones y la coalescencia hace que N simultaneas cuesten UNA consulta.
_CACHE = cache.registrar(cache.CacheBreve())
_CLAVE = "analitica.cobertura_dias"


def _iso(valor: date | str) -> str:
    """La fecha como `YYYY-MM-DD`, venga como `date` o como el ISO de `db.query`."""
    return valor.isoformat() if isinstance(valor, date) else str(valor)[:10]


def _ordenados(fechas: list[date | str]) -> list[str]:
    """Fechas ISO unicas y en orden ascendente. ISO ordena igual como texto."""
    return sorted({_iso(fecha) for fecha in fechas})


def componer(fechas_electrico: list[date | str],
             fechas_radiacion: list[date | str]) -> dict:
    """La respuesta del endpoint a partir de los dias de cada fuente. Pura, sin DB.

    `hasta` es EXCLUSIVO (ultimo dia con datos + 1), igual que las ventanas del resto
    de `analitica`. Sin ningun dato, `desde` y `hasta` van en None: no hay rango que
    inventar.
    """
    electrico = _ordenados(fechas_electrico)
    radiacion = _ordenados(fechas_radiacion)
    dias = _ordenados(electrico + radiacion)
    desde = dias[0] if dias else None
    hasta = (date.fromisoformat(dias[-1]) + timedelta(days=1)).isoformat() if dias else None
    return {
        "desde": desde,
        "hasta": hasta,
        "n_dias": len(dias),
        "dias": dias,
        "fuentes": {ELECTRICO: electrico, RADIACION: radiacion},
    }


def _consultar() -> dict:
    """Las dos tablas en paralelo: son independientes y cada viaje al pooler cuesta."""
    filas_electrico, filas_radiacion = db.en_paralelo(
        lambda: db.query(_SQL_DIAS_ELECTRICO),
        lambda: db.query(_SQL_DIAS_RADIACION),
    )
    return componer([fila["fecha"] for fila in filas_electrico],
                    [fila["fecha"] for fila in filas_radiacion])


def calcular() -> dict:
    """Los dias con al menos una lectura, en total y por fuente. Cacheado (TTL corto)."""
    return _CACHE.obtener(_CLAVE, _consultar)
