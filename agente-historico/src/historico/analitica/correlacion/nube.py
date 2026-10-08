"""La dispersion de dos variables del catalogo contra la base: pares, conteos y sobre."""
from __future__ import annotations

from historico import db
from historico.analitica import catalogo, resultado
from historico.analitica.correlacion.ajuste import TECHO_PUNTOS, reducir
from historico.analitica.ventana import Ventana


def _confianza_de(ventana: Ventana, *claves: str) -> dict:
    """`confianza_de` resuelta en la fachada, que es el punto que se sustituye."""
    from historico.analitica import correlacion as fachada

    return fachada.confianza_de(ventana, *claves)


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
        ventana, _confianza_de(ventana, vx.clave, vy.clave),
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
        lambda: _confianza_de(ventana, vx.clave, vy.clave),
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
