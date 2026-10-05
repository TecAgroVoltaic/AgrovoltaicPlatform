"""Pruebas de las distribuciones mensuales (Fig. 6): cajas e irradiacion acumulada.

Se prueba lo PURO: el criterio IQR que decide que es outlier, el armado de la caja
y la conversion de la integral a kWh/m2. Los casos que ganan su lugar son los que
mienten si se resuelven mal: el mes sin datos (que no puede desaparecer del eje),
el mes de un solo dato (que no tiene cuartiles) y la integral (que si se calcula
como una suma plana subestima un mes veinte veces).
"""
from __future__ import annotations

from datetime import datetime

import pytest

from historico.analitica import distribucion

ENERO, FEBRERO, MARZO = (datetime(2026, 1, 1), datetime(2026, 2, 1), datetime(2026, 3, 1))
MESES = [ENERO, FEBRERO, MARZO]


def _cuartiles(mes, q1, mediana, q3, minimo, maximo, n=1000) -> dict:
    return {"mes": mes, "n": n, "minimo": minimo, "maximo": maximo,
            "q1": q1, "mediana": mediana, "q3": q3}


# ── El criterio IQR ──────────────────────────────────────────────────────────

def test_las_vallas_salen_de_un_iqr_y_medio_a_cada_lado():
    # Given un mes con Q1 = 100 y Q3 = 300 (IQR = 200)
    filas = [_cuartiles("2026-01", 100, 200, 300, 0, 900)]
    # When se calculan las vallas
    limites = distribucion.vallas(filas)
    # Then van de 100 - 300 a 300 + 300
    assert limites["2026-01"] == pytest.approx((-200.0, 600.0))


def test_un_mes_sin_cuartiles_no_recibe_vallas_inventadas():
    # Given un mes con una sola lectura, del que no salen cuartiles
    filas = [_cuartiles("2026-02", None, None, None, 5, 5, n=1)]
    # When se calculan las vallas
    limites = distribucion.vallas(filas)
    # Then ese mes queda fuera: no se deduce un rango de un solo punto
    assert "2026-02" not in limites


# ── El armado de la caja ─────────────────────────────────────────────────────

def test_un_mes_sin_datos_sigue_apareciendo_en_el_eje():
    # Given tres meses de ventana y datos solo en enero
    cuartiles = [_cuartiles("2026-01", 100, 200, 300, 0, 900)]
    limites = distribucion.vallas(cuartiles)
    # When se arman las cajas
    cajas = distribucion.reducir(MESES, cuartiles, limites, {})
    # Then febrero y marzo salen vacios en vez de desaparecer del grafico
    assert [c["mes"] for c in cajas] == ["2026-01", "2026-02", "2026-03"]
    assert cajas[1]["n"] == 0 and cajas[1]["mediana"] is None
    assert cajas[1]["outliers_bajos"] == 0 and cajas[1]["outliers_altos"] == 0


def test_la_caja_lleva_los_cinco_numeros_el_iqr_y_los_outliers_contados():
    # Given un mes con cuartiles y puntos fuera de las vallas
    cuartiles = [_cuartiles("2026-01", 100, 200, 300, -500, 1200)]
    limites = distribucion.vallas(cuartiles)
    extremos = {"2026-01": {"outliers_bajos": 4, "outliers_altos": 11,
                            "bigote_inferior": -150.0, "bigote_superior": 580.0}}
    # When se arma la caja
    caja = distribucion.reducir(MESES, cuartiles, limites, extremos)[0]
    # Then la caja es la de la figura y los bigotes paran en el dato, no en la valla
    assert (caja["q1"], caja["mediana"], caja["q3"]) == (100, 200, 300)
    assert caja["iqr"] == pytest.approx(200.0)
    assert (caja["valla_inferior"], caja["valla_superior"]) == pytest.approx((-200.0, 600.0))
    assert (caja["bigote_inferior"], caja["bigote_superior"]) == (-150.0, 580.0)
    assert (caja["outliers_bajos"], caja["outliers_altos"]) == (4, 11)
    # y el minimo y el maximo siguen siendo los extremos reales, outliers incluidos
    assert (caja["minimo"], caja["maximo"]) == (-500, 1200)


# ── La irradiacion acumulada ─────────────────────────────────────────────────

def test_la_integral_se_convierte_a_kwh_por_metro_cuadrado():
    # Given un mes que acumulo 5 kWh/m2 en julios sobre 2 dias con dato
    filas = [{"mes": "2026-01", "julios_m2": 5 * distribucion.JULIOS_POR_KWH,
              "n": 288, "dias": 2}]
    # When se reduce
    barra = distribucion.reducir_irradiacion(MESES, filas)[0]
    # Then el acumulado y la media diaria estan en kWh/m2
    assert barra["irradiacion"]["valor"] == pytest.approx(5.0)
    assert barra["irradiacion"]["unidad"] == "kWh/m2"
    assert barra["media_diaria"]["valor"] == pytest.approx(2.5)


def test_la_media_diaria_divide_por_los_dias_MEDIDOS_no_por_los_del_mes():
    # Given un mes de 31 dias del que solo se midieron 2, con 9 kWh/m2 acumulados
    filas = [{"mes": "2026-01", "julios_m2": 9 * distribucion.JULIOS_POR_KWH,
              "n": 400, "dias": 2}]
    # When se reduce
    barra = distribucion.reducir_irradiacion(MESES, filas)[0]
    # Then el mes se lee como 4,5 kWh/m2/dia (soleado) y no como 0,29 (falso oscuro)
    assert barra["media_diaria"]["valor"] == pytest.approx(4.5)
    assert barra["dias_con_dato"] == 2


def test_un_mes_sin_lecturas_da_None_y_no_cero_kwh():
    # Given una ventana de tres meses sin ninguna lectura
    # When se reduce
    barras = distribucion.reducir_irradiacion(MESES, [])
    # Then el mes existe pero su valor es None: "0 kWh/m2" afirmaria que no hubo sol
    assert len(barras) == 3
    assert barras[0]["irradiacion"]["valor"] is None
    assert barras[0]["irradiacion"]["n"] == 0
    assert barras[0]["media_diaria"]["valor"] is None
