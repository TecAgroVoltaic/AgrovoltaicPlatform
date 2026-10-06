"""Lazo conversacional del Historico (tool-use manual con el SDK de Anthropic).

El agente no sabe SQL ni fisica: solo orquesta. Manda la pregunta al modelo con las
tools disponibles; cuando el modelo llama una, el lazo la ejecuta (DISPATCH) y le
devuelve el JSON; el modelo redacta la respuesta final en espanol. Patron manual
(no el tool-runner beta) para control total y no filtrar el razonamiento interno.

Es GENERICO sobre el registro de tools: no hay logica de ninguna tool aqui.
"""
from __future__ import annotations

import time
from typing import Iterator

import anthropic

from historico import config, costos, tools
from historico.agent import lazo
from historico.agent.prompts import CHAT_SYSTEM, SYSTEM_PROMPT
from historico.analitica.resumen import hoy_en_sitio

# Web search del lado servidor (Anthropic la ejecuta). max_uses acota el gasto:
# cada busqueda tiene costo y mete ~miles de tokens de resultados -> pocas.
WEB_SEARCH = {"type": "web_search_20250305", "name": "web_search", "max_uses": 3}
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
        messages = [{"role": "user", "content": pregunta}]
        pasos: list[dict] = []
        usage = {"input_tokens": 0, "output_tokens": 0, "requests": 0}
        t0 = time.perf_counter()
        respuesta = ""
        while True:
            resp = self.client.messages.create(
                model=self.model,
                max_tokens=config.MAX_TOKENS,
                system=SYSTEM_PROMPT,
                tools=tools.SCHEMAS,
                messages=messages,
            )
            usage["requests"] += 1
            if resp.usage:
                usage["input_tokens"] += resp.usage.input_tokens
                usage["output_tokens"] += resp.usage.output_tokens

            # Registrar el turno del modelo: su texto (razonamiento/redaccion) y
            # las tools que decide llamar.
            texto = "".join(b.text for b in resp.content if b.type == "text").strip()
            solicita = [{"id": b.id, "nombre": b.name, "input": b.input}
                        for b in resp.content if b.type == "tool_use"]
            if texto or solicita:
                pasos.append({"tipo": "modelo", "texto": texto,
                              "solicita": solicita, "stop_reason": resp.stop_reason})

            if resp.stop_reason == "refusal":
                respuesta = "No puedo responder a eso."
                break

            if resp.stop_reason in ("end_turn", "max_tokens"):
                respuesta = texto
                break

            if resp.stop_reason == "pause_turn":
                messages.append({"role": "assistant", "content": resp.content})
                continue

            # stop_reason == "tool_use": ejecutar la(s) tool(s) y devolver resultados.
            messages.append({"role": "assistant", "content": resp.content})
            resultados = []
            for b in resp.content:
                if b.type == "tool_use":
                    paso, resultado = lazo.ejecutar_tool(b)
                    pasos.append(paso)
                    resultados.append(resultado)
            messages.append({"role": "user", "content": resultados})

        return {
            "pregunta": pregunta,
            "respuesta": respuesta,
            "modelo": self.model,
            "pasos": pasos,
            "usage": usage,
            "costo": costos.costo(usage, self.model),  # USD de esta consulta
            "ms_total": int((time.perf_counter() - t0) * 1000),
        }

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

    def _turno(self, en_vivo: bool, **kwargs):
        """Una llamada al modelo. En vivo emite los deltas de texto; devuelve el
        mensaje final (el mismo objeto que `messages.create`) via `yield from`."""
        if not en_vivo:
            return self.client.messages.create(**kwargs)
        with self.client.messages.stream(**kwargs) as stream:
            for evento in stream:
                if evento.type == "text" and evento.text:
                    yield lazo.TEXTO, {"delta": evento.text}
            return stream.get_final_message()

    def _traza(self, respuesta: str, pasos: list[dict], usage: dict, t0: float) -> dict:
        return {"respuesta": respuesta, "modelo": self.model, "pasos": pasos,
                "usage": usage, "costo": costos.costo(usage, self.model),
                "ms_total": int((time.perf_counter() - t0) * 1000)}

    def _lazo_chat(self, mensajes: list[dict], contexto: str | None,
                   en_vivo: bool) -> Iterator[tuple[str, dict]]:
        """El lazo del chat como eventos. Unica implementacion de `chat` y `chat_stream`."""
        t0 = time.perf_counter()
        yield lazo.INICIO, {"modelo": self.model}
        ms = self._historial(mensajes, contexto)
        if ms is None:
            yield lazo.FIN, {**self._traza("", [], lazo.uso_vacio(), t0), "ms_total": 0}
            return
        system = [{"type": "text", "text": CHAT_SYSTEM, "cache_control": {"type": "ephemeral"}}]
        client_tools = [dict(s) for s in tools.SCHEMAS]
        client_tools[-1] = {**client_tools[-1], "cache_control": {"type": "ephemeral"}}
        herramientas = client_tools + [WEB_SEARCH]

        pasos: list[dict] = []
        usage = lazo.uso_vacio()
        while True:
            resp = yield from self._turno(en_vivo, model=self.model,
                                          max_tokens=config.MAX_TOKENS, system=system,
                                          tools=herramientas, messages=ms)
            lazo.sumar_uso(usage, resp.usage)
            texto, nuevos = lazo.pasos_del_turno(resp)
            for paso in nuevos:
                pasos.append(paso)
                yield lazo.PASO, paso

            if resp.stop_reason == "refusal":
                respuesta = "No puedo responder a eso."
                break
            if resp.stop_reason in ("end_turn", "max_tokens"):
                respuesta = texto
                break
            ms.append({"role": "assistant", "content": resp.content})
            if resp.stop_reason == "pause_turn":  # p.ej. web_search a mitad de turno
                continue

            # stop_reason == "tool_use": ejecutar las tools CLIENTE.
            resultados = []
            for b in resp.content:
                if b.type != "tool_use":
                    continue
                yield lazo.TOOL_INICIO, {"id": b.id, "nombre": b.name, "input": b.input}
                paso, resultado = lazo.ejecutar_tool(b)
                pasos.append(paso)
                resultados.append(resultado)
                yield lazo.PASO, paso
            ms.append({"role": "user", "content": resultados})

        yield lazo.FIN, self._traza(respuesta, pasos, usage, t0)
