"""
Tests de la API HTTP (transporte puro), sin red, DB ni fisica real.

`run_forecast` se mockea con monkeypatch: aca se prueba el CONTRATO HTTP —
status codes, validacion en el borde y la politica de API key — no el
pronostico (eso ya lo cubren los tests de forecast_tool).
Estructura Given-When-Then en cada test.
"""
from fastapi.testclient import TestClient

from pronostico import api
from pronostico.api import ENV_API_KEY, app

CLIENTE = TestClient(app)

CUERPO_VALIDO = {
    "variable": "irradiancia",
    "horizon_seconds": 7200,
    "horizonte_texto": "dos horas",
}

RESPUESTA_FALSA = {
    "variable": "irradiancia",
    "unidad": "W/m2",
    "valor_esperado": 313.4,
    "banda": {"bajo": 271.0, "alto": 356.0, "nivel": "±1σ"},
    "contexto": {"es_de_noche": False},
}


def _mock_run_forecast(monkeypatch, respuesta=RESPUESTA_FALSA):
    llamadas = []

    def falso(variable, horizon_seconds, horizonte_texto=None):
        llamadas.append((variable, horizon_seconds, horizonte_texto))
        return respuesta

    monkeypatch.setattr(api, "run_forecast", falso)
    return llamadas


def test_health_abierto_sin_clave(monkeypatch):
    # Given: API key configurada (el caso mas restrictivo)
    monkeypatch.setenv(ENV_API_KEY, "clave-secreta")
    # When: GET /health sin header
    resp = CLIENTE.get("/health")
    # Then: responde ok igual (health es para monitoreo)
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_forecast_delega_y_devuelve_el_dict(monkeypatch):
    # Given: sin API key configurada y run_forecast mockeado
    monkeypatch.delenv(ENV_API_KEY, raising=False)
    llamadas = _mock_run_forecast(monkeypatch)
    # When: POST /forecast con cuerpo valido
    resp = CLIENTE.post("/forecast", json=CUERPO_VALIDO)
    # Then: 200, passthrough del dict y delegacion con los 3 argumentos
    assert resp.status_code == 200
    assert resp.json() == RESPUESTA_FALSA
    assert llamadas == [("irradiancia", 7200, "dos horas")]


def test_forecast_con_clave_correcta(monkeypatch):
    # Given: API key configurada y run_forecast mockeado
    monkeypatch.setenv(ENV_API_KEY, "clave-secreta")
    _mock_run_forecast(monkeypatch)
    # When: POST con el header x-api-key correcto
    resp = CLIENTE.post(
        "/forecast", json=CUERPO_VALIDO, headers={"x-api-key": "clave-secreta"}
    )
    # Then: pasa
    assert resp.status_code == 200


def test_forecast_rechaza_clave_incorrecta_o_ausente(monkeypatch):
    # Given: API key configurada; run_forecast mockeado para detectar fugas
    monkeypatch.setenv(ENV_API_KEY, "clave-secreta")
    llamadas = _mock_run_forecast(monkeypatch)
    # When: clave incorrecta y clave ausente
    con_clave_mala = CLIENTE.post(
        "/forecast", json=CUERPO_VALIDO, headers={"x-api-key": "otra"}
    )
    sin_clave = CLIENTE.post("/forecast", json=CUERPO_VALIDO)
    # Then: 401 en ambos y run_forecast NUNCA se ejecuto
    assert con_clave_mala.status_code == 401
    assert sin_clave.status_code == 401
    assert llamadas == []


def test_forecast_error_de_dominio_es_400(monkeypatch):
    # Given: run_forecast rechaza la variable (ValueError de dominio)
    monkeypatch.delenv(ENV_API_KEY, raising=False)

    def rechaza(*args, **kwargs):
        raise ValueError("variable no soportada: 'humedad' (solo 'irradiancia')")

    monkeypatch.setattr(api, "run_forecast", rechaza)
    # When: POST con una variable que la tool no soporta
    resp = CLIENTE.post(
        "/forecast", json={"variable": "humedad", "horizon_seconds": 3600}
    )
    # Then: 400 con el mensaje de dominio (apto para que el LLM se corrija)
    assert resp.status_code == 400
    assert "variable no soportada" in resp.json()["detail"]


def test_forecast_valida_el_horizonte_en_el_borde(monkeypatch):
    # Given: sin API key; run_forecast mockeado para detectar fugas
    monkeypatch.delenv(ENV_API_KEY, raising=False)
    llamadas = _mock_run_forecast(monkeypatch)
    # When: horizonte fuera de [60, 21600] y cuerpo sin horizon_seconds
    fuera_de_rango = CLIENTE.post(
        "/forecast", json={"variable": "irradiancia", "horizon_seconds": 30000}
    )
    incompleto = CLIENTE.post("/forecast", json={"variable": "irradiancia"})
    # Then: 422 de validacion en ambos, sin llegar a la fisica
    assert fuera_de_rango.status_code == 422
    assert incompleto.status_code == 422
    assert llamadas == []
