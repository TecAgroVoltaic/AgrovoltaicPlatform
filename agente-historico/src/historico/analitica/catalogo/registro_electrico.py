"""Registro de las variables del inversor: electricas, contadores de energia y termicas."""
from __future__ import annotations

from historico.analitica.catalogo.variable import ELECTRICO, INCLINADO, TERMICO, VERTICAL, Variable

_V_ELECTRICO = "v_sc_electrico_corregido"
_T_ELECTRICO = "monitoreo_sc_electrico"


def _e(clave, etiqueta, unidad, **kw) -> Variable:
    """Variable electrica: vista corregida para analisis, tabla cruda para validez."""
    return Variable(clave, etiqueta, unidad, ELECTRICO, _V_ELECTRICO, clave,
                    relacion_cruda=_T_ELECTRICO, **kw)


_REGISTRO_ELECTRICO: tuple[Variable, ...] = (
    # ── Electrico: continua por arreglo ──────────────────────────────────────
    _e("potencia_pv1_w", "Potencia PV1 (inclinado)", "W", minimo=0, maximo=5000, arreglo=INCLINADO),
    _e("potencia_pv2_w", "Potencia PV2 (vertical)", "W", minimo=0, maximo=5000, arreglo=VERTICAL),
    _e("voltaje_pv1_v", "Voltaje PV1", "V", minimo=0, maximo=600, arreglo=INCLINADO),
    _e("voltaje_pv2_v", "Voltaje PV2", "V", minimo=0, maximo=600, arreglo=VERTICAL),
    _e("corriente_pv1_a", "Corriente PV1", "A", minimo=0, maximo=20, arreglo=INCLINADO),
    _e("corriente_pv2_a", "Corriente PV2", "A", minimo=0, maximo=20, arreglo=VERTICAL),
    # ── Electrico: alterna del inversor ──────────────────────────────────────
    # NULL al 100% de nov-2025 a feb-2026: la columna no vino en el CSV. No es cero.
    #
    # EL 0 ES DATO VALIDO EN LAS TRES, y por eso el minimo es 0 y no 100 ni 55
    # (Leo Cardinale, R3, 2026-08-30). Un 0 de tension o de frecuencia AC es el
    # inversor que no logra acoplarse a la red: dato BUENO sobre un equipo MALO.
    # Con los pisos viejos, la validez fisica declaraba invalidas 7.873 lecturas
    # de tension y 3.761 de frecuencia que son exactamente la averia que hay que
    # detectar, y confundia disponibilidad del equipo con calidad del dato.
    # Los techos se conservan (siguen atrapando lo imposible) aunque hoy no se
    # disparen: los maximos historicos son 218,84 V y 60,06 Hz.
    # El mismo rango vive en `config.RANGOS` y en la vista corregida
    # (`sql/003_electrico_sin_falsos_positivos.sql`): los tres se mueven juntos y
    # `tests/test_rangos_fisicos.py` verifica que sigan coincidiendo.
    _e("potencia_total_wac", "Potencia total AC", "W", minimo=0, maximo=5000),
    _e("voltaje_vac", "Voltaje AC", "V", minimo=0, maximo=280),
    _e("frecuencia_hz", "Frecuencia", "Hz", minimo=0, maximo=65),
    # ── Electrico: los cuatro CONTADORES de energia del inversor ─────────────
    # LA UNIDAD REAL ES kWh, NO Wh, en las cuatro. El sufijo `_wh` del nombre
    # miente y el error vale un factor de MIL. Medido por dos vias independientes
    # (`docs/referencia/medicion-energia-ac.md`): la integral de
    # `potencia_total_wac` contra el cierre diario del contador da mediana 1.003,58
    # sobre 127 dias, y el rendimiento especifico implicito da maximo exactamente
    # 5,00 kWh/kWp/dia, que es el techo fisico de Costa Rica. Las columnas NO se
    # renombran (romperia a todos los consumidores); lo que se corrige es lo que
    # este catalogo declara que son.
    #
    # Los maximos son topes de SANIDAD holgados, no records: a 5 kWh/kWp/dia el
    # arreglo de 1.420 Wp no pasa de 7,1 kWh (maximo real 7,9) y la planta de
    # 2.840 Wp no pasa de 14,2. Estan puestos para que la validez fisica atrape las
    # filas del piranometro mezcladas (203.194,6 en `energia_pv1_wh`, 39.328.367,1
    # en `energia_total_wh`) sin recortar ni un dia record legitimo.
    _e("energia_hoy_wh", "Energia AC del dia (contador, kWh)", "kWh",
       minimo=0, maximo=40),
    _e("energia_total_wh", "Energia AC acumulada de vida (contador, kWh)", "kWh",
       minimo=0, maximo=100000,
       hueco="NULL al 100 % entre 2025-11 y 2026-02 (cuatro meses): la columna no "
             "vino en el CSV. `energia_hoy_wh` SI cubre ese tramo y es la unica que "
             "lo tapa"),
    _e("energia_pv1_wh", "Energia DC del dia de PV1 (contador, kWh)", "kWh",
       minimo=0, maximo=20, arreglo=INCLINADO,
       hueco="solo 144 dias con dato, y NI UNO entre 2025-11 y 2026-02. Noviembre "
             "2024 tampoco: ahi hay AC y cero DC. El PR por contador hereda ese "
             "hueco y por eso la integral de la potencia es el respaldo declarado"),
    _e("energia_pv2_wh", "Energia DC del dia de PV2 (contador, kWh)", "kWh",
       minimo=0, maximo=20, arreglo=VERTICAL,
       hueco="solo 144 dias con dato, y NI UNO entre 2025-11 y 2026-02. Noviembre "
             "2024 tampoco: ahi hay AC y cero DC. El PR por contador hereda ese "
             "hueco y por eso la integral de la potencia es el respaldo declarado"),
    # ── Termico ──────────────────────────────────────────────────────────────
    # 10-80 C por decision del equipo (reemplaza el -10..60 de AgroDash). El 85
    # exacto es el DS18B20 desconectado y la vista corregida ya lo anula.
    Variable("temp_inclinado", "Temperatura modulo inclinado", "C", TERMICO,
             _V_ELECTRICO, "temp_inclinado", 10, 80, INCLINADO,
             relacion_cruda=_T_ELECTRICO),
    Variable("temp_vertical", "Temperatura modulo vertical", "C", TERMICO,
             _V_ELECTRICO, "temp_vertical", 10, 80, VERTICAL,
             relacion_cruda=_T_ELECTRICO),
    Variable("temperatura_inversor_c", "Temperatura del inversor", "C", TERMICO,
             _V_ELECTRICO, "temperatura_inversor_c", 10, 80,
             relacion_cruda=_T_ELECTRICO),
)
