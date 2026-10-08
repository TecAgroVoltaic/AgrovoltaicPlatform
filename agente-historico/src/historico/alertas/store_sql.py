"""Constantes SQL compartidas por el store de alertas (columnas, evento, candado)."""
from __future__ import annotations

AUTOR_GENERADOR = "generador"
# Cualquier entero fijo: identifica "la evaluacion de alertas" entre los candados
# consultivos de la base. Solo tiene que no chocar con otro uso, y no hay otro.
_CANDADO_EVALUACION = 4_004_001

COLUMNAS = ("id, clave, tipo, severidad, estado, titulo, descripcion, fuente, variable, "
            "fecha_inicio, fecha_fin, ocurrencias, evidencia, proxima_revision, "
            "creada_en, actualizada_en, ultima_ocurrencia_en")
_COLUMNAS_EVENTO = "id, tipo, nota, autor, datos, creado_en"
_INSERTAR_EVENTO = ("INSERT INTO alertas_eventos (alerta_id, tipo, nota, autor, datos) "
                    "VALUES (%s, %s, %s, %s, %s::jsonb)")
