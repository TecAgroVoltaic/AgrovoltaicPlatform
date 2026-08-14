# Runbook — levantar todo desde cero

Qué hacer si te sentás frente a una máquina nueva, o si algo se cayó y hay que
reconstruirlo. Cada sección es independiente: levantá solo lo que necesites.

> Estado y decisiones del proyecto: `docs/memoria/INDEX.md`.
> Cómo se usa cada componente: el README de su carpeta.

## 0. Qué corre dónde

| Pieza | Dónde vive | Cómo sobrevive a un reinicio |
|---|---|---|
| Agente de pronóstico | EC2 `52.1.28.77`, contenedor `forecast-forecast-1` | `restart: unless-stopped` |
| Agente analizador | EC2, contenedor `analizador-analizador-1` | idem |
| Réplica de AgroDash | EC2, contenedor `agrodash-pg` (puerto **loopback** 5433) | idem, volumen `agrodash_pgdata` |
| Ingesta cada 15 min | EC2, `forecast-etl.timer` (systemd) | `enable`ado |
| Refresco del sidecar cada 6 h | EC2, `forecast-refresh.timer` | `enable`ado |
| Store de datos | Supabase `jijklguopafevyucogro` | gestionado |
| Consola de depuración | **solo local** (no desplegada) | — |

Acceso al servidor: `ssh -i ~/aws/visione-key.pem ec2-user@52.1.28.77`

## 1. Secretos que hacen falta

Ninguno está en el repo. Antes de levantar nada, conseguí:

| Variable | Para qué | Dónde está hoy |
|---|---|---|
| `DATABASE_URL` (raíz) | Supabase de AgroVoltaic (store) | `.env` de la raíz, gestor de secretos |
| `ANTHROPIC_API_KEY` | los dos agentes | `forecast.env` en la EC2 |
| `FORECAST_API_KEY` | proteger el sidecar | `forecast.env` en la EC2 |
| `ANALIZADOR_API_KEY` | proteger el analizador | entorno del contenedor en la EC2 |
| `DEBUGGER_PASSWORD` | entrar a la consola | `.env.local` (local) |
| `DEBUGGER_SESSION_SECRET` | firmar la cookie de sesión | idem |

Para generar las dos últimas de nuevo:

```bash
openssl rand -base64 24   # DEBUGGER_PASSWORD
openssl rand -hex 32      # DEBUGGER_SESSION_SECRET
```

## 2. El ETL de CSV (histórico fotovoltaico)

```bash
python3 -m venv env && source env/bin/activate
pip install -r requirements.txt
cp .env.example .env          # poné DATABASE_URL (Session pooler de Supabase)
python3 main.py               # menú: 1 auditar → 2 dry-run → 3 DDL → 4 crear → 6 cargar
```

Idempotente: reprocesar no duplica. CSV nuevos van a
`dataset/Monitoreo-AgroVoltaic-SC-NEW/` y se repite la opción 6.

## 3. Esquema del store

Idempotente, seguro de correr N veces. Crea las tablas del agente y las vistas de salud:

```bash
set -a; . .env; set +a
psql "$DATABASE_URL" -f agente-pronostico/sql/schema_supabase.sql
```

## 4. Réplica de AgroDash (la fuente de la ingesta)

El servidor de Cartago está caído, así que la fuente es una réplica restaurada del dump
`sql/dump/agrodash_control_2026-06-30.dump` (638 MB, gitignored, **no está en el repo**:
pedilo o traelo del servidor).

**Local:**

```bash
./agente-pronostico/scripts/agrodash_local.sh     # cluster en :5433, restaura si falta
```

**En la EC2** (así está hoy):

```bash
PW=$(cat /home/ec2-user/.agrodash_pw)
docker run -d --name agrodash-pg --restart unless-stopped \
  -e POSTGRES_PASSWORD="$PW" -e POSTGRES_DB=agrodash_control \
  -v agrodash_pgdata:/var/lib/postgresql/data \
  -p 127.0.0.1:5433:5432 postgres:16
docker cp agrodash_control_2026-06-30.dump agrodash-pg:/tmp/d.dump
docker exec -e PGPASSWORD="$PW" agrodash-pg \
  pg_restore --no-owner --no-privileges -j 2 -U postgres -d agrodash_control /tmp/d.dump
```

Tarda ~1 min y ocupa **5 GB**. El puerto queda atado al loopback: no se expone.

> Si el `pg_restore` de tu máquina es más nuevo que el servidor, falla con
> `unrecognized configuration parameter "transaction_timeout"`. Por eso acá se usa el
> `pg_restore` de adentro del contenedor.

## 5. Los agentes

Local, para desarrollo:

```bash
cd agente-pronostico && pip install -e ".[dev,service]"
uvicorn pronostico.api:app --port 8000

cd agente-analizador && pip install -e ".[dev,service]"
uvicorn analizador.api:app --port 8010
```

En la EC2 se despliegan como contenedores. El del pronóstico:

```bash
# 1) subir el código (no está en ningún remoto git)
rsync -az -e "ssh -i ~/aws/visione-key.pem" --exclude .venv --exclude __pycache__ \
  agente-pronostico/ ec2-user@52.1.28.77:/home/ec2-user/forecast/agente-pronostico/

# 2) reconstruir (en la EC2 el binario es docker-compose, con guion)
ssh -i ~/aws/visione-key.pem ec2-user@52.1.28.77 '
  cd /home/ec2-user/runtime/Agent-Runtime
  FORECAST_BUILD_CONTEXT=/home/ec2-user/forecast/agente-pronostico \
    docker-compose -f docker-compose.forecast.yml up -d --build'
```

> El compose vive en el repo **Agent-Runtime**, no en este. Es un proyecto compose
> separado a propósito: el deploy del runtime hace `docker rm -f` de todo
> `agent-runtime-*` y se llevaría puesto el sidecar.

## 6. Los temporizadores de la ingesta

```bash
scp -i ~/aws/visione-key.pem agente-pronostico/deploy/systemd/*.{service,timer} \
  ec2-user@52.1.28.77:/tmp/
ssh -i ~/aws/visione-key.pem ec2-user@52.1.28.77 '
  sudo cp /tmp/forecast-*.{service,timer} /etc/systemd/system/ &&
  sudo systemctl daemon-reload &&
  sudo systemctl enable --now forecast-etl.timer forecast-refresh.timer'
```

Detalle y diagnóstico: `agente-pronostico/deploy/systemd/README.md`.

## 7. La consola

```bash
cd mvp-debugger
npm ci
cp .env.local.example .env.local     # completá al menos DEBUGGER_PASSWORD
./consola.sh                         # túnel a la EC2 + consola en un puerto libre
```

Sin `DEBUGGER_PASSWORD` no vas a poder entrar (en producción responde 503; en
desarrollo deja pasar). Para levantar **todo local** en vez de usar la EC2: `./dev.sh`.

## 8. Verificar que quedó bien

```bash
# tests (no necesitan credenciales ni red)
cd agente-pronostico && pytest -q      # 117
cd agente-analizador && pytest -q      #  24
cd mvp-debugger && npm run build && ./scripts/smoke-auth.sh   # 9 casos

# salud del sistema en producción
ssh -i ~/aws/visione-key.pem ec2-user@52.1.28.77 '
  systemctl list-timers "forecast-*" --no-pager
  docker ps --format "{{.Names}} {{.Status}}"
  curl -s localhost:8000/salud/ingesta'
```

`/salud/ingesta` devuelve **503 mientras la fuente de San Carlos siga congelada**
(desde el 2026-07-23). Eso es correcto: informa la antigüedad real de los datos.

## 9. Si algo se rompe

| Síntoma | Dónde mirar |
|---|---|
| La ingesta no trae datos | `systemctl status forecast-etl.service` y la tabla `agente_log` (`nivel='error'`) |
| El pronóstico responde datos viejos | `GET /salud/ingesta` — la fuente está congelada, no es un bug del agente |
| Todo responde 429 | tope diario de gasto o rate-limit; ver `PRESUPUESTO_DIARIO_USD` |
| La consola responde 503 | falta `DEBUGGER_PASSWORD` en el entorno |
| Supabase rechaza escrituras | el plan gratuito son 500 MB y está en ~395 MB |

Los errores del agente quedan siempre en `agente_log`; el panel **Salud del sistema**
de la consola los muestra sin entrar al servidor.
