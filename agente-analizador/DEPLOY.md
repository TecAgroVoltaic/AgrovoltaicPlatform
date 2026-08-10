# Deploy del Analizador en VisioneFlow

Mismo patrón que el forecaster ([[integracion-visioneflow]]): **cerebro vs. manos**.
El LLM lo orquesta el nodo `aiAgent` de VisioneFlow; los números salen de este
**microservicio Python** (FastAPI), expuesto por HTTP. Cada tool atómica = un
endpoint = una instancia del nodo genérico `httpRequestTool`.

## 1. El servicio (`analizador.api:app`)
- `GET /health` — ping (abierto).
- `GET /tools` — esquemas de las tools (para configurar los nodos).
- `POST /tool/<nombre>` — ejecuta la tool con el body JSON como params. Exige
  header `x-api-key` si `ANALIZADOR_API_KEY` está en el entorno.

Local:
```bash
cd agente-analizador && pip install -e ".[service]"
ANALIZADOR_API_KEY=xxx uvicorn analizador.api:app --host 0.0.0.0 --port 8000
curl localhost:8000/health
curl -XPOST localhost:8000/tool/performance_ratio -H 'x-api-key: xxx' -H 'content-type: application/json' -d '{}'
```

## 2. Variables de entorno (contenedor / EC2)
- `DATABASE_URL` (o `ANALIZADOR_DB_URL`): Supabase PV de AgroVoltaic (Session pooler,
  usuario `postgres.<ref>`, SOLO LECTURA de facto: el servicio solo consulta).
- `ANALIZADOR_API_KEY`: clave fuerte; la misma va en cada `httpRequestTool` del canvas.
- `ANTHROPIC_*`: NO hace falta acá (el LLM vive en el `aiAgent` de VisioneFlow).

## 3. Docker
```bash
docker build -t analizador-svc agente-analizador/
docker run -p 8000:8000 -e DATABASE_URL=... -e ANALIZADOR_API_KEY=... analizador-svc
```
En la EC2: contenedor sidecar (compose independiente, como `docker-compose.forecast.yml`)
+ location nginx **`/analizador/`** → `host.docker.internal:<puerto>`. **Ojo SSRF:** el
`httpRequestTool` bloquea `localhost`/IPs privadas → exponer por **nginx HTTPS + API key**
(URL externa), NO apuntar al `localhost` del runtime.

## 4. VisioneFlow (canvas)
- Importar **`flujo-visioneflow.json`** (formato verificado contra el importer, igual que
  el flujo del forecaster). Tiene: `trigger → aiAgent(anthropic/claude-haiku-4-5) → output`
  + 6 `httpRequestTool` (uno por tool) conectados por el handle `tool`.
- En cada `httpRequestTool`: reemplazar `PEGAR_ANALIZADOR_API_KEY` por la clave real, y
  ajustar la `url` base si el dominio/location difiere (`.../analizador/tool/<nombre>`).
- El modelo `claude-haiku-4-5` ya se agregó al plugin Anthropic de VisioneFlow (deploy del
  forecaster). El fix de key-por-usuario también ya está en prod.

## Estado
- ✅ Servicio + Dockerfile + flujo JSON: **listos y probados local** (TestClient: health,
  tools, ejecución de tools, 404).
- ⬜ **Deploy a la EC2** (sidecar + nginx `/analizador/`) e **import del flujo**: pendientes
  (tocan la infra de VisioneFlow y prod → requieren go-ahead + acceso a la EC2/plataforma).
