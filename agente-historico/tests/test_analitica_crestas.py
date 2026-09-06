"""Pruebas del grafico de crestas (Fig. 7). Sin base de datos: se prueba la DECISION.

Lo que importa verificar aca no es que scipy sepa estimar una densidad, sino que
los grupos que NO dan densidad (uno solo, un sensor pegado en un valor, ninguna
lectura) salgan igual con su motivo en vez de reventar o desaparecer del grafico,
y que la rejilla sea comun a todos, que es lo unico que hace comparables las crestas.
"""
from __future__ import annotations

import pytest

from historico.analitica import correlacion, crestas, ventana
from historico.analitica.crestas import (
    INFERIOR,
    MUESTRAS_INSUFICIENTES,
    SUPERIOR,
    VARIANZA_NULA,
    reducir,
)
from historico.analitica.resultado import SIN_LECTURAS

# Dos grupos separados, como los dos arreglos: mismo orden de magnitud, distinta
# posicion. Deterministas a proposito (un test flaky es un defecto).
BAJO = [float(v) for v in (10, 11, 12, 12, 13, 13, 14, 15, 15, 16)]
ALTO = [float(v) for v in (20, 21, 22, 22, 23, 23, 24, 25, 25, 26)]


def _muestras(**grupos) -> dict:
    return {clave: (valores, len(valores)) for clave, valores in grupos.items()}


def test_cada_grupo_trae_su_densidad_sobre_la_rejilla_comun():
    # Given dos grupos con dispersion
    # When se reducen
    r = reducir(_muestras(bajo=BAJO, alto=ALTO), puntos_rejilla=64)

    # Then hay una sola rejilla y cada densidad esta evaluada sobre ELLA
    assert len(r["rejilla"]) == 64
    for grupo in r["grupos"]:
        assert grupo["motivo"] is None
        assert len(grupo["densidad"]) == 64
        assert len(grupo["prob_cola"]) == 64


def test_la_rejilla_cubre_a_todos_los_grupos():
    # Given un grupo desplazado respecto del otro
    # When se reducen juntos
    r = reducir(_muestras(bajo=BAJO, alto=ALTO), puntos_rejilla=64)

    # Then la rejilla se estira hasta cubrir los dos: sin eso las crestas se
    # dibujarian sobre ejes distintos y compararlas seria un espejismo
    assert r["rejilla"][0] < min(BAJO)
    assert r["rejilla"][-1] > max(ALTO)


def test_la_probabilidad_de_cola_superior_baja_a_lo_largo_de_la_rejilla():
    # Given un grupo con dispersion
    # When se pide la cola superior
    r = reducir(_muestras(bajo=BAJO), puntos_rejilla=64, cola=SUPERIOR)
    cola = r["grupos"][0]["prob_cola"]

    # Then P(X >= g) nunca sube, se mueve entre 0 y 1, y la rejilla cubre el grueso
    # de la distribucion (si no, la cresta se dibujaria cortada)
    assert all(a >= b - 1e-9 for a, b in zip(cola, cola[1:]))
    assert all(0.0 <= p <= 1.0 for p in cola)
    assert cola[0] > 0.9 and cola[-1] < 0.1


def test_la_cola_inferior_es_la_complementaria():
    # Given el mismo grupo y el mismo umbral
    # When se pide cada cola
    arriba = reducir(_muestras(bajo=BAJO), umbral=13.0, cola=SUPERIOR)
    abajo = reducir(_muestras(bajo=BAJO), umbral=13.0, cola=INFERIOR)

    # Then las dos masas suman uno: es la misma densidad partida por el umbral
    suma = (arriba["grupos"][0]["prob_sobre_umbral"]
            + abajo["grupos"][0]["prob_sobre_umbral"])
    assert suma == pytest.approx(1.0, abs=1e-3)


def test_un_grupo_de_una_sola_muestra_no_revienta_el_kde():
    # Given un canal que solo grabo una lectura (gaussian_kde no puede con eso)
    # When se reduce junto a uno sano
    r = reducir(_muestras(bajo=BAJO, solitario=[42.0]))
    solitario = next(g for g in r["grupos"] if g["grupo"] == "solitario")

    # Then el grupo sigue en la respuesta, sin densidad y con su motivo
    assert solitario["densidad"] is None
    assert solitario["motivo"] == MUESTRAS_INSUFICIENTES
    assert solitario["n"] == 1


def test_un_sensor_pegado_en_un_valor_se_reporta_sin_densidad():
    # Given un canal en flatline (varianza cero: la matriz del KDE es singular)
    # When se reduce
    r = reducir(_muestras(bajo=BAJO, pegado=[7.0] * 20))
    pegado = next(g for g in r["grupos"] if g["grupo"] == "pegado")

    # Then no hay curva pero SI estadisticos: el flatline es justo lo que hay que ver
    assert pegado["motivo"] == VARIANZA_NULA
    assert pegado["densidad"] is None
    assert pegado["estadisticos"]["mediana"] == 7.0


def test_un_grupo_sin_lecturas_no_desaparece_del_grafico():
    # Given un grupo que no tiene ni una lectura en la ventana
    # When se reduce
    r = reducir(_muestras(bajo=BAJO, vacio=[]))
    vacio = next(g for g in r["grupos"] if g["grupo"] == "vacio")

    # Then aparece con n = 0 y motivo, que no es lo mismo que una cresta plana
    assert vacio["n"] == 0
    assert vacio["motivo"] == SIN_LECTURAS


def test_una_cola_desconocida_es_un_error_del_que_pregunta():
    # Given una cola que no existe (el parametro lo puede elegir el LLM)
    # When se reduce
    # Then falla en el borde en vez de dibujar cualquier cosa
    with pytest.raises(ValueError):
        reducir(_muestras(bajo=BAJO), cola="lateral")


def test_el_sensor_que_no_existia_en_la_ventana_no_se_consulta(monkeypatch):
    # Given los dos piranometros comparados sobre marzo 2026: el SP722 solo grabo
    # dieciocho dias de mayo 2026, el otro lleva desde julio 2025
    consultas = []

    def falsa_query(sql, params=()):
        consultas.append(params)
        return [{"valor": float(v), "total": 40} for v in range(40)]

    monkeypatch.setattr(crestas.db, "query", falsa_query)
    monkeypatch.setattr(correlacion.contexto, "confianza",
                        lambda *_a, **_k: {"advertencia": None})

    # When se piden las dos crestas
    r = crestas.densidades(ventana.crear("2026-03-01", "2026-04-01"),
                           ["irradiancia_incidente_wm2", "irradiancia_incidente_sp722_wm2"])
    sp722 = next(g for g in r["grupos"] if g["grupo"] == "irradiancia_incidente_sp722_wm2")
    otro = next(g for g in r["grupos"] if g["grupo"] == "irradiancia_incidente_wm2")

    # Then solo se consulto el que si existia, y el otro dice entre que fechas
    # habria dato en vez de aparecer como una cresta plana
    assert len(consultas) == 1
    assert sp722["motivo"] == "fuera_de_cobertura"
    assert "2026-05-11" in sp722["fuera_de_cobertura"]
    assert sp722["densidad"] is None
    assert otro["densidad"] is not None and otro["fuera_de_cobertura"] is None
