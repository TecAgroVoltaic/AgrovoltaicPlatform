---
name: agrodash
description: AgroDash = DB de Cartago (server iot-mainserver) y objetivo de comparación; plataforma de suelo/riego/experimentos (NO fotovoltaica) que además contiene puntos de San Carlos
categoria: contexto-externo
---

# AgroDash — DB de Cartago (objetivo de comparación)

> **Acceso vigente (2026-08-26): API pública, sin credenciales ni tailnet.**
> `https://agrodash.nm.35-208-114-233.nip.io/api/v1` es la fuente del ETL desde hoy.
> Es dato **vivo** (~30 s de rezago) y sirve también la historia. Sus timestamps son
> centros de bin y solo son exactos en ventanas ≤ 2 h: detalle y trampas en
> [[agrodash-api]]. Todo lo de abajo sobre tailnet, dump y réplicas sigue siendo
> cierto, pero ya no es el camino principal.

**Corrección importante (2026-06-16, verificada por dump de esquema).** AgroDash NO es
"solo un sistema de suelo aparte que no se toca": es la **base de datos de la región Cartago**
y el **objetivo de comparación** del Agente Histórico (ver [[capa-agentes]], [[arquitectura-regiones]]).

- **Server:** `iot-mainserver` (Ubuntu, PostgreSQL 14 nativo, sin Docker). App en Rust/Axum
  (`~/Documents/api-sensores`). Dos bases con **esquema idéntico**: `control` (la viva) y
  `agrodash_dev` (copia dev), con **replicación lógica** entre ellas.
- **Copia local (2026-06-30):** tenemos un **dump completo de `control`** en
  `sql/dump/agrodash_control_2026-06-30.dump` (609 MB, formato `-Fc`, ~19.4M filas en `readings`).
  Generado con `pg_dump` (solo lectura, no tocó prod) usando `postgres` (contraseña redactada), traído del
  server por AnyDesk→Drive→Mac (credenciales de `pg_dump` **redactadas**). Restaurar con `pg_restore --no-owner --no-privileges`. **Gitignored.**
- **Réplica local (2026-08-14):** con Cartago y el rig **inalcanzables**, el dump está restaurado
  en un **cluster nativo del equipo de trabajo** (`~/pgdata-agrodash`, PostgreSQL 18, puerto
  **5433**, DB `agrodash_control`, 21.3M filas, 5.046 MB). Se levanta con
  `agente-predictivo/scripts/agrodash_local.sh`. **Es la fuente actual del ETL** — ver
  [[agrodash-local]].
- **Copia viva en el rig (2026-06-30):** el dump ya está **restaurado y corriendo** en `izack-rig`
  como contenedor Docker `agrodash-pg` (postgres:16, volumen persistente `agrodash_pgdata`,
  `--restart unless-stopped`). DB **`agrodash_control`** con **21.3M filas** en `readings`
  (34 tablas; 6 cajas `SC`: Abioticos 1/2, Hum_Suelo, Irradiancia, Caja SC, CampbellSC).
  `readings` va del `2011-01-01` basura ([[agrodash-esquema]]) al `2026-06-30` (data fresca).
  Expuesto **solo en Tailscale**: `100.100.130.47:5432`, user `postgres` / pass **redactada** (ver gestor de secretos / `AGRODASH_PASSWORD`).
  Desde la Mac: `PGPASSWORD="$AGRODASH_PASSWORD" psql -h 100.100.130.47 -U postgres -d agrodash_control`.
  Este es el **entorno de pruebas** donde correrá el Agente Histórico ([[capa-agentes]]).
- **Acceso actual (act. 2026-07-23):** el server YA está en la **tailnet propia** — Tailscale
  instalado el 2026-07-23, nodo `iot-cartago-agrovoltaic`, IP `100.101.177.71` → ahora es
  **alcanzable en vivo** por Tailscale (topología y ACL en [[conectividad-tailnet]]). Antes: solo
  **AnyDesk**; SSH **no enrutable** desde la Mac (el server vive también en una malla **Netmaker**,
  interfaz `netmaker`, IP `100.104.63.6` — NO es el tailnet propio; ni la IP pública
  `201.206.80.150` ni la LAN `172.21.224.19` respondían). Hay key SSH `~/.ssh/cartago` ya puesta en
  `authorized_keys` del user `embebidos`.
- **Frescura de la ingesta (act. 2026-08-26): las cajas SC VOLVIERON.**
  `Caja Irradiancia SC` y `Caja Hum_Suelo SC` reportan **hoy**. Estuvieron caídas del
  **24-jul al 4-ago** y reanudaron el **2026-08-05 16:49**; el congelamiento del
  2026-07-23 ~02:32 que decía este archivo ya está superado. Nadie se enteró durante
  21 días porque el ETL leía un snapshot. Lo que SÍ sigue congelado desde el
  2026-07-23 02:32 son las cajas de **Cartago** (`Caja O/N/L/I/H/G/A`, `Campbell`).
  Las `ZN_*` (Zentra) y `Caja R`/riego siguen vivas. Ya hay fuente viva de irradiancia
  y humedad de suelo → el "en vivo" del [[pipeline-tiempo-real]] deja de estar
  bloqueado.
- **Seguridad:** la contraseña del superusuario `postgres` (aquí **redactada**) viaja **en claro** en el
  `.env` de la app y en el `CREATE SUBSCRIPTION` de `~/schema.sql` → avisar al equipo para rotarla.
  ⚠️ Tanto esa clave como la del rig **estaban en claro en versiones anteriores de este archivo**;
  se redactaron el 2026-07-01, pero **siguen en el historial de git** → conviene **rotarlas**. Las
  contraseñas reales van solo en el gestor de secretos / variables de entorno, nunca en el repo.
- **Qué es:** plataforma genérica de sensores — `boxes` (punto de medición) → `sensors(type)`
  → `readings(value)` — más **control de riego con Kalman**, **experimentos agronómicos**,
  **alertas** y **multiusuario**. Detalle del esquema en [[agrodash-esquema]] y en
  `../../referencia/agrodash-control-schema.sql`.
- **NO es fotovoltaica:** no hay voltaje, corriente, potencia ni inversor. Mide **suelo/ambiente**
  (humedad, EC, temperatura, irradiancia, PAR) e ingiere de **Zentra Cloud** (METER).
- **Contiene AMBOS sitios:** las cajas con sufijo **`SC` son de San Carlos** (puntos que el
  equipo de Cartago instaló allá dentro de su sistema; varios sin reportar hace meses). Ej:
  `Caja Irradiancia SC`, `Caja Hum_Suelo SC`, `Caja Abioticos 1/2 SC`, `CampbellSC`.
- **Ya trae** `sensor_stats` (media/desv 24h, `anomaly_score`, `rate_of_change`),
  `sensor_correlations` (pearson) y un sistema de alertas — parte del "comparador" ya existe.

**Matiz "no combinar":** a nivel de **almacenamiento** sigue separado de la Supabase PV de
San Carlos (no se fusionan tablas). PERO el **Agente Histórico SÍ lo lee**, y la data ambiental de
San Carlos ya vive aquí. El PDF (`../../_archivo/referencia_api_agrodash.pdf`) quedó **desactualizado**
en *qué es* AgroDash (suelo, no PV) y para el esquema hay que usar el real, no el PDF.
**Pero su URL base seguía viva y nadie volvió a mirarla** por estar el documento marcado
como obsoleto: de ahí salió el acceso de [[agrodash-api]]. Ojo, el PDF se equivoca en dos
cosas verificadas: el sufijo `Z` en `from`/`to` da HTTP 400, y los timestamps son hora
local de Costa Rica, no UTC.

- Sigue válido: su filtro de temperatura −10…60 °C respalda tratar temp=85.0 como inválido
  ([[temperatura-85]]).
- **Timezone:** confirmado **Costa Rica (UTC−6) para ambos sitios** ([[bloqueantes]]).

Relacionado: [[agrodash-api]], [[arquitectura-regiones]], [[agrodash-esquema]], [[capa-agentes]], [[bloqueantes]], [[temperatura-85]], [[conectividad-tailnet]].
