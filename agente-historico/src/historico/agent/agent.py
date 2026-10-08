"""Lazo conversacional del Historico (tool-use manual con el SDK de Anthropic).

El agente no sabe SQL ni fisica: solo orquesta. Manda la pregunta al modelo con las
tools disponibles; cuando el modelo llama una, el lazo la ejecuta (DISPATCH) y le
devuelve el JSON; el modelo redacta la respuesta final en espanol. Patron manual
(no el tool-runner beta) para control total y no filtrar el razonamiento interno.

Es GENERICO sobre el registro de tools: no hay logica de ninguna tool aqui. Los
lazos viven en `lazo_preguntar` (traza de `/preguntar`) y `lazo_chat` (eventos del
chat); esta clase arma el historial y delega.
"""
from __future__ import annotations

import time
from typing import Iterator

import anthropic

from historico import config
from historico.agent import lazo, lazo_chat, lazo_preguntar
from historico.agent.lazo_chat import WEB_SEARCH  # noqa: F401
from historico.analitica.resumen import hoy_en_sitio

# Ultimos mensajes del historial que viajan al modelo (~8 turnos).
_TOPE_HISTORIAL = 16


class Historico:
    """Orquestador conversacional sobre el registro de tools de analisis."""

    def __init__(self, client=None, model: str = config.MODEL):
        # anthropic.Anthropic() lee ANTHROPIC_API_KEY del entorno.
        self.client = client or anthropic.Anthropic()
        self.model = model

    def conversar(self, pregunta: str) -> dict:
        """Responde y devuelve la TRAZA completa (para el debugger).

        Corre el mismo lazo tool-use, pero registra cada paso: los turnos del
        modelo (texto + tools que pide) y cada ejecucion de tool (input, salida
        cruda, error, ms). El dict es JSON-serializable tal cual. `preguntar()`
        es azucar sobre esto -> una sola fuente de verdad del lazo (DRY).
        """
        return lazo_preguntar.conversar(self.client, self.model, pregunta)

    def preguntar(self, pregunta: str) -> str:
        """Responde una pregunta en lenguaje natural (solo el texto final)."""
        return self.conversar(pregunta)["respuesta"]

    def chat(self, mensajes: list[dict], contexto: str | None = None) -> dict:
        """Turno de CHAT multi-turno. `mensajes` = historial de texto limpio
        [{rol, texto}] (el ultimo es del usuario). `contexto` = que esta mirando el
        usuario (vista + filtros). Devuelve {respuesta, modelo, pasos, usage, costo,
        ms_total}: es el evento `fin` del lazo, sin los intermedios.

        Diseno (pensamiento critico): el historial es SOLO texto (nada de bloques
        tool_use/tool_result) -> no puede quedar malformado y no arrastra los JSON
        pesados de las tools (barato). El system + tools van con cache_control
        (estatico -> cacheado); el contexto de la vista va en el turno del usuario,
        fuera de la parte cacheada, para no romper la cache al cambiar de filtro."""
        for evento, datos in self._lazo_chat(mensajes, contexto, en_vivo=False):
            if evento == lazo.FIN:
                return datos
        raise RuntimeError("el lazo del chat termino sin evento `fin`")

    def chat_stream(self, mensajes: list[dict],
                    contexto: str | None = None) -> Iterator[tuple[str, dict]]:
        """El mismo turno que `chat`, como eventos (nombre, datos) del contrato §3:
        `inicio`, `tool_inicio`, `paso`, `texto` (deltas del SDK) y `fin`, que lleva
        exactamente lo que devuelve `chat`.

        Los deltas de `texto` son los de TODOS los turnos del modelo: el SDK no
        avisa de antemano si un turno va a terminar pidiendo una tool. El `paso` de
        tipo `modelo` cierra cada turno; si su `stop_reason` es `tool_use`, el texto
        acumulado era intermedio. `fin.respuesta` es la version autoritativa."""
        yield from self._lazo_chat(mensajes, contexto, en_vivo=True)

    @staticmethod
    def _historial(mensajes: list[dict], contexto: str | None) -> list[dict] | None:
        """El historial en formato del SDK, o None si no termina en el usuario."""
        ms: list[dict] = []
        for m in mensajes:
            rol = "assistant" if str(m.get("rol")) in ("assistant", "agente") else "user"
            texto = str(m.get("texto", "")).strip()
            if texto:
                ms.append({"role": rol, "content": texto})
        if not ms or ms[-1]["role"] != "user":
            return None
        if contexto:
            ms[-1]["content"] = f"[Contexto de la vista: {contexto}]\n\n{ms[-1]['content']}"
        # La fecha va en el turno y no en el system: el system esta cacheado y una
        # fecha adentro lo invalidaria cada dia. Sin ella el modelo no puede traducir
        # "hace 15 dias" a un rango.
        ms[-1]["content"] = f"[Hoy en el sitio: {hoy_en_sitio().isoformat()}]\n{ms[-1]['content']}"
        return ms[-_TOPE_HISTORIAL:]

    def _lazo_chat(self, mensajes: list[dict], contexto: str | None,
                   en_vivo: bool) -> Iterator[tuple[str, dict]]:
        """El lazo del chat como eventos. Unica implementacion de `chat` y `chat_stream`."""
        t0 = time.perf_counter()
        yield lazo.INICIO, {"modelo": self.model}
        ms = self._historial(mensajes, contexto)
        if ms is None:
            vacia = lazo_chat.traza(self.model, "", [], lazo.uso_vacio(), t0)
            yield lazo.FIN, {**vacia, "ms_total": 0}
            return
        yield from lazo_chat.eventos(self.client, self.model, ms, en_vivo, t0)
