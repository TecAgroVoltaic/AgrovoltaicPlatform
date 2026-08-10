---
name: conectividad-tailnet
description: Malla Tailscale para acceso a datos entre el server LIVE de Cartago (iot-mainserver), el rig (copia AgroDash) y el EC2 de VisioneFlow. Topología, IPs, ACL default-deny (EC2→Cartago solo lectura), tags y pendientes.
categoria: proyecto
---

# Conectividad — malla Tailscale para acceso a datos

Cómo el **EC2 de VisioneFlow** (consumidor) alcanza los datos de **Cartago** en tiempo real,
de forma limpia y segura, vía **Tailscale** (malla WireGuard). Es la vía (a) del bloqueante de
[[integracion-visioneflow]]. **Funcionando y probado el 2026-07-23** (ver Estado abajo).

## Topología (tailnet de la cuenta `izackk26@`)

| Nodo | IP tailnet | Qué es |
|------|-----------|--------|
| `iot-cartago-agrovoltaic` | `100.101.177.71` | **Server LIVE de Cartago** (`iot-mainserver`, Ubuntu, user `embebidos`). Fuente VIVA: PostgreSQL 14 nativo, DB `control`. **NUEVO 2026-07-23: recién metido a la tailnet** (antes solo AnyDesk — ver [[agrodash]]). |
| `izack-rig` | `100.100.130.47` | Rig con la **copia restaurada** del dump de AgroDash (contenedor `agrodash-pg`, DB `agrodash_control`, snapshot 2026-06-30). Entorno de pruebas del Comparador. |
| `izacks-macbook-pro` | `100.122.165.37` | Mac del usuario. |
| `iphone182` | `100.109.11.81` | Offline. |
| `agrovoltaic-etl` (EC2 VisioneFlow) | `100.125.236.125` | `52.1.28.77` / `api.flow.visione-edge.com` (Amazon Linux, `ec2-user`). **En la tailnet desde 2026-07-23**, tagueada `tag:agrovoltaic-etl`. Consumidor read-only. |

**Live vs snapshot:** el rig es un snapshot estático (2026-06-30); el server de Cartago es la
fuente **viva**. Meter Tailscale directo en `iot-mainserver` habilita extracción **en tiempo real**
del origen, no solo del dump.

## Estado (2026-07-23): conexión viva y probada ✅

- La EC2 `agrovoltaic-etl` (`100.125.236.125`) **lee la DB `control` de Cartago** por Tailscale
  (vía relay DERP-mia, ~100-150 ms — suficiente para lecturas periódicas; no logró path directo).
- **Puerto decidido: Postgres directo 5432** (no la API HTTP).
- Rol **`agrovoltaic_ro`** en Cartago: `LOGIN`, `default_transaction_read_only = on`, solo
  `GRANT SELECT` sobre schema `public` (DB `control`). `password_encryption = scram-sha-256`.
- Probado desde la EC2: `SELECT now()` responde; `CREATE TABLE` → error
  *"cannot execute ... in a read-only transaction"*. El read-only real funciona.
- **No se tocó** `listen_addresses` (ya estaba en `*`, cubría la tailnet → sin reinicio de la DB
  viva) **ni el firewall** (a pedido: el equipo de Cartago consume servicios).
- ✅ **`pg_hba` acotado:** se agregó como **primera** regla `host` una que solo permite
  `agrovoltaic_ro` desde `100.125.236.125/32` → el rol **solo es alcanzable desde la EC2**.
- ⚠️ **Clave temporal débil (decisión del usuario, 2026-07-23):** `agrovoltaic_ro` quedó con una clave
  débil "de mientras" (valor FUERA del repo). Riesgo **bajo** porque el rol solo acepta conexiones
  desde la EC2 (ya protegida por la ACL de Tailscale). **Pendiente:** rotar a una clave fuerte en el
  gestor de secretos. La clave **no** se guarda en este repo (queda en la memoria local de Claude y
  en los `.env` gitignored), mismo criterio que las claves de [[agrodash]] que no deben quedar en git.
- **Consumidor en marcha:** el sidecar `/forecast` de VisioneFlow (EC2) ya **lee esta DB viva**
  (switch parquet→DB el 2026-07-23; `/forecast` devuelve `ahora=2026-07-23`). Se refresca al
  reiniciar el contenedor. Detalle del deploy en [[integracion-visioneflow]].

## Decisión de seguridad (ACL)

- **Dirección:** Cartago → EC2 **PROHIBIDO** (Cartago no es `src` en ninguna regla → no inicia
  conexiones hacia nadie). EC2 → Cartago **PERMITIDO, solo lectura**.
- **Dos capas de "solo lectura":** (1) la ACL controla *host:puerto + dirección*, **NO** distingue
  SELECT de INSERT; (2) el read-only real se enforcea en la **BD** (rol Postgres solo `SELECT`,
  **NO** el superusuario `postgres`) o en la **API** (solo rutas de lectura).
- **Diseño ACL:** default-deny + nodos tagueados. `tag:cartago-iot` (Cartago),
  `tag:agrovoltaic-etl` (EC2). Regla única EC2→Cartago:puerto; una segunda regla preserva el acceso
  entre los equipos personales (`autogroup:member`). Los nodos tagueados **salen** de
  `autogroup:member` → quedan aislados de los personales y entre sí salvo la regla explícita.
- **Bonus:** los nodos tagueados **no caducan** (key-expiry off) → un pipeline permanente no se
  rompe por expiración de key del nodo.

## Pendientes / decisiones abiertas

- ✅ **Puerto decidido:** Postgres directo 5432 (no API HTTP).
- ✅ **EC2 en la tailnet** tagueada `tag:agrovoltaic-etl` (`100.125.236.125`).
- ✅ **Binding/firewall:** innecesario tocarlos (`listen_addresses = *` ya cubría la tailnet; firewall
   sin cambios a pedido).
- ✅ **`pg_hba` acotado a la EC2:** regla `allow` para `agrovoltaic_ro` desde `100.125.236.125/32`
   puesta de primera.
- ⏳ **Rotar la clave de `agrovoltaic_ro`** (temporal débil, por decisión del usuario) a una
   fuerte en el **gestor de secretos**.
- ⏳ **Apuntar el forecaster a la fuente VIVA:** `DATABASE_URL` puede ir al Postgres de Cartago
   (`100.101.177.71`, DB `control`, user `agrovoltaic_ro`) en vez del snapshot del rig
   (`100.100.130.47`). Ver [[integracion-visioneflow]].
- ✅ Warning de DNS en Cartago: resuelto con `--accept-dns=false`.

## Notas de impacto (meter Tailscale a un server/EC2)

Bajo y aditivo: crea la interfaz `tailscale0` (IP `100.x`), **no** requiere abrir puertos inbound en
el Security Group (usa outbound UDP 41641 + relays DERP sobre 443), no cambia IP pública / rutas /
SSH existentes. Incluso permite cerrar el SSH público y administrar solo por Tailscale.

Relacionado: [[integracion-visioneflow]], [[agrodash]], [[arquitectura-regiones]], [[capa-agentes]].
