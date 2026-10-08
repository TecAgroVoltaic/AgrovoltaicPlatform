"""Energia acumulada por arreglo y cual de los dos genero mas."""
from __future__ import annotations

from historico.analitica import resultado
from historico.analitica.comparativa.constantes import INCLINADO, P0_WP, VERTICAL, WH_POR_KWH


def _totales(periodos: list[dict], campo: str) -> float | None:
    valores = [f[campo] for f in periodos if f.get(campo) is not None]
    return sum(valores) if valores else None


def _suma(periodos: list[dict], campo: str) -> int:
    return sum(f.get(campo) or 0 for f in periodos)


def _arreglo_total(periodos: list[dict], sufijo: str) -> dict:
    """Energia acumulada y rendimiento especifico (kWh/kWp) de un arreglo."""
    energia_wh = _totales(periodos, f"energia_{sufijo}_wh")
    n = _suma(periodos, f"n_{sufijo}")
    especifico = None if energia_wh is None else energia_wh / P0_WP
    return {
        "energia_wh": resultado.metrica(energia_wh and round(energia_wh, 1), n, "Wh"),
        "rendimiento_especifico_kwh_kwp": resultado.metrica(
            especifico and round(especifico, 3), n, "kWh/kWp"),
        "lecturas": n,
    }


def comparar_totales(inclinado: dict, vertical: dict) -> dict:
    """Cual genero mas y cuanto, en una linea. Sin los dos valores no hay veredicto."""
    a, b = inclinado["energia_wh"]["valor"], vertical["energia_wh"]["valor"]
    if a is None or b is None:
        return {"ganador": None, "diferencia_wh": None, "diferencia_pct": None,
                "lectura": "no se pueden comparar: a uno de los dos arreglos le falta energia"}
    ganador, perdedor = (INCLINADO, VERTICAL) if a >= b else (VERTICAL, INCLINADO)
    mayor, menor = max(a, b), min(a, b)
    pct = None if menor == 0 else round((mayor - menor) / menor * 100.0, 1)
    return {
        "ganador": ganador, "diferencia_wh": round(mayor - menor, 1), "diferencia_pct": pct,
        "lectura": (f"el arreglo {ganador} genero {round((mayor - menor) / WH_POR_KWH, 2)} kWh "
                    f"mas que el {perdedor}" + (f" ({pct}% mas)" if pct is not None else "")),
    }
