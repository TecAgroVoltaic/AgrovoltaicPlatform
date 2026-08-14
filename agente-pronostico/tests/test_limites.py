"""
Tests de los frenos de consumo (ritmo + presupuesto), sin red ni LLM.

El reloj se inyecta (`ahora`) para no depender de sleeps: los tests corren en
milisegundos y son deterministas. Estructura Given-When-Then.
"""
import pytest

from pronostico import limites

IDENTIDAD = "ip:10.0.0.1"
OTRA = "ip:10.0.0.2"


def test_permite_hasta_el_limite_y_luego_corta():
    # Given: 3 solicitudes por minuto
    lim = limites.LimitadorRitmo(por_minuto=3)

    # When: se hacen 3 seguidas en el mismo instante
    permitidas = [lim.permitir(IDENTIDAD, ahora=100.0) for _ in range(3)]

    # Then: pasan las 3 y la cuarta no
    assert permitidas == [True, True, True]
    assert lim.permitir(IDENTIDAD, ahora=100.0) is False


def test_el_balde_se_rellena_con_el_tiempo():
    # Given: agotado el limite
    lim = limites.LimitadorRitmo(por_minuto=60)   # 1 token por segundo
    for _ in range(60):
        lim.permitir(IDENTIDAD, ahora=100.0)
    assert lim.permitir(IDENTIDAD, ahora=100.0) is False

    # When: pasa un segundo
    # Then: hay un token de nuevo
    assert lim.permitir(IDENTIDAD, ahora=101.0) is True


def test_las_identidades_no_se_pisan():
    # Given: una identidad agota su cuota
    lim = limites.LimitadorRitmo(por_minuto=2)
    lim.permitir(IDENTIDAD, ahora=100.0)
    lim.permitir(IDENTIDAD, ahora=100.0)
    assert lim.permitir(IDENTIDAD, ahora=100.0) is False

    # When/Then: otra identidad arranca con su balde lleno
    assert lim.permitir(OTRA, ahora=100.0) is True


def test_las_identidades_inactivas_se_purgan():
    # Given: una identidad vieja
    lim = limites.LimitadorRitmo(por_minuto=5)
    lim.permitir(IDENTIDAD, ahora=100.0)

    # When: pasa mas del TTL y llama otra
    lim.permitir(OTRA, ahora=100.0 + limites.TTL_IDENTIDAD_SEG + 1)

    # Then: el dict no acumula identidades muertas (memoria acotada)
    assert IDENTIDAD not in lim._baldes


def test_presupuesto_corta_al_llegar_al_tope(monkeypatch):
    # Given: ya se gastaron 5 USD y el tope es 5
    monkeypatch.setattr(limites.uso_mod, "usd_hoy", lambda: 5.0)

    # When
    agotado, gastado, tope = limites.presupuesto_agotado(tope_usd=5.0)

    # Then
    assert agotado is True and gastado == 5.0 and tope == 5.0


def test_presupuesto_no_corta_por_debajo_del_tope(monkeypatch):
    # Given: gasto por debajo del tope
    monkeypatch.setattr(limites.uso_mod, "usd_hoy", lambda: 4.99)

    # When/Then
    agotado, _, _ = limites.presupuesto_agotado(tope_usd=5.0)
    assert agotado is False


def test_tope_cero_desactiva_el_presupuesto(monkeypatch):
    # Given: un gasto altisimo pero sin tope configurado
    monkeypatch.setattr(limites.uso_mod, "usd_hoy", lambda: 999.0)

    # When/Then: 0 = sin tope, explicito
    agotado, _, _ = limites.presupuesto_agotado(tope_usd=0)
    assert agotado is False


@pytest.mark.parametrize("por_minuto,minimo_esperado", [(60, 1), (12, 5), (1, 60)])
def test_espera_sugerida_es_coherente(por_minuto, minimo_esperado):
    # Given/When/Then: el Retry-After nunca es 0 (un cliente reintentaria en bucle)
    lim = limites.LimitadorRitmo(por_minuto=por_minuto)
    assert lim.espera_seg() == minimo_esperado
