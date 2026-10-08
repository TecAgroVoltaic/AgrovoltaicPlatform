"""Vistas de calidad para la consola: cabecera, mapa de dias y pruebas por variable.

Son lecturas directas del store para las VISTAS de la consola. No son tools: una
tool esta redactada para que un LLM la elija y devuelve lo justo; una vista
necesita el detalle completo y paginado. Mezclarlas obligaria a que la descripcion
que lee el modelo hable de paginacion, que no le importa. El listado paginado de
hallazgos vive en `historico.rutas.hallazgos`.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from historico import db
from historico.analitica import ventana
from historico.calidad import corrida
from historico.rutas.dependencias import _verificar_api_key
from historico.rutas.vigilancia import _SQL_VIGILANCIA, _vigilancia

router = APIRouter(dependencies=[Depends(_verificar_api_key)])


@router.get("/calidad/resumen")
def calidad_resumen(desde: str | None = Query(None),
                    hasta: str | None = Query(None)) -> dict:
    """Cobertura, cielo, desglose de hallazgos y VIGILANCIA. La cabecera de la vista.

    `calidad` y `cielo` son lo mismo que ven las tools (y por lo tanto el LLM).
    `tipos` es el desglose COMPLETO por fuente, con las fechas extremas: la tabla
    de la consola lo necesita y el resumen de la tool no lo trae, porque para
    narrar alcanzan los cinco problemas mas frecuentes. `vigilancia` dice a que
    variables no las miro nadie, que es lo que separa "se reviso y salio limpia"
    de "nadie la abrio": ver `_vigilancia`.
    """
    from historico.calidad import reporte
    from historico.periodo import rango
    from historico.tools import calidad_periodo, cielo_periodo
    d, h = rango(desde, hasta)
    # ESTE endpoint es el unico que bloquea la primera pintura de `/calidad`, asi
    # que su reloj es el de la vista. Son cinco consultas y NINGUNA depende de otra:
    # en fila costaban siete viajes al pooler (~1,8 s medidos a 30 dias, mas con
    # rangos largos) para un armado que despues tarda milisegundos.
    #
    # Las cinco van en UNA sola tanda, PLANA. Anidar (`calidad_periodo.run` dentro
    # de esta tanda) no serviria: un `en_paralelo` dentro de otro corre en fila para
    # no colgar el ejecutor, asi que ese bloque volvia a costar dos viajes en serie
    # y era el que marcaba el reloj. Por eso se piden sus dos consultas sueltas
    # (`calidad_periodo.tareas`) y se arma su cuerpo despues, con la misma funcion
    # que usa la tool. Ver la nota de anidamiento en `db.en_paralelo`.
    veredicto_calidad, frecuentes = calidad_periodo.tareas(d, h)
    resumen_veredicto, problemas, cielo, tipos, conteo = db.en_paralelo(
        veredicto_calidad,
        frecuentes,
        lambda: cielo_periodo.run(desde, hasta),
        lambda: reporte.hallazgos_por_tipo(d, h),
        lambda: db.query(_SQL_VIGILANCIA, (d, h)),
    )
    return {
        "calidad": calidad_periodo.componer(d, h, resumen_veredicto, problemas),
        "cielo": cielo,
        "tipos": tipos,
        "vigilancia": _vigilancia({f["variable"]: f["n"] for f in conteo}),
    }


@router.get("/calidad/dias")
def calidad_dias(desde: str | None = Query(None),
                 hasta: str | None = Query(None)) -> dict:
    """Un renglon por dia de CALENDARIO con su veredicto, para el mapa de dias."""
    from historico.calidad import contexto
    from historico.periodo import rango
    d, h = rango(desde, hasta)
    return {"periodo": {"desde": d, "hasta": h}, "dias": contexto.dias(d, h)}


@router.get("/calidad/pruebas")
def calidad_pruebas(variable: str = Query(...), desde: str | None = Query(None),
                    hasta: str | None = Query(None)) -> dict:
    """Las cuatro familias de pruebas del documento, corridas ahora sobre una variable.

    Devuelve UNA evaluacion por prueba, corra o no: una prueba ausente del informe
    se lee como una prueba que paso, y cuatro de las nueve de validez fisica no
    tienen fuente en la base.
    """
    v = ventana.crear(desde, hasta)
    return corrida.como_dict(v, variable, corrida.evaluar(v, variable))
