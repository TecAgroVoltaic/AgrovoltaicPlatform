"""Recta OLS con su R2 y el adelgazado de la nube para dibujar. PURO, sin DB."""
from __future__ import annotations

import numpy as np

# Cuantos puntos se devuelven para dibujar. Con 94.868 lecturas el navegador no
# pinta la nube y el ojo no la lee; con 2.000 la forma es la misma.
TECHO_PUNTOS = 2000
MINIMO_PARES = 2          # una recta por un punto no existe
DECIMALES = 3
DECIMALES_R2 = 4

# Motivos propios de la regresion (los genericos viven en `resultado`).
PARES_INSUFICIENTES = "pares_insuficientes"
X_CONSTANTE = "x_constante"


def ajustar(x, y) -> dict:
    """Recta de minimos cuadrados y su R2. PURA: se prueba sin base de datos.

    Con y constante y x variable el R2 es 0/0; se devuelve 1,0 (el ajuste explica
    toda la varianza que hay, que es ninguna), que es la convencion de scikit-learn
    y evita un None que el consumidor tendria que interpretar.
    """
    xs = np.asarray(x, dtype=float).ravel()
    ys = np.asarray(y, dtype=float).ravel()
    if xs.size != ys.size:
        raise ValueError(f"x e y no tienen el mismo largo: {xs.size} y {ys.size}")

    finitos = np.isfinite(xs) & np.isfinite(ys)
    xs, ys = xs[finitos], ys[finitos]
    n = int(xs.size)
    if n < MINIMO_PARES:
        return _sin_recta(n, PARES_INSUFICIENTES)
    if float(np.ptp(xs)) == 0.0:
        # Todos los x iguales: la pendiente es vertical, o sea infinita. No hay
        # recta y = mx + b que describa eso, y devolver un numero enorme mentiria.
        return _sin_recta(n, X_CONSTANTE)

    pendiente, intercepto = (float(v) for v in np.polyfit(xs, ys, 1))
    residual = float(np.sum((ys - (pendiente * xs + intercepto)) ** 2))
    total = float(np.sum((ys - ys.mean()) ** 2))
    r2 = 1.0 if total == 0.0 else 1.0 - residual / total
    return {"pendiente": round(pendiente, 6), "intercepto": round(intercepto, 6),
            "r2": round(r2, DECIMALES_R2), "n": n, "motivo": None}


def _sin_recta(n: int, motivo: str) -> dict:
    return {"pendiente": None, "intercepto": None, "r2": None, "n": n, "motivo": motivo}


def reducir(pares: list, techo: int = TECHO_PUNTOS) -> dict:
    """El ajuste sobre TODOS los pares + los puntos adelgazados para dibujar. PURA.

    El adelgazado es un paso fijo y no un muestreo al azar: la misma consulta tiene
    que devolver la misma nube dos veces (para el experto y para el agente).
    """
    ajuste = ajustar([p[0] for p in pares], [p[1] for p in pares])
    paso = max(1, -(-len(pares) // techo)) if techo > 0 else 1
    dibujables = pares[::paso]
    return {
        "ajuste": ajuste,
        "puntos": [[round(float(px), DECIMALES), round(float(py), DECIMALES)]
                   for px, py in dibujables],
        "puntos_mostrados": len(dibujables),
        "submuestreado": paso > 1,
    }
