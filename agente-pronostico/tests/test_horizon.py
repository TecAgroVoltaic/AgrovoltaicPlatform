"""Tests del parseo determinista del horizonte (nlu.horizon.parse_horizon)."""
from datetime import datetime

import pytest

from pronostico.nlu.horizon import parse_horizon

AHORA = datetime(2026, 6, 30, 12, 0, 0)


@pytest.mark.parametrize("texto, segundos", [
    ("media hora", 1800),
    ("en media hora", 1800),
    ("una hora", 3600),
    ("en 1 hora", 3600),
    ("en una hora", 3600),
    ("1 hora", 3600),
    ("2 horas", 7200),
    ("dos horas", 7200),
    ("en 2 horas", 7200),
    ("tres horas", 10800),
    ("hora y media", 5400),
    ("una hora y media", 5400),
    ("90 minutos", 5400),
    ("90 min", 5400),
    ("en 45 min", 2700),
    ("30 minutos", 1800),
    ("un cuarto de hora", 900),
    ("cuarto de hora", 900),
    ("2 horas y media", 9000),
    ("1 hora y 30 minutos", 5400),
])
def test_expresiones_validas(texto, segundos):
    assert parse_horizon(texto, AHORA) == segundos


def test_ahora_opcional():
    # `ahora` no es necesario para expresiones de duracion.
    assert parse_horizon("2 horas") == 7200


@pytest.mark.parametrize("texto", [
    "",
    "   ",
    "pronto",
    "en un rato",
    "mas tarde",
    "en 2",          # numero sin unidad -> ambiguo
    "media",         # sin "hora" -> ambiguo
    "cuando sea",
])
def test_ambiguos_lanzan_valueerror(texto):
    with pytest.raises(ValueError):
        parse_horizon(texto, AHORA)


def test_devuelve_int():
    assert isinstance(parse_horizon("una hora", AHORA), int)


@pytest.mark.parametrize("texto", [
    "una hora o dos horas",       # dos expresiones de HORA que compiten
    "en 1 hora, mejor 2 horas",   # correccion sobre la marcha
    "30 min o 45 min",            # dos expresiones de MIN que compiten
])
def test_varias_expresiones_misma_unidad_son_ambiguas(texto):
    # Antes SUMABAN (10800 = 3h para el primero); como parse_horizon pisa la
    # conversion del LLM, sumar produciria un horizonte falso. Ahora es ambiguo.
    with pytest.raises(ValueError):
        parse_horizon(texto, AHORA)


@pytest.mark.parametrize("texto, segundos", [
    ("1 hora 30 min", 5400),      # compuesto legitimo: 1 unidad de c/u -> se suma
    ("2 horas y media", 9000),    # compuesto especial -> intacto
])
def test_compuesto_legitimo_sigue_sumando(texto, segundos):
    assert parse_horizon(texto, AHORA) == segundos
