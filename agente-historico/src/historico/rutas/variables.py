"""`/analitica/variables`: el CATALOGO de lo que la consola puede pedir y graficar."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from historico.analitica import catalogo, fuente
from historico.rutas.dependencias import _verificar_api_key

router = APIRouter(dependencies=[Depends(_verificar_api_key)])

# Los campos del catalogo que la consola necesita para OFRECER una variable, y no
# mas: los limites fisicos, la relacion y las columnas crudas son interior del
# analisis, y publicarlos ataria la API al esquema de la base.
_CAMPOS_VARIABLE = ("clave", "etiqueta", "unidad", "familia",
                    "dato_desde", "dato_hasta", "hueco", "fuente_ausente")

_NOTA_VARIABLES = (
    "`graficable` dice si `/analitica/series` acepta esa clave, y se resuelve por la "
    "MISMA puerta que usa ese endpoint: no hay que deducirlo de `fuente_ausente`, que "
    "es el porque en prosa. `dato_desde`/`dato_hasta` acotan el tramo en que la "
    "variable EXISTE (fuera de el no es que falte el dato: el sensor no estaba, o la "
    "vista lo anula), y `hueco` cuenta el agujero INTERIOR, que un par de fechas no "
    "puede expresar. Con los tres, una vista vacia puede decir 'todavia no existia' en "
    "vez de 'no hay datos'. Esta es la lista buena: la tool `catalogo_variables` lee "
    "`diccionario_variables`, que trae nombres de COLUMNA CRUDA y no claves del "
    "catalogo."
)


def _graficable(clave: str) -> bool:
    """Si `/analitica/series` acepta esta clave. Se PREGUNTA, no se deduce.

    Se resuelve con `fuente.origen`, que es exactamente el gate que corre
    `analitica_series`. Deducirlo de `fuente_ausente` seria una segunda copia de la
    condicion, y la segunda copia es la que se queda vieja sin que nadie lo note.

    Solo se atrapa `ValueError`, que es el fallo DECLARADO (`FuenteAusente`). Si
    alguna vez una variable del catalogo apuntara a una relacion sin filtro en
    `fuente`, eso es un defecto de este repo: tiene que reventar aca y no disfrazarse
    de `graficable: false`, que lo dejaria escondido justo donde nadie mira.
    """
    try:
        fuente.origen(clave)
        return True
    except ValueError:
        return False


@router.get("/analitica/variables")
def analitica_variables() -> dict:
    """El CATALOGO: que variables se pueden pedir, desde cuando y con que huecos.

    Sin parametros y sin ventana: es metadato, no una lectura del periodo, asi que no
    lleva el sobre de `resultado` (no habria sobre que llenar).

    ## Por que no alcanza la tool `catalogo_variables`

    Esa tool lee `diccionario_variables`, que guarda nombres de COLUMNA CRUDA, no
    claves del catalogo, y la diferencia se mide en errores de la consola: seis de sus
    nombres (`irradiancia_incidente`, `irradiancia_reflejada`, los dos del SP722 y los
    dos detectores en mV) hacen que `/analitica/series` responda 400, y le faltan las
    cuatro POA, `cs_ghi_wm2` y `kt_star`, que si se pueden graficar. Guiarse por ella
    es ofrecer lo que no se puede dibujar y esconder lo que si. La fuente de verdad de
    lo que la API acepta es `analitica.catalogo`, que es de donde sale esto.
    """
    return {
        "variables": [{**{campo: getattr(var, campo) for campo in _CAMPOS_VARIABLE},
                       "graficable": _graficable(var.clave)}
                      for var in catalogo.CATALOGO.values()],
        "familias": sorted({var.familia for var in catalogo.CATALOGO.values()}),
        "nota": _NOTA_VARIABLES,
    }
