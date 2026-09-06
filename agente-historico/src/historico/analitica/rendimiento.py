"""Performance Ratio DIARIO Y MENSUAL: el metodo que fijo Leo Cardinale en R1.

El PR deja de ser una metrica de 5 minutos. La energia del dia sale de los
acumuladores del inversor y se divide entre la irradiacion integrada de ese mismo
dia; los dias se agregan a mes y a periodo ponderando por energia (IEC 61724):

    PR = (E_dia_kWh / 1,420 kWp) / (H_dia_kWh_m2 / 1 kW/m2)
    PR_periodo = sum(E) / (P0_kWp * sum(H))

Cinco decisiones que no son de estilo. Todas estan medidas contra la base, con los
numeros en `docs/referencia/medicion-pr-diario.md`:

1. **`Irradiancia*5/60` se generaliza a `Irradiancia*(dt_real/3600)`.** Es lo unico
   en que este modulo se aparta de la letra de R1; el porque, con su numero, esta
   junto a `TECHO_DT_SEG`.
2. **Los acumuladores estan en kWh pese al sufijo `_wh`**, son DIARIOS y se
   reinician a medianoche: el valor del dia es el MAXIMO del dia.
3. **El contador es el camino principal y la integral el RESPALDO DECLARADO.** No se
   mezclan jamas en el mismo numero: cada variante se agrega sobre SU propio conjunto
   de dias y sale etiquetada (`fuente_energia`).
4. **Los dias con cobertura insuficiente se descartan**, y el criterio que de verdad
   filtra es el tercero (`DESFASE_MAXIMO_H`).
5. **El PR contra POA es PROVISIONAL** (R2 lo dejo esperando a Hugo) y un PR > 1 sale
   MARCADO, nunca callado.

El archivo pasa de las 150 lineas de referencia, igual que `comparativa.py` y por la
misma razon: es UNA responsabilidad (el PR agregado por periodo) que solo significa
algo con sus tres insumos y sus dos fuentes de energia puestos uno al lado del otro.
La consulta vive en `_SQL_DIARIO` y toda la DECISION en las funciones puras de abajo
(`integrar`, `evaluar_dia`, `variante`, `matriz`, `componer`), que se prueban sin DB.
"""
from __future__ import annotations

from datetime import datetime

from historico import db
from historico.analitica import catalogo, contaminacion, resultado
from historico.analitica.correlacion import confianza_de
from historico.analitica.ventana import Ventana

# ── Constantes fisicas del sitio (brief seccion 6) ──────────────────────────────
P0_WP = 1420.0                       # 4 x 355 Wp bifaciales por arreglo
KWP_POR_ARREGLO = P0_WP / 1000.0
WH_POR_KWH = 1000.0
SEGUNDOS_POR_HORA = 3600.0

INCLINADO, VERTICAL = "inclinado", "vertical"   # PV1 = 20/150, PV2 = 90/50

# ── La generalizacion del 5/60 de R1 ────────────────────────────────────────────
# La cadencia NOMINAL del store: la unica que hace verdadera la formula literal de
# Leo, y solo el 21% de las filas de radiacion la cumple (las demas van a 15, 30,
# 45, 60, 75, 315 o 330 s).
CADENCIA_NOMINAL_SEG = 300
# Techo del dt, el doble de la nominal: el mismo criterio de "intervalo excesivo"
# que ya usa el barrido de calidad. SIN techo, el salto nocturno de 40.200 s se
# integraria como once horas de sol.
TECHO_DT_SEG = 2 * CADENCIA_NOMINAL_SEG
# La ultima fila del dia no tiene siguiente: se le acredita la cadencia nominal.
DT_ULTIMA_FILA_SEG = CADENCIA_NOMINAL_SEG
# Horas que la formula LITERAL de R1 atribuye a cada fila, mida lo que mida.
HORAS_FORMULA_LITERAL = 5.0 / 60.0

# POR QUE NO SE IMPLEMENTA EL `5/60` LITERAL, con el numero que lo justifica:
# sobre la ventana util infla la irradiacion un +83,6% (factor 1,84x), pero el error
# CAMBIA DE SIGNO segun el mes: +860% en octubre 2025 (cadencia real de 15 y 60 s)
# contra -6,6% en diciembre 2025 (cadencia real de 315 s, no 300). En marzo-junio
# 2026, cuando la cadencia SI es de 300 s, las dos formulas coinciden dentro del
# 0,2% y Leo tiene razon exacta. Un sesgo que cambia de signo no se descuenta con
# una constante: aplicada literal, la formula le inventa a la serie una
# estacionalidad falsa de un orden de magnitud, dictada por cuando cambio la
# cadencia del registrador y no por el sol (octubre se leeria como "los paneles se
# estropearon" y diciembre como "el invierno rinde mejor"). El modulo calcula IGUAL
# la version literal y la publica en `error_formula_literal`: apartarse de lo que
# pidio Leo obliga a mostrar cuanto costaba obedecerlo, no a esconder la diferencia.

# ── Criterio de dia valido, contra `ventana_solar.horas_sol` ────────────────────
COBERTURA_MINIMA = 0.90
# El criterio que DE VERDAD filtra, y el unico que no es obvio: dos coberturas
# aceptables por separado pueden cubrir tramos distintos del dia. Caso real, el
# 2026-03-09: 4,97 h de radiacion contra 9,67 h de electrico.
DESFASE_MAXIMO_H = 0.5

SIN_RADIACION = "sin_radiacion"
SIN_ELECTRICO = "sin_electrico"
SIN_VENTANA_SOLAR = "sin_ventana_solar"
COBERTURA_INSUFICIENTE = "cobertura_insuficiente"
DESFASE_EXCESIVO = "desfase_excesivo"

# ── Limite fisico del PR ────────────────────────────────────────────────────────
# Ningun arreglo entrega mas energia que la luz que recibe por kWp instalado. Un PR
# por encima de esto NO es un buen resultado: es la prueba de que el insumo de
# irradiancia de ese arreglo esta mal. Con POA frontal sola el vertical da 1,217
# anual y supera 1 en 138 de 197 dias, con maximo 3,19.
PR_MAXIMO_FISICO = 1.0

# ── Contaminacion que la vista corregida todavia no limpia ──────────────────────
# `v_sc_electrico_corregido` aplica CASE a voltaje, corriente, potencia y
# temperatura pero PASA LAS CUATRO COLUMNAS DE ENERGIA SIN TOCAR, asi que las filas
# del piranometro mezcladas entran enteras (203.194,6 en `energia_pv1_wh` y
# 39.328.367,1 en `energia_total_wh`; la del 2026-03-09 trae 137,25 en
# `energia_hoy_wh`).
#
# El criterio es la FIRMA DE FILA compartida (`analitica.contaminacion`), la misma
# que usa `energia.py` y la misma que aplicara la vista. Antes aca habia una lista
# de dos timestamps fijos: atrapaba las dos filas sucias CONOCIDAS y ninguna de las
# que apareciera despues. La firma no depende de haber ido a buscarlas una por una.
#
# MIGRACION: `sql/003_electrico_sin_falsos_positivos.sql` mete esta misma firma en
# la vista. Cuando este aplicada, el CTE `sucias` y su anti-join se retiran de esta
# consulta y el resultado no cambia. Hasta entonces son la unica defensa.
#
# El tope por VALOR es otra cosa y se queda: es lo unico de que dispone
# `cierre_del_contador`, que recibe una sola columna y no puede mirar el resto de la
# fila. Sale del catalogo para que no haya dos numeros que puedan separarse.
MAXIMO_CONTADOR_DIARIO_KWH = catalogo.obtener("energia_pv1_wh").maximo

# ── Las dos fuentes de energia y los tres insumos de irradiancia ────────────────
CONTADOR, INTEGRAL = "contador", "integral"
FUENTES_ENERGIA = (CONTADOR, INTEGRAL)

GHI, POA_BIFACIAL, POA_FRONTAL = "ghi", "poa_bifacial", "poa_frontal"
INSUMOS = (GHI, POA_BIFACIAL, POA_FRONTAL)
# Los dos que dependen de una transposicion MODELADA y que R2 dejo esperando a Hugo.
INSUMOS_PROVISIONALES = (POA_BIFACIAL, POA_FRONTAL)

# insumo -> (columna de irradiacion del inclinado, la del vertical). Contra GHI el
# denominador es el MISMO para los dos arreglos, asi que PR1/PR2 es identico a
# E1/E2: mide cuanta energia da cada geometria, no que tan bien convierte. Es la
# variante que describe R1 y la unica que no depende de un modelo.
_CAMPO_IRRADIACION = {
    GHI: ("ghi_wh_m2", "ghi_wh_m2"),
    POA_BIFACIAL: ("poa1_bif_wh_m2", "poa2_bif_wh_m2"),
    POA_FRONTAL: ("poa1_front_wh_m2", "poa2_front_wh_m2"),
}
# fuente -> (columna del inclinado, la del vertical, factor a kWh)
_CAMPO_ENERGIA = {
    CONTADOR: ("e1_contador_kwh", "e2_contador_kwh", 1.0),
    INTEGRAL: ("e1_integral_wh", "e2_integral_wh", 1.0 / WH_POR_KWH),
}

# Claves del CATALOGO de las que depende la respuesta. `confianza` las mira UNA POR
# UNA: sin esto una columna rota ajena condena el periodo entero.
CLAVES_POA = ("poa_pv1_wm2", "poa_pv2_wm2")
# Los contadores del camino PRINCIPAL. Van en `CLAVES` desde que el catalogo los
# registra y los vigila: sin ellos `confianza` no podia castigar nunca la ruta de
# calculo que este modulo declara principal, y respondia por la integral de la
# potencia como si fuera el unico insumo.
CLAVES_CONTADOR = ("energia_pv1_wh", "energia_pv2_wh")
CLAVES = ["potencia_pv1_w", "potencia_pv2_w", *CLAVES_CONTADOR,
          "irradiancia_incidente_wm2", *CLAVES_POA]

_CAMPOS_DEL_DIA = ("dia", "valido", "motivos_descarte", "cobertura_radiacion",
                   "cobertura_electrico", "desfase_h", "horas_sol", "horas_rad",
                   "horas_ele", "ghi_wh_m2", "e1_contador_kwh", "e2_contador_kwh",
                   "e1_integral_wh", "e2_integral_wh")

_SQL_DIARIO = f"""
    WITH {contaminacion.CTE_SUCIAS}, rad AS (
        SELECT r."timestamp"::date AS dia,
               r.irradiancia_incidente_wm2 AS ghi,
               p.poa_pv1_wm2, p.poa_pv2_wm2,
               p.poa_pv1_front_wm2, p.poa_pv2_front_wm2,
               LEAST(COALESCE(EXTRACT(epoch FROM (
                        lead(r."timestamp") OVER (PARTITION BY r."timestamp"::date
                                                  ORDER BY r."timestamp")
                        - r."timestamp")), %s), %s) AS dt
          FROM v_sc_radiacion_calibrada r
          LEFT JOIN radiacion_sc_poa p USING ("timestamp")
         WHERE r."timestamp" >= %s AND r."timestamp" < %s
           AND r.irradiancia_incidente_wm2 IS NOT NULL
           -- `radiacion_sc_poa` esta construida SOLO sobre filas qc_ok. Sin este
           -- filtro el GHI se integraria sobre una rejilla mas ancha que la POA y
           -- los dos denominadores dejarian de hablar del mismo dia (el 2025-09-22
           -- daria 14.738 Wh/m2, fisicamente imposible).
           AND r.qc_ok
    ), rad_dia AS (
        SELECT dia,
               count(*)                              AS n_radiacion,
               sum(dt) / 3600.0                      AS horas_rad,
               sum(ghi * dt) / 3600.0                AS ghi_wh_m2,
               sum(ghi) * %s                         AS ghi_wh_m2_literal,
               sum(poa_pv1_wm2 * dt) / 3600.0        AS poa1_bif_wh_m2,
               sum(poa_pv2_wm2 * dt) / 3600.0        AS poa2_bif_wh_m2,
               sum(poa_pv1_front_wm2 * dt) / 3600.0  AS poa1_front_wh_m2,
               sum(poa_pv2_front_wm2 * dt) / 3600.0  AS poa2_front_wh_m2
          FROM rad GROUP BY dia
    ), ele AS (
        SELECT e."timestamp"::date AS dia,
               e.potencia_pv1_w, e.potencia_pv2_w,
               -- La vista corregida todavia no limpia la energia: hasta que se
               -- aplique `sql/003_electrico_sin_falsos_positivos.sql`, las dos
               -- columnas de contador se anulan aca con la firma compartida. Se
               -- anula la COLUMNA y no la fila, que es lo que hara la vista: la
               -- fila conserva su potencia y su marca, y por lo tanto el `dt` que
               -- esa marca define. Descartarla movia `horas_ele`.
               {contaminacion.anular("energia_pv1_wh", fila="e")},
               {contaminacion.anular("energia_pv2_wh", fila="e")},
               LEAST(COALESCE(EXTRACT(epoch FROM (
                        lead(e."timestamp") OVER (PARTITION BY e."timestamp"::date
                                                  ORDER BY e."timestamp")
                        - e."timestamp")), %s), %s) AS dt
          FROM v_sc_electrico_corregido e
          {contaminacion.JOIN_SUCIAS}
         WHERE e."timestamp" >= %s AND e."timestamp" < %s
    ), ele_dia AS (
        SELECT dia,
               count(*)                          AS n_electrico,
               sum(dt) / 3600.0                  AS horas_ele,
               sum(potencia_pv1_w * dt) / 3600.0 AS e1_integral_wh,
               sum(potencia_pv2_w * dt) / 3600.0 AS e2_integral_wh,
               -- "el total acumulado al final de dia" (R1). Es un contador DIARIO
               -- que se reinicia a medianoche, asi que el MAXIMO del dia es su
               -- cierre: el reinicio de las 00:00 abre el dia SIGUIENTE en 0 y no
               -- entra aca, y un retroceso intra-dia (reinicio del inversor al
               -- amanecer) no borra lo que ya se habia acumulado.
               max(energia_pv1_wh) FILTER (WHERE energia_pv1_wh <= %s) AS e1_contador_kwh,
               max(energia_pv2_wh) FILTER (WHERE energia_pv2_wh <= %s) AS e2_contador_kwh
          FROM ele GROUP BY dia
    )
    SELECT COALESCE(r.dia, e.dia)::text AS dia, v.horas_sol,
           r.n_radiacion, r.horas_rad, r.ghi_wh_m2, r.ghi_wh_m2_literal,
           r.poa1_bif_wh_m2, r.poa2_bif_wh_m2, r.poa1_front_wh_m2, r.poa2_front_wh_m2,
           e.n_electrico, e.horas_ele, e.e1_integral_wh, e.e2_integral_wh,
           e.e1_contador_kwh, e.e2_contador_kwh
      FROM rad_dia r
      FULL JOIN ele_dia e ON e.dia = r.dia
      LEFT JOIN ventana_solar v ON v.fecha = COALESCE(r.dia, e.dia)
     ORDER BY 1
"""

_NOTA = (
    "PR diario y mensual (metodo de Leo Cardinale, R1 del 2026-08-30), NO la metrica "
    "de 5 minutos. La irradiacion del dia se integra con el dt REAL entre lecturas "
    "acotado a un techo, y no con el `5/60` literal: la cadencia de la radiacion va de "
    "15 a 330 s y la formula literal infla octubre 2025 un +860% y desinfla diciembre "
    "un -6,6% (ver `error_formula_literal`). El contador de energia es el camino "
    "principal y la integral de la potencia el RESPALDO: cada uno se agrega sobre SU "
    "propio conjunto de dias y nunca se mezclan en el mismo numero. Las variantes "
    "contra POA son PROVISIONALES: R2 dejo la ecuacion de transposicion esperando a "
    "Hugo. Un PR > 1 es fisicamente imposible y viaja marcado."
)


def _r(valor: float | None, decimales: int) -> float | None:
    return None if valor is None else round(valor, decimales)


# ── La regla del dt, en Python: referencia ejecutable de lo que hace el SQL ─────
def integrar(lecturas: list[tuple[datetime, float | None]],
             techo_seg: float = TECHO_DT_SEG,
             dt_ultima_seg: float = DT_ULTIMA_FILA_SEG) -> dict:
    """Integra una serie instantanea a su unidad-hora con dt REAL acotado. PURA.

    Es la definicion autoritativa de la generalizacion del `5/60`, y el gemelo del
    `LEAST(COALESCE(lead(ts) - ts, DT_ULTIMA_FILA_SEG), TECHO_DT_SEG)` que el SQL
    ejecuta sobre la base por velocidad. Vive aca en Python porque esta regla ES la
    decision del modulo (es donde nos apartamos de la letra de R1), y una decision
    que solo se puede comprobar con la base de produccion delante no se comprueba.
    Las dos constantes salen de las mismas variables que interpola el SQL, asi que
    no hay dos numeros que puedan desincronizarse: hay uno.

    `lecturas` son pares (marca, valor) de UN dia; el salto nocturno no entra porque
    la particion es por dia, igual que en la consulta.
    """
    ordenadas = sorted(lecturas, key=lambda par: par[0])
    total, horas, n = 0.0, 0.0, 0
    for i, (marca, valor) in enumerate(ordenadas):
        siguiente = ordenadas[i + 1][0] if i + 1 < len(ordenadas) else None
        crudo = (siguiente - marca).total_seconds() if siguiente else dt_ultima_seg
        dt = min(crudo, techo_seg)
        horas += dt / SEGUNDOS_POR_HORA
        if valor is not None:
            total += valor * dt / SEGUNDOS_POR_HORA
            n += 1
    return {"total": total, "horas": horas, "n": n}



def cierre_del_contador(lecturas: list[tuple[datetime, float | None]]) -> float | None:
    """Con cuanto cierra el dia un acumulador DIARIO. PURA. Gemelo del `max()` del SQL.

    Es el MAXIMO del dia, y no el ultimo valor ni la diferencia entre extremos:

      * el acumulador **se reinicia a medianoche**, y ese salto negativo separa dos
        dias, no es una caida. Nunca se cuenta como tal porque las lecturas se
        agrupan por dia ANTES de llegar aca, igual que el `GROUP BY dia` del SQL;
      * un retroceso INTRA-dia si existe (reinicio del inversor al amanecer, caso
        real del 2026-04-24: 0,23 -> 0,02 -> 0,00 kWh). El maximo conserva lo ya
        acumulado; el ultimo valor lo perderia entero.

    Descarta lo que pase de `MAXIMO_CONTADOR_DIARIO_KWH`, que es el maximo fisico
    que el catalogo le declara al contador por arreglo. NO es la firma de
    contaminacion: esa mira la fila entera y vive en `analitica.contaminacion`. Aca
    llega una sola columna, asi que el tope por valor es la unica defensa
    disponible, y por eso los dos criterios conviven sin ser el mismo.
    """
    validas = [v for _, v in lecturas
               if v is not None and v <= MAXIMO_CONTADOR_DIARIO_KWH]
    return max(validas) if validas else None


# ── El criterio de dia valido ───────────────────────────────────────────────────
def evaluar_dia(fila: dict) -> dict:
    """Marca un dia como valido o descartado DICIENDO por que. PURA, sin DB.

    La razon viaja pegada al dia y no en una lista aparte: un dia descartado sin su
    motivo obliga a reconstruirlo mirando los insumos, que es justo lo que nadie
    hace antes de leer el PR.
    """
    horas_sol, horas_rad, horas_ele = (fila.get("horas_sol"), fila.get("horas_rad"),
                                       fila.get("horas_ele"))
    motivos: list[str] = []
    if not horas_rad:
        motivos.append(SIN_RADIACION)
    if not horas_ele:
        motivos.append(SIN_ELECTRICO)
    if not horas_sol:
        motivos.append(SIN_VENTANA_SOLAR)

    cobertura_rad = cobertura_ele = desfase = None
    if horas_sol and horas_rad and horas_ele:
        cobertura_rad, cobertura_ele = horas_rad / horas_sol, horas_ele / horas_sol
        desfase = abs(horas_rad - horas_ele)
        if cobertura_rad < COBERTURA_MINIMA or cobertura_ele < COBERTURA_MINIMA:
            motivos.append(COBERTURA_INSUFICIENTE)
        if desfase > DESFASE_MAXIMO_H:
            motivos.append(DESFASE_EXCESIVO)
    return {**fila,
            "cobertura_radiacion": _r(cobertura_rad, 3),
            "cobertura_electrico": _r(cobertura_ele, 3),
            "desfase_h": _r(desfase, 3),
            "valido": not motivos,
            "motivos_descarte": motivos}


# ── El PR y su marca de imposible ───────────────────────────────────────────────
def performance_ratio(energia_kwh: float | None, irradiacion_kwh_m2: float | None,
                      n: int, motivo: str = resultado.SIN_LECTURAS) -> dict:
    """PR = (E/P0) / (H/1 kW/m2), en el sobre de `resultado.metrica`.

    Con n = 0 devuelve None con motivo, jamas cero: un PR de 0 es un dia con el
    inversor caido, que es un HECHO, y no puede confundirse con "no se midio".

    **Un PR > 1 sale MARCADO.** Es fisicamente imposible y significa que el insumo de
    irradiancia de ese arreglo esta mal: con POA frontal sola el vertical da 1,217.
    Devolverlo callado es lo unico que este modulo no puede hacer.
    """
    if n <= 0 or energia_kwh is None or not irradiacion_kwh_m2:
        return resultado.metrica(None, 0, "adimensional", motivo)
    pr = (energia_kwh / KWP_POR_ARREGLO) / irradiacion_kwh_m2
    sobre = resultado.metrica(round(pr, 3), n, "adimensional")
    if pr > PR_MAXIMO_FISICO:
        sobre["supera_limite_fisico"] = True
        sobre["aviso"] = (
            f"PR {round(pr, 3)} > {PR_MAXIMO_FISICO}: fisicamente imposible. No es un "
            f"buen rendimiento, es que la irradiancia con que se juzga este arreglo "
            f"esta subestimada (le falta el aporte de la cara trasera, o el modelo de "
            f"transposicion no corresponde)")
    return sobre


def _acumular(dias: list[dict], campo_energia: str, factor: float,
              campo_irradiacion: str) -> dict:
    """Suma E y H de un arreglo sobre los dias en que EXISTEN LOS DOS.

    El dia entra o no entra entero: sumar la irradiacion de un dia cuya energia falta
    engorda el denominador sin numerador y baja el PR del periodo por un hueco de
    registro. Es la misma razon por la que las dos fuentes de energia no se pueden
    mezclar en un mismo agregado.
    """
    energia = irradiacion = 0.0
    n = supera_uno = 0
    maximo = None
    for dia in dias:
        valor, h = dia.get(campo_energia), dia.get(campo_irradiacion)
        if valor is None or not h:
            continue
        kwh, kwh_m2 = valor * factor, h / WH_POR_KWH
        energia, irradiacion, n = energia + kwh, irradiacion + kwh_m2, n + 1
        pr_dia = (kwh / KWP_POR_ARREGLO) / kwh_m2
        supera_uno += pr_dia > PR_MAXIMO_FISICO
        maximo = pr_dia if maximo is None else max(maximo, pr_dia)
    return {"energia_kwh": energia, "irradiacion_kwh_m2": irradiacion, "dias": n,
            "dias_pr_mayor_a_uno": supera_uno, "pr_diario_maximo": _r(maximo, 3)}


def variante(dias: list[dict], insumo: str, fuente: str,
             motivo: str = resultado.SIN_LECTURAS) -> dict:
    """El PR de los dos arreglos para UNA combinacion insumo + fuente de energia."""
    campo_e1, campo_e2, factor = _CAMPO_ENERGIA[fuente]
    campo_h1, campo_h2 = _CAMPO_IRRADIACION[insumo]
    salida = {"insumo": insumo, "fuente_energia": fuente}
    for arreglo, campo_e, campo_h in ((INCLINADO, campo_e1, campo_h1),
                                      (VERTICAL, campo_e2, campo_h2)):
        a = _acumular(dias, campo_e, factor, campo_h)
        salida[arreglo] = {
            "pr": performance_ratio(a["energia_kwh"] if a["dias"] else None,
                                    a["irradiacion_kwh_m2"], a["dias"], motivo),
            "energia_kwh": resultado.metrica(_r(a["energia_kwh"], 2), a["dias"],
                                             "kWh", motivo),
            "irradiacion_kwh_m2": resultado.metrica(_r(a["irradiacion_kwh_m2"], 2),
                                                    a["dias"], "kWh/m2", motivo),
            "dias": a["dias"],
            # El titular que hace imposible ignorar el PR > 1 aunque el agregado del
            # periodo se quede por debajo: cuantos dias lo superan y cual fue el peor.
            "dias_pr_mayor_a_uno": a["dias_pr_mayor_a_uno"],
            "pr_diario_maximo": a["pr_diario_maximo"],
        }
    return salida


def matriz(dias: list[dict], motivo_poa: str = resultado.SIN_LECTURAS) -> dict:
    """Las seis combinaciones (3 insumos x 2 fuentes de energia). PURA.

    Van las seis y no la "mejor" porque el veredicto DEPENDE del insumo, y de forma
    asimetrica: entre POA bifacial y frontal el PR del inclinado se mueve un 14% y el
    del vertical un 99%. Elegir una sola por dentro seria elegir el veredicto.
    """
    return {fuente: {insumo: variante(dias, insumo, fuente,
                                      motivo_poa if insumo in INSUMOS_PROVISIONALES
                                      else resultado.SIN_LECTURAS)
                     for insumo in INSUMOS}
            for fuente in FUENTES_ENERGIA}


# ── Composicion ─────────────────────────────────────────────────────────────────
def pr_del_dia(dia: dict, insumo: str) -> dict:
    """El PR de un dia por fuente y arreglo, en numero pelado. PURA.

    En el renglon diario el PR va como float y no como sobre de `metrica` porque el
    dia ya trae `valido` y `motivos_descarte`: repetir el motivo cuatro veces por dia
    engorda la respuesta sin decir nada nuevo. Lo que SI se conserva es la marca del
    imposible.
    """
    campo_h1, campo_h2 = _CAMPO_IRRADIACION[insumo]
    por_fuente: dict = {}
    imposibles: list[str] = []
    for fuente in FUENTES_ENERGIA:
        campo_e1, campo_e2, factor = _CAMPO_ENERGIA[fuente]
        por_arreglo = {}
        for arreglo, campo_e, campo_h in ((INCLINADO, campo_e1, campo_h1),
                                          (VERTICAL, campo_e2, campo_h2)):
            valor, h = dia.get(campo_e), dia.get(campo_h)
            pr = (None if valor is None or not h
                  else (valor * factor / KWP_POR_ARREGLO) / (h / WH_POR_KWH))
            por_arreglo[arreglo] = _r(pr, 3)
            if pr is not None and pr > PR_MAXIMO_FISICO:
                imposibles.append(f"{fuente}/{arreglo}")
        por_fuente[fuente] = por_arreglo
    return {"insumo": insumo, "por_fuente": por_fuente,
            "supera_limite_fisico": imposibles or None}


def resumen_pr(matriz_: dict) -> dict:
    """La matriz reducida al PR pelado, con la marca del imposible aparte. PURA.

    Existe para que `comparativa.py` pueda mostrar el PR de los dos arreglos sin
    arrastrar el respaldo entero (energia, irradiacion y dias por cada una de las
    seis variantes son sesenta y pico de campos, y ese detalle ya viaja completo en
    la tool `performance_ratio`). Lo unico que NO se recorta es
    `supera_limite_fisico`: sin esa marca, un 1,217 se leeria como el mejor
    resultado de la serie en vez de como la prueba de que su irradiancia esta mal.
    """
    imposibles = [f"{fuente}/{insumo}/{arreglo}"
                  for fuente in FUENTES_ENERGIA for insumo in INSUMOS
                  for arreglo in (INCLINADO, VERTICAL)
                  if matriz_[fuente][insumo][arreglo]["pr"].get("supera_limite_fisico")]
    return {
        "pr": {fuente: {insumo: {arreglo: matriz_[fuente][insumo][arreglo]["pr"]["valor"]
                                 for arreglo in (INCLINADO, VERTICAL)}
                        for insumo in INSUMOS}
               for fuente in FUENTES_ENERGIA},
        "dias_por_variante": {fuente: {insumo: matriz_[fuente][insumo][INCLINADO]["dias"]
                                       for insumo in INSUMOS}
                              for fuente in FUENTES_ENERGIA},
        "supera_limite_fisico": imposibles or None,
    }


def error_formula_literal(dias: list[dict]) -> dict:
    """Cuanto se habria equivocado el `5/60` literal en ESTE periodo. PURA.

    Se mide sobre todos los dias con radiacion y no solo sobre los validos: el error
    es una propiedad de la CADENCIA del registrador, no del criterio de dia valido, y
    filtrarlo por dias validos daria un numero que depende de dos cosas a la vez.
    """
    real = sum(d["ghi_wh_m2"] for d in dias if d.get("ghi_wh_m2") is not None)
    literal = sum(d["ghi_wh_m2_literal"] for d in dias
                  if d.get("ghi_wh_m2_literal") is not None)
    if not real:
        return {"aplicable": False,
                "explicacion": "el periodo no tiene irradiacion con que comparar"}
    return {
        "aplicable": True,
        "dias_medidos": sum(1 for d in dias if d.get("ghi_wh_m2") is not None),
        "irradiacion_dt_real_kwh_m2": round(real / WH_POR_KWH, 2),
        "irradiacion_5_60_literal_kwh_m2": round(literal / WH_POR_KWH, 2),
        "factor": round(literal / real, 3),
        "error_pct": round((literal / real - 1.0) * 100.0, 1),
        "explicacion": (
            "el `5/60` de R1 supone que cada lectura cubre 5 minutos y la cadencia real "
            "de la radiacion va de 15 a 330 s. Sobre toda la ventana util el error es "
            "+83,6%, pero CAMBIA DE SIGNO por mes (+860% en octubre 2025, -6,6% en "
            "diciembre 2025), asi que no se descuenta con una constante: aplicado "
            "literal le inventa a la serie una estacionalidad de un orden de magnitud"),
    }


def _por_mes(dias: list[dict], motivo_poa: str) -> list[dict]:
    meses: dict[str, list[dict]] = {}
    for dia in dias:
        meses.setdefault(dia["dia"][:7], []).append(dia)
    return [{"mes": mes, "dias": len(grupo), **matriz(grupo, motivo_poa)}
            for mes, grupo in sorted(meses.items())]


def fuente_energia(validos: list[dict]) -> dict:
    """Cual de los dos caminos de energia manda y sobre cuantos dias. PURA.

    El contador es el PRINCIPAL: es la formulacion literal de R1 y es una medida del
    inversor, no una reconstruccion nuestra. La integral es el RESPALDO DECLARADO, y
    hace falta, porque los acumuladores por arreglo faltan ENTEROS entre noviembre
    2025 y febrero 2026 (118 dias), justo los meses en que el inclinado se despega.
    Donde existen los dos coinciden dentro del 0,7-1,8%, pero un anual calculado solo
    con el contador tiene sesgo estacional de muestreo: por eso los dos numeros salen
    etiquetados y nunca fundidos en uno.
    """
    con_contador = sum(1 for d in validos
                       if d.get("e1_contador_kwh") is not None
                       or d.get("e2_contador_kwh") is not None)
    if not validos:
        aviso = "no hay ni un dia valido en la ventana: no hay de donde sacar energia"
    elif con_contador < len(validos):
        aviso = (f"el contador (camino principal) cubre {con_contador} de "
                 f"{len(validos)} dias validos y la integral de la potencia el resto. "
                 f"Los dos agregados se reportan por separado y NUNCA se mezclan en el "
                 f"mismo numero: el subconjunto con contador no representa el año y su "
                 f"PR tiene sesgo estacional de muestreo")
    else:
        aviso = None
    return {"principal": CONTADOR, "respaldo": INTEGRAL,
            "dias_validos": len(validos), "dias_con_contador": con_contador,
            "advertencia": aviso,
            "unidad_contador": ("`energia_pv1_wh`/`energia_pv2_wh` estan en kWh pese "
                                "al sufijo `_wh`, y son contadores DIARIOS que se "
                                "reinician a medianoche: el valor del dia es su maximo")}


def aval_pendiente() -> dict:
    """El estado abierto de R2: la ecuacion de transposicion la confirma Hugo."""
    return {
        "insumos_provisionales": list(INSUMOS_PROVISIONALES),
        "estado": "pendiente_de_aval_externo",
        "quien": "Hugo",
        "referencia": "R2 de Leo Cardinale, 2026-08-30",
        "detalle": ("R2 confirma el PRINCIPIO (una irradiancia por plano para cada "
                    "arreglo) pero deja abierta CUAL ecuacion de transposicion usar. "
                    "`radiacion_sc_poa` es una transposicion modelada con pvlib: es el "
                    "mejor insumo disponible hoy, no un resultado firme. El PR contra "
                    "GHI no depende de ningun modelo y por eso se reporta al lado."),
    }


def componer(filas: list[dict], insumo: str = GHI,
             motivo_poa: str = resultado.SIN_LECTURAS) -> dict:
    """Todo el analisis desde las filas YA consultadas. PURA: aca vive el criterio."""
    dias = [evaluar_dia(f) for f in filas]
    validos = [d for d in dias if d["valido"]]
    descartados = [{"dia": d["dia"], "motivos_descarte": d["motivos_descarte"],
                    "cobertura_radiacion": d["cobertura_radiacion"],
                    "cobertura_electrico": d["cobertura_electrico"],
                    "desfase_h": d["desfase_h"]}
                   for d in dias if not d["valido"]]
    return {
        "insumo_del_detalle_diario": insumo,
        "criterio_dia_valido": {
            "cobertura_minima": COBERTURA_MINIMA,
            "desfase_maximo_h": DESFASE_MAXIMO_H,
            "medido_contra": "ventana_solar.horas_sol",
            "explicacion": ("un dia con la mitad de las lecturas da la mitad de la "
                            "irradiacion y arruina el PR sin avisar. El que de verdad "
                            "filtra es el desfase: dos coberturas aceptables por "
                            "separado pueden cubrir tramos distintos del dia"),
        },
        "dias": {"con_dato": len(dias), "validos": len(validos),
                 "descartados": len(descartados), "detalle_descartados": descartados},
        "por_dia": [{**{k: d.get(k) for k in _CAMPOS_DEL_DIA},
                     "pr": pr_del_dia(d, insumo)} for d in dias],
        "por_mes": _por_mes(validos, motivo_poa),
        "total": matriz(validos, motivo_poa),
        "fuente_energia": fuente_energia(validos),
        "error_formula_literal": error_formula_literal(dias),
        "aval_pendiente": aval_pendiente(),
        "techo_dt_seg": TECHO_DT_SEG,
        "nota": _NOTA,
    }


def consultar(ventana: Ventana) -> list[dict]:
    """Un renglon por dia con radiacion o electrico en la ventana. La UNICA consulta.

    Publica porque `comparativa.py` la reusa: el PR de los dos arreglos tiene que
    salir de estas mismas filas, o el comparativo y la tool `performance_ratio`
    darian dos numeros distintos para la misma cosa. Los parametros van en el orden
    en que aparecen los `%s`, y el CTE de las filas sucias es el PRIMERO.
    """
    desde, hasta = ventana.sql
    return db.query(_SQL_DIARIO, (
        desde, hasta,                                        # sucias
        DT_ULTIMA_FILA_SEG, TECHO_DT_SEG, desde, hasta,      # rad
        HORAS_FORMULA_LITERAL,                               # rad_dia
        DT_ULTIMA_FILA_SEG, TECHO_DT_SEG, desde, hasta,      # ele
        MAXIMO_CONTADOR_DIARIO_KWH, MAXIMO_CONTADOR_DIARIO_KWH,   # ele_dia
    ))


def calcular(ventana: Ventana, insumo: str = GHI) -> dict:
    """El PR diario y mensual de la ventana, con su bloque de confianza.

    `insumo` solo elige que variante se detalla dia a dia: los meses y el total
    llevan SIEMPRE las seis combinaciones, para que el veredicto no dependa de un
    parametro que quien pregunta puede no saber que existe.
    """
    if insumo not in INSUMOS:
        raise ValueError(f"insumo {insumo!r}; validos: {', '.join(INSUMOS)}")
    # Fuera del tramo con POA no hay un PR malo: no hay PR, y se dice distinto.
    sin_poa = catalogo.fuera_de_cobertura(ventana.desde, ventana.hasta, *CLAVES_POA)
    motivo_poa = resultado.FUERA_DE_COBERTURA if sin_poa else resultado.SIN_LECTURAS
    # La confianza y el renglon diario son dos consultas INDEPENDIENTES: salen a la
    # vez y el endpoint pasa de dos viajes al pooler a uno. Ver `db.en_paralelo`.
    confianza, filas = db.en_paralelo(
        lambda: confianza_de(ventana, *CLAVES),
        lambda: consultar(ventana),
    )
    return resultado.sobre(
        ventana, confianza,
        **componer(filas, insumo, motivo_poa),
        cobertura_poa={"fuera_de_cobertura": sin_poa},
    )
