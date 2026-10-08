"""El eje del EQUIPO en el bloque de confianza: dias con la planta parada."""
from __future__ import annotations

from historico.calidad.contexto.criterios import TIPOS_DE_DISPONIBILIDAD


def _parada_por_dia(hallazgos: list, fuente: str | None) -> dict:
    """Por dia: cuantas lecturas con el inversor sin acoplar y si fue bajo sol.

    `max` y no `sum` entre las tres variables AC: las tres dejan un hallazgo cada
    una sobre el MISMO apagon, y sumarlas contaria el mismo hecho tres veces (es
    el defecto que ya tiene el conteo de `valor_nulo` / `parametro_faltante` /
    `columna_ausente`, donde una sola columna ausente pesa el triple).
    """
    parada: dict = {}
    for h in hallazgos:
        if h["tipo"] not in TIPOS_DE_DISPONIBILIDAD:
            continue
        if fuente and h["fuente"] != fuente:
            continue
        lecturas, bajo_sol = parada.get(h["fecha"], (0, False))
        parada[h["fecha"]] = (max(lecturas, h["n_afectadas"] or 0),
                              bajo_sol or h["severidad"] == "grave")
    return parada


def _bloque_disponibilidad(parada: dict, con_datos: set) -> dict:
    """El eje del EQUIPO, al lado del de la calidad del dato y nunca dentro.

    Su advertencia es propia y no toca la de calidad: decir "la planta estuvo
    parada 12 de 31 dias" y decir "de 12 dias no te podes fiar del dato" son
    afirmaciones opuestas, y meterlas en el mismo campo fue justo el error que
    este canal deshace.
    """
    bajo_sol = sum(1 for _, sol in parada.values() if sol)
    bloque = {
        "dias_con_planta_parada": len(parada),
        "dias_parada_bajo_sol": bajo_sol,
        "de_dias_con_datos": len(con_datos),
        "fraccion": round(len(parada) / len(con_datos), 3) if con_datos else None,
        "advertencia": None,
        "nota": ("dias con el inversor sin acoplar entre las 07:00 y las 17:00. "
                 "NO baja `dias_utilizables`: el DATO de esos dias es correcto, lo "
                 "que fallo es el EQUIPO. La energia de un periodo con la planta "
                 "parada es exacta, y es baja por la parada"),
    }
    if parada:
        bloque["advertencia"] = (
            f"la planta estuvo parada en horario operativo {len(parada)} de "
            f"{len(con_datos)} dias con datos ({bajo_sol} de ellos con sol pleno): "
            f"la generacion del periodo es real pero NO representa la capacidad del "
            f"sistema. Es una averia que revisar, no un problema de calidad de dato")
    return bloque
