"""Familia 6: la temperatura de modulo contra la irradiancia. Sin base de datos.

Series sinteticas de un dia: GHI en campana de 06:00 a 17:00 cada 5 min y una
temperatura que la sigue (o no). Lo que se fija:

  1. los tres motivos disparan solos y con su borde;
  2. un dia saturado en 85 NO dispara (ya lo dice `saturado_85`);
  3. sin irradiancia o sin ventana solar la prueba NO se calla: deja un `info`
     con `estado: sin_fuente`;
  4. el cruce va por bin de 5 min aunque los relojes no coincidan.

Estructura Given-When-Then.
"""
from __future__ import annotations

import math
from datetime import date, datetime, timedelta

import pytest

from historico.analitica import catalogo
from historico.calidad.pruebas import disponibilidad, entre_sensores, registro, umbrales
from historico.calidad.pruebas.contrato import (
    CRUDO, GRAVE, INFO, SIN_FUENTE, NoAplica, Serie, VentanaSolar,
)
from historico.tools import hallazgos as tool_hallazgos

FECHA = date(2026, 3, 15)
ELECTRICO = "monitoreo_sc_electrico"
INICIO = datetime(2026, 3, 15, 6, 0)
N_BINS = 132                       # 06:00 a 16:55, cada 5 min
PICO_GHI = 900.0
VENTANA = VentanaSolar(datetime(2026, 3, 15, 5, 30), datetime(2026, 3, 15, 17, 45))


def _marcas(n: int = N_BINS, desfase_seg: int = 0) -> list[datetime]:
    return [INICIO + timedelta(minutes=5 * i, seconds=desfase_seg) for i in range(n)]


def _campana(n: int = N_BINS, pico: float = PICO_GHI) -> list[float]:
    return [pico * math.sin(math.pi * (i + 0.5) / n) for i in range(n)]


def _serie(valores, marcas=None, clave: str = "temp_inclinado") -> Serie:
    return Serie(variable=catalogo.obtener(clave), fuente=ELECTRICO, fecha=FECHA,
                 origen=CRUDO, marcas=marcas or _marcas(len(valores)), valores=valores)


def _contexto(ghi, marcas=None, ventanas=None):
    return disponibilidad.ContextoDisponibilidad(
        ventanas_solares={FECHA: VENTANA} if ventanas is None else ventanas,
        irradiancia_por_bin=disponibilidad.irradiancia_por_bin(marcas or _marcas(len(ghi)), ghi))


def _sigue_al_sol(ghi) -> list[float]:
    return [25.0 + 0.03 * g for g in ghi]


def _correr(temps, ghi, **kw):
    return entre_sensores.incongruencia_temp_irradiancia(_serie(temps), _contexto(ghi, **kw))


# ══ Los tres motivos ════════════════════════════════════════════════════════
def test_temperatura_que_sigue_al_sol_no_deja_hallazgo():
    # Given un dia despejado con el modulo calentandose con el sol
    ghi = _campana()

    # When / Then
    assert _correr(_sigue_al_sol(ghi), ghi) == []


def test_motivo_1_temperatura_que_no_sigue_al_sol_es_grave():
    # Given una temperatura que baja recta todo el dia mientras el sol sube y baja
    ghi = _campana()
    temps = [50.0 - 20.0 * i / N_BINS for i in range(N_BINS)]

    # When
    [hallazgo] = _correr(temps, ghi)

    # Then
    assert (hallazgo.tipo, hallazgo.severidad) == (entre_sensores.TIPO, GRAVE)
    assert hallazgo.detalle["motivos"] == [umbrales.MOTIVO_NO_SIGUE_AL_SOL]
    assert abs(hallazgo.detalle["r"]) < umbrales.CORRELACION_MINIMA_TEMP_GHI
    assert hallazgo.detalle["bins_evaluados"] == N_BINS
    assert hallazgo.n_afectadas == N_BINS


def test_motivo_1_temperatura_constante_no_tiene_correlacion_y_dispara():
    # Given un sensor clavado en 40 C (no 85) a pleno sol
    ghi = _campana()

    # When
    [hallazgo] = _correr([40.0] * N_BINS, ghi)

    # Then r no existe y eso es justamente "no sigue al sol"
    assert hallazgo.detalle["r"] is None
    assert hallazgo.detalle["motivo"] == umbrales.MOTIVO_NO_SIGUE_AL_SOL


def test_motivo_2_modulo_frio_a_pleno_sol():
    # Given un sensor que sigue al sol pero nunca pasa de 20 C con 900 W/m2
    ghi = _campana()
    temps = [15.0 + 0.005 * g for g in ghi]

    # When
    [hallazgo] = _correr(temps, ghi)

    # Then
    assert hallazgo.detalle["motivos"] == [umbrales.MOTIVO_FRIO_A_PLENO_SOL]
    assert hallazgo.detalle["temp_max"] < umbrales.TEMP_MAXIMA_DE_MODULO_FRIO_C


def test_motivo_2_no_dispara_si_el_sol_no_llega_a_pleno():
    # Given el mismo modulo frio, pero el pico de GHI justo bajo 700
    ghi = _campana(pico=umbrales.GHI_DE_SOL_PLENO_WM2 - 1)
    temps = [15.0 + 0.005 * g for g in ghi]

    # When / Then
    assert _correr(temps, ghi) == []


def _con_racha_caliente(bins_calientes: int):
    """Dia sano mas una racha final con GHI bajo y modulo a 65 C."""
    ghi = _campana()
    temps = _sigue_al_sol(ghi)
    for i in range(N_BINS - bins_calientes, N_BINS):
        ghi[i], temps[i] = 100.0, 65.0
    return temps, ghi


def test_motivo_3_caliente_sin_sol_durante_30_minutos():
    # Given seis bins seguidos (30 min) a 65 C con 100 W/m2
    temps, ghi = _con_racha_caliente(6)

    # When
    [hallazgo] = _correr(temps, ghi)

    # Then
    assert umbrales.MOTIVO_CALIENTE_SIN_SOL in hallazgo.detalle["motivos"]
    assert hallazgo.detalle["minutos_caliente_sin_sol"] == 30


def test_motivo_3_no_dispara_con_25_minutos():
    # Given cinco bins (25 min): justo por debajo de lo sostenido
    temps, ghi = _con_racha_caliente(5)

    # When
    hallazgos = _correr(temps, ghi)

    # Then
    assert all(umbrales.MOTIVO_CALIENTE_SIN_SOL not in h.detalle["motivos"]
               for h in hallazgos)


# ══ Cuando el dia no se juzga ═══════════════════════════════════════════════
def test_dia_saturado_en_85_no_dispara_aunque_no_siga_al_sol():
    # Given un DS18B20 desconectado: 85 en buena parte del dia
    ghi = _campana()
    temps = [85.0] * 60 + [40.0] * (N_BINS - 60)

    # When / Then: ese caso lo cubre `saturado_85`
    assert _correr(temps, ghi) == []


@pytest.mark.parametrize("bins_con_sol, juzga", [(24, True), (23, False)])
def test_hacen_falta_dos_horas_de_sol_para_juzgar(bins_con_sol, juzga):
    # Given un dia nublado salvo `bins_con_sol` bins a 500 W/m2, y un sensor plano
    ghi = [500.0 if i < bins_con_sol else 100.0 for i in range(N_BINS)]

    # When
    hallazgos = _correr([40.0] * N_BINS, ghi)

    # Then dos horas exactas alcanzan; una menos, no
    assert bool(hallazgos) is juzga


def test_sin_irradiancia_del_dia_deja_info_sin_fuente():
    # Given temperatura de dia pero ni una lectura de radiacion
    temps = _sigue_al_sol(_campana())

    # When
    [hallazgo] = entre_sensores.incongruencia_temp_irradiancia(
        _serie(temps), _contexto([], marcas=[]))

    # Then no se calla, y tampoco hunde el veredicto
    assert hallazgo.severidad == INFO
    assert hallazgo.detalle["estado"] == SIN_FUENTE
    assert hallazgo.detalle["motivo"] == umbrales.MOTIVO_SIN_IRRADIANCIA


def test_sin_ventana_solar_deja_info_sin_fuente():
    # Given radiacion y temperatura, pero `ventana_solar` sin ese dia
    ghi = _campana()

    # When
    [hallazgo] = _correr(_sigue_al_sol(ghi), ghi, ventanas={})

    # Then el hueco de la tabla de apoyo se ve (regla post-carga)
    assert hallazgo.severidad == INFO
    assert hallazgo.detalle["motivo"] == umbrales.MOTIVO_SIN_VENTANA_SOLAR


def test_el_cruce_va_por_bin_aunque_los_relojes_no_coincidan():
    # Given temperatura a 5 min desfasada 37 s y radiacion a 15 s desfasada 4 s
    ghi = _campana()
    temps = [50.0 - 20.0 * i / N_BINS for i in range(N_BINS)]
    marcas_rad = [INICIO + timedelta(seconds=4 + 15 * k) for k in range(N_BINS * 20)]
    ghi_15s = [ghi[k // 20] for k in range(N_BINS * 20)]
    contexto = _contexto(ghi_15s, marcas=marcas_rad)

    # When
    [hallazgo] = entre_sensores.incongruencia_temp_irradiancia(
        _serie(temps, _marcas(desfase_seg=37)), contexto)

    # Then se emparejaron todos los bins (por igualdad exacta no habria ninguno)
    assert hallazgo.detalle["bins_evaluados"] == N_BINS


def test_no_aplica_a_variables_que_no_son_temperatura_de_modulo():
    # Given la temperatura del inversor, que esta a la sombra
    serie = _serie([40.0] * N_BINS, clave="temperatura_inversor_c")

    # When / Then
    with pytest.raises(NoAplica):
        entre_sensores.incongruencia_temp_irradiancia(serie, _contexto(_campana()))


# ══ Registro ════════════════════════════════════════════════════════════════
def test_la_prueba_esta_registrada_con_familia_propia_y_traducida():
    # Given el catalogo
    registrada = [p for p in registro.CATALOGO_PRUEBAS if p.tipo == entre_sensores.TIPO]

    # Then corre sola en el barrido, limpia su rango y se puede filtrar
    assert [p.familia for p in registrada] == [registro.CONSISTENCIA_ENTRE_SENSORES]
    assert entre_sensores.TIPO in registro.TIPOS
    assert entre_sensores.TIPO in tool_hallazgos.QUE_ES
