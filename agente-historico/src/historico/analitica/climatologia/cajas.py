"""Cajas mensuales (min, q1, mediana, q3, max, n) con la forma del contrato. Puras."""
from __future__ import annotations

from collections import defaultdict
from datetime import date

import numpy as np

from historico.analitica.distribucion import FORMATO_MES

# Interpolacion lineal: la misma que `percentile_cont` de PostgreSQL, que es con la
# que se calculan las cajas de irradiancia. Asi las cuatro secciones son comparables.
PERCENTILES_CAJA = (25, 50, 75)
DECIMALES = 2


def _redondear(valor: float | None) -> float | None:
    return round(float(valor), DECIMALES) if valor is not None else None


def vacia(mes: str) -> dict:
    """La caja de un mes sin datos: se emite igual, con `n = 0` y todo en None."""
    return {"mes": mes, "min": None, "q1": None, "mediana": None, "q3": None,
            "max": None, "n": 0}


def de_valores(mes: str, valores: list[float]) -> dict:
    """Los cinco numeros de un mes a partir de sus valores sueltos."""
    if not valores:
        return vacia(mes)
    q1, mediana, q3 = np.percentile(valores, PERCENTILES_CAJA)
    return {"mes": mes, "min": _redondear(min(valores)), "q1": _redondear(q1),
            "mediana": _redondear(mediana), "q3": _redondear(q3),
            "max": _redondear(max(valores)), "n": len(valores)}


def por_mes(meses: list[str], medias: list[tuple[date, float]]) -> list[dict]:
    """Una caja por mes de la rejilla, sobre las medias diarias de todos los sensores."""
    agrupadas: dict[str, list[float]] = defaultdict(list)
    for dia, valor in medias:
        agrupadas[dia.strftime(FORMATO_MES)].append(valor)
    return [de_valores(mes, agrupadas.get(mes, [])) for mes in meses]


def desde_distribucion(caja: dict) -> dict:
    """Traduce una caja de `distribucion.cajas_mensuales` a la forma del contrato."""
    if not caja.get("n"):
        return vacia(caja["mes"])
    return {"mes": caja["mes"], "min": _redondear(caja["minimo"]),
            "q1": _redondear(caja["q1"]), "mediana": _redondear(caja["mediana"]),
            "q3": _redondear(caja["q3"]), "max": _redondear(caja["maximo"]),
            "n": int(caja["n"])}
