"""AgroVoltaic ETL — estandarizacion de datos de monitoreo hacia Supabase.

Pipeline idempotente y escalable (modelo validado con Leo Cardinale, 2026-08-10):
  extract (normaliza 13 schemas via alias)
  -> transform (split electrico 5min / radiacion 15s, SIN limpiar: se guarda el crudo)
  -> load (upsert por timestamp en 2 tablas).
La correccion (temp 85, offset, limites, calibracion) vive en vistas SQL
`v_*_corregido`. Idempotencia a nivel archivo (md5) y fila (PK).
"""

__version__ = "0.2.0"
