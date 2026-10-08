"""Aritmetica de dias con datos para `rangos_con_datos`. Pura: sin DB ni cache.

Todo trabaja sobre una lista de fechas ISO `aaaa-mm-dd` ascendente y sin repetidos,
la forma que ya entrega `analitica.cobertura_dias`. Un TRAMO es una corrida de dias
consecutivos con datos y se describe con `hasta` EXCLUSIVO (como toda ventana del
proyecto, para pasarlo tal cual a otra tool) y `ultimo_dia` inclusivo (para decirselo
al usuario sin restar uno a mano).
"""
from __future__ import annotations

from datetime import date, timedelta

UN_DIA = timedelta(days=1)


def _dia(iso: str) -> date:
    return date.fromisoformat(iso[:10])


def _tramo(primero: date, ultimo: date) -> dict:
    return {"desde": primero.isoformat(), "hasta": (ultimo + UN_DIA).isoformat(),
            "ultimo_dia": ultimo.isoformat(), "dias": (ultimo - primero).days + 1}


def tramos(dias: list[str]) -> list[dict]:
    """Corridas de dias consecutivos, de la mas reciente a la mas vieja."""
    salida: list[dict] = []
    fechas = [_dia(d) for d in dias]
    inicio = 0
    for i in range(1, len(fechas) + 1):
        if i == len(fechas) or fechas[i] - fechas[i - 1] != UN_DIA:
            salida.append(_tramo(fechas[inicio], fechas[i - 1]))
            inicio = i
    return salida[::-1]


def huecos(dias: list[str], desde: str, hasta: str) -> list[dict]:
    """Corridas SIN datos dentro de [desde, hasta), de la mas reciente a la mas vieja."""
    presentes = set(dias)
    fin = _dia(hasta)
    ausentes: list[str] = []
    actual = _dia(desde)
    while actual < fin:
        if actual.isoformat() not in presentes:
            ausentes.append(actual.isoformat())
        actual += UN_DIA
    return tramos(ausentes)


def dentro(dias: list[str], desde: str | None, hasta: str | None) -> list[str]:
    """Los dias en [desde, hasta). ISO compara igual como texto."""
    return [d for d in dias
            if (desde is None or d >= desde[:10]) and (hasta is None or d < hasta[:10])]


def ultimos(dias: list[str], cantidad: int) -> dict | None:
    """Los ultimos `cantidad` dias CON datos (no de calendario), saltando huecos."""
    elegidos = dias[-cantidad:] if cantidad > 0 else []
    if not elegidos:
        return None
    ultimo = _dia(elegidos[-1])
    return {"pedidos": cantidad, "n": len(elegidos), "desde": elegidos[0],
            "hasta": (ultimo + UN_DIA).isoformat(), "ultimo_dia": ultimo.isoformat(),
            "dias_calendario": (ultimo - _dia(elegidos[0])).days + 1, "dias": elegidos}


def _tramo_de(dia: str, todos: list[dict]) -> dict | None:
    return next((t for t in todos if t["desde"] <= dia < t["hasta"]), None)


def _vecino(dia: str | None, referencia: date) -> dict | None:
    if dia is None:
        return None
    return {"dia": dia, "distancia_dias": abs((_dia(dia) - referencia).days)}


def mas_cercano(dias: list[str], desde: str, hasta: str) -> dict | None:
    """El dia con datos mas cercano a [desde, hasta). Distancia 0 si hay alguno adentro.

    Con el rango vacio devuelve tambien el vecino anterior y el posterior, para que el
    modelo pueda ofrecer los dos. En empate gana el anterior: es dato ya cerrado.
    """
    if not dias:
        return None
    todos = tramos(dias)
    adentro = dentro(dias, desde, hasta)
    pedido = {"desde": desde[:10], "hasta": hasta[:10]}
    if adentro:
        dia = adentro[-1]
        return {"pedido": pedido, "tiene_datos": True, "dia": dia,
                "distancia_dias": 0, "tramo": _tramo_de(dia, todos)}
    primero, ultimo_pedido = _dia(desde), _dia(hasta) - UN_DIA
    anterior = _vecino(next((d for d in reversed(dias) if d < desde[:10]), None), primero)
    posterior = _vecino(next((d for d in dias if d >= hasta[:10]), None), ultimo_pedido)
    candidatos = [v for v in (anterior, posterior) if v is not None]
    elegido = min(candidatos, key=lambda v: v["distancia_dias"])
    return {"pedido": pedido, "tiene_datos": False, "dia": elegido["dia"],
            "distancia_dias": elegido["distancia_dias"],
            "tramo": _tramo_de(elegido["dia"], todos),
            "anterior": anterior, "posterior": posterior}
