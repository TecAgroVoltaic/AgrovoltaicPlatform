"""
Tests del ADDON de modelos numericos. SIN red: la descarga se mockea siempre.

Lo que fijan, y por que cada uno importa:

  1. APAGADO POR DEFECTO. Es la propiedad que hace que esto sea un addon y no una
     dependencia. Si alguien la rompe, el sistema pasa a depender de un servicio
     de terceros sin que nadie lo haya decidido.
  2. FALLA HACIA None. Servicio caido, formato cambiado, coordenadas sin
     cobertura: el pronostico tiene que salir igual, sin el aporte.
  3. El peso CRECE con el horizonte y es 0 abajo de una hora. Medido: dejar
     entrar la opinion de un modelo de malla gruesa a media hora empeoraba el
     error absoluto.
  4. NO se filtra el futuro por esta puerta nueva.

Estructura Given-When-Then.
"""
import pandas as pd
import pytest

from pronostico.forecasters import climatologia, nwp


@pytest.fixture(autouse=True)
def _limpio(monkeypatch):
    nwp.reiniciar_cache()
    climatologia.reiniciar_cache()
    monkeypatch.delenv(nwp.ENV_HABILITADO, raising=False)
    yield
    nwp.reiniciar_cache()
    climatologia.reiniciar_cache()


def _nubes(dias: int = 40) -> pd.DataFrame:
    """Nubosidad horaria sintetica: despejado de manana, cerrado de tarde."""
    idx = pd.date_range("2026-05-01", periods=24 * dias, freq="1h",
                        tz="America/Costa_Rica")
    val = [0.2 if t.hour < 12 else 0.9 for t in idx]
    return pd.DataFrame({f"nub_{m}": val for m in nwp.MODELOS[:2]}, index=idx)


# ── 1. Apagado por defecto ───────────────────────────────────────────────────
def test_apagado_por_defecto():
    # Given: nadie configuro nada (el estado de una instalacion limpia)
    # When/Then
    assert nwp.habilitado() is False
    assert nwp.kt_pronosticado("2026-06-01T10:00") is None
    assert nwp.peso_mezcla(10800) == 0.0


@pytest.mark.parametrize("valor,esperado", [
    ("1", True), ("true", True), ("si", True), ("on", True), ("TRUE", True),
    ("0", False), ("no", False), ("", False), ("cualquiera", False),
])
def test_el_interruptor_es_explicito(monkeypatch, valor, esperado):
    # Given/When/Then: solo prende con un si explicito, nunca por accidente
    monkeypatch.setenv(nwp.ENV_HABILITADO, valor)
    assert nwp.habilitado() is esperado


def test_prendido_no_cambia_el_pronostico_si_no_hay_datos(monkeypatch):
    # Given: el addon prendido pero sin serie cacheada ni red
    monkeypatch.setenv(nwp.ENV_HABILITADO, "1")
    monkeypatch.setattr(nwp, "serie", lambda *a, **k: None)

    # Then: se comporta igual que apagado
    assert nwp.kt_pronosticado("2026-06-01T10:00") is None
    assert nwp.peso_mezcla(10800) == 0.0


# ── 2. Falla hacia None ──────────────────────────────────────────────────────
def test_un_servicio_caido_no_propaga_la_excepcion(monkeypatch):
    # Given: la red revienta
    def _explota(*a, **k):
        raise OSError("connection refused")

    monkeypatch.setattr(nwp.urllib.request, "urlopen", _explota)

    # When/Then: None, no una excepcion que suba hasta el usuario
    assert nwp._pedir(nwp.URL_HISTORICO, {}) is None
    assert nwp.descargar("2026-05-01", "2026-05-02") is None


def test_coordenadas_sin_cobertura_devuelven_none(monkeypatch):
    """El caso REAL del API de satelite en Costa Rica: responde 200 con `nan`
    en vez de fallar. Una respuesta valida y vacia no es un dato."""
    # Given
    monkeypatch.setattr(nwp, "_pedir", lambda url, p: {"latitude": float("nan")})

    # When/Then
    assert nwp.descargar("2026-05-01", "2026-05-02") is None


def test_si_un_modelo_falla_se_sigue_con_los_demas(monkeypatch):
    # Given: solo el primer modelo responde
    llamadas = []

    def _pedir(url, params):
        llamadas.append(params["models"])
        if params["models"] != nwp.MODELOS[0]:
            return None
        return {"hourly": {"time": ["2026-05-01T10:00", "2026-05-01T11:00"],
                           "cloud_cover": [10, 90], "shortwave_radiation": [700, 200]}}

    monkeypatch.setattr(nwp, "_pedir", _pedir)

    # When
    marco = nwp.descargar("2026-05-01", "2026-05-01")

    # Then: se consultaron todos y se sigue con el que contesto. Perder un modelo
    # degrada la CALIDAD del conjunto, no el servicio.
    assert len(llamadas) == len(nwp.MODELOS)
    assert list(marco.columns) == [f"nub_{nwp.MODELOS[0]}"]
    assert marco.iloc[0, 0] == pytest.approx(0.1)      # el porcentaje llega en 0..1


# ── 3. El peso ───────────────────────────────────────────────────────────────
def test_el_peso_es_cero_abajo_de_una_hora(monkeypatch):
    # Given: addon prendido y un peso crudo alto
    monkeypatch.setenv(nwp.ENV_HABILITADO, "1")
    monkeypatch.setattr(nwp, "serie", lambda *a, **k: _nubes())
    monkeypatch.setattr(nwp, "_peso_mezcla", lambda *a, **k: 0.9)

    # When/Then: la rampa lo anula a horizonte corto. Medido, dejarlo entrar ahi
    # empeoraba el error absoluto.
    assert nwp.peso_mezcla(1800) == 0.0
    assert nwp.peso_mezcla(3600) == 0.0
    assert nwp.peso_mezcla(21600) == pytest.approx(0.9)


def test_el_peso_crece_con_el_horizonte(monkeypatch):
    # Given
    monkeypatch.setenv(nwp.ENV_HABILITADO, "1")
    monkeypatch.setattr(nwp, "serie", lambda *a, **k: _nubes())
    monkeypatch.setattr(nwp, "_peso_mezcla", lambda *a, **k: 0.8)

    # When
    pesos = [nwp.peso_mezcla(h) for h in (3600, 5400, 7200, 9000, 10800, 21600)]

    # Then: cuanto mas lejos, mas vale la opinion de afuera y menos el sensor
    assert pesos == sorted(pesos)
    assert all(0.0 <= p <= 1.0 for p in pesos)


def test_el_peso_queda_acotado_a_cero_uno(monkeypatch):
    # Given: un ajuste degenerado que devuelve un peso absurdo
    monkeypatch.setenv(nwp.ENV_HABILITADO, "1")
    monkeypatch.setattr(nwp, "serie", lambda *a, **k: _nubes())
    monkeypatch.setattr(nwp, "_peso_mezcla", lambda *a, **k: 4.7)

    # When/Then: "mezclar" nunca puede significar extrapolar. El acotado tiene
    # que estar en la funcion PUBLICA, no solo en el calculo interno.
    assert nwp.peso_mezcla(21600) == 1.0


# ── 4. Anti-fuga por la puerta nueva ─────────────────────────────────────────
def test_la_calibracion_no_usa_horas_posteriores_al_corte(monkeypatch):
    """La traduccion nubosidad -> claridad se aprende de los datos del sitio. Es
    una puerta nueva por donde podria colarse el futuro."""
    # Given: nubosidad de 40 dias y kt* medido inventado, con el futuro corrompido
    monkeypatch.setenv(nwp.ENV_HABILITADO, "1")
    nubes = _nubes()
    monkeypatch.setattr(nwp, "serie", lambda *a, **k: nubes)
    corte = pd.Timestamp("2026-05-20", tz="America/Costa_Rica")
    kt = pd.Series(0.6, index=nubes.index)

    monkeypatch.setattr(nwp, "_kt_horario", lambda v, c: kt)
    nwp.reiniciar_cache()
    limpio = nwp._mos("irradiancia", corte)

    # When: se corrompe TODO lo posterior al corte
    kt_roto = kt.copy()
    kt_roto[kt_roto.index >= corte] = 99.0
    monkeypatch.setattr(nwp, "_kt_horario", lambda v, c: kt_roto)
    nwp.reiniciar_cache()
    sucio = nwp._mos("irradiancia", corte)

    # Then: los coeficientes no se movieron
    assert limpio is not None and sucio is not None
    assert list(limpio[1]) == pytest.approx(list(sucio[1]))


def test_el_kt_del_modelo_respeta_el_tope(monkeypatch):
    # Given: una calibracion que propondria una claridad imposible
    monkeypatch.setenv(nwp.ENV_HABILITADO, "1")
    nubes = _nubes()
    monkeypatch.setattr(nwp, "serie", lambda *a, **k: nubes)
    import numpy as np
    monkeypatch.setattr(nwp, "_mos",
                        lambda v, a: (list(nubes.columns), np.array([9.0, 0.0, 0.0])))

    # When/Then: no se puede pasar mas luz que el techo de cielo despejado
    assert nwp.kt_pronosticado("2026-05-10T10:00") == nwp.KT_MAX
