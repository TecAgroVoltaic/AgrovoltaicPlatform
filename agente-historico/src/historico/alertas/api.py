"""Endpoints de alertas (contrato 4.5). Transporte: valida, delega en el store, responde.

El router NO declara la API key: la exige `historico.api` al montarlo
(`include_router(..., dependencies=[Depends(_verificar_api_key)])`), que es donde
vive esa verificacion. Importarla desde aca cerraria un ciclo de imports.

Los errores (fecha ilegible, estado desconocido, transicion invalida, id
inexistente) los traduce `historico.errores` por su `codigo`, no un try por ruta.
"""
from __future__ import annotations

from datetime import date, timedelta
from urllib.parse import urlencode

from fastapi import APIRouter, Body, Query
from pydantic import BaseModel, Field, field_validator

from historico.alertas import ciclo, evaluar, reglas, store
from historico.analitica.ventana import VentanaInvalida
from historico.calidad.pruebas.contrato import AVISO, GRAVE

router = APIRouter(prefix="/alertas", tags=["alertas"])

LIMITE_POR_DEFECTO, LIMITE_MAXIMO = 20, 100
LARGO_MAXIMO_NOTA, LARGO_MAXIMO_AUTOR = 2000, 80
AUTOR_POR_DEFECTO = "consola"
SEVERIDADES = (AVISO, GRAVE)
_SEPARADOR = ","
# Lo grave primero, lo mas reciente despues; el id desempata para que paginar
# sea estable entre dos peticiones.
_ORDEN = "(severidad = 'grave') DESC, fecha_fin DESC, id DESC"
_ESCAPE_LIKE = str.maketrans({"\\": "\\\\", "%": "\\%", "_": "\\_"})


class CuerpoAccion(BaseModel):
    nota: str | None = Field(None, max_length=LARGO_MAXIMO_NOTA)
    autor: str = Field(AUTOR_POR_DEFECTO, min_length=1, max_length=LARGO_MAXIMO_AUTOR)


class CuerpoSeguimiento(CuerpoAccion):
    nota: str = Field(..., max_length=LARGO_MAXIMO_NOTA)
    proxima_revision: date | None = None

    @field_validator("nota")
    @classmethod
    def _nota_con_texto(cls, nota: str) -> str:
        if not nota.strip():
            raise ValueError("el seguimiento exige una nota")
        return nota.strip()


class CuerpoEvaluar(BaseModel):
    desde: date | None = None
    hasta: date | None = None


@router.get("")
def listar(estado: str | None = Query(None), severidad: str | None = Query(None),
           tipo: str | None = Query(None), q: str | None = Query(None),
           desde: str | None = Query(None), hasta: str | None = Query(None),
           limite: int = Query(LIMITE_POR_DEFECTO, ge=1, le=LIMITE_MAXIMO),
           offset: int = Query(0, ge=0)) -> dict:
    """Por defecto solo las abiertas. `total` describe el filtro, no la pagina."""
    donde, params = _filtro(estado, severidad, tipo, q, desde, hasta)
    total, alertas = store.listar(donde, params, _ORDEN, limite, offset)
    hay_mas = offset + len(alertas) < total
    return {"total": total,
            "pagina": {"offset": offset, "limite": limite, "hay_mas": hay_mas,
                       "siguiente_offset": offset + len(alertas) if hay_mas else None},
            "alertas": alertas}


@router.get("/resumen")
def resumen() -> dict:
    return store.resumen()


@router.post("/evaluar")
def evaluar_rango(cuerpo: CuerpoEvaluar = Body(default_factory=CuerpoEvaluar)) -> dict:
    return evaluar.evaluar(cuerpo.desde, cuerpo.hasta)


@router.get("/{alerta_id}")
def ficha(alerta_id: int) -> dict:
    alerta, eventos = store.obtener(alerta_id)
    definicion = reglas.DEFINICIONES.get(alerta["tipo"])
    return {"alerta": alerta, "eventos": eventos,
            "que_es": definicion.que_es if definicion else "",
            "enlaces": _enlaces(alerta, definicion)}


def _accion(accion: ciclo.Accion):
    def endpoint(alerta_id: int, cuerpo: CuerpoAccion = Body(default_factory=CuerpoAccion)):
        return {"alerta": store.transicionar(alerta_id, accion, cuerpo.nota, cuerpo.autor)}
    return endpoint


for _accion_simple in (ciclo.Accion.RECONOCER, ciclo.Accion.RESOLVER,
                       ciclo.Accion.DESCARTAR, ciclo.Accion.REABRIR):
    router.add_api_route(f"/{{alerta_id}}/{_accion_simple.value}", _accion(_accion_simple),
                         methods=["POST"], name=_accion_simple.value)


@router.post("/{alerta_id}/seguimiento")
def seguimiento(alerta_id: int, cuerpo: CuerpoSeguimiento) -> dict:
    return {"alerta": store.transicionar(alerta_id, ciclo.Accion.SEGUIMIENTO, cuerpo.nota,
                                         cuerpo.autor, cuerpo.proxima_revision)}


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
