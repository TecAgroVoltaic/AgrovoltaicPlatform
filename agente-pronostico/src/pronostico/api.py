"""
API HTTP del forecaster: UNICO puente entre un cliente externo (VisioneFlow u
otro) y `run_forecast`. Transporte puro: valida el request en el borde, delega
en la tool existente y responde su dict tal cual (ya es JSON-serializable).

Seguridad: si FORECAST_API_KEY esta definida en el entorno, POST /forecast
exige el header `x-api-key` con ese valor exacto (401 si falta o no coincide).
GET /health queda abierto para monitoreo. Un fallo interno (p. ej. DB caida)
responde el 500 generico de FastAPI: el detalle queda en el log del servidor,
nunca en la respuesta.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from pronostico import anomalias as anomalias_mod
from pronostico import audit
from pronostico import claves
from pronostico import backtest as backtest_mod
from pronostico import data as data_mod
from pronostico import limites
from pronostico import observabilidad
from pronostico import salud as salud_mod
from pronostico import uso as uso_mod
from pronostico.domain import Variable
from pronostico.tools.forecast_tool import FORECAST_TOOL_SCHEMA, run_forecast

# Limites del horizonte: se leen del CONTRATO publicado (input_schema de la
# tool) para tener una sola fuente de verdad — si la tool cambia sus limites,
# la API los hereda sin tocar este archivo.
_HORIZONTE = FORECAST_TOOL_SCHEMA["input_schema"]["properties"]["horizon_seconds"]
_MIN_HORIZONTE_SEG = _HORIZONTE["minimum"]
_MAX_HORIZONTE_SEG = _HORIZONTE["maximum"]

# Nombre de la variable de entorno con la clave (si no esta, la API es abierta).
ENV_API_KEY = "FORECAST_API_KEY"

_log = logging.getLogger(__name__)

app = FastAPI(
    title="Pronostico ambiental (irradiancia + humedad de suelo)",
    description="Envuelve run_forecast (despacho por variable) como HTTP.",
    version="1.1.0",
)


class ForecastRequest(BaseModel):
    """Cuerpo de POST /forecast — espejo del input_schema de la tool."""

    variable: str = Field(
        default=Variable.IRRADIANCIA.value,
        description="Variable a pronosticar: 'irradiancia' o 'humedad_suelo'.",
    )
    horizon_seconds: int = Field(
        ge=_MIN_HORIZONTE_SEG,
        le=_MAX_HORIZONTE_SEG,
        description="Horizonte del pronostico en segundos.",
    )
    horizonte_texto: str | None = Field(
        default=None,
        description="Frase original del horizonte ('dos horas'); valida la "
                    "conversion de forma determinista (parse_horizon manda).",
    )
    origen: str = Field(
        default="api",
        description="Quien pide el pronostico (para el audit): 'api', "
                    "'webhook', 'visioneflow-schedule', etc.",
    )
    ahora: str | None = Field(
        default=None,
        description="INSTANTE DE REFERENCIA en ISO ('2026-07-22T10:00'). Ancla el "
                    "pronostico en un momento historico: el forecaster solo ve "
                    "datos ANTERIORES a ese instante (misma barrera anti-fuga del "
                    "backtest). Omitido = ultimo dato disponible.",
    )


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
    modo: Literal["con_respuesta", "a_ciegas"] = Field(
        default="con_respuesta",
        description="Que puede ver el agente. 'con_respuesta': ve lo que midio el "
                    "sensor (incluye `backtest`), sirve para juzgar el metodo. "
                    "'a_ciegas': NO lo ve (sin `backtest` ni web), pronostica de "
                    "verdad. Un valor invalido es 422, nunca una caida silenciosa "
                    "al modo permisivo.",
    )


class AnomaliasRequest(BaseModel):
    """Cuerpo de POST /anomalias."""

    variable: str = Field(
        description="Variable a analizar: 'irradiancia' o 'humedad_suelo'.",
    )
    ventana_min: int = Field(
        default=1440, ge=60, le=43200,
        description="Ventana a analizar en MINUTOS (24h=1440, 7d=10080, 30d=43200).",
    )


def _identidad(req: Request, x_api_key: str | None) -> str:
    """Quien llama, para el rate-limit y los logs.

    El NOMBRE del consumidor si la clave es valida, si no la IP. Antes viajaban
    los primeros 8 caracteres de la clave: material de clave dando vueltas por
    el diccionario del limitador y por cualquier log, a cambio de nada.
    """
    nombre = claves.identificar(x_api_key)
    if nombre:
        return f"cliente:{nombre}"
    return f"ip:{req.client.host if req.client else 'desconocida'}"


def _limitar(limitador: limites.LimitadorRitmo, req: Request,
             x_api_key: str | None) -> None:
    """429 si la identidad se paso del ritmo. Retry-After para que un cliente
    bien hecho reintente solo."""
    if limitador.permitir(_identidad(req, x_api_key)):
        return
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=(f"limite de {limitador.por_minuto} solicitudes por minuto alcanzado; "
                f"reintentá en unos segundos"),
        headers={"Retry-After": str(limitador.espera_seg())},
    )


def _frenar_llm(req: Request, x_api_key: str | None = Header(default=None)) -> None:
    """Freno de los endpoints que gastan tokens: ritmo + presupuesto diario."""
    _limitar(limites.LIMITADOR_LLM, req, x_api_key)
    agotado, gastado, tope = limites.presupuesto_agotado()
    if agotado:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(f"presupuesto diario agotado: US${gastado:.4f} de US${tope:.2f}. "
                    f"Se reanuda a las 00:00 UTC o subiendo PRESUPUESTO_DIARIO_USD."),
        )


def _frenar_datos(req: Request, x_api_key: str | None = Header(default=None)) -> None:
    """Freno de los endpoints deterministas: solo ritmo (no gastan tokens)."""
    _limitar(limites.LIMITADOR_DATOS, req, x_api_key)


def _verificar_api_key(x_api_key: str | None = Header(default=None)) -> str | None:
    """Exige una API key valida SOLO si hay alguna configurada.

    Devuelve el nombre del consumidor (util para el log). Sin claves definidas
    la API queda abierta: es el modo de desarrollo local. Ver `claves.py` para
    por que son con nombre y no una sola compartida.
    """
    if not claves.exigida():
        return None
    nombre = claves.identificar(x_api_key)
    if nombre is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="API key invalida"
        )
    return nombre


def _registrar_uso(traza: dict) -> None:
    """Acumula el uso sin tumbar la respuesta si el store falla.

    Best-effort SI, silencioso NO: el acumulado venia fallando con
    PermissionError en el contenedor y nadie se enteraba -> /uso reportaba 0.0
    y el tope diario (que lo lee) nunca podia dispararse.
    """
    # UNA sola llamada: uso_mod escribe primero el store (la fuente de verdad,
    # que sobrevive a que se recree el contenedor) y despues el espejo local.
    # Antes habia dos escrituras desde aca y era facil terminar contando dos
    # veces la misma consulta.
    try:
        uso_mod.registrar(traza)
    except Exception:  # noqa: BLE001
        _log.warning("no se pudo registrar el uso en %s", uso_mod._RUTA, exc_info=True)


@app.get("/health")
def health() -> dict:
    """Ping para monitoreo/orquestadores. No toca datos ni exige clave."""
    return {"status": "ok"}


# Claves del reporte de ingesta que NO salen por la ruta publica. El motivo no
# es el volumen sino el contenido: `ultimo_error_etl` trae el mensaje CRUDO de
# Postgres, que hoy incluye un fragmento de `COPY` con un UUID de sensor y el
# nombre de una caja. Un monitor necesita saber si el sistema esta sano, no
# leerle las entrañas. El detalle completo vive en /salud/panel, con clave.
_PRIVADO_DE_INGESTA = ("ultimo_error_etl",)


def _publico(reporte: dict) -> dict:
    """El reporte de ingesta sin lo que no debe salir sin clave.

    De la corrida del ETL sobrevive el HECHO (cuando fue, si termino bien, si
    trajo filas) y se van los mensajes de error por variable, que arrastran
    identificadores internos.
    """
    salida = {k: v for k, v in reporte.items() if k not in _PRIVADO_DE_INGESTA}
    corrida = salida.get("ultima_corrida_etl")
    if isinstance(corrida, dict):
        salida["ultima_corrida_etl"] = {
            k: v for k, v in corrida.items() if k != "por_variable"
        }
    return salida


@app.get("/salud/ingesta")
def salud_ingesta(umbral_horas: float | None = Query(default=None, gt=0)) -> dict:
    """Frescura de la ingesta por variable, para monitoreo externo.

    ABIERTO como /health: un monitor debe poder consultarlo sin manejar la
    clave. Por eso mismo pasa por `_publico()`: lo que sale de aca lo puede leer
    cualquiera. Devuelve 503 si la ingesta no esta `ok`, para que un healthcheck
    HTTP lo detecte por status code sin parsear el cuerpo.
    """
    try:
        reporte = _publico(salud_mod.estado_ingesta(umbral_horas))
    except Exception as exc:  # store caido: eso TAMBIEN es un fallo de salud
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"no se pudo consultar el store: {type(exc).__name__}",
        ) from exc
    if reporte["estado"] != salud_mod.ESTADO_OK:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=reporte
        )
    return reporte


@app.get("/salud/panel",
         dependencies=[Depends(_verificar_api_key), Depends(_frenar_datos)])
def salud_panel() -> dict:
    """Estado operativo para el panel: fuente + ingesta + ETL + errores + gasto.

    A diferencia de /salud/ingesta (abierto, para monitoreo automático), este
    exige la clave: incluye el gasto en USD. Responde 200 SIEMPRE que el proceso
    esté vivo — aunque la ingesta esté `stale` o el store no conteste. Un panel
    de diagnóstico que devuelve un 503 vacío justo cuando algo se rompió esconde
    lo único que el operador necesita ver; `observabilidad.panel()` garantiza
    que cada bloque degrade con su propio `error` (por eso acá no hay try).
    """
    return observabilidad.panel()


@app.get("/arquitectura",
         dependencies=[Depends(_verificar_api_key), Depends(_frenar_datos)])
def arquitectura() -> dict:
    """El agente descrito como dato: modos, herramientas con su esquema, limites.

    Lo consume la vista de arquitectura de la consola para DIBUJAR el agente sin
    transcribirlo. Todo se deriva de `agent.MODOS` y de los `input_schema`
    reales, asi que la vista no puede quedar desincronizada del codigo.
    """
    # Import diferido igual que `_agente()`: `arquitectura` lee `agent.MODOS`, y
    # eso arrastra el SDK de Anthropic. No hay razon para pagarlo al arrancar.
    from pronostico import arquitectura as arquitectura_mod
    return arquitectura_mod.mapa()


# Agente perezoso: solo se construye al primer /preguntar (anthropic.Anthropic()
# exige ANTHROPIC_API_KEY al crear el cliente; el resto de endpoints no dependen
# de esa clave).
_AGENTE = None


def _agente():
    global _AGENTE
    if _AGENTE is None:
        from pronostico.agent.agent import ForecastAgent
        _AGENTE = ForecastAgent()
    return _AGENTE


@app.post("/preguntar",
          dependencies=[Depends(_verificar_api_key), Depends(_frenar_llm)])
def preguntar(cuerpo: Pregunta) -> dict:
    """Corre el lazo LLM completo y devuelve la TRAZA (pasos + forecast + respuesta + costo).

    Es la vista del debugger: se ve el horizonte que tradujo, el input a `forecast`,
    su salida cruda (valor + banda + contexto), la redaccion final y el costo USD.
    La acumulacion de uso/costo se hace ACA (no en conversar()) para mantener el lazo puro."""
    traza = _agente().conversar(cuerpo.pregunta)
    _registrar_uso(traza)
    return traza


@app.post("/chat",
          dependencies=[Depends(_verificar_api_key), Depends(_frenar_llm)])
def chat(cuerpo: ChatBody) -> dict:
    """Turno de CHAT multi-turno del forecaster (para el widget): historial + contexto
    de la vista -> respuesta + traza (forecast/web) + costo."""
    traza = _agente().chat([m.model_dump() for m in cuerpo.mensajes],
                           cuerpo.contexto, cuerpo.modo)
    _registrar_uso(traza)
    return traza


@app.get("/uso", dependencies=[Depends(_verificar_api_key)])
def consumo() -> dict:
    """Consumo acumulado del agente (tokens + costo USD + nº consultas, por modelo)."""
    return uso_mod.resumen()


@app.get("/serie",
         dependencies=[Depends(_verificar_api_key), Depends(_frenar_datos)])
def serie(variable: str = Query(Variable.IRRADIANCIA.value),
          bucket: str = Query("D"), ultimos_dias: int | None = Query(60)) -> dict:
    """Panorama de una serie del store (resumen + puntos remuestreados para graficar)."""
    try:
        return data_mod.peek_serie(variable, bucket, ultimos_dias)
    except (ValueError, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@app.get("/backtest",
         dependencies=[Depends(_verificar_api_key), Depends(_frenar_datos)])
def backtest(variable: str = Query(Variable.IRRADIANCIA.value),
             dias: int = Query(7), bucket: str = Query("h"),
             desde: str | None = Query(None), hasta: str | None = Query(None),
             estadistico: str = Query("ewma"),
             peso: float | None = Query(None),
             kt_max: float | None = Query(None),
             ajuste_diurno: bool = Query(True)) -> dict:
    """Backtest HONESTO del metodo (reconstruccion sobre el historico) vs. lo medido.

    Por defecto los ultimos `dias`; con `desde`/`hasta` evalua ese rango. NO son
    predicciones en vivo (esas viven en `predicciones`); es evaluacion del metodo.

    Las cuatro ultimas son las PERILLAS del metodo, las MISMAS que usa el
    forecaster en vivo. Antes `backtest.backtest` aceptaba perillas que ningun
    cliente podia pasar: codigo muerto que hacia creer que la evaluacion era
    configurable cuando no lo era. `ajuste_diurno=false` reproduce el metodo
    anterior a la correccion del sesgo por hora, para poder compararlos."""
    try:
        return backtest_mod.backtest(variable, dias, bucket, desde, hasta,
                                     estadistico=estadistico, peso=peso,
                                     kt_max=kt_max, ajuste_diurno=ajuste_diurno)
    except (ValueError, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@app.post("/forecast",
          dependencies=[Depends(_verificar_api_key), Depends(_frenar_datos)])
def forecast(cuerpo: ForecastRequest) -> dict:
    """Ejecuta el pronostico fisico y devuelve el dict de run_forecast.

    `def` (no async): run_forecast es sincrono y pesado (pandas/pvlib), asi
    FastAPI lo corre en su threadpool sin bloquear el event loop.
    """
    try:
        t0 = time.perf_counter()
        res = run_forecast(
            cuerpo.variable, cuerpo.horizon_seconds, cuerpo.horizonte_texto,
            now=cuerpo.ahora,
        )
        latencia_ms = int((time.perf_counter() - t0) * 1000)
        # write-back best-effort: audita cada pronostico en `predicciones`.
        # Un pronostico ANCLADO es una reconstruccion, no algo que el sistema
        # predijo en vivo: se marca en `origen` para no contaminar el analisis
        # predicho-vs-real con hindcasts disfrazados de predicciones.
        origen = (f"{cuerpo.origen}:instante-referencia" if cuerpo.ahora
                  else cuerpo.origen)
        audit.registrar_prediccion(res, origen=origen, latencia_ms=latencia_ms)
        return res
    except ValueError as exc:  # variable u horizonte invalidos -> culpa del cliente
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@app.post("/anomalias",
          dependencies=[Depends(_verificar_api_key), Depends(_frenar_datos)])
def detectar_anomalias(cuerpo: AnomaliasRequest) -> dict:
    """Detección DETERMINISTA de anomalías sobre la data reciente del store.

    Devuelve hallazgos (estado, anomalías, estadísticas) para que el LLM los
    narre; el LLM no calcula. `def` (no async): usa pandas/pvlib, threadpool.
    """
    try:
        return anomalias_mod.detectar(cuerpo.variable, cuerpo.ventana_min)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
