"""Correr las pruebas de calidad de una variable sobre un rango. COMPOSICION, no criterio.

`calidad.pruebas.correr()` recibe las series YA traidas: es puro a proposito, y
por eso alguien tiene que hacer antes las consultas que necesita (las lecturas de
la variable, la ventana solar del periodo que usa la prueba de irradiancia
nocturna, y la radiacion por bin de 5 minutos con que la familia de disponibilidad
gradua la severidad). Ese "alguien" vive aca y no en la tool ni en el endpoint
porque los dos lo necesitan igual, y dos copias de la misma composicion terminan
divergiendo en lo unico que importa: si la serie se pidio CRUDA o corregida.

## Siempre cruda

`crudo=True` no es un default comodo, es la unica lectura que significa algo. Las
vistas corregidas ya anulan lo que cae fuera de rango, asi que la familia de
validez fisica leida contra ellas da cero valores imposibles porque la vista los
borro, no porque el sensor estuviera bien. Un informe de calidad sobre datos ya
corregidos es un aprobado automatico.

## Por que esta respuesta NO lleva bloque `confianza`

Todo lo demas en `analitica` lo incrusta, pero aca seria circular: el bloque de
confianza se calcula LEYENDO los hallazgos que dejo el barrido anterior, y esto es
justamente una corrida de deteccion. Envolverla en el veredicto viejo diria que el
dato esta sano segun la revision que esta corrida esta reemplazando.

## Lo que cuesta

Una llamada trae todas las lecturas de UNA variable en el rango (el historico
completo de radiacion son 94.868 filas, el electrico 36.469). Es la misma lectura
que hace el barrido por lotes, y ya esta acotada por variable: no se evalua el
catalogo entero de una, justamente para que una pregunta suelta no arrastre trece
columnas.
"""
from __future__ import annotations

from historico.analitica import catalogo
from historico.analitica.ventana import Ventana
from historico.calidad.pruebas import (
    Contexto, ContextoDisponibilidad, Corrida, Evaluacion, Hallazgo, correr,
)
from historico.calidad.pruebas import consultas, umbrales

NOTA = (
    "cada prueba del documento deja una EVALUACION con estado, corra o no: "
    "`evaluada`, `sin_fuente` (el documento la pide y la base no tiene el dato), "
    "`sin_datos` (no hay lecturas en el rango) o `no_aplica`. Una prueba que no "
    "aparece se lee como una prueba que paso, y por eso ninguna se omite. Las "
    "lecturas se piden CRUDAS: sobre las vistas corregidas la validez fisica saldria "
    "limpia porque la vista ya borro lo imposible, no porque el sensor estuviera bien."
)


def evaluar(v: Ventana, variable: str) -> Corrida:
    """Corre el catalogo de pruebas sobre `variable` en la ventana pedida.

    Una clave fuera del catalogo levanta `VariableDesconocida` antes de tocar SQL.
    Una variable SIN fuente no consulta nada y sale como `sin_fuente`, que es el
    resultado correcto y no un error: el hueco tiene que verse y quedar medido.
    """
    catalogo.obtener(variable)
    desde, hasta = v.sql
    return correr([consultas.serie(variable, desde, hasta, crudo=True)],
                  _contexto(desde, hasta, variable))


def _contexto(desde, hasta, variable: str) -> Contexto:
    """El contexto que necesita ESTA variable, sin pagar lo que no le sirve.

    La familia de disponibilidad gradua la severidad del inversor caido con la
    radiacion promediada por bin de 5 minutos. Sin ese mapa la prueba no se calla
    (callarse seria peor: se perderian los apagones de dia entero de los 46 dias
    sin irradiancia), pero saca TODO con motivo `sin_irradiancia` y se pierde la
    separacion entre el apagon bajo sol pleno y la desconexion por poca luz. Es un
    fallo invisible en la salida: los hallazgos aparecen, con la severidad
    equivocada.

    Se pide solo para las tres variables de acople AC porque para cualquier otra
    la prueba se declara `no_aplica` antes de mirar el contexto: traer el mapa
    seria un viaje al pooler que nadie lee. La condicion sale de la MISMA constante
    que usa la prueba para decidir, asi que no pueden desincronizarse.
    """
    ventanas = consultas.ventanas_solares(desde, hasta)
    if variable not in umbrales.VARIABLES_DE_ACOPLE_AC:
        return Contexto(ventanas_solares=ventanas)
    return ContextoDisponibilidad(
        ventanas_solares=ventanas,
        irradiancia_por_bin=consultas.radiacion_por_bin(desde, hasta))


def fuera_de_cobertura(v: Ventana, variable: str) -> str | None:
    """Por que la ventana no toca el tramo en que la variable EXISTE. None = si lo toca.

    Sin esto la corrida miente en la direccion peligrosa. `consultas.serie` trae
    todas las filas del rango con la columna en NULL, asi que pedir el SP722 (que
    corrio dieciocho dias de mayo 2026) sobre 2024 devuelve miles de nulos y la
    prueba `valores_nulos` los reporta como si el sensor hubiera fallado. No fallo:
    todavia no estaba puesto, y las dos cosas se ven igual en el conteo.
    """
    return catalogo.fuera_de_cobertura(v.desde, v.hasta, variable)


def descriptor(variable: str) -> dict:
    """La variable como la ve quien lee el informe, con su hueco si lo tiene."""
    var = catalogo.obtener(variable)
    return {"clave": var.clave, "etiqueta": var.etiqueta, "unidad": var.unidad,
            "familia": var.familia, "disponible": var.disponible,
            "fuente_ausente": var.fuente_ausente}


def como_hallazgo(hallazgo: Hallazgo) -> dict:
    """El hallazgo como JSON. `fecha` sale ISO: es un `date`, y json no lo sabe."""
    return {"fecha": hallazgo.fecha.isoformat(), "fuente": hallazgo.fuente,
            "variable": hallazgo.variable, "tipo": hallazgo.tipo,
            "severidad": hallazgo.severidad, "n_afectadas": hallazgo.n_afectadas,
            "detalle": hallazgo.detalle}


def como_evaluacion(evaluacion: Evaluacion) -> dict:
    """La evaluacion con el CONTEO de sus hallazgos, no con los hallazgos.

    El detalle viaja una sola vez, en la lista plana de `hallazgos`: anidarlo
    ademas aca duplicaria la respuesta entera, y `tipo` ya dice de que prueba
    salio cada uno.
    """
    return {"prueba": evaluacion.prueba, "familia": evaluacion.familia,
            "variable": evaluacion.variable, "fuente": evaluacion.fuente,
            "origen": evaluacion.origen, "estado": evaluacion.estado,
            "motivo": evaluacion.motivo, "n_hallazgos": len(evaluacion.hallazgos)}


def como_dict(v: Ventana, variable: str, corrida: Corrida) -> dict:
    """El informe completo de una corrida, listo para viajar por HTTP."""
    return {
        "ventana": v.como_dict(),
        "variable": descriptor(variable),
        "fuera_de_cobertura": fuera_de_cobertura(v, variable),
        "resumen": corrida.resumen,
        "evaluaciones": [como_evaluacion(e) for e in corrida.evaluaciones],
        "hallazgos": [como_hallazgo(h) for h in corrida.hallazgos],
        "nota": NOTA,
    }
