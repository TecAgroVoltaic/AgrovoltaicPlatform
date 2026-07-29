"""
Tests de la fisica pura (kt* y reconstruccion), sin pvlib ni red.

Propiedad central: reconstruct_ghi(clear_sky_index(g, cs), cs) ~= g, pero SOLO
donde cs > umbral (de noche kt* no existe y se ignora).
"""
import numpy as np
import pandas as pd

from pronostico.physics import clear_sky_index, reconstruct_ghi

UMBRAL = 20.0


def _series():
    # cs con dos puntos "de noche" (<=umbral) y tres "de dia" (>umbral).
    cs = pd.Series([0.0, 10.0, 100.0, 500.0, 800.0])
    g = pd.Series([0.0, 5.0, 80.0, 400.0, 700.0])
    return g, cs


def test_reconstruccion_es_identidad_de_dia():
    g, cs = _series()
    kt = clear_sky_index(g, cs, UMBRAL)
    # kt solo existe donde cs > umbral -> 3 puntos.
    assert len(kt) == 3
    g_rec = reconstruct_ghi(kt, cs[kt.index])
    np.testing.assert_allclose(g_rec.values, g[kt.index].values, rtol=1e-9)


def test_noche_se_ignora():
    g, cs = _series()
    kt = clear_sky_index(g, cs, UMBRAL)
    # los indices de noche (cs <= umbral) NO aparecen en kt.
    assert 0 not in kt.index and 1 not in kt.index
    assert set(kt.index) == {2, 3, 4}


def test_kt_no_negativo():
    # una medida negativa (offset del sensor) no debe dar kt* negativo.
    cs = pd.Series([500.0, 800.0])
    g = pd.Series([-30.0, 700.0])
    kt = clear_sky_index(g, cs, UMBRAL)
    assert (kt >= 0).all()
    assert kt.iloc[0] == 0.0


def test_kt_valores_esperados():
    g, cs = _series()
    kt = clear_sky_index(g, cs, UMBRAL)
    esperado = {2: 80 / 100, 3: 400 / 500, 4: 700 / 800}
    for i, v in esperado.items():
        assert kt[i] == v
