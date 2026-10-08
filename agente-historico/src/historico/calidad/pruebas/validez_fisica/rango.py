"""Validez por rango: valores bajo el minimo o sobre el maximo fisico, solo en crudo."""
from __future__ import annotations

from historico.calidad.pruebas import umbrales
from historico.calidad.pruebas.contrato import (
    CORREGIDA,
    Contexto,
    Hallazgo,
    NoAplica,
    Serie,
    es_valor,
    hallazgos_por_dia,
)


def _exigir_dato_sin_corregir(serie: Serie) -> None:
    """Corta antes de medir si la serie ya paso por la capa de correccion."""
    if serie.origen == CORREGIDA:
        raise NoAplica(
            f"{serie.variable.clave} llega de una vista corregida, que ya anulo lo "
            f"que cae fuera de rango: la prueba saldria vacia por construccion. "
            f"Pedi la serie con `crudo=True`")


def _cero_declarado_valido(serie: Serie, valor) -> bool:
    """El 0 de las tres variables AC: dato valido por R3, no violacion de rango.

    Es el inversor sin acoplar, y lo mide `disponibilidad.inversor_sin_acoplar`
    como problema del EQUIPO. Marcarlo ademas aca contaria el mismo hecho dos
    veces y, peor, lo contaria como dato malo: hundiria la confianza de meses
    cuya energia es exacta.
    """
    return valor == 0 and serie.variable.clave in umbrales.VARIABLES_DE_ACOPLE_AC


def bajo_minimo(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Valores por debajo del minimo fisico de la variable.

    El 0 de las variables AC queda exento (ver el docstring del modulo). Un valor
    genuinamente imposible, como un voltaje negativo, sigue cayendo.
    """
    _exigir_dato_sin_corregir(serie)
    limite = serie.variable.minimo
    if limite is None:
        raise NoAplica(f"{serie.variable.clave} no tiene minimo fisico en el catalogo")
    afectados = [i for i, v in enumerate(serie.valores)
                 if es_valor(v) and v < limite and not _cero_declarado_valido(serie, v)]
    # La exencion viaja en el hallazgo SOLO de las variables que la tienen: quien
    # lea un `bajo_minimo_fisico` de `voltaje_vac` tiene que saber que el 0 no
    # esta contado ahi, y quien lea uno de irradiancia no necesita el ruido.
    exento = ({"exento": "el 0 es dato valido (R3, inversor sin acoplar): lo mide "
                         "`disponibilidad`, no la validez fisica"}
              if serie.variable.clave in umbrales.VARIABLES_DE_ACOPLE_AC else {})
    return hallazgos_por_dia(
        serie, afectados, "bajo_minimo_fisico", limite=limite,
        unidad=serie.variable.unidad, origen=serie.origen, **exento,
        detalle_del_dia=lambda idx: {
            "peor": min(serie.valores[i] for i in idx)})


def sobre_maximo(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Valores por encima del maximo fisico de la variable."""
    _exigir_dato_sin_corregir(serie)
    limite = serie.variable.maximo
    if limite is None:
        raise NoAplica(f"{serie.variable.clave} no tiene maximo fisico en el catalogo")
    afectados = [i for i, v in enumerate(serie.valores) if es_valor(v) and v > limite]
    return hallazgos_por_dia(
        serie, afectados, "sobre_maximo_fisico", limite=limite,
        unidad=serie.variable.unidad, origen=serie.origen,
        detalle_del_dia=lambda idx: {
            "peor": max(serie.valores[i] for i in idx)})
