"""Codec del plan en la URL: JSON compacto -> base64url SIN relleno, tope 4 KB."""
from __future__ import annotations

import base64
import binascii
import json

from historico.plan.modelo import MAX_PLAN_BYTES, PlanInvalido


def codificar(plan: dict) -> str:
    """`p=` de la URL. Corta con `plan_demasiado_largo` si pasa de 4 KB codificado."""
    crudo = json.dumps(plan, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    texto = base64.urlsafe_b64encode(crudo).decode("ascii").rstrip("=")
    if len(texto) > MAX_PLAN_BYTES:
        raise PlanInvalido("plan_demasiado_largo",
                           f"el plan codificado ocupa {len(texto)} bytes y el tope es {MAX_PLAN_BYTES}: "
                           f"usa menos archivos o columnas, o alias mas cortos")
    return texto


def decodificar(texto: str | None) -> dict:
    """El dict del plan desde `p=`. `plan_ilegible` si no es base64url de un objeto JSON."""
    if not texto:
        raise PlanInvalido("plan_ilegible", "falta el parametro 'p' con el plan")
    if len(texto) > MAX_PLAN_BYTES:
        raise PlanInvalido("plan_demasiado_largo",
                           f"el plan codificado ocupa {len(texto)} bytes y el tope es {MAX_PLAN_BYTES}")
    try:
        crudo = base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))
        plan = json.loads(crudo.decode("utf-8"))
    except (binascii.Error, ValueError, UnicodeDecodeError) as exc:
        raise PlanInvalido("plan_ilegible", f"el plan no es base64url de un JSON valido: {exc}") from None
    if not isinstance(plan, dict):
        raise PlanInvalido("plan_ilegible", "el plan tiene que ser un objeto JSON")
    return plan
