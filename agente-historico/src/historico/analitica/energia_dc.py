"""La energia DC por arreglo y el control de sanidad AC/DC de R7. Puro.

Se usa a traves de `energia`, que reexporta todo lo de aca.
"""
from __future__ import annotations

from statistics import median

from historico.analitica import resultado
from historico.analitica.energia_contadores import UNIDAD, a_kwh

# Un dia entra a la comparacion AC/DC solo si el DC del dia supera esto. Debajo de
# medio kWh el cociente es ruido dividido por ruido (un dia con UNA sola fila daba
# razon 0,117 y no es una perdida del inversor, es un dia truncado).
DC_MINIMO_PARA_COMPARAR_KWH = 0.5

# Cada fila del store electrico cubre una ventana de 5 min: la integral de la
# potencia es sum(W) * 5/60 = Wh. Solo la usa el DC POR ARREGLO, que no tiene
# contador AC: el total del tablero se lee del contador y no se integra.
HORAS_POR_FILA = 5.0 / 60.0
WH_POR_KWH = 1000.0

INCLINADO, VERTICAL = "inclinado", "vertical"
# De que par de columnas del renglon diario sale la energia DC de cada arreglo.
_CAMPOS_DC = {INCLINADO: ("w_inclinado", "n_potencia_inclinado"),
              VERTICAL: ("w_vertical", "n_potencia_vertical")}


def _percentil(ordenados: list[float], q: float) -> float:
    """Percentil por rango mas cercano. Suficiente: es un control, no un estimador."""
    return ordenados[int(q * (len(ordenados) - 1))]


def coherencia_ac_dc(dias: list[dict]) -> dict:
    """El control de sanidad de R7: el AC tiene que salir un poco MENOR que el DC.

    Contador contra contador y solo en los dias que tienen los dos, que es la
    unica comparacion honesta: la integracion de la potencia DC subestima (pesa
    cada fila a 5 minutos aunque el dia tenga huecos internos de 10 o 20), y
    contra ella el AC sale mayor sin que el AC tenga nada de malo. Cuanto
    subestima sale medido en `razon_integral_contador_dc`, para que la diferencia
    entre el total AC y la suma de los arreglos no se lea como un error.
    """
    razones = []
    dc_contador = dc_integrado = 0.0
    for d in dias:
        if not (d.get("n_ac") and d.get("n_dc_inclinado") and d.get("n_dc_vertical")):
            continue
        dc = a_kwh(d["dc_cierre_inclinado"] or 0.0) + a_kwh(d["dc_cierre_vertical"] or 0.0)
        ac = a_kwh(d["ac_cierre"])
        if ac is None or dc <= DC_MINIMO_PARA_COMPARAR_KWH:
            continue
        razones.append(ac / dc)
        dc_contador += dc
        dc_integrado += ((d.get("w_inclinado") or 0.0)
                         + (d.get("w_vertical") or 0.0)) * HORAS_POR_FILA / WH_POR_KWH
    razones.sort()
    n = len(razones)
    if not n:
        return {"razon_ac_dc": resultado.metrica(None, 0, "AC/DC"), "dias": 0,
                "cumple_r7": None,
                "razon_integral_contador_dc": resultado.metrica(
                    None, 0, "integral/contador"),
                "nota": "ningun dia del periodo tiene los contadores AC y DC a la vez"}
    mediana = median(razones)
    return {
        "razon_ac_dc": resultado.metrica(round(mediana, 3), n, "AC/DC"),
        "p05": round(_percentil(razones, 0.05), 3),
        "p95": round(_percentil(razones, 0.95), 3),
        "dias": n,
        # R7: "sera siempre un poco menor a la suma de las de PV1 y PV2 porque
        # consideran las perdidas del inversor". Si esto sale False, la sospecha
        # va sobre la implementacion antes que sobre el inversor.
        "cumple_r7": mediana < 1.0,
        # Cuanto SUBESTIMA la integral de la potencia DC contra los contadores DC
        # de los mismos dias: 0,923 medido sobre los 129 dias comparables de la
        # serie. La integral pesa cada fila a 5 min aunque el dia traiga huecos
        # internos de 10 o 20 minutos. (La medicion de referencia da 0,857 porque
        # ahi la integral pondera por el salto real al siguiente registro, que
        # ademas descuenta los tramos de 15 s. Las dos dicen lo mismo: la integral
        # queda por debajo de su propio contador.) Va aca porque es lo que explica
        # que el total AC del tablero salga MAYOR que la suma de las casillas por
        # arreglo sin que ninguno de los dos este mal.
        "razon_integral_contador_dc": resultado.metrica(
            round(dc_integrado / dc_contador, 3) if dc_contador else None,
            n, "integral/contador"),
        "nota": ("razon AC/DC contador contra contador, solo en dias con ambos: es la "
                 "unica comparacion honesta. R7 predice un poco menor que 1 por las "
                 "perdidas del inversor. `razon_integral_contador_dc` menor que 1 dice "
                 "cuanto subestima la integral de la potencia, que es la cuenta de las "
                 "casillas por arreglo"),
    }


def integral_dc(dias: list[dict], arreglo: str) -> dict:
    """Energia DC de un arreglo (kWh): integral de su potencia corregida a 5 min.

    Sigue siendo integral y no contador porque el inversor no reporta AC por
    arreglo, y porque `energia_pv1_wh`/`energia_pv2_wh` solo existen en 144 dias
    contra los 274 que si tienen potencia. Es la cuenta que SUBESTIMA cuando el
    dia trae huecos internos de 10 o 20 minutos (pesa cada fila a 5 min igual):
    por eso el total AC del tablero no se compara contra esto sino contra los
    contadores DC, en `coherencia_ac_dc`.

    Con n = 0 distingue "no hay filas" de "la columna vino vacia": noviembre 2024
    tiene AC y cero DC, que es un hueco de columna y no un dia sin datos.
    """
    campo_w, campo_n = _CAMPOS_DC[arreglo]
    n = sum(d.get(campo_n) or 0 for d in dias)
    if not n:
        motivo = (resultado.COLUMNA_AUSENTE if any(d.get("filas") for d in dias)
                  else resultado.SIN_LECTURAS)
        return resultado.metrica(None, 0, UNIDAD, motivo)
    vatios = sum(d.get(campo_w) or 0.0 for d in dias)
    return resultado.metrica(round(vatios * HORAS_POR_FILA / WH_POR_KWH, 2), n, UNIDAD)
