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

### Agente Histórico (`/analizador`)
- Q&A con traza sobre el histórico fotovoltaico (Supabase PV).
- **KPIs**: llama las 6 tools con período abierto (estado actual del sistema).
- **Runner manual de tools**: ejecuta una tool atómica sin el LLM, con tus params.
- **Explorador de datos**: cobertura, filas crudas y series graficadas de cada
  relación (crudas, corregidas, calibradas, performance).

### Agente Predictivo (`/pronostico`)
- Q&A con traza (traduce el horizonte → `forecast` → redacta).
- Series del store (irradiancia + humedad de suelo) con resumen y sparkline.
- Detección de anomalías determinista.

### Calidad de datos (`Calidad de datos`)

Lo que encontró el **Agente Histórico** barriendo el histórico PV día por día: completitud,
validez, duplicados, y la caracterización del cielo. Es una vista **transversal**, no de un
agente: describe los datos, no el comportamiento de un modelo.

La pieza central es el **mapa de días**, y es un calendario y no una tabla a propósito: el
hallazgo más grande del histórico es que faltan 295 de los 569 días de calendario, y eso en
una tabla de 274 filas no se ve, porque una tabla solo muestra lo que existe.

Son **dos tiras**, una por fuente, porque el veredicto combinado escondía lo más accionable:
la radiación tiene 126 días sanos y el eléctrico 4. Fundidas en una sola barra, ambas se ven
igual de rojas.

El veredicto de cada día lo decide **el servicio**, no la vista. Si lo calculara el cliente,
la consola y el reporte del CLI podrían discrepar sobre si un día sirve, que es la clase de
desacuerdo que nadie detecta hasta que ya tomó una decisión con él. Y «grave» no es cualquier
hallazgo grave: un día no deja de servir porque 3 de 144 lecturas de una de trece columnas se
salieran de rango.

La detección **no corre desde acá**: es por lotes (`python -m comparador todo`) y deja los
hallazgos en la base. Si la consola pudiera dispararla, cada visita recorrería los 274 días y
el resultado dependería de quién mire y cuándo. Por eso el proxy solo expone `GET`.

## Verificar la UI sin navegador

La extensión de Chrome que daría control del navegador **no conecta**, así que las vistas se
verifican compilando los componentes y renderizándolos de verdad con `react-dom/server`:

```bash
npm run verificar
```

No es un mock: es el mismo componente con los mismos datos. Lo que se afirma no es «compila»
sino **propiedades del resultado**: que no vuelva el vocabulario viejo, que no queden
coordenadas absolutas, presupuestos de contenido, y que el CSS que la vista usa exista.

## Arquitectura

```
Browser ─► /api/historico/*  (route handler, inyecta x-api-key)  ─► :8010  analizador.api  ─► Supabase PV (RO)
        ├► /api/predictivo/*  (route handler, inyecta x-api-key)  ─► :8000  predictivo.api  ─► store parquet / Supabase (RO)
        └► /api/historico/*  (route handler, solo GET)           ─► :8020  comparador.api  ─► Supabase PV (RO)
```

- El browser **nunca** habla directo con los servicios Python ni ve las API keys:
  todo pasa por rutas `/api/*` del lado servidor (`app/api/**`), que reenvían con la
  key. Las keys viven solo en `app/lib/config.ts` (server).
- Los endpoints nuevos que consume el debugger se agregaron a los propios agentes
  (una sola fuente de verdad del lazo LLM, no se reimplementa en Node):
  - `POST /preguntar` → corre el agente y devuelve la **traza**.
  - Histórico: `GET /datos/tablas|columnas|muestra|serie` (peek read-only, allowlist).
  - Pronóstico: `GET /serie` (peek del store).
- Todo es **solo lectura** sobre las bases.

## Cómo correr

```bash
cd mvp-debugger
./dev.sh          # levanta analizador:8010 + pronostico:8000 + comparador:8020 + next:3000
```

`dev.sh` toma la `ANTHROPIC_API_KEY` de `agente-predictivo/.env`, usa el venv de
`agente-predictivo/.venv`, y abre <http://localhost:3000>. Ctrl-C cierra todo.

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
SSH en `~/.ssh/VisioneMetrics.pem` (override: `EC2_KEY`, `EC2_HOST`, `CONSOLA_PORT`).

## Acceso

La consola tiene **gate de acceso**: `DEBUGGER_PASSWORD` en el entorno. Sin esa variable,
en producción responde 503 en vez de abrirse —fallar abierto fue lo que la dejó expuesta
en Amplify—; en desarrollo deja pasar para no estorbar. `DEBUGGER_SESSION_SECRET` firma
la cookie: rotarlo cierra todas las sesiones sin cambiarle la contraseña al equipo.

### Manual (si preferís)

```bash
# 1) analizador (usa DATABASE_URL de la raíz + ANTHROPIC_API_KEY del entorno)
cd ..; set -a; . agente-predictivo/.env; set +a
PYTHONPATH=agente-historico/src agente-predictivo/.venv/bin/python \
  -m uvicorn analizador.api:app --port 8010

# 2) pronostico
cd agente-predictivo && .venv/bin/python -m uvicorn predictivo.api:app --port 8000

# comparador (venv propio; sirve el store de hallazgos, no lo calcula)
cd agente-historico && .venv/bin/python -m uvicorn comparador.api:app --port 8020

# 3) web
cd ../mvp-debugger && npm install && npm run dev
```

## Config

`.env.local` (se crea del `.env.local.example` la primera vez):

| Var | Default | Para qué |
|---|---|---|
| `HISTORICO_URL` | `http://127.0.0.1:8010` | servicio del analizador |
| `PREDICTIVO_URL` | `http://127.0.0.1:8000` | servicio del pronóstico |
| `HISTORICO_URL` | `http://127.0.0.1:8020` | servicio del comparador |
| `HISTORICO_API_KEY` | (vacío) | si el servicio exige `x-api-key` |
| `PREDICTIVO_API_KEY` | (vacío) | idem |

En local los servicios corren sin key (dejá las keys vacías). Para apuntar a los
servicios ya desplegados en la EC2, cambiá las URLs y pegá las keys.
