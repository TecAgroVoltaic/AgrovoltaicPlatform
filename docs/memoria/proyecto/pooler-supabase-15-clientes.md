---
name: pooler-supabase-15-clientes
description: El pooler de Supabase en modo sesión admite 15 clientes en total, compartidos entre producción y desarrollo; agotarlo se ve como "todo tarda 30 segundos"
categoria: proyecto
actualizado: 2026-10-05
tags: [supabase, rendimiento, pool, infraestructura]
---

# El pooler en modo sesión tiene 15 cupos, y son de todos

**Síntoma (2026-10-05, desarrollo local).** Las vistas de la consola tardaban entre 15 y 120 s de
forma errática. La base respondía cada consulta en milisegundos (`EXPLAIN ANALYZE`: 0,08 a 152 ms).

**Causa.** La `HISTORICO_DB_URL` / `STORE_URL` apunta al pooler de Supabase en **modo sesión**
(`aws-1-us-east-1.pooler.supabase.com:5432`), que admite **15 clientes en total**. Al pasarse:
`FATAL: (EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15`.
Ese cupo lo comparten producción, el ETL y cualquier máquina de desarrollo.

Medido ese día: con el Histórico local apagado, **otros clientes ocupaban 8 de 15** de forma estable
(1 es el analizador viejo del EC2 de VisioneFlow, ver [[estado-ec2-2026-09-11]]; los otros 7 no se
pudieron atribuir desde fuera). El Histórico local venía con el pool por defecto (`HISTORICO_POOL_MAX=12`),
así que agotaba los 7 libres: sus propias consultas esperaban los 15 s del `timeout` del pool, y el
Predictivo, que abre una conexión nueva por consulta, fallaba y reintentaba.

**Consecuencia que no se ve:** una máquina de desarrollo con el pool por defecto **le quita cupos a
producción**.

## Lo que se hizo

Solo configuración local (no hay cambio de código): en `agente-historico/.env`,
`HISTORICO_POOL_MAX=4` y `HISTORICO_PARALELO_MAX=4`. Resultado medido desde Alemania (~120 ms por viaje
a la base): tablas y series 1–2 s, performance ratio 2–4 s, catálogo de Descargas ~6 s, resumen de
calidad 6–11 s, salud del Predictivo 4–7 s. Sin esperas de medio minuto. No se midió en el servidor.

## Una hipótesis que se descartó (para no repetirla)

Primero se creyó que la red cortaba en silencio las conexiones ociosas (una prueba mostró consultas
de 60 s tras 45 s de inactividad) y se escribió un "latido" del pool. **Era falso:** las cuatro
conexiones de esa prueba se destrabaron en el mismo instante, o sea que fue un único atasco del
pooler y no un efecto de la inactividad; con el latido activo las esperas siguieron igual. El cambio
se revirtió sin subirse.

## Decisión abierta

El tope es estructural: dos personas desarrollando ya lo agotan. Opciones, sin decidir:

1. **Pasar las lecturas al pooler en modo transacción (puerto 6543)**, que no tiene ese tope. Exige
   cambiar cómo se fuerza el solo-lectura (hoy `SET SESSION CHARACTERISTICS…` al crear la conexión,
   que en modo transacción no persiste) y desactivar los prepared statements. Recomendada.
2. Subir el tamaño del pool en el panel de Supabase (limitado por el plan).
3. Dejarlo con el pool chico en desarrollo.

Además: apagar el analizador viejo del EC2 de VisioneFlow libera un cupo.

Relacionado: [[cuota-store-supabase]], [[acceso-lectura-equipo]], [[servidor-propio]], [[abiertos]].
