"""Las series que se juzgan: una variable, o todas las de UNA relacion en un SELECT."""
from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from historico import db
from historico.analitica import catalogo
from historico.calidad.pruebas.consultas.comun import (
    _columna_intervalo,
    _como_fecha,
    _origen,
    _sin_etiqueta,
)
from historico.calidad.pruebas.contrato import CRUDO, FUENTE_SIN_ORIGEN, Serie


def serie(clave: str, desde: date | str, hasta: date | str,
          crudo: bool = False) -> Serie:
    """Las lecturas de una variable en [desde, hasta), listas para las pruebas.

    `crudo=True` lee la tabla sin corregir que registra el catalogo, que es lo
    unico que hace medible la familia de validez fisica.
    """
    variable = catalogo.obtener(clave)
    if not variable.disponible:
        # Sin origen no hay consulta que hacer, y la serie vacia es la entrada
        # correcta: el corredor la marca `sin_fuente` con el motivo del catalogo.
        return Serie(variable=variable, fuente=FUENTE_SIN_ORIGEN,
                     fecha=_como_fecha(desde), origen=CRUDO)

    relacion, columna, procedencia = _origen(variable, crudo)
    intervalo = _columna_intervalo(relacion)
    filas = db.query(
        f'SELECT "timestamp" AS marca, {columna} AS valor, {intervalo} AS intervalo '
        f'  FROM {relacion} '
        f' WHERE "timestamp" >= %s AND "timestamp" < %s '
        f' ORDER BY "timestamp"',
        (desde, hasta))

    return Serie(
        variable=variable,
        fuente=variable.relacion_cruda or variable.relacion,
        fecha=_como_fecha(desde),
        origen=procedencia,
        marcas=[_sin_etiqueta(f["marca"]) for f in filas],
        valores=[f["valor"] for f in filas],
        intervalos=[f["intervalo"] for f in filas])


def series_de(relacion: str, claves: Sequence[str], desde: date | str,
              hasta: date | str, crudo: bool = False) -> list[Serie]:
    """Todas las columnas de UNA relacion en un solo SELECT: N claves, N `Serie`.

    Quien llama AGRUPA las claves por relacion; esto lo verifica en vez de
    confiar. Un grupo mal armado pediria una columna que la tabla no tiene (que
    revienta y se ve) o, peor, la misma columna con el origen equivocado, que no
    revienta: la validez fisica leida de una vista corregida sale vacia y se lee
    como un aprobado.

    Las variables sin fuente no entran aca: no hay relacion que consultar y su
    serie vacia la arma `serie()`, que es donde esta explicado por que.
    """
    if not claves:
        return []

    variables = [catalogo.obtener(c) for c in claves]
    origenes: dict[str, tuple[str, str]] = {}
    for variable in variables:
        if not variable.disponible:
            raise ValueError(
                f"{variable.clave!r} no tiene fuente ({variable.fuente_ausente}): "
                f"pedila con `serie()`, que devuelve la serie vacia que el "
                f"corredor marca `sin_fuente`")
        origen, columna, procedencia = _origen(variable, crudo)
        if origen != relacion:
            raise ValueError(
                f"{variable.clave!r} vive en {origen!r} y no en {relacion!r}: "
                f"agrupa las claves por relacion antes de pedirlas juntas")
        origenes[variable.clave] = (columna, procedencia)

    # La columna se renombra a la CLAVE del catalogo: en la tabla cruda la
    # irradiancia es `irradiancia_incidente` y en el catalogo
    # `irradiancia_incidente_wm2`, asi que sin el alias habria que rehacer la
    # traduccion al repartir las filas. Los dos nombres salen de la allowlist.
    columnas = ", ".join(f"{columna} AS {clave}"
                         for clave, (columna, _) in origenes.items())
    intervalo = _columna_intervalo(relacion)
    filas = db.query(
        f'SELECT "timestamp" AS marca, {columnas}, {intervalo} AS intervalo '
        f'  FROM {relacion} '
        f' WHERE "timestamp" >= %s AND "timestamp" < %s '
        f' ORDER BY "timestamp"',
        (desde, hasta))

    # Marcas e intervalos son los MISMOS para todas las columnas de la relacion, y
    # las listas se comparten en vez de copiarse: `Serie` es inmutable y ninguna
    # prueba las escribe. Con 94.868 filas repartidas en seis variables, rehacerlas
    # por variable multiplica por seis la memoria sin cambiar un solo valor.
    marcas = [_sin_etiqueta(f["marca"]) for f in filas]
    intervalos = [f["intervalo"] for f in filas]
    return [
        Serie(variable=variable,
              fuente=variable.relacion_cruda or variable.relacion,
              fecha=_como_fecha(desde),
              origen=origenes[variable.clave][1],
              marcas=marcas,
              valores=[f[variable.clave] for f in filas],
              intervalos=intervalos)
        for variable in variables
    ]
