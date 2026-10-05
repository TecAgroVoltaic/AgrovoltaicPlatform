"""Tool `energia_por_arreglo` — energia electrica generada en un periodo.

Devuelve las dos cuentas que el sistema puede hacer, porque son distintas:

  * **El total AC**, leido de los CONTADORES del inversor (`energia_hoy_wh` y
    `energia_total_wh`). Es lo que pide R7 de Leo Cardinale: la energia del
    tablero es alterna y sale del contador, NO de integrar la potencia. Ademas es
    lo unico que existe entre nov-2025 y feb-2026. Toda esa cuenta (incluido el
    detalle de que esas columnas estan en kWh pese al sufijo `_wh`) vive en
    `analitica.energia`.
  * **El DC por arreglo**, que si es la integral de la potencia corregida
    (sum(W) * 5/60), porque el inversor no reporta AC por arreglo.

Capa delgada: parsea la ventana, llama a `analitica.energia` y arma la respuesta.
"""
from __future__ import annotations

from historico import db
from historico.analitica import energia, ventana
from historico.calidad import contexto
from historico.tools import opciones

SCHEMA = {
    "name": "energia_por_arreglo",
    "description": (
        "Energia electrica generada en un periodo: el TOTAL en alterna leido del "
        "contador del inversor (en kWh), y la energia continua de cada arreglo "
        "(PV1 inclinado, PV2 vertical). Trae ademas cuanta energia produjo la planta "
        "en dias que NO tenemos registrados. Usala para 'cuanto genero', 'cuanta "
        "energia', 'produccion'. Omiti desde/hasta para todo el historico."
    ),
    "input_schema": {
        "type": "object",
        "properties": opciones.ventana(),
        "additionalProperties": False,
    },
}

_NOTA = (
    "el total AC sale del contador del inversor, no de integrar la potencia: mira "
    "`energia_ac.significado` para saber que mide cada uno de sus dos numeros. La "
    "energia por arreglo SI es integral a 5 min y por eso SUBESTIMA cuando el dia "
    "trae huecos internos: no la restes contra el AC. La comparacion honesta AC "
    "contra DC es `energia_ac.coherencia_ac_dc`, contador contra contador y solo en "
    "los dias que tienen los dos. Las claves `energia_pv*_wh` van en Wh por "
    "compatibilidad con la consola; las metricas nuevas van en kWh."
)


def _wh(metrica: dict) -> float | None:
    """La misma energia en Wh, para los consumidores que todavia leen esa clave."""
    valor = metrica["valor"]
    return None if valor is None else round(valor * energia.WH_POR_KWH, 1)


def run(desde: str | None = None, hasta: str | None = None) -> dict:
    v = ventana.crear(desde, hasta)
    # Las dos consultas son independientes: en fila eran dos viajes al pooler
    # (~450 ms). Ver `db.en_paralelo` y la cabecera de `historico.db`.
    dias, confianza = db.en_paralelo(
        lambda: energia.por_dia(v),
        lambda: contexto.confianza(*v.sql, energia.COLUMNAS, energia.FUENTE),
    )
    inclinado = energia.integral_dc(dias, energia.INCLINADO)
    vertical = energia.integral_dc(dias, energia.VERTICAL)
    return {
        "periodo": v.como_dict(),
        # Cuantos dias del periodo son realmente utilizables. Viaja DENTRO de la
        # respuesta a proposito: el numero de arriba se calcula sobre lo que hay,
        # y sin esto el agente reporta un total de enero sin saber que media
        # docena de dias no sirven. Ver historico.calidad.contexto.
        "confianza": {**confianza, "vigilancia": energia.AVISO_VIGILANCIA},
        "energia_ac": energia.resumir(dias),
        "energia_pv1_inclinado_kwh": inclinado,
        "energia_pv2_vertical_kwh": vertical,
        # Claves heredadas, en Wh: la consola (`PerfView.tsx`) todavia las lee.
        "energia_pv1_inclinado_wh": _wh(inclinado),
        "energia_pv2_vertical_wh": _wh(vertical),
        "n_pv1": inclinado["n"],
        "n_pv2": vertical["n"],
        "dias_con_filas": len(dias),
        "nota": _NOTA,
    }
