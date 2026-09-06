"""Vertical contra Inclinado: el eje 1 del documento y el analisis de mas valor.

Las dos configuraciones tienen la MISMA potencia instalada (1.420 Wp por arreglo)
y ven el mismo cielo, asi que toda diferencia entre ellas es geometria: PV1 va
inclinado 20 grados a 150 de azimut y PV2 vertical a 90/50. Este modulo pone las
dos lado a lado sobre una misma ventana: energia por periodo, curva de generacion
horaria, Performance Ratio, relacion energia-irradiancia y donde se separan.

El archivo pasa de las 150 lineas de referencia y es a proposito: es UNA sola
responsabilidad (comparar los dos arreglos) que el documento pide con cinco
respuestas que solo significan algo juntas, y el encargo no permite abrir un
modulo mas bajo `analitica/`. La consulta esta separada de la decision: todo el
criterio vive en `reducir()` y sus ayudantes, que se prueban sin base de datos.

DOS PRECISIONES QUE NO SE PUEDEN AFLOJAR:

  * La curva horaria usa `extract(hour from timestamp)` SIN convertir zona. Los
    timestamps son hora local de Costa Rica etiquetada `+00`; un `AT TIME ZONE`
    correria el perfil seis horas y pondria el pico de generacion a las seis de la
    tarde. Ver el encabezado de `ventana.py`.
  * **El PR es DIARIO Y MENSUAL, no de 5 minutos, y no se calcula aca.** Sale de
    `analitica.rendimiento`, que es el metodo que fijo Leo Cardinale el 2026-08-30
    (R1): "para el performance_ratio... mas interesante analizarlo en periodos mas
    largos como dia o mes; no cada 5 min". Este modulo llama a esa funcion en vez de
    repetir la cuenta, y por eso no puede dar un numero distinto del de la tool
    `performance_ratio`. Hasta el 2026-08-31 aca vivia un PR propio calculado sobre
    ventanas de 5 min: dos definiciones del mismo indicador conviviendo, que es peor
    que una mala, porque el experto ve dos numeros para lo mismo y no sabe cual creer.

Lo que SI se queda a 5 minutos es el EMPAREJAMIENTO PUNTO A PUNTO entre arreglos
(`emparejamiento_5min`), que el mismo R1 avala explicitamente "cuando vayamos a
hacer algun analisis punto a punto cada 5 min". Ahi no hay ningun PR: hay energia e
insolacion sobre las mismas ventanas y su cociente, que es otra pregunta.

Y una que el documento pide y los datos no sostienen: la ESTACIONALIDAD. Hay 274
dias de un calendario de 569, con huecos de 126 y 71 dias seguidos. Comparar el
"enero" de un año contra un febrero al que le faltan tres semanas no mide
estaciones, mide cobertura. Solo se reportan los meses que llegan al minimo, y
cuando no alcanzan se dice en vez de dibujar una curva anual inventada.
"""
from __future__ import annotations

import calendar
from datetime import date

from historico import db
from historico.analitica import catalogo, rendimiento, resultado
from historico.analitica.correlacion import confianza_de
from historico.analitica.ventana import MES, TRUNC, Ventana

# La potencia instalada por arreglo sale de `rendimiento`, que es donde vive el PR:
# dos copias del mismo 1.420 Wp pueden separarse, y una sola no.
P0_WP = rendimiento.P0_WP
HORAS_POR_LECTURA = 5.0 / 60.0    # misma integral que tools/energia.py: 1 fila = 5 min
WH_POR_KWH = 1000.0
# Un mes entra a la comparacion estacional solo si tiene datos en esta fraccion de
# sus dias. Por debajo, la diferencia entre dos meses es la cobertura, no la estacion.
COBERTURA_MENSUAL_MINIMA = 0.6
MESES_MINIMOS = 2
INCLINADO, VERTICAL = rendimiento.INCLINADO, rendimiento.VERTICAL

# De que variables depende la respuesta, en claves del CATALOGO (el catalogo las
# traduce al nombre con que el barrido las conoce). `confianza` las mira UNA POR UNA:
# sin esto una columna rota ajena (la frecuencia, el DS18B20 muerto) condena el
# periodo entero. Las dos POA van en la lista aunque el barrido NO las vigile,
# justamente para que el bloque lo diga: el PR depende de ellas y nadie las revisa.
#
# Son las MISMAS que mira `rendimiento`, y a proposito: desde que el PR de aca es el
# suyo, las dos respuestas dependen del mismo dato y tienen que declarar lo mismo.
CLAVES_POA = rendimiento.CLAVES_POA
CLAVES = list(rendimiento.CLAVES)

_SQL_ENERGIA = """
    SELECT date_trunc(%s, "timestamp") AS periodo,
           sum(potencia_pv1_w) * %s AS energia_inclinado_wh,
           sum(potencia_pv2_w) * %s AS energia_vertical_wh,
           count(potencia_pv1_w)     AS n_inclinado,
           count(potencia_pv2_w)     AS n_vertical,
           count(DISTINCT "timestamp"::date) AS dias_con_datos
      FROM v_sc_electrico_corregido
     WHERE "timestamp" >= %s AND "timestamp" < %s
     GROUP BY 1 ORDER BY 1
"""

# Sin conversion de zona horaria: `extract(hour ...)` YA devuelve la hora local.
_SQL_CURVA = """
    SELECT extract(hour from "timestamp")::int AS hora,
           avg(potencia_pv1_w) AS inclinado_w,
           avg(potencia_pv2_w) AS vertical_w,
           count(potencia_pv1_w) AS n_inclinado,
           count(potencia_pv2_w) AS n_vertical
      FROM v_sc_electrico_corregido
     WHERE "timestamp" >= %s AND "timestamp" < %s
     GROUP BY 1 ORDER BY 1
"""

# El EMPAREJAMIENTO PUNTO A PUNTO a 5 minutos, que R1 avala para este uso y NO para
# el PR. `pr_pv1 IS NOT NULL` se usa como SELECTOR DE FILA y no como valor: en
# `v_sc_performance` esa columna esta definida solo donde la POA supera 100 W/m2 y la
# potencia no es negativa, que es exactamente el par utilizable. Asi energia e
# insolacion cubren las MISMAS ventanas de 5 min; si no, el cociente compara periodos
# distintos. De aca no sale ningun Performance Ratio.
_SQL_EMPAREJADO = """
    SELECT sum(potencia_pv1_w) FILTER (WHERE pr_pv1 IS NOT NULL) AS potencia_inclinado,
           sum(poa_pv1_wm2)    FILTER (WHERE pr_pv1 IS NOT NULL) AS poa_inclinado,
           sum(potencia_pv2_w) FILTER (WHERE pr_pv2 IS NOT NULL) AS potencia_vertical,
           sum(poa_pv2_wm2)    FILTER (WHERE pr_pv2 IS NOT NULL) AS poa_vertical,
           count(*) FILTER (WHERE pr_pv1 IS NOT NULL) AS n_inclinado,
           count(*) FILTER (WHERE pr_pv2 IS NOT NULL) AS n_vertical
      FROM v_sc_performance
     WHERE "timestamp" >= %s AND "timestamp" < %s
"""


def _totales(periodos: list[dict], campo: str) -> float | None:
    valores = [f[campo] for f in periodos if f.get(campo) is not None]
    return sum(valores) if valores else None


def _suma(periodos: list[dict], campo: str) -> int:
    return sum(f.get(campo) or 0 for f in periodos)


def _arreglo_total(periodos: list[dict], sufijo: str) -> dict:
    """Energia acumulada y rendimiento especifico (kWh/kWp) de un arreglo."""
    energia_wh = _totales(periodos, f"energia_{sufijo}_wh")
    n = _suma(periodos, f"n_{sufijo}")
    especifico = None if energia_wh is None else energia_wh / P0_WP
    return {
        "energia_wh": resultado.metrica(energia_wh and round(energia_wh, 1), n, "Wh"),
        "rendimiento_especifico_kwh_kwp": resultado.metrica(
            especifico and round(especifico, 3), n, "kWh/kWp"),
        "lecturas": n,
    }


def comparar_totales(inclinado: dict, vertical: dict) -> dict:
    """Cual genero mas y cuanto, en una linea. Sin los dos valores no hay veredicto."""
    a, b = inclinado["energia_wh"]["valor"], vertical["energia_wh"]["valor"]
    if a is None or b is None:
        return {"ganador": None, "diferencia_wh": None, "diferencia_pct": None,
                "lectura": "no se pueden comparar: a uno de los dos arreglos le falta energia"}
    ganador, perdedor = (INCLINADO, VERTICAL) if a >= b else (VERTICAL, INCLINADO)
    mayor, menor = max(a, b), min(a, b)
    pct = None if menor == 0 else round((mayor - menor) / menor * 100.0, 1)
    return {
        "ganador": ganador, "diferencia_wh": round(mayor - menor, 1), "diferencia_pct": pct,
        "lectura": (f"el arreglo {ganador} genero {round((mayor - menor) / WH_POR_KWH, 2)} kWh "
                    f"mas que el {perdedor}" + (f" ({pct}% mas)" if pct is not None else "")),
    }


def _rangos(horas: list[int]) -> str:
    """'6, 7, 8, 17' -> '6-8, 17'. Una franja se lee de un vistazo; una lista no."""
    if not horas:
        return "ninguna"
    tramos, inicio, previa = [], horas[0], horas[0]
    for hora in horas[1:] + [None]:
        if hora != previa + 1:
            tramos.append(f"{inicio}-{previa}" if inicio != previa else f"{inicio}")
            inicio = hora
        previa = hora
    return ", ".join(tramos)


def separacion_horaria(curva: list[dict]) -> dict:
    """En que horas se separan los dos arreglos y cuanto. PURA.

    Es la pregunta de fondo del eje 1: el vertical no compite en el mediodia, pero
    puede ganarle al inclinado en las puntas del dia, y eso es lo que justifica la
    configuracion. Un total diario lo esconde; esta franja lo muestra.
    """
    comparables = [f for f in curva
                   if f.get("inclinado_w") is not None and f.get("vertical_w") is not None]
    if not comparables:
        return {"horas_comparables": 0, "gana_inclinado": [], "gana_vertical": [],
                "pico_inclinado": None, "pico_vertical": None,
                "lectura": "no hay ni una hora con las dos potencias medidas"}
    diferencias = {f["hora"]: f["inclinado_w"] - f["vertical_w"] for f in comparables}
    gana_inc = sorted(h for h, d in diferencias.items() if d > 0)
    gana_ver = sorted(h for h, d in diferencias.items() if d < 0)
    mejor_inc = max(diferencias.items(), key=lambda par: par[1])
    mejor_ver = min(diferencias.items(), key=lambda par: par[1])
    return {
        "horas_comparables": len(comparables),
        "gana_inclinado": gana_inc, "gana_vertical": gana_ver,
        "pico_inclinado": {"hora": mejor_inc[0], "diferencia_w": round(mejor_inc[1], 1)},
        "pico_vertical": {"hora": mejor_ver[0], "diferencia_w": round(-mejor_ver[1], 1)},
        "lectura": (f"el inclinado aventaja al vertical en las horas {_rangos(gana_inc)} "
                    f"(maximo en la {mejor_inc[0]}) y el vertical en las horas "
                    f"{_rangos(gana_ver)} (maximo en la {mejor_ver[0]})"),
    }


def _dias_del_mes(periodo: str) -> int:
    mes = date.fromisoformat(periodo[:10])
    return calendar.monthrange(mes.year, mes.month)[1]


def estacionalidad(meses: list[dict]) -> dict:
    """Comparacion mes a mes, SOLO con los meses que tienen cobertura. PURA."""
    evaluados = []
    for fila in meses:
        cobertura = round((fila.get("dias_con_datos") or 0) / _dias_del_mes(fila["periodo"]), 3)
        evaluados.append({
            "mes": fila["periodo"][:7], "cobertura": cobertura,
            "dias_con_datos": fila.get("dias_con_datos") or 0,
            "energia_inclinado_wh": fila.get("energia_inclinado_wh"),
            "energia_vertical_wh": fila.get("energia_vertical_wh"),
        })
    comparables = [m for m in evaluados if m["cobertura"] >= COBERTURA_MENSUAL_MINIMA]
    descartados = [{"mes": m["mes"], "cobertura": m["cobertura"],
                    "motivo": "cobertura_insuficiente"}
                   for m in evaluados if m["cobertura"] < COBERTURA_MENSUAL_MINIMA]
    suficiente = len(comparables) >= MESES_MINIMOS
    return {
        "suficiente": suficiente, "meses": comparables, "descartados": descartados,
        "cobertura_minima": COBERTURA_MENSUAL_MINIMA,
        "advertencia": None if suficiente else (
            f"no se puede hablar de estacionalidad: solo {len(comparables)} mes(es) llegan "
            f"al {int(COBERTURA_MENSUAL_MINIMA * 100)}% de dias con datos. El historico tiene "
            f"274 dias de un calendario de 569, con huecos de 126 y 71 dias seguidos"),
    }


def _emparejado_arreglo(fila: dict, sufijo: str, motivo: str) -> dict:
    """Energia, insolacion y su cociente sobre las ventanas de 5 min EMPAREJADAS.

    **Aca no hay ningun Performance Ratio y es deliberado.** Hasta el 2026-08-31
    esta funcion devolvia un `pr` calculado a 5 minutos, mientras `tools/performance`
    calculaba el PR diario de R1: dos numeros distintos con el mismo nombre. El PR
    se fue entero a `analitica.rendimiento`; lo que queda es el emparejamiento fino,
    que R1 avala para analisis punto a punto y que responde otra pregunta.

    `kwh_por_kwh_m2` es cuanta energia entrega el arreglo por cada kWh/m2 que recibe
    en su plano. Es dimensional (kWp x adimensional), no un PR, y por eso se puede
    seguir reportando sin ambiguedad.
    """
    potencia, poa = fila.get(f"potencia_{sufijo}"), fila.get(f"poa_{sufijo}")
    n = fila.get(f"n_{sufijo}") or 0
    hay_par = poa and potencia is not None
    insolacion = poa / WH_POR_KWH * HORAS_POR_LECTURA if hay_par else None
    energia_kwh = potencia * HORAS_POR_LECTURA / WH_POR_KWH if hay_par else None
    por_irradiancia = None if not insolacion else energia_kwh / insolacion
    return {
        "insolacion_kwh_m2": resultado.metrica(
            insolacion and round(insolacion, 3), n, "kWh/m2", motivo),
        "energia_emparejada_kwh": resultado.metrica(
            energia_kwh and round(energia_kwh, 3), n, "kWh", motivo),
        "kwh_por_kwh_m2": resultado.metrica(
            por_irradiancia and round(por_irradiancia, 3), n, "kWh por kWh/m2", motivo),
        "lecturas": n,
    }


def pr_diario(dias_pr: list[dict], motivo_poa: str,
              cobertura_poa: str | None = None) -> dict:
    """El PR de los dos arreglos por el metodo DIARIO de R1. PURA, y prestada.

    No calcula nada por su cuenta: evalua los dias con el criterio de
    `analitica.rendimiento` y agrega con su matriz. Es la unica forma de garantizar
    que el comparativo y la tool `performance_ratio` no puedan divergir; cualquier
    reimplementacion, por fiel que naciera, se separa en el primer arreglo que se le
    haga a una sola de las dos.

    Van las seis variantes (3 insumos x 2 fuentes de energia) y no la "mejor",
    porque el veredicto DEPENDE del insumo y de forma asimetrica: entre POA bifacial
    y frontal el PR del inclinado se mueve un 14 % y el del vertical un 99 %. Elegir
    una por dentro seria elegir quien gana la comparacion, que es justo la pregunta
    que este modulo tiene que dejar abierta.
    """
    evaluados = [rendimiento.evaluar_dia(fila) for fila in dias_pr]
    validos = [dia for dia in evaluados if dia["valido"]]
    desde_poa, hasta_poa = catalogo.cobertura(*CLAVES_POA)
    return {
        "metodo": "diario_y_mensual",
        **rendimiento.resumen_pr(rendimiento.matriz(validos, motivo_poa)),
        "dias": {"con_dato": len(evaluados), "validos": len(validos),
                 "descartados": len(evaluados) - len(validos)},
        "cobertura": {"desde": desde_poa and desde_poa.isoformat(),
                      "hasta": hasta_poa and hasta_poa.isoformat(),
                      "fuera_de_cobertura": cobertura_poa,
                      # El codigo de motivo solo cuando de verdad apaga algo: un
                      # motivo puesto siempre se lee como que siempre pasa algo.
                      "motivo": motivo_poa if cobertura_poa else None,
                      "insumos_afectados": list(rendimiento.INSUMOS_PROVISIONALES)},
        "nota": ("PR por DIA y por MES (R1 de Leo Cardinale, 2026-08-30), la misma "
                 "cuenta y las mismas filas que la tool `performance_ratio`: energia "
                 "del dia contra irradiacion integrada del dia, agregada al periodo "
                 "ponderando por energia. NO es una metrica de 5 minutos. El detalle "
                 "por dia, por mes y el respaldo de cada variante se piden con esa "
                 "tool. Las variantes contra POA son PROVISIONALES (R2 espera a Hugo) "
                 "y un PR > 1 es fisicamente imposible: viaja marcado."),
    }


def reducir(periodos: list[dict], curva: list[dict], dias_pr: list[dict],
            meses: list[dict], granularidad: str, emparejado: dict | None = None,
            cobertura_poa: str | None = None) -> dict:
    """Todo el comparativo, sin base de datos. Aca vive la decision.

    `dias_pr` son los renglones diarios que sirve `rendimiento.consultar`, y de ahi
    sale el PR. `emparejado` es el renglon unico del cruce punto a punto a 5 min.

    `cobertura_poa` es el motivo legible de que la ventana no toque el tramo con
    POA, o None si si lo toca. Ya NO apaga el bloque de PR entero: apaga las cuatro
    variantes que dependen de la POA y deja vivas las dos contra GHI, que no
    necesitan transposicion. Antes del 2025-09-05 el comparativo se quedaba sin
    ningun PR, y era un PR que si se podia calcular.
    """
    totales = {INCLINADO: _arreglo_total(periodos, INCLINADO),
               VERTICAL: _arreglo_total(periodos, VERTICAL)}
    motivo_poa = (resultado.FUERA_DE_COBERTURA if cobertura_poa
                  else resultado.SIN_LECTURAS)
    emparejado = emparejado or {}
    return {
        "granularidad": granularidad,
        "por_periodo": periodos,
        "totales": totales,
        "diferencia": comparar_totales(totales[INCLINADO], totales[VERTICAL]),
        "curva_horaria": curva,
        "separacion_horaria": separacion_horaria(curva),
        "rendimiento": pr_diario(dias_pr, motivo_poa, cobertura_poa),
        "emparejamiento_5min": {
            INCLINADO: _emparejado_arreglo(emparejado, INCLINADO, motivo_poa),
            VERTICAL: _emparejado_arreglo(emparejado, VERTICAL, motivo_poa),
            "nota": ("cruce punto a punto sobre las MISMAS ventanas de 5 min, que es "
                     "el uso que R1 le da al emparejamiento fino. NO es un Performance "
                     "Ratio: el PR va arriba, por dia y por mes"),
        },
        "estacionalidad": estacionalidad(meses),
    }


def arreglos(ventana: Ventana) -> dict:
    """Compara el arreglo inclinado (PV1) contra el vertical (PV2) en la ventana."""
    # Fuera del tramo con POA no hay un PR malo contra POA: no hay PR contra POA, y
    # se dice distinto. Se comprueba ANTES de consultar el emparejamiento, porque un
    # cociente sobre cero pares se lee igual que uno nulo de verdad. El PR contra GHI
    # no depende de la POA y se calcula igual. Es una comprobacion PURA (mira el
    # catalogo, no la base), asi que no cuesta un viaje ni obliga a esperar a nadie.
    sin_poa = catalogo.fuera_de_cobertura(ventana.desde, ventana.hasta, *CLAVES_POA)
    por_mes = ventana.granularidad == MES

    # Este es el endpoint mas ANCHO de la consola: hasta seis consultas, todas
    # independientes entre si. En fila eran seis viajes al pooler (~1,35 s de puro
    # ida y vuelta) para un calculo que despues tarda milisegundos. Juntas cuestan
    # uno. Ver `db.en_paralelo` y la cabecera de `historico.db`.
    #
    # Las dos que pueden no hacer falta se sustituyen por una constante en vez de
    # sacarlas de la lista: asi el desempaquetado de abajo no cambia de forma segun
    # la ventana, que es donde se colaria un resultado en la variable equivocada.
    periodos, curva, meses_crudos, emparejado, dias_pr, confianza = db.en_paralelo(
        lambda: db.query(_SQL_ENERGIA,
                         (TRUNC[ventana.granularidad], HORAS_POR_LECTURA,
                          HORAS_POR_LECTURA) + ventana.sql),
        lambda: db.query(_SQL_CURVA, ventana.sql),
        lambda: ([] if por_mes else
                 db.query(_SQL_ENERGIA, (TRUNC[MES], HORAS_POR_LECTURA,
                                         HORAS_POR_LECTURA) + ventana.sql)),
        lambda: ({} if sin_poa else db.uno(_SQL_EMPAREJADO, ventana.sql)),
        lambda: rendimiento.consultar(ventana),
        lambda: confianza_de(ventana, *CLAVES),
    )
    # Con granularidad mensual los meses SON los periodos: se reusa la misma lista
    # en vez de pedirla dos veces, igual que antes.
    meses = periodos if por_mes else meses_crudos

    calculado = reducir(periodos, curva, dias_pr, meses,
                        ventana.granularidad, emparejado, sin_poa)
    return resultado.sobre(
        ventana, confianza, **calculado,
        nota=("PV1 = inclinado (20 grados / azimut 150), PV2 = vertical (90 / 50), "
              "1.420 Wp cada uno. La energia es la integral de la potencia corregida a "
              "5 min. La curva horaria esta en hora LOCAL de Costa Rica (los timestamps "
              "ya lo estan; no se convierte zona). El PR es DIARIO Y MENSUAL (R1) y sale "
              "de `analitica.rendimiento`: es el mismo numero que da la tool "
              "`performance_ratio`, nunca uno propio calculado cada 5 min."),
    )
