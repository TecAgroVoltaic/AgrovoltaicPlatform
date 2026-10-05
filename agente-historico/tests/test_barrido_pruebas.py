"""El CABLEADO de las cinco familias al barrido por lotes. Sin base de datos.

Las pruebas de criterio (que cuenta como problema y con que gravedad) ya viven en
`test_calidad_pruebas` y en `test_calidad_disponibilidad`. Aca se verifica lo
otro, que es donde estan los modos de fallo SILENCIOSOS de una integracion:

  * el borrado del rango no alcanza a las fuentes que no estan en `FUENTES`
    (`sin_fuente`, `radiacion_sc_clearsky`, `radiacion_sc_poa`) y esos hallazgos
    quedan de fantasma para siempre;
  * la serie se lee de la vista corregida y la validez fisica sale vacia, que se
    lee como un aprobado;
  * re-correr el barrido duplica en vez de actualizar;
  * `series_de` reparte mal las columnas de una consulta entre sus N series;
  * el contexto se arma SIN la radiacion por bin y la quinta familia pierde la
    graduacion de severidad: los hallazgos salen igual, todos con motivo
    `sin_irradiancia`, y en produccion no hay con que notarlo.

Ninguno de los cinco revienta: los cinco devuelven numeros que se ven bien.

`historico.db` se sustituye por dobles. `barrido` y `consultas` los dos hacen
`from historico import db`, o sea que guardan la referencia al MODULO: parchear
sus atributos alcanza para los dos.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta

import pytest

from historico import db
from historico.analitica import catalogo
from historico.analitica.ventana import Ventana
from historico.calidad import barrido, corrida
from historico.calidad.pruebas import ContextoDisponibilidad, consultas, umbrales
from historico.calidad.pruebas.contrato import CORREGIDA, CRUDO, DERIVADA

ELECTRICO = "monitoreo_sc_electrico"
RADIACION = "radiacion_sc_15s"
CLEARSKY = "radiacion_sc_clearsky"
POA = "radiacion_sc_poa"
CALIBRADA = "v_sc_radiacion_calibrada"

# Rango en que TODAS las variables del catalogo existen a la vez: el SP722 solo
# corrio del 2026-05-11 al 2026-05-28, asi que es el que manda.
DESDE, HASTA = date(2026, 5, 20), date(2026, 5, 22)
# Rango anterior a la irradiancia util (2025-07-01) y a la POA (2025-09-05).
DESDE_VIEJO, HASTA_VIEJO = date(2025, 1, 1), date(2025, 1, 3)


def _marcas(n: int, cadencia_seg: int = 300, hora: int = 6) -> list[str]:
    """Marcas ISO con el `+00` que miente, tal como las devuelve `db.query`.

    `hora` es hora LOCAL de Costa Rica, sin conversion de zona: el `+00` de la
    etiqueta es falso y todo el paquete trabaja con el reloj de pared. Con
    `hora=12` las marcas caen dentro de la ventana operativa 07:00-17:00 de R3.
    """
    arranque = datetime.combine(DESDE, datetime.min.time()) + timedelta(hours=hora)
    return [(arranque + timedelta(seconds=cadencia_seg * i)).isoformat() + "+00:00"
            for i in range(n)]


def _filas(marcas: list[str], **columnas) -> list[dict]:
    """Filas como las devuelve `db.query`: una marca, N columnas y el intervalo."""
    return [{"marca": marca, "intervalo": 300.0,
             **{clave: valores[i] for clave, valores in columnas.items()}}
            for i, marca in enumerate(marcas)]


def _claves_crudas_de(relacion: str) -> list[str]:
    """Las claves del catalogo que el barrido pide CRUDAS a esa relacion.

    Se derivan del catalogo en vez de escribirse a mano: `series_de` arma cada
    serie leyendo `fila[clave]`, asi que una clave nueva sin columna en el doble
    revienta el test, y una lista fija haria que agregar una variable rompiera
    estas pruebas por una razon que no tiene nada que ver con lo que miden.
    """
    return [v.clave for v in catalogo.CATALOGO.values()
            if v.disponible and (v.origen_crudo or (v.relacion,))[0] == relacion]


def _filas_electricas(marcas: list[str], **columnas) -> list[dict]:
    """Todas las columnas electricas del catalogo en NULL, menos las que se pidan."""
    vacias = {c: [None] * len(marcas) for c in _claves_crudas_de(ELECTRICO)}
    return _filas(marcas, **{**vacias, **columnas})


class BaseFalsa:
    """Doble de `historico.db`: contesta consultas y APLICA las escrituras.

    Aplica el DELETE y el UPSERT con la semantica real del store (PK
    `(fecha, fuente, variable, tipo)`) en vez de solo anotarlos: es lo unico que
    permite comprobar que re-correr actualiza y no duplica, que es una propiedad
    de las dos sentencias juntas y no de ninguna de las dos por separado.
    """

    def __init__(self, por_relacion: dict[str, list[dict]] | None = None) -> None:
        self.por_relacion = por_relacion or {}
        self.consultas: list[str] = []
        self.sql: list[str] = []
        self.escrituras: list[str] = []
        self.borrados: list[tuple] = []
        self.store: dict[tuple, tuple] = {}
        # Los bins de radiacion con que se gradua la disponibilidad. Van por
        # separado y no en `por_relacion` porque salen de la MISMA relacion que
        # `kt_star` (`v_sc_radiacion_calibrada`) con otra forma de fila: repartir
        # por nombre de relacion le daria a una consulta las filas de la otra.
        self.bins: list[dict] = []

    # ── lectura ─────────────────────────────────────────────────────────────
    def query(self, sql: str, params: tuple = ()) -> list[dict]:
        relacion = sql.split(" FROM ")[1].split()[0]
        self.consultas.append(relacion)
        self.sql.append(sql)
        if "date_bin(" in sql:
            return list(self.bins)
        if relacion == "ventana_solar":
            return []
        return self.por_relacion.get(relacion, [])

    # ── escritura ───────────────────────────────────────────────────────────
    def ejecutar(self, sql: str, params: tuple = ()) -> int:
        assert "DELETE" in sql, "`ejecutar` en el barrido solo borra"
        self.escrituras.append("borrar")
        self.borrados.append((sql, params))
        fuente = params[0] if "fuente = %s" in sql else None
        desde, hasta, tipos = params[-3:]
        borradas = [clave for clave in self.store
                    if desde <= clave[0] < hasta and clave[3] in tipos
                    and (fuente is None or clave[1] == fuente)]
        for clave in borradas:
            del self.store[clave]
        return len(borradas)

    def ejecutar_muchos(self, sql: str, filas: list[tuple]) -> int:
        self.escrituras.append("insertar")
        for fila in filas:
            self.store[fila[:4]] = fila       # ON CONFLICT (fecha, fuente, variable, tipo)
        return len(filas)


@pytest.fixture
def base(monkeypatch) -> BaseFalsa:
    """Una base falsa con radiacion cruda que trae un valor fisicamente imposible."""
    doble = BaseFalsa({
        RADIACION: _filas(
            _marcas(3),
            irradiancia_incidente_wm2=[0.0, -38.845, 500.0],
            irradiancia_reflejada_wm2=[0.0, 0.0, 120.0],
            albedo=[0.0, 0.0, 0.24],
            irradiancia_incidente_sp722_wm2=[None, None, None],
            irradiancia_reflejada_sp722_wm2=[None, None, None],
            albedo_sp722=[None, None, None]),
    })
    for nombre in ("query", "ejecutar", "ejecutar_muchos"):
        monkeypatch.setattr(db, nombre, getattr(doble, nombre))
    return doble


# ══════════════════════════════════════════════════════════════════════════
# `series_de`: N series de un solo viaje al pooler
# ══════════════════════════════════════════════════════════════════════════
def test_series_de_arma_una_serie_por_clave_desde_una_sola_consulta(base):
    # Given tres variables que viven en la misma tabla cruda
    claves = ["potencia_pv1_w", "potencia_pv2_w", "temp_inclinado"]
    base.por_relacion[ELECTRICO] = _filas(
        _marcas(2), potencia_pv1_w=[100.0, 200.0], potencia_pv2_w=[10.0, 20.0],
        temp_inclinado=[30.0, 85.0])

    # When se piden juntas
    series = consultas.series_de(ELECTRICO, claves, DESDE, HASTA, crudo=True)

    # Then hubo UN viaje y salieron tres series con sus propios valores
    assert base.consultas == [ELECTRICO]
    assert [s.variable.clave for s in series] == claves
    assert [s.valores for s in series] == [[100.0, 200.0], [10.0, 20.0], [30.0, 85.0]]
    # y todas comparten las mismas marcas, que son las de la relacion
    assert all(s.marcas == series[0].marcas for s in series)
    assert all(s.n == 2 and s.fuente == ELECTRICO for s in series)


def test_series_de_pide_la_columna_cruda_con_el_nombre_del_catalogo(base):
    # Given una variable cuya columna cruda se llama distinto que su clave
    variable = catalogo.obtener("irradiancia_incidente_wm2")
    assert variable.origen_crudo == (RADIACION, "irradiancia_incidente")

    # When se pide del crudo
    series = consultas.series_de(RADIACION, [variable.clave], DESDE, HASTA, crudo=True)

    # Then el SELECT renombra la columna a la clave del catalogo: sin ese alias
    # habria que rehacer la traduccion al repartir las filas entre las N series.
    assert "irradiancia_incidente AS irradiancia_incidente_wm2" in base.sql[0]
    assert series[0].valores == [0.0, -38.845, 500.0]


def test_series_de_marca_el_origen_segun_de_donde_leyo(base):
    # Given la misma variable pedida cruda y corregida
    cruda = consultas.series_de(RADIACION, ["irradiancia_incidente_wm2"],
                                DESDE, HASTA, crudo=True)[0]
    corregida = consultas.series_de(CALIBRADA, ["irradiancia_incidente_wm2"],
                                    DESDE, HASTA)[0]
    # Then el origen lo dice, que es lo que hace que la validez fisica se niegue a
    # correr sobre la segunda en vez de devolver una lista vacia
    assert (cruda.origen, corregida.origen) == (CRUDO, CORREGIDA)


def test_series_de_rechaza_una_clave_que_no_vive_en_esa_relacion(base):
    # Given una clave electrica pedida contra la tabla de radiacion
    with pytest.raises(ValueError, match="agrupa las claves por relacion"):
        consultas.series_de(RADIACION, ["potencia_pv1_w"], DESDE, HASTA, crudo=True)
    # Then no se llego a consultar: el grupo mal armado muere antes del SQL
    assert base.consultas == []


def test_series_de_rechaza_una_variable_sin_fuente(base):
    # Given una variable que el documento pide y la base no tiene
    with pytest.raises(ValueError, match="no tiene fuente"):
        consultas.series_de(RADIACION, ["humedad_relativa_pct"], DESDE, HASTA)


def test_series_de_sin_claves_no_gasta_un_viaje(base):
    # Given un grupo vacio (la relacion quedo sin variables en el rango)
    assert consultas.series_de(ELECTRICO, [], DESDE, HASTA, crudo=True) == []
    assert base.consultas == []


# ══════════════════════════════════════════════════════════════════════════
# Las series del barrido: crudas, agrupadas y acotadas a su tramo
# ══════════════════════════════════════════════════════════════════════════
def test_la_validez_fisica_recibe_series_crudas_y_nunca_corregidas(base):
    # Given el barrido arma las series de todo el catalogo
    series, _ = barrido._series_del_rango(DESDE, HASTA)

    # Then ninguna viene de una vista corregida: leida de ahi, la familia de
    # validez fisica da cero valores imposibles porque la vista los borro, y eso
    # es indistinguible de un sensor sano.
    assert CORREGIDA not in {s.origen for s in series}
    # y el unico origen que no es crudo es el de kt*, que no existe sin calcular
    derivadas = {s.variable.clave for s in series if s.origen == DERIVADA}
    assert derivadas == {"kt_star"}


def test_cada_relacion_se_consulta_una_sola_vez(base):
    # Given un rango donde todas las variables del catalogo existen a la vez
    barrido._series_del_rango(DESDE, HASTA)

    # Then hay un viaje por relacion y no uno por variable: las variables con
    # fuente del catalogo (hoy 22) viven en cinco relaciones, y contra el pooler
    # el coste dominante es la latencia del viaje, no la consulta.
    assert sorted(base.consultas) == sorted([ELECTRICO, RADIACION, CLEARSKY, POA,
                                             CALIBRADA])
    assert len(base.consultas) < len(catalogo.disponibles())


def test_una_variable_fuera_de_su_tramo_no_se_barre_y_se_dice_cual(base):
    # Given un rango anterior a la irradiancia util (2025-07-01) y a la POA
    series, fuera = barrido._series_del_rango(DESDE_VIEJO, HASTA_VIEJO)

    # Then esas variables no se consultan: fuera de su tramo el dato no FALTA, es
    # que el sensor no estaba puesto, y `parametro_faltante` sobre 256 dias
    # pintaria de rojo el calendario entero.
    assert POA not in base.consultas and RADIACION not in base.consultas
    assert {"poa_pv1_wm2", "irradiancia_incidente_wm2", "albedo_sp722"} <= set(fuera)
    # y se reporta cuales, porque un catalogo barrido a medias en silencio se lee
    # como un catalogo limpio
    assert {s.variable.clave for s in series}.isdisjoint(fuera)


def test_las_variables_sin_fuente_entran_igual_y_no_cuestan_consulta(base):
    # Given las cuatro variables que el documento pide y la base no tiene
    series, _ = barrido._series_del_rango(DESDE, HASTA)
    sin_fuente = [s for s in series if not s.variable.disponible]

    # Then se arman igual (el hueco tiene que verse y quedar medido) y ninguna
    # gasta un viaje: no hay relacion que consultar.
    assert {s.variable.clave for s in sin_fuente} == {
        "humedad_relativa_pct", "temperatura_ambiente_c",
        "velocidad_viento_ms", "precipitacion_mm"}
    assert all(s.vacia for s in sin_fuente)
    assert base.consultas.count("sin_fuente") == 0


# ══════════════════════════════════════════════════════════════════════════
# La persistencia: borrar antes de reinsertar, y alcanzar a TODAS las fuentes
# ══════════════════════════════════════════════════════════════════════════
def test_el_rango_se_limpia_antes_de_reinsertar(base):
    # When corre el paso de las pruebas
    barrido._barrer_pruebas(DESDE, HASTA)

    # Then borra y despues inserta: al reves, la corrida se borraria a si misma.
    assert base.escrituras == ["borrar", "insertar"]


def test_el_borrado_alcanza_a_las_fuentes_que_no_estan_en_FUENTES(base):
    # Given hallazgos de una corrida vieja que ya no son ciertos, con las fuentes
    # que `FUENTES` no nombra (una variable que salio del catalogo, y dos de
    # relaciones que en esta corrida no traen ni una fila)
    fantasmas = [(DESDE, "sin_fuente", "presion_atmosferica_hpa", "sin_fuente"),
                 (DESDE, POA, "poa_pv1_wm2", "valor_nulo"),
                 (DESDE, CLEARSKY, "cs_ghi_wm2", "outlier_iqr")]
    for clave in fantasmas:
        base.store[clave] = clave + ("aviso", 1, "{}")
    # y uno ajeno, del detector de cielo, que NO se puede tocar
    ajeno = (DESDE, RADIACION, "irradiancia_incidente", "kt_imposible")
    base.store[ajeno] = ajeno + ("grave", 5, "{}")

    # When corre el paso de las pruebas
    barrido._barrer_pruebas(DESDE, HASTA)

    # Then los tres desaparecieron (si no, quedarian de fantasma en cada corrida)
    sql, params = base.borrados[0]
    assert "fuente" not in sql, "acotar por fuente dejaria fuera a las tres de arriba"
    assert params[:2] == (DESDE, HASTA)
    assert set(barrido.TIPOS_DE_PRUEBAS) <= set(params[2])
    # y el del cielo sigue ahi
    assert ajeno in base.store
    assert all(clave not in base.store for clave in fantasmas)


def test_los_tipos_del_barrido_y_los_de_las_pruebas_no_se_pisan():
    # Given la PK del store es (fecha, fuente, variable, tipo) y cada detector
    # borra por tipo antes de reinsertar
    # Then un tipo compartido haria que uno borrara los hallazgos del otro en
    # silencio, que es como se perdio `kt_imposible` la primera vez.
    assert set(barrido.TIPOS_PROPIOS).isdisjoint(barrido.TIPOS_DE_PRUEBAS)
    assert "kt_imposible" not in barrido.TIPOS_DE_PRUEBAS


def test_correr_dos_veces_deja_el_store_igual(base):
    # Given una primera corrida
    primera = barrido._barrer_pruebas(DESDE, HASTA)
    guardadas = dict(base.store)
    assert guardadas, "el simulacro tiene que escribir algo para que la prueba mida"

    # When se vuelve a correr el mismo rango
    segunda = barrido._barrer_pruebas(DESDE, HASTA)

    # Then actualiza, no duplica: es lo que garantiza la PK mas el ON CONFLICT, y
    # tiene que seguir valiendo con los tipos nuevos.
    assert primera["hallazgos"] == segunda["hallazgos"]
    assert set(base.store) == set(guardadas)
    assert len(base.store) == len(guardadas)


def test_un_hallazgo_que_dejo_de_ser_cierto_desaparece(base):
    # Given una corrida que dejo su hallazgo de valor imposible
    barrido._barrer_pruebas(DESDE, HASTA)
    tipos = {clave[3] for clave in base.store}
    assert "bajo_minimo_fisico" in tipos

    # When se corrige el dato y se vuelve a barrer
    base.por_relacion[RADIACION] = _filas(
        _marcas(3), irradiancia_incidente_wm2=[0.0, 0.0, 500.0],
        irradiancia_reflejada_wm2=[0.0, 0.0, 120.0], albedo=[0.0, 0.0, 0.24],
        irradiancia_incidente_sp722_wm2=[None, None, None],
        irradiancia_reflejada_sp722_wm2=[None, None, None],
        albedo_sp722=[None, None, None])
    barrido._barrer_pruebas(DESDE, HASTA)

    # Then el hallazgo ya no esta: sin el borrado quedaria de fantasma para siempre
    assert "bajo_minimo_fisico" not in {clave[3] for clave in base.store}


def test_el_resumen_dice_que_se_barrio_y_que_no(base):
    # When corre sobre un rango que no alcanza a media base
    resumen = barrido._barrer_pruebas(DESDE_VIEJO, HASTA_VIEJO)

    # Then el resumen expone el hueco en vez de dejarlo implicito
    assert resumen["variables_barridas"] > 0
    assert "poa_pv1_wm2" in resumen["fuera_de_cobertura"]
    assert resumen["sin_fuente"] > 0, "las cuatro sin dato tienen que verse contadas"


# ══════════════════════════════════════════════════════════════════════════
# La quinta familia: que la radiacion LLEGUE, y por bin
# ══════════════════════════════════════════════════════════════════════════
CAIDO = "inversor_sin_acoplar"


def _apagon_de_mediodia(base, ghi: float | None) -> tuple:
    """Tres lecturas de mediodia con el AC en cero, con o sin sol medido.

    Devuelve la fila que quedo en el store para (DESDE, ELECTRICO, voltaje_vac,
    inversor_sin_acoplar), que es la PK real de `hallazgos_calidad`.
    """
    marcas = _marcas(3, hora=12)
    base.por_relacion[ELECTRICO] = _filas_electricas(marcas, voltaje_vac=[0.0, 0.0, 0.0])
    base.bins = [] if ghi is None else [{"bin": m, "ghi": ghi} for m in marcas]
    barrido._barrer_pruebas(DESDE, HASTA)
    return base.store[(DESDE, ELECTRICO, "voltaje_vac", CAIDO)]


def test_el_barrido_gradua_el_apagon_con_la_radiacion_que_trae(base):
    # Given el inversor en cero a mediodia con sol pleno medido
    fila = _apagon_de_mediodia(base, ghi=800.0)

    # Then sale GRAVE y con el motivo que dice por que: el DATO es bueno y lo que
    # fallo es el EQUIPO. Sin la radiacion en el contexto saldria `aviso` con
    # motivo `sin_irradiancia`, y esa perdida no se ve mirando la salida.
    assert fila[4] == "grave"
    detalle = json.loads(fila[6])
    assert detalle["motivo"] == umbrales.MOTIVO_BAJO_SOL
    assert detalle["lecturas_con_sol"] == 3


def test_el_apagon_con_poca_luz_baja_a_aviso_en_vez_de_desaparecer(base):
    # Given el mismo apagon pero con la irradiancia por debajo del umbral de R3
    fila = _apagon_de_mediodia(base, ghi=50.0)

    # Then se reporta igual, como aviso: "estaba nublado" es una explicacion
    # admisible, no una razon para callar el hallazgo.
    assert fila[4] == "aviso"
    assert json.loads(fila[6])["motivo"] == umbrales.MOTIVO_IRRADIANCIA_BAJA


def test_sin_radiacion_medida_el_apagon_se_reporta_igual_y_lo_dice(base):
    # Given un dia sin ninguna lectura de radiacion (los anteriores al 2025-07-01
    # la tienen en NULL por decision del equipo: son 46 de los 274 dias)
    fila = _apagon_de_mediodia(base, ghi=None)

    # Then el hallazgo NO se calla: sale con motivo explicito. Filtrar por sol
    # perderia 8 dias, 3 de ellos apagones de dia entero, y en silencio.
    assert fila[4] == "aviso"
    detalle = json.loads(fila[6])
    assert detalle["motivo"] == umbrales.MOTIVO_SIN_IRRADIANCIA
    assert detalle["lecturas_sin_irradiancia"] == 3


def test_el_contexto_del_barrido_trae_la_radiacion_por_bin(base):
    # Given el barrido corriendo el catalogo entero
    barrido._barrer_pruebas(DESDE, HASTA)

    # Then pidio la radiacion agregada por VENTANA y no lectura por lectura, y
    # una sola vez para todo el rango
    consultas_bin = [s for s in base.sql if "date_bin(" in s]
    assert len(consultas_bin) == 1
    assert "avg(" in consultas_bin[0] and "GROUP BY" in consultas_bin[0]
    # el tamaño del bin sale de `umbrales`, no de un numero suelto en el SQL
    assert f"{umbrales.BIN_DE_EMPAREJAMIENTO_SEG} seconds" in consultas_bin[0]
    # y jamas se convierte de zona: correria la ventana 07:00-17:00 seis horas
    assert "AT TIME ZONE" not in consultas_bin[0]


def test_emparejar_por_timestamp_exacto_degradaria_la_severidad(base):
    # Given la radiacion con los segundos propios de su reloj (15 s con jitter) y
    # lo electrico en la rejilla de 5 min: las dos tablas no comparten instante
    marcas = _marcas(3, hora=12)
    desfasadas = [m.replace(":00+00:00", ":07+00:00") for m in marcas]
    base.por_relacion[ELECTRICO] = _filas_electricas(marcas, voltaje_vac=[0.0, 0.0, 0.0])
    base.bins = [{"bin": m, "ghi": 800.0} for m in desfasadas]

    # When el mapa se indexa por la marca cruda en vez de por su bin
    barrido._barrer_pruebas(DESDE, HASTA)
    fila = base.store[(DESDE, ELECTRICO, "voltaje_vac", CAIDO)]

    # Then el hallazgo APARECE IGUAL y solo cambia la severidad: por eso el error
    # de emparejar por igualdad exacta no se nota mirando la salida. Medido sobre
    # produccion: por bin se empareja el 94,5 % y por timestamp exacto el 12,9 %.
    assert fila[4] == "aviso"
    assert json.loads(fila[6])["motivo"] == umbrales.MOTIVO_SIN_IRRADIANCIA
    # y con el bin bien calculado, el mismo dato da grave
    base.bins = [{"bin": consultas._sin_etiqueta(m).replace(second=0).isoformat() + "+00:00",
                  "ghi": 800.0} for m in desfasadas]
    barrido._barrer_pruebas(DESDE, HASTA)
    assert base.store[(DESDE, ELECTRICO, "voltaje_vac", CAIDO)][4] == "grave"


def test_las_otras_cuatro_familias_no_se_enteran_del_campo_nuevo(base):
    # Given un contexto con radiacion por bin
    contexto = ContextoDisponibilidad(ventanas_solares={}, irradiancia_por_bin={})

    # Then sigue siendo un `Contexto` para todo lo demas: el contrato lo comparten
    # las cinco familias y solo una mira el campo de mas.
    assert isinstance(contexto, barrido.pruebas.Contexto)
    assert contexto.ventanas_solares == {}


# ══════════════════════════════════════════════════════════════════════════
# La corrida suelta: mismo contexto, sin pagar el viaje que no usa
# ══════════════════════════════════════════════════════════════════════════
def _ventana() -> Ventana:
    return Ventana(DESDE, HASTA, "dia")


def test_evaluar_una_variable_AC_pide_la_radiacion_por_bin(base):
    # Given una de las tres variables de acople de R3, en cero a mediodia.
    # `serie()` pide UNA columna con alias `valor`, no la tabla entera.
    base.por_relacion[ELECTRICO] = _filas(_marcas(3, hora=12), valor=[0.0, 0.0, 0.0])
    base.bins = [{"bin": m, "ghi": 800.0} for m in _marcas(3, hora=12)]

    # When se corre el catalogo de pruebas sobre ella sola
    resultado = corrida.evaluar(_ventana(), "voltaje_vac")

    # Then el hallazgo sale graduado igual que en el barrido: las dos
    # composiciones tienen que dar lo mismo, o el informe suelto y el store
    # discreparian sobre la gravedad del mismo dia.
    caidos = [h for h in resultado.hallazgos if h.tipo == CAIDO]
    assert [h.severidad for h in caidos] == ["grave"]


def test_evaluar_una_variable_que_no_es_AC_no_gasta_el_viaje(base):
    # Given una variable para la que la quinta familia se declara `no_aplica`
    base.por_relacion[ELECTRICO] = _filas(_marcas(3), valor=[100.0, 200.0, 300.0])

    # When se la evalua
    corrida.evaluar(_ventana(), "potencia_pv1_w")

    # Then no se pidio la radiacion: seria un viaje al pooler que nadie lee. La
    # condicion sale de la misma constante que usa la prueba para decidir.
    assert not any("date_bin(" in s for s in base.sql)
    assert "potencia_pv1_w" not in umbrales.VARIABLES_DE_ACOPLE_AC
