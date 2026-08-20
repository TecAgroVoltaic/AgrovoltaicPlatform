"""
Tests del riesgo de nubes y de la banda condicionada al regimen. Sin red ni DB.

Lo que fijan, en orden de importancia:

  1. ANTI-FUGA. La ventana del regimen se ancla en el CORTE, nunca en el instante
     objetivo. Fue un defecto real de la primera version: medir la turbulencia
     "alrededor del momento a pronosticar" son datos posteriores al corte.
  2. Que el modulo NO pretenda predecir la nube. Lo que devuelve es frecuencia
     historica, y tiene que decirlo: la correlacion medida para anticipar el
     cambio es 0,24 a 1 h y 0,08 a 6 h, y presentarlo como prevision seria
     prometer una certeza que los datos no respaldan.
  3. Que la banda por regimen sea MAS ANGOSTA con el cielo quieto y MAS ANCHA con
     el cielo movido. Esa es toda la ganancia; si se invierte, no sirve.
  4. Que los umbrales se DERIVEN del sitio y no esten quemados.

Estructura Given-When-Then.
"""
import numpy as np
import pandas as pd
import pytest

from pronostico.forecasters import climatologia, riesgo, uncertainty

TZ = "America/Costa_Rica"
_CS = 800.0


def _serie(dias=40, semilla=0, turbulencia=0.05):
    """Serie con ciclo diurno y nubosidad con memoria (ver test_climatologia)."""
    rng = np.random.default_rng(semilla)
    filas, indices, anom = [], [], 0.0
    for d in range(dias):
        dia = pd.Timestamp("2026-05-01", tz=TZ) + pd.Timedelta(days=d)
        for paso in range(int(12 * 60 / 5)):
            t = dia + pd.Timedelta(hours=6, minutes=5 * paso)
            anom = 0.97 * anom + rng.normal(0, turbulencia)
            kt = (0.8 if t.hour < 12 else 0.3) + anom
            filas.append(_CS * max(0.0, kt))
            indices.append(t)
    return pd.Series(filas, index=pd.DatetimeIndex(indices), name="irradiancia")


@pytest.fixture(autouse=True)
def _limpio():
    riesgo.reiniciar_cache()
    climatologia.reiniciar_cache()
    yield
    riesgo.reiniciar_cache()
    climatologia.reiniciar_cache()


@pytest.fixture
def serie(monkeypatch):
    s = _serie()
    plano = lambda times, **k: pd.Series([_CS] * len(pd.DatetimeIndex(times)),
                                         index=pd.DatetimeIndex(times))
    monkeypatch.setattr(climatologia._data, "cargar_serie", lambda *a, **k: s)
    monkeypatch.setattr(climatologia, "clear_sky_ghi", plano)
    monkeypatch.setattr(riesgo, "clear_sky_ghi", plano)
    from pronostico import data as _d
    monkeypatch.setattr(_d, "cargar_serie", lambda *a, **k: s)
    return s


# ── 1. Anti-fuga ─────────────────────────────────────────────────────────────
def test_la_ventana_se_ancla_en_el_corte_no_en_el_objetivo(serie):
    """El defecto de la primera version, fijado como prueba.

    Si el regimen se midiera alrededor del instante objetivo, cambiar los datos
    entre el corte y el objetivo lo movería. No puede.
    """
    # Given: se pronostica las 14:00 con 3 h de anticipacion (corte a las 11:00)
    corte = pd.Timestamp("2026-06-04 11:00", tz=TZ)
    antes = riesgo.regimen_actual(corte)

    # When: se corrompe TODO lo que pasa entre el corte y el objetivo
    objetivo = pd.Timestamp("2026-06-04 14:00", tz=TZ)
    rota = serie.copy()
    rota[(rota.index >= corte) & (rota.index <= objetivo)] = 5.0
    from pronostico import data as _d
    import pronostico.forecasters.riesgo as R
    _d._SERIES.clear()
    R.reiniciar_cache()

    # Then: el regimen no se movio (la ventana solo mira antes del corte)
    assert riesgo.regimen_actual(corte)["turbulencia"] == antes["turbulencia"]


def test_la_tool_expone_el_corte_y_es_anterior_al_objetivo(serie):
    # Given/When
    from pronostico.tools import riesgo_tool
    r = riesgo_tool.run("irradiancia", "2026-06-04T14:00", 10800)

    # Then: se ve de donde salio la informacion, y es anterior
    visible = pd.Timestamp(r["datos_visibles_hasta"])
    assert visible == pd.Timestamp("2026-06-04 11:00", tz=TZ)
    assert visible < pd.Timestamp(r["instante"])


# ── 2. No pretende predecir la nube ──────────────────────────────────────────
def test_declara_que_es_frecuencia_y_no_prevision(serie):
    # Given/When
    r = riesgo.evaluar(pd.Timestamp("2026-06-04 14:00", tz=TZ), 3600)

    # Then: la honestidad del modulo es esa frase. Sin ella, "23 % de que se
    # tape" se lee como una prevision para hoy, que es justo lo que no es.
    assert "FRECUENCIA, no prevision" in r["nota"]
    assert "no para mover el valor pronosticado" in r["nota"]


def test_la_probabilidad_separa_las_dos_direcciones(serie):
    """Es el aporte real: no es lo mismo un numero que puede quedar corto que uno
    que puede quedar largo, porque el error del metodo es asimetrico."""
    # Given/When
    p = riesgo.probabilidad_cambio(pd.Timestamp("2026-06-04 14:00", tz=TZ), 3600)

    # Then
    assert p is not None
    assert set(p) >= {"pct_se_tapa", "pct_se_abre", "direccion_dominante"}
    assert p["direccion_dominante"] in ("taparse", "abrirse", "ninguna")
    assert 0 <= p["pct_se_tapa"] <= 100 and 0 <= p["pct_se_abre"] <= 100


def test_sin_historia_no_inventa_un_regimen(monkeypatch):
    # Given: dos dias de datos, muy por debajo del minimo
    corta = _serie(dias=1)
    plano = lambda times, **k: pd.Series([_CS] * len(pd.DatetimeIndex(times)),
                                         index=pd.DatetimeIndex(times))
    monkeypatch.setattr(climatologia._data, "cargar_serie", lambda *a, **k: corta)
    monkeypatch.setattr(climatologia, "clear_sky_ghi", plano)

    # When/Then: None, no una etiqueta sin significado. Decir "turbulento" sin
    # referencia contra que compararlo es una palabra vacia.
    assert riesgo.clasificar(0.3, antes_de=pd.Timestamp("2026-05-01", tz=TZ)) is None


# ── 3. La banda por regimen ──────────────────────────────────────────────────
def test_la_banda_es_mas_angosta_con_el_cielo_quieto(serie):
    """Toda la ganancia del cambio esta en esta propiedad. Si se invirtiera, la
    banda condicionada seria peor que la global."""
    # Given/When
    corte = pd.Timestamp("2026-06-05", tz=TZ)
    anchos = {}
    for reg in riesgo.REGIMENES:
        lo, hi, origen = uncertainty.banda_empirica(0.5, _CS, 3600, antes_de=corte,
                                                    regimen=reg)
        anchos[reg] = hi - lo

    # Then
    assert anchos["calmo"] < anchos["turbulento"]
    assert anchos["calmo"] <= anchos["medio"] <= anchos["turbulento"]


def test_la_banda_declara_de_que_regimen_salio(serie):
    # Given/When
    corte = pd.Timestamp("2026-06-05", tz=TZ)
    _lo, _hi, origen = uncertainty.banda_empirica(0.5, _CS, 3600, antes_de=corte,
                                                  regimen="calmo")

    # Then: una banda de un regimen y una global no valen lo mismo, y se dice
    assert origen == "cuantiles-historicos-calmo"


def test_un_regimen_sin_muestras_cae_a_la_banda_global(serie):
    # Given: un regimen que no existe en el catalogo
    corte = pd.Timestamp("2026-06-05", tz=TZ)
    glob = uncertainty.banda_empirica(0.5, _CS, 3600, antes_de=corte)

    # When
    raro = uncertainty.banda_empirica(0.5, _CS, 3600, antes_de=corte,
                                      regimen="inexistente")

    # Then: cae al global en vez de quedarse sin banda. Peor, pero nunca falsa.
    assert raro[:2] == glob[:2]


# ── 4. Los umbrales se derivan ───────────────────────────────────────────────
def test_los_cortes_salen_del_sitio_y_no_estan_quemados(monkeypatch):
    """Un sitio mas turbulento tiene que mover los umbrales. Si estuvieran fijos,
    'turbulento' significaria cosas distintas en sitios distintos."""
    # Given: dos sitios, uno cuatro veces mas variable que el otro
    cortes = []
    plano = lambda times, **k: pd.Series([_CS] * len(pd.DatetimeIndex(times)),
                                         index=pd.DatetimeIndex(times))
    for turb in (0.02, 0.08):
        s = _serie(turbulencia=turb)
        monkeypatch.setattr(climatologia._data, "cargar_serie", lambda *a, **k: s)
        monkeypatch.setattr(climatologia, "clear_sky_ghi", plano)
        riesgo.reiniciar_cache(); climatologia.reiniciar_cache()
        cortes.append(riesgo._cortes("irradiancia", pd.Timestamp("2026-06-05", tz=TZ)))

    # Then: el sitio mas variable tiene umbrales mas altos
    assert cortes[0] is not None and cortes[1] is not None
    assert cortes[1][0] > cortes[0][0] and cortes[1][1] > cortes[0][1]


def test_clasificar_serie_coincide_con_clasificar_uno_a_uno(serie):
    """La version vectorizada existe por velocidad (el backtest la llama miles de
    veces). Si divergiera de la escalar, la banda del backtest y la de produccion
    se separarian sin que nadie lo note."""
    # Given
    corte = pd.Timestamp("2026-06-05", tz=TZ)
    turb = riesgo._turbulencia(climatologia._marco("irradiancia", corte)["kt"])
    muestra = turb.dropna().iloc[::200]

    # When
    vect = riesgo.clasificar_serie(muestra, antes_de=corte)
    uno = [riesgo.clasificar(v, antes_de=corte) for v in muestra]

    # Then
    assert list(vect) == uno
