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

Atajo sin entrar al server: `GET /forecast/salud/ingesta` devuelve **503** si la
ingesta está `stale` o `sin_datos`, con el último error del ETL en el cuerpo.

> Regresión conocida (2026-08-14): con Cartago apagado, el ETL falló cada 15 min
> durante 9 días sin registrar nada, porque la conexión a la fuente quedaba fuera del
> `try/except`. Corregido en `etl.py` y cubierto por `tests/test_etl.py`.

## Fuente de datos

El ETL lee la fuente de `DATABASE_URL` (en `forecast.env`, **no versionado**). Desde el
2026-08-14 apunta a la réplica local del dump (`127.0.0.1:5433`, contenedor
`agrodash-pg`) porque el server de Cartago está caído; la URL original quedó comentada
en ese mismo archivo. Ver `docs/memoria/proyecto/agrodash-local.md`.
