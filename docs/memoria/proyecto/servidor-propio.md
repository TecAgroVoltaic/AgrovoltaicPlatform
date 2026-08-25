---
name: servidor-propio
description: La plataforma de datos se mudó del EC2 de VisioneFlow a uno propio (VisioneMetrics), con dominio, TLS y la consola desplegada
categoria: proyecto
actualizado: 2026-08-25
tags: [despliegue, infraestructura, visioneflow, seguridad, consola]
---

# Servidor propio: fuera del EC2 de VisioneFlow

**2026-08-25.** Hasta ayer los dos microservicios corrían **dentro** del EC2 de
VisioneFlow (`octopia-runtime`, `i-0c041d684f640f32d`, 52.1.28.77). Hoy viven en
`VisioneMetrics` (`i-0edbbaea4a310fd33`, 34.203.122.144), con dominio y certificado
propios. Motivo: dos proyectos que no tienen nada que ver compartían máquina, repo y
destino de fallo.

## Qué se movió, y cómo se verificó

| Pieza | Verificación |
|---|---|
| Réplica AgroDash (6 GB) | movida por la **red privada** de la VPC, sin salir a internet. Conteo exacto en las dos puntas: **21.314.662 = 21.314.662**, misma marca de tiempo máxima |
| Agente Predictivo `:8000` | healthy; `/serie` devuelve 31.946 filas reales |
| Agente Histórico `:8010` | healthy, **11 tools** (primera vez que las tres del ex-Comparador se despliegan) |
| Timers systemd | renombrados a `predictivo-etl` / `predictivo-refresh`; primera corrida `status=0/SUCCESS` |
| Consola | pm2 en `:3001`, `pm2 save` hecho; login end-to-end verificado |
| TLS | Let's Encrypt para `agro.visione-edge.com`, vence 2026-11-23 |

Octopia quedó limpio: se borraron contenedores, imágenes, el volumen de 6 GB, los
directorios de código y los `.env` con secretos. Bajó de 16 a 10 GB usados.

## Lo que se corrigió de paso

- **Los servicios NO estaban en loopback.** El README y el RUNBOOK decían que sí; `ss`
  mostraba `0.0.0.0:8000` y `0.0.0.0:8010`. Lo único que los tapaba era el security
  group, o sea que cualquier máquina de la VPC los alcanzaba. Ahora sí escuchan en
  `127.0.0.1` y quien publica es nginx.
- **`agente-predictivo/Dockerfile` apuntaba a `pronostico.api:app`**, módulo que dejó de
  existir con el refactor. Cualquier despliegue que no sobreescribiera el `command`
  reventaba.
- **El despliegue del Predictivo vivía en el repo de VisioneFlow.** Ahora está en
  `agente-predictivo/deploy/docker-compose.predictivo.yml`.
- **Certbot mintió**: dijo dejar la renovación automática configurada y el
  `certbot-renew.timer` estaba **deshabilitado**, sin cron de respaldo. El certificado
  habría vencido en silencio. Activado y probado con `--dry-run` real.
- **Freno de fuerza bruta** en nginx sobre `/api/login` (6/min), porque el limitador de
  la consola es en memoria y cada intento cuesta ~400 ms de CPU. Verificado: diez golpes
  seguidos dan seis 401 y cuatro 429.

## Lo que hay que saber para operar

**El servidor se apaga solo.** Un EventBridge Scheduler (`stop-ec2-night` /
`start-ec2-morning`) lo apaga a las 19:00 y lo enciende a las 07:00, de lunes a viernes;
el fin de semana está apagado completo. Es decisión de costo, tomada a conciencia
(t3.large 24/7 serían ~$61/mes contra ~$22 con el horario). Consecuencia: **todo
consumidor externo tiene que disparar dentro de esa ventana**. La ingesta no pierde nada
(`Persistent=true` + `OnBootSec`).

**Rutas públicas**, todas por nginx con TLS:

```
/                 → consola (contraseña + cookie firmada)
/predictivo/...   → Agente Predictivo (x-api-key, sin gate: un flujo no tiene sesión)
/historico/...    → Agente Histórico  (idem)
```

Los nombres viejos `/forecast/` y `/analizador/` siguen como alias, para no obligar a
reconfigurar rutas en el canvas.

## Puente temporal en VisioneFlow

El nginx de VisioneFlow quedó reenviando `/forecast/` y `/analizador/` al host nuevo,
para que el agente del canvas no se cayera mientras se le cambian las URLs. **Es
temporal**: se quita cuando los nodos apunten directo. Respaldo de la config en
`nginx.prod.conf.bak-agrovoltaic-20260825-015059`.

Quedan dos archivos de AgroVoltaic **versionados** en el repo de VisioneFlow
(`docker-compose.forecast.yml`, `forecast.env.example`): sacarlos requiere un commit en
ese repo, no basta con borrarlos.

Relacionado: [[capa-agentes]], [[agrodash-local]], [[superficie-expuesta]], [[abiertos]].
