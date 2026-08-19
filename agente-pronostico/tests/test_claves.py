"""
Tests de las claves con nombre y de que la ruta publica no filtre.

Lo que fijan: que cada consumidor se identifique por separado (revocar a uno no
toca a los demas), que el rate-limit los cuente aparte, que la clave vieja siga
sirviendo para no romper los flujos ya pegados en VisioneFlow, y que el endpoint
abierto NO devuelva mensajes de error internos. Given-When-Then.
"""
import pytest
from fastapi.testclient import TestClient

from pronostico import api, claves
from pronostico.api import app

CLIENTE = TestClient(app)

CLAVE_CONSOLA = "sk-consola-123456"
CLAVE_FLUJO = "sk-visioneflow-abcdef"


@pytest.fixture
def dos_claves(monkeypatch):
    monkeypatch.delenv(claves.ENV_CLAVE_LEGADO, raising=False)
    monkeypatch.setenv(claves.ENV_CLAVES,
                       f"consola:{CLAVE_CONSOLA},visioneflow:{CLAVE_FLUJO}")


def test_cada_clave_se_identifica_con_su_nombre(dos_claves):
    # Given/When/Then: la clave dice QUIEN es, no solo si vale
    assert claves.identificar(CLAVE_CONSOLA) == "consola"
    assert claves.identificar(CLAVE_FLUJO) == "visioneflow"


def test_una_clave_desconocida_no_vale(dos_claves):
    # Given/When/Then
    assert claves.identificar("sk-inventada") is None
    assert claves.identificar(None) is None
    assert claves.identificar("") is None


def test_revocar_una_no_toca_a_las_demas(monkeypatch, dos_claves):
    # Given: se saca a visioneflow del catalogo
    monkeypatch.setenv(claves.ENV_CLAVES, f"consola:{CLAVE_CONSOLA}")

    # Then: la consola sigue entrando, el flujo no. Ese es el punto de tener
    # claves separadas: revocar no obliga a rotarle la clave a todo el mundo.
    assert claves.identificar(CLAVE_CONSOLA) == "consola"
    assert claves.identificar(CLAVE_FLUJO) is None


def test_la_clave_vieja_sin_nombre_sigue_sirviendo(monkeypatch):
    # Given: solo la variable de una sola clave (flujos ya desplegados)
    monkeypatch.delenv(claves.ENV_CLAVES, raising=False)
    monkeypatch.setenv(claves.ENV_CLAVE_LEGADO, "clave-vieja")

    # Then: entra, identificada como legado
    assert claves.identificar("clave-vieja") == claves.NOMBRE_LEGADO
    assert claves.exigida() is True


def test_sin_claves_configuradas_la_api_queda_abierta(monkeypatch):
    # Given: ni una ni otra (modo desarrollo local, dev.sh)
    monkeypatch.delenv(claves.ENV_CLAVES, raising=False)
    monkeypatch.delenv(claves.ENV_CLAVE_LEGADO, raising=False)

    # Then
    assert claves.exigida() is False
    assert CLIENTE.get("/arquitectura").status_code != 401


def test_consumidores_no_devuelve_material_de_clave(dos_claves):
    # Given/When
    nombres = claves.consumidores()

    # Then: sirve para diagnostico y no filtra nada
    assert nombres == ["consola", "visioneflow"]
    assert not any(CLAVE_CONSOLA in n or CLAVE_FLUJO in n for n in nombres)


def test_la_identidad_del_rate_limit_es_el_nombre_no_la_clave(dos_claves):
    # Given: un request con la clave de la consola
    class _Req:
        client = None

    # When
    identidad = api._identidad(_Req(), CLAVE_CONSOLA)

    # Then: viaja el nombre. Antes viajaban los primeros 8 caracteres de la
    # clave al diccionario del limitador y a los logs.
    assert identidad == "cliente:consola"
    assert CLAVE_CONSOLA[:8] not in identidad


def test_dos_consumidores_no_comparten_el_balde_del_rate_limit(dos_claves):
    # Given: dos claves distintas
    class _Req:
        client = None

    # When
    a = api._identidad(_Req(), CLAVE_CONSOLA)
    b = api._identidad(_Req(), CLAVE_FLUJO)

    # Then: identidades distintas -> un script en bucle con una clave no deja
    # sin servicio a quien usa la otra
    assert a != b


def test_el_endpoint_publico_no_devuelve_errores_internos():
    # Given: un reporte con el mensaje crudo de Postgres, que trae un UUID de
    # sensor y el nombre de una caja
    reporte = {
        "estado": "stale",
        "variables": {"irradiancia": {"filas": 10, "estado": "stale"}},
        "congelamiento": {"congelada": True, "dias": 27.5},
        "ultimo_error_etl": {"error": "COPY _stage, line 259827: 971ae8b6-... Caja Hum_Suelo SC"},
        "ultima_corrida_etl": {
            "ts": "2026-08-19T20:00:00+00:00", "ok": True, "filas_insertadas": 0,
            "por_variable": {"irradiancia": {"error": "connection refused 127.0.0.1:9999"}},
        },
    }

    # When
    publico = api._publico(reporte)

    # Then: sobrevive el HECHO (esta congelada, la corrida termino bien y no
    # trajo filas) y se van los mensajes con identificadores internos
    assert publico["estado"] == "stale"
    assert publico["congelamiento"]["congelada"] is True
    assert publico["ultima_corrida_etl"]["ok"] is True
    assert publico["ultima_corrida_etl"]["filas_insertadas"] == 0
    assert "ultimo_error_etl" not in publico
    assert "por_variable" not in publico["ultima_corrida_etl"]
    crudo = str(publico)
    assert "971ae8b6" not in crudo and "9999" not in crudo


def test_el_panel_con_clave_si_trae_el_detalle(monkeypatch, dos_claves):
    # Given: el mismo detalle que la ruta publica oculta
    monkeypatch.setattr(api.observabilidad, "panel",
                        lambda: {"ingesta": {"ultimo_error_etl": {"error": "detalle interno"}}})

    # When: se pide CON clave
    r = CLIENTE.get("/salud/panel", headers={"x-api-key": CLAVE_CONSOLA})

    # Then: acá sí, porque acá hay que identificarse
    assert r.status_code == 200
    assert r.json()["ingesta"]["ultimo_error_etl"]["error"] == "detalle interno"
