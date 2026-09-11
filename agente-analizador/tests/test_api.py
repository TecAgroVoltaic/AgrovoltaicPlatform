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


# ── Exportacion por rango ─────────────────────────────────────────────────────
def test_exportar_formato_invalido_da_400(monkeypatch):
    monkeypatch.delenv(ENV_API_KEY, raising=False)
    r = CLIENTE.get("/datos/exportar?tabla=electrico_crudo&formato=xlsx&desde=2026-03-01&hasta=2026-03-02")
    assert r.status_code == 400 and "formato invalido" in r.json()["detail"]


def test_exportar_relacion_desconocida_da_400_sin_tocar_db(monkeypatch):
    monkeypatch.delenv(ENV_API_KEY, raising=False)
    r = CLIENTE.get("/datos/exportar?tabla=pg_shadow&desde=2026-03-01&hasta=2026-03-02")
    assert r.status_code == 400 and "relacion desconocida" in r.json()["detail"]


def test_exportar_devuelve_adjunto_con_nombre(monkeypatch):
    # Given: la exportacion resuelta (sin DB)
    monkeypatch.delenv(ENV_API_KEY, raising=False)
    monkeypatch.setattr(api.exportar, "exportar", lambda *a, **k: api.exportar.Exportacion(
        nombre="electrico_crudo_2026-03-01_2026-03-02.csv",
        content_type="text/csv; charset=utf-8",
        cuerpo=iter([b"timestamp,potencia_pv1_w\n", b"2026-03-01T12:00:00,1.5\n"]),
    ))

    # When
    r = CLIENTE.get("/datos/exportar?tabla=electrico_crudo&desde=2026-03-01&hasta=2026-03-02")

    # Then: el browser lo guarda como archivo, con el nombre que dice el servicio
    assert r.status_code == 200
    assert r.headers["content-disposition"] == 'attachment; filename="electrico_crudo_2026-03-01_2026-03-02.csv"'
    assert r.headers["content-type"].startswith("text/csv")
    assert r.content == b"timestamp,potencia_pv1_w\n2026-03-01T12:00:00,1.5\n"


def test_exportar_demasiado_grande_da_413(monkeypatch):
    monkeypatch.delenv(ENV_API_KEY, raising=False)
    def explota(*a, **k):
        raise api.exportar.ExportacionDemasiadoGrande("acorta el rango")
    monkeypatch.setattr(api.exportar, "exportar", explota)
    r = CLIENTE.get("/datos/exportar?tabla=electrico_crudo&formato=mat&desde=2026-01-01&hasta=2026-12-31")
    assert r.status_code == 413


def test_exportar_exige_la_clave_si_esta_configurada(monkeypatch):
    monkeypatch.setenv(ENV_API_KEY, CLAVE)
    assert CLIENTE.get("/datos/exportables").status_code == 401
    assert CLIENTE.get("/datos/exportar?tabla=electrico_crudo").status_code == 401


def test_exportar_tiene_tope_de_descargas_simultaneas(monkeypatch):
    # Given: el cupo agotado (otras descargas en curso)
    monkeypatch.delenv(ENV_API_KEY, raising=False)
    tomados = [api._exportaciones.acquire(blocking=False) for _ in range(api.MAX_EXPORTACIONES)]
    assert all(tomados)
    try:
        # When
        r = CLIENTE.get("/datos/exportar?tabla=electrico_crudo&desde=2026-03-01&hasta=2026-03-02")
        # Then: 429 legible, sin tocar la DB
        assert r.status_code == 429 and "descargas en curso" in r.json()["detail"]
    finally:
        for _ in tomados:
            api._exportaciones.release()


def test_exportar_devuelve_el_cupo_al_terminar(monkeypatch):
    monkeypatch.delenv(ENV_API_KEY, raising=False)
    monkeypatch.setattr(api.exportar, "exportar", lambda *a, **k: api.exportar.Exportacion(
        nombre="x.csv", content_type="text/csv", cuerpo=iter([b"a\n"])))
    r = CLIENTE.get("/datos/exportar?tabla=electrico_crudo&desde=2026-03-01&hasta=2026-03-02")
    assert r.status_code == 200
    # el semaforo volvio a su valor inicial: se pueden tomar MAX cupos otra vez
    tomados = [api._exportaciones.acquire(blocking=False) for _ in range(api.MAX_EXPORTACIONES)]
    assert all(tomados)
    for _ in tomados:
        api._exportaciones.release()
