"""Frenos de consumo del Historico. Responsabilidad unica: decir SI o NO.

Existe por un agujero concreto: el agente CONTABA lo que gastaba (`uso.py`) pero
no lo topaba. Lo unico que evitaba que su chat fuera un endpoint de LLM sin techo
era una variable de entorno de la consola que lo escondia, y esconder un boton no
es un limite: la puerta seguia abierta para cualquiera con la cookie de sesion y
un `curl`. Ahora el freno vive en el servicio, que es donde se gasta la plata, y
la consola puede mostrar el chat siempre.

DOS frenos, porque protegen de cosas distintas:

  * RITMO (por identidad): un bucle o una pestaña recargando no puede disparar
    cien consultas en un minuto. No mira el costo, mira la frecuencia.
  * PRESUPUESTO (gasto del dia): acota el TOTAL, sin importar quien llame. Es el
    que responde "cuanto puede costarme esto como maximo hoy".

El gasto se lee del acumulado LOCAL (`uso.py`). Es mas debil que el del
Predictivo, que lo guarda en el store y por lo tanto sobrevive a que se recree el
contenedor y no se duplica entre instancias. Aca alcanza porque el Historico
corre en un solo contenedor, pero la diferencia esta dicha a proposito: si algun
dia hay dos instancias, cada una tendra su propio tope.
"""
from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass, field

from historico import uso as uso_mod

# Consultas que gastan tokens del LLM, por identidad y por minuto.
LIMITE_LLM_POR_MIN = int(os.environ.get("RATE_LIMIT_LLM_POR_MIN", "12"))
# Tope de gasto del dia en USD. 0 = sin tope.
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
        for k in [k for k, b in self._baldes.items()
                  if ahora - b.ultimo > TTL_IDENTIDAD_SEG]:
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
            balde.tokens = min(float(self.por_minuto),
                               balde.tokens + (ahora - balde.ultimo) * self._ritmo)
            balde.ultimo = ahora
            if balde.tokens < 1:
                return False
            balde.tokens -= 1
            return True

    def espera_seg(self) -> int:
        """Cuanto esperar para tener un token de nuevo (para Retry-After)."""
        return max(1, int(SEGUNDOS_POR_MINUTO / self.por_minuto))


LIMITADOR_LLM = LimitadorRitmo(por_minuto=LIMITE_LLM_POR_MIN)


def presupuesto_agotado(tope_usd: float | None = None) -> tuple[bool, float, float]:
    """(agotado, gastado_hoy, tope). Con tope 0 nunca se agota."""
    tope = PRESUPUESTO_DIARIO_USD if tope_usd is None else tope_usd
    gastado = uso_mod.usd_hoy()
    return (tope > 0 and gastado >= tope), gastado, tope
