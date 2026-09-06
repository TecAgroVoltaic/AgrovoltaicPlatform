"""Tool `performance_ratio` — el PR DIARIO Y MENSUAL, no la metrica de 5 minutos.

Delgada sobre `analitica.rendimiento.calcular`, que es el metodo que fijo Leo
Cardinale el 2026-08-30 (R1): energia del dia contra irradiacion integrada del dia,
agregado a mes y a periodo ponderando por energia.

Del resultado completo se recortan los dos arrays que son dibujo o anexo y no
lectura: el renglon dia a dia (228 dias en todo el historico) y el detalle de los
dias descartados. Los dos viajan por la API. Lo que SI va entero es la matriz de
seis variantes (tres insumos de irradiancia x dos fuentes de energia), porque el
veredicto depende del insumo y mandar una sola seria elegirlo por el modelo.
"""
from __future__ import annotations

from historico.analitica import rendimiento, ventana
from historico.tools import opciones

SCHEMA = {
    "name": "performance_ratio",
    "description": (
        "Performance Ratio (adimensional, 0-1) POR DIA Y POR MES de cada arreglo: PV1 "
        "inclinado y PV2 vertical, 1.420 Wp cada uno. Energia del dia contra "
        "irradiacion del dia, agregada al periodo ponderando por energia. Devuelve las "
        "seis variantes (contra irradiancia horizontal GHI, contra POA bifacial y "
        "contra POA solo frontal; con la energia del contador del inversor y con la "
        "integral de la potencia). Usala cuando pregunten que tan bien rinde cada "
        "arreglo, cual convierte mejor, o por el performance ratio de un mes o del año. "
        "Omiti desde/hasta para todo el historico."
    ),
    "input_schema": {
        "type": "object",
        "properties": opciones.ventana(),
        "additionalProperties": False,
    },
}

# El renglon diario y el anexo de descartes: dibujo y anexo, no lectura del modelo.
_DE_DIBUJO = ("por_dia",)

_RECORTE = (" Esta respuesta trae los totales, los meses y el criterio, no el renglon "
            "dia a dia ni el detalle de cada dia descartado: esos se piden por la API.")


_ARREGLOS = (rendimiento.INCLINADO, rendimiento.VERTICAL)


def _pr(bloque: dict) -> dict:
    """Un arreglo reducido a lo que el modelo puede leer: el PR y su marca."""
    return {"pr": bloque["pr"]["valor"], "dias": bloque["dias"],
            "energia_kwh": bloque["energia_kwh"]["valor"],
            "irradiacion_kwh_m2": bloque["irradiacion_kwh_m2"]["valor"],
            "dias_pr_mayor_a_uno": bloque["dias_pr_mayor_a_uno"],
            "pr_diario_maximo": bloque["pr_diario_maximo"],
            **({"supera_limite_fisico": True, "aviso": bloque["pr"]["aviso"]}
               if bloque["pr"].get("supera_limite_fisico") else {}),
            **({"motivo": bloque["pr"]["motivo"]}
               if bloque["pr"]["valor"] is None else {})}


def _mes(bloque: dict) -> dict:
    """Un mes reducido al PR pelado de cada variante, mas donde supero el limite.

    Mes a mes solo se manda el numero: el respaldo (dias, energia, irradiacion) ya
    va entero en `total`, y repetirlo diez veces es quemar contexto en algo que el
    modelo no puede leer. Lo que NO se recorta es la marca del imposible: sin ella
    un 1,217 se leeria como el mejor mes de la serie.
    """
    imposibles = [f"{fuente}/{insumo}/{arreglo}"
                  for fuente in rendimiento.FUENTES_ENERGIA
                  for insumo in rendimiento.INSUMOS
                  for arreglo in _ARREGLOS
                  if bloque[fuente][insumo][arreglo]["pr"].get("supera_limite_fisico")]
    return {
        "mes": bloque["mes"], "dias": bloque["dias"],
        "pr": {fuente: {insumo: {arreglo: bloque[fuente][insumo][arreglo]["pr"]["valor"]
                                 for arreglo in _ARREGLOS}
                        for insumo in rendimiento.INSUMOS}
               for fuente in rendimiento.FUENTES_ENERGIA},
        "supera_limite_fisico": imposibles or None,
    }


def run(desde: str | None = None, hasta: str | None = None) -> dict:
    completo = rendimiento.calcular(ventana.crear(desde, hasta))
    dias = {k: v for k, v in completo["dias"].items() if k != "detalle_descartados"}
    return {
        **{k: v for k, v in completo.items() if k not in _DE_DIBUJO},
        "dias": dias,
        "total": {fuente: {insumo: {arreglo: _pr(completo["total"][fuente][insumo][arreglo])
                                    for arreglo in _ARREGLOS}
                           for insumo in rendimiento.INSUMOS}
                  for fuente in rendimiento.FUENTES_ENERGIA},
        "por_mes": [_mes(m) for m in completo["por_mes"]],
        "nota": completo["nota"] + _RECORTE,
    }
