"""Las consultas del informe: UNA tanda, y ninguna propia.

Todo lo que el informe muestra sale de las mismas funciones que ya alimentan los
endpoints de `/analitica` y `/calidad`. No hay SQL aca a proposito: un informe con
sus propias consultas es un segundo calculo de los mismos indicadores, y el segundo
calculo es el que se separa del primero sin que nadie lo note (ya paso con el PR a
5 minutos de `comparativa.py`).
"""
from __future__ import annotations

from historico import db
from historico.analitica import catalogo, energia, rendimiento, resultado
from historico.analitica.ventana import Ventana
from historico.calidad import contexto, reporte


def recolectar(ventana: Ventana) -> dict:
    """Los cuatro insumos crudos del informe, pedidos a la vez."""
    desde, hasta = ventana.sql
    calendario, filas_pr, filas_energia, tipos = db.en_paralelo(
        lambda: contexto.dias(desde, hasta),
        lambda: rendimiento.consultar(ventana),
        lambda: energia.por_dia(ventana),
        lambda: reporte.hallazgos_por_tipo(ventana.desde, ventana.hasta),
    )
    # Fuera del tramo con POA no hay un PR malo: no hay PR. Mismo criterio que
    # `rendimiento.calcular`, que es quien define el motivo.
    sin_poa = catalogo.fuera_de_cobertura(ventana.desde, ventana.hasta,
                                          *rendimiento.CLAVES_POA)
    return {
        "calendario": calendario,
        "filas_pr": filas_pr,
        "filas_energia": filas_energia,
        "tipos": tipos,
        "motivo_poa": (resultado.FUERA_DE_COBERTURA if sin_poa
                       else resultado.SIN_LECTURAS),
    }
