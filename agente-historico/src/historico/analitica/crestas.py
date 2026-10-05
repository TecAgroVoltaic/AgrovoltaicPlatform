"""Grafico de CRESTAS (ridgeline): densidades apiladas por grupo. Fig. 7 del documento.

Compara como se DISTRIBUYE una misma magnitud entre varios grupos (PV1 inclinado
contra PV2 vertical, un piranometro contra el otro) apilando la densidad de cada
uno, coloreandola por probabilidad de cola y marcando un umbral. Responde algo que
ni la media ni el maximo contestan: si dos sensores que miden lo mismo tienen la
misma forma, y cuanta masa se le va a cada uno mas alla del umbral.

AMBIGUEDAD DEL DOCUMENTO, decidida y anotada para consultarla con el autor: la
Fig. 7 se describe como "regresion Ridge" y enlaza a la regularizacion de Tikhonov,
pero la figura es inequivocamente un grafico de CRESTAS de densidades por sensor
coloreadas por probabilidad de cola, y el codigo de referencia se llama
`temp_tail_ridge_plot.py`. Se implementa LO QUE MUESTRA LA FIGURA. No hay aqui
ninguna regresion regularizada: si lo que se queria era Tikhonov, esto no lo cubre
y hay que pedirlo aparte.

LIMITE CONOCIDO: los cinco canales de humedad de suelo (el otro ejemplo natural de
esta figura) NO se pueden pedir todavia. Viven en `lecturas_ambientales_sc`, que no
esta en `catalogo.py`, y la regla del proyecto es que ninguna columna llegue al SQL
sin pasar por el catalogo. En cuanto tengan entrada, esta funcion los grafica sin
tocar una linea. Ojo al agregarlos: esa tabla SI guarda UTC de verdad (viene de
AgroDash), al reves que las tablas PV, asi que su ventana necesita conversion.
"""
from __future__ import annotations

import numpy as np
from scipy.stats import gaussian_kde

from historico import db
from historico.analitica import catalogo, correlacion, resultado
from historico.analitica.ventana import Ventana

SUPERIOR, INFERIOR = "superior", "inferior"
COLAS = (SUPERIOR, INFERIOR)

# Puntos de la rejilla comun. 200 dibuja una curva suave sin engordar la respuesta.
PUNTOS_REJILLA = 200
# La rejilla se extiende a cada lado del rango observado para que las colas (que son
# justamente lo que colorea esta figura) no salgan cortadas. Medido sobre 10 muestras,
# el peor caso: con 5% la rejilla deja fuera el 13% de la masa y la campana se dibuja
# truncada; con 15% deja fuera el 6%. Con miles de lecturas el ancho de banda del KDE
# se encoge y el sobrante es menor todavia.
MARGEN_REJILLA = 0.15
MINIMO_MUESTRAS = 2
# Techo de lecturas por grupo. La densidad de 5.000 muestras tomadas a paso fijo es
# indistinguible de la de 94.868, y bajar las 94.868 cuesta egress de verdad: el
# Predictivo ya reviento la cuota del Free tier justo asi.
MUESTRAS_MAXIMAS = 5000
DECIMALES = 4

VARIANZA_NULA = "varianza_nula"
MUESTRAS_INSUFICIENTES = "muestras_insuficientes"
UNIDADES_MEZCLADAS = "unidades_mezcladas"

_SQL_MUESTRAS = """
    SELECT s.valor, s.total
      FROM (SELECT {columna} AS valor,
                   row_number() OVER (ORDER BY "timestamp") AS rn,
                   count(*)    OVER ()                      AS total
              FROM {relacion}
             WHERE "timestamp" >= %s AND "timestamp" < %s
               AND {columna} IS NOT NULL) s
     WHERE mod(s.rn, greatest(1, s.total / %s)) = 0
"""


def _muestras(ventana: Ventana, variable: catalogo.Variable,
              tope: int) -> tuple[list[float], int]:
    """Las lecturas del grupo, adelgazadas a paso fijo, y cuantas hay en total.

    El paso fijo (y no un muestreo al azar) mantiene la distribucion y ademas hace
    la respuesta reproducible: la misma pregunta dibuja la misma cresta dos veces.
    """
    sql = _SQL_MUESTRAS.format(columna=variable.columna, relacion=variable.relacion)
    filas = db.query(sql, ventana.sql + (tope,))
    return [f["valor"] for f in filas], (filas[0]["total"] if filas else 0)


def _cuartiles(valores: np.ndarray) -> dict:
    q1, mediana, q3 = (float(v) for v in np.quantile(valores, [0.25, 0.5, 0.75]))
    return {"q1": round(q1, DECIMALES), "mediana": round(mediana, DECIMALES),
            "q3": round(q3, DECIMALES), "minimo": round(float(valores.min()), DECIMALES),
            "maximo": round(float(valores.max()), DECIMALES)}


def _rejilla(valores: list[np.ndarray], puntos: int) -> np.ndarray:
    """Rejilla COMUN a todos los grupos: sin ella las crestas no son comparables."""
    con_datos = [v for v in valores if v.size]
    if not con_datos or puntos < MINIMO_MUESTRAS:
        return np.array([])
    juntos = np.concatenate(con_datos)
    bajo, alto = float(juntos.min()), float(juntos.max())
    margen = (alto - bajo) * MARGEN_REJILLA or abs(bajo) * MARGEN_REJILLA or 1.0
    return np.linspace(bajo - margen, alto + margen, puntos)


def _cola(kde: gaussian_kde, desde: float, cola: str) -> float:
    """Masa de probabilidad mas alla de `desde`, del lado que pide `cola`."""
    if cola == SUPERIOR:
        return float(kde.integrate_box_1d(desde, np.inf))
    return float(kde.integrate_box_1d(-np.inf, desde))


def _grupo(clave: str, crudos: list, n_total: int, rejilla: np.ndarray,
           umbral: float | None, cola: str) -> dict:
    valores = np.asarray(crudos, dtype=float)
    valores = valores[np.isfinite(valores)]
    base = {"grupo": clave, "n": n_total or int(valores.size),
            "n_usadas": int(valores.size), "estadisticos": None,
            "densidad": None, "prob_cola": None, "prob_sobre_umbral": None}
    if valores.size < MINIMO_MUESTRAS:
        return {**base, "motivo": MUESTRAS_INSUFICIENTES if valores.size
                else resultado.SIN_LECTURAS}

    estadisticos = {"media": round(float(valores.mean()), DECIMALES), **_cuartiles(valores)}
    if float(np.ptp(valores)) == 0.0 or not rejilla.size:
        # Sensor pegado en un valor: no hay densidad que estimar (gaussian_kde
        # revienta con matriz singular), pero el dato importa y se reporta igual.
        return {**base, "estadisticos": estadisticos, "motivo": VARIANZA_NULA}
    try:
        kde = gaussian_kde(valores)
    except np.linalg.LinAlgError:
        return {**base, "estadisticos": estadisticos, "motivo": VARIANZA_NULA}

    return {**base, "estadisticos": estadisticos, "motivo": None,
            "densidad": [round(float(d), 6) for d in kde(rejilla)],
            "prob_cola": [round(_cola(kde, float(g), cola), DECIMALES) for g in rejilla],
            "prob_sobre_umbral": (None if umbral is None
                                  else round(_cola(kde, float(umbral), cola), DECIMALES))}


def reducir(muestras: dict[str, tuple[list, int]], umbral: float | None = None,
            cola: str = SUPERIOR, puntos_rejilla: int = PUNTOS_REJILLA) -> dict:
    """Las crestas, sin base de datos. Aca vive la decision; arriba solo la consulta.

    `muestras` es {grupo: (valores, n_total)}. Devuelve la rejilla comun y, por
    grupo, la densidad evaluada en ella, la probabilidad de cola punto a punto y
    los estadisticos. Un grupo que no da densidad NO desaparece: sale con motivo.
    """
    if cola not in COLAS:
        raise ValueError(f"cola {cola!r} desconocida; validas: {', '.join(COLAS)}")
    limpios = {c: np.asarray(v, dtype=float)[np.isfinite(np.asarray(v, dtype=float))]
               for c, (v, _) in muestras.items()}
    rejilla = _rejilla(list(limpios.values()), puntos_rejilla)
    return {
        "rejilla": [round(float(g), DECIMALES) for g in rejilla],
        "umbral": umbral, "cola": cola,
        "grupos": [_grupo(c, v, n, rejilla, umbral, cola)
                   for c, (v, n) in muestras.items()],
    }


def _enriquecer(grupo: dict, variable: catalogo.Variable, fuera: str | None) -> dict:
    """Le pone nombre y unidad al grupo y saca CADA escalar por `metrica`.

    `fuera` es el motivo LEGIBLE de que la ventana no toque el tramo en que la
    variable existe. Viaja aparte del codigo `fuera_de_cobertura` porque el codigo
    dice que paso y este dice entre que fechas si habria dato, que es lo unico
    accionable para quien pregunto.

    Los estadisticos salen envueltos uno por uno y no como numeros pelados por la
    misma razon de siempre: una mediana de 0 y una mediana que no existe se ven
    igual sueltas, y esta figura se usa justamente para mirar sensores sospechosos.
    Las densidades y la rejilla si van crudas: son arreglos de 200 puntos y
    envolverlos punto a punto multiplicaria la respuesta sin decir nada nuevo.
    """
    motivo = (resultado.FUERA_DE_COBERTURA if fuera
              else grupo["motivo"] or resultado.SIN_LECTURAS)
    est = grupo["estadisticos"] if not fuera else None
    n = 0 if est is None else grupo["n_usadas"]
    probabilidad = None if fuera else grupo["prob_sobre_umbral"]
    return {
        **grupo, "motivo": resultado.FUERA_DE_COBERTURA if fuera else grupo["motivo"],
        "fuera_de_cobertura": fuera,
        "etiqueta": variable.etiqueta, "unidad": variable.unidad,
        "estadisticos": None if est is None else {
            nombre: resultado.metrica(valor, n, variable.unidad, motivo)
            for nombre, valor in est.items()},
        "prob_sobre_umbral": resultado.metrica(
            probabilidad, 0 if probabilidad is None else n, "probabilidad", motivo),
    }


def densidades(ventana: Ventana, grupos: list[str], umbral: float | None = None,
               cola: str = SUPERIOR, puntos_rejilla: int = PUNTOS_REJILLA,
               tope_muestras: int = MUESTRAS_MAXIMAS) -> dict:
    """Crestas de una misma magnitud para varios grupos del catalogo."""
    if not grupos:
        raise ValueError("hay que pedir al menos un grupo (clave del catalogo)")
    variables = [catalogo.obtener(c) for c in grupos]
    ausentes = [v for v in variables if not v.disponible]
    if ausentes:
        raise ValueError(f"{ausentes[0].clave}: {ausentes[0].fuente_ausente}")
    unidades = {v.unidad for v in variables}
    if len(unidades) > 1:
        # Apilar W sobre grados C da una figura que se lee pero no significa nada.
        raise ValueError(f"{UNIDADES_MEZCLADAS}: las crestas comparan una MISMA "
                         f"magnitud entre grupos, y llegaron {sorted(unidades)}")

    # Un grupo fuera de su cobertura no se consulta: devolveria cero lecturas, y
    # "no hay dato" y "no existia todavia" no son lo mismo. Se evalua grupo por grupo
    # porque las crestas comparan sensores con historias distintas: el SP722 grabo
    # dieciocho dias y el piranometro de al lado casi un año.
    fuera = {v.clave: catalogo.fuera_de_cobertura(ventana.desde, ventana.hasta, v.clave)
             for v in variables}
    # Una consulta por grupo mas la de confianza, todas independientes: la vista de
    # Estadistica pide tres grupos, o sea cuatro viajes al pooler en fila (~900 ms)
    # que juntos cuestan uno. Ver `db.en_paralelo` y la cabecera de `historico.db`.
    #
    # El grupo fuera de cobertura sigue sin consultarse (devuelve la muestra vacia
    # sin tocar la base), pero conserva su lugar en la lista: sacarlo desalinearia
    # los resultados de las variables que si se consultaron.
    confianza, *por_grupo = db.en_paralelo(
        lambda: correlacion.confianza_de(ventana, *grupos),
        *[(lambda v=v: ([], 0) if fuera[v.clave]
           else _muestras(ventana, v, tope_muestras)) for v in variables],
    )
    muestras = {v.clave: m for v, m in zip(variables, por_grupo)}

    calculado = reducir(muestras, umbral, cola, puntos_rejilla)
    por_clave = {g["grupo"]: g for g in calculado["grupos"]}
    return resultado.sobre(
        ventana, confianza,
        unidad=unidades.pop(), rejilla=calculado["rejilla"],
        umbral=umbral, cola=cola,
        grupos=[_enriquecer(por_clave[v.clave], v, fuera[v.clave]) for v in variables],
        nota=(f"densidades KDE (gaussian_kde) sobre una rejilla comun, coloreables "
              f"por `prob_cola` (masa de probabilidad de la cola {cola} en cada punto). "
              f"Los grupos con mas de {tope_muestras} lecturas se muestrean a paso "
              f"fijo: `n` es el total real y `n_usadas` lo que entro al calculo."),
    )
