"""El REGISTRO de variables analizables. Contrato compartido y allowlist de SQL.

Una variable = una fila de la Tabla 1 del documento de evaluacion = una entrada
aca. Es la unica fuente de verdad de tres cosas que antes vivian desperdigadas:

  1. **Donde vive el dato.** Que relacion y que columna. Y son las relaciones
     CORREGIDAS a proposito: leer de `monitoreo_sc_electrico` en crudo trae
     26.503.162 W de potencia en un arreglo de 1.420 Wp, porque las filas del
     piranometro se mezclaron con las del inversor.
  2. **Que valores son fisicamente posibles.** Los limites que usa la familia de
     pruebas de validez fisica.
  3. **Que se puede consultar.** Ninguna funcion de `analitica` interpola un nombre
     de columna que no haya salido de aca. Sin esto, un parametro del usuario o del
     LLM entraria al SQL: la allowlist no es documentacion, es la defensa.

`fuente_ausente` marca lo que el documento pide y la base NO tiene. Se registra
igual, con su motivo, para que el hueco se vea y quede medido en vez de
desaparecer del catalogo como si nadie lo hubiera pedido.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

ELECTRICO, RADIACION, TERMICO, AMBIENTAL = "electrico", "radiacion", "termico", "ambiental"
INCLINADO, VERTICAL = "inclinado", "vertical"

_V_ELECTRICO = "v_sc_electrico_corregido"
_V_RADIACION = "v_sc_radiacion_calibrada"
_T_POA = "radiacion_sc_poa"


# Los nombres de variable con que el barrido REALMENTE deja hallazgos. Existe para
# que `clave_calidad` no pueda apuntar a un nombre que la tabla no conoce.
#
# ── EL CRITERIO DE ENTRADA, porque los dos errores no cuestan lo mismo ────────
# Una clave entra aca solo si cumple LAS DOS condiciones:
#
#   1. **Algun detector escribe hallazgos bajo ESE string exacto.** En
#      `hallazgos_calidad` conviven dos convenciones de nombre: el barrido por
#      columna (`calidad/barrido.py`, que recorre `config.RANGOS`) guarda el nombre
#      de la columna CRUDA, y las familias de `calidad/pruebas` guardan la CLAVE del
#      catalogo. Para casi todo son el mismo string; para la irradiancia no
#      (`irradiancia_incidente` contra `irradiancia_incidente_wm2`), y ese desfase
#      es el que hacia invisibles 321 hallazgos de irradiancia y 837 de temperatura.
#   2. **Su tabla cruda es una de las dos que `calidad.contexto` sabe contar**
#      (`monitoreo_sc_electrico` o `radiacion_sc_15s`). El veredicto declara MATERIAL
#      un hallazgo grave cuando toca el 20 % de las lecturas del dia, y ese
#      denominador sale del CTE `filas_dia`, que solo conoce esas dos tablas. Un
#      hallazgo con fuente `radiacion_sc_poa` o `radiacion_sc_clearsky` no tiene
#      denominador y NUNCA puede ser material: declararlo vigilado diria "revisado"
#      sobre algo que el veredicto es estructuralmente incapaz de castigar.
#
# Los dos errores posibles NO son simetricos, y por eso el criterio es este y no uno
# mas suelto. Una clave de mas hace que `confianza` responda "cero hallazgos", y eso
# se lee como dato impecable: SILENCIO LEIDO COMO SALUD, el fallo que ya nos mordio
# tres veces. Una clave de menos hace que `sin_vigilancia()` la anuncie en el
# payload ("nadie la miro"): conservador y RUIDOSO. Ante la duda se deja fuera,
# porque el fallo ruidoso se corrige y el silencioso no se ve.
#
# ── Las cuatro de energia entraron el 2026-08-31, y por que ───────────────────
# Cumplen (1): su clave de catalogo ES su nombre de columna cruda, asi que las dos
# convenciones colapsan en el mismo string y el desfase de la irradiancia no se
# puede repetir aca. Cumplen (2): viven en `monitoreo_sc_electrico`. Y registrarlas
# en este catalogo es JUSTAMENTE lo que las mete en el barrido, porque
# `barrido._series_del_rango` recorre `CATALOGO`: la vigilancia es consecuencia
# estructural de la entrada, no una apuesta sobre una corrida pasada. Sin ellas,
# `confianza` no podia castigar nunca ni la energia AC del tablero (`energia.py`) ni
# el camino del CONTADOR del PR diario (`rendimiento.py`), que son las dos rutas de
# calculo mas usadas del sistema: respondia con un aviso a mano en vez de con un dato.
#
# ── Las POA (bifacial y frontal) siguen FUERA, y no por olvido ────────────────
# Fallan la condicion (2): sus hallazgos viajan con fuente `radiacion_sc_poa`, que
# no aparece en `filas_dia`. Meterlas aca convertiria un aviso honesto ("el barrido
# no revisa la POA") en un aprobado falso. Se quedan fuera hasta que `contexto` sepa
# contar las filas de esa tabla, y mientras tanto `sin_vigilancia()` las canta.
_VIGILADAS = frozenset({
    "potencia_pv1_w", "potencia_pv2_w", "potencia_total_wac",
    "voltaje_pv1_v", "voltaje_pv2_v", "voltaje_vac",
    "corriente_pv1_a", "corriente_pv2_a", "frecuencia_hz",
    "temp_inclinado", "temp_vertical", "temperatura_inversor_c",
    "irradiancia_incidente", "irradiancia_reflejada",
    "energia_hoy_wh", "energia_total_wh", "energia_pv1_wh", "energia_pv2_wh",
})


class VariableDesconocida(KeyError, ValueError):
    """Clave que no esta en el registro. `codigo` la identifica sin leer el texto.

    Hereda de las DOS a proposito. De `KeyError` porque es lo que uno espera al
    fallar una busqueda por clave; de `ValueError` porque es el parametro de quien
    pregunta el que esta mal, y la API traduce `ValueError` a 400. Sin la segunda,
    una clave mal escrita por el LLM salia como error 500 del servidor, o sea como
    si la culpa fuera nuestra.
    """

    codigo = "variable_desconocida"

    def __str__(self) -> str:
        # `KeyError.__str__` devuelve el repr del argumento, asi que el mensaje
        # saldria entre comillas y con las barras escapadas.
        return self.args[0] if self.args else ""


@dataclass(frozen=True)
class Variable:
    """Una variable medida, con donde vive y que valores puede tomar."""

    clave: str
    etiqueta: str
    unidad: str
    familia: str
    relacion: str | None = None
    columna: str | None = None
    #                       limites de validez fisica (None = sin limite por ese lado)
    minimo: float | None = None
    maximo: float | None = None
    arreglo: str | None = None
    #                       por que no se puede consultar, si es que no se puede
    fuente_ausente: str | None = None
    # Donde vive el dato SIN CORREGIR. None = variable derivada, no existe cruda.
    #
    # NO es un duplicado de `relacion`/`columna`, y la diferencia decide si una
    # prueba sirve o miente. Las vistas corregidas ANULAN lo que cae fuera de rango,
    # asi que la familia de validez fisica leida contra ellas sale vacia por
    # construccion: cero valores imposibles porque la vista ya los borro, no porque
    # el sensor estuviera bien. Esa prueba tiene que leer del crudo.
    # El analisis, al reves, lee siempre de la vista corregida.
    relacion_cruda: str | None = None
    columna_cruda: str | None = None   # None = se llama igual que `columna`
    # Tramo en que esta variable EXISTE. None = sin limite por ese lado.
    #
    # No es lo mismo que un hueco de datos y por eso vive en el catalogo y no se
    # deduce consultando: fuera de este tramo el dato no falta, es que el sensor no
    # estaba puesto o la vista lo anula por decision del equipo. Un grafico vacio
    # tiene que poder decir cual de las dos cosas le paso.
    dato_desde: date | None = None
    dato_hasta: date | None = None
    # Tramo INTERIOR sin dato, contado. No es lo mismo que `dato_desde`/`dato_hasta`
    # y por eso es un campo aparte: aquellos recortan el tramo por los extremos, y
    # esto es un agujero EN MEDIO, que no se puede expresar con un par de fechas.
    #
    # Se guarda como texto medido y no como fechas a proposito: no lo consume ningun
    # filtro (recortar la ventana por el hueco escondera el hueco, que es lo
    # contrario de lo que hace falta), lo consume quien LEE el numero. La energia AC
    # del tablero y el PR por contador se apoyan en columnas cuya cobertura tiene
    # cuatro meses en blanco, y ese hecho tiene que viajar con la respuesta en vez
    # de vivir en el docstring de un modulo.
    hueco: str | None = None

    @property
    def disponible(self) -> bool:
        return self.fuente_ausente is None

    @property
    def origen_crudo(self) -> tuple[str, str] | None:
        """(relacion, columna) sin corregir. None si la variable es derivada."""
        if self.relacion_cruda is None:
            return None
        return (self.relacion_cruda, self.columna_cruda or self.columna)

    @property
    def clave_calidad(self) -> str | None:
        """El nombre con que buscar sus hallazgos. None = el barrido no la vigila.

        ESTA PROPIEDAD EVITA EL PEOR MODO DE FALLO DEL PRODUCTO. `contexto.confianza`
        filtra `hallazgos_calidad` por nombre de variable. Si se le pasa la clave del
        catalogo tal cual, `irradiancia_incidente_wm2` no encuentra nada, porque la
        tabla guarda `irradiancia_incidente`. Cero hallazgos se lee como dato
        impecable: la confianza saldria perfecta justo cuando la irradiancia esta
        rota, que es exactamente al reves de para lo que existe el bloque.

        `None` no es lo mismo que "sin hallazgos": significa que nadie la reviso.
        Quien lo consuma tiene que poder decir esa diferencia.
        """
        crudo = self.origen_crudo
        return crudo[1] if crudo and crudo[1] in _VIGILADAS else None

    @property
    def fuente_calidad(self) -> str | None:
        """La tabla con que el barrido etiqueto sus hallazgos: siempre la cruda."""
        return self.relacion_cruda if self.clave_calidad else None


# Fechas de cobertura VERIFICADAS contra la base el 2026-08-28, no supuestas.
# La vista calibrada anula la irradiancia previa al 2025-07-01 por decision del
# equipo (el error del sensor se corrigio a mediados de 2025), asi que ese es el
# piso de todo lo que pasa por ella.
_IRRADIANCIA_VALIDA_DESDE = date(2025, 7, 1)
# El piranometro de reflejada se instalo despues que el de incidente: sin el no hay
# albedo. Cualquier analisis de albedo tiene 7 meses de ventana, no 19.
_REFLEJADA_DESDE = date(2025, 10, 25)
# El SP722 no es "desde mayo 2026" como dice la documentacion: corrio 18 dias y se
# detuvo, con 360 lecturas en total. Un grafico suyo sale vacio para casi cualquier
# rango que elija el usuario, y la razon es que el sensor apenas funciono.
_SP722_DESDE, _SP722_HASTA = date(2026, 5, 11), date(2026, 5, 28)
# La POA es modelada y solo se calculo desde aca.
_POA_DESDE = date(2025, 9, 5)

_T_ELECTRICO = "monitoreo_sc_electrico"
_T_RADIACION = "radiacion_sc_15s"
_T_CLEARSKY = "radiacion_sc_clearsky"


def _e(clave, etiqueta, unidad, **kw) -> Variable:
    """Variable electrica: vista corregida para analisis, tabla cruda para validez."""
    return Variable(clave, etiqueta, unidad, ELECTRICO, _V_ELECTRICO, clave,
                    relacion_cruda=_T_ELECTRICO, **kw)


def _r(clave, etiqueta, unidad, minimo, maximo, cruda,
       desde=_IRRADIANCIA_VALIDA_DESDE, hasta=None) -> Variable:
    """Variable de radiacion: la vista calibrada le pone sufijo, la tabla cruda no."""
    return Variable(clave, etiqueta, unidad, RADIACION, _V_RADIACION, clave,
                    minimo, maximo, relacion_cruda=_T_RADIACION, columna_cruda=cruda,
                    dato_desde=desde, dato_hasta=hasta)


_REGISTRO: tuple[Variable, ...] = (
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
    # ── Radiacion ────────────────────────────────────────────────────────────
    # El maximo 1500 W/m2 es el umbral de validez fisica del documento. La vista
    # calibrada agrega el sufijo `_wm2` a las irradiancias; la tabla cruda no.
    _r("irradiancia_incidente_wm2", "Irradiancia incidente", "W/m2", 0, 1500,
       "irradiancia_incidente"),
    _r("irradiancia_reflejada_wm2", "Irradiancia reflejada", "W/m2", 0, 1500,
       "irradiancia_reflejada", desde=_REFLEJADA_DESDE),
    _r("albedo", "Albedo", "adimensional", 0, 1, "albedo", desde=_REFLEJADA_DESDE),
    _r("irradiancia_incidente_sp722_wm2", "Irradiancia incidente SP722", "W/m2",
       0, 1500, "irradiancia_incidente_sp722", _SP722_DESDE, _SP722_HASTA),
    _r("irradiancia_reflejada_sp722_wm2", "Irradiancia reflejada SP722", "W/m2",
       0, 1500, "irradiancia_reflejada_sp722", _SP722_DESDE, _SP722_HASTA),
    _r("albedo_sp722", "Albedo SP722", "adimensional", 0, 1, "albedo_sp722",
       _SP722_DESDE, _SP722_HASTA),
    # El GHI de cielo despejado lo sirve la vista calibrada pero se calcula y se
    # guarda en su propia tabla, que es su crudo.
    Variable("cs_ghi_wm2", "GHI de cielo despejado (modelo)", "W/m2", RADIACION,
             _V_RADIACION, "cs_ghi_wm2", 0, 1500,
             relacion_cruda=_T_CLEARSKY),
    # kt* es un COCIENTE que la vista calcula al vuelo: no existe crudo en ninguna
    # tabla, y por eso `relacion_cruda` queda en None. Una prueba de validez fisica
    # sobre ella solo puede correr contra la vista, y hay que decirlo.
    Variable("kt_star", "Indice de claridad kt*", "adimensional", RADIACION,
             _V_RADIACION, "kt_star", 0, 1.3, dato_desde=_IRRADIANCIA_VALIDA_DESDE),
    # POA modelada. El documento la da por inexistente ("no tenemos en los planos
    # del arreglo") pero si existe, desde 2025-09-05. Es tabla, no vista: su crudo
    # es ella misma, y aun asi son valores MODELADOS, no medidos.
    Variable("poa_pv1_wm2", "POA efectiva PV1 (bifacial)", "W/m2", RADIACION,
             _T_POA, "poa_pv1_wm2", 0, 1500, INCLINADO, relacion_cruda=_T_POA,
             dato_desde=_POA_DESDE),
    Variable("poa_pv2_wm2", "POA efectiva PV2 (bifacial)", "W/m2", RADIACION,
             _T_POA, "poa_pv2_wm2", 0, 1500, VERTICAL, relacion_cruda=_T_POA,
             dato_desde=_POA_DESDE),
    # La MISMA transposicion contando solo la cara frontal. No es un detalle de
    # modelado: entre bifacial y frontal el PR del inclinado se mueve un 14 % y el
    # del vertical un 99 % (0,612 -> 1,217 anual, con 138 de 197 dias por encima de
    # 1, que es fisicamente imposible). `rendimiento.py` reporta las dos variantes
    # justamente porque elegir una seria elegir el veredicto, asi que las dos tienen
    # que estar en la allowlist. Estaban en uso en el SQL sin estar registradas.
    Variable("poa_pv1_front_wm2", "POA PV1 solo cara frontal", "W/m2", RADIACION,
             _T_POA, "poa_pv1_front_wm2", 0, 1500, INCLINADO, relacion_cruda=_T_POA,
             dato_desde=_POA_DESDE),
    Variable("poa_pv2_front_wm2", "POA PV2 solo cara frontal", "W/m2", RADIACION,
             _T_POA, "poa_pv2_front_wm2", 0, 1500, VERTICAL, relacion_cruda=_T_POA,
             dato_desde=_POA_DESDE),
    # ── Lo que el documento pide y la base NO tiene ──────────────────────────
    # Se registran para que las pruebas de validez fisica las reporten como
    # `sin_fuente` en vez de omitirlas: el hueco tiene que verse.
    Variable("humedad_relativa_pct", "Humedad relativa", "%", AMBIENTAL,
             minimo=0, maximo=100,
             fuente_ausente="ninguna tabla la contiene; el bloque abiotico (Fliwer, "
                            "nodos ESP32) no esta ingestado"),
    Variable("temperatura_ambiente_c", "Temperatura ambiente", "C", AMBIENTAL,
             minimo=-5, maximo=50,
             fuente_ausente="ninguna tabla la contiene; solo hay temperatura de "
                            "MODULO, que no es lo mismo"),
    Variable("velocidad_viento_ms", "Velocidad del viento", "m/s", AMBIENTAL, minimo=0,
             fuente_ausente="no hay anemometro en el sitio ni en las tablas del documento"),
    Variable("precipitacion_mm", "Precipitacion", "mm", AMBIENTAL, minimo=0,
             fuente_ausente="no hay pluviometro en el sitio ni en las tablas del documento"),
)

CATALOGO: dict[str, Variable] = {v.clave: v for v in _REGISTRO}


def _verificar_registro() -> None:
    """Guarda de importacion contra el olvido que ya se cometio una vez.

    Olvidar `relacion_cruda` en una variable no revienta nada: la deja como
    "derivada", sus hallazgos dejan de encontrarse y su confianza sale impecable.
    Es un fallo silencioso y en la direccion peligrosa. Paso de verdad con las tres
    temperaturas, que perdian sus 837 hallazgos reales por usar el constructor
    completo en vez del helper.

    Se comprueba al importar y no en un test porque el modulo es un REGISTRO: el
    error no esta en la logica sino en un dato mal escrito, y tiene que doler al
    escribirlo, no cuando alguien acuerde correr la suite.
    """
    huerfanas = [v.clave for v in _REGISTRO
                 if v.disponible and v.relacion_cruda is None and v.clave != "kt_star"]
    if huerfanas:
        raise RuntimeError(
            f"variables con fuente pero sin `relacion_cruda`: {', '.join(huerfanas)}. "
            f"Si de verdad son derivadas, exceptualas aca explicando por que"
        )
    perdidas = _VIGILADAS - {v.clave_calidad for v in _REGISTRO if v.clave_calidad}
    if perdidas:
        raise RuntimeError(
            f"el barrido vigila {', '.join(sorted(perdidas))} pero ninguna variable "
            f"del catalogo llega a ese nombre: sus hallazgos serian invisibles"
        )


_verificar_registro()


def obtener(clave: str) -> Variable:
    """La variable, o `VariableDesconocida`. Puerta unica: valida antes de tocar SQL."""
    try:
        return CATALOGO[clave]
    except KeyError:
        raise VariableDesconocida(
            f"variable {clave!r} no esta en el catalogo; validas: {', '.join(CATALOGO)}"
        ) from None


def disponibles(familia: str | None = None) -> list[Variable]:
    """Las que si tienen fuente, opcionalmente de una familia."""
    return [v for v in _REGISTRO
            if v.disponible and (familia is None or v.familia == familia)]


def para_confianza(*claves: str) -> tuple[list[str], str | None]:
    """Los argumentos `variables` y `fuente` que espera `calidad.contexto.confianza`.

    Puerta UNICA de esa traduccion. Existe porque hacerla a mano en cada modulo es
    justamente como aparecio el fallo que arreglo `clave_calidad`, y porque el modo
    de fallo es silencioso: no revienta, devuelve una confianza impecable.

    La `fuente` sale solo si TODAS las variables comparten tabla cruda. Con fuentes
    mezcladas devuelve None, que en `confianza` significa "mira las dos", y es lo
    correcto: un cruce irradiancia contra potencia no sirve si cualquiera de las dos
    esta rota.
    """
    variables = [obtener(c) for c in claves]
    vigiladas = [v.clave_calidad for v in variables if v.clave_calidad]
    fuentes = {v.fuente_calidad for v in variables if v.fuente_calidad}
    return vigiladas, (fuentes.pop() if len(fuentes) == 1 else None)


def cobertura(*claves: str) -> tuple[date | None, date | None]:
    """El tramo en que TODAS las claves existen a la vez. None = sin limite.

    Es la INTERSECCION, no la union, porque quien pide varias variables las quiere
    cruzar: la POA arranca el 2025-09-05 y el SP722 termina el 2026-05-28, asi que
    pedir las dos juntas deja una ventana util de dieciocho dias. Devolverlo ANTES
    de consultar permite decir "este par no se solapa" en vez de devolver una nube
    de cero puntos que se lee como que no hay correlacion.
    """
    variables = [obtener(c) for c in claves]
    desdes = [v.dato_desde for v in variables if v.dato_desde]
    hastas = [v.dato_hasta for v in variables if v.dato_hasta]
    return (max(desdes) if desdes else None, min(hastas) if hastas else None)


def fuera_de_cobertura(desde: date, hasta: date, *claves: str) -> str | None:
    """Por que la ventana no toca el tramo de las variables. None = si lo toca.

    `hasta` es EXCLUSIVO, igual que en `Ventana`.
    """
    inicio, fin = cobertura(*claves)
    if inicio and hasta <= inicio:
        return (f"la ventana termina el {hasta} y estas variables no existen antes "
                f"del {inicio}")
    if fin and desde > fin:
        return (f"la ventana empieza el {desde} y estas variables dejaron de "
                f"registrarse el {fin}")
    return None


def huecos(*claves: str) -> dict[str, str]:
    """Los tramos INTERIORES sin dato de esas claves. `{}` = ninguna tiene agujeros.

    `cobertura()` recorta por los extremos y no puede decir esto: `energia_total_wh`
    existe en 2025-10 y en 2026-03 pero no en los cuatro meses de en medio, y un
    total del periodo calculado sobre ese tramo es correcto y a la vez engañoso.
    Viaja en el payload, no en un filtro: recortar la ventana por el hueco lo
    escondería, que es lo contrario de lo que hace falta.
    """
    encontrados = {}
    for clave in claves:
        variable = obtener(clave)
        if variable.hueco:
            encontrados[clave] = variable.hueco
    return encontrados


def sin_vigilancia(*claves: str) -> list[str]:
    """Las claves que el barrido NO revisa. Su ausencia de hallazgos no dice nada.

    Se reporta aparte a proposito: "cero hallazgos" y "nadie la reviso" se ven igual
    en el bloque de confianza, y son cosas muy distintas.
    """
    return [c for c in claves if obtener(c).clave_calidad is None]
