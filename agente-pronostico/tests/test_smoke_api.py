"""
Smoke de los endpoints del sidecar: que el cableado HTTP funcione de punta a
punta, sin DB, sin LLM y sin red.

Cubre lo que hasta ahora solo se habia probado a mano contra la EC2: el gate de
salud (503 cuando la ingesta esta stale), el rate-limit (429 + Retry-After) y el
tope de presupuesto. Estructura Given-When-Then.
"""
import pytest
from fastapi.testclient import TestClient

from pronostico import api, limites, salud
from pronostico.api import app

CLIENTE = TestClient(app)

FORECAST_FALSO = {
    "variable": "irradiancia",
    "unidad": "W/m2",
    "valor_esperado": 313.4,
    "ahora": "2026-08-14T12:00:00+00:00",
    "banda": {"bajo": 271.0, "alto": 356.0},
    "contexto": {"es_de_noche": False},
}


@pytest.fixture(autouse=True)
def limitadores_limpios(monkeypatch):
    """Cada test arranca con los baldes vacios y sin tope, para no arrastrar
    estado entre tests (los limitadores son globales del modulo)."""
    monkeypatch.setattr(limites, "LIMITADOR_LLM", limites.LimitadorRitmo(por_minuto=1000))
    monkeypatch.setattr(limites, "LIMITADOR_DATOS", limites.LimitadorRitmo(por_minuto=1000))
    monkeypatch.setattr(limites.gasto_mod, "usd_hoy", lambda: 0.0)
    monkeypatch.setattr(limites.uso_mod, "usd_hoy", lambda: 0.0)


def _cuerpo_forecast() -> dict:
    return {"variable": "irradiancia", "horizon_seconds": 7200}


def test_health_no_toca_nada():
    # Given/When/Then: el ping mas barato posible (lo usa el healthcheck de Docker)
    assert CLIENTE.get("/health").json() == {"status": "ok"}


def test_salud_ingesta_ok_devuelve_200(monkeypatch):
    # Given: ingesta fresca
    monkeypatch.setattr(salud, "estado_ingesta",
                        lambda *_: {"estado": salud.ESTADO_OK, "variables": {}})

    # When/Then
    assert CLIENTE.get("/salud/ingesta").status_code == 200


def test_salud_ingesta_stale_devuelve_503_con_el_detalle(monkeypatch):
    # Given: ingesta congelada (el caso real del outage SC)
    reporte = {"estado": salud.ESTADO_STALE,
               "variables": {"irradiancia": {"edad_horas": 540.7}}}
    monkeypatch.setattr(salud, "estado_ingesta", lambda *_: reporte)

    # When
    r = CLIENTE.get("/salud/ingesta")

    # Then: un monitor lo detecta por status code, sin parsear el cuerpo
    assert r.status_code == 503
    assert r.json()["detail"]["estado"] == salud.ESTADO_STALE


def test_store_caido_tambien_es_fallo_de_salud(monkeypatch):
    # Given: no se puede consultar el store
    def explota(*_):
        raise OSError("store caido")
    monkeypatch.setattr(salud, "estado_ingesta", explota)

    # When/Then: 503, no un 500 con stack
    r = CLIENTE.get("/salud/ingesta")
    assert r.status_code == 503
    assert "OSError" in r.json()["detail"]


def test_rate_limit_corta_con_429_y_retry_after(monkeypatch):
    # Given: limite de 2 por minuto en los endpoints de datos
    monkeypatch.setattr(limites, "LIMITADOR_DATOS", limites.LimitadorRitmo(por_minuto=2))
    monkeypatch.setattr(api, "run_forecast", lambda *a, **k: FORECAST_FALSO)
    monkeypatch.setattr(api.audit, "registrar_prediccion", lambda *a, **k: None)

    # When: tres llamadas seguidas
    codigos = [CLIENTE.post("/forecast", json=_cuerpo_forecast()).status_code
               for _ in range(3)]

    # Then: la tercera se rechaza, con Retry-After para que el cliente reintente solo
    assert codigos[:2] == [200, 200]
    assert codigos[2] == 429
    r = CLIENTE.post("/forecast", json=_cuerpo_forecast())
    assert "retry-after" in {k.lower() for k in r.headers}


def test_presupuesto_agotado_corta_las_consultas_al_llm(monkeypatch):
    # Given: ya se gasto por encima del tope
    monkeypatch.setattr(limites.gasto_mod, "usd_hoy", lambda: 99.0)
    monkeypatch.setattr(limites, "PRESUPUESTO_DIARIO_USD", 5.0)

    # When
    r = CLIENTE.post("/preguntar", json={"pregunta": "hola"})

    # Then: 429 con mensaje accionable, y el LLM NUNCA se invoca
    assert r.status_code == 429
    assert "presupuesto diario agotado" in r.json()["detail"]


def test_el_presupuesto_no_frena_los_endpoints_deterministas(monkeypatch):
    # Given: presupuesto agotado
    monkeypatch.setattr(limites.gasto_mod, "usd_hoy", lambda: 99.0)
    monkeypatch.setattr(limites, "PRESUPUESTO_DIARIO_USD", 5.0)
    monkeypatch.setattr(api, "run_forecast", lambda *a, **k: FORECAST_FALSO)
    monkeypatch.setattr(api.audit, "registrar_prediccion", lambda *a, **k: None)

    # When/Then: /forecast no gasta tokens -> sigue funcionando
    assert CLIENTE.post("/forecast", json=_cuerpo_forecast()).status_code == 200


def test_horizonte_fuera_de_rango_es_400_no_500():
    # Given/When: horizonte absurdo
    r = CLIENTE.post("/forecast", json={"variable": "irradiancia",
                                        "horizon_seconds": 999_999_999})

    # Then: validado en el borde por el contrato de la tool
    assert r.status_code == 422


class _AgenteFalso:
    """Agente que no llama al LLM: devuelve una traza con la forma real."""

    TRAZA = {
        "respuesta": "La irradiancia esperada es 313 W/m2.",
        "modelo": "claude-haiku-4-5",
        "usage": {"requests": 1, "input_tokens": 120, "output_tokens": 40},
        "costo": {"usd_total": 0.00032},
        "pasos": [],
    }

    def conversar(self, pregunta):
        return dict(self.TRAZA)

    def chat(self, mensajes, contexto=None):
        return dict(self.TRAZA)


@pytest.fixture
def agente_falso(monkeypatch):
    """Reemplaza el agente y anula la persistencia de uso (toca disco/red)."""
    monkeypatch.setattr(api, "_AGENTE", _AgenteFalso())
    monkeypatch.setattr(api.uso_mod, "registrar", lambda traza: traza)
    monkeypatch.setattr(api.gasto_mod, "registrar", lambda usd: True)


def test_chat_devuelve_la_traza(agente_falso):
    # Given: un turno de chat con historial
    cuerpo = {"mensajes": [{"rol": "user", "texto": "¿cuánta irradiancia va a haber?"}],
              "contexto": "Predicción vs Real"}

    # When
    r = CLIENTE.post("/chat", json=cuerpo)

    # Then: el contrato que consume el widget de la consola
    assert r.status_code == 200
    assert r.json()["respuesta"]
    assert r.json()["costo"]["usd_total"] > 0


def test_preguntar_devuelve_la_traza(agente_falso):
    # Given/When
    r = CLIENTE.post("/preguntar", json={"pregunta": "¿y en dos horas?"})

    # Then
    assert r.status_code == 200 and r.json()["modelo"]


def test_chat_respeta_el_rate_limit(agente_falso, monkeypatch):
    # Given: un solo turno permitido por minuto
    monkeypatch.setattr(limites, "LIMITADOR_LLM", limites.LimitadorRitmo(por_minuto=1))
    cuerpo = {"mensajes": [{"rol": "user", "texto": "hola"}]}

    # When
    primero = CLIENTE.post("/chat", json=cuerpo).status_code
    segundo = CLIENTE.post("/chat", json=cuerpo).status_code

    # Then: el freno cubre /chat, no solo /preguntar
    assert primero == 200 and segundo == 429


def test_un_fallo_al_registrar_el_uso_no_tumba_la_respuesta(agente_falso, monkeypatch):
    # Given: el store de uso falla (fue el caso real en el contenedor)
    def explota(traza):
        raise PermissionError("permission denied")
    monkeypatch.setattr(api.uso_mod, "registrar", explota)

    # When/Then: la consulta se responde igual; el fallo se loguea, no se propaga
    assert CLIENTE.post("/preguntar", json={"pregunta": "hola"}).status_code == 200
