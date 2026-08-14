"""
Frenos de consumo: cuantas llamadas por minuto y cuanto gasto por dia.

SRP: decide SI una llamada puede pasar. No corre el LLM, no acumula uso (eso es
uso.py) ni traduce la decision a HTTP (eso es api.py).

Por que existe: `/uso` ya media tokens y USD, pero solo para mirar. No habia
ningun freno — un bucle, un scraper o un error de integracion podian disparar
el costo del LLM sin tope. Combinado con la consola sin auth, era riesgo directo
de factura.

Dos frenos independientes:
  * RITMO (token bucket por identidad): acota rafagas. La identidad es la API
    key si viene, si no la IP.
  * PRESUPUESTO (gasto del dia): acota el total, sin importar quien llame.
"""
from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass, field

from pronostico import uso as uso_mod

# Llamadas por minuto que gastan LLM (/preguntar, /chat). Generoso para uso
# humano, letal para un bucle.
LIMITE_LLM_POR_MIN = int(os.environ.get("RATE_LIMIT_LLM_POR_MIN", "12"))
# Endpoints deterministas (/forecast, /serie, /anomalias): no gastan tokens, el
# limite solo protege CPU.
LIMITE_DATOS_POR_MIN = int(os.environ.get("RATE_LIMIT_DATOS_POR_MIN", "120"))
# Tope de gasto diario en USD. 0 = sin tope (hay que pedirlo explicitamente).
PRESUPUESTO_DIARIO_USD = float(os.environ.get("PRESUPUESTO_DIARIO_USD", "5"))

SEGUNDOS_POR_MINUTO = 60.0
# Identidades inactivas que se descartan para que el dict no crezca sin fin.
TTL_IDENTIDAD_SEG = 3600


@dataclass
class _Balde:
    """Token bucket: `tokens` disponibles que se rellenan a `ritmo` por segundo."""

    tokens: float
    ultimo: float


@dataclass
class LimitadorRitmo:
    """Token bucket por identidad, seguro entre hilos.

    FastAPI corre los endpoints sincronos en su threadpool, asi que el estado
    compartido se protege con un lock.
    """

    por_minuto: int
    _baldes: dict[str, _Balde] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    @property
    def _ritmo(self) -> float:
        return self.por_minuto / SEGUNDOS_POR_MINUTO

    def _purgar(self, ahora: float) -> None:
        vencidas = [k for k, b in self._baldes.items()
                    if ahora - b.ultimo > TTL_IDENTIDAD_SEG]
        for k in vencidas:
            del self._baldes[k]

    def permitir(self, identidad: str, ahora: float | None = None) -> bool:
        """Consume un token. False si la identidad se paso del ritmo."""
        ahora = time.monotonic() if ahora is None else ahora
        with self._lock:
            self._purgar(ahora)
            balde = self._baldes.get(identidad)
            if balde is None:
                # Arranca lleno: la primera llamada nunca se rechaza.
                self._baldes[identidad] = _Balde(tokens=self.por_minuto - 1, ultimo=ahora)
                return True
            balde.tokens = min(
                float(self.por_minuto),
                balde.tokens + (ahora - balde.ultimo) * self._ritmo,
            )
            balde.ultimo = ahora
            if balde.tokens < 1:
                return False
            balde.tokens -= 1
            return True

    def espera_seg(self) -> int:
        """Cuanto esperar para tener un token de nuevo (para Retry-After)."""
        return max(1, int(SEGUNDOS_POR_MINUTO / self.por_minuto))


# Un limitador por familia de endpoints: el que gasta plata y el que no.
LIMITADOR_LLM = LimitadorRitmo(por_minuto=LIMITE_LLM_POR_MIN)
LIMITADOR_DATOS = LimitadorRitmo(por_minuto=LIMITE_DATOS_POR_MIN)


def presupuesto_agotado(tope_usd: float | None = None) -> tuple[bool, float, float]:
    """(agotado, gastado_hoy, tope). Con tope 0 nunca se agota."""
    tope = PRESUPUESTO_DIARIO_USD if tope_usd is None else tope_usd
    gastado = uso_mod.usd_hoy()
    return (tope > 0 and gastado >= tope), gastado, tope
