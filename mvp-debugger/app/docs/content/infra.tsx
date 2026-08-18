"use client";
import { Page, Note, IC, Table, Diagram, Pre, Meta } from "../ui";

export function Infra() {
  return (
    <Page
      crumb="Despliegue"
      title="Despliegue: local, EC2 y ruteo"
      lead="Cómo se levanta todo en local con un comando, y cómo viven los dos agentes como sidecars detrás de nginx en la EC2 de VisioneFlow."
    >
      <h2>Local — un solo comando</h2>
      <p><IC>mvp-debugger/dev.sh</IC> levanta los tres procesos en <IC>127.0.0.1</IC> con el venv de <IC>agente-pronostico/.venv</IC>, y cierra todo con Ctrl-C.</p>
      <Table
        head={["Proceso", "Bind", "Comando"]}
        rows={[
          ["Analizador PV", "127.0.0.1:8010", <IC>uvicorn analizador.api:app</IC>],
          ["Pronóstico", "127.0.0.1:8000", <IC>uvicorn pronostico.api:app</IC>],
          ["Next dev", "localhost:3000", <IC>next dev -p 3000</IC>],
        ]}
      />
      <p>La <IC>ANTHROPIC_API_KEY</IC> se exporta desde <IC>agente-pronostico/.env</IC> (no se imprime) y la heredan ambos procesos. En local los servicios corren <strong>sin</strong> API key. Los servicios leen las DBs en solo-lectura.</p>

      <h2>Producción — EC2 (VisioneFlow «Agent-Runtime»)</h2>
      <Meta items={[
        ["Host", "52.1.28.77 (ec2-user)"],
        ["Dominio", "api.flow.visione-edge.com"],
        ["TLS", "Let's Encrypt (nginx)"],
      ]} />
      <p>Los dos agentes corren como <strong>sidecars Docker</strong> en proyectos compose <strong>independientes</strong> (no dentro de <IC>docker-compose.prod.yml</IC>), a propósito, para sobrevivir al <IC>docker rm -f</IC> que hace el deploy del runtime. Usan <IC>network_mode: host</IC>.</p>
      <Diagram>{`  EC2 · api.flow.visione-edge.com (:443 TLS)
  ┌──────────────────────────────────────────────────────────────┐
  │ nginx (agent-runtime-loadbalancer-1)                          │
  │   /            → runtime_backend  host.docker.internal:4000   │
  │   /forecast/   → forecast sidecar host.docker.internal:8000   │
  │   /analizador/ → analizador sidec host.docker.internal:8010   │
  └──────────────────────────────────────────────────────────────┘
     sidecars host-net, restart: unless-stopped, healthcheck /health`}</Diagram>
      <Table
        head={["Path público", "→ upstream", "Recorte"]}
        rows={[
          [<IC>/forecast/</IC>, <IC>host.docker.internal:8000/</IC>, <><IC>/forecast/forecast → /forecast</IC></>],
          [<IC>/analizador/</IC>, <IC>host.docker.internal:8010/</IC>, <><IC>/analizador/tool/x → /tool/x</IC></>],
          [<><IC>/</IC> (resto)</>, <IC>runtime_backend :4000</IC>, "WebSocket + CORS + SSE"],
        ]}
      />
      <Note>
        <div>Se usa <IC>host.docker.internal</IC> (no <IC>127.0.0.1</IC>) porque el contenedor nginx no es host-net. El bloque <IC>/analizador/</IC> se aplica con <IC>apply_nginx.sh</IC> (backup → insertar location → <IC>nginx -t</IC> → reload, con rollback si falla). El mvp-debugger en prod se hostea aparte (el CORS habilita <IC>*.amplifyapp.com</IC>, indicando AWS Amplify).</div>
      </Note>

      <h2>Contenedores</h2>
      <Table
        head={["Sidecar", "Imagen", "Puerto", "env_file"]}
        rows={[
          [<IC>forecast</IC>, "forecast-irradiancia:latest (python:3.12-slim)", "8000", "forecast.env"],
          [<IC>analizador</IC>, "analizador-pv:latest (python:3.12-slim)", "8010 (compose lo fija)", "analizador.env"],
        ]}
      />
      <Note kind="warn">
        <div><b>En la EC2 el comando es <IC>docker-compose</IC> (con guion, v5.0.2)</b>, no <IC>docker compose</IC> v2. Los docs de sidecars usan la forma sin guion, pero el <IC>build.sh</IC> real usa <IC>docker-compose -f …</IC>. En el servidor, usar siempre <IC>docker-compose</IC>.</div>
      </Note>

      <h2>Variables de entorno por servicio (solo nombres)</h2>
      <h3>agente-analizador</h3>
      <Table
        head={["Variable", "Rol"]}
        rows={[
          [<IC>ANTHROPIC_API_KEY · ANTHROPIC_MODEL</IC>, "LLM (modelo default claude-haiku-4-5). En EC2 no hace falta si el cerebro vive en VisioneFlow"],
          [<IC>ANALIZADOR_DB_URL / DATABASE_URL</IC>, "Supabase PV (Session pooler, RO). La primera manda"],
          [<IC>ANALIZADOR_API_KEY</IC>, "Clave que exige /tool, /preguntar, /chat, /uso, /datos/* (header x-api-key)"],
          [<IC>DATA_DESDE · DATA_HASTA</IC>, "Rango histórico informativo del system prompt"],
        ]}
      />
      <h3>agente-pronostico</h3>
      <Table
        head={["Variable", "Rol"]}
        rows={[
          [<IC>ANTHROPIC_API_KEY · ANTHROPIC_MODEL</IC>, "LLM"],
          [<IC>DATABASE_URL / AGRODASH_URL / AGRODASH_*</IC>, "Fuente AgroDash (réplica Cartago, RO). Por URL o por partes"],
          [<IC>STORE_URL</IC>, "Supabase AgroVoltaic donde el ETL escribe y el forecaster lee"],
          [<IC>FORECAST_API_KEY</IC>, "Clave que exige /forecast (header x-api-key)"],
          [<IC>SITE_* · SENSOR_TYPE · BOX_NAME · IRRADIANCE_CHANNEL</IC>, "Perfil del sitio y qué leer de la DB"],
        ]}
      />
      <Note kind="crit">
        <div><b>Asimetría de nombres a tener en cuenta.</b> En el mvp-debugger la variable se llama <IC>PRONOSTICO_API_KEY</IC>, pero el servicio Python valida su clave contra <IC>FORECAST_API_KEY</IC>. El <b>valor</b> debe coincidir; solo cambia el nombre en cada extremo. En el analizador, <IC>ANALIZADOR_API_KEY</IC> es el mismo nombre en ambos lados.</div>
      </Note>

      <h2>Proceso de deploy (sidecars)</h2>
      <p>El código de los agentes no está en git del Backend: se sube por rsync a la EC2 y se levanta con compose.</p>
      <Pre>{`# 1. subir el código a la EC2 (rsync, excluye .venv/__pycache__)
rsync -av .../agente-pronostico/ ec2-user@52.1.28.77:/home/ec2-user/forecast/agente-pronostico/

# 2. crear el .env del sidecar (DATABASE_URL + FORECAST_API_KEY con openssl rand -hex 32)

# 3. levantar (docker-compose, con guion, en la EC2)
FORECAST_BUILD_CONTEXT=/home/ec2-user/forecast/agente-pronostico \\
  docker-compose -f docker-compose.forecast.yml up -d --build

# 4. verificar contra el dominio público
curl -s https://api.flow.visione-edge.com/forecast/health   # {"status":"ok"}`}</Pre>
      <p>El runtime principal se auto-despliega por GitHub Actions (push a <IC>master</IC> → <IC>build.sh</IC> en la EC2), que aplica también los cambios de nginx. Todo es aditivo: <IC>docker-compose … down</IC> apaga un sidecar sin afectar al runtime.</p>
    </Page>
  );
}
