"""Pruebas de la serie temporal con sus cuatro trazos (Fig. 5).

Se prueba la parte PURA: el ajuste lineal, la media movil y el armado del punto.
Sin base de datos, con datos puestos a mano, porque ahi es donde vive el criterio y
ahi es donde se rompe: los casos que importan son los degenerados (serie vacia, un
solo punto, serie plana, hueco en medio), que son justamente los que no aparecen al
consultar un mes bueno.

La resolucion de fuente y la rejilla de buckets se prueban en `test_analitica_fuente`.
"""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from historico.analitica import fuente, series

FORMATO = fuente.FORMATO_BUCKET


def _dias(inicio: str, cuantos: int) -> list[datetime]:
    """Given: una rejilla de `cuantos` dias consecutivos desde `inicio`."""
    base = datetime.fromisoformat(inicio)
    return [base + timedelta(days=i) for i in range(cuantos)]


def _agregado(valor, n=10, minimo=None, maximo=None, desviacion=None) -> dict:
    return {"valor": valor, "n": n,
            "minimo": minimo if minimo is not None else valor,
            "maximo": maximo if maximo is not None else valor,
            "desviacion": desviacion}


def _por_bucket(buckets: list[datetime], valores: list) -> dict[str, dict]:
    return {t.strftime(FORMATO): _agregado(v)
            for t, v in zip(buckets, valores) if v is not None}


def test_una_serie_creciente_da_la_pendiente_y_el_r2_exactos():
    # Given cinco dias que suben 10 unidades por dia
    buckets = _dias("2026-03-01", 5)
    # When se reduce
    r = series.reducir(buckets, _por_bucket(buckets, [10, 20, 30, 40, 50]))
    # Then la recta es exactamente esa y el ajuste es perfecto
    pendiente, intercepto, r2 = r["tendencia"]
    assert pendiente == pytest.approx(10.0)
    assert intercepto == pytest.approx(10.0)
    assert r2 == pytest.approx(1.0)
    assert r["puntos"][0]["tendencia"] == pytest.approx(10.0)


def test_un_solo_punto_no_tiene_tendencia_ni_desviacion():
    # Given un unico bucket con una sola lectura (stddev_samp devuelve NULL)
    buckets = _dias("2026-03-01", 1)
    agregados = {buckets[0].strftime(FORMATO): _agregado(42.0, n=1)}
    # When se reduce
    r = series.reducir(buckets, agregados)
    # Then no hay recta que ajustar ni banda que pintar
    assert r["tendencia"] is None
    assert r["puntos"][0]["tendencia"] is None
    assert r["puntos"][0]["banda_inferior"] is None
    assert r["puntos"][0]["banda_superior"] is None


def test_una_serie_vacia_devuelve_los_buckets_con_None_y_no_revienta():
    # Given una ventana sin ni una lectura
    buckets = _dias("2026-03-01", 3)
    # When se reduce
    r = series.reducir(buckets, {})
    # Then los tres buckets salen, vacios y contados como tales
    assert [p["valor"] for p in r["puntos"]] == [None, None, None]
    assert [p["n"] for p in r["puntos"]] == [0, 0, 0]
    assert r["tendencia"] is None and r["n_con_dato"] == 0


def test_una_serie_plana_no_finge_un_ajuste_perfecto():
    # Given una variable congelada en el mismo valor
    buckets = _dias("2026-03-01", 4)
    # When se reduce
    r = series.reducir(buckets, _por_bucket(buckets, [7, 7, 7, 7]))
    # Then la pendiente es cero y el r2 es None: 0/0 no es un ajuste excelente
    pendiente, _, r2 = r["tendencia"]
    assert pendiente == pytest.approx(0.0)
    assert r2 is None


def test_la_banda_de_desviacion_rodea_el_valor():
    # Given un bucket con media 100 y desviacion 15
    buckets = _dias("2026-03-01", 1)
    agregados = {buckets[0].strftime(FORMATO): _agregado(100.0, desviacion=15.0)}
    # When se reduce
    punto = series.reducir(buckets, agregados)["puntos"][0]
    # Then la banda va de 85 a 115
    assert punto["banda_inferior"] == pytest.approx(85.0)
    assert punto["banda_superior"] == pytest.approx(115.0)


def test_la_media_movil_se_niega_a_promediar_sobre_un_hueco():
    # Given cinco dias con el tercero sin datos
    buckets = _dias("2026-03-01", 5)
    agregados = _por_bucket(buckets, [10, 20, None, 40, 50])
    # When se reduce con media movil de 3 buckets
    r = series.reducir(buckets, agregados, media_movil=3)
    # Then no hay valor en ninguna ventana que toque el hueco
    assert [p["media_movil"] for p in r["puntos"]] == [None] * 5


def test_la_media_movil_aparece_recien_con_la_ventana_completa():
    # Given cuatro dias seguidos con datos
    buckets = _dias("2026-03-01", 4)
    # When se reduce con media movil de 3 buckets
    r = series.reducir(buckets, _por_bucket(buckets, [1, 2, 3, 4]), media_movil=3)
    # Then los dos primeros no tienen media (no hay tres buckets aun)
    assert [p["media_movil"] for p in r["puntos"]] == [None, None, 2.0, 3.0]


def test_una_media_movil_de_cero_buckets_es_un_error_explicito():
    # Given una rejilla cualquiera
    buckets = _dias("2026-03-01", 2)
    # When se pide una media movil imposible
    with pytest.raises(ValueError):
        series.reducir(buckets, {}, media_movil=0)


def test_el_resumen_toma_los_extremos_por_bucket_no_las_medias():
    # Given dos dias cuyo promedio esconde un pico de 900
    buckets = _dias("2026-03-01", 2)
    agregados = {buckets[0].strftime(FORMATO): _agregado(100.0, n=10, minimo=0, maximo=900),
                 buckets[1].strftime(FORMATO): _agregado(200.0, n=10, minimo=5, maximo=400)}
    # When se resume
    r = series._resumen(series.reducir(buckets, agregados)["puntos"], "W")
    # Then el maximo es el pico real, no el promedio del dia en que ocurrio
    assert r["maximo"]["valor"] == pytest.approx(900.0)
    assert r["minimo"]["valor"] == pytest.approx(0.0)
    assert r["media"]["valor"] == pytest.approx(150.0)


def test_el_resumen_sin_lecturas_devuelve_None_y_no_cero():
    # Given una ventana sin ni una lectura
    buckets = _dias("2026-03-01", 2)
    # When se resume
    r = series._resumen(series.reducir(buckets, {})["puntos"], "W")
    # Then el valor es None con motivo: un cero se leeria como "no genero nada"
    assert r["media"]["valor"] is None
    assert r["media"]["n"] == 0
    assert r["media"]["motivo"] == "sin_lecturas"
