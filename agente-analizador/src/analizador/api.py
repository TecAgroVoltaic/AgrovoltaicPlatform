"""API HTTP del analizador — expone cada tool atomica como endpoint para VisioneFlow.

Patron "cerebro vs manos" (igual que el forecaster): el LLM lo orquesta el nodo
`aiAgent` de VisioneFlow; los numeros salen de AQUI. Cada tool atomica es un endpoint
`POST /tool/<nombre>`, que se cablea como una instancia del nodo generico
`httpRequestTool`. Transporte puro: valida en el borde, delega en la tool, responde
su dict (ya JSON-serializable).

Seguridad: si ANALIZADOR_API_KEY esta en el entorno, /tool exige el header
`x-api-key` (comparacion en tiempo constante). /health y /tools quedan abiertos.
"""
from __future__ import annotations

import os
import secrets
import threading

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from analizador import datos, exportar, tools, uso

ENV_API_KEY = "ANALIZADOR_API_KEY"

app = FastAPI(
    title="Analizador PV San Carlos",
    description="Tools de analisis del historico fotovoltaico como endpoints HTTP.",
    version="1.2.0",
)

# Agente perezoso: solo se construye al primer /preguntar (anthropic.Anthropic()
# exige ANTHROPIC_API_KEY al crear el cliente; /health y /tool no deben depender
# de esa clave). Se cachea para no releer el entorno en cada request.
_AGENTE = None


def _agente():
    global _AGENTE
    if _AGENTE is None:
        from analizador.agent.agent import Analizador
        _AGENTE = Analizador()
    return _AGENTE


class Pregunta(BaseModel):
    """Cuerpo de POST /preguntar."""

    pregunta: str


class ChatMsg(BaseModel):
    """Un turno del historial de chat (texto limpio)."""

    rol: str  # "user" | "assistant"
    texto: str


class ChatBody(BaseModel):
    """Cuerpo de POST /chat: historial + contexto de la vista."""

    mensajes: list[ChatMsg]
    contexto: str | None = None


def _verificar_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Exige la API key SOLO si esta configurada. Comparacion en tiempo constante."""
    esperada = os.environ.get(ENV_API_KEY)
    if not esperada:
        return
    if not secrets.compare_digest(esperada, x_api_key or ""):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="API key invalida")


@app.get("/health")
def health() -> dict:
    """Ping para monitoreo. No toca datos ni exige clave."""
    return {"status": "ok", "tools": [s["name"] for s in tools.SCHEMAS]}


@app.get("/tools")
def listar_tools() -> dict:
    """Esquemas de las tools (para configurar los httpRequestTool en VisioneFlow)."""
    return {"tools": tools.SCHEMAS}


@app.post("/tool/{nombre}", dependencies=[Depends(_verificar_api_key)])
def ejecutar_tool(nombre: str, params: dict = Body(default={})) -> dict:
    """Ejecuta la tool `nombre` con el body JSON como parametros. `def` -> threadpool
    (las tools hacen I/O de DB sincrono)."""
    fn = tools.DISPATCH.get(nombre)
    if fn is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail=f"tool desconocida: {nombre!r} ({', '.join(tools.DISPATCH)})",
        )
    try:
        return fn(**(params or {}))
    except TypeError as exc:  # parametro invalido -> culpa del cliente
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


# ── Agente completo (con TRAZA) — para el debugger ────────────────────────────
@app.post("/preguntar", dependencies=[Depends(_verificar_api_key)])
def preguntar(cuerpo: Pregunta) -> dict:
    """Corre el lazo LLM completo y devuelve la TRAZA (pasos + tools + respuesta + costo).

    Es la vista que consume el debugger: se ve que tool eligio el agente, con que
    parametros, la salida cruda de cada una, la respuesta final y el costo USD.
    `def` -> el lazo (I/O de red al LLM + DB) corre en el threadpool de FastAPI.

    La acumulacion de uso/costo se hace ACA (no en conversar()): el lazo del agente
    queda puro y el servicio es el que lleva la cuenta general."""
    traza = _agente().conversar(cuerpo.pregunta)
    try:
        uso.registrar(traza)  # best-effort: un fallo de disco no debe tumbar la respuesta
    except Exception:
        pass
    return traza


@app.post("/chat", dependencies=[Depends(_verificar_api_key)])
def chat(cuerpo: ChatBody) -> dict:
    """Turno de CHAT multi-turno (para el widget). Recibe el historial de texto y el
    contexto de la vista; devuelve la respuesta + traza (tools/web) + costo."""
    traza = _agente().chat([m.model_dump() for m in cuerpo.mensajes], cuerpo.contexto)
    try:
        uso.registrar(traza)
    except Exception:
        pass
    return traza


@app.get("/uso", dependencies=[Depends(_verificar_api_key)])
def consumo() -> dict:
    """Consumo acumulado del agente (tokens + costo USD + nº consultas, por modelo)."""
    return uso.resumen()


# ── Peek de datos read-only — para cruzar lo que el agente calculo ────────────
@app.get("/datos/tablas", dependencies=[Depends(_verificar_api_key)])
def datos_tablas() -> dict:
    """Panorama de cobertura de todas las relaciones (conteo + rango temporal)."""
    return datos.tablas()


@app.get("/datos/columnas", dependencies=[Depends(_verificar_api_key)])
def datos_columnas(tabla: str = Query(...)) -> dict:
    """Esquema (columnas + tipos) de una relacion de la allowlist."""
    try:
        return datos.columnas(tabla)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.get("/datos/muestra", dependencies=[Depends(_verificar_api_key)])
def datos_muestra(tabla: str = Query(...), limit: int = Query(20),
                  orden: str = Query("desc")) -> dict:
    """Ultimas/primeras filas crudas de una relacion (allowlist)."""
    try:
        return datos.muestra(tabla, limit, orden)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@app.get("/datos/serie", dependencies=[Depends(_verificar_api_key)])
def datos_serie(tabla: str = Query(...), columna: str = Query(...),
                bucket: str = Query("day"), agg: str = Query("avg"),
                desde: str | None = Query(None), hasta: str | None = Query(None)) -> dict:
    """Serie temporal agregada (para graficar) de una columna de la allowlist."""
    try:
        return datos.serie(tabla, columna, bucket, agg, desde, hasta)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


# ── Exportacion por rango de fechas (csv / dat / mat) — descarga para el humano ─
def _lista(csv_: str | None) -> list[str] | None:
    return [c.strip() for c in csv_.split(",") if c.strip()] if csv_ else None


def _filtros(caja: str | None, sensor_tipo: str | None) -> dict[str, list[str]]:
    """Filtros opcionales (solo los datasets que los declaran los aceptan)."""
    out: dict[str, list[str]] = {}
    if caja:
        out["caja"] = _lista(caja) or []
    if sensor_tipo:
        out["sensor_tipo"] = _lista(sensor_tipo) or []
    return out


def _http(exc: Exception) -> HTTPException:
    """Traduce los errores de exportar.py a codigos: 400 cliente, 413 muy grande,
    503 fuente sin configurar (RuntimeError de config)."""
    if isinstance(exc, exportar.ExportacionDemasiadoGrande):
        return HTTPException(413, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if isinstance(exc, RuntimeError):
        return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    raise exc


@app.get("/datos/exportables", dependencies=[Depends(_verificar_api_key)])
def datos_exportables() -> dict:
    """Que se puede exportar, por fuente: datasets, columnas reales, cobertura, filtros."""
    return exportar.catalogo()


@app.get("/datos/exportar/estimar", dependencies=[Depends(_verificar_api_key)])
def datos_exportar_estimar(tabla: str = Query(...), desde: str | None = Query(None),
                           hasta: str | None = Query(None), fuente: str = Query("supabase"),
                           caja: str | None = Query(None), sensor_tipo: str | None = Query(None),
                           paso: int = Query(0)) -> dict:
    """Cuantas filas caeran en el rango (para avisar antes de descargar)."""
    try:
        return exportar.estimar(tabla, desde, hasta, fuente, _filtros(caja, sensor_tipo), paso)
    except Exception as exc:  # noqa: BLE001
        raise _http(exc) from exc


@app.get("/datos/exportar/previa", dependencies=[Depends(_verificar_api_key)])
def datos_exportar_previa(tabla: str = Query(...), desde: str | None = Query(None),
                          hasta: str | None = Query(None), columnas: str | None = Query(None),
                          fuente: str = Query("supabase"), caja: str | None = Query(None),
                          sensor_tipo: str | None = Query(None), n: int = Query(8),
                          paso: int = Query(0)) -> dict:
    """Primeras filas del rango, tal como saldran en el archivo (vista previa)."""
    try:
        return exportar.previa(tabla, desde, hasta, _lista(columnas), fuente,
                               _filtros(caja, sensor_tipo), n, paso)
    except Exception as exc:  # noqa: BLE001
        raise _http(exc) from exc


# Descargas simultaneas: cada una ocupa un hilo del threadpool mientras dura (y, via
# API, hasta PARALELO llamadas a AgroDash). Un tope evita que clics repetidos agoten
# el servicio para todos. Se libera al terminar de emitir (o al cortar el cliente).
MAX_EXPORTACIONES = int(os.environ.get("MAX_EXPORTACIONES", "3"))
_exportaciones = threading.BoundedSemaphore(MAX_EXPORTACIONES)


def _con_cupo(cuerpo):
    """Envuelve el iterador de bytes para devolver el cupo cuando se agota o se cierra."""
    try:
        yield from cuerpo
    finally:
        _exportaciones.release()


@app.get("/datos/exportar", dependencies=[Depends(_verificar_api_key)])
def datos_exportar(tabla: str = Query(...), formato: str = Query("csv"),
                   desde: str | None = Query(None), hasta: str | None = Query(None),
                   columnas: str | None = Query(None), fuente: str = Query("supabase"),
                   caja: str | None = Query(None), sensor_tipo: str | None = Query(None),
                   paso: int = Query(0)) -> StreamingResponse:
    """Descarga el rango [desde, hasta] de un dataset como archivo adjunto.

    `columnas`, `caja` y `sensor_tipo` son listas separadas por comas (opcionales);
    `paso` (seg, solo AgroDash) es el ancho del bucket: 0 = crudo.
    El cuerpo se emite por lotes: la respuesta empieza antes de leer todo. `def` ->
    threadpool (el cursor de servidor es I/O sincrono)."""
    if not _exportaciones.acquire(blocking=False):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            detail=f"ya hay {MAX_EXPORTACIONES} descargas en curso: espera a que terminen")
    try:
        ex = exportar.exportar(tabla, formato, desde, hasta, _lista(columnas), fuente,
                               _filtros(caja, sensor_tipo), paso)
    except Exception as exc:  # noqa: BLE001
        _exportaciones.release()
        raise _http(exc) from exc
    return StreamingResponse(
        _con_cupo(ex.cuerpo), media_type=ex.content_type,
        headers={"Content-Disposition": f'attachment; filename="{ex.nombre}"'},
    )
