"""`/analitica/rendimiento`: Performance Ratio diario y mensual (R1) para la consola."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from historico import tools
from historico.analitica import rendimiento, ventana
from historico.rutas.dependencias import _verificar_api_key

router = APIRouter(dependencies=[Depends(_verificar_api_key)])

# Los dos arreglos, en el orden en que los nombra el documento. Publicos los dos:
# el orden de las claves del payload no puede depender de un detalle de `tools`.
_ARREGLOS_PR = (rendimiento.INCLINADO, rendimiento.VERTICAL)

# Lo que se dice cuando los arrays NO viajan, para que quien lea la respuesta sepa
# que existen y como pedirlos. Reemplaza al recorte que la tool pega en su `nota`,
# que apunta a la API y aca ya seria un circulo.
_SIN_DETALLE = (" Esta respuesta trae los totales, los meses y el criterio; el "
                "renglon dia a dia y el detalle de cada dia descartado se piden "
                "con `detalle=true`.")


@router.get("/analitica/rendimiento")
def analitica_rendimiento(desde: str | None = Query(None),
                          hasta: str | None = Query(None),
                          insumo: str = Query(rendimiento.GHI),
                          detalle: bool = Query(False)) -> dict:
    """Performance Ratio DIARIO Y MENSUAL (R1), con las seis variantes del insumo.

    `insumo` elige cual de las tres irradiancias se detalla dia a dia; los meses y el
    total llevan siempre las seis combinaciones, igual que en el modulo.

    ## Por que `detalle` y no siempre

    Los dos arrays que la tool recorta son el renglon dia a dia (228 dias del
    historico, ~11 KB) y el anexo de dias descartados con su motivo. El tablero
    dibuja el total y los meses, y no tiene por que pagar el peso de un anexo que no
    muestra; la vista comparativa si lo necesita y lo pide con `detalle=true`. Por
    defecto va en `false`: el que no sabe que existe recibe la respuesta liviana.

    ## Por que se reusan las reducciones de la tool

    Cuatro consolas derivan su esquema del payload de `performance_ratio`, asi que
    el cuerpo tiene que ser EL MISMO mas los arrays. Reescribir aca `_pr` y `_mes`
    seria la forma segura de que las dos formas se separen sin que nadie lo note:
    llamandolas, un cambio en la tool llega solo. Se usan sus nombres privados a
    conciencia; el acoplamiento es justo el que se busca.
    """
    completo = rendimiento.calcular(ventana.crear(desde, hasta), insumo)
    reducir_arreglo, reducir_mes = tools.performance._pr, tools.performance._mes
    cuerpo = {
        **completo,
        "total": {fuente: {ins: {arr: reducir_arreglo(completo["total"][fuente][ins][arr])
                                 for arr in _ARREGLOS_PR}
                           for ins in rendimiento.INSUMOS}
                  for fuente in rendimiento.FUENTES_ENERGIA},
        "por_mes": [reducir_mes(mes) for mes in completo["por_mes"]],
    }
    if detalle:
        return cuerpo
    return {**{k: v for k, v in cuerpo.items() if k != "por_dia"},
            "dias": {k: v for k, v in completo["dias"].items()
                     if k != "detalle_descartados"},
            "nota": completo["nota"] + _SIN_DETALLE}
