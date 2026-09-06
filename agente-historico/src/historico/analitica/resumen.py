"""Los 9 KPIs de cabecera del dashboard (Fig. 2 del documento de evaluacion).

Ultima actualizacion, energia del periodo y de los ultimos 7 dias (total y por
arreglo) y rendimiento especifico por arreglo. Cuatro decisiones que no son de estilo:

1. **La energia del tablero es AC y sale de los CONTADORES del inversor**, no de
   integrar la potencia DC. Es R7 de Leo Cardinale (2026-08-30) y ademas es lo
   unico que llena el tablero entre nov-2025 y feb-2026, donde `potencia_total_wac`
   esta al 100% en NULL y `energia_hoy_wh` tiene 13.922 lecturas en 118 dias. Toda
   esa cuenta vive en `analitica.energia`, que es tambien donde esta explicado por
   que esas columnas estan en kWh pese a llamarse `_wh`.
2. **Los "ultimos 7 dias" se cuentan contra el ULTIMO DIA CON DATOS DE LA VENTANA**,
   no contra hoy. Si la ventana no llega hasta hoy, o el logger se atraso, contra hoy
   los tres KPIs de 7 dias saldrian en cero, que es indistinguible de "el sistema no
   genero nada".
3. **La energia POR ARREGLO sigue siendo DC** (integral de `potencia_pv1_w` y
   `potencia_pv2_w`): las casillas 4 a 9 preguntan por el Inclinado y el Vertical,
   y el inversor no reporta AC por arreglo. Por eso el total AC y la suma de los
   dos arreglos no tienen por que coincidir, y el bloque `energia_ac` trae el
   control AC/DC que dice si la diferencia es la esperada.
4. **La frescura (`actualizacion`) se mide sobre TODA la base y NO sobre la ventana.**
   Es la unica casilla del tablero que responde una pregunta sobre el SISTEMA
   ("¿la planta sigue reportando?") y no sobre el periodo elegido. Ver la nota
   larga de `evaluar_frescura`: acotarla al rango es un error que se comete solo.

El SQL vive entero en `analitica.energia.por_dia` (una sola consulta, un renglon
por dia) y el criterio en las funciones puras de abajo (`evaluar_frescura`,
`cierre_del_periodo`, `ventana_reciente`, `tramo`, `energias`, `rendimiento` y
`componer`), que se prueban sin base de datos.
"""
from __future__ import annotations

from datetime import date, timedelta

from historico import cache, db
from historico.analitica import energia, resultado
from historico.analitica.ventana import DIA, Ventana, crear, ultimos_dias
from historico.calidad import contexto

# Wp instalados por arreglo (4 x 355 Wp bifaciales). El rendimiento especifico
# (kWh/kWp) divide por esta potencia expresada en kWp.
POTENCIA_NOMINAL_WP = 1420.0
_KWP_POR_ARREGLO = POTENCIA_NOMINAL_WP / 1000.0

DIAS_VENTANA_RECIENTE = 7
DIAS_POR_ANO = 365

# A partir de cuantos dias sin reportar la frescura deja de ser un dato neutro. El
# logger graba a diario: un par de dias de atraso es operacion normal, una semana
# es que el sistema se detuvo y todo KPI de abajo habla de un pasado, no del hoy.
DIAS_ANTIGUEDAD_TOLERABLE = 2
DIAS_ANTIGUEDAD_ALARMANTE = 7

AL_DIA, REZAGADA, DETENIDA, SIN_DATOS = "al_dia", "rezagada", "detenida", "sin_datos"

# De que columnas depende esta respuesta: se le pasa a `confianza` para que el
# veredicto mire SOLO estas y no condene el periodo por una columna ajena rota.
# Van las cuatro porque el tablero mezcla las dos familias: el total es AC de
# contador y las casillas por arreglo son DC de potencia.
COLUMNAS = energia.COLUMNAS
_FUENTE = "monitoreo_sc_electrico"

# Que cuenta como "hay dato del inversor". Las dos consultas de abajo comparten
# este filtro: mira tambien las columnas de energia y no solo la potencia, porque
# entre nov-2025 y feb-2026 hay dias en que el inversor solo dejo `energia_hoy_wh`,
# y un "ultimo dato" que ignore esa columna puede atrasar el tablero meses.
_HAY_DATO = """(potencia_pv1_w IS NOT NULL OR potencia_pv2_w IS NOT NULL
            OR energia_hoy_wh IS NOT NULL OR energia_total_wh IS NOT NULL)"""

# SIN filtro de fechas, y es el punto entero de esta correccion: alimenta
# `actualizacion`, que habla del sistema y no del periodo (ver `evaluar_frescura`).
_SQL_ULTIMO_GLOBAL = f"""
    SELECT max("timestamp") AS ultimo
      FROM v_sc_electrico_corregido
     WHERE {_HAY_DATO}
"""

# Con filtro de fechas. Alimenta DOS cosas del periodo y ninguna alarma: la ventana
# de los "ultimos 7 dias" y el bloque informativo `ultimo_dato_del_periodo`.
_SQL_ULTIMO_EN_VENTANA = f"""
    SELECT max("timestamp") AS ultimo
      FROM v_sc_electrico_corregido
     WHERE "timestamp" >= %s AND "timestamp" < %s
       AND {_HAY_DATO}
"""

# La frescura global no depende de la ventana, asi que TODA peticion al tablero
# (cualquier rango, y tambien la tool del agente) pregunta exactamente lo mismo. La
# clave es constante: una sola entrada sirve a todas, y la coalescencia de
# `historico.cache` hace que N peticiones simultaneas cuesten UNA consulta. El TTL
# de segundos es de sobra: es una antiguedad medida en DIAS.
_CACHE = cache.registrar(cache.CacheBreve())
_CLAVE_ULTIMO_GLOBAL = "resumen.ultimo_global"

_NOTA = (
    "el total del periodo es AC, leido del contador `energia_hoy_wh` del inversor "
    "(R7 de Leo Cardinale), NO la integral de la potencia. Las casillas por arreglo "
    "SI son DC integrada, porque el inversor no reporta AC por arreglo: por eso el "
    "total AC y la suma de los dos arreglos no coinciden, y "
    "`energia_ac.coherencia_ac_dc` dice si la diferencia es la esperada. `energia_ac` "
    "trae ademas las DOS energias que el sistema puede responder (la que quedo "
    "registrada y la que produjo la planta) con su significado. El rendimiento "
    "anualizado se normaliza por DIAS CON DATOS (`dias_con_datos`), no por "
    "calendario: los dias sin reportar son un hueco de logging y no de generacion. "
    "Cuanto del periodo se midio esta en `confianza`."
)


def _dia(marca: str) -> date:
    """La fecha local de una marca de tiempo. Sin conversion de zona (ver ventana.py)."""
    return date.fromisoformat(marca[:10])


def evaluar_frescura(ultimo_global: str | None, hoy: date) -> dict:
    """Que tan viejo es el ultimo dato de TODA la base. Puro, sin DB.

    ## `ultimo_global` es global A PROPOSITO, y por eso no se acota a la ventana

    Esta casilla contesta "¿la planta esta reportando?". Es una propiedad del
    SISTEMA, no del periodo que el usuario eligio mirar: quien analiza enero de 2025
    no esta preguntando si la planta se cayo en enero de 2025, esta mirando un
    historico.

    Calculada dentro del rango, CUALQUIER ventana que no toque el presente dispara
    una alarma falsa de sistema caido, porque el ultimo registro de esa ventana es
    viejo por definicion. No es hipotetico: con la version acotada, pedir
    `desde=2026-05-03&hasta=2026-06-02` respondia "detenida, 92 dias sin reportar"
    teniendo dato de ayer, y con ese texto se le reporto al equipo una averia que no
    existia. Acotarlo al rango parece lo consistente (todo lo demas del tablero SI se
    acota) y por eso es un error que se comete solo: si alguien vuelve a pasarle aca
    el maximo de la ventana, el tablero vuelve a mentir de la misma forma.

    El ultimo dato DENTRO de la ventana es informacion legitima del periodo, pero es
    otra pregunta y viaja por otro lado, sin alarma: ver `cierre_del_periodo`.
    """
    if not ultimo_global:
        return {"ultimo_dato": None, "antiguedad_dias": None, "estado": SIN_DATOS,
                "alarmante": True, "umbral_alarmante_dias": DIAS_ANTIGUEDAD_ALARMANTE,
                "mensaje": "no hay ni una lectura del inversor en toda la base"}
    antiguedad = max((hoy - _dia(ultimo_global)).days, 0)
    if antiguedad >= DIAS_ANTIGUEDAD_ALARMANTE:
        estado = DETENIDA
    elif antiguedad > DIAS_ANTIGUEDAD_TOLERABLE:
        estado = REZAGADA
    else:
        estado = AL_DIA
    return {
        "ultimo_dato": ultimo_global, "antiguedad_dias": antiguedad, "estado": estado,
        "alarmante": estado == DETENIDA,
        "umbral_alarmante_dias": DIAS_ANTIGUEDAD_ALARMANTE,
        "mensaje": (f"sin datos nuevos hace {antiguedad} dias, sobre un umbral de "
                    f"{DIAS_ANTIGUEDAD_ALARMANTE}: el sistema dejo de reportar"
                    if estado == DETENIDA else None),
    }


def cierre_del_periodo(ultimo_en_ventana: str | None) -> dict:
    """Hasta donde llega el dato DENTRO de la ventana pedida. Sin alarma, a proposito.

    Es informacion util (quien mira mayo puede querer saber que su ventana termina
    el 1 de junio) y es legitima, pero es una pregunta del PERIODO. Por eso no trae
    `estado`, `antiguedad_dias` ni `alarmante`: cualquier campo con forma de semaforo
    terminaria pintado como "el sistema dejo de reportar", que es exactamente el
    defecto que `actualizacion` deshace. La frescura del sistema esta alla y se
    calcula sobre toda la base.
    """
    return {
        "ultimo_dato": ultimo_en_ventana,
        "nota": ("hasta donde llega el dato DENTRO de la ventana pedida. NO dice si "
                 "el sistema sigue reportando: eso es `actualizacion`, que se calcula "
                 "sobre toda la base y no sobre el rango."),
    }


def ventana_reciente(ventana: Ventana, ultimo: str | None) -> Ventana | None:
    """Los ultimos `DIAS_VENTANA_RECIENTE` dias contra el ULTIMO DIA CON DATOS.

    `ultimo` es el ultimo dato DE LA VENTANA (no el global): estos KPIs describen el
    periodo pedido, asi que su tramo tiene que caer dentro de el. Con el global, una
    ventana historica daria siete dias de hoy que no tocan el periodo y los tres KPIs
    saldrian vacios.

    El fin es exclusivo, asi que va un dia despues del ultimo con dato para
    incluirlo. Nunca se sale por la izquierda de la ventana pedida.
    """
    if not ultimo:
        return None
    fin = _dia(ultimo) + timedelta(days=1)
    reciente = ultimos_dias(DIAS_VENTANA_RECIENTE, fin)
    return reciente if reciente.desde >= ventana.desde else crear(ventana.desde, fin, DIA)


def tramo(dias: list[dict], ventana: Ventana | None) -> list[dict]:
    """Los renglones diarios que caen en la ventana. Recorte en memoria, sin ir a la DB.

    La ventana reciente siempre es un subconjunto de la pedida, asi que las dos
    salen de la MISMA consulta: dos viajes con dos filtros son dos oportunidades
    de que el total del periodo y el de los ultimos 7 dias dejen de ser
    comparables. `d["dia"]` es una fecha ISO y su orden alfabetico es el
    cronologico, asi que el recorte es una comparacion de textos y nada mas.
    """
    if ventana is None:
        return []
    desde, hasta = ventana.sql
    return [d for d in dias if desde <= d["dia"] < hasta]


def energias(dias: list[dict], ac: dict) -> dict:
    """Las tres energias del tablero: total AC del inversor y DC por arreglo.

    El total NO es la suma de los dos arreglos. Es la cuenta AC del propio
    inversor, que es lo que pide R7 y lo unico que existe en los cuatro meses en
    que las columnas DC vinieron vacias. `ac` llega ya resumido (ver
    `analitica.energia.resumir`) para no calcular dos veces lo mismo.
    """
    return {
        "total_ac_kwh": ac["registrada_kwh"],
        "inclinado_kwh": energia.integral_dc(dias, energia.INCLINADO),
        "vertical_kwh": energia.integral_dc(dias, energia.VERTICAL),
    }


def rendimiento(energia_arreglo: dict, dias_con_datos: int) -> dict:
    """kWh/kWp acumulado del periodo y su tasa anual, desde una metrica de kWh.

    El documento deja abierta la unidad de tiempo ("definir mensual o anual"), asi
    que se reportan las dos y con el nombre diciendo cual es cual.

    **El divisor del anualizado son los DIAS CON DATOS, no los de calendario**, y la
    diferencia no es cosmetica: sobre todo el historico hay 569 dias de calendario y
    274 con datos, asi que el arreglo inclinado da 416 kWh/kWp/año contra calendario
    y 864 contra dias con datos (el mismo orden que los 896 de diciembre 2025, un mes
    completo). Los 295 dias que faltan son un hueco de LOGGING, no de generacion: no
    sabemos que la planta no genero, sabemos que nadie lo anoto. Dividir por el
    calendario mezcla desempeño de la planta con disponibilidad del registrador y
    castiga a la planta por un fallo del datalogger, que no es lo que se pidio. Sobre
    cuanto se calculo viaja aparte, en el bloque `confianza`.
    """
    motivo = energia_arreglo.get("motivo", resultado.SIN_LECTURAS)
    if energia_arreglo["valor"] is None or not dias_con_datos:
        return {"periodo_kwh_kwp": resultado.metrica(None, 0, "kWh/kWp", motivo),
                "anualizado_sobre_dias_con_datos_kwh_kwp_ano":
                    resultado.metrica(None, 0, "kWh/kWp/ano", motivo)}
    por_kwp = energia_arreglo["valor"] / _KWP_POR_ARREGLO
    return {
        "periodo_kwh_kwp": resultado.metrica(round(por_kwp, 2),
                                             energia_arreglo["n"], "kWh/kWp"),
        "anualizado_sobre_dias_con_datos_kwh_kwp_ano": resultado.metrica(
            round(por_kwp * DIAS_POR_ANO / dias_con_datos, 1),
            energia_arreglo["n"], "kWh/kWp/ano"),
    }


def componer(ultimo_global: str | None, ultimo_en_ventana: str | None,
             dias_periodo: list[dict], dias_reciente: list[dict],
             dias_con_datos: int, hoy: date) -> dict:
    """Los 9 KPIs a partir de los renglones YA traidos. Puro: aca vive el criterio.

    Los DOS ultimos datos entran por separado y no se pueden confundir: el global
    manda en `actualizacion` (el sistema) y el de la ventana en
    `ultimo_dato_del_periodo` (el periodo). Ver `evaluar_frescura`.
    """
    ac_periodo = energia.resumir(dias_periodo)
    energia_periodo = energias(dias_periodo, ac_periodo)
    energia_reciente = energias(dias_reciente, energia.resumir(dias_reciente))
    return {
        "actualizacion": evaluar_frescura(ultimo_global, hoy),
        "ultimo_dato_del_periodo": cierre_del_periodo(ultimo_en_ventana),
        "energia_periodo": energia_periodo,
        "energia_reciente": energia_reciente,
        "rendimiento_especifico": {
            "inclinado": rendimiento(energia_periodo["inclinado_kwh"], dias_con_datos),
            "vertical": rendimiento(energia_periodo["vertical_kwh"], dias_con_datos),
        },
        # Las DOS energias AC con su significado, mas el control AC/DC de R7. Va
        # entero y no recortado: "cuanto registramos" y "cuanto produjo la planta"
        # son preguntas distintas, y su diferencia es el unico numero que ve los huecos.
        "energia_ac": ac_periodo,
        "dias_con_datos": dias_con_datos,
        "dias_ventana_reciente": DIAS_VENTANA_RECIENTE,
        "nota": _NOTA,
    }


def ultimo_global() -> str | None:
    """El ultimo dato del inversor en TODA la base, cacheado. None si no hay ninguno.

    Va aparte y no fusionada con la consulta de la ventana (un `FILTER` habria dado
    las dos en un viaje) por dos razones: asi no puede volver a colarse el filtro de
    fechas sobre la frescura, y asi la respuesta se puede cachear, que es lo que la
    hace gratis. La consulta pesa lo mismo que un `SELECT 1` (medido: 235 ms contra
    210 ms, todo latencia del pooler), asi que en paralelo no mueve el reloj.
    """
    return _CACHE.obtener(_CLAVE_ULTIMO_GLOBAL,
                          lambda: db.uno(_SQL_ULTIMO_GLOBAL).get("ultimo"))


def calcular(ventana: Ventana, hoy: date | None = None) -> dict:
    """Los 9 KPIs del dashboard para la ventana pedida, con su bloque de confianza."""
    desde, hasta = ventana.sql
    # Las CUATRO consultas del tablero son independientes entre si (la ventana
    # reciente se deriva del ultimo dato de la ventana, pero eso es aritmetica de
    # fechas y no otra consulta), asi que van juntas: en fila serian cuatro viajes al
    # pooler, ~900 ms de reloj solo en latencia. Ver `db.en_paralelo` y la cabecera de
    # `historico.db`. NO anidar: ninguna de las cuatro puede abrir su propia tanda.
    #
    # La cuarta es la frescura GLOBAL, sin filtro de fechas. Sale en la misma tanda
    # (nunca en fila detras de las otras) y ademas viene cacheada, asi que en la
    # practica no agrega viaje: ver `ultimo_global`.
    #
    # `confianza` ya cuenta los dias con datos del periodo: se reusa como divisor
    # del anualizado en vez de contarlos aparte, porque dos cuentas distintas de lo
    # mismo terminan discrepando y nadie lo nota hasta que ya decidio algo.
    fila, dias, confianza, global_ = db.en_paralelo(
        lambda: db.uno(_SQL_ULTIMO_EN_VENTANA, (desde, hasta)),
        lambda: energia.por_dia(ventana),
        lambda: contexto.confianza(desde, hasta, COLUMNAS, _FUENTE),
        ultimo_global,
    )
    en_ventana = fila.get("ultimo")
    reciente = ventana_reciente(ventana, en_ventana)
    confianza["vigilancia"] = energia.AVISO_VIGILANCIA
    return resultado.sobre(
        ventana, confianza,
        **componer(global_, en_ventana, dias, tramo(dias, reciente),
                   confianza["dias_con_datos"], hoy or date.today()),
        ventana_reciente=reciente.como_dict() if reciente else None,
    )
