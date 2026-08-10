# Runbook — Deploy del sidecar `/forecast` en la EC2 de VisioneFlow

> Complementa a `03-plan-integracion-visioneflow.md`. Este runbook refleja el **estado
> real verificado en la EC2 el 2026-07-02** y las correcciones que surgieron al
> implementar (ver "Desviaciones del plan"). La Fase 1 (servicio FastAPI) ya está
> implementada y probada local; la Fase 3.1 (modelos) ya está aplicada en el código
> del Backend. Lo que falta es ejecutar ESTE runbook.

## Estado verificado de la EC2 (2026-07-02, `52.1.28.77`, user `ec2-user`)

| Ítem | Estado |
|---|---|
| Contenedores | `agent-runtime-{runtime,redis,loadbalancer,certbot}-1` Up y healthy |
| Puerto 8000 del host | **libre** (el sidecar puede usarlo) |
| Docker Compose | v5.0.2 (`docker compose`, soporta `name:` de proyecto) |
| Dominio público | `api.flow.visione-edge.com` → URL de la tool: `https://api.flow.visione-edge.com/forecast/forecast` |
| Repo del Backend en la EC2 | `/home/ec2-user/runtime/Agent-Runtime` (deploy = `build.sh`: `git reset --hard origin/master` + rebuild) |
| Tailscale | **NO instalado** |
| DB AgroDash `100.100.130.47:5432` | **NO alcanzable desde la EC2** |
| Disco | 43G libres |

## ⚠️ Bloqueante: acceso a la base de datos

`100.100.130.47` es una IP de tailnet (rango CGNAT de Tailscale). La EC2 **no** está en
esa red, así que el modo "DB en vivo por `DATABASE_URL`" hoy no puede funcionar ahí.
Opciones (decisión del equipo, en orden de preferencia):

- **(a) Instalar Tailscale en la EC2** y unirla al tailnet donde vive la réplica
  AgroDash. Como el sidecar es `network_mode: host`, hereda el acceso sin más cambios.
- **(b) Modo demo con el caché parquet**: subir `data/irradiancia_sc.parquet` junto con
  el repo y descomentar el `volumes:` de `docker-compose.forecast.yml`. `DATABASE_URL`
  queda vacía; el servicio sirve la ventana histórica cacheada (el "ahora" = último
  dato, igual que el agente local). **Suficiente para el criterio end-to-end de la v1.**
- (c) Exponer la réplica por otra vía accesible desde la EC2 (VPN propia, host público
  con allowlist). Más trabajo/riesgo.

El resto del runbook funciona igual con (a) o (b); solo cambia `forecast.env` y el volumen.

## Pasos

### 1. Subir el código del agente a la EC2

`agente-pronostico/` NO está en ningún remoto git (vive dentro del working tree de
AgroVoltaic, sin trackear). Se sube por rsync (incluye `data/` para el modo demo):

```bash
ssh -i ~/.ssh/visione-key.pem ec2-user@52.1.28.77 "mkdir -p /home/ec2-user/forecast"
rsync -av -e "ssh -i ~/.ssh/visione-key.pem" \
  --exclude .venv --exclude __pycache__ --exclude .pytest_cache \
  /Users/izack/Visione/AgroVoltaic/agente-pronostico/ \
  ec2-user@52.1.28.77:/home/ec2-user/forecast/agente-pronostico/
```

### 2. Publicar los cambios del Backend (nginx + modelos)

Los cambios en el repo `Backend` (Agent-Runtime) — `nginx.prod.conf` (location
`/forecast/`), modelos Anthropic nuevos, `docker-compose.forecast.yml`,
`forecast.env.example`, `.gitignore` — se commitean y **pushean a `master`**.

> OJO: el push a master **dispara el auto-deploy** (CI → `build.sh` → rebuild del
> runtime). Eso es deseado (aplica nginx y los modelos), y NO toca el sidecar porque
> este corre como proyecto compose separado (`name: forecast`). Mientras el sidecar no
> esté arriba, `https://.../forecast/health` devuelve 502 — esperado, no rompe nada más.

### 3. Crear `forecast.env` en la EC2

```bash
ssh -i ~/.ssh/visione-key.pem ec2-user@52.1.28.77
cd /home/ec2-user/runtime/Agent-Runtime
cp forecast.env.example forecast.env
# editar: DATABASE_URL (si opción a/c) y FORECAST_API_KEY:
openssl rand -hex 32   # pegar el resultado en FORECAST_API_KEY
```

### 4. Levantar el sidecar

```bash
cd /home/ec2-user/runtime/Agent-Runtime
FORECAST_BUILD_CONTEXT=/home/ec2-user/forecast/agente-pronostico \
  docker compose -f docker-compose.forecast.yml up -d --build
docker ps --format '{{.Names}} {{.Status}}' | grep forecast   # espera: healthy
```

(Modo demo (b): antes de levantar, descomentar el bloque `volumes:` del compose.)

### 5. Verificar (criterio Fase 2)

```bash
curl -s https://api.flow.visione-edge.com/forecast/health
# {"status":"ok"}
curl -s -X POST https://api.flow.visione-edge.com/forecast/forecast \
  -H 'content-type: application/json' -H "x-api-key: <FORECAST_API_KEY>" \
  -d '{"variable":"irradiancia","horizon_seconds":7200,"horizonte_texto":"dos horas"}'
# dict con valor_esperado numérico (de día). Sin la clave → 401.
```

### 6. Canvas (Fase 3.2)

Flujo: **Trigger de canal → aiAgent → Output**, con el nodo `httpRequestTool` (galería:
carpeta **Agent Tools › HTTP**) conectado al `aiAgent` por el handle **`tool`**.

**Nodo `aiAgent`:**
- Modelo: `claude-haiku-4-5` (disponible en el dropdown tras el paso 2).
- System prompt: copiar **verbatim** el `SYSTEM_PROMPT` de
  `agente-pronostico/src/pronostico/agent/prompts.py`.

**Nodo `httpRequestTool` (la instancia "forecast"), campo por campo en el modal:**

| Campo | Valor |
|---|---|
| Tool Name | `forecast` |
| Description | `Pronostica la irradiancia solar (GHI, W/m2) del sitio a un horizonte dado. Devuelve valor esperado, banda de incertidumbre (bajo-alto) y contexto (nubosidad, si el momento cae de noche).` |
| Method | `POST` |
| URL | `https://api.flow.visione-edge.com/forecast/forecast` |
| Auth type | `apiKey` → Header: `x-api-key`, Value: la clave del paso 3 |
| Timeout | vacío (15000 ms default); subir a `30000` si el primer request tras un arranque carga de la DB |
| Tool Schema | el JSON de abajo |

```json
{
  "properties": {
    "variable":        { "type": "string",  "enum": ["irradiancia"], "description": "Variable a pronosticar. Hoy solo 'irradiancia'." },
    "horizon_seconds": { "type": "integer", "description": "Horizonte en SEGUNDOS: media hora=1800, 1h=3600, 1h30=5400, 2h=7200, 3h=10800. Máximo 6h (21600)." },
    "horizonte_texto": { "type": "string",  "description": "La frase original del horizonte ('dos horas', 'media hora') para validar la conversión de forma determinista." }
  },
  "required": ["variable", "horizon_seconds"]
}
```

**Criterio end-to-end:** *"¿cuánta irradiancia va a haber en dos horas?"* → el aiAgent
invoca `forecast({variable, horizon_seconds: 7200, horizonte_texto: "dos horas"})` →
respuesta con valor + banda + nubosidad. Probar además: pregunta fuera de alcance (no
debe llamar la tool) y pregunta sin horizonte (debe pedir aclaración).

## Desviaciones del plan 03 (correcciones al implementar)

1. **nginx `proxy_pass`**: el plan decía `http://127.0.0.1:8000/`; el loadbalancer NO es
   host-net, así que eso apuntaría al propio contenedor nginx. Lo correcto (aplicado):
   `http://host.docker.internal:8000/` (mismo patrón que el upstream `runtime_backend`).
2. **Compose**: el plan agregaba el servicio a `docker-compose.prod.yml`; se movió a
   `docker-compose.forecast.yml` como proyecto independiente porque `build.sh` hace
   `docker rm -f` de todo `agent-runtime-*` en cada deploy (mataría el sidecar) y el
   build context no existe en el pipeline (rompería todos los deploys).
3. **Dependencias**: en vez de `pip install -e . fastapi uvicorn`, quedaron declaradas
   como extra `service` en `pyproject.toml` (una sola fuente de deps); el Dockerfile
   instala `.[service]` y corre como usuario sin privilegios.
4. **La UI del `httpRequestTool` estaba rota respecto a su handler** (el plan asumía
   "solo configurarlo"): escribía `toolDescription`/`auth.type`/`auth.key`/`auth.value`
   y el `toolSchema` como string, mientras el handler backend lee `description`/
   `authType`/`apiKeyHeader`/`apiKeyValue`/`bearerToken`/`basicUser`/`basicPassword` y
   un `toolSchema` OBJETO — la auth y el schema se perdían en silencio. Corregido en
   `agent-builder` (`HttpRequestToolFields/` — 3 archivos, con migración de configs
   legacy, validación inline del JSON y campo `timeout` nuevo). Sin este fix la Fase 3
   no funcionaba desde el canvas.

## Rollback

Todo es aditivo: `docker compose -f docker-compose.forecast.yml down` apaga el sidecar;
revertir el commit del Backend quita la location de nginx y los modelos; borrar el nodo
del canvas desconecta la tool. Nada del runtime existente depende del sidecar.

## Pendiente de verificación

- El `Dockerfile` del agente no se pudo construir localmente (daemon Docker apagado);
  el primer `up --build` en la EC2 es su prueba real (python:3.12-slim; los tests
  locales corrieron en el venv 3.11 — `requires-python >=3.11` cubre ambos).
- Decisión (a)/(b)/(c) del acceso a datos, arriba.
