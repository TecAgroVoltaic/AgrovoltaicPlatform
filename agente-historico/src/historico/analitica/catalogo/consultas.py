"""Las puertas de consulta del registro: busqueda, cobertura, huecos y vigilancia."""
from __future__ import annotations

from datetime import date

from historico.analitica.catalogo.registro import _REGISTRO, CATALOGO
from historico.analitica.catalogo.variable import VariableDesconocida, Variable


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
