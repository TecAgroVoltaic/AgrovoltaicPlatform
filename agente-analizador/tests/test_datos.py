"""
Tests de la allowlist de relaciones — el borde de seguridad del peek de datos.

Los nombres de tabla/columna se interpolan en el SQL (no pueden ir como %s), así
que la allowlist es lo único que separa esto de una inyección. Estos tests fijan
que un nombre fuera de la lista NUNCA llegue a construir una consulta.
Estructura Given-When-Then.
"""
import pytest

from analizador import datos, periodo


def test_relacion_conocida_resuelve():
    # Given/When
    rel, tcol = datos._rel("electrico_crudo")

    # Then
    assert rel == "monitoreo_sc_electrico" and tcol == "timestamp"


def test_relacion_desconocida_corta_antes_de_tocar_la_db():
    # Given/When/Then: ValueError -> 400 en el borde HTTP, sin SQL
    with pytest.raises(ValueError, match="relacion desconocida"):
        datos._rel("no_existe")


@pytest.mark.parametrize("malicioso", [
    "monitoreo_sc_electrico; DROP TABLE users",
    "users",
    "pg_shadow",
    "'; SELECT 1 --",
])
def test_nombres_maliciosos_no_pasan_la_allowlist(malicioso):
    # Given/When/Then: solo se acepta lo que está en el diccionario, no lo que "parece" válido
    with pytest.raises(ValueError):
        datos._rel(malicioso)


def test_la_allowlist_no_expone_relaciones_de_sistema():
    # Given/When/Then: nada de catálogos internos ni auth de Supabase
    for rel, _ in datos.RELACIONES.values():
        assert not rel.startswith("pg_")
        assert rel not in {"users", "identities", "sessions"}


def test_periodo_abierto_por_defecto():
    # Given/When: sin filtros
    desde, hasta = periodo.rango()

    # Then: límites abiertos que cubren todo el histórico
    assert desde < "2001-01-01" and hasta > "2099-01-01"


def test_periodo_respeta_lo_que_se_le_pasa():
    # Given/When
    assert periodo.rango("2026-01-01", "2026-02-01") == ("2026-01-01", "2026-02-01")
