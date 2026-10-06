"""
Tests de `POST /chat/stream` (contrato §3) con el cliente de Anthropic SIMULADO.

Se fija la secuencia de eventos SSE, que `fin` sea exactamente lo que devuelve
`/chat`, que las claves `_` de una tool no viajen al modelo y que un fallo cierre el
stream con `error` en vez de cortarlo mudo. Sin red ni base. Given-When-Then.
"""
import json
from types import SimpleNamespace

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient

from historico import api, chat_sse, tools
from historico.agent.agent import Historico

CLIENTE = TestClient(api.app)
GRAFICO = {"version": 1, "tipo": "serie", "datos": {"lines": [], "unit": "W"}}
SALIDA_TOOL = {"resumen": {"n": 3}, "_grafico": GRAFICO, "nota": "comenta"}
INPUT_TOOL = {"tipo": "serie", "variables": ["potencia_pv1_w"]}
ORDEN_ESPERADO = ["inicio", "texto", "paso", "tool_inicio", "paso", "texto", "texto",
                  "paso", "fin"]


def _uso():
    return SimpleNamespace(input_tokens=10, output_tokens=5, cache_read_input_tokens=0,
                           cache_creation_input_tokens=0, server_tool_use=None)


def _mensaje(bloques, stop_reason):
    return SimpleNamespace(content=bloques, stop_reason=stop_reason, usage=_uso())


def _texto(t):
    return SimpleNamespace(type="text", text=t)


TURNOS = [
    ([_texto("Busco los datos.")],
     _mensaje([_texto("Busco los datos."),
               SimpleNamespace(type="tool_use", id="t1", name="graficar", input=INPUT_TOOL)],
              "tool_use")),
    ([_texto("Sube "), _texto("en agosto.")],
     _mensaje([_texto("Sube en agosto.")], "end_turn")),
]


class _Stream:
    """Imita `MessageStream`: itera eventos (solo algunos de texto) y da el final."""

    def __init__(self, deltas, final):
        self._deltas, self._final = deltas, final

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def __iter__(self):
        yield SimpleNamespace(type="message_start")
        for d in self._deltas:
            yield SimpleNamespace(type="text", text=d.text)
        yield SimpleNamespace(type="content_block_stop")

    def get_final_message(self):
        return self._final


class _Mensajes:
    def __init__(self, turnos):
        self._turnos = list(turnos)
        self.llamadas: list[dict] = []

    def stream(self, **kwargs):
        self.llamadas.append(kwargs)
        deltas, final = self._turnos.pop(0)
        return _Stream(deltas, final)

    def create(self, **kwargs):
        self.llamadas.append(kwargs)
        return self._turnos.pop(0)[1]


def _cliente(turnos=TURNOS):
    return SimpleNamespace(messages=_Mensajes(turnos))


def _eventos(cuerpo: str) -> list[tuple[str, dict]]:
    salida = []
    for bloque in cuerpo.strip().split("\n\n"):
        evento, datos = bloque.split("\n", 1)
        salida.append((evento.removeprefix("event: "), json.loads(datos.removeprefix("data: "))))
    return salida


@pytest.fixture
def entorno(monkeypatch):
    """Tool simulada, uso registrado en memoria, sin clave ni freno."""
    monkeypatch.setitem(tools.DISPATCH, "graficar", lambda **kw: dict(SALIDA_TOOL))
    monkeypatch.delenv(api.ENV_API_KEY, raising=False)
    registrados: list[dict] = []
    monkeypatch.setattr(api.uso, "registrar", registrados.append)
    monkeypatch.setattr(api.limites, "presupuesto_agotado", lambda: (False, 0.0, 1.0))
    # El limitador es estado de proceso: sin esto la suite dependeria del orden.
    monkeypatch.setattr(api.limites.LIMITADOR_LLM, "permitir", lambda *a, **k: True)
    return registrados


def _con_agente(monkeypatch, cliente):
    agente = Historico(client=cliente, model="claude-sonnet-5-5")
    monkeypatch.setattr(api, "_asistente", lambda: agente)
    return cliente


def test_la_secuencia_de_eventos_sigue_el_contrato(monkeypatch, entorno):
    # Given: un turno que pide `graficar` y uno que redacta
    cliente = _con_agente(monkeypatch, _cliente())

    # When
    r = CLIENTE.post("/chat/stream", json={"mensajes": [{"rol": "user", "texto": "grafica"}]})

    # Then: SSE, en el orden del contrato, con los deltas del SDK
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(chat_sse.MEDIA_TYPE)
    eventos = _eventos(r.text)
    assert [e for e, _ in eventos] == ORDEN_ESPERADO
    assert eventos[0][1] == {"modelo": "claude-sonnet-5-5"}
    assert eventos[3][1] == {"id": "t1", "nombre": "graficar", "input": INPUT_TOOL}
    assert eventos[4][1]["salida"]["_grafico"] == GRAFICO     # la interfaz SI lo recibe
    assert "".join(d["delta"] for e, d in eventos[5:7]) == "Sube en agosto."
    fin = eventos[-1][1]
    assert set(fin) == {"respuesta", "modelo", "pasos", "usage", "costo", "ms_total"}
    assert fin["respuesta"] == "Sube en agosto." and fin["usage"]["requests"] == 2
    assert entorno == [fin]                                   # mismo registro que /chat

    # Then: al modelo le llego la salida SIN las claves `_`
    resultado = cliente.messages.llamadas[1]["messages"][-1]["content"][0]
    assert json.loads(resultado["content"]) == {"resumen": {"n": 3}, "nota": "comenta"}


def test_fin_es_lo_mismo_que_devuelve_chat(entorno):
    # Given: el mismo guion por las dos vias
    en_vivo = Historico(client=_cliente(), model="m")
    de_una = Historico(client=_cliente(), model="m")

    # When
    fin = [d for e, d in en_vivo.chat_stream([{"rol": "user", "texto": "hola"}]) if e == "fin"][0]
    respuesta = de_una.chat([{"rol": "user", "texto": "hola"}])

    # Then: identicos salvo el reloj
    for cuerpo in (fin, respuesta):
        cuerpo.pop("ms_total")
        for paso in cuerpo["pasos"]:
            paso.pop("ms", None)
    assert fin == respuesta


def test_un_error_de_tool_no_corta_el_stream(monkeypatch, entorno):
    # Given: la tool revienta con un parametro malo
    def falla(**kw):
        raise ValueError("variable desconocida")
    monkeypatch.setitem(tools.DISPATCH, "graficar", falla)
    _con_agente(monkeypatch, _cliente())

    # When
    eventos = _eventos(CLIENTE.post("/chat/stream", json={
        "mensajes": [{"rol": "user", "texto": "x"}]}).text)

    # Then: el paso sale con error y el lazo sigue hasta `fin`
    assert eventos[4][1]["error"] is True and eventos[-1][0] == "fin"


@pytest.mark.parametrize("excepcion, codigo", [
    (anthropic.RateLimitError("limite", response=httpx.Response(
        429, request=httpx.Request("POST", "https://x")), body=None), "llm_limite"),
    (RuntimeError("detalle interno que no debe salir"), "error_interno"),
])
def test_un_fallo_cierra_el_stream_con_error_sin_filtrar_detalle(monkeypatch, entorno,
                                                                 excepcion, codigo):
    # Given: el SDK falla al abrir el stream
    def revienta(**kwargs):
        raise excepcion
    _con_agente(monkeypatch, SimpleNamespace(messages=SimpleNamespace(stream=revienta)))

    # When
    eventos = _eventos(CLIENTE.post("/chat/stream", json={
        "mensajes": [{"rol": "user", "texto": "x"}]}).text)

    # Then: abre, falla con codigo estable y mensaje generico, y no registra uso
    assert [e for e, _ in eventos] == ["inicio", "error"]
    assert eventos[-1][1]["codigo"] == codigo
    assert "detalle interno" not in eventos[-1][1]["mensaje"]
    assert entorno == []


def test_historial_que_no_termina_en_el_usuario_da_fin_vacio(entorno):
    eventos = list(Historico(client=_cliente(), model="m").chat_stream(
        [{"rol": "assistant", "texto": "hola"}]))
    assert [e for e, _ in eventos] == ["inicio", "fin"]
    assert eventos[-1][1]["respuesta"] == ""


def test_stream_exige_la_clave_si_esta_configurada(monkeypatch):
    monkeypatch.setenv(api.ENV_API_KEY, "clave")
    assert CLIENTE.post("/chat/stream", json={"mensajes": []}).status_code == 401
