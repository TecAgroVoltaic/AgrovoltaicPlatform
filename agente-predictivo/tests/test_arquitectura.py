"""
Tests del mapa de arquitectura.

Lo que se prueba aca no es "el dict tiene tales claves" sino la propiedad que
hace util al mapa: que se DERIVE del agente en vez de duplicarlo. Por eso casi
todas las aserciones comparan contra `agent.MODOS` / `limites` / los esquemas
reales, nunca contra literales pegados — un test con los nombres escritos a mano
se desincronizaria igual que el archivo estatico que este endpoint vino a evitar.

Estructura Given-When-Then en cada test.
"""
import pytest
from fastapi.testclient import TestClient

from predictivo import arquitectura, config, data, limites
from predictivo.agent import agent as agente_mod
from predictivo.api import ENV_API_KEY, app
from predictivo.domain import Variable

CLIENTE = TestClient(app)

# Claves del RESULTADO que el modo medicion_oculta no puede llegar a ver por ninguna
# via. Espejo de la regla que ya cuidan los tests de `predecir`.
_PROHIBIDAS = {"medido", "error", "real"}


@pytest.fixture
def mapa(monkeypatch):
    """Mapa con el store mockeado: estos tests son de estructura, no de datos."""
    monkeypatch.setattr(data, "rango_datos",
                        lambda variable="irradiancia": {"desde": "2026-01-01T00:00:00-06:00",
                                                        "hasta": "2026-07-23T02:31:22-06:00",
                                                        "n": 100})
    return arquitectura.mapa()


def test_las_herramientas_son_exactamente_las_del_agente(mapa):
    # Given: el juego de herramientas real, sacado de MODOS
    esperadas = {e["name"] for p in agente_mod.MODOS.values() for e in p["schemas"]}
    # When: se lee el catalogo del mapa
    publicadas = {h["nombre"] for h in mapa["herramientas"]}
    # Then: coinciden. Agregar una tool y no tocar nada mas la publica sola;
    # inventar una en el mapa es imposible, porque no hay donde escribirla.
    assert publicadas == esperadas


def test_cada_modo_lista_su_juego_real(mapa):
    # Given/When: los modos publicados
    # Then: mismo contenido y mismo ORDEN que en MODOS (el orden es el que ve
    # el modelo, y la vista lo usa para apilar los nodos)
    for nombre, perfil in agente_mod.MODOS.items():
        assert mapa["modos"][nombre]["herramientas"] == [e["name"] for e in perfil["schemas"]]
        assert mapa["modos"][nombre]["web_search"] is bool(perfil["web"])


def test_el_modo_medicion_oculta_no_publica_backtest_ni_web(mapa):
    # Given: el modo donde el agente no puede conocer la respuesta
    prediccion = mapa["modos"][agente_mod.MEDICION_OCULTA]
    # When/Then: backtest (la unica que revela lo medido) no esta, y la busqueda
    # web tampoco. Es la misma garantia que blinda test_backtest_mensajes, vista
    # desde el lado del mapa: si alguien la rompiera, la vista lo mostraria.
    assert "backtest" not in prediccion["herramientas"]
    assert prediccion["web_search"] is False
    assert agente_mod.MEDICION_OCULTA not in mapa["web_search"]["modos"]


def test_backtest_queda_marcada_como_exclusiva_de_medicion_visible(mapa):
    # Given: el catalogo deduplicado
    backtest = next(h for h in mapa["herramientas"] if h["nombre"] == "backtest")
    # Then: la pertenencia a modos se deriva, no se declara
    assert backtest["modos"] == [agente_mod.MEDICION_VISIBLE]


def test_cada_herramienta_trae_su_contrato_completo(mapa):
    # Given/When: cada entrada del catalogo
    for h in mapa["herramientas"]:
        esquema = h["input_schema"]
        # Then: el input_schema es el que ve el modelo, entero
        assert esquema["type"] == "object"
        assert esquema["properties"], f"{h['nombre']} sin properties"
        assert "required" in esquema, f"{h['nombre']} sin required"
        assert h["descripcion"], f"{h['nombre']} sin descripcion"


def test_la_hipotesis_de_predecir_sigue_siendo_obligatoria(mapa):
    # Given: la herramienta con la que el agente se compromete
    predecir = next(h for h in mapa["herramientas"] if h["nombre"] == "predecir")
    # Then: el mapa lo muestra porque el esquema lo exige. Si `hipotesis` pasara
    # a opcional, el modelo pediria el numero y despues inventaria el motivo.
    assert "hipotesis" in predecir["input_schema"]["required"]


def test_ninguna_herramienta_de_medicion_oculta_pide_el_resultado(mapa):
    # Given: las herramientas del modo con la medicion oculta
    del_modo = set(mapa["modos"][agente_mod.MEDICION_OCULTA]["herramientas"])
    # When/Then: ninguna acepta un parametro que sea el valor a predecir
    for h in mapa["herramientas"]:
        if h["nombre"] in del_modo:
            assert not (_PROHIBIDAS & set(h["input_schema"]["properties"]))


def test_los_limites_salen_de_donde_se_aplican(mapa):
    # Given/When: el bloque de limites
    lim = mapa["limites"]
    # Then: son los mismos objetos que frenan de verdad, no una copia
    assert lim["llm_por_min"] == limites.LIMITE_LLM_POR_MIN
    assert lim["datos_por_min"] == limites.LIMITE_DATOS_POR_MIN
    assert lim["presupuesto_diario_usd"] == limites.PRESUPUESTO_DIARIO_USD
    assert lim["max_tokens"] == config.MAX_TOKENS
    assert lim["umbral_cielo_despejado"] == config.UMBRAL_CS


def test_el_horizonte_se_lee_del_esquema_no_de_una_constante(mapa):
    # Given: el rango declarado en el contrato que ve el modelo
    forecast = next(h for h in mapa["herramientas"] if h["nombre"] == "forecast")
    campo = forecast["input_schema"]["properties"]["horizon_seconds"]
    # Then: el limite publicado es ese mismo
    assert mapa["limites"]["horizonte_seg"] == {"min": campo["minimum"],
                                                "max": campo["maximum"]}


def test_publica_la_cobertura_de_cada_variable(mapa):
    # Given/When: el bloque de datos
    # Then: hay una entrada por variable del dominio, con su unidad
    for v in Variable:
        assert v.value in mapa["datos"]
        assert mapa["datos"][v.value]["unidad"]


def test_el_store_caido_degrada_solo_el_bloque_de_datos(monkeypatch):
    # Given: el store inaccesible
    def explota(variable="irradiancia"):
        raise RuntimeError("store caido")

    monkeypatch.setattr(data, "rango_datos", explota)
    # When: se arma el mapa
    m = arquitectura.mapa()
    # Then: la arquitectura sigue completa (no depende de que hoy haya datos) y
    # el fallo queda acotado y visible en su bloque
    assert m["herramientas"] and m["modos"]
    assert "store caido" in m["datos"]["irradiancia"]["error"]


def test_endpoint_devuelve_el_mapa(monkeypatch):
    # Given: sin clave configurada
    monkeypatch.delenv(ENV_API_KEY, raising=False)
    monkeypatch.setattr(data, "rango_datos",
                        lambda variable="irradiancia": {"desde": None, "hasta": None, "n": 0})
    # When: GET /arquitectura
    resp = CLIENTE.get("/arquitectura")
    # Then: 200 con el mapa
    assert resp.status_code == 200
    assert {"agente", "modos", "herramientas", "limites", "datos"} <= set(resp.json())


def test_endpoint_exige_la_clave(monkeypatch):
    # Given: API key configurada
    monkeypatch.setenv(ENV_API_KEY, "clave-secreta")
    # When: sin header y con header incorrecto
    sin = CLIENTE.get("/arquitectura")
    mal = CLIENTE.get("/arquitectura", headers={"x-api-key": "otra"})
    # Then: 401 en ambos (el mapa describe el sistema: no es publico)
    assert sin.status_code == 401
    assert mal.status_code == 401
