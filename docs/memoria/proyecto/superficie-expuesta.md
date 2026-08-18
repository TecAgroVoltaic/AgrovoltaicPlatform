---
name: superficie-expuesta
description: Qué escucha y qué es alcanzable desde internet en la EC2 (52.1.28.77), verificado 2026-08-18; los agentes bindean 0.0.0.0 y solo los frena el security group
categoria: proyecto
---

# Superficie expuesta de la EC2

**Verificado 2026-08-18**, desde dentro de la máquina (`ss -ltnp`, config de nginx) y **desde
fuera** (curl contra la IP pública). Vale para `52.1.28.77`.

## Qué escucha

| Puerto | Proceso | Bind | ¿Alcanzable desde internet? |
|---|---|---|---|
| 80 / 443 | nginx (`agent-runtime-loadbalancer-1`) | `0.0.0.0` | **Sí** — es la entrada pública |
| 8000 | uvicorn · agente de pronóstico | `0.0.0.0` | **No** (probado: sin respuesta) |
| 8010 | uvicorn · agente analizador | `0.0.0.0` | **No** (probado: sin respuesta) |
| 5433 | `agrodash-pg` (réplica del dump) | **`127.0.0.1`** | **No** — atado a loopback |
| 6379 | redis del Agent-Runtime | `0.0.0.0` | no verificado desde fuera |

**El punto fino:** 8000 y 8010 **bindean todas las interfaces**, no loopback. Hoy no responden
desde internet porque **el security group los bloquea** — o sea, la única capa que protege es una
regla de red, no la configuración del proceso. Un cambio de grupo de seguridad los publica sin
que nadie toque el código. El comentario de `mvp-debugger/consola.sh` afirma que "los servicios
siguen escuchando solo en el loopback del servidor": **es inexacto**. La réplica de Postgres sí
está bien atada.

## Rutas públicas por nginx

Definidas en `/etc/nginx/conf.d/default.conf` dentro del contenedor del balanceador:

- `/forecast/` → `host.docker.internal:8000` — protegida con `x-api-key`
- `/analizador/` → `host.docker.internal:8010` — protegida con `x-api-key`
- `/` y `/health` → runtime de VisioneFlow (puerto 4000)

**Excepción medida:** `GET /forecast/salud/ingesta` responde **sin API key** (HTTP 503 cuando el
dato está stale) y devuelve conteos de filas, marcas de tiempo y el **texto del último error**, que
incluye host y puerto internos. Para un endpoint de salud es discutible, no grave; si se quiere
cerrar, es la misma protección por key que ya usa `/salud/panel` (que sí responde 401 sin ella).

## Gate de la consola de depuración

`mvp-debugger` **falla cerrada**: sin `DEBUGGER_PASSWORD` responde **503 en producción** en vez de
abrirse ([[mvp-debugger]]). Consecuencia práctica: **si el despliegue real no tiene esa variable
definida, la consola parece caída**. Conviene además definir `DEBUGGER_SESSION_SECRET` aparte, para
poder rotar la firma sin cambiarle la contraseña al equipo.

## Pendiente

- Atar 8000/8010 a `127.0.0.1` (nginx los alcanza igual por la red de Docker) o, como mínimo,
  corregir el comentario de `consola.sh` para que no afirme algo que no se cumple.
- Confirmar `DEBUGGER_PASSWORD` en el despliegue de la consola.
- Rotar la clave débil del rol de prueba pendiente desde [[conectividad-tailnet]].

Relacionado: [[agrodash-local]], [[mvp-debugger]], [[integracion-visioneflow]], [[conectividad-tailnet]].
