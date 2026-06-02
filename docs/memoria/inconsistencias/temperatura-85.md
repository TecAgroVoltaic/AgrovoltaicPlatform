---
name: temperatura-85
description: Sensores de temperatura saturados en 85.0, el valor de error por defecto del DS18B20 desconectado
categoria: inconsistencia
---

# Temperaturas saturadas en 85.0

Múltiples períodos reportan **85.0** constante en temperatura. Es el **valor de error por
defecto del DS18B20** (sensor desconectado, dañado o sin comunicación), no una temperatura real.

**Evidencia en NEW (2026-06-01):** presente en **137 archivos**. Los 8 archivos nuevos
(may-jun 2026) sí salen limpios de 85.0.

Decisión: `85.0 → NULL` (no interpolar, marcar como error de sensor). Respaldado indirectamente
por AgroDash, cuyo endpoint de temperatura solo acepta −10…60 °C (ver [[agrodash]]).

Relacionado: [[decisiones]], [[agrodash]], [[fuentes-fisicas]].
