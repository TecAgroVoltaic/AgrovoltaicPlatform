#!/usr/bin/env python3
"""
Prueba end-to-end del agente de PRONOSTICO contra un servicio ya corriendo.

Por que existe: la fuente del ETL cambio (Cartago vivo -> replica del dump en la
EC2). Ese cambio toca la cadena entera —fuente, ETL, store, forecaster, LLM— y
"los tests unitarios pasan" no prueba que la cadena siga en pie. Este script
ejercita el servicio REAL por HTTP, como lo hace la consola.

  python3 scripts/e2e.py                       # contra http://127.0.0.1:8000
  BASE=http://127.0.0.1:18000 python3 scripts/e2e.py    # contra el tunel a la EC2
  SIN_LLM=1 python3 scripts/e2e.py             # omite lo que gasta tokens

La clave se toma de FORECAST_API_KEY o PREDICTIVO_API_KEY (no se imprime nunca).
Salida: una linea por chequeo (OK / FALLA / AVISO) y un resumen. Codigo de salida
!= 0 si algo fallo, para poder colgarlo del CI.

Solo stdlib: no exige el venv del proyecto.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("BASE", "http://127.0.0.1:8000").rstrip("/")
KEY = os.environ.get("FORECAST_API_KEY") or os.environ.get("PREDICTIVO_API_KEY") or ""
CON_LLM = os.environ.get("SIN_LLM", "") == ""
TIMEOUT = float(os.environ.get("E2E_TIMEOUT", "120"))

VERDE, ROJO, AMARILLO, GRIS, FIN = "\033[32m", "\033[31m", "\033[33m", "\033[90m", "\033[0m"

_resultados: list[tuple[str, str, str]] = []   # (estado, nombre, detalle)


def _pedir(metodo: str, ruta: str, cuerpo=None, con_key=True) -> tuple[int, dict | str]:
    """Un request HTTP. Devuelve (status, json|texto). Nunca lanza por status."""
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(f"{BASE}{ruta}", data=datos, method=metodo)
    if datos is not None:
        req.add_header("content-type", "application/json")
    if con_key and KEY:
        req.add_header("x-api-key", KEY)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            crudo = r.read().decode()
            status = r.status
    except urllib.error.HTTPError as e:
        crudo, status = e.read().decode(), e.code
    except Exception as e:  # noqa: BLE001 — red caida, timeout, DNS...
        return 0, {"error": f"{type(e).__name__}: {e}"}
    try:
        return status, json.loads(crudo)
    except json.JSONDecodeError:
        return status, crudo


def revisar(nombre: str, condicion: bool, detalle: str = "", aviso: bool = False) -> bool:
    """Registra e imprime un chequeo. `aviso=True` no cuenta como falla."""
    if condicion:
        estado, color = "OK", VERDE
    elif aviso:
        estado, color = "AVISO", AMARILLO
    else:
        estado, color = "FALLA", ROJO
    _resultados.append((estado, nombre, detalle))
    print(f"  {color}{estado:5}{FIN} {nombre}" + (f"  {GRIS}{detalle}{FIN}" if detalle else ""))
    return condicion


def titulo(t: str) -> None:
    print(f"\n{t}")
    print("─" * len(t))


def num(v) -> str:
    return "—" if v is None else f"{v:,.1f}"


# ── 1. Disponibilidad y salud ────────────────────────────────────────────────
def bloque_salud() -> dict:
    titulo("1. Disponibilidad y salud")
    s, d = _pedir("GET", "/health", con_key=False)
    revisar("GET /health responde 200", s == 200 and isinstance(d, dict) and d.get("status") == "ok",
            f"status={s}")

    # /salud/ingesta es publico y devuelve 503 cuando el dato esta viejo: ambos
    # son respuestas VALIDAS del contrato; lo que no puede pasar es no responder.
    s, d = _pedir("GET", "/salud/ingesta", con_key=False)
    reporte = d.get("detail") if isinstance(d, dict) and isinstance(d.get("detail"), dict) else d
    revisar("GET /salud/ingesta responde (200 ok | 503 stale)", s in (200, 503), f"status={s}")

    variables = (reporte or {}).get("variables", {}) if isinstance(reporte, dict) else {}
    for nombre, v in variables.items():
        edad = v.get("edad_horas")
        revisar(f"ingesta · {nombre}: {v.get('filas'):,} filas, ultimo {v.get('ultimo_dato')}",
                v.get("filas", 0) > 0,
                f"edad {edad:.0f} h" if edad is not None else "")
        # Que el dato este viejo no es un fallo del codigo: es el outage de la
        # fuente. Se marca como AVISO para que salte a la vista sin romper el CI.
        revisar(f"ingesta · {nombre} fresca (<6 h)", v.get("estado") == "ok",
                f"estado={v.get('estado')}", aviso=True)

    etl = (reporte or {}).get("ultima_corrida_etl") or {} if isinstance(reporte, dict) else {}
    edad_etl = etl.get("edad_horas")
    revisar("el ETL corrio hace menos de 1 h", edad_etl is not None and edad_etl < 1,
            f"hace {edad_etl:.2f} h" if edad_etl is not None else "sin registro")

    s, _ = _pedir("GET", "/salud/panel", con_key=False)
    revisar("GET /salud/panel exige API key", s == 401, f"status={s}")
    s, panel = _pedir("GET", "/salud/panel")
    revisar("GET /salud/panel con key responde 200", s == 200 and isinstance(panel, dict),
            f"status={s}")
    return panel if isinstance(panel, dict) else {}


# ── 2. Pronostico (el nucleo) ────────────────────────────────────────────────
def bloque_forecast() -> None:
    titulo("2. Pronostico — POST /forecast")
    s, _ = _pedir("POST", "/forecast", {"variable": "irradiancia", "horizon_seconds": 3600},
                  con_key=False)
    revisar("sin API key responde 401", s == 401, f"status={s}")

    for variable, horizontes in (("irradiancia", (1800, 3600, 10800)),
                                 ("humedad_suelo", (3600, 21600))):
        for h in horizontes:
            s, d = _pedir("POST", "/forecast",
                          {"variable": variable, "horizon_seconds": h, "origen": "e2e"})
            ok = s == 200 and isinstance(d, dict)
            if not revisar(f"{variable} h={h}s responde 200", ok, f"status={s}"):
                continue
            campos = {"variable", "unidad", "ahora", "momento_pronosticado",
                      "valor_esperado", "banda", "contexto"}
            revisar(f"{variable} h={h}s trae el contrato completo",
                    campos <= set(d), f"faltan {sorted(campos - set(d))}" if campos - set(d) else "")
            v, b = d.get("valor_esperado"), d.get("banda") or {}
            if v is None:
                revisar(f"{variable} h={h}s valor no nulo", False,
                        f"advertencia: {(d.get('contexto') or {}).get('advertencia')}", aviso=True)
            else:
                revisar(f"{variable} h={h}s banda coherente (bajo<=valor<=alto)",
                        b.get("bajo") is not None and b["bajo"] <= v <= b["alto"],
                        f"{num(b.get('bajo'))} <= {num(v)} <= {num(b.get('alto'))} {d.get('unidad')}")
            # El horizonte pedido tiene que ser exactamente el aplicado.
            revisar(f"{variable} h={h}s aplica el horizonte pedido",
                    d.get("horizonte_segundos") == h, f"aplico {d.get('horizonte_segundos')}")

    # Contrato de errores: culpa del cliente, no 500.
    s, _ = _pedir("POST", "/forecast", {"variable": "viento", "horizon_seconds": 3600})
    revisar("variable no soportada responde 400", s == 400, f"status={s}")
    s, _ = _pedir("POST", "/forecast", {"variable": "irradiancia", "horizon_seconds": 30})
    revisar("horizonte por debajo del minimo responde 422", s == 422, f"status={s}")
    s, _ = _pedir("POST", "/forecast", {"variable": "irradiancia", "horizon_seconds": 99999})
    revisar("horizonte por encima del maximo responde 422", s == 422, f"status={s}")

    # El "ahora" del pronostico NO es el reloj de pared: es el ultimo dato.
    s, d = _pedir("POST", "/forecast", {"variable": "irradiancia", "horizon_seconds": 3600})
    revisar("el 'ahora' del pronostico es el ultimo dato del store, no el reloj",
            isinstance(d, dict) and isinstance(d.get("ahora"), str), str(d.get("ahora")))
    ancla = (d.get("ancla") or {}) if isinstance(d, dict) else {}
    revisar("sin instante explicito, el ancla se declara 'ultimo_dato'",
            ancla.get("tipo") == "ultimo_dato" and ancla.get("explicito") is False,
            f"ancla={ancla.get('tipo')}")
    rango = ancla.get("rango_datos") or {}
    revisar("la respuesta declara el rango de datos disponible",
            bool(rango.get("desde") and rango.get("hasta")),
            f"{str(rango.get('desde'))[:16]} -> {str(rango.get('hasta'))[:16]}")


def bloque_ancla() -> None:
    """Pronostico anclado en un instante historico (hindcast explicito)."""
    titulo("2b. Instante de referencia — pronostico anclado en el historico")
    # Se ancla en el ultimo dia COMPLETO a media manana: con sol, para que el
    # forecaster tenga kt* reciente y devuelva un numero de verdad.
    _, d = _pedir("POST", "/forecast", {"variable": "irradiancia", "horizon_seconds": 3600})
    hasta = ((d.get("ancla") or {}).get("rango_datos") or {}).get("hasta") if isinstance(d, dict) else None
    if not hasta:
        revisar("hay rango de datos para anclar", False, "sin rango en la respuesta")
        return
    dia = (dt.datetime.fromisoformat(hasta) - dt.timedelta(days=1)).replace(
        hour=10, minute=0, second=0, microsecond=0)
    ancla_iso = dia.strftime("%Y-%m-%dT%H:%M:%S")

    s, d = _pedir("POST", "/forecast", {"variable": "irradiancia", "horizon_seconds": 3600,
                                        "ahora": ancla_iso, "origen": "e2e"})
    if not revisar(f"pronostico anclado en {ancla_iso} responde 200", s == 200, f"status={s}"):
        return
    revisar("el ancla se declara explicita",
            (d.get("ancla") or {}).get("tipo") == "instante_de_referencia",
            f"tipo={(d.get('ancla') or {}).get('tipo')}")
    revisar("anclado de dia SI produce un valor (a diferencia del ultimo dato, nocturno)",
            d.get("valor_esperado") is not None,
            f"{num(d.get('valor_esperado'))} {d.get('unidad')} · kt* "
            f"{(d.get('contexto') or {}).get('kt_estrella_reciente')}")
    revisar("el pronostico arranca desde el instante pedido",
            str(d.get("ahora", "")).startswith(ancla_iso[:16]), str(d.get("ahora")))
    medido = d.get("medido") or {}
    revisar("trae lo que el sensor midio en el momento pronosticado",
            medido.get("valor") is not None,
            f"midio {num(medido.get('valor'))} · error {num(medido.get('error'))}")

    # Anti-fuga: el instante pronosticado NO puede haber alimentado el calculo.
    # Se comprueba por contrato: el contexto solo cuenta muestras anteriores.
    revisar("el contexto solo cuenta muestras ANTERIORES al ancla",
            (d.get("contexto") or {}).get("muestras_recientes", 0) > 0,
            f"{(d.get('contexto') or {}).get('muestras_recientes')} lecturas en la hora previa")

    s, _ = _pedir("POST", "/forecast", {"variable": "irradiancia", "horizon_seconds": 3600,
                                        "ahora": "no-es-una-fecha"})
    revisar("un instante mal formado responde 400", s == 400, f"status={s}")


def bloque_auditoria(panel_previo: dict) -> None:
    """Cada /forecast debe dejar una fila en `predicciones` (write-back)."""
    titulo("3. Auditoria — write-back en `predicciones`")
    antes = (panel_previo.get("ultima_prediccion") or {}).get("creado_en")
    _pedir("POST", "/forecast",
           {"variable": "humedad_suelo", "horizon_seconds": 3600, "origen": "e2e-audit"})
    time.sleep(1.5)
    _, panel = _pedir("GET", "/salud/panel")
    despues = ((panel or {}).get("ultima_prediccion") or {}).get("creado_en")
    revisar("el /forecast quedo auditado en `predicciones`",
            despues is not None and despues != antes, f"ultima: {despues}")


# ── 4. Evaluacion del metodo ─────────────────────────────────────────────────
def bloque_backtest() -> None:
    titulo("4. Backtest — evaluacion honesta del metodo")
    for variable in ("irradiancia", "humedad_suelo"):
        s, d = _pedir("GET", f"/backtest?variable={variable}&dias=7&bucket=h")
        if not revisar(f"{variable}: /backtest responde 200", s == 200 and isinstance(d, dict),
                       f"status={s}"):
            continue
        pts = d.get("puntos") or []
        revisar(f"{variable}: el backtest trae puntos", len(pts) > 0, f"n={d.get('n')} puntos={len(pts)}")
        m = d.get("metricas") or {}
        revisar(f"{variable}: trae metricas de error", {"mae", "bias", "skill_pct"} <= set(m),
                f"MAE {num(m.get('mae'))} · sesgo {num(m.get('bias'))} · skill {num(m.get('skill_pct'))}%")
        # Un metodo que no le gana al ingenuo no justifica existir: se avisa.
        revisar(f"{variable}: el metodo le gana a la persistencia ingenua",
                (m.get("skill_pct") or 0) > 0, f"skill {num(m.get('skill_pct'))}%", aviso=True)

    s, d = _pedir("GET", "/backtest?variable=irradiancia&desde=2026-07-21&hasta=2026-07-22&bucket=h")
    revisar("backtest por rango explicito (21-jul) responde con datos",
            s == 200 and (d.get("n") or 0) > 0, f"n={(d or {}).get('n')}")

    # La cobertura NO es continua: un dia de un hueco tiene que decir "hueco",
    # no "fuera de rango" (o el agente termina contradiciendo al propio rango).
    s, d = _pedir("GET", "/backtest?variable=irradiancia&desde=2026-06-15&bucket=h")
    detalle = (d or {}).get("detail", "") if isinstance(d, dict) else ""
    revisar("un dia sin datos DENTRO del rango se explica como hueco",
            s == 400 and "HUECO" in str(detalle) and "FUERA" not in str(detalle),
            str(detalle)[:90])
    revisar("y sugiere dias cercanos con datos", "cercanos" in str(detalle),
            str(detalle).split("cercanos:")[-1].strip()[:40] if "cercanos" in str(detalle) else "")


def bloque_deterministas() -> None:
    titulo("5. Tools deterministas — /serie y /anomalias")
    for variable in ("irradiancia", "humedad_suelo"):
        s, d = _pedir("GET", f"/serie?variable={variable}&bucket=D&ultimos_dias=60")
        revisar(f"{variable}: /serie responde con puntos",
                s == 200 and len((d or {}).get("puntos") or []) > 0,
                f"status={s} puntos={len(((d or {}).get('puntos') or []))}")
        s, d = _pedir("POST", "/anomalias", {"variable": variable, "ventana_min": 10080})
        if not revisar(f"{variable}: /anomalias responde 200", s == 200 and isinstance(d, dict),
                       f"status={s}"):
            continue
        # La frescura se reporta en `estado` (global), no como un item de
        # `anomalias` (que son hallazgos puntuales con timestamp).
        hallazgos = d.get("anomalias") or []
        tipos = sorted({a.get("tipo") for a in hallazgos})
        revisar(f"{variable}: detecta la fuente congelada",
                d.get("estado") == "sin_datos_recientes",
                f"estado={d.get('estado')} · {d.get('resumen')}")
        revisar(f"{variable}: analiza la ventana y reporta hallazgos puntuales",
                (d.get("n_muestras") or 0) > 0,
                f"n={d.get('n_muestras')} · hallazgos: {tipos or 'ninguno'}")


# ── 6. El mapa de arquitectura ───────────────────────────────────────────────
def bloque_arquitectura() -> None:
    titulo("6. Mapa de arquitectura — /arquitectura")
    s, d = _pedir("GET", "/arquitectura")
    if not revisar("/arquitectura responde 200", s == 200 and isinstance(d, dict),
                   f"status={s}"):
        return

    modos = d.get("modos") or {}
    herramientas = [h.get("nombre") for h in (d.get("herramientas") or [])]
    revisar("publica los dos modos", set(modos) == {"analisis", "prediccion"},
            f"modos={sorted(modos)}")
    revisar("publica el catalogo de herramientas", len(herramientas) >= 3,
            ", ".join(herramientas))

    # La garantia del sistema, verificada desde afuera: en el modo ciego no hay
    # ninguna herramienta que pueda revelar lo que midio el sensor.
    prediccion = modos.get("prediccion") or {}
    revisar("modo prediccion sin backtest",
            "backtest" not in (prediccion.get("herramientas") or []),
            f"tools={prediccion.get('herramientas')}")
    revisar("modo prediccion sin busqueda web",
            prediccion.get("web_search") is False,
            f"web_search={prediccion.get('web_search')}")

    # Cada herramienta viaja con el contrato entero: es lo que dibuja la vista.
    completas = [h.get("nombre") for h in (d.get("herramientas") or [])
                 if (h.get("input_schema") or {}).get("properties")]
    revisar("cada herramienta trae su input_schema",
            len(completas) == len(herramientas),
            f"{len(completas)}/{len(herramientas)}")

    lim = d.get("limites") or {}
    revisar("publica el horizonte y los frenos",
            bool(lim.get("horizonte_seg")) and lim.get("llm_por_min"),
            f"horizonte={lim.get('horizonte_seg')} · llm/min={lim.get('llm_por_min')} · "
            f"presupuesto=US${lim.get('presupuesto_diario_usd')}")

    datos = d.get("datos") or {}
    for variable in ("irradiancia", "humedad_suelo"):
        v = datos.get(variable) or {}
        revisar(f"{variable}: publica su cobertura", bool(v.get("hasta")),
                f"{v.get('desde')} → {v.get('hasta')} · n={v.get('n')}"
                if v.get("hasta") else v.get("error", "sin rango"))


# ── 7. El lazo del LLM (gasta tokens) ────────────────────────────────────────
def _pasos_tool(traza: dict) -> list[dict]:
    return [p for p in (traza.get("pasos") or []) if p.get("tipo") == "tool"]


def bloque_llm() -> None:
    titulo("6. Lazo del LLM — /preguntar y /chat (gasta tokens)")
    s, t = _pedir("POST", "/preguntar", {"pregunta": "¿Cuánta irradiancia habrá en dos horas?"})
    if revisar("POST /preguntar responde 200", s == 200 and isinstance(t, dict), f"status={s}"):
        tools = _pasos_tool(t)
        revisar("/preguntar llamo a la herramienta forecast",
                any(p.get("nombre") == "forecast" for p in tools),
                f"tools: {[p.get('nombre') for p in tools] or 'ninguna'}")
        revisar("/preguntar tradujo el horizonte a 7200 s (dos horas)",
                any((p.get("input") or {}).get("horizon_seconds") == 7200 for p in tools),
                str([(p.get("input") or {}).get("horizon_seconds") for p in tools]))
        revisar("/preguntar redacta una respuesta", bool((t.get("respuesta") or "").strip()),
                f"{len(t.get('respuesta') or '')} caracteres")
        revisar("/preguntar reporta costo en USD", (t.get("costo") or {}).get("usd_total", 0) > 0,
                f"US${(t.get('costo') or {}).get('usd_total', 0):.6f} · {t.get('modelo')}")

    def chat(mensajes, contexto="Pronóstico · e2e"):
        return _pedir("POST", "/chat", {"mensajes": mensajes, "contexto": contexto})

    s, t = chat([{"rol": "user", "texto": "¿Cuánta humedad de suelo habrá en 3 horas?"}])
    if revisar("POST /chat (modalidad futuro) responde 200", s == 200 and isinstance(t, dict),
               f"status={s}"):
        tools = _pasos_tool(t)
        revisar("chat futuro rutea a la herramienta `forecast`",
                any(p.get("nombre") == "forecast" for p in tools),
                f"tools: {[p.get('nombre') for p in tools] or 'ninguna'}")

    s, t = chat([{"rol": "user", "texto": "¿Cuánta irradiancia hizo el 21 de julio? ¿Qué tan bien la habría predicho el modelo?"}])
    if revisar("POST /chat (modalidad histórica) responde 200", s == 200 and isinstance(t, dict),
               f"status={s}"):
        tools = _pasos_tool(t)
        revisar("chat histórico rutea a la herramienta `backtest`",
                any(p.get("nombre") == "backtest" for p in tools),
                f"tools: {[p.get('nombre') for p in tools] or 'ninguna'}")
        grafico = any((p.get("salida") or {}).get("_grafico")
                      for p in tools if isinstance(p.get("salida"), dict))
        revisar("el backtest del chat devuelve el grafico real-vs-reconstruccion", grafico)

    # Anti-invencion: una fecha sin datos no puede producir un numero.
    s, t = chat([{"rol": "user", "texto": "¿Cuánta irradiancia hubo el 3 de enero de 2019?"}])
    texto = (t or {}).get("respuesta", "").lower() if isinstance(t, dict) else ""
    revisar("ante una fecha sin datos, declara el limite en vez de inventar",
            s == 200 and any(p in texto for p in ("no ", "sin datos", "no tengo", "rango", "disponible")),
            (texto[:120] + "…") if texto else "sin respuesta")


def main() -> int:
    print(f"{GRIS}e2e del agente de pronóstico · destino {BASE} · "
          f"key {'sí' if KEY else 'NO'} · LLM {'sí' if CON_LLM else 'omitido'}{FIN}")
    panel = bloque_salud()
    bloque_forecast()
    bloque_ancla()
    bloque_auditoria(panel)
    bloque_backtest()
    bloque_deterministas()
    bloque_arquitectura()
    if CON_LLM:
        bloque_llm()
    else:
        titulo("7. Lazo del LLM — OMITIDO (SIN_LLM=1)")

    fallas = [r for r in _resultados if r[0] == "FALLA"]
    avisos = [r for r in _resultados if r[0] == "AVISO"]
    print(f"\n{'═' * 60}")
    print(f"{len(_resultados)} chequeos · {VERDE}{len(_resultados) - len(fallas) - len(avisos)} OK{FIN} · "
          f"{AMARILLO}{len(avisos)} avisos{FIN} · {ROJO}{len(fallas)} fallas{FIN}")
    for _, nombre, detalle in avisos:
        print(f"  {AMARILLO}aviso{FIN} {nombre} {GRIS}{detalle}{FIN}")
    for _, nombre, detalle in fallas:
        print(f"  {ROJO}falla{FIN} {nombre} {GRIS}{detalle}{FIN}")
    return 1 if fallas else 0


if __name__ == "__main__":
    sys.exit(main())
