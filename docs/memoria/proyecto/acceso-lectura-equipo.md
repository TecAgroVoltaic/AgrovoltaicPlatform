---
name: acceso-lectura-equipo
description: Por que un cliente con la llave anon de Supabase ve 0 filas sin error (RLS activo sin politicas) y como se le dio acceso de lectura a Joshua con un rol de Postgres directo
categoria: proyecto
actualizado: 2026-08-24
tags: [supabase, rls, permisos, equipo]
---

# Acceso de lectura para el equipo

## El sintoma que hay que saber reconocer

Joshua reporto el 2026-08-24: *"hice la migracion de los datos, generé unos gráficos de prueba y
luego intenté hacer otros pero me dice ahora que no hay datos y que la conexión está cerrada"*.
Parecia la cuota (el egress estaba al 103 %). No lo era. Eran dos cosas distintas:

**"No hay datos" = RLS activo sin ninguna politica.** Todas las tablas del proyecto tienen RLS
encendido y `pg_policies` devuelve **cero filas**. Un cliente con la llave anon o publishable
recibe **0 filas y ningun error**: no falla, miente. Escribir si le funcionaba porque la
migracion la hizo con `service_role` (que tiene BYPASSRLS) o conexion directa.

**"Conexion cerrada" = `statement_timeout`.** `anon` esta en 3 s y `authenticated` en 8 s. En
`postgrest_logs` queda `Warp server error: Thread killed by timeout manager`. Una consulta de
grafico sobre cientos de miles de filas se pasa, PostgREST mata el hilo y el cliente ve la
conexion cerrada. Por eso los primeros graficos de prueba (chicos) si salieron.

Diagnostico rapido de este par:

```sql
select * from pg_policies where schemaname in ('public','fliwer');   -- vacio = todos ven 0 filas
select rolname, rolconfig from pg_roles where rolname in ('anon','authenticated');
```

## La solucion que se eligio: rol de Postgres directo

En vez de escribir politicas RLS (que habria que mantener y razonar por tabla), se creo un rol
de lectura que esquiva las dos trampas de una:

```sql
create role joshua_ro with login bypassrls connection limit 5 password '...';
alter role joshua_ro set statement_timeout = '120s';
alter role joshua_ro set default_transaction_read_only = on;
-- grants explicitos por tabla; NO se le dio agente_log, gasto_diario ni uso_diario
```

Conecta por el **session pooler** (`joshua_ro.<ref>@aws-1-us-east-1.pooler.supabase.com:5432`),
no por la conexion directa, que es **IPv6-only** y no rutea desde una Mac.

Verificado: lee `fliwer.*`, `lecturas_ambientales`, la vista de compatibilidad, el historico PV y
`v_salud_ingesta`; **no** puede escribir (`cannot execute CREATE TABLE in a read-only
transaction`) ni leer `agente_log` (`permission denied`).

**Por que BYPASSRLS y no politicas:** un rol con solo `GRANT SELECT` seguiria viendo 0 filas,
porque RLS aplica igual. Las alternativas eran escribir politicas permisivas en 13 tablas (mas
superficie que mantener) o esto. Si algun dia hay usuarios finales de verdad, ahi si tocan
politicas.

## Advertencia que va con el acceso

El egress se cuenta igual por conexion directa. Un `SELECT *` de la serie ambiental son varios MB.
La instruccion al equipo es **agregar en SQL** (`date_trunc` + `avg` + `group by`) y no traerse la
serie completa a pandas para dibujar mil pixeles. Ver [[cuota-store-supabase]].

## Donde vive la credencial

`docs/equipo/acceso-datos-joshua.md`: guia de entrega para Joshua (por que fallaba, cadena de
conexion, ejemplos en psql y pandas, que puede leer, y la regla de agregar en SQL). Tiene la
**clave viva**, asi que esta en `.gitignore` y NO se commitea. Si el archivo no esta en tu copia
del repo es por eso, no porque falte: pedilo por canal privado.

La clave no es recuperable de la base (Postgres guarda un verificador `scram-sha-256`). Si se
pierde, rotarla es una linea y no deja a nadie fuera ni obliga a rehacer permisos:

```sql
alter role joshua_ro with password 'la-nueva';
```

## Pendiente

Rotar la clave de `joshua_ro`: se genero y se entrego en una sesion de Claude Code, asi que quedo
en el transcript. Mismo pendiente que la clave debil de [[conectividad-tailnet]].

Relacionado: [[cuota-store-supabase]], [[superficie-expuesta]], [[conectividad-tailnet]].
