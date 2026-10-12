"""Lo puro del calendario de actividad: niveles por dia y huecos. Sin base ni red.

El nivel de un dia se mide contra el percentil 90 de lecturas diarias DE ESA FILA en
el rango, no contra una cadencia teorica: el inversor grabo cada 2 s, cada 1 min y
cada 5 min segun la epoca, y AgroDash no declara la suya. Asi un dia "lleno" es el
que se parece a los dias normales de esa misma fuente.
"""
from __future__ import annotations

from datetime import date, timedelta

# Cortes del nivel (fraccion del percentil 90): <25 % = 1, <50 % = 2, <90 % = 3, resto 4.
CORTES = (0.25, 0.50, 0.90)
HUECO_MINIMO_DIAS = 3
MAX_HUECOS = 5


def _percentil_90(valores: list[int]) -> float:
    orden = sorted(valores)
    return float(orden[min(len(orden) - 1, int(0.9 * (len(orden) - 1) + 0.5))])


def nivel(lecturas: int, referencia: float) -> int:
    """1..4 para un dia con lecturas; la referencia es el percentil 90 de la fila."""
    if referencia <= 0:
        return 4
    fraccion = lecturas / referencia
    return 1 + sum(fraccion >= corte for corte in CORTES)


def dias_con_nivel(conteos: dict[str, int]) -> list[list]:
    """`{fecha: lecturas}` -> `[[fecha, nivel, lecturas], ...]` en orden, solo dias con datos."""
    con_datos = {f: n for f, n in conteos.items() if n > 0}
    if not con_datos:
        return []
    referencia = _percentil_90(list(con_datos.values()))
    return [[f, nivel(n, referencia), n] for f, n in sorted(con_datos.items())]


def huecos(fechas: list[str], desde: date, hasta: date) -> list[dict]:
    """Tramos sin datos de `HUECO_MINIMO_DIAS` o mas dentro de [desde, hasta], los mas
    largos primero (maximo `MAX_HUECOS`). Fechas ISO; `hasta` inclusivo."""
    presentes = {date.fromisoformat(f) for f in fechas}
    tramos: list[dict] = []
    inicio: date | None = None
    dia = desde
    while dia <= hasta + timedelta(days=1):
        vacio = dia <= hasta and dia not in presentes
        if vacio and inicio is None:
            inicio = dia
        elif not vacio and inicio is not None:
            largo = (dia - inicio).days
            if largo >= HUECO_MINIMO_DIAS:
                tramos.append({"desde": inicio.isoformat(),
                               "hasta": (dia - timedelta(days=1)).isoformat(), "dias": largo})
            inicio = None
        dia += timedelta(days=1)
    tramos.sort(key=lambda t: (-t["dias"], t["desde"]))
    return tramos[:MAX_HUECOS]
