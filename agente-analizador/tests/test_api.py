"""
Tests de humo de la API del analizador: contrato HTTP, sin DB ni LLM.

El pool de db.py es perezoso, así que la app se importa sin exigir Supabase.
Lo que se prueba acá es el BORDE: status codes, política de API key y el
despacho de tools. Los números los cubren los tests de cada tool.
Estructura Given-When-Then.
"""
import pytest
from fastapi.testclient import TestClient

from analizador import api
from analizador.api import ENV_API_KEY, app

CLIENTE = TestClient(app)
CLAVE = "clave-de-prueba"


def test_health_responde_ok_y_lista_las_tools():
    # Given/When
    r = CLIENTE.get("/health")

    # Then: sirve de smoke test del arranque (import + registro de tools)
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["status"] == "ok"
    assert len(cuerpo["tools"]) > 0


def test_tools_publica_los_esquemas():
    # Given/When
    r = CLIENTE.get("/tools")

    # Then: cada schema tiene lo que VisioneFlow necesita para cablear el nodo
    assert r.status_code == 200
    esquemas = r.json()["tools"]
    assert esquemas and all("name" in s and "input_schema" in s for s in esquemas)


def test_tool_desconocida_da_404_y_lista_las_validas():
    # Given/When
    r = CLIENTE.post("/tool/no_existe", json={})

    # Then: el error dice qué sí existe (el LLM puede corregirse solo)
    assert r.status_code == 404
    assert "no_existe" in r.json()["detail"]


def test_health_no_exige_clave(monkeypatch):
    # Given: API key configurada
    monkeypatch.setenv(ENV_API_KEY, CLAVE)

    # When/Then: /health queda abierto para monitoreo
    assert CLIENTE.get("/health").status_code == 200


def test_tool_exige_la_clave_si_esta_configurada(monkeypatch):
    # Given
    monkeypatch.setenv(ENV_API_KEY, CLAVE)

    # When: sin header
    r = CLIENTE.post("/tool/catalogo", json={})

    # Then
    assert r.status_code == 401


def test_tool_acepta_la_clave_correcta(monkeypatch):
    # Given
    monkeypatch.setenv(ENV_API_KEY, CLAVE)
    monkeypatch.setitem(api.tools.DISPATCH, "_falsa", lambda **kw: {"ok": True})

    # When
    r = CLIENTE.post("/tool/_falsa", json={}, headers={"x-api-key": CLAVE})

    # Then: pasa el borde y ejecuta la tool
    assert r.status_code == 200 and r.json() == {"ok": True}


def test_parametro_invalido_de_una_tool_da_400(monkeypatch):
    # Given: una tool con firma FIJA (como las reales), que no acepta ese parámetro
    monkeypatch.delenv(ENV_API_KEY, raising=False)
    monkeypatch.setitem(api.tools.DISPATCH, "_falsa", lambda dias=7: {"ok": True})

    # When
    r = CLIENTE.post("/tool/_falsa", json={"parametro_que_no_existe": 1})

    # Then: culpa del cliente, no 500
    assert r.status_code == 400
