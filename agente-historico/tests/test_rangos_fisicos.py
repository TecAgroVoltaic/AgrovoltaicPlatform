"""Los rangos fisicos viven en TRES sitios, y estas pruebas los amarran juntos.

El rango de una variable electrica esta escrito en tres lugares distintos:

  1. `config.RANGOS`, que el barrido interpola dentro del SQL de `fuera_de_rango`;
  2. `analitica.catalogo` (`minimo`/`maximo`), que lee la validez fisica;
  3. la vista `v_sc_electrico_corregido`, en
     `sql/003_electrico_sin_falsos_positivos.sql`.

Y esta medido que olvidar cualquiera de los tres **falla en silencio**: si se
arregla la vista y no `config`, el barrido sigue escribiendo 7.954
`fuera_de_rango` graves y el veredicto no se mueve; si se arregla `config` y no
la vista, el analisis sigue ciego a los apagones del inversor. Ninguno de los dos
errores revienta nada. `test_los_tres_sitios_coinciden` es el que importa: es el
unico que puede ver esa desincronizacion.

Lo que se prueba, en dos frentes:

  * **El 0 de las variables AC dejo de ser una violacion de rango** (Leo
    Cardinale, R3, 2026-08-30). Un 0 V o 0 Hz es el inversor sin acoplarse: dato
    BUENO sobre un equipo MALO. Un 400 V si sigue siendo imposible.
  * **La firma de contaminacion marca las filas del piranometro mezcladas y solo
    esas.** Se parsea del SQL de la migracion y se evalua con la logica TERNARIA
    de SQL, que es donde estuvo el error que ya nos mordio una vez.

Las pruebas leen el SQL como TEXTO a proposito: la base es de solo lectura y la
migracion todavia no esta aplicada, asi que el archivo es la fuente de verdad de
lo que la vista va a hacer.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from historico import config
from historico.analitica import catalogo

FUENTE = "monitoreo_sc_electrico"
MIGRACION = (Path(__file__).resolve().parents[1]
             / "sql" / "003_electrico_sin_falsos_positivos.sql")
SQL = MIGRACION.read_text(encoding="utf-8")

COLUMNAS_ENERGIA = ("energia_hoy_wh", "energia_total_wh",
                    "energia_pv1_wh", "energia_pv2_wh")
BANDERA_FIRMA = "fila_de_piranometro"


# ── Lectura del SQL: rangos, firma y comentarios ──────────────────────────────
def _rango_en_sql(columna: str) -> tuple[float, float]:
    """Los limites del `CASE` de esa columna en la vista. Falla si no esta.

    Se busca el par `col < LO OR col > HI`; las columnas de temperatura llevan
    ademas un `= 85.0` delante (el DS18B20 desconectado) que no es un limite.
    """
    patron = rf"{columna}\s*<\s*(-?[\d.]+)\s+OR\s+{columna}\s*>\s*(-?[\d.]+)"
    hallado = re.search(patron, SQL)
    assert hallado, f"la vista de {MIGRACION.name} no acota {columna}"
    return float(hallado.group(1)), float(hallado.group(2))


def _rango_en_barrido(columna: str) -> tuple[float, float]:
    """Los limites que el barrido REALMENTE interpola en su SQL de deteccion.

    Se leen del SQL generado y no de `config.RANGOS` a proposito: lo que marca un
    dia como grave es esa cadena, no el diccionario. La importacion es perezosa
    para que un cambio en `barrido` no tumbe el modulo entero de pruebas.
    """
    from historico.calidad.barrido import _sql_por_columna

    generado = _sql_por_columna(FUENTE)
    patron = rf"\b{columna}\s*<\s*(-?[\d.]+)\s+OR\s+{columna}\s*>\s*(-?[\d.]+)"
    hallado = re.search(patron, generado)
    assert hallado, f"el barrido no genera predicado de rango para {columna}"
    return float(hallado.group(1)), float(hallado.group(2))


def _clausulas_de_la_firma() -> list[tuple[str, str, float]]:
    """(columna, operador, umbral) de cada comparacion de la firma del SQL."""
    bloque = re.search(r"-- FIRMA:INICIO(.*?)-- FIRMA:FIN", SQL, re.S)
    assert bloque, "la firma de contaminacion perdio sus marcadores FIRMA:INICIO/FIN"
    return [(col, op, float(num))
            for col, op, num in re.findall(r"m\.(\w+)\s*([<>])\s*(-?[\d.]+)",
                                           bloque.group(1))]


def _fuera_de_rango(columna: str, valor: float) -> bool:
    """Si el predicado del barrido marcaria ese valor. Es la pregunta real."""
    lo, hi = _rango_en_barrido(columna)
    return valor < lo or valor > hi


def _firma_marca(fila: dict) -> bool:
    """Evalua la firma con la logica TERNARIA de SQL, cerrada con `IS TRUE`.

    Un NULL en una comparacion da NULL, no falso. El `OR` ternario da verdadero
    si alguna comparacion lo es, y NULL o falso en cualquier otro caso. Como el
    CTE de la migracion cierra la firma con `IS TRUE`, ese NULL termina en falso
    y LA FILA SOBREVIVE: por eso una columna en NULL nunca marca, y por eso solo
    hace falta buscar una comparacion verdadera.
    """
    for columna, operador, umbral in _clausulas_de_la_firma():
        valor = fila.get(columna)
        if valor is None:
            continue
        if (valor > umbral) if operador == ">" else (valor < umbral):
            return True
    return False


# ── Filas de referencia, con valores REALES de produccion ─────────────────────
FILA_SANA = {                     # 2026-04-29 11:30, mediodia normal
    "potencia_pv1_w": 523.765, "potencia_pv2_w": 262.56,
    "voltaje_pv1_v": 154.955, "voltaje_pv2_v": 150.75,
    "corriente_pv1_a": 3.405, "corriente_pv2_a": 1.72,
    "potencia_total_wac": 760.295, "temperatura_inversor_c": 42.81,
    "energia_hoy_wh": 6.825, "energia_total_wh": 2493.125,
    "energia_pv1_wh": 3.955, "energia_pv2_wh": 3.2,
    "voltaje_vac": 213.98, "frecuencia_hz": 60.004,
}
FILA_SUCIA_2025_10_07 = {         # la fila del maximo imposible de 39.328.367
    "potencia_pv1_w": 26503162.8, "potencia_pv2_w": 0.0,
    "voltaje_pv1_v": 0.0, "voltaje_pv2_v": 0.0,
    "corriente_pv1_a": 0.0, "corriente_pv2_a": 0.0,
    "potencia_total_wac": 118633.9, "temperatura_inversor_c": 291.1,
    "energia_hoy_wh": 671.1, "energia_total_wh": 39328367.1,
    "energia_pv1_wh": 203194.6,
}
FILA_SUCIA_2026_03_09 = {         # el ultimo registro del dia, 137,25 kWh
    "potencia_pv1_w": 0.0, "potencia_pv2_w": 3.03,
    "voltaje_pv1_v": 134.715, "voltaje_pv2_v": 0.0,
    "corriente_pv1_a": 12.38, "corriente_pv2_a": 121.295,
    "potencia_total_wac": None, "temperatura_inversor_c": None,
    "energia_hoy_wh": 137.25, "energia_total_wh": None,
}
FILA_INVERSOR_CAIDO = {           # inversor sin acoplar a mediodia: dato VALIDO
    "potencia_pv1_w": 0.0, "potencia_pv2_w": 0.0,
    "voltaje_pv1_v": 175.0, "voltaje_pv2_v": 174.5,
    "corriente_pv1_a": 0.0, "corriente_pv2_a": 0.0,
    "potencia_total_wac": 0.0, "temperatura_inversor_c": 31.2,
    "energia_hoy_wh": 0.0, "voltaje_vac": 0.0, "frecuencia_hz": 0.0,
}


# ══ El 0 de las variables AC ═══════════════════════════════════════════════════
@pytest.mark.parametrize("columna", ["voltaje_vac", "frecuencia_hz"])
def test_el_cero_no_es_fuera_de_rango_para_el_detector(columna):
    """Un 0 V o 0 Hz es el inversor sin acoplarse, no un dato malo (R3)."""
    assert not _fuera_de_rango(columna, 0.0)


def test_un_voltaje_ac_imposible_sigue_siendo_fuera_de_rango():
    """La guarda no se elimino: 400 V no existe en un inversor de 230 V."""
    assert _fuera_de_rango("voltaje_vac", 400.0)
    assert _fuera_de_rango("voltaje_vac", -1.0)


def test_una_frecuencia_imposible_sigue_siendo_fuera_de_rango():
    assert _fuera_de_rango("frecuencia_hz", 120.0)
    assert _fuera_de_rango("frecuencia_hz", -1.0)


@pytest.mark.parametrize("columna", ["voltaje_vac", "frecuencia_hz"])
def test_el_cero_tambien_sobrevive_a_la_validez_fisica(columna):
    """El catalogo es el otro sitio que juzga el 0, via `bajo_minimo_fisico`."""
    variable = catalogo.obtener(columna)
    assert variable.minimo is not None and variable.minimo <= 0.0
    assert variable.maximo is not None and variable.maximo > 0.0


@pytest.mark.parametrize("columna", ["voltaje_vac", "frecuencia_hz"])
def test_el_cero_sobrevive_al_case_de_la_vista(columna):
    """El tercer sitio: la vista tampoco puede convertir el 0 en NULL."""
    lo, hi = _rango_en_sql(columna)
    assert lo <= 0.0 <= hi


@pytest.mark.parametrize("columna,maximo_historico", [("voltaje_vac", 218.84),
                                                      ("frecuencia_hz", 60.06)])
def test_el_techo_no_recorta_el_dominio_ya_observado(columna, maximo_historico):
    """El techo esta para lo imposible, no para lo que la serie ya trajo."""
    assert not _fuera_de_rango(columna, maximo_historico)


def test_la_lectura_de_un_inversor_caido_es_dato_valido_entero():
    """Ni la tension, ni la frecuencia, ni la potencia AC en 0 se descartan."""
    for columna in ("voltaje_vac", "frecuencia_hz", "potencia_total_wac"):
        assert not _fuera_de_rango(columna, FILA_INVERSOR_CAIDO[columna])


# ══ EL TEST QUE IMPORTA: los tres sitios dicen lo mismo ════════════════════════
def test_los_tres_sitios_coinciden():
    """`config.RANGOS`, el catalogo y la vista, columna por columna.

    Solo se cruza `monitoreo_sc_electrico`: en radiacion el rango del catalogo es
    el de la vista CALIBRADA (0-1500) y el de `config` el de la tabla cruda
    (-50-1500), que traen el offset nocturno sin corregir. Ahi la diferencia es
    deliberada y comparar los numeros seria comparar dos cosas distintas.
    """
    discrepancias = []
    for columna, (lo_cfg, hi_cfg) in config.RANGOS[FUENTE].items():
        lo_cat = catalogo.obtener(columna).minimo
        hi_cat = catalogo.obtener(columna).maximo
        lo_sql, hi_sql = _rango_en_sql(columna)
        if not (lo_cfg == lo_cat == lo_sql and hi_cfg == hi_cat == hi_sql):
            discrepancias.append(
                f"{columna}: config={lo_cfg, hi_cfg} catalogo={lo_cat, hi_cat} "
                f"vista={lo_sql, hi_sql}")
    assert not discrepancias, (
        "los rangos se desincronizaron entre los tres sitios (falla en silencio "
        "en produccion):\n  " + "\n  ".join(discrepancias))


def test_el_barrido_interpola_exactamente_los_rangos_de_config():
    """Cierra la cadena: `config.RANGOS` -> SQL del detector -> catalogo -> vista.

    Sin esto, `test_los_tres_sitios_coinciden` comprobaria tres declaraciones que
    coinciden entre si mientras el detector marca por otro numero.
    """
    discrepancias = [f"{col}: config={rango} SQL={_rango_en_barrido(col)}"
                     for col, rango in config.RANGOS[FUENTE].items()
                     if _rango_en_barrido(col) != rango]
    assert not discrepancias, "\n  ".join(discrepancias)


def test_la_vista_acota_todas_las_columnas_que_el_barrido_vigila():
    """Una columna vigilada sin `CASE` en la vista es un rango sin corregir."""
    faltan = [c for c in config.RANGOS[FUENTE]
              if not re.search(rf"{c}\s*<\s*-?[\d.]+\s+OR\s+{c}\s*>", SQL)]
    assert not faltan, f"la vista no acota: {', '.join(faltan)}"


# ══ La firma de contaminacion ══════════════════════════════════════════════════
def test_la_firma_no_descarta_una_fila_legitima():
    """Una fila sana de mediodia tiene que sobrevivir entera."""
    assert not _firma_marca(FILA_SANA)


def test_la_firma_no_descarta_un_inversor_caido():
    """El apagon es dato valido: la limpieza de energia no puede llevarselo."""
    assert not _firma_marca(FILA_INVERSOR_CAIDO)


def test_la_firma_no_descarta_una_fila_con_columnas_en_nulo():
    """LOGICA TERNARIA: con todo en NULL la firma da NULL, e `IS TRUE` es falso.

    Es el error que ya nos mordio, pero al reves: escrito como `NOT (firma)` la
    fila se perderia, y la base cae de 36.469 a 18.005 filas sin un solo aviso.
    """
    assert not _firma_marca({c: None for c in FILA_SANA})


def test_la_firma_marca_la_fila_del_maximo_imposible():
    """2025-10-07 07:45, la unica fila que producia los 39.328.367."""
    assert _firma_marca(FILA_SUCIA_2025_10_07)


def test_la_firma_marca_el_ultimo_registro_del_2026_03_09():
    """Entra por `corriente_pv2_a` = 121,295 A, no por su energia de 137,25."""
    assert _firma_marca(FILA_SUCIA_2026_03_09)


def test_la_firma_no_mira_las_columnas_de_energia():
    """La contaminacion es de FILA: un umbral sobre la energia borraria records."""
    miradas = {columna for columna, _, _ in _clausulas_de_la_firma()}
    assert not miradas & set(COLUMNAS_ENERGIA)


def test_la_firma_se_cierra_con_is_true_y_no_con_not():
    """`NOT (firma)` con NULLs corta la base a la mitad. Guarda de regresion.

    Se mira solo el SQL EJECUTABLE: la cabecera del archivo cita el `NOT (...)`
    justamente para advertir del error, y esa cita no tiene que disparar nada.
    """
    ejecutable = re.sub(r"--[^\n]*", "", SQL).upper()
    assert f") IS TRUE AS {BANDERA_FIRMA.upper()}" in ejecutable
    assert "NOT (" not in ejecutable.replace("IS NOT TRUE", "")


# ══ Las cuatro columnas de energia ═════════════════════════════════════════════
@pytest.mark.parametrize("columna", COLUMNAS_ENERGIA)
def test_la_energia_se_limpia_por_la_firma_de_la_fila(columna):
    """Antes pasaban sin ningun `CASE`, y por eso la vista devolvia 39 MWh."""
    assert re.search(
        rf"CASE WHEN {BANDERA_FIRMA} THEN NULL ELSE {columna} END AS {columna}",
        SQL), f"{columna} pasa sin limpiar por la firma"


@pytest.mark.parametrize("columna", COLUMNAS_ENERGIA)
def test_la_unidad_real_de_la_energia_queda_documentada(columna):
    """El sufijo `_wh` miente: estan en kWh, y el error es de un factor de mil."""
    comentario = re.search(
        rf"COMMENT ON COLUMN v_sc_electrico_corregido\.{columna} IS\s*'(.*?)';",
        SQL, re.S)
    assert comentario, f"{columna} no documenta su unidad real"
    assert "kWh" in comentario.group(1)
