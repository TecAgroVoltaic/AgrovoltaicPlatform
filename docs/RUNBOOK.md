# Runbook: levantar todo desde cero

Qué hacer si te sentás frente a una máquina nueva, o si algo se cayó y hay que
reconstruirlo. Cada sección es independiente: levantá solo lo que necesites.

> Estado y decisiones del proyecto: `docs/memoria/INDEX.md`.
> Cómo se usa cada componente: el README de su carpeta.

## 0. Qué corre dónde

| Pieza | Dónde vive | Cómo sobrevive a un reinicio |
|---|---|---|
| Agente Predictivo | EC2 `34.203.122.144`, contenedor `predictivo-predictivo-1` (`127.0.0.1:8000`) | `restart: unless-stopped` |
| Agente Histórico | idem, contenedor `historico-historico-1` (`127.0.0.1:8010`) | idem |
| Réplica de AgroDash | EC2, contenedor `agrodash-pg` (puerto **loopback** 5433) | idem, volumen `agrodash_pgdata` |
| Ingesta cada 15 min | EC2, `predictivo-etl.timer` (systemd) | `enable`ado |
| Refresco del sidecar cada 6 h | EC2, `predictivo-refresh.timer` | `enable`ado |
| Store de datos | Supabase `jijklguopafevyucogro` | gestionado |
| Consola de depuración | `https://agro.visione-edge.com` (pm2 en `127.0.0.1:3001`) | `pm2 save` + servicio pm2 |
| Borde HTTPS | nginx del sistema, TLS de Let's Encrypt | unidad systemd |

Acceso al servidor: `ssh -i ~/.ssh/VisioneMetrics.pem ec2-user@34.203.122.144`

> **El servidor se apaga solo.** Un EventBridge Scheduler lo apaga a las 19:00 y lo
> enciende a las 07:00, de lunes a viernes; el fin de semana está apagado completo. Si
> no responde de noche, no está caído. Detalle: `docs/memoria/proyecto/servidor-propio.md`.

> `52.1.28.77` (`octopia-runtime`) es el EC2 de **VisioneFlow**. Ahí ya no corre nada de
> AgroVoltaic desde el 2026-08-25; sólo queda un reenvío temporal de `/forecast/` y
> `/analizador/` hacia el servidor nuevo.

## 1. Secretos que hacen falta

Ninguno está en el repo. Antes de levantar nada, conseguí:

| Variable | Para qué | Dónde está hoy |
|---|---|---|
| `DATABASE_URL` (raíz) | Supabase de AgroVoltaic (store) | `.env` de la raíz, gestor de secretos |
| `ANTHROPIC_API_KEY` | los dos agentes | `forecast.env` en la EC2 |
| `FORECAST_API_KEY` | proteger el sidecar | `forecast.env` en la EC2 |
| `HISTORICO_API_KEY` | proteger el Histórico | `historico.env` en el servidor |
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
psql "$DATABASE_URL" -f agente-predictivo/sql/schema_supabase.sql
```

## 4. Réplica de AgroDash (la fuente de la ingesta)

El servidor de Cartago está caído, así que la fuente es una réplica restaurada del dump
`sql/dump/agrodash_control_2026-06-30.dump` (638 MB, gitignored, **no está en el repo**:
pedilo o traelo del servidor).

**Local:**

```bash
./agente-predictivo/scripts/agrodash_local.sh     # cluster en :5433, restaura si falta
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
cd agente-predictivo && pip install -e ".[dev,service]"
uvicorn predictivo.api:app --port 8000

cd agente-historico && pip install -e ".[dev,service]"
uvicorn historico.api:app --port 8010
```

En el servidor se despliegan como contenedores, cada uno con su compose **en este
repo** (ya no en el de VisioneFlow):

```bash
# 1) subir el código (no está en ningún remoto git)
S=ec2-user@34.203.122.144
rsync -az -e "ssh -i ~/.ssh/VisioneMetrics.pem" --exclude .venv --exclude __pycache__ \
  agente-predictivo/ $S:/home/ec2-user/agrovoltaic/predictivo/agente-predictivo/
rsync -az -e "ssh -i ~/.ssh/VisioneMetrics.pem" --exclude .venv --exclude __pycache__ \
  agente-historico/  $S:/home/ec2-user/agrovoltaic/historico/agente-historico/

# 2) reconstruir y levantar
ssh -i ~/.ssh/VisioneMetrics.pem $S '
  cd /home/ec2-user/agrovoltaic/predictivo && docker compose -f docker-compose.predictivo.yml up -d --build
  cd /home/ec2-user/agrovoltaic/historico  && docker compose -f docker-compose.historico.yml  up -d --build'
```

> Los dos usan `network_mode: host` y **atan uvicorn a `127.0.0.1`**. No se publican:
> quien los expone es nginx, y sólo bajo `/predictivo/` y `/historico/` con `x-api-key`.

## 6. Los temporizadores de la ingesta

```bash
scp -i ~/.ssh/VisioneMetrics.pem agente-predictivo/deploy/systemd/predictivo-*.{service,timer} \
  ec2-user@34.203.122.144:/tmp/
ssh -i ~/.ssh/VisioneMetrics.pem ec2-user@34.203.122.144 '
  sudo cp /tmp/predictivo-*.{service,timer} /etc/systemd/system/ &&
  sudo systemctl daemon-reload &&
  sudo systemctl enable --now predictivo-etl.timer predictivo-refresh.timer'
```

Detalle y diagnóstico: `agente-predictivo/deploy/systemd/README.md`.

## 7. La consola

```bash
cd mvp-debugger
npm ci
cp .env.local.example .env.local     # completá al menos DEBUGGER_PASSWORD
./consola.sh                         # túnel al servidor + consola local en un puerto libre
```

Lo normal es no levantar nada: la consola está desplegada en
`https://agro.visione-edge.com` y la contraseña se lee del servidor con
`cat ~/.consola_pw`. `./dev.sh` levanta **todo local** (los dos agentes y la web) y
`./consola.sh` corre tu web local contra los agentes de producción.

Sin `DEBUGGER_PASSWORD` no vas a poder entrar (en producción responde 503; en
desarrollo deja pasar).

## 8. Verificar que quedó bien

```bash
# tests (no necesitan credenciales ni red)
cd agente-predictivo && pytest -q      # 253
cd agente-historico && pytest -q      #  61
cd mvp-debugger && npm run build && ./scripts/smoke-auth.sh

# salud del sistema en producción
ssh -i ~/.ssh/VisioneMetrics.pem ec2-user@34.203.122.144 '
  systemctl list-timers "predictivo-*" --no-pager
  docker ps --format "{{.Names}} {{.Status}}"
  curl -s localhost:8000/health'
```

`/salud/ingesta` devuelve **503 mientras la fuente de San Carlos siga congelada**
(desde el 2026-07-23). Eso es correcto: informa la antigüedad real de los datos.

## 9. Si algo se rompe

| Síntoma | Dónde mirar |
|---|---|
| La ingesta no trae datos | `systemctl status predictivo-etl.service` y la tabla `agente_log` (`nivel='error'`) |
| El pronóstico responde datos viejos | `GET /salud/ingesta`: la fuente está congelada, no es un bug del agente |
| Todo responde 429 | tope diario de gasto o rate-limit; ver `PRESUPUESTO_DIARIO_USD` |
| La consola responde 503 | falta `DEBUGGER_PASSWORD` en el entorno |
| Nada responde de noche o en fin de semana | el servidor está apagado por programación, no caído |
| Supabase rechaza escrituras | el plan gratuito son 500 MB y está en ~395 MB |

Los errores del agente quedan siempre en `agente_log`; el panel **Salud del sistema**
de la consola los muestra sin entrar al servidor.
