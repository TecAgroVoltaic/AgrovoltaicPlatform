"""Dispersion de DOS variables del catalogo con ajuste OLS. Fig. 8 del documento.

El caso de uso central es irradiancia contra potencia, pero la funcion es generica
para cualquier par del catalogo: quien elige el par es el experto humano al que
acompaña el agente, no este modulo.

DISCREPANCIA DEL DOCUMENTO, anotada para consultarla con el autor: el pie de la
Fig. 8 dice "potencia vs irradiacion" y la figura graficada muestra PAR contra GHI.
Se implementa lo que dice el PIE, que es lo que el proyecto necesita (cuanta
potencia entrega cada arreglo por unidad de irradiancia). Como la funcion es
generica, el otro par tambien se puede pedir el dia que haya PAR ingestado.

Los pares se forman por TIMESTAMP EXACTO, y por eso se reporta `pares` junto a las
lecturas de cada lado: lo electrico va a 5 min y la radiacion a 15 s, asi que los
timestamps que coinciden son MUCHOS MENOS que las filas de cualquiera de las dos
tablas. Sin ese numero a la vista, un R2 calculado sobre 300 coincidencias de
94.868 lecturas parece un resultado sobre todo el periodo.

El ajuste se calcula sobre TODOS los pares; lo que se recorta es el dibujo. Un
`LIMIT` en la consulta sesgaria la recta (se quedaria con un tramo del periodo),
mientras que adelgazar los puntos DESPUES solo le quita densidad al grafico.

Este modulo aloja ademas el armado del bloque de confianza, que `crestas` y
`comparativa` reusan: es la composicion de tres llamadas al catalogo y a calidad, y
no se puede abrir un modulo aparte para ella.
"""
from __future__ import annotations

import numpy as np

from historico import db
from historico.analitica import catalogo, resultado
from historico.analitica.ventana import Ventana
from historico.calidad import contexto

# Cuantos puntos se devuelven para dibujar. Con 94.868 lecturas el navegador no
# pinta la nube y el ojo no la lee; con 2.000 la forma es la misma.
TECHO_PUNTOS = 2000
MINIMO_PARES = 2          # una recta por un punto no existe
DECIMALES = 3
DECIMALES_R2 = 4

# Motivos propios de la regresion (los genericos viven en `resultado`).
PARES_INSUFICIENTES = "pares_insuficientes"
X_CONSTANTE = "x_constante"


def advertir_sin_vigilancia(bloque: dict, ciegas: list[str]) -> dict:
    """Le agrega al bloque de confianza lo que el barrido NO revisa. PURA.

    Cero hallazgos y nadie mirando se ven IGUAL en el bloque, y no son lo mismo.
    Una correlacion entre irradiancia y potencia tiene confianza medida; una entre
    POA y potencia sale con la misma cara y no la tiene, porque el barrido no vigila
    la POA. Es la misma regla por la que `metrica` exige un motivo: la ausencia de
    señal no es señal de ausencia.

    La advertencia previa NO se pisa: si el periodo ya venia flojo, las dos cosas
    tienen que llegar juntas al que lee.
    """
    if not ciegas:
        return bloque
    bloque["sin_vigilancia"] = ciegas
    aviso = (f"el barrido no revisa {', '.join(ciegas)}: que no tengan hallazgos NO "
             f"dice que esten limpias, dice que nadie las miro")
    previa = bloque.get("advertencia")
    bloque["advertencia"] = f"{previa}. {aviso}" if previa else aviso
    return bloque


def confianza_de(ventana: Ventana, *claves: str) -> dict:
    """El bloque de confianza de estas variables, con su ceguera a la vista.

    Puerta unica de los tres modulos de esta tanda. La traduccion clave -> nombre de
    calidad la hace el CATALOGO (`para_confianza`), que es donde tiene que vivir:
    hacerla a mano en cada modulo fue justo como aparecio el fallo de los 321
    hallazgos de irradiancia que se perdian.
    """
    variables, fuente = catalogo.para_confianza(*claves)
    bloque = contexto.confianza(*ventana.sql, variables, fuente)
    return advertir_sin_vigilancia(bloque, catalogo.sin_vigilancia(*claves))


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


def _sql_pares(vx: catalogo.Variable, vy: catalogo.Variable) -> str:
    """Los pares con timestamp coincidente. Columnas y relaciones salen del
    catalogo (allowlist), nunca del usuario ni del LLM."""
    if vx.relacion == vy.relacion:
        return f"""
            SELECT {vx.columna} AS x, {vy.columna} AS y
              FROM {vx.relacion}
             WHERE "timestamp" >= %s AND "timestamp" < %s
               AND {vx.columna} IS NOT NULL AND {vy.columna} IS NOT NULL
             ORDER BY "timestamp"
        """
    return f"""
        SELECT a.{vx.columna} AS x, b.{vy.columna} AS y
          FROM {vx.relacion} a JOIN {vy.relacion} b USING ("timestamp")
         WHERE a."timestamp" >= %s AND a."timestamp" < %s
           AND a.{vx.columna} IS NOT NULL AND b.{vy.columna} IS NOT NULL
         ORDER BY a."timestamp"
    """


def _sql_lecturas(vx: catalogo.Variable, vy: catalogo.Variable) -> str:
    """Cuantas lecturas tiene cada lado por su cuenta: es el contraste que explica
    por que los pares son pocos."""
    return f"""
        SELECT (SELECT count({vx.columna}) FROM {vx.relacion}
                 WHERE "timestamp" >= %s AND "timestamp" < %s) AS lecturas_x,
               (SELECT count({vy.columna}) FROM {vy.relacion}
                 WHERE "timestamp" >= %s AND "timestamp" < %s) AS lecturas_y
    """


def _descriptor(v: catalogo.Variable) -> dict:
    return {"clave": v.clave, "etiqueta": v.etiqueta, "unidad": v.unidad}


def _ecuacion(ajuste: dict) -> str | None:
    if ajuste["pendiente"] is None:
        return None
    signo = "+" if ajuste["intercepto"] >= 0 else "-"
    return (f"y = {ajuste['pendiente']:.4g}*x {signo} "
            f"{abs(ajuste['intercepto']):.4g}")


def _vacio(ventana: Ventana, vx, vy, motivo: str, nota: str) -> dict:
    """Respuesta cuando no se puede ni intentar el ajuste. Los escalares salen por
    `metrica`, o sea con valor None y motivo, jamas en cero."""
    return resultado.sobre(
        ventana, confianza_de(ventana, vx.clave, vy.clave),
        x=_descriptor(vx), y=_descriptor(vy), pares=0, lecturas_x=0, lecturas_y=0,
        ajuste={"pendiente": resultado.metrica(None, 0, f"{vy.unidad} por {vx.unidad}", motivo),
                "intercepto": resultado.metrica(None, 0, vy.unidad, motivo),
                "r2": resultado.metrica(None, 0, "adimensional", motivo),
                "ecuacion": None, "n": 0},
        puntos=[], puntos_mostrados=0, submuestreado=False, nota=nota,
    )


def dispersion(ventana: Ventana, x: str, y: str,
               techo_puntos: int = TECHO_PUNTOS) -> dict:
    """Nube de puntos de `y` contra `x` con su recta OLS, en la ventana pedida."""
    vx, vy = catalogo.obtener(x), catalogo.obtener(y)
    for v in (vx, vy):
        if not v.disponible:
            return _vacio(ventana, vx, vy, resultado.COLUMNA_AUSENTE,
                          f"{v.clave}: {v.fuente_ausente}")

    # ANTES de consultar. Una nube de cero puntos se lee como "no hay correlacion",
    # y no es lo mismo que "estas dos variables nunca coexistieron": el SP722 corrio
    # dieciocho dias de mayo 2026 y cruzarlo con la POA deja esa ventana y ninguna otra.
    fuera = catalogo.fuera_de_cobertura(ventana.desde, ventana.hasta, x, y)
    if fuera:
        return _vacio(ventana, vx, vy, resultado.FUERA_DE_COBERTURA, fuera)

    # Las tres consultas del endpoint son independientes: el conteo de lecturas por
    # eje, los pares y la confianza. En fila eran tres viajes al pooler (~675 ms) y
    # juntas cuestan uno. Ver `db.en_paralelo` y la cabecera de `historico.db`.
    lecturas, filas, confianza = db.en_paralelo(
        lambda: db.uno(_sql_lecturas(vx, vy), ventana.sql + ventana.sql),
        lambda: db.query(_sql_pares(vx, vy), ventana.sql),
        lambda: confianza_de(ventana, vx.clave, vy.clave),
    )
    pares = [(f["x"], f["y"]) for f in filas]
    calculado = reducir(pares, techo_puntos)
    ajuste = calculado["ajuste"]
    n = ajuste["n"]
    motivo = ajuste["motivo"] or resultado.SIN_LECTURAS

    return resultado.sobre(
        ventana, confianza,
        x=_descriptor(vx), y=_descriptor(vy),
        pares=len(pares),
        lecturas_x=lecturas.get("lecturas_x", 0), lecturas_y=lecturas.get("lecturas_y", 0),
        ajuste={
            "pendiente": resultado.metrica(ajuste["pendiente"], n,
                                           f"{vy.unidad} por {vx.unidad}", motivo),
            "intercepto": resultado.metrica(ajuste["intercepto"], n, vy.unidad, motivo),
            "r2": resultado.metrica(ajuste["r2"], n, "adimensional", motivo),
            "ecuacion": _ecuacion(ajuste),
            "n": n,
        },
        puntos=calculado["puntos"],
        puntos_mostrados=calculado["puntos_mostrados"],
        submuestreado=calculado["submuestreado"],
        nota=("los pares se forman por timestamp EXACTO; con cadencias distintas "
              "(5 min lo electrico, 15 s la radiacion) coinciden muchos menos "
              "timestamps que filas tiene cada tabla. El ajuste usa todos los pares; "
              "`puntos` viene adelgazado solo para dibujar."),
    )
