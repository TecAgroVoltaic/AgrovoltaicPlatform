"""Pruebas de los dias con datos que alimentan el calendario de la consola.

Sin base: `componer` es puro y el camino completo se prueba reemplazando
`db.query`. Prioridad a lo que rompe el calendario: la union de las dos fuentes,
el orden, una tabla vacia y el `hasta` exclusivo (incluido el cruce de año).
"""
from __future__ import annotations

from datetime import date

from historico import db
from historico.analitica import cobertura_dias
from historico.analitica.cobertura_dias import ELECTRICO, RADIACION


def test_dias_es_la_union_sin_repetidos_de_las_dos_fuentes():
    # Given un dia solo electrico, uno solo de radiacion y uno compartido
    electrico = ["2025-10-01", "2025-10-02"]
    radiacion = ["2025-10-02", "2025-10-05"]

    # When se compone la respuesta
    salida = cobertura_dias.componer(electrico, radiacion)

    # Then `dias` los tiene a los tres, una vez cada uno, y cada fuente queda aparte
    assert salida["dias"] == ["2025-10-01", "2025-10-02", "2025-10-05"]
    assert salida["n_dias"] == 3
    assert salida["fuentes"] == {ELECTRICO: electrico, RADIACION: radiacion}


def test_las_listas_salen_en_orden_ascendente_aunque_lleguen_desordenadas():
    # Given fechas desordenadas y mezclando `date` con texto ISO
    electrico = [date(2026, 8, 31), "2024-11-10"]
    radiacion = ["2025-05-20", date(2024, 12, 25)]

    # When se compone la respuesta
    salida = cobertura_dias.componer(electrico, radiacion)

    # Then todo sale como ISO ascendente
    assert salida["dias"] == ["2024-11-10", "2024-12-25", "2025-05-20", "2026-08-31"]
    assert salida["fuentes"][ELECTRICO] == ["2024-11-10", "2026-08-31"]
    assert salida["fuentes"][RADIACION] == ["2024-12-25", "2025-05-20"]


def test_hasta_es_exclusivo_y_cruza_el_fin_de_año():
    # Given el ultimo dia con datos es el 31 de diciembre
    salida = cobertura_dias.componer(["2024-11-10", "2024-12-31"], [])

    # Then `desde` es el primer dia y `hasta` el dia siguiente al ultimo
    assert salida["desde"] == "2024-11-10"
    assert salida["hasta"] == "2025-01-01"


def test_una_tabla_vacia_deja_su_lista_vacia_y_el_rango_sale_de_la_otra():
    # Given radiacion sin ninguna fila
    salida = cobertura_dias.componer(["2026-06-02", "2026-06-03"], [])

    # Then su lista va vacia y el resto se arma con el electrico
    assert salida["fuentes"][RADIACION] == []
    assert salida["dias"] == ["2026-06-02", "2026-06-03"]
    assert (salida["desde"], salida["hasta"]) == ("2026-06-02", "2026-06-04")


def test_sin_ningun_dato_no_inventa_un_rango():
    # When las dos tablas estan vacias
    salida = cobertura_dias.componer([], [])

    # Then no hay rango y el conteo es cero
    assert salida == {"desde": None, "hasta": None, "n_dias": 0, "dias": [],
                      "fuentes": {ELECTRICO: [], RADIACION: []}}


def test_calcular_consulta_las_dos_tablas_crudas_y_arma_la_respuesta(monkeypatch):
    # Given una base que responde por tabla (como lo deja `db.query`: fechas ISO)
    respuestas = {"monitoreo_sc_electrico": [{"fecha": "2025-10-01"}],
                  "radiacion_sc_15s": [{"fecha": "2025-10-01"}, {"fecha": "2025-10-03"}]}
    consultadas: list[str] = []

    def query_falsa(sql: str, params: tuple = ()) -> list[dict]:
        tabla = next(t for t in respuestas if t in sql)
        consultadas.append(tabla)
        return respuestas[tabla]

    monkeypatch.setattr(db, "query", query_falsa)

    # When se pide el endpoint por su funcion
    salida = cobertura_dias.calcular()

    # Then se leyeron ambas tablas crudas y la union es correcta
    assert sorted(consultadas) == ["monitoreo_sc_electrico", "radiacion_sc_15s"]
    assert salida["dias"] == ["2025-10-01", "2025-10-03"]
    assert salida["hasta"] == "2025-10-04"
