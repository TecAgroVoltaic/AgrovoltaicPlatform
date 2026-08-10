"""Lazo conversacional del analizador (tool-use manual con el SDK de Anthropic).

El agente no sabe SQL ni fisica: solo orquesta. Manda la pregunta al modelo con las
tools disponibles; cuando el modelo llama una, el lazo la ejecuta (DISPATCH) y le
devuelve el JSON; el modelo redacta la respuesta final en espanol. Patron manual
(no el tool-runner beta) para control total y no filtrar el razonamiento interno.

Es GENERICO sobre el registro de tools: no hay logica de ninguna tool aqui.
"""
from __future__ import annotations

import json
import time

import anthropic

from analizador import config, costos, tools
from analizador.agent.prompts import CHAT_SYSTEM, SYSTEM_PROMPT

# Web search del lado servidor (Anthropic la ejecuta). max_uses acota el gasto:
# cada busqueda tiene costo y mete ~miles de tokens de resultados -> pocas.
WEB_SEARCH = {"type": "web_search_20250305", "name": "web_search", "max_uses": 3}


class Analizador:
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
                if b.type != "tool_use":
                    continue
                fn = tools.DISPATCH.get(b.name)
                ts = time.perf_counter()
                try:
                    if fn is None:
                        raise ValueError(f"herramienta desconocida: {b.name}")
                    out = fn(**b.input)
                    pasos.append({"tipo": "tool", "nombre": b.name, "input": b.input,
                                  "salida": out, "error": False,
                                  "ms": int((time.perf_counter() - ts) * 1000)})
                    resultados.append({
                        "type": "tool_result",
                        "tool_use_id": b.id,
                        "content": json.dumps(out, ensure_ascii=False),
                    })
                except Exception as e:  # el modelo vera el error y podra reaccionar
                    pasos.append({"tipo": "tool", "nombre": b.name, "input": b.input,
                                  "salida": str(e), "error": True,
                                  "ms": int((time.perf_counter() - ts) * 1000)})
                    resultados.append({
                        "type": "tool_result",
                        "tool_use_id": b.id,
                        "content": f"Error: {e}",
                        "is_error": True,
                    })
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
        usuario (vista + filtros). Devuelve {respuesta, pasos, usage, costo}.

        Diseno (pensamiento critico): el historial es SOLO texto (nada de bloques
        tool_use/tool_result) -> no puede quedar malformado y no arrastra los JSON
        pesados de las tools (barato). El system + tools van con cache_control
        (estatico -> cacheado); el contexto de la vista va en el turno del usuario,
        fuera de la parte cacheada, para no romper la cache al cambiar de filtro."""
        ms: list[dict] = []
        for m in mensajes:
            rol = "assistant" if str(m.get("rol")) in ("assistant", "agente") else "user"
            texto = str(m.get("texto", "")).strip()
            if texto:
                ms.append({"role": rol, "content": texto})
        if not ms or ms[-1]["role"] != "user":
            return {"respuesta": "", "modelo": self.model, "pasos": [],
                    "usage": {"input_tokens": 0, "output_tokens": 0, "requests": 0},
                    "costo": costos.costo({"input_tokens": 0, "output_tokens": 0}, self.model),
                    "ms_total": 0}
        if contexto:
            ms[-1]["content"] = f"[Contexto de la vista: {contexto}]\n\n{ms[-1]['content']}"
        ms = ms[-16:]  # cap de historial: ultimos ~8 turnos

        system = [{"type": "text", "text": CHAT_SYSTEM, "cache_control": {"type": "ephemeral"}}]
        client_tools = [dict(s) for s in tools.SCHEMAS]
        client_tools[-1] = {**client_tools[-1], "cache_control": {"type": "ephemeral"}}
        herramientas = client_tools + [WEB_SEARCH]

        pasos: list[dict] = []
        usage = {"input_tokens": 0, "output_tokens": 0, "requests": 0,
                 "cache_read": 0, "cache_write": 0, "web_searches": 0}
        t0 = time.perf_counter()
        respuesta = ""
        while True:
            resp = self.client.messages.create(
                model=self.model, max_tokens=config.MAX_TOKENS,
                system=system, tools=herramientas, messages=ms,
            )
            usage["requests"] += 1
            u = resp.usage
            if u:
                usage["input_tokens"] += u.input_tokens or 0
                usage["output_tokens"] += u.output_tokens or 0
                usage["cache_read"] += getattr(u, "cache_read_input_tokens", 0) or 0
                usage["cache_write"] += getattr(u, "cache_creation_input_tokens", 0) or 0
                stu = getattr(u, "server_tool_use", None)
                if stu:
                    usage["web_searches"] += getattr(stu, "web_search_requests", 0) or 0

            texto = "".join(b.text for b in resp.content if b.type == "text").strip()
            solicita = [{"id": b.id, "nombre": b.name, "input": b.input}
                        for b in resp.content if b.type == "tool_use"]
            webs = [getattr(b, "input", {}).get("query") for b in resp.content
                    if b.type == "server_tool_use"]
            if texto or solicita or webs:
                pasos.append({"tipo": "modelo", "texto": texto, "solicita": solicita,
                              "stop_reason": resp.stop_reason})
            for w in webs:
                if w:
                    pasos.append({"tipo": "web", "query": w})

            if resp.stop_reason == "refusal":
                respuesta = "No puedo responder a eso."
                break
            if resp.stop_reason in ("end_turn", "max_tokens"):
                respuesta = texto
                break
            if resp.stop_reason == "pause_turn":  # p.ej. web_search a mitad de turno
                ms.append({"role": "assistant", "content": resp.content})
                continue

            # stop_reason == "tool_use": ejecutar las tools CLIENTE.
            ms.append({"role": "assistant", "content": resp.content})
            resultados = []
            for b in resp.content:
                if b.type != "tool_use":
                    continue
                fn = tools.DISPATCH.get(b.name)
                ts = time.perf_counter()
                try:
                    if fn is None:
                        raise ValueError(f"herramienta desconocida: {b.name}")
                    out = fn(**b.input)
                    # El LLM no necesita los arreglos del grafico (tokens); el widget si.
                    para_llm = ({k: v for k, v in out.items() if k != "_grafico"}
                                if isinstance(out, dict) and "_grafico" in out else out)
                    pasos.append({"tipo": "tool", "nombre": b.name, "input": b.input,
                                  "salida": out, "error": False,
                                  "ms": int((time.perf_counter() - ts) * 1000)})
                    resultados.append({"type": "tool_result", "tool_use_id": b.id,
                                       "content": json.dumps(para_llm, ensure_ascii=False)})
                except Exception as e:
                    pasos.append({"tipo": "tool", "nombre": b.name, "input": b.input,
                                  "salida": str(e), "error": True,
                                  "ms": int((time.perf_counter() - ts) * 1000)})
                    resultados.append({"type": "tool_result", "tool_use_id": b.id,
                                       "content": f"Error: {e}", "is_error": True})
            ms.append({"role": "user", "content": resultados})

        return {
            "respuesta": respuesta, "modelo": self.model, "pasos": pasos, "usage": usage,
            "costo": costos.costo(usage, self.model),
            "ms_total": int((time.perf_counter() - t0) * 1000),
        }
