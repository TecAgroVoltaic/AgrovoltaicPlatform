"""Capa de calidad del historico PV: determinista, sin LLM.

  sol.py      ventana solar por dia (pvlib). Contra ESO se mide "el dia esta
              completo", porque el logger solo graba de dia.
  barrido.py  el barrido por lotes: completitud, validez, duplicados.
  cielo.py    kt, indice de variabilidad y clasificacion del dia.
  reporte.py  el informe legible del periodo.

Quien ESCRIBE es el barrido, por cron. Las herramientas del agente solo LEEN lo
ya detectado: recorrer los 274 dias es caro y el resultado no depende de quien
pregunte ni cuando.
"""
