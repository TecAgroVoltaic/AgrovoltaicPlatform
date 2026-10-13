"""Variables de la Supabase PV: salen del catalogo analitico, solo las disponibles.

Se leen de la MISMA relacion corregida y con el MISMO filtro que usan los graficos
(`analitica.fuente.origen`): exportar de la tabla cruda traeria las filas del
piranometro mezcladas con las del inversor.
"""
from __future__ import annotations

from historico.analitica import catalogo as cat_analitico
from historico.analitica import fuente
from historico.analitica.catalogo import ELECTRICO, RADIACION, TERMICO
from historico.catalogo_datos.modelo import VariableDatos, nota_corta
from historico.fuentes.catalogo import SUPABASE_PV

# familia del catalogo analitico -> (grupo, etiqueta del grupo)
_GRUPOS = {
    ELECTRICO: ("inversor", "Inversor"),
    TERMICO: ("temperaturas", "Temperaturas de módulo e inversor"),
    RADIACION: ("radiacion", "Radiación"),
}
# Cadencia nativa aproximada: desde 2025-11 todo el historico PV va a 5 min (con
# jitter hasta 330 s); antes hubo tramos a 2 s y 1 min.
CADENCIA_PV_S = 300


def _max(a: str | None, b: str | None) -> str | None:
    return max(x for x in (a, b) if x) if (a or b) else None


def _min(a: str | None, b: str | None) -> str | None:
    return min(x for x in (a, b) if x) if (a or b) else None


def variables(cobertura: dict[str, tuple[str | None, str | None]]) -> list[VariableDatos]:
    """Una `VariableDatos` por variable disponible. `cobertura`: relacion -> (desde, hasta).

    La cobertura es la INTERSECCION del tramo de la tabla con el tramo en que la
    variable existe segun el catalogo (p. ej. la reflejada nace el 2025-10-25)."""
    out = []
    for var in cat_analitico.disponibles():
        o = fuente.origen(var.clave)
        grupo, etiqueta_grupo = _GRUPOS.get(var.familia, (var.familia, var.familia.capitalize()))
        t_desde, t_hasta = cobertura.get(o.relacion, (None, None))
        v_desde = var.dato_desde.isoformat() if var.dato_desde else None
        v_hasta = var.dato_hasta.isoformat() if var.dato_hasta else None
        out.append(VariableDatos(
            fuente=SUPABASE_PV, clave=var.clave, grupo=grupo, grupo_etiqueta=etiqueta_grupo,
            etiqueta=var.etiqueta, unidad=var.unidad,
            desde=_max(t_desde, v_desde), hasta=_min(t_hasta, v_hasta),
            cadencia_s=CADENCIA_PV_S, nota=nota_corta(var.hueco),
            relacion=o.relacion, columna=o.columna, filtro=o.filtro, reloj="local",
        ))
    return out
