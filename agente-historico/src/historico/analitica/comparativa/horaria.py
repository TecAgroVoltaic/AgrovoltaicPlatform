"""En que horas del dia se separan los dos arreglos."""
from __future__ import annotations


def _rangos(horas: list[int]) -> str:
    """'6, 7, 8, 17' -> '6-8, 17'. Una franja se lee de un vistazo; una lista no."""
    if not horas:
        return "ninguna"
    tramos, inicio, previa = [], horas[0], horas[0]
    for hora in horas[1:] + [None]:
        if hora != previa + 1:
            tramos.append(f"{inicio}-{previa}" if inicio != previa else f"{inicio}")
            inicio = hora
        previa = hora
    return ", ".join(tramos)


def separacion_horaria(curva: list[dict]) -> dict:
    """En que horas se separan los dos arreglos y cuanto. PURA.

    Es la pregunta de fondo del eje 1: el vertical no compite en el mediodia, pero
    puede ganarle al inclinado en las puntas del dia, y eso es lo que justifica la
    configuracion. Un total diario lo esconde; esta franja lo muestra.
    """
    comparables = [f for f in curva
                   if f.get("inclinado_w") is not None and f.get("vertical_w") is not None]
    if not comparables:
        return {"horas_comparables": 0, "gana_inclinado": [], "gana_vertical": [],
                "pico_inclinado": None, "pico_vertical": None,
                "lectura": "no hay ni una hora con las dos potencias medidas"}
    diferencias = {f["hora"]: f["inclinado_w"] - f["vertical_w"] for f in comparables}
    gana_inc = sorted(h for h, d in diferencias.items() if d > 0)
    gana_ver = sorted(h for h, d in diferencias.items() if d < 0)
    mejor_inc = max(diferencias.items(), key=lambda par: par[1])
    mejor_ver = min(diferencias.items(), key=lambda par: par[1])
    return {
        "horas_comparables": len(comparables),
        "gana_inclinado": gana_inc, "gana_vertical": gana_ver,
        "pico_inclinado": {"hora": mejor_inc[0], "diferencia_w": round(mejor_inc[1], 1)},
        "pico_vertical": {"hora": mejor_ver[0], "diferencia_w": round(-mejor_ver[1], 1)},
        "lectura": (f"el inclinado aventaja al vertical en las horas {_rangos(gana_inc)} "
                    f"(maximo en la {mejor_inc[0]}) y el vertical en las horas "
                    f"{_rangos(gana_ver)} (maximo en la {mejor_ver[0]})"),
    }
