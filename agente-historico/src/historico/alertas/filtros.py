"""Apoyo PURO de los endpoints de alertas: el WHERE del listado y los enlaces de la ficha.

Todo valor del usuario viaja por `%s`; los nombres de columna son literales de
este modulo. Los errores (estado o tipo desconocido, fecha ilegible) los traduce
`historico.errores` por su `codigo`.
"""
from __future__ import annotations

from datetime import date, timedelta
from urllib.parse import urlencode

from historico.alertas import ciclo, reglas
from historico.analitica.ventana import VentanaInvalida
from historico.calidad.pruebas.contrato import AVISO, GRAVE

SEVERIDADES = (AVISO, GRAVE)
_SEPARADOR = ","
_ESCAPE_LIKE = str.maketrans({"\\": "\\\\", "%": "\\%", "_": "\\_"})


def _filtro(estado, severidad, tipo, q, desde, hasta) -> tuple[str, list]:
    """El WHERE que comparten el conteo y la pagina. Todo valor va por `%s`."""
    estados = _lista(estado) or list(ciclo.ABIERTOS)
    _exigir("estado", estados, ciclo.ESTADOS)
    cond, params = ["estado = ANY(%s)"], [estados]
    if severidad:
        _exigir("severidad", [severidad], SEVERIDADES)
        cond.append("severidad = %s")
        params.append(severidad)
    if tipo:
        _exigir("tipo", [tipo], tuple(reglas.DEFINICIONES))
        cond.append("tipo = %s")
        params.append(tipo)
    if q and q.strip():
        patron = f"%{q.strip().translate(_ESCAPE_LIKE)}%"
        cond.append("(titulo ILIKE %s ESCAPE '\\' OR variable ILIKE %s ESCAPE '\\')")
        params += [patron, patron]
    if desde:
        cond.append("fecha_fin >= %s")
        params.append(_fecha("desde", desde))
    if hasta:
        cond.append("fecha_inicio < %s")
        params.append(_fecha("hasta", hasta))
    return " AND ".join(cond), params


def _lista(texto: str | None) -> list[str]:
    return [p.strip() for p in (texto or "").split(_SEPARADOR) if p.strip()]


def _exigir(campo: str, valores: list[str], validos) -> None:
    desconocidos = [v for v in valores if v not in validos]
    if desconocidos:
        raise ValueError(f"{campo} desconocido: {', '.join(desconocidos)}; "
                         f"validos: {', '.join(validos)}")


def _fecha(campo: str, texto: str) -> date:
    try:
        return date.fromisoformat(texto)
    except ValueError as exc:
        raise VentanaInvalida(
            "fecha_ilegible", f"{campo} no es una fecha ISO (aaaa-mm-dd): {texto!r}") from exc


def _enlaces(alerta: dict, definicion: reglas.Definicion | None) -> dict:
    """A Calidad y a Series con el rango de la alerta (`hasta` exclusivo)."""
    hasta = date.fromisoformat(alerta["fecha_fin"]) + timedelta(days=1)
    rango = {"desde": alerta["fecha_inicio"], "hasta": hasta.isoformat()}
    variable = alerta["variable"]
    variables = (definicion.variables_de_series(variable) if definicion
                 else [] if variable == reglas.DIA_ENTERO else [variable])
    return {"calidad": f"/calidad?{urlencode(rango)}",
            "series": "/series?" + urlencode(
                {"variables": _SEPARADOR.join(variables), **rango}, safe=_SEPARADOR)}
