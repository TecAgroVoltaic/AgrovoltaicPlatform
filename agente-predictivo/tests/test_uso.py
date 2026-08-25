"""
Tests del acumulado de uso — foco en el gasto POR DIA, que es lo que habilita
el tope diario de limites.py. Sin red ni LLM: se escribe a un tmp_path.
Estructura Given-When-Then.
"""
import pytest

from predictivo import uso

MODELO = "claude-haiku-4-5"


@pytest.fixture
def store(tmp_path, monkeypatch):
    """Redirige la persistencia a un archivo temporal."""
    monkeypatch.setattr(uso, "_RUTA", tmp_path / "uso.json")
    return tmp_path / "uso.json"


def _traza(usd: float) -> dict:
    return {
        "modelo": MODELO,
        "usage": {"requests": 1, "input_tokens": 100, "output_tokens": 50},
        "costo": {"usd_total": usd},
    }


def test_registra_el_gasto_del_dia(store):
    # Given: dos consultas del mismo dia
    uso.registrar(_traza(0.01))
    uso.registrar(_traza(0.02))

    # When
    hoy = uso.usd_hoy()

    # Then: el tope diario tiene de donde leer
    assert hoy == pytest.approx(0.03)


def test_el_gasto_del_dia_no_arrastra_el_historico(store):
    # Given: un dia viejo con gasto alto ya persistido
    uso.registrar(_traza(0.05))
    d = uso._leer()
    d["por_dia"]["2020-01-01"] = {"n_consultas": 500, "usd": 999.0}
    uso._escribir(d)

    # When
    hoy = uso.usd_hoy()

    # Then: el tope mira HOY, no el acumulado de siempre
    assert hoy == pytest.approx(0.05)
    assert uso.resumen()["total_usd"] == pytest.approx(0.05)


def test_sin_consultas_el_gasto_del_dia_es_cero(store):
    # Given/When/Then: arranca en 0, no explota por archivo ausente
    assert uso.usd_hoy() == 0.0


def test_el_historial_diario_se_poda(store):
    # Given: mas dias que el limite de historial
    uso.registrar(_traza(0.01))
    d = uso._leer()
    for i in range(uso.DIAS_HISTORIAL + 20):
        d["por_dia"][f"2020-{(i % 12) + 1:02d}-{(i % 28) + 1:02d}"] = {
            "n_consultas": 1, "usd": 0.001}
    uso._escribir(d)

    # When: una consulta nueva dispara la poda
    uso.registrar(_traza(0.01))

    # Then: el JSON no crece sin fin
    assert len(uso.resumen()["por_dia"]) <= uso.DIAS_HISTORIAL


def test_el_resumen_sale_del_store_no_del_json_local(monkeypatch, store):
    # Given: el store sabe de consultas que este proceso nunca vio (el
    # contenedor se recreo, que pasa hasta 4 veces por dia)
    monkeypatch.setattr(uso.gasto, "acumulado",
                        lambda: {"n_consultas": 43, "total_usd": 0.34, "fuente": "store"})

    # When
    r = uso.resumen()

    # Then: manda el store. El JSON local vacio ya no puede reportar 0.
    assert r["n_consultas"] == 43 and r["fuente"] == "store"


def test_sin_store_cae_al_espejo_local_y_lo_declara(monkeypatch, store):
    # Given: store inaccesible y una consulta registrada en el espejo
    monkeypatch.setattr(uso.gasto, "acumulado", lambda: None)
    monkeypatch.setattr(uso.gasto, "registrar_consulta", lambda traza: False)
    uso.registrar({"modelo": "m", "usage": {"input_tokens": 10, "output_tokens": 5},
                   "costo": {"usd_total": 0.001}})

    # When
    r = uso.resumen()

    # Then: responde con lo que tiene, DICIENDO de donde sale. Un numero mas
    # chico de lo real sin su procedencia es peor que no tenerlo.
    assert r["n_consultas"] == 1
    assert r["fuente"] == "espejo-local"
