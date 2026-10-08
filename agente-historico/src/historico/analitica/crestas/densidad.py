"""Las crestas sin base de datos: rejilla comun, KDE por grupo y probabilidad de cola."""
from __future__ import annotations

import numpy as np
from scipy.stats import gaussian_kde

from historico.analitica import resultado

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
