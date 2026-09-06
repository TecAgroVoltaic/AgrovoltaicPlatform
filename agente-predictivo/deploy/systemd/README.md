# Units systemd del agente de pronóstico (EC2)

Automatización de la ingesta y del refresco del sidecar. **Hasta el 2026-08-14 estos
archivos existían SOLO en `/etc/systemd/system/` de la EC2**, sin versionar: nadie podía
saber desde el repo cada cuánto corría el ETL, ni reconstruir el server si se perdía.

| Unit | Qué hace | Cadencia |
|---|---|---|
| `predictivo-etl.timer` → `.service` | corre `python -m predictivo.etl` dentro del sidecar | cada 15 min |
| `predictivo-refresh.timer` → `.service` | recrea el contenedor → re-lee la serie del store | cada 6 h |

## Instalar / actualizar en la EC2

```bash
scp -i ~/.ssh/VisioneMetrics.pem deploy/systemd/predictivo-*.{service,timer} ec2-user@34.203.122.144:/tmp/
ssh -i ~/.ssh/VisioneMetrics.pem ec2-user@34.203.122.144 '
  sudo cp /tmp/predictivo-*.{service,timer} /etc/systemd/system/ &&
  sudo systemctl daemon-reload &&
  sudo systemctl enable --now predictivo-etl.timer predictivo-refresh.timer'
```

## Verificar

```bash
systemctl list-timers 'predictivo-*' --no-pager     # próxima y última corrida
systemctl status predictivo-etl.service --no-pager  # resultado del último ciclo
journalctl -t predictivo-etl -n 50                  # log de la ingesta
```

## Diagnóstico: el ETL falla

El `.service` es `Type=oneshot`; si el ETL sale con código ≠ 0, la unidad queda
`failed` **y** el ETL deja una fila en `agente_log` (`componente='etl'`,
`nivel='error'`). Las dos señales tienen que coincidir — si systemd dice `failed`
pero no hay fila, el fallo ocurrió antes de poder conectarse al store (Supabase caído).

Atajo sin entrar al server: `GET /predictivo/salud/ingesta` (alias viejo:
`/forecast/salud/ingesta`) devuelve **503** si la ingesta está `stale` o `sin_datos`,
con el último error del ETL en el cuerpo.

> Regresión conocida (2026-08-14): con Cartago apagado, el ETL falló cada 15 min
> durante 9 días sin registrar nada, porque la conexión a la fuente quedaba fuera del
> `try/except`. Corregido en `etl.py` y cubierto por `tests/test_etl.py`.

## Fuente de datos

El ETL lee la fuente de `DATABASE_URL` (en `predictivo.env`, **no versionado**). El
**esquema de la URL** elige el camino, sin tocar código (ver `src/predictivo/ingesta/`):

| Esquema | Camino | Estado |
|---|---|---|
| `https://` | API pública de AgroDash | **la de hoy** desde 2026-08-26. Base viva, ~30 s de rezago |
| `postgresql://` | DB directa o réplica del dump | vuelta atrás; las URLs quedaron comentadas en el `.env` |

Entre el 2026-08-14 y el 2026-08-26 la fuente fue la réplica del dump, congelada el
2026-06-30. El ETL corrió **verde** todo ese tiempo trayendo **cero filas**: el timer
en `SUCCESS` no prueba que entren datos. Lo que sí lo prueba es
`/predictivo/salud/ingesta`, que mira la **edad del último dato**.

Ver `docs/memoria/proyecto/agrodash-api.md`.
