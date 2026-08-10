---
name: integracion-visioneflow
description: Planteamiento para montar el agente de pronóstico en VisioneFlow (plataforma de flujos del usuario). Microservicio Python /forecast (DB por URL) + nodo GENÉRICO httpRequestTool + aiAgent que orquesta. Reutilizable, no a medida.
categoria: proyecto
---

# Planteamiento: montar el agente de pronóstico en VisioneFlow

Cómo llevar el [[agente-pronostico]] (hoy paquete Python autónomo) a **VisioneFlow**
(`/Users/izack/Visione/Apps/VisioneFlow`), la plataforma de flujos del usuario, de forma
**escalable** y **genérica**. Definido el 2026-07-02 tras explorar la arquitectura real de esa app.

## Qué pide el usuario (3 requisitos)
1. Que el agente **viva en VisioneFlow** y sea **escalable**.
2. **DB por URL**: poder cambiar la conexión (p. ej. a Cartago) sin tocar código, solo config.
3. **Que lo implementado en VisioneFlow sea GENÉRICO** — que sirva para otros casos, no solo
   para este forecaster. (Requisito explícito; guía la decisión de usar el nodo genérico existente.)

## Qué es VisioneFlow (verificado en su código)
Plataforma multi-tenant de agentes por **flujos** (nodos en un canvas):
- **Frontend** `agent-builder/` — Next.js 16 / React 19, canvas ReactFlow, catálogo de nodos.
- **Backend** `Backend/` — Fastify 5 (Node 20), motor de ejecución de flujos (DAG), plugins.
- **Deploy:** dockerizado en **EC2**. `docker-compose.prod.yml` = `redis` + `runtime`
  (**`network_mode: host`**) + `nginx` (80/443, load balancer + TLS certbot). Escala con
  `--scale runtime=N`. Pipeline `deploy.yml`.

## El planteamiento (decisión de arquitectura)
**Cerebro vs. manos:** el LLM del nodo **`aiAgent`** de VisioneFlow orquesta (entiende, decide,
redacta); los números salen de un **microservicio Python** (la física pvlib/pandas NO es portable
al backend Node). Es el mismo agente auditado, con el loop del LLM movido a la plataforma.

**Piezas y dónde viven:**
1. **Microservicio Python (FastAPI)** — envuelve el `run_forecast` existente. `GET /health`,
   `POST /forecast {variable, horizon_seconds, horizonte_texto?}` → el mismo dict
   (`valor_esperado`, `banda`, `contexto`). Lee la DB por `DATABASE_URL` (ya refactorizado, ver
   abajo). Vive en la **misma EC2 como contenedor sidecar** del compose (o `systemd`), en
   `127.0.0.1:8000`; como `runtime` es host-networked lo alcanza en `http://localhost:8000`.
   Sin estado → escala como contenedor propio.
2. **Herramienta = nodo GENÉRICO `httpRequestTool` (YA EXISTE, no se hace uno a medida).**
   `Backend/src/executor/handlers/tools/http-request.tool.ts` lee TODO de la config del nodo:
   `toolName` (nombre que ve el LLM), `description`, `method`, `url` (con placeholders `{param}`),
   **`toolSchema`** (el JSON schema de parámetros que ve el LLM), y auth (bearer/basic/apiKey).
   Interfaz `IToolNodeHandler` (`tool-node.protocol.ts`): `buildToolDefinition()` + `executeTool()`.
   UI de config ya existe: `agent-builder/.../node-fields/agent/HttpRequestToolFields`.
   **El forecaster = UNA instancia configurada** (toolName `forecast`, toolSchema
   {variable, horizon_seconds, horizonte_texto}, method POST, url del servicio). Cualquier caso
   futuro (humedad, lookup, etc.) = otra instancia → cumple el requisito de genericidad.
3. **Composición en el canvas** (config, no código): un `aiAgent` con el system prompt actual
   (reglas de orquestación) + la instancia del `httpRequestTool` conectada por el handle **`tool`**
   (`flow.graph.ts`: `getSubNodes(id, 'tool')`). Trigger de canal → `aiAgent` → output.

**Modelo:** el `aiAgent` usa el plugin Anthropic de VisioneFlow; hay que **agregar
`claude-haiku-4-5`** (y Opus/Sonnet actuales) a su lista de modelos. El usuario dijo que
actualizar modelos "no es problema".

## Gotcha a resolver (SSRF)
El `httpRequestTool` corre `validateWebhookUrl` (SSRF) que **bloquea `localhost` y las IPs
privadas** — por diseño, para URLs no confiables. Llamar al sidecar interno *desde el tool*
quedaría bloqueado. Dos salidas:
- **(a) Exponer el servicio por nginx** en HTTPS + **API key** → URL externa normal, pasa SSRF,
  la key lo protege. **No toca el modelo de seguridad. Recomendado para la v1.**
- (b) Agregar al tool genérico una opción `trustedInternal`/allowlist de hosts internos que saltee
  el SSRF. Más elegante y reutilizable, pero toca el validador → mejora posterior.

## Ya hecho (2026-07-02): DB por URL + perfil de sitio
En el paquete `pronostico` (`agente-pronostico/`), común a cualquier integración:
- `config.conninfo()` es la fuente única de "a qué DB conectar": **prioriza `DATABASE_URL`**
  (o `AGRODASH_URL`); si no, arma la URL desde `AGRODASH_*` + `AGRODASH_PASSWORD` (compat, con
  `quote(safe="")` para no romper con `/` en la clave). Perezosa (importar no exige credenciales),
  nunca imprime la contraseña. → **conectar Cartago = cambiar `DATABASE_URL`, cero código.**
- **Perfil de sitio por env**: `SITE_*` (nombre, lat/lon/alt, tz), `SENSOR_TYPE`, `BOX_NAME`,
  `IRRADIANCE_CHANNEL`, `WINDOW_*`, `CACHE_FILE`. Defaults = San Carlos. `data.py` usa
  `config.conninfo()` + `config.WINDOW_*`. `.env.example` actualizado. `pytest` 47 OK, forecaster
  offline idéntico.

## Hecho (2026-07-02): implementación de las fases 1, 2 (preparada) y 3.1
Plan: `docs/pronostico/03-plan-integracion-visioneflow.md` (con nota de lo ejecutado).
**Runbook vigente del deploy: `docs/pronostico/04-runbook-deploy-ec2.md`** (estado real
de la EC2 verificado). Diagrama: `docs/pronostico/img/04-arquitectura-visioneflow.png`.
- **Servicio `/forecast` LISTO y probado local**: `agente-pronostico/src/pronostico/api.py`
  (FastAPI, API key opcional por `x-api-key`, validación pydantic en el borde), extra
  `service` en pyproject, `Dockerfile` (+.dockerignore, no-root), `tests/test_api.py`.
  `pytest` = 53 OK. Curl local: 313.1 W/m2, banda [270.6, 355.6] con el caché parquet.
- **Modelos agregados** en VisioneFlow (Backend + agent-builder): `claude-haiku-4-5`,
  `claude-sonnet-5`, `claude-opus-4-8` (plugin, pricing, token-budget, cost-calculator,
  dropdown). El health check del plugin ya no pingea un modelo retirado.
- **Fix crítico en agent-builder**: la UI del `httpRequestTool` escribía keys que el
  handler backend NO lee (`toolDescription`, `auth.*`, `toolSchema` string) — auth y
  schema se perdían en silencio. Corregida (`HttpRequestToolFields/`: keys planas
  alineadas al handler, `toolSchema` como objeto validado, migración legacy, campo
  `timeout`). El plan asumía que la UI ya servía; no era cierto.
- **Deploy preparado, NO ejecutado**: `Backend/docker-compose.forecast.yml` (proyecto
  compose INDEPENDIENTE — `build.sh` mata todo `agent-runtime-*` en cada deploy),
  `forecast.env.example`, location `/forecast/` en `nginx.prod.conf` apuntando a
  `host.docker.internal:8000` (el plan decía 127.0.0.1: era un bug, nginx no es host-net).
- **Bloqueante del deploy**: la EC2 (52.1.28.77, dominio `api.flow.visione-edge.com`) NO
  tiene Tailscale y NO alcanza la DB AgroDash (100.100.130.47). Opciones en el runbook:
  instalar Tailscale (a), modo demo con parquet montado (b), u otra vía (c).
  **RESUELTO 2026-07-23 (vía a):** la EC2 (`tag:agrovoltaic-etl`, tailnet `100.125.236.125`) ya
  **lee la DB `control` de Cartago** por Tailscale (Postgres 5432, rol read-only `agrovoltaic_ro`,
  probado OK: `SELECT` responde, escritura bloqueada). Ahora `DATABASE_URL` puede apuntar a la
  **fuente VIVA** (`100.101.177.71`) en vez del snapshot del rig (`100.100.130.47`). Pendiente de
  seguridad: rotar la clave débil de prueba a una fuerte en el gestor de secretos. Topología y
  detalle: [[conectividad-tailnet]].
  **DEPLOY EJECUTADO + DB VIVA (2026-07-23):** el sidecar `/forecast` ya corría en la EC2 en modo
  parquet-demo (data clavada en 2026-06-30); se **cambió a la DB viva** por config (`DATABASE_URL`→
  Cartago `control`, `WINDOW_START=2026-06-01`, `WINDOW_END=2027-01-01`, volumen parquet
  comentado; backups `.bak-*` en `/home/ec2-user/runtime/Agent-Runtime`). En la EC2 el compose es
  el binario **`docker-compose`** (con guion), NO `docker compose`. Probado: `/forecast` devuelve
  `ahora=2026-07-23` (antes 2026-06-30) → lee live; health público OK. **Caveats:** rezago de
  ingesta ~12 h (Zentra por lotes) y la serie se **cachea en memoria** → el "ahora" solo avanza al
  **reiniciar el contenedor** (no es streaming continuo; es el alcance elegido "switch por config").
NO se construyó nodo TS a medida (se usa el genérico `httpRequestTool`, ya en el catálogo).

## Por hacer
1. ~~Acceso a datos + runbook 04~~ ✅ HECHO (vía a, Tailscale; sidecar desplegado y en **DB viva** de Cartago).
2. ~~Commit + push Backend~~ ✅ (nginx `/forecast/` y modelos ya en prod; sidecar accesible por el dominio).
3. ~~Armar el flujo en el canvas~~ ✅ **HECHO Y PROBADO END-TO-END (2026-07-23):** flujo con
   `webhookTrigger` → `aiAgent`(anthropic/`claude-haiku-4-5`) → `output` + `httpRequestTool`
   (`forecast`, handle `tool`). El POST al webhook devuelve el pronóstico (el agente llama la tool,
   que lee la DB viva). JSON de referencia: `docs/pronostico/flujo-visioneflow.json` (Shape A,
   formato verificado contra `agent-builder/.../flowGenerator/importer.ts`).
   **Bug multi-tenant corregido en el camino (desplegado en prod):** el `aiAgent` usaba la key
   Anthropic GLOBAL del runtime (env, compartida entre todos los usuarios) en vez de la del **dueño
   del agente**. Fix en VisioneFlow Backend `acquireLLMPlugin` (invertir precedencia: gana la key del
   usuario vía `llmPluginPool`, global solo como fallback), commits `1b9e3ea`+`96b94ba` en
   `Agent-Runtime`, deploy `build.sh` OK. El `docker-compose.forecast.yml` (volumen parquet comentado
   = modo DB-viva) también quedó commiteado para sobrevivir los `git reset --hard` del deploy.
4. ~~Frescura de datos~~ ✅ **`forecast-refresh.timer`** (systemd, cada 6h: `docker-compose up -d
   --force-recreate`) instalado y validado en la EC2 → re-consulta la DB viva. El **refactor
   real-time se difiere a la capa de agentes**: la fuente es batcheada (Zentra) → la frescura está
   acotada por la ingesta, no por nuestro código, así que no compensa hoy. Ver [[conectividad-tailnet]].

## Actualización 2026-07-28 — pipeline de datos + humedad
El agente pasó a **multi-variable** (irradiancia + **humedad de suelo**) leyendo un **store
propio en Supabase** alimentado por un **ETL** desde AgroDash (arquitectura A), desplegado en la
EC2 con timers. La fuente SC está congelada (23-jul) → se trabajó "solo histórico". Pendiente: el
flujo del canvas con **trigger programado + write-back** a `predicciones` (Fase 4). Detalle
completo en [[pipeline-tiempo-real]].

Relacionado: [[agente-pronostico]], [[pipeline-tiempo-real]], [[agrodash]], [[capa-agentes]], [[arquitectura-regiones]], [[conectividad-tailnet]].
