"""AgroVoltaic ETL — estandarizacion de datos de monitoreo hacia Supabase.

Pipeline idempotente y escalable:
  extract (normaliza 13 schemas via alias) -> transform (limpia + resamplea 5min)
  -> load (upsert por timestamp). Idempotencia a nivel archivo (md5) y fila (PK).
"""

__version__ = "0.1.0"
