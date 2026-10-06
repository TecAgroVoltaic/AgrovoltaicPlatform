"""
Tests de la tool `exportar_datos`: la ficha de descarga del contrato §2, sin DB.

Se reemplazan las dos lecturas de la base de `exportar` (columnas reales y conteo);
lo que se verifica es la traduccion de la entrada de la tool a la URL del MISMO
`GET /datos/exportar` que usa la vista Descargas, el tope del .mat y que la tool
nunca genera el archivo. Estructura Given-When-Then.
"""
from urllib.parse import parse_qs, urlsplit

import pytest

from historico import exportar
from historico.tools import exportar_datos

COLUMNAS = [exportar.Columna("timestamp", "timestamp", "timestamp with time zone"),
            exportar.Columna("irradiancia_incidente_wm2", "irradiancia_incidente_wm2",
                             "double precision"),
            exportar.Columna("kt_star", "kt_star", "double precision")]


@pytest.fixture
def base_falsa(monkeypatch):
    """Columnas fijas y un conteo configurable; registra lo que recibio `estimar`."""
    estado = {"filas": 8640, "pedido": None}
    monkeypatch.setattr(exportar, "_columnas", lambda ds: list(COLUMNAS))

    def estimar(tabla, desde, hasta, fuente="supabase", filtros=None, paso=None):
        estado["pedido"] = (tabla, desde, hasta, fuente, filtros, paso)
        return {"filas": estado["filas"], "cota": False, "primero": "2026-08-01 00:00:00",
                "ultimo": "2026-08-31 23:59:45", "desde": desde, "hasta": hasta}

    monkeypatch.setattr(exportar, "estimar", estimar)

    def no_exportar(*a, **k):
        raise AssertionError("la tool no debe generar el archivo")

    monkeypatch.setattr(exportar, "exportar", no_exportar)
    return estado


def test_la_ficha_apunta_al_endpoint_de_descargas(base_falsa):
    # Given: agosto pedido con `hasta` exclusivo, como todas las tools
    # When
    salida = exportar_datos.run("radiacion_calibrada", "csv", "2026-08-01", "2026-09-01",
                                columnas=["irradiancia_incidente_wm2"])

    # Then: el endpoint recibe el 31 como ultimo dia INCLUSIVO
    descarga = salida["_descarga"]
    assert base_falsa["pedido"][2] == "2026-08-31"
    assert descarga["columnas"] == ["timestamp", "irradiancia_incidente_wm2"]
    url = urlsplit(descarga["url"])
    assert url.path == "/datos/exportar"
    assert parse_qs(url.query) == {
        "tabla": ["radiacion_calibrada"], "formato": ["csv"], "desde": ["2026-08-01"],
        "hasta": ["2026-08-31"], "columnas": ["timestamp,irradiancia_incidente_wm2"]}
    assert descarga["nombre_sugerido"] == "radiacion_calibrada_2026-08-01_2026-08-31.csv"
    assert descarga["filas_estimadas"] == 8640 and descarga["version"] == 1
    assert salida["resumen"]["filas_estimadas"] == 8640


def test_sin_columnas_la_url_no_las_lista_pero_la_ficha_si(base_falsa):
    # Given/When
    salida = exportar_datos.run("radiacion_calibrada", "dat", "2026-08-01", "2026-08-02")

    # Then: el endpoint exporta todas; la ficha dice cuales son
    assert "columnas" not in parse_qs(urlsplit(salida["_descarga"]["url"]).query)
    assert salida["resumen"]["columnas"] == [c.nombre for c in COLUMNAS]


def test_mat_demasiado_grande_no_ofrece_descarga(base_falsa):
    # Given: mas filas de las que .mat arma en memoria
    base_falsa["filas"] = exportar.MAX_FILAS_MAT + 1

    # When
    salida = exportar_datos.run("radiacion_calibrada", "mat", "2025-01-01", "2026-09-01")

    # Then: resumen con el error del contrato y SIN `_descarga`
    assert "_descarga" not in salida
    assert salida["resumen"]["error"] == exportar_datos.ERROR_MAT


def test_mat_justo_en_el_tope_si_se_ofrece(base_falsa):
    base_falsa["filas"] = exportar.MAX_FILAS_MAT
    salida = exportar_datos.run("radiacion_calibrada", "mat", "2026-08-01", "2026-09-01")
    assert salida["_descarga"]["formato"] == "mat"


@pytest.mark.parametrize("parametros, mensaje", [
    ({"tabla": "no_existe"}, "relacion desconocida"),
    ({"tabla": "radiacion_calibrada", "formato": "xlsx"}, "formato invalido"),
    ({"tabla": "radiacion_calibrada", "columnas": ["inventada"]}, "columnas desconocidas"),
    ({"tabla": "radiacion_calibrada", "paso": 60}, "no admite 'paso'"),
])
def test_parametros_invalidos_se_rechazan_con_las_reglas_del_endpoint(base_falsa, parametros,
                                                                     mensaje):
    with pytest.raises(ValueError, match=mensaje):
        exportar_datos.run(**parametros)


@pytest.mark.parametrize("hasta, esperado", [
    ("2026-09-01", "2026-08-31"),
    ("2026-09-01T12:00", "2026-09-01T12:00"),   # con hora ya es exclusivo en el endpoint
    (None, None),
])
def test_hasta_exclusivo_se_traduce_al_del_endpoint(hasta, esperado):
    assert exportar_datos.hasta_del_endpoint(hasta) == esperado
