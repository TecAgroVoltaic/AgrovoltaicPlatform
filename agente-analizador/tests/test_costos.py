"""
Tests de la tarifa de LLM — aritmética pura, sin red.

Importa porque de este número sale el tope de gasto: si la tarifa está mal, el
presupuesto protege mal. Estructura Given-When-Then.
"""
import json

import pytest

from analizador import costos

UN_MILLON = 1_000_000


def test_costo_de_un_millon_de_tokens_es_la_tarifa():
    # Given: 1M de input y 1M de output en Haiku ($1 / $5)
    usage = {"input_tokens": UN_MILLON, "output_tokens": UN_MILLON}

    # When
    r = costos.costo(usage, "claude-haiku-4-5")

    # Then
    assert r["usd_input"] == 1.0
    assert r["usd_output"] == 5.0
    assert r["usd_total"] == 6.0


def test_alias_con_sufijo_de_fecha_resuelve_por_prefijo():
    # Given/When: el modelo real trae sufijo de versión
    par = costos.tarifa("claude-haiku-4-5-20251001")

    # Then: no queda sin tarifar por un sufijo
    assert par == (1.00, 5.00)


def test_modelo_sin_tarifa_no_rompe():
    # Given/When
    r = costos.costo({"input_tokens": 10, "output_tokens": 10}, "modelo-inventado")

    # Then: None + nota, nunca una excepción (un modelo nuevo no debe tumbar el agente)
    assert r["usd_total"] is None
    assert "PRECIOS_JSON" in r["nota"]


def test_el_entorno_puede_sobrescribir_la_tarifa(monkeypatch):
    # Given: tarifa nueva por env
    monkeypatch.setenv("PRECIOS_JSON", json.dumps({"claude-haiku-4-5": [2.0, 10.0]}))

    # When
    r = costos.costo({"input_tokens": UN_MILLON, "output_tokens": 0}, "claude-haiku-4-5")

    # Then: gana el env (no hay que releasear para corregir un precio)
    assert r["usd_input"] == 2.0


def test_precios_json_malformado_cae_a_los_defaults(monkeypatch):
    # Given: env corrupto
    monkeypatch.setenv("PRECIOS_JSON", "{esto no es json")

    # When/Then: no rompe, usa los defaults
    assert costos.tarifa("claude-haiku-4-5") == (1.00, 5.00)


@pytest.mark.parametrize("usage", [None, {}, {"input_tokens": None}])
def test_usage_vacio_o_nulo_da_cero(usage):
    # Given/When/Then: una traza sin usage no debe explotar
    r = costos.costo(usage, "claude-haiku-4-5")
    assert r["usd_total"] == 0.0
