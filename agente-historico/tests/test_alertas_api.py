"""Endpoints de alertas (contrato 4.5) con `TestClient`, sin base ni LLM.

El store se sustituye por el doble en memoria; transiciones y generador son los
reales. Lo que se prueba es el BORDE: status codes, validacion de la entrada,
el filtro que llega al store y la forma de la respuesta.

Estructura Given-When-Then.
"""
from __future__ import annotations

from datetime import date

import pytest
from alertas_dobles import AlmacenEnMemoria
from fastapi.testclient import TestClient

from historico.alertas import ciclo, evaluar
from historico.api import ENV_API_KEY, app
from historico.calidad.pruebas.contrato import GRAVE, Hallazgo

CLIENTE = TestClient(app)
DIA = date(2026, 8, 26)


@pytest.fixture
def almacen(monkeypatch) -> AlmacenEnMemoria:
    monkeypatch.delenv(ENV_API_KEY, raising=False)
    almacen = AlmacenEnMemoria([Hallazgo(
        DIA, "monitoreo_sc_electrico", "voltaje_vac", "inversor_sin_acoplar", GRAVE, 144,
        {"ghi_max_wm2": 1077.9})]).instalar(monkeypatch)
    evaluar.evaluar()
    return almacen


# ══ Lectura ═════════════════════════════════════════════════════════════════
def test_listar_por_defecto_pide_solo_las_abiertas_y_pagina(almacen):
    # When
    r = CLIENTE.get("/alertas")

    # Then
    assert r.status_code == 200
    cuerpo = r.json()
    donde, params, _, limite, offset = almacen.listados[-1]
    assert params[0] == list(ciclo.ABIERTOS)
    assert (limite, offset) == (20, 0)
    assert cuerpo["total"] == 1 and len(cuerpo["alertas"]) == 1
    assert cuerpo["pagina"] == {"offset": 0, "limite": 20, "hay_mas": False,
                                "siguiente_offset": None}


def test_listar_arma_el_filtro_con_parametros_y_escapa_la_busqueda(almacen):
    # When
    r = CLIENTE.get("/alertas", params={
        "estado": "resuelta,descartada", "severidad": "grave",
        "tipo": "inversor_parado_con_sol", "q": "100%_ok", "desde": "2026-08-01",
        "hasta": "2026-09-01"})

    # Then ningun valor viaja en el texto del SQL
    assert r.status_code == 200
    donde, params, *_ = almacen.listados[-1]
    assert "100" not in donde
    assert params == [["resuelta", "descartada"], "grave", "inversor_parado_con_sol",
                      "%100\\%\\_ok%", "%100\\%\\_ok%", date(2026, 8, 1), date(2026, 9, 1)]


@pytest.mark.parametrize("params, codigo", [
    ({"estado": "abierta"}, "parametro_invalido"),
    ({"severidad": "info"}, "parametro_invalido"),
    ({"tipo": "flatline"}, "parametro_invalido"),
    ({"desde": "26/08/2026"}, "fecha_ilegible"),
])
def test_listar_rechaza_filtros_desconocidos_con_400(almacen, params, codigo):
    r = CLIENTE.get("/alertas", params=params)
    assert (r.status_code, r.json()["codigo"]) == (400, codigo)


@pytest.mark.parametrize("limite", [0, 101])
def test_listar_acota_el_limite(almacen, limite):
    assert CLIENTE.get("/alertas", params={"limite": limite}).status_code == 422


def test_resumen_cuenta_todos_los_estados(almacen):
    # When
    cuerpo = CLIENTE.get("/alertas/resumen").json()

    # Then los cinco estados aparecen aunque esten en cero
    assert set(cuerpo["por_estado"]) == set(ciclo.ESTADOS)
    assert cuerpo["abiertas_total"] == 1 and cuerpo["ultima_evaluacion"]


def test_ficha_trae_que_es_eventos_y_enlaces_con_el_rango(almacen):
    # When
    cuerpo = CLIENTE.get("/alertas/1").json()

    # Then
    assert cuerpo["alerta"]["id"] == 1
    assert [e["tipo"] for e in cuerpo["eventos"]] == [ciclo.EVENTO_CREADA]
    assert "equipo" in cuerpo["que_es"]
    assert cuerpo["enlaces"] == {
        "calidad": "/calidad?desde=2026-08-26&hasta=2026-08-27",
        "series": "/series?variables=voltaje_vac,potencia_total_wac,"
                  "irradiancia_incidente_wm2&desde=2026-08-26&hasta=2026-08-27"}


def test_ficha_de_un_id_inexistente_es_404(almacen):
    r = CLIENTE.get("/alertas/999")
    assert (r.status_code, r.json()["codigo"]) == (404, "alerta_inexistente")


# ══ Acciones ════════════════════════════════════════════════════════════════
def test_reconocer_devuelve_la_alerta_y_deja_evento_con_autor(almacen):
    # When
    r = CLIENTE.post("/alertas/1/reconocer", json={"nota": "visto", "autor": "isaac"})

    # Then
    assert r.status_code == 200
    assert r.json()["alerta"]["estado"] == ciclo.RECONOCIDA
    assert (almacen.eventos[-1]["tipo"], almacen.eventos[-1]["autor"]) == (
        "reconocida", "isaac")


def test_accion_sin_cuerpo_usa_el_autor_por_defecto(almacen):
    assert CLIENTE.post("/alertas/1/descartar").status_code == 200
    assert almacen.eventos[-1]["autor"] == "consola"


def test_resolver_una_nueva_es_409_con_de_y_a(almacen):
    # When
    r = CLIENTE.post("/alertas/1/resolver", json={})

    # Then
    assert r.status_code == 409
    assert {k: r.json()[k] for k in ("codigo", "de", "a")} == {
        "codigo": "transicion_invalida", "de": ciclo.NUEVA, "a": ciclo.RESUELTA}


def test_accion_sobre_id_inexistente_es_404(almacen):
    assert CLIENTE.post("/alertas/999/reconocer", json={}).status_code == 404


@pytest.mark.parametrize("cuerpo", [{}, {"nota": "   "}, {"nota": "x" * 2001}])
def test_seguimiento_exige_nota(almacen, cuerpo):
    CLIENTE.post("/alertas/1/reconocer", json={})
    assert CLIENTE.post("/alertas/1/seguimiento", json=cuerpo).status_code == 422


def test_seguimiento_con_nota_y_proxima_revision(almacen):
    # Given
    CLIENTE.post("/alertas/1/reconocer", json={})

    # When
    r = CLIENTE.post("/alertas/1/seguimiento",
                     json={"nota": "  tecnico avisado ", "proxima_revision": "2026-09-05"})

    # Then
    assert r.status_code == 200
    assert r.json()["alerta"]["proxima_revision"] == "2026-09-05"
    assert almacen.eventos[-1]["nota"] == "tecnico avisado"


def test_reabrir_con_otra_abierta_de_la_misma_clave_es_409(almacen):
    # Given la 1 descartada y una 2 abierta por un apagon posterior
    CLIENTE.post("/alertas/1/descartar", json={})
    almacen.hallazgos_calidad.append(Hallazgo(
        date(2026, 8, 31), "monitoreo_sc_electrico", "voltaje_vac",
        "inversor_sin_acoplar", GRAVE, 147, {}))
    CLIENTE.post("/alertas/evaluar", json={})

    # When
    r = CLIENTE.post("/alertas/1/reabrir", json={})

    # Then
    assert (r.status_code, r.json()["codigo"]) == (409, "alerta_abierta_existente")


def test_evaluar_por_http_devuelve_el_conteo_y_el_rango(almacen):
    # When
    r = CLIENTE.post("/alertas/evaluar", json={"desde": "2026-08-01", "hasta": "2026-09-01"})

    # Then
    assert r.status_code == 200
    assert {"creadas", "actualizadas", "revisadas", "rango"} <= set(r.json())
    assert r.json()["rango"] == {"desde": "2026-08-01", "hasta": "2026-09-01"}


def test_evaluar_con_fecha_ilegible_es_422(almacen):
    assert CLIENTE.post("/alertas/evaluar", json={"desde": "ayer"}).status_code == 422


def test_las_alertas_exigen_la_api_key_si_esta_configurada(almacen, monkeypatch):
    # Given
    monkeypatch.setenv(ENV_API_KEY, "clave")

    # When / Then
    assert CLIENTE.get("/alertas").status_code == 401
    assert CLIENTE.post("/alertas/1/reconocer", json={}).status_code == 401
    assert CLIENTE.get("/alertas", headers={"x-api-key": "clave"}).status_code == 200
