"""Analitica: un endpoint GET por ALGORITMO, no por vista.

Granulares a proposito. La consola compone cada pantalla desde Server Components
con `Promise.all`, asi que un endpoint por vista solo acoplaria la API a un layout
que va a cambiar, y obligaria a recalcular cosas que la pantalla de al lado ya
pidio. Cada uno devuelve el sobre completo de `analitica.resultado` (ventana +
confianza + payload), arrays incluidos: aca SI viajan, porque el que consume es el
que dibuja. La version recortada para el LLM esta en `tools`.

Todos son de SOLO LECTURA y comparten el mismo par de parametros de rango. Los
errores de parametro los traduce `historico.errores`, no un try/except por ruta.
El catalogo de variables y el Performance Ratio viven en sus propios routers.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from historico import tools
from historico.analitica import (
    carpeta, cobertura_dias, comparativa, completitud, correlacion, crestas,
    distribucion, resumen, series, ventana,
)
from historico.rutas.dependencias import _verificar_api_key

router = APIRouter(dependencies=[Depends(_verificar_api_key)])

_SEPARADOR_LISTA = ","


def _lista(texto: str) -> list[str]:
    """'a,b' -> ['a', 'b']. Las listas viajan separadas por coma en la query."""
    return [pieza.strip() for pieza in texto.split(_SEPARADOR_LISTA) if pieza.strip()]


@router.get("/analitica/resumen")
def analitica_resumen(desde: str | None = Query(None),
                      hasta: str | None = Query(None)) -> dict:
    """Los 9 KPIs de cabecera del documento (Fig. 2)."""
    return resumen.calcular(ventana.crear(desde, hasta))


@router.get("/analitica/completitud")
def analitica_completitud(desde: str | None = Query(None),
                          hasta: str | None = Query(None),
                          granularidad: str | None = Query(None)) -> dict:
    """Puntos reales contra esperados por periodo, y los tramos sin datos (Fig. 4)."""
    return completitud.calcular(ventana.crear(desde, hasta, granularidad))


@router.get("/analitica/dias-con-datos")
def analitica_dias_con_datos() -> dict:
    """Los dias con al menos una lectura, en total y por fuente. Para el calendario."""
    return cobertura_dias.calcular()


@router.get("/analitica/series")
def analitica_series(variables: str = Query(...), desde: str | None = Query(None),
                     hasta: str | None = Query(None),
                     granularidad: str | None = Query(None),
                     media_movil: int = Query(series.BUCKETS_MEDIA_MOVIL)) -> dict:
    """Serie temporal con banda, media movil y recta de tendencia (Fig. 5)."""
    return series.serie_temporal(ventana.crear(desde, hasta, granularidad),
                                 _lista(variables), media_movil)


@router.get("/analitica/distribucion")
def analitica_distribucion(variable: str = Query(...), desde: str | None = Query(None),
                           hasta: str | None = Query(None)) -> dict:
    """Box plot por mes con el criterio IQR de outliers (Fig. 6, panel superior)."""
    return distribucion.cajas_mensuales(ventana.crear(desde, hasta), variable)


@router.get("/analitica/irradiacion")
def analitica_irradiacion(
        variable: str = Query(distribucion.IRRADIANCIA_POR_DEFECTO),
        desde: str | None = Query(None), hasta: str | None = Query(None)) -> dict:
    """Irradiacion acumulada por mes en kWh/m2 (Fig. 6, panel GHI)."""
    return distribucion.irradiacion_mensual(ventana.crear(desde, hasta), variable)


@router.get("/analitica/carpeta")
def analitica_carpeta(variable: str = Query(...), desde: str | None = Query(None),
                      hasta: str | None = Query(None),
                      agregacion: str = Query(carpeta.PROMEDIO)) -> dict:
    """Matriz dia x hora LOCAL, con los huecos marcados (Fig. 8 bis)."""
    return carpeta.diagrama(ventana.crear(desde, hasta), variable, agregacion)


@router.get("/analitica/correlacion")
def analitica_correlacion(x: str = Query(...), y: str = Query(...),
                          desde: str | None = Query(None),
                          hasta: str | None = Query(None),
                          techo_puntos: int = Query(correlacion.TECHO_PUNTOS)) -> dict:
    """Nube de puntos con ajuste OLS: ecuacion y R2 (Fig. 8)."""
    return correlacion.dispersion(ventana.crear(desde, hasta), x, y, techo_puntos)


@router.get("/analitica/crestas")
def analitica_crestas(grupos: str = Query(...), desde: str | None = Query(None),
                      hasta: str | None = Query(None),
                      umbral: float | None = Query(None),
                      cola: str = Query(crestas.SUPERIOR)) -> dict:
    """Densidades apiladas por grupo con probabilidad de cola (Fig. 7)."""
    return crestas.densidades(ventana.crear(desde, hasta), _lista(grupos), umbral, cola)


@router.get("/analitica/comparativa")
def analitica_comparativa(desde: str | None = Query(None),
                          hasta: str | None = Query(None),
                          granularidad: str | None = Query(None)) -> dict:
    """Inclinado contra vertical: energia, curva horaria, PR y estacionalidad."""
    return comparativa.arreglos(ventana.crear(desde, hasta, granularidad))


@router.get("/analitica/energia")
def analitica_energia(desde: str | None = Query(None),
                      hasta: str | None = Query(None)) -> dict:
    """Energia AC del tablero (contadores del inversor) y DC por arreglo (R7).

    El cuerpo es el mismo que devuelve la tool `energia_por_arreglo`, y por eso se
    la llama en vez de recomponerla: dos composiciones de la misma respuesta son dos
    respuestas que se separan. Aca no hay nada que recortar, la tool ya manda el
    detalle entero.

    Se agrega `ventana`, que es lo que devuelven los otros nueve endpoints de
    `/analitica` (la tool llama `periodo` a ese mismo bloque). Van las dos claves con
    el mismo contenido: agregar una clave no rompe a ningun cliente, renombrarla si.
    """
    v = ventana.crear(desde, hasta)
    return {"ventana": v.como_dict(), **tools.energia.run(*v.sql)}
