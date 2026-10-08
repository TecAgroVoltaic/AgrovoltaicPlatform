"""Tool `graficar` — un grafico de datos REALES para mostrarselo al usuario.

Devuelve un `ChartSpec` (contrato §1, `docs/referencia/contratos-asistente-alertas.md`)
en `_grafico`: el sobre con los datos de UNA de las seis primitivas del frontend,
que lo pinta sin transformar. Cada tipo reusa el MISMO algoritmo de `analitica` que
sirve al endpoint equivalente; aca solo se elige cual y se adapta su salida
(`_chartspec`). Los graficadores por tipo viven en `_graficadores`. Cero
invencion: el grafico es la salida de un algoritmo.

El LLM no recibe los arreglos: el lazo del chat quita toda clave que empiece con
`_` y le pasa solo `resumen` y `nota` (n, min, max, media por serie, periodo).
"""
from __future__ import annotations

from historico.tools import _chartspec as cs
from historico.tools import opciones
from historico.tools._graficadores import _barras, _cajas, _carpeta, _crestas, _dispersion, _serie
from historico.tools._ventana_grafico import crear

_NOTA = ("Grafico de datos reales: la interfaz lo dibuja. Comenta la tendencia o lo que "
         "llame la atencion; no repitas los numeros.")

SCHEMA = {
    "name": "graficar",
    "description": (
        "Genera un GRAFICO de datos reales para MOSTRARSELO al usuario. Usalo cuando "
        "quiera VER algo, no solo un numero. Tipos: 'serie' = evolucion en el tiempo "
        "(una o varias variables de la MISMA unidad, con tendencia y media movil); "
        "'barras' = una cantidad por periodo (energia_hoy_wh/energia_pv1_wh/energia_pv2_wh "
        "suman el cierre diario en kWh; una irradiancia W/m2 da la irradiacion acumulada "
        "por mes en kWh/m2; el resto, la media por periodo); 'cajas' = distribucion mes "
        "a mes de UNA variable (mediana, cuartiles, atipicos); 'carpeta' = mapa de calor "
        "dia x hora local de UNA variable (forma del dia a lo largo de semanas); "
        "'dispersion' = UNA variable (variables[0], eje Y) contra `variable_x` con su "
        "recta y R2; 'crestas' = densidades de varias variables de la misma unidad "
        "(comparar sensores o arreglos). Las variables son claves del catalogo. Fechas "
        "en hora local de Costa Rica, `hasta` exclusivo."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "tipo": {"type": "string", "enum": list(cs.TIPOS),
                     "description": "Que primitiva dibujar."},
            "variables": opciones.variables(
                "Claves del catalogo. En 'dispersion' la primera es el eje Y."),
            **opciones.ventana(con_granularidad=True),
            "variable_x": opciones.variable("Solo 'dispersion': la variable del eje X."),
        },
        "required": ["tipo", "variables"],
        "additionalProperties": False,
    },
}


_GRAFICADORES = {cs.SERIE: _serie, cs.BARRAS: _barras, cs.CAJAS: _cajas,
                 cs.CARPETA: _carpeta, cs.DISPERSION: _dispersion, cs.CRESTAS: _crestas}
_CON_GRANULARIDAD = (cs.SERIE, cs.BARRAS)


def _validar(tipo: str, claves: list[str], granularidad: str | None,
             variable_x: str | None) -> None:
    if tipo not in _GRAFICADORES:
        raise ValueError(f"tipo de grafico desconocido: {tipo!r} ({', '.join(cs.TIPOS)})")
    if not claves:
        raise ValueError("hace falta al menos una variable para graficar")
    if granularidad and tipo not in _CON_GRANULARIDAD:
        raise ValueError(f"'granularidad' solo aplica a {', '.join(_CON_GRANULARIDAD)}")
    if (tipo == cs.DISPERSION) != (variable_x is not None):
        raise ValueError("'variable_x' es obligatoria en 'dispersion' y solo vale ahi")


def run(tipo: str, variables: str | list[str], desde: str | None = None,
        hasta: str | None = None, granularidad: str | None = None,
        variable_x: str | None = None) -> dict:
    claves = [variables] if isinstance(variables, str) else list(variables or [])
    _validar(tipo, claves, granularidad, variable_x)
    v = crear(desde, hasta, granularidad)
    grafico, resumen = _GRAFICADORES[tipo](v, claves, granularidad, variable_x)
    return {
        "resumen": {"tipo": tipo, "titulo": grafico["titulo"],
                    "periodo": {"desde": v.desde.isoformat(), "hasta": v.hasta.isoformat()},
                    "unidad": grafico["unidad"], **resumen},
        "_grafico": grafico,
        "nota": _NOTA,
    }
