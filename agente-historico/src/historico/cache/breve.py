"""`CacheBreve`: memo con TTL corto, techo de tamaño y coalescencia (single-flight)."""
from __future__ import annotations

import copy
import os
import threading
import time
from collections import OrderedDict
from typing import Any, Callable, Hashable

# Cuantos segundos vale una entrada. Corto A PROPOSITO: es el tope de cuanto puede
# durar un veredicto viejo si el barrido corre en otro proceso (ver la cabecera).
#
# Se puede ser agresivo con este numero porque la ganancia grande NO la da el TTL
# sino la coalescencia, que no depende de el: aunque valiera cero segundos, las
# cinco peticiones simultaneas de una vista seguirian haciendo una sola consulta.
# Lo unico que compra el TTL es la RECARGA (el que vuelve a la misma vista, o pasa
# de una pestaña a otra), y diez segundos alcanzan para eso. Subirlo alarga
# exactamente la ventana en la que se podria servir un veredicto viejo.
#
# `HISTORICO_CACHE_TTL_SEG=0` lo apaga del todo, sin tocar codigo.
TTL_SEG = float(os.environ.get("HISTORICO_CACHE_TTL_SEG", "10"))

# Techo de entradas. Acotado porque la clave lleva el rango de fechas, y un cliente
# que barra rangos podria sembrar miles: un cache sin techo es una fuga de memoria
# con otro nombre. Al pasarse se descarta la MAS VIEJA (FIFO por creacion), que con
# un TTL de segundos es equivalente a la menos util.
MAXIMO_ENTRADAS = int(os.environ.get("HISTORICO_CACHE_MAX", "128"))


class _Entrada:
    """Una clave en vuelo o ya resuelta. `listo` es lo que espera el que coalesce."""

    __slots__ = ("listo", "valor", "fallo", "vence")

    def __init__(self) -> None:
        self.listo = threading.Event()
        self.valor: Any = None
        self.fallo: BaseException | None = None
        self.vence: float = 0.0


class CacheBreve:
    """Memo con TTL, techo de tamaño y coalescencia. Thread-safe."""

    def __init__(self, ttl_seg: float = TTL_SEG, maximo: int = MAXIMO_ENTRADAS) -> None:
        self.ttl_seg = ttl_seg
        self.maximo = maximo
        self._candado = threading.Lock()
        self._entradas: OrderedDict[Hashable, _Entrada] = OrderedDict()

    @property
    def activo(self) -> bool:
        """Con TTL 0 el cache no guarda nada. Es la forma de apagarlo por entorno."""
        return self.ttl_seg > 0 and self.maximo > 0

    def obtener(self, clave: Hashable, calcular: Callable[[], Any]) -> Any:
        """El valor de `clave`, calculandolo solo si hace falta. Devuelve una COPIA."""
        if not self.activo:
            return calcular()
        entrada, calculo_mio = self._reservar(clave)
        if calculo_mio:
            return copy.deepcopy(self._calcular(clave, entrada, calcular))
        entrada.listo.wait()
        if entrada.fallo is not None:
            # El lider fallo. El que esperaba lo intenta por su cuenta en vez de
            # heredar una excepcion de otro hilo: el traceback ajeno confunde y el
            # fallo puede haber sido transitorio (una conexion que el pooler cerro).
            return calcular()
        return copy.deepcopy(entrada.valor)

    def invalidar_todo(self) -> None:
        """Tira todo lo guardado. La llama `db.ejecutar*` despues de escribir."""
        with self._candado:
            self._entradas.clear()

    # ── interior ────────────────────────────────────────────────────────────
    def _reservar(self, clave: Hashable) -> tuple[_Entrada, bool]:
        """La entrada de `clave` y si a ESTE hilo le toca calcularla."""
        ahora = time.monotonic()
        with self._candado:
            entrada = self._entradas.get(clave)
            # Sirve tanto la ya resuelta y fresca como la que otro esta calculando
            # AHORA (`listo` sin marcar): esa segunda es la coalescencia.
            if entrada is not None and (not entrada.listo.is_set()
                                        or entrada.vence > ahora):
                return entrada, False
            entrada = _Entrada()
            self._entradas[clave] = entrada
            self._entradas.move_to_end(clave)
            self._podar(ahora)
            return entrada, True

    def _calcular(self, clave: Hashable, entrada: _Entrada,
                  calcular: Callable[[], Any]) -> Any:
        try:
            valor = calcular()
        except BaseException as exc:                       # noqa: BLE001
            # Un fallo NO se cachea: se despierta a los que esperan y se saca la
            # entrada, para que el siguiente lo intente de verdad.
            entrada.fallo = exc
            with self._candado:
                if self._entradas.get(clave) is entrada:
                    del self._entradas[clave]
            entrada.listo.set()
            raise
        entrada.valor = valor
        entrada.vence = time.monotonic() + self.ttl_seg
        entrada.listo.set()
        return valor

    def _podar(self, ahora: float) -> None:
        """Saca vencidas y, si aun sobran, las mas viejas. Con el candado tomado."""
        for clave in [c for c, e in self._entradas.items()
                      if e.listo.is_set() and e.vence <= ahora]:
            del self._entradas[clave]
        while len(self._entradas) > self.maximo:
            self._entradas.popitem(last=False)
