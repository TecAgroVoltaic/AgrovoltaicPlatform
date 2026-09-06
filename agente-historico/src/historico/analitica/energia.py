"""La energia AC del tablero, leida de los CONTADORES del inversor (R7 de Leo).

R7, verbatim (2026-08-30): "Tenemos dos: energia_hoy y Energia total. Ambas son
energias totales en AC. Sera siempre un poco menor a la suma de las de PV1 y PV2
porque consideran las perdidas del inversor."

La casilla de energia NO sale de integrar la potencia DC. Sale de `energia_hoy_wh`
(se reinicia cada dia) y de `energia_total_wh` (contador de vida). Cuatro hechos
MEDIDOS contra produccion (`docs/referencia/medicion-energia-ac.md`) decidieron el
resto, y los cuatro son contraintuitivos:

**1. Las cuatro columnas `energia_*_wh` estan en kWh, pese al sufijo del nombre.**
Ver `KWH_POR_UNIDAD`. Es el error mas facil de cometer aca y vale un factor de mil.

**2. El hueco de cuatro meses del tablero AC no existe.** `energia_hoy_wh` tiene
13.922 lecturas en 118 dias entre nov-2025 y feb-2026, justo donde
`potencia_total_wac`, `energia_total_wh`, `energia_pv1_wh` y `energia_pv2_wh` estan
al 100% en NULL. Por eso la fuente primaria de la casilla es `energia_hoy_wh` y no
`energia_total_wh`: es la unica que cubre esa ventana. Espejo del mismo fenomeno:
noviembre 2024 tiene AC y cero DC.

**3. Hay DOS totales distintos y los dos son correctos.** "Cuanto registramos" y
"cuanto produjo la planta" son preguntas distintas y las dos importan, asi que las
dos salen con su nombre (ver `_SIGNIFICADO`). El contador de vida es el UNICO
numero del sistema que ve los huecos: de los 2.528,40 kWh que reconstruye, solo
905,55 caen en dias que tenemos registrados.

**4. Control de sanidad, y es la prediccion de Leo:** la razon AC/DC contador
contra contador da mediana 0,958 sobre 129 dias, por las perdidas del inversor. Si
el AC sale sistematicamente MAYOR que el DC, algo esta mal en la implementacion.
Va en el payload (`coherencia_ac_dc`) para que se pueda mirar sin correr un test.

Los timestamps son hora local de Costa Rica etiquetada `+00`: `timestamp::date` ya
da la fecha local y aca no hay ni un `AT TIME ZONE`. Ver `ventana.py`.
"""
from __future__ import annotations

from statistics import median

from historico import db
from historico.analitica import catalogo, contaminacion, resultado
from historico.analitica.correlacion import confianza_de
from historico.analitica.ventana import Ventana

# ── EL FACTOR MIL ────────────────────────────────────────────────────────────
#
# Las columnas se llaman `energia_hoy_wh`, `energia_total_wh`, `energia_pv1_wh` y
# `energia_pv2_wh`, y NO estan en Wh: **una unidad de esas columnas vale 1 kWh.**
# El sufijo `_wh` del nombre es incorrecto.
#
# Medido por dos vias independientes, no supuesto:
#   * Se integro `potencia_total_wac` (que si esta en W) dia a dia y se dividio
#     entre el cierre diario del contador: mediana 1.003,58 sobre 127 dias, con
#     dispersion menor al 1% (p25 999,04 / p75 1.008,07). Mil.
#   * El rendimiento especifico implicito (cierre / 2,84 kWp) da mediana 2,32 y
#     maximo exactamente 5,00 kWh/kWp/dia, que es el techo fisico de Costa Rica.
#
# Leidas como Wh, esas columnas darian 14 Wh de produccion diaria para 2.840 Wp:
# mil veces menos que lo fisicamente posible. Esta constante existe para que
# "corregir las unidades" dividiendo entre mil tenga que pasar por aca y rompa
# `test_un_dia_de_665_en_el_contador_son_665_kwh_y_no_milesimas`.
KWH_POR_UNIDAD = 1.0
UNIDAD = "kWh"

# Cuanto puede bajar un contador acumulativo sin que eso sea un reinicio.
#
# NO es un adorno defensivo. `energia_total_wh` no se reinicia NI UNA VEZ en las
# 19.889 lecturas de la serie, pero 37 pares consecutivos bajan del orden de
# -4,5e-13 kWh: ruido de coma flotante del `double precision`. Sin tolerancia el
# algoritmo lee esas 37 veces como reinicio, vuelve a sumar el contador entero y
# el total explota a 89.661 kWh, un absurdo para 2,84 kWp. Con tolerancia da
# 2.528,40, que es exactamente el ultimo menos el primero.
TOLERANCIA_REINICIO_KWH = 0.001

# Un dia entra a la comparacion AC/DC solo si el DC del dia supera esto. Debajo de
# medio kWh el cociente es ruido dividido por ruido (un dia con UNA sola fila daba
# razon 0,117 y no es una perdida del inversor, es un dia truncado).
DC_MINIMO_PARA_COMPARAR_KWH = 0.5

# Cada fila del store electrico cubre una ventana de 5 min: la integral de la
# potencia es sum(W) * 5/60 = Wh. Solo la usa el DC POR ARREGLO, que no tiene
# contador AC: el total del tablero se lee del contador y no se integra.
HORAS_POR_FILA = 5.0 / 60.0
WH_POR_KWH = 1000.0

INCLINADO, VERTICAL = "inclinado", "vertical"
# De que par de columnas del renglon diario sale la energia DC de cada arreglo.
_CAMPOS_DC = {INCLINADO: ("w_inclinado", "n_potencia_inclinado"),
              VERTICAL: ("w_vertical", "n_potencia_vertical")}

# De que columnas depende cada respuesta. Se le pasan a `confianza` para que el
# veredicto mire SOLO esas y no condene el periodo por una columna ajena rota.
COLUMNAS_AC = ["energia_hoy_wh", "energia_total_wh"]
COLUMNAS_DC = ["potencia_pv1_w", "potencia_pv2_w"]
COLUMNAS = COLUMNAS_AC + COLUMNAS_DC
# La tabla con cuyo nombre el barrido etiqueta sus hallazgos, que es la CRUDA y no
# la vista. Sale de `contaminacion` para que no haya dos literales que separar.
FUENTE = contaminacion.TABLA_CRUDA

def _aviso_vigilancia() -> str:
    """Que puede y que no puede castigar el bloque de confianza. DERIVADO, no escrito.

    Aca habia una frase a mano: "el barrido no revisa `energia_hoy_wh` ni
    `energia_total_wh`". Era cierta y dejo de serlo el 2026-08-31, cuando el catalogo
    registro las cuatro columnas de energia y las puso en `_VIGILADAS`. Se deriva del
    catalogo justamente para que una frase no pueda sobrevivir a la decision que
    describe, que es lo que le paso a la anterior: "cero hallazgos" y "nadie la miro"
    se ven igual en el payload, y afirmar la segunda cuando ya es falsa desperdicia
    la unica señal que distinguia los dos casos.
    """
    ciegas = catalogo.sin_vigilancia(*COLUMNAS)
    if ciegas:
        return (f"el barrido de calidad no revisa {', '.join(ciegas)}: que no tengan "
                f"hallazgos NO significa que esten sanas, significa que nadie las "
                f"reviso. La confianza de arriba solo puede castigar esas columnas "
                f"por hallazgos de dia entero")
    return ("el barrido de calidad SI revisa las columnas de las que sale esta "
            "respuesta: la confianza de arriba las castiga por sus propios hallazgos "
            "y no solo por los de dia entero. Un periodo sin hallazgos aca es un "
            "periodo revisado, no un periodo que nadie miro")


AVISO_VIGILANCIA = _aviso_vigilancia()

# ── La firma de la fila mezclada ─────────────────────────────────────────────
#
# El criterio ya no vive aca: es el de `analitica.contaminacion`, compartido con
# `rendimiento.py` y amarrado por test a la firma de `sql/003`. Lo que sigue siendo
# de este modulo es POR QUE hace falta, y es una sola frase: la contaminacion se
# filtra por FIRMA DE FILA y nunca por rango sobre la columna de energia. Los
# 39.328.367 de `max(energia_total_wh)` salen de UNA fila (`2025-10-07 07:45`), la
# misma que da 26.503.162 W de potencia; y el segundo registro sospechoso, el ultimo
# del 2026-03-09, entra por sus 121,3 A de `corriente_pv2_a`, no por sus 137,25 kWh.
# Un tope sobre la propia energia recortaria dias record legitimos y dejaria pasar
# filas mezcladas de valor pequeño.
#
# La firma se evalua por ANTI-JOIN y no por `NOT (firma)`: `NOT` sobre una firma con
# NULLs devuelve NULL, el `WHERE` lo trata como falso y se lleva medio historico por
# delante (la logica ternaria de SQL ya nos mordio una vez). Y lo que se anula es la
# COLUMNA, no la fila, igual que hara la vista: ver `contaminacion.anular`.
#
# MIGRACION PENDIENTE: `v_sc_electrico_corregido` hoy deja pasar las cuatro columnas
# de energia SIN NINGUN `CASE` y no descarta ni una fila (verificado con
# `pg_get_viewdef`: la vista "corregida" devuelve los mismos 39 MWh que la cruda).
# `sql/003_electrico_sin_falsos_positivos.sql` lo arregla. Cuando esa migracion este
# aplicada, el CTE `sucias` sobra: se borra y la consulta lee la vista directa.
_SQL_POR_DIA = f"""
    WITH {contaminacion.CTE_SUCIAS}, base AS (
        SELECT v."timestamp", v.potencia_pv1_w, v.potencia_pv2_w,
               {contaminacion.anular("energia_hoy_wh")},
               {contaminacion.anular("energia_total_wh")},
               {contaminacion.anular("energia_pv1_wh")},
               {contaminacion.anular("energia_pv2_wh")}
          FROM v_sc_electrico_corregido v
          {contaminacion.JOIN_SUCIAS}
         WHERE v."timestamp" >= %s AND v."timestamp" < %s
    )
    SELECT "timestamp"::date          AS dia,
           max(energia_hoy_wh)        AS ac_cierre,
           count(energia_hoy_wh)      AS n_ac,
           (array_agg(energia_total_wh ORDER BY "timestamp" ASC)
              FILTER (WHERE energia_total_wh IS NOT NULL))[1]  AS vida_primero,
           (array_agg(energia_total_wh ORDER BY "timestamp" DESC)
              FILTER (WHERE energia_total_wh IS NOT NULL))[1]  AS vida_ultimo,
           count(energia_total_wh)    AS n_vida,
           max(energia_pv1_wh)        AS dc_cierre_inclinado,
           max(energia_pv2_wh)        AS dc_cierre_vertical,
           count(energia_pv1_wh)      AS n_dc_inclinado,
           count(energia_pv2_wh)      AS n_dc_vertical,
           sum(potencia_pv1_w)        AS w_inclinado,
           sum(potencia_pv2_w)        AS w_vertical,
           count(potencia_pv1_w)      AS n_potencia_inclinado,
           count(potencia_pv2_w)      AS n_potencia_vertical,
           count(*)                   AS filas
      FROM base
     GROUP BY 1
     ORDER BY 1
"""

_SIGNIFICADO = {
    "registrada_kwh":
        "lo que QUEDO REGISTRADO: suma de los cierres diarios de `energia_hoy_wh` "
        "sobre los dias que tenemos. No incluye los dias sin CSV",
    "planta_kwh":
        "lo que PRODUJO LA PLANTA: el contador de vida `energia_total_wh` "
        "reconstruido. Incluye los dias que no tenemos, porque el contador siguio "
        "corriendo mientras nadie anotaba",
    "no_registrada_kwh":
        "la diferencia entre las dos: energia generada en dias que no tenemos. Es "
        "el UNICO numero del sistema que ve los huecos, y por eso no se esconde",
}


def a_kwh(unidades: float | None) -> float | None:
    """Traduce una lectura de los contadores `energia_*_wh` a kWh. Ver `KWH_POR_UNIDAD`."""
    return None if unidades is None else unidades * KWH_POR_UNIDAD


def _percentil(ordenados: list[float], q: float) -> float:
    """Percentil por rango mas cercano. Suficiente: es un control, no un estimador."""
    return ordenados[int(q * (len(ordenados) - 1))]


def reconstruir(tramos: list[tuple[float, float]],
                tolerancia: float = TOLERANCIA_REINICIO_KWH) -> dict:
    """Lo acumulado por un contador que se reinicia, desde (primero, ultimo) por dia.

    Puro, sin base de datos: aca vive el criterio y aca se prueba. `tramos` va en
    orden cronologico y solo trae los dias CON lectura del contador.

    Un contador acumulativo no se lee con `max()`: se suman sus incrementos y se
    tratan los saltos negativos como reinicios (R7 dice que `energia_total_wh` se
    reinicia al llegar a su maximo). El detalle que decide todo es la
    `tolerancia`: sin ella el ruido de -4,5e-13 kWh se lee 37 veces como reinicio
    y el total pasa de 2.528,40 a 89.661 kWh. Ver `TOLERANCIA_REINICIO_KWH`.

    Se miran los dos saltos posibles: el de DENTRO del dia (primero -> ultimo) y
    el que va de un dia con dato al siguiente, que puede cruzar meses sin CSV. Ese
    segundo salto es justamente el que hace visible lo generado en los huecos.
    """
    total = en_dias_registrados = 0.0
    reinicios = 0
    cierre_anterior: float | None = None
    for primero, ultimo in tramos:
        if cierre_anterior is not None:
            entre_dias = primero - cierre_anterior
            if entre_dias >= -tolerancia:
                total += max(entre_dias, 0.0)
            else:                                   # el contador se reinicio
                total += primero
                reinicios += 1
        crecimiento = ultimo - primero
        if crecimiento < -tolerancia:               # reinicio dentro del dia
            crecimiento = ultimo
            reinicios += 1
        crecimiento = max(crecimiento, 0.0)
        total += crecimiento
        en_dias_registrados += crecimiento
        cierre_anterior = ultimo
    return {"total": total, "en_dias_registrados": en_dias_registrados,
            "reinicios": reinicios, "dias": len(tramos)}


def cierres_ac(dias: list[dict]) -> list[float]:
    """El cierre diario de `energia_hoy_wh`, en kWh, de los dias que lo tienen.

    El cierre del dia es su MAXIMO, no su ultima fila. `energia_hoy_wh` es
    monotona creciente dentro del dia (232 de 270 dias no tienen ni un retroceso,
    y el peor de toda la serie es de 0,575 kWh: ruido de reporte, no un reinicio),
    asi que el maximo ES el cierre y ademas aguanta que la ultima fila del dia
    venga vacia o baja. El reinicio a cero del dia siguiente no puede leerse como
    caida porque nunca se compara un dia contra otro: se agrupa por fecha local.
    """
    return [a_kwh(d["ac_cierre"]) for d in dias
            if d.get("n_ac") and d.get("ac_cierre") is not None]


def tramos_vida(dias: list[dict]) -> list[tuple[float, float]]:
    """(primero, ultimo) de `energia_total_wh` por dia, en kWh y en orden."""
    return [(a_kwh(d["vida_primero"]), a_kwh(d["vida_ultimo"])) for d in dias
            if d.get("n_vida") and d.get("vida_primero") is not None]


def coherencia_ac_dc(dias: list[dict]) -> dict:
    """El control de sanidad de R7: el AC tiene que salir un poco MENOR que el DC.

    Contador contra contador y solo en los dias que tienen los dos, que es la
    unica comparacion honesta: la integracion de la potencia DC subestima (pesa
    cada fila a 5 minutos aunque el dia tenga huecos internos de 10 o 20), y
    contra ella el AC sale mayor sin que el AC tenga nada de malo. Cuanto
    subestima sale medido en `razon_integral_contador_dc`, para que la diferencia
    entre el total AC y la suma de los arreglos no se lea como un error.
    """
    razones = []
    dc_contador = dc_integrado = 0.0
    for d in dias:
        if not (d.get("n_ac") and d.get("n_dc_inclinado") and d.get("n_dc_vertical")):
            continue
        dc = a_kwh(d["dc_cierre_inclinado"] or 0.0) + a_kwh(d["dc_cierre_vertical"] or 0.0)
        ac = a_kwh(d["ac_cierre"])
        if ac is None or dc <= DC_MINIMO_PARA_COMPARAR_KWH:
            continue
        razones.append(ac / dc)
        dc_contador += dc
        dc_integrado += ((d.get("w_inclinado") or 0.0)
                         + (d.get("w_vertical") or 0.0)) * HORAS_POR_FILA / WH_POR_KWH
    razones.sort()
    n = len(razones)
    if not n:
        return {"razon_ac_dc": resultado.metrica(None, 0, "AC/DC"), "dias": 0,
                "cumple_r7": None,
                "razon_integral_contador_dc": resultado.metrica(
                    None, 0, "integral/contador"),
                "nota": "ningun dia del periodo tiene los contadores AC y DC a la vez"}
    mediana = median(razones)
    return {
        "razon_ac_dc": resultado.metrica(round(mediana, 3), n, "AC/DC"),
        "p05": round(_percentil(razones, 0.05), 3),
        "p95": round(_percentil(razones, 0.95), 3),
        "dias": n,
        # R7: "sera siempre un poco menor a la suma de las de PV1 y PV2 porque
        # consideran las perdidas del inversor". Si esto sale False, la sospecha
        # va sobre la implementacion antes que sobre el inversor.
        "cumple_r7": mediana < 1.0,
        # Cuanto SUBESTIMA la integral de la potencia DC contra los contadores DC
        # de los mismos dias: 0,923 medido sobre los 129 dias comparables de la
        # serie. La integral pesa cada fila a 5 min aunque el dia traiga huecos
        # internos de 10 o 20 minutos. (La medicion de referencia da 0,857 porque
        # ahi la integral pondera por el salto real al siguiente registro, que
        # ademas descuenta los tramos de 15 s. Las dos dicen lo mismo: la integral
        # queda por debajo de su propio contador.) Va aca porque es lo que explica
        # que el total AC del tablero salga MAYOR que la suma de las casillas por
        # arreglo sin que ninguno de los dos este mal.
        "razon_integral_contador_dc": resultado.metrica(
            round(dc_integrado / dc_contador, 3) if dc_contador else None,
            n, "integral/contador"),
        "nota": ("razon AC/DC contador contra contador, solo en dias con ambos: es la "
                 "unica comparacion honesta. R7 predice un poco menor que 1 por las "
                 "perdidas del inversor. `razon_integral_contador_dc` menor que 1 dice "
                 "cuanto subestima la integral de la potencia, que es la cuenta de las "
                 "casillas por arreglo"),
    }


def integral_dc(dias: list[dict], arreglo: str) -> dict:
    """Energia DC de un arreglo (kWh): integral de su potencia corregida a 5 min.

    Sigue siendo integral y no contador porque el inversor no reporta AC por
    arreglo, y porque `energia_pv1_wh`/`energia_pv2_wh` solo existen en 144 dias
    contra los 274 que si tienen potencia. Es la cuenta que SUBESTIMA cuando el
    dia trae huecos internos de 10 o 20 minutos (pesa cada fila a 5 min igual):
    por eso el total AC del tablero no se compara contra esto sino contra los
    contadores DC, en `coherencia_ac_dc`.

    Con n = 0 distingue "no hay filas" de "la columna vino vacia": noviembre 2024
    tiene AC y cero DC, que es un hueco de columna y no un dia sin datos.
    """
    campo_w, campo_n = _CAMPOS_DC[arreglo]
    n = sum(d.get(campo_n) or 0 for d in dias)
    if not n:
        motivo = (resultado.COLUMNA_AUSENTE if any(d.get("filas") for d in dias)
                  else resultado.SIN_LECTURAS)
        return resultado.metrica(None, 0, UNIDAD, motivo)
    vatios = sum(d.get(campo_w) or 0.0 for d in dias)
    return resultado.metrica(round(vatios * HORAS_POR_FILA / WH_POR_KWH, 2), n, UNIDAD)


def resumir(dias: list[dict]) -> dict:
    """Las dos energias AC del periodo, con su nombre y su significado. Puro.

    Las dos van juntas y ninguna se esconde: son preguntas distintas y la
    diferencia entre ellas es lo unico que mide los huecos del registro.
    """
    cierres = cierres_ac(dias)
    lecturas_ac = sum(d.get("n_ac") or 0 for d in dias)
    vida = reconstruir(tramos_vida(dias))
    lecturas_vida = sum(d.get("n_vida") or 0 for d in dias)
    hay_filas = any(d.get("filas") for d in dias)
    # Con filas pero sin lecturas, la columna vino vacia (nov-2025 a feb-2026 es
    # exactamente eso para `energia_total_wh`). Sin filas, no hubo dato ninguno.
    motivo = resultado.COLUMNA_AUSENTE if hay_filas else resultado.SIN_LECTURAS
    no_registrada = vida["total"] - vida["en_dias_registrados"]
    return {
        "registrada_kwh": resultado.metrica(
            round(sum(cierres), 2) if cierres else None, lecturas_ac, UNIDAD, motivo),
        "planta_kwh": resultado.metrica(
            round(vida["total"], 2) if lecturas_vida else None,
            lecturas_vida, UNIDAD, motivo),
        "no_registrada_kwh": resultado.metrica(
            round(no_registrada, 2) if lecturas_vida else None,
            lecturas_vida, UNIDAD, motivo),
        "dias_con_cierre_ac": len(cierres),
        "dias_con_contador_de_vida": vida["dias"],
        "reinicios_del_contador_de_vida": vida["reinicios"],
        "coherencia_ac_dc": coherencia_ac_dc(dias),
        "significado": _SIGNIFICADO,
    }


def por_dia(ventana: Ventana) -> list[dict]:
    """Un renglon por dia CON FILAS de la ventana, ya sin las filas mezcladas.

    Es la unica consulta del modulo, y devuelve el dia entero (AC, DC y potencia)
    para que la energia AC del tablero y la DC por arreglo salgan de la MISMA
    lectura: dos consultas con filtros que se desincronizan dan dos verdades.
    """
    desde, hasta = ventana.sql
    return db.query(_SQL_POR_DIA, (desde, hasta, desde, hasta))


def calcular(ventana: Ventana) -> dict:
    """La energia AC del periodo, con su bloque de confianza.

    La confianza se pide por CLAVE de catalogo (`confianza_de`) y no traduciendo a
    mano a nombre de columna: hacerlo a mano en cada modulo fue como aparecio el
    fallo que perdia 321 hallazgos de irradiancia. Aca la clave y la columna cruda
    se llaman igual, asi que hoy da lo mismo; hacerlo por la puerta unica es lo que
    hace que siga dando lo mismo si alguna vez dejan de llamarse igual.
    """
    # Las dos consultas del endpoint son INDEPENDIENTES, asi que salen a la vez: en
    # fila costaban dos viajes al pooler (~450 ms) para calcular exactamente lo
    # mismo. Ver `db.en_paralelo` y la cabecera de `historico.db`.
    confianza, dias = db.en_paralelo(
        lambda: confianza_de(ventana, *COLUMNAS_AC),
        lambda: por_dia(ventana),
    )
    confianza["vigilancia"] = AVISO_VIGILANCIA
    return resultado.sobre(
        ventana, confianza, **resumir(dias),
        # El hueco de cobertura viaja con el numero: `energia_total_wh` no existe
        # entre nov-2025 y feb-2026, y un total de ese periodo es correcto y a la vez
        # engañoso si nadie dice de donde falta.
        cobertura=catalogo.huecos(*COLUMNAS_AC),
    )
