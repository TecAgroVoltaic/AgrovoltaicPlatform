"""El segundo paso del barrido: las seis familias de `calidad.pruebas` sobre el catalogo.

Mira el CATALOGO ENTERO lectura por lectura y escribe en `hallazgos_calidad` con
tipos disjuntos de los del barrido por columna. Se usa a traves de
`historico.calidad.barrido`, que reexporta lo de aca.
"""
from __future__ import annotations

from datetime import date, timedelta

from historico import db
from historico.analitica import catalogo
from historico.calidad import pruebas
from historico.calidad.barrido_sql import _LIMPIAR_PRUEBAS, _UPSERT
from historico.calidad.pruebas import consultas

# Los tipos de las seis familias de `calidad.pruebas`. Van APARTE de
# `TIPOS_PROPIOS` y no fundidos con ellos: la garantia de que ningun tipo se
# repite entre los dos detectores se comprueba comparando las dos listas, y en una
# sola no habria nada que comparar. Dos detectores con el mismo tipo se pisarian
# en el ON CONFLICT sin dar error, que es el modo de fallo que ninguna de las dos
# listas puede permitir.
TIPOS_DE_PRUEBAS = pruebas.TIPOS


def _ventana_de(clave: str, desde: date, hasta: date) -> tuple[date, date] | None:
    """El tramo de [desde, hasta) en que la variable EXISTE. None si no se cruzan.

    Recortar por `catalogo.cobertura` no es una optimizacion, evita un falso
    positivo del peor tipo. Fuera de su tramo el dato no FALTA: el sensor no
    estaba puesto, y las dos cosas se ven igual en el conteo. Medido: el SP722
    tiene lecturas en 4 de los 274 dias con datos, asi que barrerlo sobre el rango
    entero dejaria `parametro_faltante` GRAVE en los otros 270, por tres variables.
    Y como ese hallazgo toca el 100 % de las lecturas del dia, `calidad.contexto`
    lo cuenta como material: el calendario entero en rojo por un sensor que
    todavia no existia.
    """
    inicio, fin = catalogo.cobertura(clave)
    # `dato_hasta` es el ultimo dia CON dato (inclusive) y `hasta` es exclusivo.
    primero = max(desde, inicio) if inicio else desde
    ultimo = min(hasta, fin + timedelta(days=1)) if fin else hasta
    return (primero, ultimo) if primero < ultimo else None


def _series_del_rango(desde: date,
                      hasta: date) -> tuple[list[pruebas.Serie], list[str]]:
    """Una `Serie` por variable del catalogo, con las consultas agrupadas.

    Las claves se agrupan por (relacion cruda, tramo) y cada grupo es UN viaje al
    pooler: sobre el historico completo son 7 consultas para 22 variables, no 22.
    Devuelve tambien las variables que el rango no alcanza, porque un catalogo que
    se barre a medias sin decirlo se lee como un catalogo limpio.

    Se lee siempre el CRUDO. La familia de validez fisica se declara `no_aplica`
    sobre una vista corregida (la vista ya anulo lo que cae fuera de rango, asi que
    la prueba saldria vacia por construccion y eso se leeria como un aprobado), y
    las otras tres tambien miden mejor sobre el crudo: lo que interesa es que
    entrego el logger, no lo que quedo despues de corregirlo.
    """
    grupos: dict[tuple[str, date, date], list[str]] = {}
    sin_fuente: list[str] = []
    fuera_de_cobertura: list[str] = []

    for variable in catalogo.CATALOGO.values():
        if not variable.disponible:
            sin_fuente.append(variable.clave)
            continue
        ventana = _ventana_de(variable.clave, desde, hasta)
        if ventana is None:
            fuera_de_cobertura.append(variable.clave)
            continue
        crudo = variable.origen_crudo
        relacion = crudo[0] if crudo else variable.relacion
        grupos.setdefault((relacion, *ventana), []).append(variable.clave)

    # Las que no tienen fuente no cuestan consulta: `serie()` devuelve la serie
    # vacia sin tocar la base, y el corredor la marca `sin_fuente` con su motivo.
    series = [consultas.serie(clave, desde, hasta, crudo=True) for clave in sin_fuente]
    for (relacion, primero, ultimo), claves in grupos.items():
        series += consultas.series_de(relacion, claves, primero, ultimo, crudo=True)
    return series, fuera_de_cobertura


def _barrer_pruebas(desde: date, hasta: date) -> dict:
    """Corre las seis familias sobre el catalogo entero y persiste sus hallazgos.

    El contexto es un `ContextoDisponibilidad` y no un `Contexto` pelado porque la
    sexta familia cruza la temperatura con esa misma radiacion por bin, y la
    quinta gradua la severidad del inversor caido con la radiacion
    concurrente. Sin ese mapa la prueba NO se calla (eso seria peor), pero saca
    todos sus hallazgos con motivo `sin_irradiancia` y se pierde la separacion
    entre los 69 dias con sol pleno, donde el equipo estuvo averiado sin excusa, y
    los dias nublados, donde "se desconecto por poca luz" es una explicacion
    admisible. Es un fallo que no se ve mirando la salida: los hallazgos aparecen
    igual, con la severidad equivocada. Las otras cuatro familias no se enteran de
    que el contexto trae un campo mas.
    """
    series, fuera_de_cobertura = _series_del_rango(desde, hasta)
    contexto = pruebas.ContextoDisponibilidad(
        ventanas_solares=consultas.ventanas_solares(desde, hasta),
        irradiancia_por_bin=consultas.radiacion_por_bin(desde, hasta))
    corrida = pruebas.correr(series, contexto)

    db.ejecutar(_LIMPIAR_PRUEBAS, (desde, hasta, list(TIPOS_DE_PRUEBAS)))
    db.ejecutar_muchos(_UPSERT, corrida.filas())

    return {**corrida.resumen, "variables_barridas": len(series),
            "fuera_de_cobertura": sorted(fuera_de_cobertura)}
