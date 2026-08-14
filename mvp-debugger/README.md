# MVP Debugger — agentes AgroVoltaic

Web mínima (Next.js) para **probar y depurar en vivo** los dos agentes del proyecto,
con datos reales. La idea no es diseño: es ver **qué consulta el agente, qué calcula
y cómo redacta**, y poder cruzar cada número contra los datos de las bases.

## Qué muestra

Por cada pregunta, el debugger renderiza la **traza completa** del agente:

- 🧠 **modelo** — cada turno del LLM: su texto y las tools que decide llamar.
- 🔧 **tool** — cada ejecución real: `input` + **salida cruda** (el número que el
  LLM *no* inventa) + tiempo (ms) + error si lo hubo.
- **Respuesta final** + consumo (tokens in/out, requests, ms totales).

Regla de oro para verificar: **todo número de la respuesta final tiene que aparecer
en la salida de alguna tool**. Si no, es una alerta (el modelo estaría alucinando).

### Analizador PV (`/analizador`)
- Q&A con traza sobre el histórico fotovoltaico (Supabase PV).
- **KPIs**: llama las 6 tools con período abierto (estado actual del sistema).
- **Runner manual de tools**: ejecuta una tool atómica sin el LLM, con tus params.
- **Explorador de datos**: cobertura, filas crudas y series graficadas de cada
  relación (crudas, corregidas, calibradas, performance).

### Pronóstico ambiental (`/pronostico`)
- Q&A con traza (traduce el horizonte → `forecast` → redacta).
- Series del store (irradiancia + humedad de suelo) con resumen y sparkline.
- Detección de anomalías determinista.

## Arquitectura

```
Browser ─► /api/analizador/*  (route handler, inyecta x-api-key)  ─► :8010  analizador.api  ─► Supabase PV (RO)
        └► /api/pronostico/*  (route handler, inyecta x-api-key)  ─► :8000  pronostico.api  ─► store parquet / Supabase (RO)
```

- El browser **nunca** habla directo con los servicios Python ni ve las API keys:
  todo pasa por rutas `/api/*` del lado servidor (`app/api/**`), que reenvían con la
  key. Las keys viven solo en `app/lib/config.ts` (server).
- Los endpoints nuevos que consume el debugger se agregaron a los propios agentes
  (una sola fuente de verdad del lazo LLM, no se reimplementa en Node):
  - `POST /preguntar` → corre el agente y devuelve la **traza**.
  - Analizador: `GET /datos/tablas|columnas|muestra|serie` (peek read-only, allowlist).
  - Pronóstico: `GET /serie` (peek del store).
- Todo es **solo lectura** sobre las bases.

## Cómo correr

```bash
cd mvp-debugger
./dev.sh          # levanta analizador:8010 + pronostico:8000 + next:3000
```

`dev.sh` toma la `ANTHROPIC_API_KEY` de `agente-pronostico/.env`, usa el venv de
`agente-pronostico/.venv`, y abre <http://localhost:3000>. Ctrl-C cierra todo.

### Contra los agentes de la EC2 (sin montar nada local)

```bash
cd mvp-debugger
./consola.sh      # túnel SSH a la EC2 + consola en un puerto libre
```

`consola.sh` abre un túnel a los agentes que **ya corren en producción** (siguen
escuchando solo en el loopback del servidor: no se expone nada), elige puertos libres
solo —8000, 8010 y 3000 suelen estar ocupados en una máquina de desarrollo—, sincroniza
las URLs del `.env.local` con los puertos de esa corrida y cierra el túnel al salir.

Requiere `.env.local` con `DEBUGGER_PASSWORD` (si no, no vas a poder entrar) y la llave
SSH en `~/aws/visione-key.pem` (override: `EC2_KEY`, `EC2_HOST`, `CONSOLA_PORT`).

## Acceso

La consola tiene **gate de acceso**: `DEBUGGER_PASSWORD` en el entorno. Sin esa variable,
en producción responde 503 en vez de abrirse —fallar abierto fue lo que la dejó expuesta
en Amplify—; en desarrollo deja pasar para no estorbar. `DEBUGGER_SESSION_SECRET` firma
la cookie: rotarlo cierra todas las sesiones sin cambiarle la contraseña al equipo.

### Manual (si preferís)

```bash
# 1) analizador (usa DATABASE_URL de la raíz + ANTHROPIC_API_KEY del entorno)
cd ..; set -a; . agente-pronostico/.env; set +a
PYTHONPATH=agente-analizador/src agente-pronostico/.venv/bin/python \
  -m uvicorn analizador.api:app --port 8010

# 2) pronostico
cd agente-pronostico && .venv/bin/python -m uvicorn pronostico.api:app --port 8000

# 3) web
cd ../mvp-debugger && npm install && npm run dev
```

## Config

`.env.local` (se crea del `.env.local.example` la primera vez):

| Var | Default | Para qué |
|---|---|---|
| `ANALIZADOR_URL` | `http://127.0.0.1:8010` | servicio del analizador |
| `PRONOSTICO_URL` | `http://127.0.0.1:8000` | servicio del pronóstico |
| `ANALIZADOR_API_KEY` | (vacío) | si el servicio exige `x-api-key` |
| `PRONOSTICO_API_KEY` | (vacío) | idem |

En local los servicios corren sin key (dejá las keys vacías). Para apuntar a los
servicios ya desplegados en la EC2, cambiá las URLs y pegá las keys.
