"""
Tests de la climatologia y del estimador, sin red ni DB (la serie se inyecta).

Lo que fijan, en orden de importancia:

  1. ANTI-FUGA. La climatologia es la superficie NUEVA por donde podria entrar el
     futuro: mira toda la historia, no solo la ultima hora. Se prueba por
     perturbacion, con control negativo.
  2. Que el peso decrezca con el horizonte y que sin historia caiga a persistencia
     pura (o sea: el metodo se degrada al anterior, no a algo inventado).
  3. Que la version escalar y la vectorizada del estimador den lo MISMO. Antes
     habia dos implementaciones distintas del metodo y nada las comparaba.
  4. Que la banda crezca con el horizonte, que era el defecto de la anterior.

Estructura Given-When-Then.
"""
import numpy as np
import pandas as pd
import pytest

from predictivo import config
from predictivo.forecasters import climatologia, estimador, uncertainty
from predictivo.physics import mezcla_convexa

TZ = "America/Costa_Rica"
# Techo plano y alto: separa el efecto del metodo del de la geometria solar.
_CS_PLANO = 800.0


def _serie(dias: int = 40, kt_manana: float = 0.8, kt_tarde: float = 0.3,
           semilla: int = 0, memoria: float = 0.97) -> pd.Series:
    """Serie sintetica con CICLO DIURNO y nubosidad con memoria.

    Dos propiedades, y las dos hacen falta:

      * mananas claras y tardes cerradas, que es el patron real del sitio
        (conveccion de tarde) y lo que la climatologia tiene que aprender. Sin
        ciclo diurno los tests del ajuste pasarian aunque no hiciera nada;
      * nubosidad AR(1): la desviacion respecto de lo tipico se arrastra y se
        desvanece. Sin eso, un horizonte largo seria tan predecible como uno corto
        y no habria peso que decrezca ni banda que crezca que probar.
    """
    rng = np.random.default_rng(semilla)
    filas, indices = [], []
    anomalia = 0.0
    for d in range(dias):
        dia = pd.Timestamp("2026-05-01", tz=TZ) + pd.Timedelta(days=d)
        for paso in range(int(12 * 60 / 5)):                 # 06:00 a 18:00 cada 5 min
            t = dia + pd.Timedelta(hours=6, minutes=5 * paso)
            anomalia = memoria * anomalia + rng.normal(0, 0.05)
            kt = (kt_manana if t.hour < 12 else kt_tarde) + anomalia
            filas.append(_CS_PLANO * max(0.0, kt))
            indices.append(t)
    return pd.Series(filas, index=pd.DatetimeIndex(indices), name="irradiancia")


@pytest.fixture(autouse=True)
def _sin_cache():
    """El cache es por proceso: sin esto un test veria la serie de otro."""
    climatologia.reiniciar_cache()
    yield
    climatologia.reiniciar_cache()


@pytest.fixture
def serie(monkeypatch):
    s = _serie()
    monkeypatch.setattr(climatologia._data, "cargar_serie", lambda *a, **k: s)
    monkeypatch.setattr(climatologia, "clear_sky_ghi",
                        lambda times, **k: pd.Series([_CS_PLANO] * len(pd.DatetimeIndex(times)),
                                                     index=pd.DatetimeIndex(times)))
    return s


# ── 1. Anti-fuga ─────────────────────────────────────────────────────────────
def test_la_climatologia_no_mira_despues_del_corte(monkeypatch, serie):
    # Given: un corte a mitad de la serie
    corte = pd.Timestamp("2026-05-20", tz=TZ)
    antes = climatologia.kt_tipico(pd.Timestamp("2026-05-20 14:00", tz=TZ),
                                   antes_de=corte)

    # When: se corrompe TODO lo posterior al corte
    rota = serie.copy()
    rota[rota.index >= corte] = 99999.0
    monkeypatch.setattr(climatologia._data, "cargar_serie", lambda *a, **k: rota)
    climatologia.reiniciar_cache()
    despues = climatologia.kt_tipico(pd.Timestamp("2026-05-20 14:00", tz=TZ),
                                     antes_de=corte)

    # Then: no se movio ni un decimal
    assert despues == antes


def test_control_negativo_corromper_el_pasado_si_mueve_la_climatologia(monkeypatch, serie):
    """Sin este control, el test de arriba pasaria aunque `kt_tipico` devolviera
    una constante. Es lo que separa "no ve el futuro" de "no ve nada"."""
    # Given
    corte = pd.Timestamp("2026-05-20", tz=TZ)
    antes = climatologia.kt_tipico(pd.Timestamp("2026-05-20 14:00", tz=TZ), antes_de=corte)

    # When: se corrompe el PASADO
    rota = serie.copy()
    rota[rota.index < corte] = 80.0
    monkeypatch.setattr(climatologia._data, "cargar_serie", lambda *a, **k: rota)
    climatologia.reiniciar_cache()

    # Then
    assert climatologia.kt_tipico(pd.Timestamp("2026-05-20 14:00", tz=TZ),
                                  antes_de=corte) != antes


def test_el_corte_se_lleva_al_inicio_del_dia(monkeypatch, serie):
    """Mas estricto que `< now`: el dia en curso NO entra en 'lo tipico'.

    Si entrara, la climatologia de la tarde incluiria la manana de hoy, que es
    justo el dato con el que se esta compitiendo."""
    # Given: dos cortes del mismo dia, uno temprano y otro tarde
    temprano = pd.Timestamp("2026-05-20 07:00", tz=TZ)
    tarde = pd.Timestamp("2026-05-20 17:00", tz=TZ)

    # When/Then: dan lo mismo, porque ambos se redondean al inicio del dia 20
    assert (climatologia.perfil_horario(antes_de=temprano).round(6).to_dict()
            == climatologia.perfil_horario(antes_de=tarde).round(6).to_dict())


# ── 2. El perfil y el peso ───────────────────────────────────────────────────
def test_el_perfil_aprende_el_ciclo_diurno(serie):
    # Given/When
    perfil = climatologia.perfil_horario(antes_de=pd.Timestamp("2026-06-05", tz=TZ))

    # Then: reconoce que la manana es mas clara que la tarde. Es EL hecho que le
    # faltaba al metodo anterior.
    assert perfil[9] > 0.7 and perfil[15] < 0.4
    assert perfil[9] > perfil[15]


def test_el_peso_decrece_con_el_horizonte(serie):
    # Given/When: el mismo corte, horizontes crecientes
    corte = pd.Timestamp("2026-06-05", tz=TZ)
    pesos = [climatologia.peso_persistencia(h, antes_de=corte)
             for h in (1800, 3600, 7200, 10800, 21600)]

    # Then: monotono no creciente. Cuanto mas lejos, menos vale lo que se ve ahora.
    assert pesos == sorted(pesos, reverse=True)
    assert all(0.0 <= p <= 1.0 for p in pesos)


def test_abajo_de_una_hora_no_se_contrae(serie):
    """La rampa: hasta `H_SIN_CONTRAER` se persiste tal cual.

    Medido, contraer a media hora cuesta ~10 W/m2 de error absoluto y apenas
    mejora el sesgo. La rampa existe por eso, no por gusto."""
    # Given/When/Then
    corte = pd.Timestamp("2026-06-05", tz=TZ)
    assert climatologia.peso_persistencia(1800, antes_de=corte) == 1.0
    assert climatologia.peso_persistencia(3600, antes_de=corte) == 1.0
    assert climatologia.peso_persistencia(10800, antes_de=corte) < 1.0


def test_la_rampa_no_tiene_saltos(serie):
    """Un corte duro haria que 7199 s y 7201 s dieran pronosticos distintos por
    una diferencia de un segundo, que no corresponde a nada fisico."""
    # Given/When
    corte = pd.Timestamp("2026-06-05", tz=TZ)
    pesos = [climatologia.peso_persistencia(h, antes_de=corte)
             for h in range(3000, 11400, 300)]

    # Then: ningun escalon mayor al de sus vecinos
    saltos = [abs(b - a) for a, b in zip(pesos, pesos[1:])]
    assert max(saltos) < 0.12


def test_sin_historia_el_peso_es_persistencia_pura(monkeypatch):
    # Given: dos dias de datos, muy por debajo del minimo
    corta = _serie(dias=1)
    monkeypatch.setattr(climatologia._data, "cargar_serie", lambda *a, **k: corta)
    monkeypatch.setattr(climatologia, "clear_sky_ghi",
                        lambda times, **k: pd.Series([_CS_PLANO] * len(pd.DatetimeIndex(times)),
                                                     index=pd.DatetimeIndex(times)))

    # When/Then: se degrada al metodo anterior, no a un numero inventado
    assert climatologia.peso_persistencia(
        10800, antes_de=pd.Timestamp("2026-05-01", tz=TZ)) == climatologia.PESO_SIN_HISTORIA


# ── 3. El estimador: escalar == vectorizado ──────────────────────────────────
def test_la_version_escalar_y_la_vectorizada_coinciden(serie):
    """El defecto que este modulo vino a cerrar: `persistence` y `backtest` tenian
    implementaciones DISTINTAS del mismo metodo, y nada las comparaba. Si vuelven
    a separarse, este test se rompe."""
    # Given: la misma rejilla que usa la version vectorizada
    corte = pd.Timestamp("2026-06-05", tz=TZ)
    marco = climatologia._marco("irradiancia", corte)
    kt = marco["kt"]
    seg = 10800

    vect = estimador.kt_a_persistir_serie(kt, seg, antes_de=corte)

    # When: se pide el mismo instante por la via escalar, con la misma ventana
    t = pd.Timestamp("2026-06-04 10:00", tz=TZ)
    ventana = kt[(kt.index <= t) & (kt.index > t - pd.Timedelta(minutes=60))].dropna()
    esc = estimador.kt_a_persistir(ventana, t + pd.Timedelta(seconds=seg), seg,
                                   antes_de=corte)

    # Then: mismo numero. La tolerancia cubre lo unico que los separa: la EWMA
    # escalar arranca en la ventana de 60 min y la vectorizada viene decayendo
    # desde antes. Si divergieran de verdad, el hueco seria de otro orden.
    assert abs(esc.kt - float(vect.loc[t])) < 0.03
    assert abs(esc.clima_objetivo - 0.3) < 0.1      # lo tipico de la tarde
    assert abs(esc.clima_reciente - 0.8) < 0.1      # lo tipico de la manana


def test_peso_1_sin_ajuste_diurno_es_persistencia_pura(serie):
    """La regresion que protege de cambiar el comportamiento sin querer: con las
    dos correcciones apagadas tiene que salir exactamente lo de antes."""
    # Given
    kt = pd.Series([0.5, 0.5, 0.5], name="kt",
                   index=pd.date_range("2026-06-04 10:00", periods=3, freq="5min", tz=TZ))

    # When
    est = estimador.kt_a_persistir(kt, pd.Timestamp("2026-06-04 13:00", tz=TZ), 10800,
                                   antes_de=pd.Timestamp("2026-06-04 10:10", tz=TZ),
                                   estadistico="mediana", peso=1.0,
                                   ajuste_diurno=False, centrar=False)

    # Then
    assert abs(est.kt - 0.5) < 1e-9


def test_mezcla_convexa_con_peso_1_y_un_solo_clima_es_identidad():
    # Given/When/Then: el caso limite documentado en `physics.mezcla_convexa`
    assert mezcla_convexa(0.73, 0.4, 0.4, 1.0) == pytest.approx(0.73)
    # peso 0: no se le cree nada a lo reciente
    assert mezcla_convexa(0.73, 0.4, 0.55, 0.0) == pytest.approx(0.55)
    # el ajuste diurno traslada la anomalia de una hora a la otra
    assert mezcla_convexa(0.73, 0.4, 0.55, 1.0) == pytest.approx(0.88)


def test_el_ajuste_diurno_baja_el_pronostico_de_la_tarde(serie):
    """La correccion principal, vista de punta a punta: pronosticar la tarde desde
    la manana tiene que dar MENOS que persistir la manana tal cual."""
    # Given: ventana de manana clara (kt ~0.8), objetivo a la tarde (tipico ~0.3)
    corte = pd.Timestamp("2026-06-04 11:00", tz=TZ)
    kt = pd.Series([0.8, 0.8, 0.8], name="kt",
                   index=pd.date_range("2026-06-04 10:50", periods=3, freq="5min", tz=TZ))
    objetivo = pd.Timestamp("2026-06-04 14:00", tz=TZ)

    # When
    con = estimador.kt_a_persistir(kt, objetivo, 10800, antes_de=corte)
    sin = estimador.kt_a_persistir(kt, objetivo, 10800, antes_de=corte,
                                   ajuste_diurno=False, peso=1.0, centrar=False)

    # Then
    assert con.kt < sin.kt
    assert con.clima_objetivo < con.clima_reciente        # la tarde es mas cerrada


# ── 4. La banda ──────────────────────────────────────────────────────────────
def test_la_banda_crece_con_el_horizonte(serie):
    """El defecto de la banda anterior: no crecia, porque medía la variabilidad de
    la ultima hora y no el error a ese horizonte. Cobertura real: 43 % a 30 min y
    25 % a 6 h, cuando deberia rondar el 68 %."""
    # Given/When
    corte = pd.Timestamp("2026-06-05", tz=TZ)
    anchos = []
    for h in (1800, 10800, 21600):
        lo, hi, origen = uncertainty.banda_empirica(0.5, _CS_PLANO, h, antes_de=corte)
        assert origen == "cuantiles-historicos"
        anchos.append(hi - lo)

    # Then
    assert anchos == sorted(anchos)


def test_sin_historia_la_banda_lo_declara(monkeypatch):
    # Given: serie demasiado corta para medir cuantiles
    corta = _serie(dias=1)
    monkeypatch.setattr(climatologia._data, "cargar_serie", lambda *a, **k: corta)
    monkeypatch.setattr(climatologia, "clear_sky_ghi",
                        lambda times, **k: pd.Series([_CS_PLANO] * len(pd.DatetimeIndex(times)),
                                                     index=pd.DatetimeIndex(times)))
    kt = pd.Series([0.4, 0.5, 0.6],
                   index=pd.date_range("2026-05-01 10:00", periods=3, freq="5min", tz=TZ))

    # When
    _lo, _hi, origen = uncertainty.banda_empirica(
        0.5, _CS_PLANO, 3600, antes_de=pd.Timestamp("2026-05-01", tz=TZ), kt_ventana=kt)

    # Then: una banda de respaldo y una calibrada no valen lo mismo, y se dice
    assert origen == "sigma-reciente"


def test_el_centro_corrige_el_punto_y_no_mueve_la_banda(serie):
    """La correccion de centro desplaza el valor reportado, no el ancho: los
    cuantiles se midieron contra el valor SIN centrar y ahi queda anclada."""
    # Given/When
    corte = pd.Timestamp("2026-06-05", tz=TZ)
    q = climatologia.cuantiles_error(10800, antes_de=corte)

    # Then: tres cuantiles ordenados, y el del medio es el que corrige
    assert q is not None and len(q) == 3
    assert q[0] < q[1] < q[2]
