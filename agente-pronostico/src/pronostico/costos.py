"""Costos de LLM — tarifa USD por millón de tokens + cálculo por consulta.

Responsabilidad única (SRP): traducir un `usage` (tokens in/out) + modelo a USD.
No corre el LLM ni acumula nada (eso es uso.py); solo aritmética de tarifa.

Tarifas verificadas contra la documentación OFICIAL de Anthropic
(https://platform.claude.com/docs/en/about-claude/pricing, consultado 2026-08-10):
Haiku 4.5 = $1/$5, Sonnet 5 = $3/$15 (intro $2/$10 hasta 2026-08-31), Opus 5 y
Opus 4.8 = $5/$25, Fable 5 = $10/$50 por millón (input/output, tier base sin caché).

Override por entorno para no quemar la tarifa: definí `PRECIOS_JSON` con un dict
{modelo: [usd_in_mtok, usd_out_mtok]} y se fusiona sobre los defaults (gana el env).
"""
from __future__ import annotations

import json
import os

# (usd_input_por_MTok, usd_output_por_MTok). Base tier, sin caché.
_DEFAULTS: dict[str, tuple[float, float]] = {
    "claude-haiku-4-5": (1.00, 5.00),
    "claude-sonnet-5": (3.00, 15.00),   # tarifa estándar (intro 2/10 hasta 2026-08-31)
    "claude-opus-5": (5.00, 25.00),
    "claude-opus-4-8": (5.00, 25.00),
    "claude-fable-5": (10.00, 50.00),
}


def _precios() -> dict[str, tuple[float, float]]:
    """Defaults fusionados con el override de entorno (PRECIOS_JSON gana)."""
    precios = dict(_DEFAULTS)
    crudo = os.environ.get("PRECIOS_JSON")
    if crudo:
        try:
            for modelo, par in json.loads(crudo).items():
                precios[modelo] = (float(par[0]), float(par[1]))
        except Exception:  # env malformado: no rompe, se queda con los defaults
            pass
    return precios


def tarifa(modelo: str) -> tuple[float, float] | None:
    """(usd_in_mtok, usd_out_mtok) del modelo; None si no hay tarifa.

    Match exacto y, si no, por prefijo (tolera alias con sufijo de fecha, p.ej.
    'claude-haiku-4-5-20251001' -> 'claude-haiku-4-5'); gana el prefijo más largo."""
    precios = _precios()
    if modelo in precios:
        return precios[modelo]
    candidatos = [k for k in precios if modelo.startswith(k)]
    return precios[max(candidatos, key=len)] if candidatos else None


def costo(usage: dict, modelo: str) -> dict:
    """USD de una consulta a partir de su `usage` (input/output tokens) y modelo.

    Si el modelo no está tarifado -> usd_* = None + nota (nunca rompe)."""
    inp = int((usage or {}).get("input_tokens", 0) or 0)
    out = int((usage or {}).get("output_tokens", 0) or 0)
    par = tarifa(modelo)
    if par is None:
        return {"modelo": modelo, "usd_input": None, "usd_output": None,
                "usd_total": None, "tarifa": None,
                "nota": f"sin tarifa para {modelo!r}; definila en PRECIOS_JSON"}
    p_in, p_out = par
    usd_in = round(inp / 1_000_000 * p_in, 6)
    usd_out = round(out / 1_000_000 * p_out, 6)
    return {
        "modelo": modelo,
        "usd_input": usd_in,
        "usd_output": usd_out,
        "usd_total": round(usd_in + usd_out, 6),
        "tarifa": {"usd_in_por_mtok": p_in, "usd_out_por_mtok": p_out},
    }
