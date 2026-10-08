"""El listado PAGINADO de hallazgos de calidad, con orden total y total del filtro."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query

from historico import db
from historico.analitica import ventana
from historico.rutas.dependencias import _verificar_api_key

router = APIRouter(dependencies=[Depends(_verificar_api_key)])

# Con 26.023 hallazgos en el store, la vista tiene que poder recorrer y no solo
# filtrar. Y paginar sobre un orden AMBIGUO miente en silencio: si dos filas empatan
# en la clave de orden, la base puede devolverlas en distinto orden en dos consultas
# seguidas, y entre pagina y pagina una se repite y otra se pierde sin ningun error.
#
# El desempate es la PRIMARY KEY de `hallazgos_calidad` (fecha, fuente, variable,
# tipo): por definicion no hay dos filas que la compartan, asi que incluirla entera
# hace el orden TOTAL. Se conserva el criterio de la tool (graves primero, luego
# fecha descendente) y solo se COMPLETA con `fuente`, que era lo unico que faltaba
# de la PK. No es teorico: `dia_incompleto` del mismo dia lo escriben las dos
# fuentes, y esas dos filas empataban en los cuatro campos del orden viejo.
_ORDEN_HALLAZGOS = "(severidad = 'grave') DESC, fecha DESC, tipo, variable, fuente"

# Los tres filtros opcionales. Nombres LITERALES de este modulo, nunca entrada del
# usuario: los valores viajan como parametros.
_CAMPOS_FILTRO = ("tipo", "severidad", "variable")


def _filtro_hallazgos(desde, hasta, tipo: str | None, severidad: str | None,
                      variable: str | None) -> tuple[str, list]:
    """El WHERE que comparten el CONTEO y la PAGINA.

    Uno solo para los dos a proposito: un total calculado sobre un filtro distinto
    del de la pagina es peor que no dar total, porque se lee como si fuera cierto.
    """
    cond = ["fecha >= %s", "fecha < %s"]
    params: list = [desde, hasta]
    for campo, valor in zip(_CAMPOS_FILTRO, (tipo, severidad, variable)):
        if valor:
            cond.append(f"{campo} = %s")
            params.append(valor)
    return " AND ".join(cond), params


def _dia_unico(fecha: str) -> tuple[str, str]:
    """El atajo `fecha` como rango [dia, dia+1)."""
    try:
        d0 = date.fromisoformat(fecha)
    except ValueError as exc:
        # Mismo error tipado que usa el resto de la API para una fecha ilegible:
        # dos codigos distintos para el mismo problema obligan al cliente a
        # tratar cada ruta como un caso aparte.
        raise ventana.VentanaInvalida(
            "fecha_ilegible", f"fecha no es una fecha ISO (aaaa-mm-dd): {fecha!r}"
        ) from exc
    return d0.isoformat(), (d0 + timedelta(days=1)).isoformat()


@router.get("/calidad/hallazgos")
def calidad_hallazgos(fecha: str | None = Query(None), tipo: str | None = Query(None),
                      severidad: str | None = Query(None), variable: str | None = Query(None),
                      desde: str | None = Query(None), hasta: str | None = Query(None),
                      limite: int = Query(50, ge=1, le=200),
                      offset: int = Query(0, ge=0)) -> dict:
    """El detalle, PAGINADO. `fecha` es un atajo para pedir un solo dia.

    `total` es el del FILTRO y no el de la pagina: sin el, la vista corta el listado
    en silencio y el usuario no puede saber que hay mas, que es la version de
    interfaz del mismo problema que perseguimos en los datos. `pagina.hay_mas` y
    `pagina.siguiente_offset` lo dejan recorrer sin tener que hacer la cuenta.

    No delega en la tool `hallazgos_calidad` porque esa no pagina (su `limite` tiene
    techo 200 y no acepta `offset`): lo que si se comparte es `QUE_ES`, para que la
    traduccion de cada tipo no se bifurque en dos diccionarios.
    """
    from historico.periodo import rango
    from historico.tools import hallazgos
    if fecha:
        desde, hasta = _dia_unico(fecha)
    d, h = rango(desde, hasta)
    donde, params = _filtro_hallazgos(d, h, tipo, severidad, variable)
    # El conteo del filtro y la pagina se piden a la vez: dos viajes al pooler en
    # fila (~450 ms) para dos consultas que no se deben nada. Comparten el MISMO
    # `donde`, que es lo que garantiza que el total describa la pagina que se
    # devuelve. Ver `db.en_paralelo`.
    conteo, filas = db.en_paralelo(
        lambda: db.uno(f"SELECT count(*) AS n FROM hallazgos_calidad WHERE {donde}",
                       tuple(params)),
        lambda: db.query(
            f"""SELECT fecha, fuente, variable, tipo, severidad, n_afectadas, detalle
                  FROM hallazgos_calidad WHERE {donde}
                 ORDER BY {_ORDEN_HALLAZGOS}
                 LIMIT %s OFFSET %s""",
            tuple(params) + (limite, offset),
        ),
    )
    total = conteo.get("n", 0)
    for f in filas:
        f["que_es"] = hallazgos.QUE_ES.get(f["tipo"], "")
    hay_mas = offset + len(filas) < total
    return {
        "periodo": {"desde": d, "hasta": h},
        "total": total,
        "devueltos": len(filas),
        # Mismo significado que en la tool ("queda algo fuera de lo devuelto"),
        # contado desde donde arranca la pagina. En `offset=0` da lo mismo que antes.
        "truncado": hay_mas,
        "pagina": {"offset": offset, "limite": limite, "hay_mas": hay_mas,
                   "siguiente_offset": offset + len(filas) if hay_mas else None},
        "orden": _ORDEN_HALLAZGOS,
        "hallazgos": filas,
    }
