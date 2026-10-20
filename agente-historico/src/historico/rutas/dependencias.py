"""Dependencias compartidas por los routers: API key, freno de consumo y agente perezoso.

Seguridad: si HISTORICO_API_KEY esta en el entorno, las rutas protegidas exigen el
header `x-api-key` (comparacion en tiempo constante). /health, /tools y
/arquitectura quedan abiertos.
"""
from __future__ import annotations

import hashlib
import os
import re
import secrets

from fastapi import Header, HTTPException, status

from historico import limites

ENV_API_KEY = "HISTORICO_API_KEY"
# Nombre anterior. Se sigue leyendo porque el contenedor desplegado tiene el viejo
# en su entorno, y aca la ausencia de clave no falla: DESACTIVA la verificacion.
# O sea que un renombre sin respaldo no rompe el servicio, lo deja abierto.
ENV_API_KEY_PREVIO = "HISTORICO_API_KEY"

# Agente perezoso: solo se construye al primer /preguntar (anthropic.Anthropic()
# exige ANTHROPIC_API_KEY al crear el cliente; /health y /tool no deben depender
# de esa clave). Se cachea para no releer el entorno en cada request.
_AGENTE = None
_ASISTENTE = None


def _agente():
    global _AGENTE
    if _AGENTE is None:
        from historico.agent.agent import Historico
        _AGENTE = Historico()
    return _AGENTE


def _asistente():
    """El agente del asistente: mismo lazo, otro modelo (`config.MODEL_ASISTENTE`)."""
    global _ASISTENTE
    if _ASISTENTE is None:
        from historico import config
        from historico.agent.agent import Historico
        _ASISTENTE = Historico(model=config.MODEL_ASISTENTE)
    return _ASISTENTE


def _identidad(x_api_key: str | None) -> str:
    """Con quien se lleva la cuenta del ritmo. La clave se hashea: el limitador
    guarda identidades en memoria y no tiene por que tener el secreto en claro."""
    return hashlib.sha256((x_api_key or "anonimo").encode()).hexdigest()[:16]


def _frenar_consumo(x_api_key: str | None = Header(default=None)) -> None:
    """Los dos frenos de los endpoints que gastan tokens del LLM.

    Va como dependencia y no dentro del handler para que sea imposible agregar
    una ruta conversacional sin freno: se ve en la firma del endpoint.
    """
    if not limites.LIMITADOR_LLM.permitir(_identidad(x_api_key)):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(f"limite de {limites.LIMITE_LLM_POR_MIN} consultas por minuto. "
                    f"Reintenta en unos segundos."),
            headers={"Retry-After": str(limites.LIMITADOR_LLM.espera_seg())},
        )
    agotado, gastado, tope = limites.presupuesto_agotado()
    if agotado:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(f"presupuesto diario agotado: US$ {gastado:.4f} de US$ {tope:.2f}. "
                    f"Las vistas deterministas siguen funcionando."),
        )


# Canal de una llamada a /tool (header `x-origen`, p. ej. `flow`). Sin header es una
# llamada directa a la API. Se normaliza porque termina en el log, en el reporte de
# fallas y como clave del registro de uso: un valor libre no puede inflar ese dict.
CANAL_POR_DEFECTO = "api"
_CANAL_VALIDO = re.compile(r"^[a-z0-9_-]{1,32}$")


def _canal(x_origen: str | None = Header(default=None)) -> str:
    valor = (x_origen or "").strip().lower()
    return valor if _CANAL_VALIDO.match(valor) else CANAL_POR_DEFECTO


def _frenar_tool(x_api_key: str | None = Header(default=None),
                 x_origen: str | None = Header(default=None)) -> None:
    """El freno de ritmo de `_frenar_consumo`, con balde propio, para `/tool`.

    Sin el freno de presupuesto: una tool no gasta tokens (el LLM que la pide corre en
    Visione Flow y gasta alli), y el tope diario deja vivo a proposito lo determinista.
    """
    if not limites.LIMITADOR_TOOL.permitir(f"{_identidad(x_api_key)}:{_canal(x_origen)}"):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(f"limite de {limites.LIMITE_TOOL_POR_MIN} llamadas a herramientas por "
                    f"minuto. Reintenta en unos segundos."),
            headers={"Retry-After": str(limites.LIMITADOR_TOOL.espera_seg())},
        )


def _verificar_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Exige la API key SOLO si esta configurada. Comparacion en tiempo constante."""
    esperada = os.environ.get(ENV_API_KEY) or os.environ.get(ENV_API_KEY_PREVIO)
    if not esperada:
        return
    if not secrets.compare_digest(esperada, x_api_key or ""):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="API key invalida")
