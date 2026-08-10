---
name: agente-analizador
description: Agente LLM de Q&A sobre el histórico PV de San Carlos (Supabase); MVP CLI con tools atómicas (SRP) sobre las vistas limpias; el LLM solo orquesta, nunca calcula
categoria: proyecto
---

# Agente Analizador (Q&A) — histórico PV de San Carlos

Creado el **2026-08-10**. Responde preguntas en lenguaje natural sobre los datos PV de
San Carlos (la Supabase `jijklguopafevyucogro`, capas crudo→corrección→calibración→PR).
Es **distinto** del [[agente-pronostico]] (que pronostica desde AgroDash) y del Comparador
de [[capa-agentes]]. Sirve los objetivos 1-3 de [[evaluacion-datos]] (rendimiento por arreglo,
temperatura, irradiancia), ya desbloqueados.

## Diseño (validado con pensamiento crítico)
- **El LLM solo orquesta** (entiende, rutea, redacta); **nunca calcula**. Los números salen
  SIEMPRE de una tool = SQL de solo-lectura sobre las **vistas limpias** (encapsula los filtros
  correctos: tz local, `qc_ok/valido`, energía por integral de potencia). Se descartó una tool de
  SQL libre: el LLM produciría números plausibles-pero-mal.
- **Responsabilidad simple (pedido del usuario):** una tool = un archivo = una pregunta específica.
  El LLM **compone** varias para preguntas compuestas (no hay tool "comparar" que mezcle lógica).
- **Reutiliza el patrón probado del forecaster** (`agente-pronostico/`): lazo tool-use manual con
  el SDK Anthropic, DB por URL, read-only forzado, Haiku por defecto, system prompt con reglas.

## Estructura (`agente-analizador/`, paquete aparte)
`config.py` (DB por URL → Supabase PV, modelo) · `db.py` (única resp.: query read-only
parametrizada, devuelve JSON-serializable) · `periodo.py` (normaliza [desde,hasta)) ·
`tools/{energia,performance,irradiancia,temperatura,cobertura,catalogo}.py` (cada una: SCHEMA +
run()) · `tools/__init__.py` (registro: schemas + dispatch, sin lógica) · `agent/agent.py`
(lazo genérico) + `prompts.py` · `cli.py`.

## Tools (atómicas)
| Tool | Fuente | Devuelve |
|---|---|---|
| `energia_por_arreglo` | `v_sc_electrico_corregido` | energía Wh por arreglo + AC (integral de potencia) |
| `performance_ratio` | `v_sc_performance` | PR PV1/PV2 ponderado por energía + n |
| `irradiancia_resumen` | `v_sc_radiacion_calibrada` | GHI media/máx, kt*, insolación (qc_ok+valido) |
| `temperatura_por_arreglo` | `v_sc_electrico_corregido` | temp media/máx por arreglo |
| `cobertura_datos` | tablas crudas | rango disponible + conteos en el periodo |
| `catalogo_variables` | `diccionario_variables` | definiciones de columnas |

## Estado
- **Tools validadas contra la base real:** energía histórica PV1≈921 kWh / PV2≈602 kWh; PR 0,62/0,63;
  temp media PV1 31,9 / PV2 31,6 °C; GHI media 293 W/m², kt* 0,46. La tool `energia` reporta cobertura
  por columna (`n_ac` vs `n_pv1/n_pv2`): en el histórico la AC sale menor que la DC por **cobertura
  distinta** (n_ac≈19,9k vs n_pv1≈34,4k), NO por pérdidas — la nota lo explica.
- **Probado end-to-end con el LLM (Haiku, key del usuario) — 12 preguntas de todo tipo, comportamiento
  excelente:** grounded (todo número de una tool), elige la tool correcta (comparación→PR), **compone**
  varias tools (pregunta general → las 5 métricas), **declina** lo fuera de alcance (pronóstico futuro,
  Cartago, inventar), **resiste inyección**, reporta caveats (nubosidad, gaps, bifacial, cobertura n).
- **Defecto corregido en pruebas:** el LLM atribuía la brecha AC/DC a "pérdidas del inversor" (mal) →
  la tool ahora expone `n_ac`/`n_pv1`/`n_pv2` + nota clara.

## Integración a VisioneFlow (patrón del forecaster) — DESPLEGADA 2026-08-10
Cerebro = nodo `aiAgent`; manos = microservicio `analizador.api` (FastAPI). Cada tool atómica es un
endpoint `POST /tool/<nombre>` = una instancia del nodo genérico `httpRequestTool`. Artefactos:
`api.py`, `Dockerfile`, `deploy/docker-compose.analizador.yml`, `flujo-visioneflow.json` (9 nodos:
trigger + aiAgent Haiku + 6 httpRequestTool + output). Runbook: `agente-analizador/DEPLOY.md`.

**DEPLOY EN VIVO en la EC2 (`52.1.28.77`, `api.flow.visione-edge.com`):**
- Sidecar `analizador-analizador-1` (compose project **`analizador`**, puerto **8010**, host-net,
  `restart: unless-stopped`) en `/home/ec2-user/analizador/` — **fuera del `git reset` del deploy del
  Backend → sobrevive**. Lee la **Supabase PV por el pooler público** (sin Tailscale). Env en
  `analizador.env` (DATABASE_URL + ANALIZADOR_API_KEY generada). El comando de compose acá es
  **`docker-compose`** (con guion), NO `docker compose`.
- nginx: location **`/analizador/`** → `host.docker.internal:8010` añadida al `nginx.prod.conf`
  (mismo patrón que `/forecast/`), aplicada con **reload de cero downtime** (backup +
  `envsubst`+`nginx -t`+`nginx -s reload`). **Probado público:** `/analizador/health` OK,
  `/tool/*` con `x-api-key` OK, sin key → 401.

**Pendiente:**
1. **Durabilidad de nginx (bloqueado para el asistente):** la location vive en el checkout de la EC2
   y se **borra en el próximo deploy del Backend** (`deploy.yml` → `git reset --hard origin/master`).
   Persistirla requiere commitear el bloque `/analizador/` a `Visione-Edge/Agent-Runtime` y pushear,
   **PERO la EC2 tiene git read-only** (push denegado) y no hay clon local con escritura → **lo debe
   hacer el usuario** (o quien tenga escritura). El sidecar SÍ sobrevive (compose aparte fuera del git).
   Hasta entonces la ruta pública funciona pero **no sobrevive un deploy del Backend**.
2. **Canvas:** importar `flujo-visioneflow.json` + pegar la `ANALIZADOR_API_KEY` en cada httpRequestTool
   (acción en la plataforma). La key está en `/home/ec2-user/analizador/analizador.env`.
Ver [[integracion-visioneflow]].

## Futuro
Wrapper `/preguntar` (agente completo) si se quiere el lazo LLM en Python; tools de correlación
(temp vs rendimiento); tests unitarios por tool.

Relacionado: [[agente-pronostico]], [[capa-agentes]], [[evaluacion-datos]], [[geometria-sistema]], [[implementacion]].
