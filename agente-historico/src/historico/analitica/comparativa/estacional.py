"""Comparacion mes a mes, solo con los meses que llegan a la cobertura minima."""
from __future__ import annotations

import calendar
from datetime import date

from historico.analitica.comparativa.constantes import COBERTURA_MENSUAL_MINIMA, MESES_MINIMOS


def _dias_del_mes(periodo: str) -> int:
    mes = date.fromisoformat(periodo[:10])
    return calendar.monthrange(mes.year, mes.month)[1]


def estacionalidad(meses: list[dict]) -> dict:
    """Comparacion mes a mes, SOLO con los meses que tienen cobertura. PURA."""
    evaluados = []
    for fila in meses:
        cobertura = round((fila.get("dias_con_datos") or 0) / _dias_del_mes(fila["periodo"]), 3)
        evaluados.append({
            "mes": fila["periodo"][:7], "cobertura": cobertura,
            "dias_con_datos": fila.get("dias_con_datos") or 0,
            "energia_inclinado_wh": fila.get("energia_inclinado_wh"),
            "energia_vertical_wh": fila.get("energia_vertical_wh"),
        })
    comparables = [m for m in evaluados if m["cobertura"] >= COBERTURA_MENSUAL_MINIMA]
    descartados = [{"mes": m["mes"], "cobertura": m["cobertura"],
                    "motivo": "cobertura_insuficiente"}
                   for m in evaluados if m["cobertura"] < COBERTURA_MENSUAL_MINIMA]
    suficiente = len(comparables) >= MESES_MINIMOS
    return {
        "suficiente": suficiente, "meses": comparables, "descartados": descartados,
        "cobertura_minima": COBERTURA_MENSUAL_MINIMA,
        "advertencia": None if suficiente else (
            f"no se puede hablar de estacionalidad: solo {len(comparables)} mes(es) llegan "
            f"al {int(COBERTURA_MENSUAL_MINIMA * 100)}% de dias con datos. El historico tiene "
            f"274 dias de un calendario de 569, con huecos de 126 y 71 dias seguidos"),
    }
