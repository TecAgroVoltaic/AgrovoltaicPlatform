"""Pruebas del diagrama de carpeta (Fig. 8 bis): matriz dia x hora local.

Dos cosas se prueban aca por encima de todo, porque son las que convierten el
grafico en una mentira si se resuelven mal:

  1. Que una celda SIN dato no se confunda con una celda en CERO. De noche la
     generacion es cero de verdad; un dia que el logger no grabo no tiene dato.
  2. Que no haya conversion de zona horaria en el SQL. Los timestamps son hora
     local etiquetada `+00`: un `AT TIME ZONE` corre seis horas todo el heatmap y
     nadie lo nota mirando el grafico, porque sigue teniendo forma de dia.
"""
from __future__ import annotations

import inspect
from datetime import datetime, timedelta

import pytest

from historico.analitica import carpeta, catalogo

DIA_UNO = datetime(2026, 3, 1)
TRES_DIAS = [DIA_UNO + timedelta(days=i) for i in range(3)]


def _celda(valor, n=12) -> dict:
    return {"valor": valor, "n": n}


# ── La regla que no se puede romper ──────────────────────────────────────────

def test_el_sql_no_convierte_zona_horaria():
    # Given la consulta que saca la hora del dia de cada lectura
    consulta = inspect.getsource(carpeta._celdas).lower()
    # Then no aparece ninguna conversion de zona: extract(hour) YA es hora local
    assert "at time zone" not in consulta
    assert "extract(hour from" in consulta


def test_la_celda_en_wh_pesa_el_salto_de_cada_lectura_y_no_cuenta_filas():
    # Given la misma consulta, en su modo integral
    consulta = inspect.getsource(carpeta._celdas)
    # Then multiplica por los segundos que cubre la lectura (salto real acotado,
    # ver `fuente.lecturas_pesadas`): sumar filas daria Wh distintos segun la epoca
    assert "sum(valor * segundos)" in consulta
    assert "lecturas_pesadas" in consulta


# ── Celda vacia contra celda en cero ─────────────────────────────────────────

def test_una_celda_en_cero_no_se_confunde_con_una_celda_sin_dato():
    # Given un dia con generacion cero medida a las 2 y sin ninguna lectura a las 3
    celdas = {("2026-03-01", 2): _celda(0.0, n=12)}
    # When se arma la matriz
    m = carpeta.reducir([DIA_UNO], celdas, "W")
    # Then el cero medido es 0.0 con lecturas, y el hueco es None con cero lecturas
    assert m["matriz"][0][2] == 0.0 and m["conteo"][0][2] == 12
    assert m["matriz"][0][3] is None and m["conteo"][0][3] == 0


def test_el_cero_medido_cuenta_como_celda_con_dato():
    # Given una sola celda, medida y en cero
    m = carpeta.reducir([DIA_UNO], {("2026-03-01", 2): _celda(0.0)}, "W")
    # Then la carpeta tiene una celda con dato, no cero
    assert m["celdas_con_dato"] == 1
    assert m["rango"]["minimo"]["valor"] == 0.0


# ── Forma de la matriz ───────────────────────────────────────────────────────

def test_la_matriz_tiene_un_renglon_por_dia_y_24_columnas():
    # Given tres dias de ventana
    m = carpeta.reducir(TRES_DIAS, {}, "W")
    # Then la matriz cubre las 24 horas locales de cada uno
    assert len(m["matriz"]) == 3
    assert all(len(fila) == carpeta.HORAS_DEL_DIA for fila in m["matriz"])
    assert m["horas"] == list(range(24))
    assert m["celdas_totales"] == 72


def test_una_ventana_de_un_dia_da_un_solo_renglon():
    # Given una ventana de un unico dia con datos al mediodia
    m = carpeta.reducir([DIA_UNO], {("2026-03-01", 12): _celda(1200.0)}, "W")
    # Then hay un renglon y el pico esta en la hora 12
    assert m["dias"] == ["2026-03-01"]
    assert m["matriz"][0][12] == 1200.0


def test_un_dia_entero_sin_registro_queda_en_blanco_no_en_cero():
    # Given tres dias con datos solo en el primero
    celdas = {("2026-03-01", h): _celda(500.0) for h in range(6, 18)}
    # When se arma la matriz
    m = carpeta.reducir(TRES_DIAS, celdas, "W")
    # Then los dos dias caidos son una fila de None, distinguible de una noche
    assert set(m["matriz"][1]) == {None}
    assert sum(m["conteo"][1]) == 0


def test_una_carpeta_sin_una_sola_lectura_no_inventa_escala_de_color():
    # Given una ventana sin datos
    m = carpeta.reducir(TRES_DIAS, {}, "W")
    # Then el rango es None con motivo: un rango 0-0 pintaria todo del mismo color
    assert m["rango"]["minimo"]["valor"] is None
    assert m["rango"]["maximo"]["n"] == 0
    assert m["celdas_con_dato"] == 0


def test_el_rango_para_la_escala_sale_de_las_celdas_con_dato():
    # Given celdas de 0, 500 y 1200 W
    celdas = {("2026-03-01", 5): _celda(0.0), ("2026-03-01", 9): _celda(500.0),
              ("2026-03-02", 12): _celda(1200.0)}
    # When se arma la matriz
    m = carpeta.reducir(TRES_DIAS, celdas, "W")
    # Then la escala va de 0 a 1200 y la unidad viaja con ella
    assert m["rango"]["minimo"]["valor"] == 0.0
    assert m["rango"]["maximo"]["valor"] == 1200.0
    assert m["rango"]["maximo"]["unidad"] == "W"


# ── Que agregaciones tienen sentido ──────────────────────────────────────────

def test_una_agregacion_inexistente_se_rechaza():
    # Given una variable valida y una agregacion inventada
    var = catalogo.obtener("potencia_pv1_w")
    # When se valida
    with pytest.raises(ValueError, match="agregacion"):
        carpeta.unidad_de(var, "mediana")


def test_no_se_integra_en_el_tiempo_una_temperatura():
    # Given la temperatura de un modulo, que en grados-hora no es ninguna magnitud
    var = catalogo.obtener("temp_inclinado")
    # When se pide integrarla
    with pytest.raises(ValueError, match="magnitud"):
        carpeta.unidad_de(var, carpeta.INTEGRAL)


def test_integrar_una_potencia_da_watt_hora():
    # Given la potencia del arreglo inclinado
    var = catalogo.obtener("potencia_pv1_w")
    # When se valida la integral
    unidad = carpeta.unidad_de(var, carpeta.INTEGRAL)
    # Then la celda queda en Wh, no en W
    assert unidad == "Wh"


def test_la_poa_modelada_tambien_se_puede_integrar():
    # Given la POA, que vive en una tabla sin `intervalo_original_seg`
    var = catalogo.obtener("poa_pv1_wm2")
    # When se valida la integral
    # Then se puede: el peso sale del salto real entre registros, no de
    # una columna de metadato que esa tabla no tiene
    assert carpeta.unidad_de(var, carpeta.INTEGRAL) == "Wh/m2"
