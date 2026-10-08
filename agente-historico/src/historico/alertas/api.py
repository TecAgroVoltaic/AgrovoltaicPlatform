"""Endpoints de alertas (contrato 4.5). Transporte: valida, delega en el store, responde.

El router NO declara la API key: la exige `historico.api` al montarlo
(`include_router(..., dependencies=[Depends(_verificar_api_key)])`); la
verificacion vive en `historico.rutas.dependencias`. El WHERE del listado y los
enlaces de la ficha estan en `historico.alertas.filtros`.

Los errores (fecha ilegible, estado desconocido, transicion invalida, id
inexistente) los traduce `historico.errores` por su `codigo`, no un try por ruta.
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Body, Query
from pydantic import BaseModel, Field, field_validator

from historico.alertas import ciclo, evaluar, reglas, store
from historico.alertas.filtros import SEVERIDADES, _enlaces, _filtro  # noqa: F401

router = APIRouter(prefix="/alertas", tags=["alertas"])

LIMITE_POR_DEFECTO, LIMITE_MAXIMO = 20, 100
LARGO_MAXIMO_NOTA, LARGO_MAXIMO_AUTOR = 2000, 80
AUTOR_POR_DEFECTO = "consola"
# Lo grave primero, lo mas reciente despues; el id desempata para que paginar
# sea estable entre dos peticiones.
_ORDEN = "(severidad = 'grave') DESC, fecha_fin DESC, id DESC"


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
