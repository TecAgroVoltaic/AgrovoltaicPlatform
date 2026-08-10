# Plan de implementación — montar el agente de pronóstico en VisioneFlow

> **ACTUALIZACIÓN 2026-07-02 — plan EJECUTADO en su mayor parte.** Fase 1 (servicio
> FastAPI + tests + Dockerfile) implementada y probada local; Fase 3.1 (modelos) aplicada
> en Backend y frontend; Fase 2 preparada con **correcciones a este plan** (el
> `proxy_pass` a 127.0.0.1 era un bug — nginx no es host-net — y el servicio va en un
> compose independiente para no romper `build.sh`). El paso a paso vigente para el
> deploy en la EC2, con el estado real verificado (falta acceso a la DB desde la EC2),
> está en **`04-runbook-deploy-ec2.md`**. Diagrama: `img/04-arquitectura-visioneflow.png`.

> **Para una sesión nueva.** Este plan es autónomo y ejecutable. Abarca **dos repos**:
> - `/Users/izack/Visione/AgroVoltaic/agente-pronostico` — el agente Python (forecaster).
> - `/Users/izack/Visione/Apps/VisioneFlow` — la plataforma de flujos (Backend Fastify + agent-builder Next.js).
>
> **Contexto obligatorio antes de empezar:** leé `docs/memoria/proyecto/integracion-visioneflow.md`
> (el planteamiento) y `docs/memoria/INDEX.md`. Resumen del diseño: el **LLM lo orquesta el nodo
> `aiAgent` de VisioneFlow**; la **física vive en un microservicio Python `/forecast`** (sidecar en
> la EC2, DB por URL); la **herramienta es el nodo GENÉRICO `httpRequestTool` ya existente**,
> configurado por instancia (NO se construye un nodo a medida).
>
> **Ya hecho (no rehacer):** la capa de datos del agente ya acepta `DATABASE_URL` vía
> `config.conninfo()` y el sitio es configurable por env (`SITE_*`, `BOX_NAME`, `IRRADIANCE_CHANNEL`,
> `WINDOW_*`, `CACHE_FILE`). `pytest` = 47 OK. Python del repo: `agente-pronostico/.venv/bin/python3`.

---

## Resultado esperado (definition of done)
Un usuario escribe en VisioneFlow *"¿cuánta irradiancia va a haber en dos horas?"* → el `aiAgent`
(modelo Haiku) llama a la herramienta `forecast` → esta hace `POST /forecast` al microservicio
Python → el LLM redacta la respuesta con valor + banda + nota de nubosidad. Cambiar de San Carlos a
Cartago = cambiar `DATABASE_URL` + `SITE_*` del contenedor, **cero código**.

---

## FASE 1 — Microservicio Python `/forecast` (FastAPI)
**Único código realmente nuevo. Independiente de VisioneFlow: se puede terminar y probar solo.**

### 1.1 Dependencias
Agregar `fastapi` y `uvicorn[standard]` al paquete. En `agente-pronostico/pyproject.toml`
(o requirements), como extra `service`. Instalar en el venv:
```bash
cd /Users/izack/Visione/AgroVoltaic/agente-pronostico
./.venv/bin/python3 -m pip install fastapi "uvicorn[standard]"
```

### 1.2 Crear `src/pronostico/api.py`
Envuelve el `run_forecast` existente (NO reimplementar nada). API key opcional por header.
```python
"""API HTTP del forecaster: unico puente entre VisioneFlow y run_forecast."""
from __future__ import annotations
import os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from pronostico.tools.forecast_tool import run_forecast

API_KEY = os.environ.get("FORECAST_API_KEY")  # si esta definida, se exige en /forecast

app = FastAPI(title="Pronostico de irradiancia", version="1.0")


class ForecastIn(BaseModel):
    variable: str = Field(default="irradiancia")
    horizon_seconds: int
    horizonte_texto: str | None = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/forecast")
def forecast(body: ForecastIn, x_api_key: str | None = Header(default=None)):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="API key invalida")
    try:
        return run_forecast(body.variable, body.horizon_seconds, body.horizonte_texto)
    except ValueError as e:                      # variable/horizonte invalidos
        raise HTTPException(status_code=400, detail=str(e))
```
El dict devuelto es exactamente el de `run_forecast` (`valor_esperado`, `banda`, `contexto`, …) y ya
es JSON-serializable.

### 1.3 Probar local (sin Docker, con el caché parquet existente)
```bash
cd /Users/izack/Visione/AgroVoltaic/agente-pronostico
PYTHONPATH=src ./.venv/bin/python3 -m uvicorn pronostico.api:app --host 127.0.0.1 --port 8000 &
curl -s 127.0.0.1:8000/health
curl -s -X POST 127.0.0.1:8000/forecast -H 'content-type: application/json' \
  -d '{"variable":"irradiancia","horizon_seconds":7200,"horizonte_texto":"dos horas"}'
# Esperado: valor_esperado ~313 W/m2, banda ~[271,356], contexto con es_de_noche:false
```

### 1.4 Dockerfile (`agente-pronostico/Dockerfile`)
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir -e . fastapi "uvicorn[standard]"
EXPOSE 8000
# El servicio lee la DB por DATABASE_URL (no usa el caché parquet si conecta a DB en vivo).
CMD ["uvicorn", "pronostico.api:app", "--host", "0.0.0.0", "--port", "8000"]
```
> **Verificar** que `pyproject.toml` declare las deps del paquete (pandas, numpy, pvlib, psycopg,
> python-dotenv). Si no, agregarlas antes de construir la imagen.

### ✅ Criterio Fase 1
`/health` responde `{"status":"ok"}` y `/forecast` devuelve el dict con `valor_esperado` numérico
para un horizonte diurno. Con `DATABASE_URL` seteada, arranca leyendo de la DB (sin parquet).

---

## FASE 2 — Desplegar como sidecar en la EC2 + exponer (opción a: nginx + API key)
VisioneFlow corre en EC2 con `Backend/docker-compose.prod.yml` (`redis` + `runtime`
[`network_mode: host`] + `nginx` + `certbot`). El servicio va **en la misma EC2**.

### 2.1 Servicio en el compose de producción
Agregar a `Backend/docker-compose.prod.yml` (ajustar `context` a la ruta real del repo del agente
en la EC2):
```yaml
  forecast:
    build:
      context: /ruta/en/la/ec2/agente-pronostico
      dockerfile: Dockerfile
    network_mode: host              # runtime es host-net -> lo alcanza en 127.0.0.1:8000
    env_file:
      - forecast.env                # ver 2.2
    restart: unless-stopped
```

### 2.2 Variables del servicio (`Backend/forecast.env`, NO versionar)
```env
DATABASE_URL=postgresql://usuario:clave@host:5432/agrodash   # conectar Cartago = cambiar esta línea
SITE_NAME=San Carlos
SITE_LAT=10.33
SITE_LON=-84.42
SITE_ALT=600
SITE_TZ=America/Costa_Rica
SENSOR_TYPE=irradiancia
BOX_NAME=Caja Irradiancia SC
IRRADIANCE_CHANNEL=45a5c0a7-0ef4-4291-96f3-60d2b60a0584
WINDOW_START=2026-03-10
WINDOW_END=2026-07-01
FORECAST_API_KEY=<generar-una-clave-larga-aleatoria>
```

### 2.3 Exponer por nginx (para que pase el SSRF del tool genérico)
> **Por qué:** el `httpRequestTool` corre `validateWebhookUrl` (SSRF) que **bloquea `localhost` y las
> IPs privadas**. Por eso NO se llama directo a `127.0.0.1:8000`; se expone por nginx en una URL
> pública (que sí pasa el SSRF) y se protege con la API key.

En `Backend/nginx.prod.conf`, dentro del `server` HTTPS, agregar:
```nginx
location /forecast/ {
    proxy_pass http://127.0.0.1:8000/;
    proxy_set_header Host $host;
    proxy_read_timeout 30s;
}
```
Resultado: `https://TU-DOMINIO/forecast/forecast` → `http://127.0.0.1:8000/forecast`.

### 2.4 Desplegar
Levantar por el pipeline habitual (`.github/workflows/deploy.yml`) o manual:
```bash
docker-compose -f Backend/docker-compose.prod.yml up -d --build forecast
docker-compose -f Backend/docker-compose.prod.yml restart loadbalancer   # recargar nginx
```

### ✅ Criterio Fase 2
```bash
curl -s https://TU-DOMINIO/forecast/health
curl -s -X POST https://TU-DOMINIO/forecast/forecast -H 'content-type: application/json' \
  -H 'x-api-key: <FORECAST_API_KEY>' \
  -d '{"variable":"irradiancia","horizon_seconds":7200,"horizonte_texto":"dos horas"}'
```
Devuelve el pronóstico. Sin la API key correcta → 401.

---

## FASE 3 — Configurar el agente en el canvas de VisioneFlow (config, no código)

### 3.1 Habilitar el modelo Haiku
En `Backend/src/plugins/llm/anthropic/anthropic.plugin.ts` (y cualquier lista/enum de modelos del
frontend, p. ej. `agent-builder/src/constants/`), **agregar `claude-haiku-4-5`** a los modelos
permitidos (y de paso Opus/Sonnet actuales). *Es actualizar la lista, nada más.*

### 3.2 Crear el agente (flujo) en el canvas
1. **Trigger** de canal (webhook / chat / telegram, según el caso).
2. **Nodo `aiAgent`**:
   - Modelo: `claude-haiku-4-5`.
   - System prompt: copiar **verbatim** el de
     `agente-pronostico/src/pronostico/agent/prompts.py` (`SYSTEM_PROMPT`).
3. **Nodo `httpRequestTool`** (el genérico), conectado al `aiAgent` por el handle **`tool`**. Config
   del nodo (`node.data`):
```json
{
  "toolName": "forecast",
  "description": "Pronostica la irradiancia solar (GHI, W/m2) del sitio a un horizonte dado. Devuelve valor esperado, banda de incertidumbre (bajo-alto) y contexto (nubosidad, si el momento cae de noche).",
  "method": "POST",
  "url": "https://TU-DOMINIO/forecast/forecast",
  "authType": "apiKey",
  "apiKeyHeader": "x-api-key",
  "apiKeyValue": "<FORECAST_API_KEY>",
  "toolSchema": {
    "properties": {
      "variable":        { "type": "string",  "enum": ["irradiancia"], "description": "Variable a pronosticar. Hoy solo 'irradiancia'." },
      "horizon_seconds": { "type": "integer", "description": "Horizonte en SEGUNDOS: media hora=1800, 1h=3600, 1h30=5400, 2h=7200, 3h=10800. Máximo 6h (21600)." },
      "horizonte_texto": { "type": "string",  "description": "La frase original del horizonte ('dos horas', 'media hora') para validar la conversión de forma determinista." }
    },
    "required": ["variable", "horizon_seconds"]
  }
}
```
   > El `httpRequestTool` arma el body POST con todos los args (`variable`, `horizon_seconds`,
   > `horizonte_texto`) — que es justo lo que espera `/forecast`.
4. **Output** conectado a la salida del `aiAgent`.

> **Verificar** en el frontend cómo se expone el `httpRequestTool` en el catálogo/gallery
> (`agent-builder/src/constants/components.ts` + `.../Nodes/HttpRequestToolNode.tsx` +
> `.../node-fields/agent/HttpRequestToolFields/`). Si el nodo ya aparece para arrastrar, es solo
> configurarlo; si no, registrar la entrada de catálogo (sin tocar el handler backend).

### ✅ Criterio Fase 3 (end-to-end)
Preguntar en el canal *"¿cuánta irradiancia va a haber en dos horas?"* →
el `aiAgent` invoca `forecast({variable, horizon_seconds:7200, horizonte_texto:"dos horas"})` →
respuesta redactada con el número + banda + nubosidad. Probar además: pregunta fuera de alcance
(no debe llamar la tool), sin horizonte (debe pedir aclaración).

---

## Verificación del "DB por URL / Cartago" (el requisito clave)
Cambiar en `forecast.env` la línea `DATABASE_URL` (y los `SITE_*`/`BOX_NAME` si aplica) por los de
Cartago, `docker-compose ... up -d --build forecast`, y repetir el criterio de Fase 2. **No se toca
ni una línea de código.** (Nota: Cartago hoy no tiene irradiancia utilizable — ver [[bloqueantes]];
el punto es que la plomería queda lista.)

---

## Consideraciones / mejoras (no bloquean la v1)
- **Refresco de datos:** `cargar_serie()` baja la ventana **una vez** y la cachea en memoria. Contra
  una DB en vivo, el servicio no vería datos nuevos hasta reiniciar. Para producción real: agregar un
  TTL de caché o un endpoint `/refresh` que fuerce `cargar_serie(forzar=True)`. Para el MVP/demo
  (datos históricos, `now` = último dato) alcanza con recargar al reiniciar el contenedor.
- **SSRF opción (b):** en vez de exponer por nginx, se podría agregar al `httpRequestTool` una opción
  `trustedInternal`/allowlist para saltear el SSRF en endpoints internos de confianza (reutilizable
  para cualquier sidecar futuro). Toca el validador de seguridad → dejarlo para después de la v1.
- **Escala:** el servicio es sin estado → correr N réplicas detrás de nginx si hiciera falta.
- **Rollback:** todo es aditivo. Revertir = quitar el servicio del compose, la `location` de nginx y
  el nodo del canvas.

---

## Orden sugerido de ejecución
1. Fase 1 completa y probada local (no depende de nada más).
2. Fase 3.1 (agregar Haiku a la lista de modelos) — trivial, en paralelo.
3. Fase 2 (deploy + nginx + API key).
4. Fase 3.2 (armar el flujo en el canvas) y probar end-to-end.

Relacionado: `docs/memoria/proyecto/integracion-visioneflow.md`, `docs/pronostico/01-validacion-fisica.md`,
`docs/pronostico/02-forecaster-hindcast.md`.
