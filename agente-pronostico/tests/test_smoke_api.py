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
